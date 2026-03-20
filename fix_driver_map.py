import glob

for path in glob.glob("frontend/src/**/*.jsx", recursive=True) + ["frontend/src/components/maps/LiveTrackingMap.jsx"]:
    try:
        c = open(path, encoding="utf-8").read()
    except: continue
    if "#1f2937" in c and "stylers" in c:
        c = c.replace('"#0d0d1a"', '"#1a1a2e"')
        c = c.replace('"#1f2937"', '"#4a5568"')
        c = c.replace('"#6b7280"', '"#ffffff"')
        c = c.replace('"#9ca3af"', '"#ffffff"')
        c = c.replace('"#111827"', '"#0e1626"')
        open(path, "w", encoding="utf-8").write(c)
        print(f"Fixed: {path}")
