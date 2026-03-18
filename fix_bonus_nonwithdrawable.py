path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Revert: don't credit bonus to balance (keeps it non-withdrawable)
old = '    user_data["earnings"]["signup_bonus"] = signup_bonus\n    user_data["earnings"]["signup_bonus_used"] = 0.0\n    user_data["earnings"]["balance"] = signup_bonus\n    user_ref.set(user_data)'
new = '    user_data["earnings"]["signup_bonus"] = signup_bonus\n    user_data["earnings"]["signup_bonus_used"] = 0.0\n    user_ref.set(user_data)'
if old in c:
    c = c.replace(old, new)
    changes.append("OK: reverted balance credit")
else:
    changes.append("SKIP: already reverted")

# Fix matching gate: use balance + remaining bonus for cash rides
old2 = ('            driver_balance = driver_data.get("earnings", {}).get("balance", 0)\n'
        '            ride_payment = ride_data.get("payment_method", "cash")\n'
        '            if ride_payment == "cash" and driver_balance < required_commission:\n'
        '                continue')
new2 = ('            _earn = driver_data.get("earnings", {})\n'
        '            driver_balance = _earn.get("balance", 0)\n'
        '            _bonus = _earn.get("signup_bonus", 0)\n'
        '            _bonus_used = _earn.get("signup_bonus_used", 0)\n'
        '            _remaining_bonus = max(0, _bonus - _bonus_used)\n'
        '            _effective_balance = driver_balance + _remaining_bonus\n'
        '            ride_payment = ride_data.get("payment_method", "cash")\n'
        '            if ride_payment == "cash" and _effective_balance < required_commission:\n'
        '                continue')
if old2 in c:
    c = c.replace(old2, new2)
    changes.append("OK: cash gate uses balance + remaining bonus")
else:
    changes.append("MISS: cash gate")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
