path = "frontend/src/components/maps/LiveTrackingMap.jsx"
c = open(path, encoding="utf-8").read()

old = 'styles: [{ elementType: "geometry", stylers: [{ color: "#0d0d1a" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] }]'

new = 'styles: [{ elementType: "geometry", stylers: [{ color: "#1a1a2e" }] }, { elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] }, { elementType: "labels.text.stroke", stylers: [{ color: "#000000" }] }, { featureType: "road", elementType: "geometry", stylers: [{ color: "#4a5568" }] }, { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#00d4ff" }] }, { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#3a4a5c" }] }, { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] }, { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1a2035" }] }, { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2d3748" }] }]'

if old in c:
    open(path, "w", encoding="utf-8").write(c.replace(old, new))
    print("Done. Map style updated - roads now visible.")
else:
    print("MATCH FAILED")
