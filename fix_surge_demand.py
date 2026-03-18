path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''def get_surge_multiplier(lat: float = None, lng: float = None) -> dict:
    if not is_surge_time():
        return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None}

    demand = 0.5
    if lat and lng:
        demand = get_area_demand(lat, lng)

    if demand >= 0.75:
        multiplier, reason = 2.0, "Very high demand"
    elif demand >= 0.5:
        multiplier, reason = 1.8, "High demand"
    elif demand >= 0.25:
        multiplier, reason = 1.5, "Moderate demand"
    else:
        multiplier, reason = 1.2, "Surge hours"

    commission_rate = SURGE_LEVELS.get(multiplier, DRIVER_COMMISSION_RATE)
    return {
        "multiplier": multiplier,
        "commission_rate": commission_rate,
        "is_surge": True,
        "surge_reason": reason,
        "demand_level": round(demand, 2),
    }'''

new = '''def get_surge_multiplier(lat: float = None, lng: float = None) -> dict:
    """Demand-based surge — no time gate. Triggers purely from rides/drivers ratio."""
    demand = 0.3  # default baseline
    if lat and lng:
        demand = get_area_demand(lat, lng)

    if demand >= 0.75:
        multiplier, reason = 2.0, "Very high demand in your area"
    elif demand >= 0.5:
        multiplier, reason = 1.8, "High demand in your area"
    elif demand >= 0.30:
        multiplier, reason = 1.5, "Moderate demand in your area"
    elif demand >= 0.15:
        multiplier, reason = 1.2, "Elevated demand in your area"
    else:
        return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None, "demand_level": round(demand, 2)}

    commission_rate = SURGE_LEVELS.get(multiplier, DRIVER_COMMISSION_RATE)
    return {
        "multiplier": multiplier,
        "commission_rate": commission_rate,
        "is_surge": True,
        "surge_reason": reason,
        "demand_level": round(demand, 2),
    }'''

if old in c:
    c = c.replace(old, new)
    print("OK: surge now demand-based, time gate removed")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
