path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, encoding="utf-8").read().splitlines()

# Check what balance value is passed to WithdrawalPanel
for i, line in enumerate(lines):
    if "WithdrawalPanel" in line and "balance" in line:
        for j in range(max(0,i-5), min(len(lines), i+3)):
            print(str(j+1) + ": " + lines[j].strip())
        print("---")

# Check where balance comes from
for i, line in enumerate(lines):
    if "const balance" in line or "balance =" in line and "earn" in line.lower():
        print(str(i+1) + ": " + lines[i].strip())
