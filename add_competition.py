path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

competition_code = '''
# ============================================================
# COMPETITION SYSTEM
# ============================================================
import math as _math

def get_competition_week(now=None):
    """Returns (is_competition_week, week_start, week_end) based on bi-weekly Monday schedule.
    Anchor date: 2026-03-16 (first competition Monday).
    Competition weeks are even-numbered cycles (0, 2, 4...).
    """
    from datetime import datetime, timezone, timedelta
    if now is None:
        now = datetime.now(timezone.utc)
    anchor = datetime(2026, 3, 16, 0, 0, 0, tzinfo=timezone.utc)
    days_since = (now - anchor).days
    week_num = days_since // 7
    is_comp = (week_num % 2) == 0
    week_start = anchor + timedelta(weeks=week_num)
    week_end = week_start + timedelta(weeks=1)
    return is_comp, week_start, week_end

@app.get("/api/competition/status", tags=["Competition"])
async def get_competition_status():
    from datetime import datetime, timezone
    is_comp, week_start, week_end = get_competition_week()
    return {
        "active": is_comp,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "prizes": [150, 120, 90, 60, 30],
    }

@app.get("/api/competition/leaderboard", tags=["Competition"])
async def get_competition_leaderboard():
    from datetime import datetime, timezone
    db = get_db()
    is_comp, week_start, week_end = get_competition_week()
    week_key = week_start.strftime("%Y-%m-%d")
    drivers = db.collection("users").where("role", "==", "driver").stream()
    board = []
    for d in drivers:
        data = d.to_dict()
        comp_trips = (data.get("competition_trips") or {}).get(week_key, 0)
        if comp_trips > 0:
            board.append({
                "driver_id": d.id,
                "name": f"{data.get('name','')} {data.get('surname','')}".strip(),
                "trips": comp_trips,
                "avatar": data.get("profile_photo", ""),
            })
    board.sort(key=lambda x: x["trips"], reverse=True)
    prizes = [150, 120, 90, 60, 30]
    for i, entry in enumerate(board[:5]):
        entry["prize"] = prizes[i]
        entry["rank"] = i + 1
    return {"active": is_comp, "week_key": week_key, "leaderboard": board[:20]}
'''

# Insert before last route or at end before if __name__
insert_marker = '\nif __name__ == "__main__":'
if insert_marker in c:
    c = c.replace(insert_marker, competition_code + insert_marker)
    print("OK: inserted before __main__")
else:
    c += competition_code
    print("OK: appended to end")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
