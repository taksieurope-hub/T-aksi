path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
fixes = 0

# Fix 1: Swap the swapped arguments in the estimate endpoint
old1 = "        fare = calculate_fare(distance, car_type)"
new1 = "        fare = calculate_fare(car_type, distance)"
if old1 in c:
    c = c.replace(old1, new1)
    fixes += 1
    print("Fix 1 applied: estimate endpoint args unswapped")
else:
    print("Fix 1 FAILED")

# Fix 2: Don't silently default to 5km - raise an error so we catch missing distance
old2 = "        ride_data.estimated_distance or 5,"
new2 = "        ride_data.estimated_distance or 0,"
if old2 in c:
    c = c.replace(old2, new2)
    fixes += 1
    print("Fix 2 applied: removed silent 5km fallback")
else:
    print("Fix 2 FAILED")

open(path, "w", encoding="utf-8").write(c)
print(f"\nDone. {fixes}/2 backend fixes applied.")
