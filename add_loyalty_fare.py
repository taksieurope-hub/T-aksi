path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

# Apply loyalty discount at ride request (after promo discount)
old = '        fare["promo_code"] = _rider_promo.get("code", "")'
new = '        fare["promo_code"] = _rider_promo.get("code", "")\n    # Apply loyalty 15% discount if earned\n    _rider_doc2 = db.collection("users").document(final_user_id).get()\n    _rider_d2 = _rider_doc2.to_dict() or {} if _rider_doc2.exists else {}\n    if _rider_d2.get("loyalty_free_ride_earned"):\n        _loyalty_disc = round(fare["total"] * 0.15, 2)\n        fare["total"] = round(fare["total"] - _loyalty_disc, 2)\n        fare["loyalty_discount"] = _loyalty_disc\n        # Clear the flag so it only applies once\n        db.collection("users").document(final_user_id).update({"loyalty_free_ride_earned": False, "loyalty_discount_pct": 0})'

if old in c:
    c = c.replace(old, new)
    print("OK: loyalty discount at fare calc")
else:
    print("MISS: loyalty fare calc")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
