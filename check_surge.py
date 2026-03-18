path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

# Find what the current thresholds look like
import re
match = re.search(r"demand >= 0\.\d+.*Very high demand.*?return.*?}\)", c, re.DOTALL)
if match:
    print("FOUND:")
    print(match.group(0)[:400])
else:
    # Just find the surge multiplier lines
    for i, line in enumerate(c.split("\n")):
        if "Very high demand" in line or "High demand" in line or "Moderate demand" in line:
            print(f"Line {i}: {line}")
