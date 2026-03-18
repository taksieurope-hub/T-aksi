import firebase_admin
from firebase_admin import credentials, firestore as fs

if not firebase_admin._apps:
    cred = credentials.Certificate("backend/firebase-service-account.json")
    firebase_admin.initialize_app(cred)

db = fs.client()
user_id = "uinExEGcme0VsAcWwORJ"
ref = db.collection("users").document(user_id)
doc = ref.get()
if not doc.exists:
    print("User not found!")
else:
    user = doc.to_dict()
    print(f"Found: {user.get('name')} {user.get('surname')} - {user.get('cellphone')}")
    ref.update({
        "promo": {
            "code": "AMIR10",
            "discount_pct": 10,
            "type": "lifetime",
            "description": "Lifetime 10% discount - Promoter",
            "active": True,
        }
    })
    print("Done! Lifetime 10% promo applied to Amir Jafary!")
