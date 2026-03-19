path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
fixes = 0

old1 = '        setRideStartTime(Date.now());\n        setDistanceTraveled(0);\n        \n        setArrivedTime(null);\n        lastPositionRef.current = driverLocation;'
new1 = '        setRideStartTime(Date.now());\n        setDistanceTraveled(0);\n        \n        setArrivedTime(null);\n        lastPositionRef.current = driverLocation;\n        window.__distanceTraveled = 0;\n        window.__lastGpsPoint = null;\n        window.__activeRideStatus = "in_progress";'

if old1 in c:
    c = c.replace(old1, new1)
    fixes += 1
    print("Fix 1 applied: window refs reset on ride start")
else:
    print("Fix 1 FAILED")

# Fix 2: Wire setDistanceTraveled and activeRide.status to window via useEffect
# Add after the distanceTraveledRef declaration
old2 = "  const distanceTraveledRef = useRef(0);"
new2 = """  const distanceTraveledRef = useRef(0);

  // Wire GPS distance accumulator to window so the geolocation watcher can update it
  useEffect(() => {
    window.__setDistanceTraveled = setDistanceTraveled;
    return () => { window.__setDistanceTraveled = null; };
  }, []);

  useEffect(() => {
    window.__activeRideStatus = activeRide?.status || null;
  }, [activeRide?.status]);"""

if old2 in c:
    c = c.replace(old2, new2)
    fixes += 1
    print("Fix 2 applied: useEffects wiring window refs")
else:
    print("Fix 2 FAILED")

# Fix 3: Reset window refs on ride complete and cancel
old3 = '        setDistanceTraveled(0); setWaitTimer(0); setArrivedTime(null); setRideStartTime(null);\n        setIsWaitingAtStop(false); setMidTripWaiting(false); setMidTripWaitStart(null);\n        setMidTripWaitSecs(0); setMidTripWaitBanked(0); setLiveFare(null);\n\n        fetchRideHistory(); await refreshUser();'
new3 = '        setDistanceTraveled(0); setWaitTimer(0); setArrivedTime(null); setRideStartTime(null);\n        setIsWaitingAtStop(false); setMidTripWaiting(false); setMidTripWaitStart(null);\n        setMidTripWaitSecs(0); setMidTripWaitBanked(0); setLiveFare(null);\n        window.__distanceTraveled = 0; window.__lastGpsPoint = null; window.__activeRideStatus = null;\n\n        fetchRideHistory(); await refreshUser();'

if old3 in c:
    c = c.replace(old3, new3)
    fixes += 1
    print("Fix 3 applied: window refs cleaned up on complete")
else:
    print("Fix 3 FAILED - checking exact text...")
    for i, line in enumerate(c.splitlines()):
        if "fetchRideHistory(); await refreshUser();" in line:
            print(f"  line {i+1}: {repr(line)}")

open(path, "w", encoding="utf-8").write(c)
print(f"\nDone. {fixes}/3 fixes applied.")
