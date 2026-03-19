path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '        setDistanceTraveled(0); setWaitTimer(0); setArrivedTime(null); setRideStartTime(null); \n        setIsWaitingAtStop(false); setMidTripWaiting(false); setMidTripWaitStart(null); \n        setMidTripWaitSecs(0); setMidTripWaitBanked(0); setLiveFare(null);\n        \n        fetchRideHistory(); await refreshUser();'

new = '        setDistanceTraveled(0); setWaitTimer(0); setArrivedTime(null); setRideStartTime(null); \n        setIsWaitingAtStop(false); setMidTripWaiting(false); setMidTripWaitStart(null); \n        setMidTripWaitSecs(0); setMidTripWaitBanked(0); setLiveFare(null);\n        window.__distanceTraveled = 0; window.__lastGpsPoint = null; window.__activeRideStatus = null;\n        \n        fetchRideHistory(); await refreshUser();'

if old in c:
    open(path, "w", encoding="utf-8").write(c.replace(old, new))
    print("Done. Fix 3 applied: window refs cleaned up on ride complete.")
else:
    print("MATCH FAILED")
