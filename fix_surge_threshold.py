path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''def get_surge_multiplier(lat: float = None, lng: float = None) -> dict:
    """Demand-based surge — no time gate. Triggers purely from rides/drivers ratio."""
    demand = 0.0  # default to no surge when no location provided
    if lat and lng:
        demand = get_area_demand(lat, lng)

    # demand = rides / (drivers * 2), so 0.5 = rides exceed half the drivers
    if demand >= 1.0:'''

new = '''def get_surge_multiplier(lat: float = None, lng: float = None) -> dict:
    """Demand-based surge — only activates when 10+ drivers are online platform-wide."""
    demand = 0.0
    if lat and lng:
        # Check total online drivers first - no surge below 10
        try:
            db = get_db()
            total_online = len(list(db.collection("users")
                .where("user_type", "==", "driver")
                .where("is_online", "==", True)
                .stream()))
            if total_online < 10:
                return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None, "demand_level": 0.0}
        except Exception:
            return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None, "demand_level": 0.0}
        demand = get_area_demand(lat, lng)

    # demand = rides / (drivers * 2), so 0.5 = rides exceed half the drivers
    if demand >= 1.0:'''

if old in c:
    c = c.replace(old, new)
    print("OK: surge now requires 10+ online drivers")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Done!")
