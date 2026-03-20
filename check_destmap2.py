path = "frontend/src/components/RiderPortal.jsx"
lines = open(path, encoding="utf-8").read().splitlines()
for j in range(170, 340):
    print(str(j+1) + ": " + lines[j])
