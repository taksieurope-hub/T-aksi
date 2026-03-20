path = "backend/server.py"
lines = open(path, encoding="utf-8").read().splitlines()

print("=== Agora token endpoint ===")
for i, line in enumerate(lines):
    if "agora/token" in line and "@app" in line:
        for j in range(i, min(len(lines), i+10)):
            print(str(j+1) + ": " + lines[j])
        break

print("\n=== Ride matching / dispatch logic ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["car_type", "vehicle_type", "available_drivers", "find_driver", "dispatch"]):
        print(str(i+1) + ": " + line)
