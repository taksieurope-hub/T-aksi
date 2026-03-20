path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if any(x in line for x in ["WITHDRAWAL_RESERVE", "WITHDRAWAL_FEE"]):
        print(str(i+1) + ": " + line.strip())
