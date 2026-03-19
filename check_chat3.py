import os

files = [
    "frontend/src/components/DriverPortal.jsx",
    "frontend/src/components/RiderPortal.jsx",
]

for path in files:
    if not os.path.exists(path): continue
    lines = open(path, "r", encoding="utf-8").read().splitlines()
    hits = []
    for i, line in enumerate(lines):
        if any(x in line.lower() for x in ["message", "chat", "bubble"]):
            hits.append(str(i+1) + ": " + line)
    if hits:
        print(f"\n=== {path} (first 80 chat hits) ===")
        for h in hits[:80]: print(h)
