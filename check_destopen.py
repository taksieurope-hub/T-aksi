path = "frontend/src/components/RiderPortal.jsx"
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if "MapPicker" in line or "isOpen" in line or "initialLocation" in line:
        print(str(i+1) + ": " + line.strip())
