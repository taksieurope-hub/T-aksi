import os, glob

# Search all frontend files for the ride-to-ride chat
for path in glob.glob("frontend/src/**/*.jsx", recursive=True) + glob.glob("frontend/src/**/*.tsx", recursive=True):
    lines = open(path, "r", encoding="utf-8").read().splitlines()
    hits = []
    for i, line in enumerate(lines):
        if any(x in line for x in ["ride_id", "rideId", "driver_id", "rider_id"]) and any(x in line.lower() for x in ["chat", "message", "msg"]):
            hits.append(str(i+1) + ": " + line)
    if hits:
        print(f"\n=== {path} ===")
        for h in hits[:30]: print(h)

# Also list all components
print("\n=== ALL COMPONENT FILES ===")
for path in glob.glob("frontend/src/**/*.jsx", recursive=True):
    print(path)
