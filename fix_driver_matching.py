path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

# 1. Change wave radii to start at 2km
old = "    radius_progression = [3, 5, 8, 12, 20, 30]"
new = "    radius_progression = [2, 4, 6, 10, 15, 25]"
if old in c:
    c = c.replace(old, new)
    changes.append("wave radii start at 2km")

# 2. Add preferred_radius to driver registration defaults
old = '        "is_online": False,'
new = '        "is_online": False,\n        "preferred_radius": 2.0,\n        "acceptance_rate": 100.0,\n        "total_requests": 0,\n        "total_accepted": 0,'
if old in c:
    c = c.replace(old, new, 1)
    changes.append("added preferred_radius to driver registration")

# 3. Use driver preferred_radius in wave system
old = "        nearby_drivers = []\n        declined = ride_data.get(\"declined_drivers\", [])\n        already_notified = ride_data.get(\"notified_drivers\", [])"
new = """        nearby_drivers = []
        declined = ride_data.get("declined_drivers", [])
        already_notified = ride_data.get("notified_drivers", [])
        # Also check drivers finishing nearby rides (within 1km of dropoff)
        finishing_drivers = []
        try:
            active_rides = db.collection("rides").where("status", "in", ["in_progress", "arrived"]).stream()
            for ar in active_rides:
                ard = ar.to_dict()
                dropoff_lat = ard.get("dropoff_lat")
                dropoff_lng = ard.get("dropoff_lng")
                if not dropoff_lat or not dropoff_lng:
                    continue
                dist_to_new_pickup = haversine_distance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
                if dist_to_new_pickup <= 1.0:
                    finishing_driver_id = ard.get("driver_id")
                    if finishing_driver_id and finishing_driver_id not in declined and finishing_driver_id not in already_notified:
                        finishing_drivers.append(finishing_driver_id)
        except Exception as e:
            logger.warning(f"Finishing drivers check failed: {e}")"""
if old in c:
    c = c.replace(old, new)
    changes.append("added end-of-trip proximity check")

# 4. Prioritize drivers within their preferred radius and finishing nearby
old = "            if distance <= radius:"
new = """            driver_preferred_radius = driver_data.get("preferred_radius", 2.0)
                effective_radius = max(radius, driver_preferred_radius)
                is_finishing_nearby = driver.id in finishing_drivers
                if distance <= effective_radius or is_finishing_nearby:"""
if old in c:
    c = c.replace(old, new, 1)
    changes.append("use preferred_radius per driver")

# 5. Add acceptance rate to sort (prioritize drivers with higher acceptance)
old = "        nearby_drivers.sort(key=lambda x: x[\"distance\"])"
new = "        nearby_drivers.sort(key=lambda x: (x[\"distance\"], -x.get(\"acceptance_rate\", 100)))"
if old in c:
    c = c.replace(old, new)
    changes.append("sort by distance then acceptance rate")

# 6. Track declines - update acceptance rate when driver declines
old = '        ride_ref.update({\n            "status": "searching",\n            "declined_drivers": firestore.ArrayUnion([user_id])'
new = '''        # Update driver acceptance rate stats
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
        ride_ref.update({
            "status": "searching",
            "declined_drivers": firestore.ArrayUnion([user_id])'''
if old in c:
    c = c.replace(old, new)
    changes.append("track decline acceptance rate")

open(path, "w", encoding="utf-8").write(c)
print("Applied:", changes)
