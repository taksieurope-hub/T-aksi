import glob
for path in glob.glob("frontend/src/**/*.jsx", recursive=True):
    try:
        c = open(path, encoding="utf-8").read()
    except: continue
    if "41.69" in c or "44.79" in c or "destination" in c.lower() and "center" in c.lower():
        lines = c.splitlines()
        for i, line in enumerate(lines):
            if "41.69" in line or "44.79" in line or ("center" in line and "lat" in line.lower()):
                print(path + " line " + str(i+1) + ": " + line.strip())
