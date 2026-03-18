path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Fix 1: Credit driver signup bonus to actual balance
old = '    user_data["earnings"]["signup_bonus"] = signup_bonus\n    user_data["earnings"]["signup_bonus_used"] = 0.0\n    user_ref.set(user_data)'
new = '    user_data["earnings"]["signup_bonus"] = signup_bonus\n    user_data["earnings"]["signup_bonus_used"] = 0.0\n    user_data["earnings"]["balance"] = signup_bonus\n    user_ref.set(user_data)'
if old in c:
    c = c.replace(old, new)
    changes.append("OK: driver signup bonus credited to balance")
else:
    changes.append("MISS: driver bonus")

# Fix 2: Balance gate - only block cash rides, not card/wallet/corporate
old2 = '            driver_balance = driver_data.get("earnings", {}).get("balance", 0)\n            if driver_balance < required_commission:\n                continue'
new2 = '            driver_balance = driver_data.get("earnings", {}).get("balance", 0)\n            ride_payment = ride_data.get("payment_method", "cash")\n            if ride_payment == "cash" and driver_balance < required_commission:\n                continue'
if old2 in c:
    c = c.replace(old2, new2)
    changes.append("OK: balance gate limited to cash rides only")
else:
    # Try the version without required_commission (already removed)
    old2b = '            driver_balance = driver_data.get("earnings", {}).get("balance", 0)'
    new2b = ('            estimated_fare = ride_data.get("estimated_fare", 0)\n'
             '            commission_rate = ride_data.get("commission_rate", DRIVER_COMMISSION_RATE)\n'
             '            required_commission = estimated_fare * commission_rate\n'
             '            driver_balance = driver_data.get("earnings", {}).get("balance", 0)\n'
             '            ride_payment = ride_data.get("payment_method", "cash")\n'
             '            if ride_payment == "cash" and driver_balance < required_commission:\n'
             '                continue')
    if old2b in c:
        c = c.replace(old2b, new2b, 1)
        changes.append("OK: balance gate added (cash only)")
    else:
        changes.append("MISS: balance gate")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
