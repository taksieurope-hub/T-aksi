path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''    return {
        "message": "Ride completed",
        "payment_status": payment_status,
        "final_fare": total_with_fee,
        "wallet_used": wallet_used,
        "cash_to_collect": cash_to_collect,
        "fare_breakdown": final_fare,
    }'''

new = '''    # Send email receipt to rider
    try:
        if rider_id:
            rider_doc = db.collection("users").document(rider_id).get()
            if rider_doc.exists:
                rider_data = rider_doc.to_dict()
                rider_email = rider_data.get("email")
                rider_name = rider_data.get("name", "Rider")
                if rider_email:
                    full_ride_data = {**ride_data, **ride_updates, "id": ride_id}
                    import threading
                    threading.Thread(
                        target=send_email_receipt,
                        args=(rider_email, full_ride_data, rider_name),
                        daemon=True
                    ).start()
    except Exception as e:
        logger.warning(f"Email receipt trigger failed: {e}")

    return {
        "message": "Ride completed",
        "payment_status": payment_status,
        "final_fare": total_with_fee,
        "wallet_used": wallet_used,
        "cash_to_collect": cash_to_collect,
        "fare_breakdown": final_fare,
    }'''

if old in c:
    c = c.replace(old, new)
    print("OK: email receipt wired into ride completion")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Done!")
