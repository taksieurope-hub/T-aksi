path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old1 = 'center: { lat: 41.7151, lng: 44.8271 }, zoom: 15,\n      disableDefaultUI: true, zoomControl: false, gestureHandling: "cooperative", backgroundColor: "#0d0d1a",'
new1 = 'center: { lat: 41.7151, lng: 44.8271 }, zoom: 17,\n      tilt: 45,\n      disableDefaultUI: true, zoomControl: false, gestureHandling: "cooperative", backgroundColor: "#0d0d1a",'
if old1 in c: c = c.replace(old1, new1); print("OK tilt")
else: print("MISS tilt")

old2 = '  const [isFollowing, setIsFollowing] = useState(true);\n  const [etaSeconds, setEtaSeconds]   = useState(null);'
new2 = '  const [isFollowing, setIsFollowing] = useState(true);\n  const [etaSeconds, setEtaSeconds]   = useState(null);\n  const [navInfo, setNavInfo] = useState({ heading: 0, nextStreet: "", distanceToNext: "" });'
if old2 in c: c = c.replace(old2, new2); print("OK navInfo state")
else: print("MISS state")

old3 = '    if (isFollowing) {\n      mapInstanceRef.current.panTo(pos);\n      // ??? THIS SPINS THE ENTIRE MAP TO FACE FORWARD\n      mapInstanceRef.current.setHeading(heading);\n    }\n  }, [driverLocation, isFollowing]);'
new3 = '    if (isFollowing) {\n      mapInstanceRef.current.panTo(pos);\n      mapInstanceRef.current.setHeading(heading);\n      mapInstanceRef.current.setTilt(45);\n    }\n    setNavInfo(prev => ({ ...prev, heading }));\n  }, [driverLocation, isFollowing]);'
if old3 in c: c = c.replace(old3, new3); print("OK driver tilt")
else: print("MISS driver effect")

old4 = '          const leg = result.routes[0]?.legs[0];\n          if (withEta && leg?.duration?.value) startEtaCountdown(leg.duration.value);'
new4 = '          const leg = result.routes[0]?.legs[0];\n          if (withEta && leg?.duration?.value) startEtaCountdown(leg.duration.value);\n          const steps = leg?.steps || [];\n          if (steps.length > 0) { const s = steps[0]; setNavInfo(prev => ({ ...prev, nextStreet: (s.instructions||"").replace(/<[^>]*>/g,""), distanceToNext: s.distance?.text||"" })); }'
if old4 in c: c = c.replace(old4, new4); print("OK nav extract")
else: print("MISS nav extract")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
