path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# 1. Add surgeCirclesRef after existing refs
old_refs = "  const lastPositionRef      = useRef(null);\n  const targetPositionRef    = useRef(null);"
new_refs = "  const lastPositionRef      = useRef(null);\n  const targetPositionRef    = useRef(null);\n  const surgeCirclesRef      = useRef([]);\n  const surgeIntervalRef     = useRef(null);"

if old_refs in c:
    c = c.replace(old_refs, new_refs)
    print("OK: surgeCirclesRef added")
else:
    print("MISS: refs")

# 2. Add surge zone fetch + draw function after map init useEffect
old_after_init = "  // Driver position update"
new_after_init = '''  // Surge zones - fetch and draw colored circles every 30s
  useEffect(() => {
    const drawZones = async () => {
      if (!mapInstanceRef.current || !window.google) return;
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/surge/zones`);
        const data = await res.json();
        // Clear old circles
        surgeCirclesRef.current.forEach(c => c.setMap(null));
        surgeCirclesRef.current = [];
        (data.zones || []).forEach(zone => {
          const circle = new window.google.maps.Circle({
            map: mapInstanceRef.current,
            center: { lat: zone.lat, lng: zone.lng },
            radius: zone.radius,
            fillColor: zone.color,
            fillOpacity: 0.18,
            strokeColor: zone.color,
            strokeOpacity: 0.5,
            strokeWeight: 2,
            zIndex: 10,
          });
          // Label in center
          const marker = new window.google.maps.Marker({
            position: { lat: zone.lat, lng: zone.lng },
            map: mapInstanceRef.current,
            icon: {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="24"><rect width="60" height="24" rx="12" fill="${zone.color}" opacity="0.85"/><text x="30" y="16" text-anchor="middle" font-size="11" font-weight="bold" font-family="sans-serif" fill="#000">${zone.multiplier}x surge</text></svg>`)}`,
              scaledSize: new window.google.maps.Size(60, 24),
              anchor: new window.google.maps.Point(30, 12),
            },
            zIndex: 11,
          });
          surgeCirclesRef.current.push(circle, marker);
        });
      } catch (e) { /* silent fail */ }
    };
    drawZones();
    surgeIntervalRef.current = setInterval(drawZones, 30000);
    return () => {
      clearInterval(surgeIntervalRef.current);
      surgeCirclesRef.current.forEach(c => c.setMap(null));
    };
  }, []);

  // Driver position update'''

if old_after_init in c:
    c = c.replace(old_after_init, new_after_init)
    print("OK: surge zones draw effect added")
else:
    print("MISS: effect insert")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
