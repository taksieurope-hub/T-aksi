path = "frontend/src/components/DriverPortal.jsx"
c = open(path, encoding="utf-8").read()
old = """      tilt: 45,
      heading: 0,"""
new = """      tilt: 0,
      heading: 0,"""
if old in c:
    open(path, "w", encoding="utf-8").write(c.replace(old, new))
    print("Done. Tilt removed.")
else:
    print("MATCH FAILED")
