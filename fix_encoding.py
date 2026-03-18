path = "frontend/src/components/RiderPortal.jsx"
with open(path, "r", encoding="utf-8", errors="replace") as f:
    c = f.read()

replacements = {
    "Ã‚Â·": "\u00b7",
    "Ã¢Å¡Â¡": "\u26a1",
    "Ã¢â‚¬â€": "\u2014",
    "Ã¢â€ â€™": "\u2192",
    "Ã‚Â": "",
    "â€™": "\u2019",
    "â€¢": "\u2022",
    "Ã©": "\u00e9",
}

count = 0
for bad, good in replacements.items():
    if bad in c:
        c = c.replace(bad, good)
        print(f"Fixed: {repr(bad)}")
        count += 1

print(f"Total fixes: {count}")

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(c)
print("Saved!")
