path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

surge_zones_endpoint = '''
@app.get("/api/surge/zones", tags=["Surge"])
async def get_surge_zones():
    """Returns demand hotspot zones for the driver map."""
    db = get_db()
    try:
        active_rides = list(
            db.collection("rides")
            .where("status", "in", ["searching", "accepted", "arrived", "in_progress"])
            .stream()
        )
        online_drivers = list(
            db.collection("users")
            .where("role", "==", "driver")
            .where("is_online", "==", True)
            .stream()
        )

        # Build grid cells (0.02 deg ~ 2km squares)
        CELL_SIZE = 0.02
        ride_cells = {}
        for ride in active_rides:
            rd = ride.to_dict()
            lat = rd.get("pickup_lat")
            lng = rd.get("pickup_lng")
            if not lat or not lng:
                continue
            cell = (round(lat / CELL_SIZE) * CELL_SIZE, round(lng / CELL_SIZE) * CELL_SIZE)
            ride_cells[cell] = ride_cells.get(cell, 0) + 1

        driver_cells = {}
        for driver in online_drivers:
            dd = driver.to_dict()
            loc = dd.get("current_location")
            if not loc or not loc.get("lat"):
                continue
            lat, lng = loc["lat"], loc["lng"]
            cell = (round(lat / CELL_SIZE) * CELL_SIZE, round(lng / CELL_SIZE) * CELL_SIZE)
            driver_cells[cell] = driver_cells.get(cell, 0) + 1

        zones = []
        for cell, ride_count in ride_cells.items():
            driver_count = driver_cells.get(cell, 0)
            # Check nearby cells for drivers too
            for dlat in [-CELL_SIZE, 0, CELL_SIZE]:
                for dlng in [-CELL_SIZE, 0, CELL_SIZE]:
                    neighbor = (round((cell[0]+dlat)/CELL_SIZE)*CELL_SIZE, round((cell[1]+dlng)/CELL_SIZE)*CELL_SIZE)
                    driver_count += driver_cells.get(neighbor, 0)

            if driver_count == 0:
                demand = 1.0
            else:
                demand = min(1.0, ride_count / max(1, driver_count * 2))

            if demand >= 0.15:
                if demand >= 0.75:
                    level, color, multiplier = "very_high", "#ff2200", 2.0
                elif demand >= 0.5:
                    level, color, multiplier = "high", "#ff6600", 1.8
                elif demand >= 0.30:
                    level, color, multiplier = "moderate", "#ffaa00", 1.5
                else:
                    level, color, multiplier = "elevated", "#ffdd00", 1.2

                zones.append({
                    "lat": cell[0],
                    "lng": cell[1],
                    "ride_count": ride_count,
                    "driver_count": driver_count,
                    "demand": round(demand, 2),
                    "level": level,
                    "color": color,
                    "multiplier": multiplier,
                    "radius": 1500,
                })

        return {"zones": zones, "total_active_rides": len(active_rides), "total_online_drivers": len(online_drivers)}
    except Exception as e:
        logger.error(f"Surge zones error: {e}")
        return {"zones": []}
'''

c += surge_zones_endpoint
open(path, "w", encoding="utf-8").write(c)
print("Saved!")
