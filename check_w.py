path = "backend/server.py"
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if "driver/withdraw" in line and "@app" in line:
        for j in range(i, min(len(lines), i+30)):
            print(str(j+1) + ": " + lines[j])
        break
