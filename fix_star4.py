path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
lines = c.split("\n")
lines[2376] = lines[2376].replace('>? {user.rating', '>\u2605 {user.rating')
print(repr(lines[2376]))
c = "\n".join(lines)
open(path, "w", encoding="utf-8").write(c)
print("Done")
