path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '    # Apply loyalty 15% discount if earned'
new = '    # Apply welcome discount for new riders (first 2 rides)\n    _rider_doc3 = db.collection("users").document(final_user_id).get()\n    _rider_d3 = _rider_doc3.to_dict() or {} if _rider_doc3.exists else {}\n    _welcome_remaining = int(_rider_d3.get("welcome_discount_rides_remaining", 0))\n    if _welcome_remaining > 0:\n        _welcome_disc = round(fare["total"] * 0.15, 2)\n        fare["total"] = round(fare["total"] - _welcome_disc, 2)\n        fare["welcome_discount"] = _welcome_disc\n        db.collection("users").document(final_user_id).update({"welcome_discount_rides_remaining": firestore.Increment(-1)})\n    # Apply loyalty 15% discount if earned'

if old in c:
    c = c.replace(old, new)
    print("OK: welcome discount wired into fare")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
