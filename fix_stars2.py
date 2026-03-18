path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Fix star in rate passenger modal
c = c.replace('            ⭐\n          </button>', '            ★\n          </button>')

# Also fix any remaining ? stars in the rating display
import re
# Fix the s <= rating ternary that shows stars
c = re.sub(r'\{s <= rating \? ["\'].*?["\'] : ["\'].*?["\']\}', '{s <= rating ? "★" : "☆"}', c)

open(path, "w", encoding="utf-8").write(c)
print("Done")
