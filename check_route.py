path_d = "frontend/src/components/DriverPortal.jsx"
c = open(path_d, "r", encoding="utf-8").read()
lines = c.splitlines()

print("=== ROUTE / DIRECTIONS RENDERING ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["DirectionsRenderer","DirectionsService","routePoints","polyline","setRoute","drawRoute","directions","activeRoute","setDirections","directionsResult"]):
        print(str(i+1) + ": " + line)

print("\n=== ACTIVE RIDE FETCH ON MOUNT ===")
for i, line in enumerate(lines):
    if "fetchActiveRide" in line or "fetchAvailableRides" in line:
        print(str(i+1) + ": " + line)

print("\n=== MAP COMPONENT ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["GoogleMap","onLoad","mapRef","google.maps","setMap","mapInstance","<Map"]):
        print(str(i+1) + ": " + line)

print("\n=== ACTIVE RIDE STATE ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["setActiveRide","activeRide","pickup_lat","destination_lat","pickup_lng"]):
        if "useState" in line or "setActiveRide" in line or "activeRide." in line or "activeRide?" in line:
            print(str(i+1) + ": " + line)
