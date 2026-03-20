import re

# ================================================================
# 1. LIGHT MAP THEME FOR DRIVER PORTAL
# ================================================================
path_d = "frontend/src/components/DriverPortal.jsx"
c = open(path_d, "r", encoding="utf-8").read()

old_styles = """const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#8aa5c0" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#6a8aaa" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#7a9ab5" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#5a7a9a" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#00d4ff" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#1a2035" }] },
];"""

new_styles = """const MAP_STYLES = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", stylers: [{ visibility: "on" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#333333" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f5c518" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#e0a800" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#333333" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f9f9f9" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#f9f9f9" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f2f2f2" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#b3d4e8" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a90a4" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#333333" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#222222" }] },
];"""

if old_styles in c:
    c = c.replace(old_styles, new_styles)
    print("OK: map theme changed to light")
else:
    print("MISS: map styles")

# Also fix background color on map init
c = c.replace('backgroundColor: "#1a1a2e"', 'backgroundColor: "#f2f2f2"')
print("OK: map background set to light")

open(path_d, "w", encoding="utf-8", newline="\n").write(c)

# ================================================================
# 2. ENSURE corporate_account_id SENT WITH RIDE REQUEST
# ================================================================
path_r = "frontend/src/components/RiderPortal.jsx"
c = open(path_r, "r", encoding="utf-8").read()

# Find the ride request payload and add corporate_account_id if not there
if "corporate_account_id" not in c:
    old = "      payment_method: paymentMethod,"
    new = "      payment_method: paymentMethod,\n      ...(paymentMethod === \"corporate\" && user?.corporate_account_id ? { corporate_account_id: user.corporate_account_id } : {}),"
    if old in c:
        c = c.replace(old, new)
        print("OK: corporate_account_id added to ride request")
    else:
        print("MISS: ride request payload - searching...")
        # Try to find it another way
        for i, line in enumerate(c.splitlines()):
            if "payment_method" in line and "paymentMethod" in line:
                print("  Found at line " + str(i+1) + ": " + line.strip())
else:
    print("OK: corporate_account_id already in RiderPortal")

open(path_r, "w", encoding="utf-8", newline="\n").write(c)
