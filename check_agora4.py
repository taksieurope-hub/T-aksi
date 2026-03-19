path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if "AGORA" in line or "agora_token" in line:
        print(str(i+1) + ": " + repr(line))
