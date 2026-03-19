path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

# Find the last import line near the top
last_import = 0
for i, line in enumerate(lines[:60]):
    if line.startswith("import ") or line.startswith("from "):
        last_import = i

print(f"Inserting after line {last_import+1}: {lines[last_import]}")
lines.insert(last_import + 1, "import anthropic")
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("Done. anthropic imported.")
