path = "backend/server.py"
lines = open(path, encoding="utf-8").read().splitlines()

print("=== anthropic import (first 35 lines) ===")
for i, line in enumerate(lines[:35]):
    if "anthropic" in line.lower():
        print(str(i+1) + ": " + line)

print("\n=== git log (last 5 commits) ===")
import subprocess
r = subprocess.run(["git", "log", "--oneline", "-5"], capture_output=True, text=True)
print(r.stdout)
