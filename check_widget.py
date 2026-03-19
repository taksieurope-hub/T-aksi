import glob
for path in glob.glob("frontend/src/**/*.jsx", recursive=True) + glob.glob("frontend/src/**/*.tsx", recursive=True):
    try:
        c = open(path, "r", encoding="utf-8").read()
    except: continue
    if "SupportChatWidget" in c and "export default" in c:
        lines = c.splitlines()
        print(f"=== {path} ({len(lines)} lines) ===")
        for i, line in enumerate(lines):
            print(str(i+1) + ": " + line)
