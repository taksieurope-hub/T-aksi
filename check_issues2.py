path = "backend/server.py"
lines = open(path, encoding="utf-8").read().splitlines()

print("=== ELIGIBLE_TYPES ===")
for i, line in enumerate(lines):
    if "ELIGIBLE_TYPES" in line:
        for j in range(max(0,i-2), min(len(lines), i+8)):
            print(str(j+1) + ": " + lines[j])
        print("---")

print("\n=== Driver matching filter (around line 3781) ===")
for j in range(3770, 3830):
    print(str(j+1) + ": " + lines[j])

print("\n=== AGORA_APP_ID value ===")
for i, line in enumerate(lines):
    if "AGORA_APP_ID" in line and "=" in line and "@" not in line and "return" not in line:
        print(str(i+1) + ": " + line)
