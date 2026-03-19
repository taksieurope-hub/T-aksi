import os, glob

for path in glob.glob("frontend/src/**/*.js", recursive=True) + glob.glob("frontend/src/**/*.jsx", recursive=True) + glob.glob("frontend/src/**/*.ts", recursive=True):
    try:
        c = open(path, "r", encoding="utf-8").read()
    except: continue
    if "useAgoraCall" in c or "startCall" in c and "agora" in c.lower():
        lines = c.splitlines()
        print(f"\n=== {path} ({len(lines)} lines) ===")
        for i, line in enumerate(lines):
            print(str(i+1) + ": " + line)
