path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, encoding="utf-8").read().splitlines()
for j in range(2070, 2085):
    print(str(j+1) + ": " + lines[j].strip())
print("...")
for j in range(3020, 3032):
    print(str(j+1) + ": " + lines[j].strip())
