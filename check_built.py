import os, glob

# Check if dist was rebuilt recently
dist_files = glob.glob("frontend/dist/**/*", recursive=True)
if dist_files:
    import time
    newest = max(dist_files, key=os.path.getmtime)
    age = time.time() - os.path.getmtime(newest)
    print(f"Newest dist file: {newest}")
    print(f"Built {int(age/60)} minutes ago")

# Check sw.js in dist for the selself fix
sw_dist = "frontend/dist/sw.js"
if os.path.exists(sw_dist):
    c = open(sw_dist, encoding="utf-8", errors="ignore").read()
    print(f"\nsw.js contains selself: {'selself' in c}")
    print(f"sw.js contains activate: {'activate' in c}")

# Check if anthropic is imported in server.py
lines = open("backend/server.py", encoding="utf-8").read().splitlines()
for i, l in enumerate(lines[:35]):
    if "anthropic" in l.lower():
        print(f"\nserver.py line {i+1}: {l}")
