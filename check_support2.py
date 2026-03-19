path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== /api/support/chat endpoint ===")
for i, line in enumerate(lines):
    if "support/chat" in line and "@app" in line:
        for j in range(i, min(len(lines), i+60)):
            print(str(j+1) + ": " + lines[j])
            if j > i and "@app" in lines[j]: break
        break
