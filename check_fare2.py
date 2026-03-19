path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== ALL fare-related endpoints ===")
for i, line in enumerate(lines):
    if "@app" in line and any(x in line.lower() for x in ["fare", "ride", "price", "cost", "calculat"]):
        print(str(i+1) + ": " + line)

print("\n=== calculate_fare function ===")
for i, line in enumerate(lines):
    if "def calculate_fare" in line or "def compute_fare" in line or "def get_fare" in line:
        for j in range(i, min(len(lines), i+80)):
            print(str(j+1) + ": " + lines[j])
            if j > i and lines[j].strip().startswith("def "): break
        print("---")

print("\n=== Where calculate_fare is called ===")
for i, line in enumerate(lines):
    if "calculate_fare" in line or "compute_fare" in line:
        print(str(i+1) + ": " + line)
