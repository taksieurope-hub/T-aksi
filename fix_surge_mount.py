path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Only fetch surge when pickup has coordinates, not on initial mount
old = '    fetchSurgeStatus();'
new = '    // Only fetch surge when pickup location is set'
if old in c:
    count = c.count(old)
    print(f"Found {count} occurrences")
    # Replace only the first one (the mount call)
    c = c.replace(old, new, 1)
    print("OK: removed surge fetch on mount")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Saved!")
