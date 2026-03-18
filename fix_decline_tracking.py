path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''    db = get_db()
    db.collection("rides").document(ride_id).update({
        "declined_drivers": firestore.ArrayUnion([user_id])
    })
    return {"message": "Ride declined"}'''

new = '''    db = get_db()
    # Track acceptance rate
    try:
        driver_ref = db.collection("users").document(user_id)
        driver_doc = driver_ref.get()
        if driver_doc.exists:
            dd = driver_doc.to_dict()
            total_req = dd.get("total_requests", 0) + 1
            total_acc = dd.get("total_accepted", 0)
            acc_rate = round((total_acc / total_req) * 100, 1) if total_req > 0 else 100.0
            driver_ref.update({"total_requests": total_req, "acceptance_rate": acc_rate})
    except Exception as e:
        logger.warning(f"Acceptance rate update failed: {e}")
    db.collection("rides").document(ride_id).update({
        "declined_drivers": firestore.ArrayUnion([user_id])
    })
    return {"message": "Ride declined"}'''

if old in c:
    c = c.replace(old, new)
    print("OK: decline tracking added")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Done!")
