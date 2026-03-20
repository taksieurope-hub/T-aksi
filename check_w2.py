path = "backend/server.py"
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if "WithdrawRequest" in line and ("class" in line or "Base" in line):
        for j in range(i, min(len(lines), i+10)):
            print(str(j+1) + ": " + lines[j])
        break
