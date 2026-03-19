path = "frontend/src/components/RiderPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== ScheduledRideModal full component (lines 1049-1105) ===")
for i in range(1048, 1110):
    print(str(i+1) + ": " + lines[i])
