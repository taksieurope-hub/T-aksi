path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''    ride_ref.update({
        "status": "cancelled",
        "cancelled_by": user_id,
        "cancelled_at": firestore.SERVER_TIMESTAMP,
    })
    if driver_id:
        send_push_notification(
            driver_id,
            title="Ride Cancelled",
            body="The rider cancelled this ride. Commission refunded.",
            data={"type": "ride_cancelled", "ride_id": ride_id},
        )
    return {"message": "Ride cancelled"}'''

new = '''    # Cancellation fee: 3 GEL if rider cancels after driver has arrived
    cancellation_fee = 0.0
    is_rider_cancel = (user_id == rider_id)
    if is_rider_cancel and current_status == "arrived" and driver_id:
        cancellation_fee = 3.0
        # Deduct from rider wallet if possible, otherwise just record it
        if rider_id:
            rider_doc = db.collection("users").document(rider_id).get()
            rider_data = rider_doc.to_dict() if rider_doc.exists else {}
            rider_balance = float(rider_data.get("wallet_balance", 0))
            actual_fee = min(cancellation_fee, rider_balance) if rider_balance > 0 else 0.0
            if actual_fee > 0:
                db.collection("users").document(rider_id).update({
                    "wallet_balance": firestore.Increment(-actual_fee)
                })
                # Pay the fee to the driver
                db.collection("users").document(driver_id).update({
                    "earnings.balance": firestore.Increment(actual_fee),
                    "earnings.total_earned": firestore.Increment(actual_fee),
                })
                cancellation_fee = actual_fee

    ride_ref.update({
        "status": "cancelled",
        "cancelled_by": user_id,
        "cancelled_at": firestore.SERVER_TIMESTAMP,
        "cancellation_fee": cancellation_fee,
    })
    if driver_id:
        if cancellation_fee > 0:
            send_push_notification(
                driver_id,
                title="Ride Cancelled - Fee Applied",
                body=f"Rider cancelled after arrival. GEL {cancellation_fee:.2f} no-show fee paid to you.",
                data={"type": "ride_cancelled", "ride_id": ride_id, "fee": str(cancellation_fee)},
            )
        else:
            send_push_notification(
                driver_id,
                title="Ride Cancelled",
                body="The rider cancelled this ride. Commission refunded.",
                data={"type": "ride_cancelled", "ride_id": ride_id},
            )
    if rider_id and cancellation_fee > 0:
        send_push_notification(
            rider_id,
            title="Cancellation Fee Applied",
            body=f"GEL {cancellation_fee:.2f} no-show fee charged as the driver had already arrived.",
            data={"type": "cancellation_fee", "fee": str(cancellation_fee)},
        )
    msg = "Ride cancelled"
    if cancellation_fee > 0:
        msg = f"Ride cancelled. GEL {cancellation_fee:.2f} no-show fee applied."
    return {"message": msg, "cancellation_fee": cancellation_fee}'''

if old in c:
    c = c.replace(old, new)
    print("OK: cancellation fee logic added")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
