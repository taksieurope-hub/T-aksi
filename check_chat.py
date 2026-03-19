import os

files = [
    "frontend/src/components/DriverPortal.jsx",
    "frontend/src/components/RiderPortal.jsx",
]

for path in files:
    if not os.path.exists(path): continue
    lines = open(path, "r", encoding="utf-8").read().splitlines()
    hits = []
    for i, line in enumerate(lines):
        if any(x in line.lower() for x in ["chatmodal", "ridechat", "livechat", "chat-modal", "msgbubble", "message bubble", "sender", "msg.sender", "message.sender", "scrollref", "scrollinto", "overflow-y", "flex-col-reverse"]):
            hits.append(str(i+1) + ": " + line)
    if hits:
        print(f"\n=== {path} ===")
        for h in hits: print(h)
