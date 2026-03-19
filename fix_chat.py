path = "frontend/src/components/RideCommunication.jsx"
c = open(path, "r", encoding="utf-8").read()

# Fix the isMe check to use sender_role (what backend actually saves)
old = 'const isMe = msg.sender_id && currentUserId ? String(msg.sender_id) === String(currentUserId) : (isDriver ? msg.sender_type === "driver" || msg.sender_role === "driver" : msg.sender_type === "rider" || msg.sender_role === "rider");'
new = 'const isMe = (msg.sender_id && currentUserId) ? String(msg.sender_id) === String(currentUserId) : (isDriver ? msg.sender_role === "driver" : msg.sender_role === "rider");'

if old in c:
    c = c.replace(old, new)
    open(path, "w", encoding="utf-8").write(c)
    print("Done. isMe fix applied.")
else:
    print("MATCH FAILED - trying to show actual line...")
    for i, line in enumerate(c.splitlines()):
        if "isMe" in line and "sender_id" in line:
            print(str(i+1) + ": " + line)
