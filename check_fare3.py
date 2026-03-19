path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== /api/rides/estimate endpoint ===")
for i in range(1722, 1740):
    print(str(i+1) + ": " + lines[i])

print("\n=== rides/request fare call (line 3474 area) ===")
for i in range(3455, 3560):
    print(str(i+1) + ": " + lines[i])
