import os, glob

for path in glob.glob("frontend/src/**/*.jsx", recursive=True):
    try:
        lines = open(path, "r", encoding="utf-8").read().splitlines()
    except: continue
    hits = []
    for i, line in enumerate(lines):
        if any(x in line for x in ["agora", "AgoraRTC", "appId", "APP_ID", "rtc", "agoraToken", "join(", "createClient"]):
            hits.append(str(i+1) + ": " + line)
    if hits:
        print(f"\n=== {path} ===")
        for h in hits[:40]: print(h)

# Also check backend for token generation
path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()
print("\n=== backend agora ===")
for i, line in enumerate(lines):
    if any(x in line for x in ["agora", "RtcTokenBuilder", "token", "AGORA"]):
        print(str(i+1) + ": " + line)
