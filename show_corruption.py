path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8", errors="replace").read()
lines = c.splitlines()
shown = 0
for i, line in enumerate(lines):
    if "Ã" in line:
        print(str(i+1) + ": " + repr(line[:120]))
        shown += 1
        if shown >= 15:
            print("...")
            break
print("Total lines with corruption: " + str(sum(1 for l in lines if "Ã" in l)))
