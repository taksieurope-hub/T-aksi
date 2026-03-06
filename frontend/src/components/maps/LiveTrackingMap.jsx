const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const stopMarkersRef = useRef([]); // 📍 Holds the middle stops
  
  const routeDrawnForStatus = useRef(null);
  const etaIntervalRef = useRef(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [etaSeconds, setEtaSeconds] = useState(null);

  const getSafeCoord = (val) => { const n = parseFloat(val); return !isNaN(n) && n !== 0 ? n : null; };

  const makePickupIcon = () => ({ url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#00ff88"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>`)}`, scaledSize: new window.google.maps.Size(28, 37), anchor: new window.google.maps.Point(14, 37) });
  const makeDestIcon = () => ({ url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#ff4444"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>`)}`, scaledSize: new window.google.maps.Size(28, 37), anchor: new window.google.maps.Point(14, 37) });

  // 1. INIT MAP
  useEffect(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 }, zoom: 15,
      disableDefaultUI: true, gestureHandling: "greedy", backgroundColor: "#0d0d1a",
      styles: [{ elementType: "geometry", stylers: [{ color: "#0d0d1a" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] }],
    });
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map, suppressMarkers: true,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5, strokeOpacity: 0.9 },
    });
    map.addListener("dragstart", () => setIsFollowing(false));
    mapInstanceRef.current = map;
  }, []);

  // 2. THE BULLETPROOF ROUTE & PIN LOGIC
  const drawRoute = (origin, dest, waypoints = [], withEta = false) => {
    new window.google.maps.DirectionsService().route(
      { origin, destination: dest, waypoints, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, st) => {
        if (st === "OK" && directionsRendererRef.current) {
          directionsRendererRef.current.setDirections(result);
          
          // 🛑 CLEAR OLD PINS
          stopMarkersRef.current.forEach(m => m.setMap(null));
          stopMarkersRef.current = [];

          // 📍 DRAW NEW PINS EXACTLY ON THE ROUTE'S WAYPOINTS
          // result.routes[0].legs contains the exact chunks of the trip
          const legs = result.routes[0].legs;
          for (let i = 0; i < legs.length - 1; i++) {
            const stopLocation = legs[i].end_location; // This is the exact snapped coordinate of Stop 1, Stop 2, etc.
            const marker = new window.google.maps.Marker({
              position: stopLocation,
              map: mapInstanceRef.current,
              label: { text: (i + 1).toString(), color: "#000", fontWeight: "bold" },
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#facc15", // Bright Yellow
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              },
              zIndex: 999
            });
            stopMarkersRef.current.push(marker);
          }

          if (withEta) {
            const totalSecs = legs.reduce((acc, leg) => acc + leg.duration.value, 0);
            if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
            let remaining = totalSecs;
            setEtaSeconds(remaining);
            etaIntervalRef.current = setInterval(() => { remaining -= 1; setEtaSeconds(remaining <= 0 ? 0 : remaining); }, 1000);
          }

          if (status === "preview") {
            const bounds = new window.google.maps.LatLngBounds();
            bounds.extend(origin); bounds.extend(dest);
            waypoints.forEach(wp => bounds.extend(wp.location));
            mapInstanceRef.current.fitBounds(bounds, { top: 60, bottom: 60, left: 30, right: 30 });
          }
        }
      }
    );
  };

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    const pLat = getSafeCoord(pickup?.lat), pLng = getSafeCoord(pickup?.lng);
    const dLat = getSafeCoord(destination?.lat), dLng = getSafeCoord(destination?.lng);
    const drLat = getSafeCoord(driverLocation?.lat), drLng = getSafeCoord(driverLocation?.lng);

    const waypoints = (stops || []).filter(s => s && s.lat && s.lng).map(s => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));

    const sig = `${drLat},${drLng}|${pLat},${pLng}|${dLat},${dLng}|${status}|${waypoints.length}`;
    if (routeDrawnForStatus.current === sig) return;

    if (status === "preview" && pLat && dLat) {
      drawRoute({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng }, waypoints, false);
      updateStaticPin(pickupMarkerRef, { lat: pLat, lng: pLng }, makePickupIcon());
      updateStaticPin(destMarkerRef, { lat: dLat, lng: dLng }, makeDestIcon());
      routeDrawnForStatus.current = sig;
      return;
    }

    if (!drLat || !drLng) return;
    const origin = { lat: drLat, lng: drLng };

    if (["accepted", "searching", "arrived"].includes(status) && pLat) {
      drawRoute(origin, { lat: pLat, lng: pLng }, [], true);
      updateStaticPin(pickupMarkerRef, { lat: pLat, lng: pLng }, makePickupIcon());
      removePin(destMarkerRef);
    } else if (status === "in_progress" && dLat) {
      drawRoute(origin, { lat: dLat, lng: dLng }, waypoints, true);
      updateStaticPin(destMarkerRef, { lat: dLat, lng: dLng }, makeDestIcon());
      removePin(pickupMarkerRef);
    }
    routeDrawnForStatus.current = sig;
  }, [pickup?.lat, destination?.lat, JSON.stringify(stops), status, driverLocation?.lat]);

  const updateStaticPin = (ref, position, icon) => {
    if (!mapInstanceRef.current) return;
    if (!ref.current) ref.current = new window.google.maps.Marker({ position, map: mapInstanceRef.current, icon, zIndex: 900 });
    else { ref.current.setPosition(position); ref.current.setIcon(icon); }
  };

  const removePin = (ref) => { if (ref.current) { ref.current.setMap(null); ref.current = null; } };

  useEffect(() => { return () => { if (etaIntervalRef.current) clearInterval(etaIntervalRef.current); }; }, []);
  const fmtEta = (secs) => { if (secs == null || secs <= 0) return null; const m = Math.floor(secs / 60), s = secs % 60; return m > 0 ? `${m}m ${s}s` : `${s}s`; };

  // DRIVER CAR MARKER
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation?.lat) return;
    const pos = { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) };
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: pos, map: mapInstanceRef.current, zIndex: 1000,
        icon: { path: "M 0,-18 L 12,14 L 0,8 L -12,14 Z", scale: 1.4, fillColor: "#00d4ff", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, rotation: parseFloat(driverLocation.heading) || 0 }
      });
    } else { driverMarkerRef.current.setPosition(pos); }
    if (isFollowing) mapInstanceRef.current.panTo(pos);
  }, [driverLocation, isFollowing]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ background: "#0d0d1a" }}>
      <div ref={mapRef} style={{ height: "46vh", minHeight: "300px", width: "100%" }} />
      {etaSeconds != null && etaSeconds > 0 && status !== "preview" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-[#07070f]/90 backdrop-blur-sm px-4 py-2 rounded-full border border-[#00d4ff]/30 flex items-center gap-2 shadow-xl">
            <span className="text-[#00d4ff] font-bold text-sm font-mono">{fmtEta(etaSeconds)}</span>
          </div>
        </div>
      )}
    </div>
  );
};