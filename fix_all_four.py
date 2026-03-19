import re
changes = []

# ================================================================
# FIX 1: Save rider_phone to ride document when ride is requested
# ================================================================
path_b = "backend/server.py"
c = open(path_b, "r", encoding="utf-8").read()

old = '        "userId": final_user_id,\n        "rider_id": final_user_id,'
new = '        "userId": final_user_id,\n        "rider_id": final_user_id,\n        "rider_phone": user_data.get("cellphone", "") if user_data else "",'
if old in c:
    # Need to get user_data before this point
    c = c.replace(old, new)
    changes.append("OK: rider_phone saved to ride document")
else:
    changes.append("MISS: ride document user fields")

# Make sure user_data is fetched before ride creation
old2 = '    ride_ref = db.collection("rides").document()\n    new_ride = {'
new2 = '    _rider_doc_phone = db.collection("users").document(final_user_id).get()\n    user_data = _rider_doc_phone.to_dict() if _rider_doc_phone.exists else {}\n    ride_ref = db.collection("rides").document()\n    new_ride = {'
if old2 in c and "user_data = _rider_doc_phone" not in c:
    c = c.replace(old2, new2)
    changes.append("OK: user_data fetched for rider_phone")
else:
    changes.append("SKIP: user_data already fetched or not found")

# ================================================================
# FIX 2: Add admin endpoint to change driver vehicle tier
# ================================================================
old3 = '@app.post("/api/admin/drivers/{driver_id}/approve", tags=["Admin"])'
new3 = '''@app.post("/api/admin/drivers/{driver_id}/set-tier", tags=["Admin"])
async def set_driver_tier(driver_id: str, tier: str = Query(...), admin_id: str = Depends(get_admin_user)):
    valid_tiers = ["economy", "comfort", "suv", "jumpstart", "personal"]
    if tier.lower() not in valid_tiers:
        raise HTTPException(400, f"Invalid tier. Must be one of: {valid_tiers}")
    db = get_db()
    doc = db.collection("users").document(driver_id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")
    data = doc.to_dict()
    vehicles = data.get("driver_info", {}).get("vehicles", [])
    active_id = data.get("driver_info", {}).get("active_vehicle_id")
    updated = False
    for v in vehicles:
        if v.get("id") == active_id or not active_id:
            v["tier"] = tier.lower()
            updated = True
            break
    if updated:
        db.collection("users").document(driver_id).update({
            "driver_info.vehicles": vehicles,
            "driver_info.vehicle_tier": tier.lower(),
        })
    return {"message": f"Vehicle tier updated to {tier}", "driver_id": driver_id}


@app.post("/api/admin/drivers/{driver_id}/approve", tags=["Admin"])'''

if "set-tier" not in c:
    c = c.replace(old3, new3)
    changes.append("OK: admin set-tier endpoint added")
else:
    changes.append("SKIP: set-tier already exists")

open(path_b, "w", encoding="utf-8", newline="\n").write(c)

# ================================================================
# FIX 3: Show welcome discount in fare estimate (frontend)
# ================================================================
path_r = "frontend/src/components/RiderPortal.jsx"
c = open(path_r, "r", encoding="utf-8").read()

old4 = '              {promoApplied && fareEstimate?.discount > 0 && (\n                <div style={{display:"flex",justifyContent:"space-between",padding:"0 8px"}}>\n                  <span style={{color:"#00ff88",fontSize:11,fontWeight:700}}>🎉 Promo discount: GEL {fareEstimate.discount.toFixed(2)}</span>\n                </div>\n              )}'
new4 = ('              {promoApplied && fareEstimate?.discount > 0 && (\n'
        '                <div style={{display:"flex",justifyContent:"space-between",padding:"0 8px"}}>\n'
        '                  <span style={{color:"#00ff88",fontSize:11,fontWeight:700}}>🎉 Promo discount: GEL {fareEstimate.discount.toFixed(2)}</span>\n'
        '                </div>\n'
        '              )}\n'
        '              {(user?.welcome_discount_rides_remaining > 0) && fareEstimate?.total > 0 && (\n'
        '                <div style={{display:"flex",justifyContent:"space-between",padding:"0 8px"}}>\n'
        '                  <span style={{color:"#ff8c00",fontSize:11,fontWeight:700}}>🎉 Welcome discount: -GEL {(fareEstimate.total * 0.15 / 0.85).toFixed(2)} (15% off)</span>\n'
        '                  <span style={{color:"#ff8c00",fontSize:11,fontWeight:700}}>→ GEL {(fareEstimate.total * 0.85).toFixed(2)}</span>\n'
        '                </div>\n'
        '              )}')
if old4 in c:
    c = c.replace(old4, new4)
    changes.append("OK: welcome discount shown in fare estimate")
else:
    changes.append("MISS: promo discount display")

# ================================================================
# FIX 4: Show driver phone in rider active ride + call button
# ================================================================
# Find where driver info is shown in active ride
old5 = '                  otherPartyPhone={activeRide?.driver_phone || activeRide?.driver_info?.cellphone}'
if old5 not in c:
    # Find RideCommunication in rider portal
    for marker in ['otherPartyPhone={activeRide', 'driver_phone']:
        idx = c.find(marker)
        if idx != -1:
            print("Found rider RideCommunication at:", c[idx:idx+100])
            break

open(path_r, "w", encoding="utf-8", newline="\n").write(c)

# ================================================================
# FIX 5: Add call button in rider active ride view
# ================================================================
# Check if rider has a call button for driver
if "driver_phone" not in c or "tel:" not in c:
    # Find where driver name is shown in active ride
    rider_active = c.find('driver_name')
    if rider_active != -1:
        changes.append("INFO: rider needs call button - check RideCommunication component")
    else:
        changes.append("INFO: driver_phone not in rider portal")

print("\n".join(changes))
