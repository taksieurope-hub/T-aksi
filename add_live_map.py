path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

live_map_endpoint = '''
@app.get("/api/admin/live-map", tags=["Admin"])
async def get_live_map(admin_id: str = Depends(get_admin_user)):
    """Returns all online drivers with locations and any active rides."""
    db = get_db()
    # Get all online drivers
    online_drivers = list(db.collection("users").where("is_online", "==", True).where("role", "==", "driver").stream())
    # Get all active rides
    active_rides = list(db.collection("rides").where("status", "in", ["searching", "accepted", "arrived", "in_progress"]).stream())
    ride_map = {}
    for r in active_rides:
        rd = r.to_dict()
        did = rd.get("driver_id")
        if did:
            ride_map[did] = {
                "ride_id": r.id,
                "status": rd.get("status"),
                "rider_name": rd.get("rider_name", "Rider"),
                "pickup_address": rd.get("pickup_address", ""),
                "destination_address": rd.get("destination_address", rd.get("dest_address", "")),
                "fare": rd.get("final_fare") or rd.get("estimated_fare") or 0,
                "pickup_lat": rd.get("pickup_lat"),
                "pickup_lng": rd.get("pickup_lng"),
            }
    drivers_out = []
    for d in online_drivers:
        data = d.to_dict()
        loc = data.get("current_location")
        if not loc or not loc.get("lat"):
            continue
        drivers_out.append({
            "driver_id": d.id,
            "name": f"{data.get('name','')} {data.get('surname','')}".strip(),
            "phone": data.get("cellphone", ""),
            "rating": data.get("rating", 5.0),
            "lat": loc.get("lat"),
            "lng": loc.get("lng"),
            "heading": loc.get("heading", 0),
            "active_ride": ride_map.get(d.id),
        })
    # Also get searching rides with no driver yet
    searching = []
    for r in active_rides:
        rd = r.to_dict()
        if rd.get("status") == "searching" and not rd.get("driver_id"):
            searching.append({
                "ride_id": r.id,
                "pickup_lat": rd.get("pickup_lat"),
                "pickup_lng": rd.get("pickup_lng"),
                "pickup_address": rd.get("pickup_address", ""),
                "rider_name": rd.get("rider_name", "Rider"),
                "fare": rd.get("estimated_fare") or 0,
            })
    return {
        "drivers": drivers_out,
        "searching_rides": searching,
        "total_online": len(drivers_out),
        "total_active_rides": len([d for d in drivers_out if d.get("active_ride")]),
    }
'''

marker = '\nif __name__ == "__main__":'
if marker in c:
    c = c.replace(marker, live_map_endpoint + marker)
    print("OK: live map endpoint added")
else:
    c += live_map_endpoint
    print("OK: appended")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
