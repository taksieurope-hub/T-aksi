const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const stopMarkersRef = useRef([]); // 📍 TRACKS THE STOP DOTS
  const routeDrawnForStatus = useRef(null);
  const prevRideIdRef = useRef(null);
  const etaIntervalRef = useRef(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [etaSeconds, setEtaSeconds] = useState(null);

  const getSafeCoord = (val) => { const n = parseFloat(val); return !isNaN(n) && n !== 0 ? n : null; };

  // SVG Icons
  const makePickupIcon = () => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#00ff88"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>`)}`,
    scaledSize: new window.google.maps.Size(28, 37), anchor: new window.google.maps.Point(14, 37),
  });

  const makeDestIcon = () => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#ff4444"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>`)}`,
    scaledSize: new window.google.maps.Size(28, 37), anchor: new window.google.maps.Point(14, 37),
  });

  const fmtEta = (secs) => {
    if (secs == null || secs <= 0) return null;
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Init Map
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

  // 🛠️ THE FIX: DRAW ROUTE + STOP DOTS
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    const pLat = getSafeCoord(pickup?.lat), pLng = getSafeCoord(pickup?.lng);
    const dLat = getSafeCoord(destination?.lat), dLng = getSafeCoord(destination?.lng);
    const drLat = getSafeCoord(driverLocation?.lat), drLng = getSafeCoord(driverLocation?.lng);

    // 1. Format waypoints correctly
    const waypoints = (stops || [])
      .filter(s => s && s.lat && s.lng)
      .map(s => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));

    const sig = `${drLat},${drLng}|${pLat},${pLng}|${dLat},${dLng}|${status}|${waypoints.length}`;
    if (routeDrawnForStatus.current === sig) return;

    // 2. Clear old stop dots
    stopMarkersRef.current.forEach(m => m.setMap(null));
    stopMarkersRef.current = [];

    // 3. Draw Preview Route
    if (status === "preview" && pLat && dLat) {
      drawRoute({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng }, waypoints, false);
      updateStaticPin(pickupMarkerRef, { lat: pLat, lng: pLng }, makePickupIcon());
      updateStaticPin(destMarkerRef, { lat: dLat, lng: dLng }, makeDestIcon());
      
      // Draw Yellow Stop Dots
      waypoints.forEach(wp => {
        const m = new window.google.maps.Marker({
          position: wp.location, map: mapInstanceRef.current,
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#facc15", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
          zIndex: 950
        });
        stopMarkersRef.current.push(m);
      });
      routeDrawnForStatus.current = sig;
      return;
    }

    // 4. Live Trip Routing
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
      
      // Keep stops visible during trip
      waypoints.forEach(wp => {
        const m = new window.google.maps.Marker({
          position: wp.location, map: mapInstanceRef.current,
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#facc15", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 }
        });
        stopMarkersRef.current.push(m);
      });
    }
    routeDrawnForStatus.current = sig;
  }, [pickup?.lat, destination?.lat, JSON.stringify(stops), status, driverLocation?.lat]);

  const drawRoute = (origin, dest, waypoints = [], withEta = false) => {
    new window.google.maps.DirectionsService().route(
      { origin, destination: dest, waypoints, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, st) => {
        if (st === "OK" && directionsRendererRef.current) {
          directionsRendererRef.current.setDirections(result);
          // Sum up duration of ALL legs for correct ETA
          if (withEta) {
            const totalSecs = result.routes[0].legs.reduce((acc, leg) => acc + leg.duration.value, 0);
            startEtaCountdown(totalSecs);
          }
          if (status === "preview") {
            const bounds = new window.google.maps.LatLngBounds();
            bounds.extend(origin); bounds.extend(dest);
            waypoints.forEach(wp => bounds.extend(wp.location));
            mapInstanceRef.current.fitBounds(bounds, { top: 80, bottom: 80, left: 40, right: 40 });
          }
        }
      }
    );
  };

  const startEtaCountdown = (durationSeconds) => {
    if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
    let remaining = durationSeconds;
    setEtaSeconds(remaining);
    etaIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setEtaSeconds(remaining <= 0 ? 0 : remaining);
    }, 1000);
  };

  const updateStaticPin = (ref, position, icon) => {
    if (!mapInstanceRef.current) return;
    if (!ref.current) ref.current = new window.google.maps.Marker({ position, map: mapInstanceRef.current, icon, zIndex: 900 });
    else { ref.current.setPosition(position); ref.current.setIcon(icon); }
  };

  const removePin = (ref) => { if (ref.current) { ref.current.setMap(null); ref.current = null; } };

  // Driver marker logic (unchanged but protected)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation?.lat) return;
    const pos = { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) };
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: pos, map: mapInstanceRef.current, zIndex: 1000,
        icon: { path: "M 0,-18 L 12,14 L 0,8 L -12,14 Z", scale: 1.4, fillColor: "#00d4ff", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, rotation: parseFloat(driverLocation.heading) || 0 }
      });
    } else {
      driverMarkerRef.current.setPosition(pos);
    }
    if (isFollowing) mapInstanceRef.current.panTo(pos);
  }, [driverLocation, isFollowing]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-[#0d0d1a]">
      <div ref={mapRef} style={{ height: "46vh", minHeight: "300px", width: "100%" }} />
      {etaSeconds != null && etaSeconds > 0 && status !== "preview" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-[#07070f]/90 px-4 py-2 rounded-full border border-[#00d4ff]/30 flex items-center gap-2 shadow-xl">
            <Timer className="w-3.5 h-3.5 text-[#00d4ff]" />
            <span className="text-[#00d4ff] font-bold text-sm font-mono">{fmtEta(etaSeconds)}</span>
          </div>
        </div>
      )}
    </div>
  );
};