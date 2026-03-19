import os

files_to_check = [
    "frontend/src/components/RiderPortal.jsx",
    "frontend/src/components/AdminPortal.jsx",
    "frontend/src/components/DriverPortal.jsx",
]

for path in files_to_check:
    if not os.path.exists(path): continue
    lines = open(path, "r", encoding="utf-8").read().splitlines()
    hits = []
    for i, line in enumerate(lines):
        if any(x in line.lower() for x in ["ampm", "am/pm", "meridiem", "period", "12h", "timepicker", "time_picker", "schedule"]):
            hits.append(str(i+1) + ": " + line)
    if hits:
        print(f"\n=== {path} ===")
        for h in hits: print(h)
