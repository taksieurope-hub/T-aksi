path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

# 1. Add month label to financials response
old_return = '''    return {
        "period": period,
        "summary": {'''

new_return = '''    # Build human-readable period label
    month_names = ["January","February","March","April","May","June","July","August","September","October","November","December"]
    if period == "week":
        period_label = f"Week of {(now - timedelta(days=7)).strftime('%d %b')} - {now.strftime('%d %b %Y')}"
    elif period == "month":
        period_label = f"{month_names[now.month-1]} {now.year}"
    elif period == "quarter":
        q = ((now.month - 1) // 3) + 1
        period_label = f"Q{q} {now.year}"
    elif period == "year":
        period_label = f"Full Year {now.year}"
    else:
        period_label = "All Time"

    return {
        "period": period,
        "period_label": period_label,
        "date_from": start.strftime("%d %b %Y") if start else "All time",
        "date_to": now.strftime("%d %b %Y"),
        "summary": {'''

if old_return in c:
    c = c.replace(old_return, new_return)
    print("OK: period label added to financials")
else:
    print("MISS: return block")

# 2. Add clear test data endpoint
clear_endpoint = '''
@app.post("/api/admin/clear-test-data", tags=["Admin"])
async def clear_test_data(
    payload: dict = Body(...),
    admin_id: str = Depends(get_admin_user)
):
    """Delete all test/dummy rides from Firestore. Requires admin password confirmation."""
    import os
    admin_password = payload.get("password", "")
    correct_password = os.environ.get("ADMIN_CLEAR_PASSWORD", "TaksiClear2026!")
    if admin_password != correct_password:
        raise HTTPException(403, "Incorrect password")
    db = get_db()
    # Delete all rides
    rides = list(db.collection("rides").stream())
    deleted_rides = 0
    batch = db.batch()
    for i, r in enumerate(rides):
        batch.delete(r.reference)
        deleted_rides += 1
        if (i + 1) % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()
    return {
        "message": f"Cleared {deleted_rides} rides from the database.",
        "deleted_rides": deleted_rides,
    }
'''

marker = '\nif __name__ == "__main__":'
if marker in c:
    c = c.replace(marker, clear_endpoint + marker)
    print("OK: clear test data endpoint added")
else:
    c += clear_endpoint
    print("OK: appended")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
