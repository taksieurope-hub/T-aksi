path = "frontend/src/App.jsx"
c = open(path, "r", encoding="utf-8").read()

old = "const AdminPortal    = lazy(() => import(\"@/components/AdminPortal\"));"
new = "const AdminPortal    = lazy(() => import(\"@/components/AdminPortal\"));\nconst CorporatePortal = lazy(() => import(\"@/components/CorporatePortal\"));"

if old in c:
    c = c.replace(old, new)
    print("OK: CorporatePortal lazy import added")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
