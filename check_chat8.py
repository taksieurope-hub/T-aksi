path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== CHAT GET endpoint ===")
for i, line in enumerate(lines):
    if "chat" in line.lower() and "@app" in line.lower():
        for j in range(i, min(len(lines), i+40)):
            print(str(j+1) + ": " + lines[j])
            if j > i and "@app" in lines[j]: break
        print("---")

print("\n=== CHAT POST endpoint ===")
in_chat_post = False
for i, line in enumerate(lines):
    if "/chat" in line and "post" in line.lower():
        in_chat_post = True
    if in_chat_post:
        print(str(i+1) + ": " + line)
        if i > 0 and in_chat_post and line.strip() == "" and i > 10:
            in_chat_post = False

print("\n=== user.id field in auth/login ===")
for i, line in enumerate(lines):
    if any(x in line for x in ['"id"', "'id'", "user_id", "sender_id"]) and any(x in line for x in ["return", "dict", "json", "sender"]):
        print(str(i+1) + ": " + line)
