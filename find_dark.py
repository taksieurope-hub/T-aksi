import glob
for path in glob.glob("frontend/src/**/*.jsx", recursive=True):
    try:
        c = open(path, encoding="utf-8").read()
    except: continue
    if "1f2937" in c or "0d0d1a" in c:
        print(f"Found in: {path}")
