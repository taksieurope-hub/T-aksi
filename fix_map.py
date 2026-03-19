path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
fixes = 0

# Fix 1: Brighter map styles - roads clearly visible against background
old1 = '''const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1a1f2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1f2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c9a96e" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2d3748" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a202c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a5568" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#2d3748" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f5c842" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a5568" }] },
];'''

new1 = '''const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1a1f2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1f2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#e2c97e" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#4a5f7a" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#2d3f55" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#c8d6e5" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#3d5068" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#4f6b87" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#6b8fa8" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#4a6880" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f5c842" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a6880" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#141c2b" }] },
];'''

if old1 in c:
    c = c.replace(old1, new1)
    fixes += 1
    print("Fix 1 applied: brighter road styles")
else:
    print("Fix 1 FAILED: MAP_STYLES not matched")

# Fix 2: Remove preserveViewport so the map can rotate freely with heading
old2 = '''      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: {'''
new2 = '''      suppressMarkers: true,
      preserveViewport: false,
      polylineOptions: {'''
if old2 in c:
    c = c.replace(old2, new2)
    fixes += 1
    print("Fix 2 applied: preserveViewport disabled so map can rotate")
else:
    print("Fix 2 FAILED")

# Fix 3: Tilt was 55 which is too steep and fights rotation - reduce to 45
old3 = '      tilt: 55, // More immersive tilt'
new3 = '      tilt: 45,'
if old3 in c:
    c = c.replace(old3, new3)
    fixes += 1
    print("Fix 3 applied: tilt reduced to 45")
else:
    print("Fix 3 FAILED - trying without comment...")
    old3b = '      tilt: 55,'
    new3b = '      tilt: 45,'
    if old3b in c:
        c = c.replace(old3b, new3b)
        fixes += 1
        print("Fix 3 fallback applied")
    else:
        print("Fix 3 fallback also FAILED")

open(path, "w", encoding="utf-8").write(c)
print(f"\nDone. {fixes}/3 fixes applied.")
