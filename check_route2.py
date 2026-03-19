path_d = "frontend/src/components/DriverPortal.jsx"
c = open(path_d, "r", encoding="utf-8").read()
lines = c.splitlines()

# Show the full map init block and the route useEffect
print("=== MAP INIT (lines 1476-1510) ===")
for i in range(1475, 1510):
    print(str(i+1) + ": " + lines[i])

print("\n=== ROUTE USEEFFECT (lines 1595-1690) ===")
for i in range(1594, 1690):
    print(str(i+1) + ": " + lines[i])

print("\n=== fetchActiveRide function (lines 2184-2190) ===")
for i in range(2183, 2192):
    print(str(i+1) + ": " + lines[i])
