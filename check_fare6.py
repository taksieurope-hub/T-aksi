path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== /rides/{ride_id}/complete endpoint ===")
for i in range(4149, 4310):
    print(str(i+1) + ": " + lines[i])
