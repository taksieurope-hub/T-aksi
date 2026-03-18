path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '                send_push_notification(\n                    driver["id"],\n                    title="New Ride Request ??",\n                    body=f"Pickup {round(driver[\'distance\'], 1)}km away ? ?{ride_data.get(\'estimated_fare\', 0):.0f}",'
new = '                send_push_notification(\n                    driver["id"],\n                    title=f"New {(ride_data.get(\'carType\') or \'Economy\').title()} Ride Request",\n                    body=f"Pickup {round(driver[\'distance\'], 1)}km away - GEL {ride_data.get(\'estimated_fare\', 0):.0f}",'

if old in c:
    c = c.replace(old, new)
    print("OK: notification shows car type")
else:
    print("MISS - showing current notification lines:")
    lines = c.splitlines()
    for i, line in enumerate(lines):
        if "send_push_notification" in line and "driver" in line:
            for j in range(i, i+5):
                print(repr(lines[j]))
            break

open(path, "w", encoding="utf-8", newline="\n").write(c)
