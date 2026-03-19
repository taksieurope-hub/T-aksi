path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
fixes = 0

# Fix 1: Accumulate distance when ride is in_progress and driver location updates
# Insert after lastPositionRef.current = driverLocation on ride start
old1 = '''        setRideStartTime(Date.now());
        setDistanceTraveled(0);

        setArrivedTime(null);
        lastPositionRef.current = driverLocation;'''

new1 = '''        setRideStartTime(Date.now());
        setDistanceTraveled(0);

        setArrivedTime(null);
        lastPositionRef.current = driverLocation;
        distanceTraveledRef.current = 0;'''

if old1 in c:
    c = c.replace(old1, new1)
    fixes += 1
    print("Fix 1 applied: reset distanceTraveledRef on start")
else:
    print("Fix 1 FAILED")

# Fix 2: Add distanceTraveledRef declaration near distanceTraveled state
old2 = "  const [distanceTraveled, setDistanceTraveled] = useState(0);"
new2 = "  const [distanceTraveled, setDistanceTraveled] = useState(0);\n  const distanceTraveledRef = useRef(0);"
if old2 in c:
    c = c.replace(old2, new2)
    fixes += 1
    print("Fix 2 applied: distanceTraveledRef added")
else:
    print("Fix 2 FAILED")

# Fix 3: Accumulate GPS distance in the driverLocation useEffect
# Find where driverLocation is updated and add accumulation for in_progress rides
old3 = "        lastLocationRef.current = { lat: newLat, lng: newLng, heading: heading || 0, speed: pos.coords.speed };"
new3 = '''        lastLocationRef.current = { lat: newLat, lng: newLng, heading: heading || 0, speed: pos.coords.speed };

        // Accumulate distance while ride is in_progress
        if (window.__activeRideStatus === "in_progress" && window.__lastGpsPoint) {
          const R = 6371;
          const dLat = (newLat - window.__lastGpsPoint.lat) * Math.PI / 180;
          const dLng = (newLng - window.__lastGpsPoint.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(window.__lastGpsPoint.lat * Math.PI/180) * Math.cos(newLat * Math.PI/180) * Math.sin(dLng/2)**2;
          const segKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          if (segKm < 0.5) { // ignore GPS jumps > 500m
            window.__distanceTraveled = (window.__distanceTraveled || 0) + segKm;
            window.__setDistanceTraveled && window.__setDistanceTraveled(Math.round(window.__distanceTraveled * 100) / 100);
          }
        }
        window.__lastGpsPoint = { lat: newLat, lng: newLng };'''

if old3 in c:
    c = c.replace(old3, new3)
    fixes += 1
    print("Fix 3 applied: GPS distance accumulation added")
else:
    print("Fix 3 FAILED")

# Fix 4: Expose setDistanceTraveled and activeRide.status to window so GPS watcher can use them
old4 = "        lastPositionRef.current = driverLocation;\n        distanceTraveledRef.current = 0;"
new4 = '''        lastPositionRef.current = driverLocation;
        distanceTraveledRef.current = 0;
        window.__distanceTraveled = 0;
        window.__lastGpsPoint = null;'''

if old4 in c:
    c = c.replace(old4, new4)
    fixes += 1
    print("Fix 4 applied: window refs reset on ride start")
else:
    print("Fix 4 FAILED")

open(path, "w", encoding="utf-8").write(c)
print(f"\nDone. {fixes}/4 fixes applied.")
