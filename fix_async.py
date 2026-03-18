path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = "  const handleBookRide = () => {"
new = "  const handleBookRide = async () => {"

if old in c:
    c = c.replace(old, new)
    print("OK: handleBookRide made async")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
