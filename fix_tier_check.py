path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '            ride_car_type = (ride_data.get("carType") or "economy").lower()\n            ELIGIBLE_TYPES = {"economy":{"economy","jumpstart","personal"},"comfort":{"comfort","economy","jumpstart","personal"},"suv":{"suv","comfort","economy","jumpstart","personal"},"jumpstart":{"economy","comfort","suv","personal","jumpstart"},"personal":{"economy","comfort","suv","personal","jumpstart"}}\n            allowed = ELIGIBLE_TYPES.get(ride_car_type, {"economy"})\n            dv = driver_data.get("driver_info",{}).get("vehicles",[])\n            da = driver_data.get("driver_info",{}).get("active_vehicle_id")\n            dveh = next((v for v in dv if v.get("id")==da), dv[0] if dv else {})\n            if dveh.get("tier","economy").lower() not in allowed: continue'

new = '            ride_car_type = (ride_data.get("carType") or "economy").lower()\n            ELIGIBLE_TYPES = {"economy":{"economy","jumpstart","personal"},"comfort":{"comfort","economy","jumpstart","personal"},"suv":{"suv","comfort","economy","jumpstart","personal"},"jumpstart":{"economy","comfort","suv","personal","jumpstart"},"personal":{"economy","comfort","suv","personal","jumpstart"}}\n            allowed = ELIGIBLE_TYPES.get(ride_car_type, {"economy"})\n            dv = driver_data.get("driver_info",{}).get("vehicles",[])\n            da = driver_data.get("driver_info",{}).get("active_vehicle_id")\n            dveh = next((v for v in dv if v.get("id")==da), dv[0] if dv else {})\n            driver_tier = (dveh.get("tier") or dveh.get("vehicle_tier") or driver_data.get("driver_info",{}).get("vehicle_tier") or "economy").lower()\n            if driver_tier not in allowed: continue'

if old in c:
    c = c.replace(old, new)
    print("OK: tier check fixed - uses vehicle_tier fallback")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
