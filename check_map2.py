import glob
for path in glob.glob("frontend/src/**/*.jsx", recursive=True):
    try:
        c = open(path, encoding="utf-8").read()
    except: continue
    if "VITE_GOOGLE_MAPS" in c or "googleMapsApiKey" in c or "useJsApiLoader" in c or "LoadScript" in c:
        lines = c.splitlines()
        for i, line in enumerate(lines):
            if any(x in line for x in ["VITE_GOOGLE_MAPS", "googleMapsApiKey", "useJsApiLoader", "LoadScript", "apiKey"]):
                print(path + " line " + str(i+1) + ": " + line.strip())
