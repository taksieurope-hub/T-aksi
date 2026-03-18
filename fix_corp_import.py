path = "frontend/src/App.jsx"
c = open(path, "r", encoding="utf-8").read()

if "CorporatePortal" not in c:
    old = "import DriverPortal from"
    new = "import CorporatePortal from \"@/components/CorporatePortal\";\nimport DriverPortal from"
    if old in c:
        c = c.replace(old, new)
        print("OK: import added")
    else:
        print("MISS: could not find DriverPortal import")
else:
    print("Import already there - checking route...")

if "/business" not in c:
    old = "<Route path=\"/driver"
    new = "<Route path=\"/business\" element={<CorporatePortal />} />\n        <Route path=\"/driver"
    if old in c:
        c = c.replace(old, new, 1)
        print("OK: route added")
    else:
        print("MISS: route")
else:
    print("Route already there")

open(path, "w", encoding="utf-8", newline="\n").write(c)
