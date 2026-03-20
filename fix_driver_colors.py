import glob

for path in ["frontend/src/components/DriverPortal.jsx", "frontend/src/components/AdminPortal.jsx"]:
    c = open(path, encoding="utf-8").read()
    orig = c
    c = c.replace('"#0a0a12"', '"#1a1a2e"')
    c = c.replace('"#0a0a18"', '"#1a1a2e"')
    c = c.replace('"#1a1f2e"', '"#1a1a2e"')
    c = c.replace('"#141c2b"', '"#1a2035"')
    c = c.replace('"#0f172a"', '"#0e1626"')
    c = c.replace('"#4a5f7a"', '"#5a7a9a"')
    c = c.replace('"#746855"', '"#ffffff"')
    c = c.replace('"#9ca5b3"', '"#ffffff"')
    c = c.replace('"#4a6880"', '"#ffffff"')
    c = c.replace('"#6b8fa8"', '"#00d4ff"')
    c = c.replace('"#4f6b87"', '"#5a7a9a"')
    c = c.replace('"#3d5068"', '"#4a6880"')
    c = c.replace('"#2d3f55"', '"#3a5068"')
    c = c.replace('"#c8d6e5"', '"#ffffff"')
    c = c.replace('"#f5c842"', '"#ffffff"')
    if c != orig:
        open(path, "w", encoding="utf-8").write(c)
        print("Fixed: " + path)
    else:
        print("No changes: " + path)
