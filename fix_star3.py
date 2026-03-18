path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Find and print what's around line 2376
lines = c.split("\n")
line = lines[2376]
print("Before:", repr(line))

# Replace any non-ASCII non-Georgian character followed by space and {user.rating
import re
lines[2376] = re.sub(r'[^\x00-\x7f\u10d0-\u10ff]+\s*\{user\.rating', '★ {user.rating', line)
print("After:", repr(lines[2376]))

c = "\n".join(lines)
open(path, "w", encoding="utf-8").write(c)
print("Saved!")
