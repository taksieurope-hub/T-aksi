path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== FARE ESTIMATE endpoint ===")
for i, line in enumerate(lines):
    if "fare" in line.lower() and "estimate" in line.lower() and "@app" in line:
        for j in range(i, min(len(lines), i+60)):
            print(str(j+1) + ": " + lines[j])
            if j > i and "@app" in lines[j]: break
        print("---")

print("\n=== FARE CALCULATION (complete_ride / end_ride) ===")
for i, line in enumerate(lines):
    if any(x in line.lower() for x in ["complete_ride", "end_ride", "finish_ride"]) and "@app" in line:
        for j in range(i, min(len(lines), i+80)):
            print(str(j+1) + ": " + lines[j])
            if j > i and "@app" in lines[j]: break
        print("---")

print("\n=== PRICING CONSTANTS ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["BASE_FARE", "PER_KM", "PRICE_PER", "base_fare", "per_km", "MIN_FARE", "SURGE"]):
        print(str(i+1) + ": " + line)
