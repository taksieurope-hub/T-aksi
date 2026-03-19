path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Fix balance check on accept to include signup bonus
old = ('    # Balance check ? driver must have enough to cover commission\n'
       '    if balance < held_commission:\n'
       '        raise HTTPException(\n'
       '            400,\n'
       '            f"Insufficient balance. Need ?{held_commission:.2f} to accept this ride. "\n'
       '            f"Current balance: ?{balance:.2f}. Please top up your wallet."\n'
       '        )')
new = ('    # Balance check - include signup bonus for cash rides\n'
       '    _earnings = driver_data.get("earnings", {})\n'
       '    _bonus = _earnings.get("signup_bonus", 0)\n'
       '    _bonus_used = _earnings.get("signup_bonus_used", 0)\n'
       '    _remaining_bonus = max(0, _bonus - _bonus_used)\n'
       '    _effective_balance = balance + _remaining_bonus\n'
       '    ride_payment = ride_data.get("payment_method", "cash")\n'
       '    if ride_payment == "cash" and _effective_balance < held_commission:\n'
       '        raise HTTPException(\n'
       '            400,\n'
       '            f"Insufficient balance. Need GEL {held_commission:.2f} to accept this cash ride. "\n'
       '            f"Current balance: GEL {balance:.2f}. Please top up your wallet."\n'
       '        )')
if old in c:
    c = c.replace(old, new)
    changes.append("OK: accept balance check includes signup bonus")
else:
    changes.append("MISS: balance check - trying alternate")
    lines = c.splitlines()
    for i, line in enumerate(lines):
        if "Insufficient balance" in line:
            print("Found at line " + str(i+1) + ": " + line)

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
