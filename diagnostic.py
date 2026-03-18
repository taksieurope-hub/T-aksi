import os

checks = []

# Backend checks
c = open("backend/server.py", "r", encoding="utf-8").read()
checks.append(("Rider register endpoint", "/api/auth/register/rider" in c))
checks.append(("Driver register endpoint", "/api/auth/register/driver" in c))
checks.append(("Login endpoint", "/api/auth/login" in c))
checks.append(("Ride request endpoint", "/api/rides/request" in c))
checks.append(("Driver available rides", "/api/driver/rides/available" in c))
checks.append(("Ride retry endpoint", "retry" in c))
checks.append(("Rider welcome discount saved", "welcome_discount_rides_remaining" in c))
checks.append(("Welcome discount applied", "_welcome_remaining" in c))
checks.append(("Driver signup bonus saved", "signup_bonus" in c))
checks.append(("Cash-only balance gate", "ride_payment" in c and "_effective_balance" in c))
checks.append(("Corporate register", "/api/corporate/register" in c))
checks.append(("Corporate login", "/api/corporate/login" in c))
checks.append(("Admin corporate approve", "admin/corporate" in c and "approve" in c))
checks.append(("Match drivers function", "match_drivers_to_ride" in c))
checks.append(("Push notification sender", "def send_push_notification" in c))
checks.append(("No test_rider_id fallback", "test_rider_id" not in c))

# Frontend file checks
files = [
    "frontend/src/components/RiderPortal.jsx",
    "frontend/src/components/DriverPortal.jsx",
    "frontend/src/components/AdminPortal.jsx",
    "frontend/src/components/CorporatePortal.jsx",
    "frontend/src/App.jsx",
    "frontend/src/sw.js",
    "frontend/src/i18n/translations.js",
    "frontend/public/favicon-32x32.png",
    "frontend/public/favicon-16x16.png",
]
for f in files:
    checks.append((f.split("/")[-1] + " exists", os.path.exists(f)))

# Frontend feature checks
rider = open("frontend/src/components/RiderPortal.jsx", "r", encoding="utf-8").read()
driver = open("frontend/src/components/DriverPortal.jsx", "r", encoding="utf-8").read()
app = open("frontend/src/App.jsx", "r", encoding="utf-8").read()
sw = open("frontend/src/sw.js", "r", encoding="utf-8").read()
trans = open("frontend/src/i18n/translations.js", "r", encoding="utf-8").read()

checks.append(("Welcome banner on booking screen", "Welcome Discount Active" in rider))
checks.append(("Corporate payment in rider", "corporate" in rider and "Business" in rider))
checks.append(("Driver bonus display", "signup bonus" in driver))
checks.append(("Star rating fixed", "fill={s <= rating" in driver))
checks.append(("CorporatePortal lazy loaded", "CorporatePortal" in app and "lazy" in app))
checks.append(("/business route exists", "/business" in app))
checks.append(("SW activate cache clear", "activate" in sw and "caches.delete" in sw))
checks.append(("SW skipWaiting", "skipWaiting" in sw))
checks.append(("SW self reference correct", "f.addEventListener" not in sw))

for key in ["pending_review", "save_iban", "under_review", "notify_approved", "get_help"]:
    checks.append(("Translation: " + key, key + ":" in trans))

print("\n=== DIAGNOSTIC RESULTS ===")
fails = 0
for name, result in checks:
    status = "OK  " if result else "FAIL"
    if not result:
        fails += 1
    print(status + ": " + name)
print("\n" + str(fails) + " failure(s) out of " + str(len(checks)) + " checks")
