path = "frontend/src/sw.js"
c = open(path, "r", encoding="utf-8").read()

old = 'f.addEventListener("activate"'
new = 'self.addEventListener("activate"'

if old in c:
    c = c.replace(old, new)
    print("OK: fixed corrupted self reference")
else:
    print("not found - showing activate area:")
    idx = c.find("activate")
    print(repr(c[idx-30:idx+50]))

open(path, "w", encoding="utf-8", newline="\n").write(c)
