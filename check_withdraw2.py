path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, encoding="utf-8").read().splitlines()
for j in range(386, 510):
    print(str(j+1) + ": " + lines[j])
