path_b = "backend/server.py"
path_r = "frontend/src/components/RiderPortal.jsx"
path_d = "frontend/src/components/DriverPortal.jsx"

b = open(path_b, "r", encoding="utf-8").read()
r = open(path_r, "r", encoding="utf-8").read()
d = open(path_d, "r", encoding="utf-8").read()
lines_b = b.splitlines()
lines_d = d.splitlines()
lines_r = r.splitlines()

# 1. Cancellation fee logic
print("=== CANCELLATION FEE LOGIC ===")
for i, line in enumerate(lines_b):
    if "cancel" in line.lower() and ("fee" in line.lower() or "charge" in line.lower() or "grace" in line.lower()):
        print(str(i+1) + ": " + line)

# 2. Driver call button - show context
print("\n=== DRIVER CALL BUTTON CONTEXT ===")
for i, line in enumerate(lines_d):
    if "tel:" in line or "otherPartyPhone" in line or "rider_phone" in line:
        print(str(i+1) + ": " + line)

# 3. Admin tier endpoint
print("\n=== ADMIN TIER ENDPOINT ===")
for i, line in enumerate(lines_b):
    if "tier" in line.lower() and ("admin" in line.lower() or "driver" in line.lower()) and ("update" in line.lower() or "set" in line.lower() or "patch" in line.lower() or "@app" in line):
        print(str(i+1) + ": " + line)

# 4. Fare estimate discount display
print("\n=== FARE DISCOUNT IN ESTIMATE ===")
for i, line in enumerate(lines_r):
    if "welcome_discount" in line and ("fareEstimate" in line or "calculateFare" in line or "total" in line.lower()):
        print(str(i+1) + ": " + line)
# Show fareEstimate display area
for i, line in enumerate(lines_r):
    if "fareEstimate" in line and "GEL" in line:
        print("DISPLAY " + str(i+1) + ": " + line)
