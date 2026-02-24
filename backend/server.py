import logging, math, os, asyncio, base64, json, re, shutil, uuid, bcrypt, jwt, httpx
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)
app = FastAPI(title="T'aksi API")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

if not firebase_admin._apps:
    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
    except:
        firebase_admin.initialize_app()

def get_db(): return firestore.client()
JWT_SECRET = str(os.getenv("JWT_SECRET", "dev_secret_change_me"))

def serialize_firestore_data(d):
    if isinstance(d, dict): return {k: serialize_firestore_data(v) for k, v in d.items()}
    if isinstance(d, list): return [serialize_firestore_data(v) for v in d]
    if hasattr(d, "timestamp"): return d.isoformat()
    return d

# --- AUTH ---
@app.post("/api/auth/login")
async def login(req: dict):
    db = get_db()
    users = list(db.collection("users").where("cellphone", "==", str(req.get("cellphone",""))).limit(1).stream())
    if not users: raise HTTPException(404, "User not found")
    u_doc = users[0]; u_data = u_doc.to_dict()
    token = jwt.encode({"id": str(u_doc.id), "user_type": u_data.get("user_type","rider"), "exp": datetime.now(timezone.utc)+timedelta(days=30)}, JWT_SECRET, algorithm="HS256")
    return {"status": "success", "token": str(token), "user": serialize_firestore_data({**u_data, "id": u_doc.id})}

# --- 🚀 RIDE ACTIONS (THE FIX FOR 404) ---

@app.post("/api/rides/{ride_id}/accept")
async def accept_ride(ride_id: str, req: Request):
    # This turns 'searching' into 'accepted'
    db = get_db()
    data = await req.json()
    driver_id = data.get("driver_id", "test_driver")
    db.collection("rides").document(ride_id).update({
        "status": "accepted",
        "driver_id": driver_id,
        "accepted_at": datetime.now(timezone.utc)
    })
    return {"status": "success", "message": "Ride accepted"}

@app.post("/api/rides/{ride_id}/start")
async def start_ride(ride_id: str):
    get_db().collection("rides").document(ride_id).update({"status": "started", "started_at": datetime.now(timezone.utc)})
    return {"status": "success"}

@app.post("/api/rides/{ride_id}/complete")
async def complete_ride(ride_id: str):
    get_db().collection("rides").document(ride_id).update({"status": "completed", "completed_at": datetime.now(timezone.utc)})
    return {"status": "success"}

# --- POLLING ROUTES ---
@app.get("/api/driver/rides/available")
async def get_available_rides():
    docs = get_db().collection("rides").where("status", "==", "searching").stream()
    return {"rides": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}

@app.get("/api/rides/{ride_id}")
async def get_ride_details(ride_id: str):
    doc = get_db().collection("rides").document(ride_id).get()
    return serialize_firestore_data({**doc.to_dict(), "id": doc.id}) if doc.exists else {"error": "Not found"}

# --- SYSTEM ROUTES ---
@app.get("/api/surge/status")
async def surge_status(lat: float = 0, lng: float = 0): return {"multiplier": 1.0}

@app.post("/api/rides/request")
async def request_ride(req: Request):
    data = await req.json()
    ref = get_db().collection("rides").document()
    data["id"] = ref.id; data["status"] = "searching"
    ref.set(data)
    return {"ride_id": ref.id}

@app.get("/api/health")
async def health(): return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
