path = "frontend/src/components/AdminPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

print("=== toast import ===")
for i, line in enumerate(lines[:30]):
    print(str(i+1) + ": " + line)

print("\n=== CorporateAdminPanel api calls ===")
for i, line in enumerate(lines):
    if "CorporateAdminPanel" in line or ("/admin/corporate" in line):
        print(str(i+1) + ": " + line)
