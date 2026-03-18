path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

payout_code = '''
@app.post("/api/admin/competition/payout", tags=["Competition"])
async def run_competition_payout(admin_id: str = Depends(get_admin_user)):
    """Pay out prizes to top 5 drivers for the most recently completed competition week."""
    from datetime import datetime, timezone, timedelta
    db = get_db()
    now = datetime.now(timezone.utc)
    anchor = datetime(2026, 3, 16, 0, 0, 0, tzinfo=timezone.utc)
    days_since = (now - anchor).days
    week_num = days_since // 7
    is_comp = (week_num % 2) == 0

    # If currently a competition week, pay out the PREVIOUS competition week
    # If currently a break week, pay out the competition week that just ended
    if is_comp:
        payout_week_num = week_num - 2  # previous competition week
    else:
        payout_week_num = week_num - 1  # competition week that just ended

    if payout_week_num < 0:
        raise HTTPException(400, "No completed competition week to pay out yet")

    week_start = anchor + timedelta(weeks=payout_week_num)
    week_key = week_start.strftime("%Y-%m-%d")

    # Check if already paid out
    payout_ref = db.collection("competition_payouts").document(week_key)
    if payout_ref.get().exists:
        raise HTTPException(400, f"Week {week_key} has already been paid out")

    # Get all drivers and their trip counts for that week
    drivers = db.collection("users").where("role", "==", "driver").stream()
    board = []
    for d in drivers:
        data = d.to_dict()
        trips = (data.get("competition_trips") or {}).get(week_key, 0)
        if trips > 0:
            board.append({"driver_id": d.id, "name": f"{data.get('name','')} {data.get('surname','')}".strip(), "trips": trips})

    board.sort(key=lambda x: x["trips"], reverse=True)
    prizes = [150, 120, 90, 60, 30]
    results = []

    for i, entry in enumerate(board[:5]):
        prize = prizes[i]
        driver_id = entry["driver_id"]
        db.collection("users").document(driver_id).update({
            "earnings.balance": firestore.Increment(prize),
            "earnings.total_earned": firestore.Increment(prize),
        })
        send_push_notification(
            driver_id,
            title="🏆 Competition Prize!",
            body=f"Congratulations! You finished #{i+1} and won {prize} GEL!",
            data={"type": "competition_prize", "amount": str(prize), "rank": str(i+1)},
        )
        results.append({"rank": i+1, "driver_id": driver_id, "name": entry["name"], "trips": entry["trips"], "prize": prize})

    # Mark as paid out
    payout_ref.set({
        "week_key": week_key,
        "paid_at": firestore.SERVER_TIMESTAMP,
        "paid_by": admin_id,
        "results": results,
    })

    return {"message": f"Payout complete for week {week_key}", "results": results}

@app.get("/api/admin/competition/payout-history", tags=["Competition"])
async def get_payout_history(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = list(db.collection("competition_payouts").stream())
    return {"payouts": [d.to_dict() for d in docs]}
'''

insert_marker = "\nif __name__ == \"__main__\":"
if insert_marker in c:
    c = c.replace(insert_marker, payout_code + insert_marker)
    print("OK: payout endpoints added")
else:
    c += payout_code
    print("OK: appended to end")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
