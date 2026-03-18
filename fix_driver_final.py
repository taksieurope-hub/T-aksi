path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8", errors="replace").read()
import re

# Remove the corrupted \xa0Ã¢â‚¬â„¢ sequences (corrupted apostrophe/quote)
c = c.replace("\xa0\u00c3\xa2\u00e2\u20ac\u201e\u00a2", "")
c = re.sub(r"\xa0Ã¢â‚¬â„¢\xa0?", "", c)
c = re.sub(r"Ã¢â‚¬â„¢", "", c)
c = re.sub(r"\xa0Ã[^\s<\"{}]{0,20}", "", c)

remaining = c.count("Ã")
print("Remaining: " + str(remaining))

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
