path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()
for i, line in enumerate(lines[:50]):
    if "anthropic" in line.lower():
        print(str(i+1) + ": " + line)
