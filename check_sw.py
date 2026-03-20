import glob, os

for path in ["frontend/public/sw.js", "public/sw.js", "frontend/sw.js"]:
    if os.path.exists(path):
        print(f"=== {path} ===")
        print(open(path, "r", encoding="utf-8").read())
