path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if "corporate" in line.lower() and "@app" in line:
        for j in range(i, min(len(lines), i+5)):
            print(str(j+1) + ": " + lines[j])
        print("---")
