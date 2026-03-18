path = "frontend/src/sw.js"
c = open(path, "r", encoding="utf-8").read()

# Check if activate handler already exists
if "activate" in c:
    print("activate handler already present - checking content")
    idx = c.find("activate")
    print(c[idx-20:idx+200])
else:
    print("no activate handler found")
print("---")
print(c[:300])
