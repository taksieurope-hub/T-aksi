path = "frontend/src/components/AdminPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if "</Tabs>" in line or "</main>" in line:
        for j in range(max(0,i-3), min(len(lines), i+3)):
            print(str(j+1) + ": " + repr(lines[j]))
        print("---")
