path_b = "backend/server.py"
path_r = "frontend/src/components/RiderPortal.jsx"
path_d = "frontend/src/components/DriverPortal.jsx"

b = open(path_b, "r", encoding="utf-8").read()
r = open(path_r, "r", encoding="utf-8").read()
d = open(path_d, "r", encoding="utf-8").read()

# 1. Cancellation fee
print("=== CANCELLATION ===")
print("cancel endpoint exists:", "/rides/" in b and "cancel" in b)
print("cancellation_fee in backend:", "cancellation_fee" in b)
lines = b.splitlines()
for i, line in enumerate(lines):
    if "cancel" in line.lower() and "@app" in line:
        print(str(i+1) + ": " + line)

# 2. Driver contact rider
print("\n=== DRIVER CONTACT ===")
print("call button in driver portal:", "tel:" in d or "contact" in d.lower() and "rider" in d.lower())
for i, line in enumerate(d.splitlines()):
    if "tel:" in line or ("rider" in line.lower() and "phone" in line.lower()):
        print(str(i+1) + ": " + line)

# 3. Admin tier change
print("\n=== ADMIN TIER ===")
print("tier change endpoint:", "vehicle_tier" in b and "admin" in b)
for i, line in enumerate(lines):
    if "tier" in line.lower() and "admin" in line.lower() and "@app" in line:
        print(str(i+1) + ": " + line)

# 4. Discounted fare estimate
print("\n=== FARE ESTIMATE DISCOUNT ===")
print("welcome discount in fare calc:", "welcome_discount" in r and "calculateFare" in r)
print("fare estimate shows discount:", "welcome_discount" in r and "fareEstimate" in r)
