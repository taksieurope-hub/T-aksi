import glob
for path in glob.glob("frontend/src/**/*.jsx", recursive=True):
    try:
        c = open(path, encoding="utf-8").read()
    except: continue
    if "mapStyle" in c or "styles" in c and "google" in c.lower():
        lines = c.splitlines()
        for i, line in enumerate(lines):
            if "mapStyle" in line or ("styles" in line and "featureType" in line):
                print(path + " line " + str(i+1) + ": " + line[:120])
