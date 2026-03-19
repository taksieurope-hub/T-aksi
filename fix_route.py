import re

path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# 1. Add mapReady state near other state declarations
c = c.replace(
    "const [isFollowing, setIsFollowing] = useState(true);",
    "const [isFollowing, setIsFollowing] = useState(true);\n  const [mapReady, setMapReady] = useState(false);"
)

# 2. Set mapReady=true when map finishes init (after mapInstanceRef.current = map)
c = c.replace(
    "    mapInstanceRef.current = map;\n  }, []);",
    "    mapInstanceRef.current = map;\n    setMapReady(true);\n  }, []);"
)

# 3. Add mapReady to the directions useEffect dependency array
c = c.replace(
    "  }, [activeRide?.status, activeRide?.pickup_lat, activeRide?.dest_lat, activeRide?.destination_lat, activeRide?.stops]);",
    "  }, [activeRide?.status, activeRide?.pickup_lat, activeRide?.dest_lat, activeRide?.destination_lat, activeRide?.stops, mapReady]);"
)

# 4. Remove the early-exit guard so it re-evaluates when mapReady flips
# The existing guard at line 1619 already handles null refs, mapReady ensures re-trigger
open(path, "w", encoding="utf-8").write(c)
print("Done. Changes applied:")
print("  1. mapReady state added")
print("  2. setMapReady(true) called on map init")
print("  3. mapReady added to directions useEffect deps")
