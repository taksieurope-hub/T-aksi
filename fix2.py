path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''    if demand >= 0.75:
        multiplier, reason = 2.0, "Very high demand in your area"
    elif demand >= 0.5:
        multiplier, reason = 1.8, "High demand in your area"
    elif demand >= 0.30:
        multiplier, reason = 1.5, "Moderate demand in your area"
    elif demand >= 0.15:
        multiplier, reason = 1.2, "Elevated demand in your area"
    else:
        return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None, "demand_level": round(demand, 2)}'''

new = '''    # demand = rides / (drivers * 2), so 0.5 = rides exceed half the drivers
    if demand >= 1.0:
        multiplier, reason = 2.0, "Very high demand in your area"
    elif demand >= 0.75:
        multiplier, reason = 1.8, "High demand in your area"
    elif demand >= 0.60:
        multiplier, reason = 1.5, "Moderate demand in your area"
    elif demand >= 0.50:
        multiplier, reason = 1.2, "More requests than half your local drivers"
    else:
        return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None, "demand_level": round(demand, 2)}'''

if old in c:
    c = c.replace(old, new)
    print("OK")
else:
    print("MISS - count:", c.count('demand >= 0.75'))

open(path, "w", encoding="utf-8").write(c)
