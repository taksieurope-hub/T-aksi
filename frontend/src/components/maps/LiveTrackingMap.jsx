const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const stopMarkersRef = useRef([]); // 📍 Dedicated tracker for stop pins
  const routeDrawnForStatus = useRef(null);
  const etaIntervalRef = useRef(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [etaSeconds, setEtaSeconds] = useState(null);

  const getSafeCoord = (val) => { const n = parseFloat(val); return !isNaN(n) && n !== 0 ? n : null; };

  // --- SVG ICONS ---
  const makePickupIcon = () => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#00ff88"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>`)}`,
    scaledSize: new window.google.maps.Size(28, 37), anchor: new window.google.maps.Point(14, 37),
  });

  const makeDestIcon = () => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#ff4444"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>`)}`,
    scaledSize: new window.google.maps.Size(28, 37), anchor: new window.google.maps.Point(14, 37),
  });

  // NEW: Bulletproof Yellow Stop Pin with Number
  const makeStopIcon = (num) => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#facc15"/><text x="16" y="21" font-family="sans-serif" font-size="14" font-weight="bold" fill="#000" text-anchor="middle">${num}</text></svg>`)}`,
    scaledSize: new window.google.maps.Size(28, 37), anchor: new window.google.maps.Point(14, 37),
  });

  const fmtEta = (secs) => {
    if (secs == null || secs <= 0) return null;
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // 1. INIT MAP
  useEffect(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 }, zoom: 15,
      disableDefaultUI: true, gestureHandling: "greedy", backgroundColor: "#0d0d1a",
      styles: [{ elementType: "geometry", stylers: [{ color: "#0d0d1a" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] }],
    });
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map, suppressMarkers: true, polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5, strokeOpacity: 0.9 },
    });
    map.addListener("dragstart", () => setIsFollowing(false));
    mapInstanceRef.current = map;
  }, []);

  // 🛠️ 2. FORCE STOP PINS TO DRAW (Isolated from routing)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    
    // Clear old pins
    stopMarkersRef.current.forEach(m => m.setMap(null));
    stopMarkersRef.current = [];

    // Force draw new pins instantly
    (stops || []).forEach((stop, index) => {
      if (stop && stop.lat && stop.lng) {
        const marker = new window.google.maps.Marker({
          position: { lat: parseFloat(stop.lat), lng: parseFloat(stop.lng) },
          map: mapInstanceRef.current,
          icon: makeStopIcon(index + 1), // Drops a yellow pin with 1, 2, 3
          zIndex: 950
        });
        stopMarkersRef.current.push(marker);
      }
    });
  }, [JSON.stringify(stops)]);

  // 3. DRAW THE ROUTE LINE
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    const pLat = getSafeCoord(pickup?.lat), pLng = getSafeCoord(pickup?.lng);
    const dLat = getSafeCoord(destination?.lat), dLng = getSafeCoord(destination?.lng);
    const drLat = getSafeCoord(driverLocation?.lat), drLng = getSafeCoord(driverLocation?.lng);

    const waypoints = (stops || [])
      .filter(s => s && s.lat && s.lng)
      .map(s => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));

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
      routeDrawnForStatus.current = sig;
    } else if (status === "in_progress" && dLat) {
      drawRoute(origin, { lat: dLat, lng: dLng }, waypoints, true);
      updateStaticPin(destMarkerRef, { lat: dLat, lng: dLng }, makeDestIcon());
      removePin(pickupMarkerRef);
      routeDrawnForStatus.current = sig;
    }
  }, [pickup?.lat, destination?.lat, JSON.stringify(stops), status, driverLocation?.lat]);

  const drawRoute = (origin, dest, waypoints = [], withEta = false) => {
    new window.google.maps.DirectionsService().route(
      { origin, destination: dest, waypoints, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, st) => {
        if (st === "OK" && directionsRendererRef.current) {
          directionsRendererRef.current.setDirections(result);
          if (withEta) {
            const totalSecs = result.routes[0].legs.reduce((acc, leg) => acc + leg.duration.value, 0);
            startEtaCountdown(totalSecs);
          }
          if (status === "preview") {
            const bounds = new window.google.maps.LatLng