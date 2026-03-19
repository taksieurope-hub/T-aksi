path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== Support / AI chat endpoint ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["support", "claude", "anthropic", "ANTHROPIC", "CLAUDE", "max_tokens"]) and any(x in line for x in ["@app", "api_key", "client", "messages", "def "]):
        for j in range(max(0,i-1), min(len(lines), i+6)):
            print(str(j+1) + ": " + lines[j])
        print("---")

print("\n=== ANTHROPIC_API_KEY env ===")
for i, line in enumerate(lines):
    if "ANTHROPIC" in line:
        print(str(i+1) + ": " + line)
