path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

# Fix 1: Remove test_rider_id fallback - require real auth
old = '    final_user_id = user_id or ride_data.user_id or "test_rider_id"'
new = '    final_user_id = user_id or ride_data.user_id\n    if not final_user_id:\n        raise HTTPException(401, "Authentication required to request a ride")'
if old in c:
    c = c.replace(old, new)
    print("OK: removed test_rider_id fallback")
else:
    print("MISS: fallback line")

# Fix 2: Make retry more lenient - check both userId fields
old2 = '    ride_owner = ride_data.get("userId") or ride_data.get("user_id")\n    if ride_owner != user_id:\n        raise HTTPException(403, "You can only retry your own rides")'
new2 = '    ride_owner = ride_data.get("userId") or ride_data.get("user_id") or ride_data.get("rider_id")\n    if ride_owner and ride_owner != user_id:\n        raise HTTPException(403, "You can only retry your own rides")'
if old2 in c:
    c = c.replace(old2, new2)
    print("OK: retry owner check made lenient")
else:
    print("MISS: retry check")

open(path, "w", encoding="utf-8", newline="\n").write(c)
