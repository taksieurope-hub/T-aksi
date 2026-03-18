path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''    # Fetch completed rides
    rides_query = db.collection("rides").where("status", "==", "completed")
    if start:
        rides_query = rides_query.where("created_at", ">=", start)
    rides = list(rides_query.stream())'''

new = '''    # Fetch completed rides (filter date in Python to avoid composite index requirement)
    rides_query = db.collection("rides").where("status", "==", "completed")
    all_rides = list(rides_query.stream())
    if start:
        rides = []
        for r in all_rides:
            try:
                ca = r.to_dict().get("created_at")
                if ca is None:
                    continue
                if hasattr(ca, "tzinfo"):
                    if ca.tzinfo is None:
                        from datetime import timezone as _tz
                        ca = ca.replace(tzinfo=_tz.utc)
                    if ca >= start:
                        rides.append(r)
                else:
                    rides.append(r)
            except:
                rides.append(r)
    else:
        rides = all_rides'''

if old in c:
    c = c.replace(old, new)
    print("OK: fixed compound query")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
