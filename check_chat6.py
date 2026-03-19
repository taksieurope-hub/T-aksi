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
        if "RideCommunication" in line:
            # show 3 lines of context around each hit
            for j in range(max(0,i-1), min(len(lines), i+5)):
                hits.append(str(j+1) + ": " + lines[j])
            hits.append("---")
    if hits:
        print(f"\n=== {path} ===")
        for h in hits: print(h)
