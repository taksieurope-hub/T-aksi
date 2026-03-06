const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [etaSeconds, setEtaSeconds] = useState(null);

  const getSafeCoord = (val) => { const n = parseFloat(val); return !isNaN(n) && n !== 0 ? n : null; };

  // Init map once
  useEffect(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 }, zoom: 15,
      disableDefaultUI: true, gestureHandling: "greedy", backgroundColor: "#0d0d1a",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#0d0d1a" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
      ],
    });
    
    // 🛠️ FIX: Remove suppressMarkers so Google draws the stops for us!
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map, 
      suppressMarkers: false, // Let Google draw the A, B, C pins
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5, strokeOpacity: 0.9 },
    });
    
    map.addListener("dragstart", () => setIsFollowing(false));
    mapInstanceRef.current = map;
  }, []);

  // Draw/update route based on status
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    const pLat = getSafeCoord(pickup?.lat), pLng = getSafeCoord(pickup?.lng);
    const dLat = getSafeCoord(destination?.lat), dLng = getSafeCoord(destination?.lng);

    const waypoints = (stops || [])
      .filter(s => s && s.lat && s.lng)
      .map(s => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));

    // Only draw the preview route
    if (status === "preview" && pLat && dLat) {
      new window.google.maps.DirectionsService().route(
        { 
          origin: { lat: pLat, lng: pLng }, 
          destination: { lat: dLat, lng: dLng }, 
          waypoints, 
          travelMode: window.google.maps.TravelMode.DRIVING 
        },
        (result, st) => {
          if (st === "OK" && directionsRendererRef.current) {
            directionsRendererRef.current.setDirections(result);
            
            // Calculate ETA
            const totalSecs = result.routes[0].legs.reduce((acc, leg) => acc + leg.duration.value, 0);
            setEtaSeconds(totalSecs);
          }
        }
      );
    }
  }, [pickup?.lat, destination?.lat, JSON.stringify(stops), status]);

  // Driver marker logic (unchanged)
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

  const fmtEta = (secs) => {
    if (secs == null || secs <= 0) return null;
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-[#0d0d1a]">
      <div ref={mapRef} style={{ height: "46vh", minHeight: "300px", width: "100%" }} />
      {etaSeconds != null && etaSeconds > 0 && status === "preview" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="bg-[#07070f]/90 px-4 py-2 rounded-full border border-[#00d4ff]/30 flex items-center gap-2 shadow-xl">
            <span className="text-[#00d4ff] font-bold text-sm font-mono">Trip Time: {fmtEta(etaSeconds)}</span>
          </div>
        </div>
      )}
    </div>
  );
};