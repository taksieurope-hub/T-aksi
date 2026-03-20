path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if any(x in line for x in ["withdraw", "Withdraw", "withdrawal", "Withdrawal"]):
        print(str(i+1) + ": " + line.strip())
