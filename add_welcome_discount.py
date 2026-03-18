path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '        "total_rides": 0,\n        "rating": 5.0,\n        "created_at": firestore.SERVER_TIMESTAMP,\n        "updated_at": firestore.SERVER_TIMESTAMP,\n    }\n    user_ref.set(user_data)'

new = '        "total_rides": 0,\n        "rating": 5.0,\n        "welcome_discount_rides_remaining": 2,\n        "welcome_discount_pct": 15,\n        "created_at": firestore.SERVER_TIMESTAMP,\n        "updated_at": firestore.SERVER_TIMESTAMP,\n    }\n    user_ref.set(user_data)'

if old in c:
    c = c.replace(old, new)
    print("OK: welcome discount fields added to rider registration")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
