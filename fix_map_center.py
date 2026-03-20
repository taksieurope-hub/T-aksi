path = "frontend/src/components/RiderPortal.jsx"
c = open(path, encoding="utf-8").read()

# Fix 1: Start destination picker at user location
old1 = '  const [center, setCenter]         = useState({ lat: 41.7151, lng: 44.8271 });\n\n  useEffect(() => {\n    if (initialLocation?.lat) setCenter({ lat: parseFloat(initialLocation.lat), lng: parseFloat(initialLocation.lng) });\n  }, [initialLocation?.lat, initialLocation?.lng]);'

new1 = '  const [center, setCenter]         = useState({ lat: 41.7151, lng: 44.8271 });\n\n  useEffect(() => {\n    if (initialLocation?.lat) {\n      setCenter({ lat: parseFloat(initialLocation.lat), lng: parseFloat(initialLocation.lng) });\n    } else if (navigator.geolocation) {\n      navigator.geolocation.getCurrentPosition(\n        (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),\n        () => {}, { enableHighAccuracy: true, timeout: 5000 }\n      );\n    }\n  }, [initialLocation?.lat, initialLocation?.lng]);'

# Fix 2: Brighter road styles in destination picker
old2 = '''        { elementType: "geometry", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#111827" }] },'''

new2 = '''        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#4a5568" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#00d4ff" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },'''

if old1 in c:
    c = c.replace(old1, new1)
    print("Fix 1 applied: destination picker starts at user location")
else:
    print("Fix 1 FAILED")

if old2 in c:
    c = c.replace(old2, new2)
    print("Fix 2 applied: brighter road styles in picker")
else:
    print("Fix 2 FAILED")

open(path, "w", encoding="utf-8").write(c)
