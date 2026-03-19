path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Fix 1: Accept vehicle_tier as a form field
old = '''    license_plate: str = Form(...),
    license_front: Optional[UploadFile] = File(None),'''
new = '''    license_plate: str = Form(...),
    vehicle_tier: str = Form("economy"),
    license_front: Optional[UploadFile] = File(None),'''
if old in c:
    c = c.replace(old, new)
    changes.append("OK: vehicle_tier form field added")
else:
    changes.append("MISS: form field")

# Fix 2: Use submitted tier instead of hardcoded economy
old2 = '        "tier": "economy",'
new2 = '        "tier": vehicle_tier.lower() if vehicle_tier in ["economy","comfort","suv","jumpstart","personal"] else "economy",'
if old2 in c:
    c = c.replace(old2, new2, 1)
    changes.append("OK: tier uses submitted value")
else:
    changes.append("MISS: tier hardcode")

# Fix 3: Admin approve also sets vehicle tier
old3 = '    db.collection("users").document(driver_id).update({\n        "registration_status": "approved",\n        "approved_by": admin_id,\n        "approved_at": firestore.SERVER_TIMESTAMP,\n        "updated_at": firestore.SERVER_TIMESTAMP,\n    })'
new3 = '    tier = getattr(request_body, "vehicle_tier", None) if hasattr(request_body, "vehicle_tier") else None\n    update_data = {\n        "registration_status": "approved",\n        "approved_by": admin_id,\n        "approved_at": firestore.SERVER_TIMESTAMP,\n        "updated_at": firestore.SERVER_TIMESTAMP,\n    }\n    db.collection("users").document(driver_id).update(update_data)'
# Skip this for now - handle via separate endpoint

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
