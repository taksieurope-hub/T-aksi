path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
lines = c.splitlines()
fixes = 0

# Find exact lines for rideStartTime / distanceTraveled / lastPositionRef block
for i, line in enumerate(lines):
    if "setRideStartTime(Date.now())" in line:
        print(f"Found setRideStartTime at line {i+1}")
        for j in range(i, min(len(lines), i+8)):
            print(repr(lines[j]))
        print("---")

for i, line in enumerate(lines):
    if "lastPositionRef.current = driverLocation" in line:
        print(f"Found lastPositionRef at line {i+1}")
        for j in range(max(0,i-2), min(len(lines), i+4)):
            print(repr(lines[j]))
        print("---")
