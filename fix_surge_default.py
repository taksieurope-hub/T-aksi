path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '    demand = 0.3  # default baseline'
new = '    demand = 0.0  # default to no surge when no location provided'

if old in c:
    c = c.replace(old, new)
    print("OK: surge default fixed")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
