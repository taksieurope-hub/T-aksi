path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
lines = c.splitlines()

# Show exact context around line 2305
print("Context around fetchRideHistory line:")
for i in range(2298, 2310):
    print(repr(lines[i]))
