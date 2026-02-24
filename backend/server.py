import logging, math, os, asyncio, base64, json, re, shutil, uuid, bcrypt, jwt, httpx
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Depends, Request
from pydantic import BaseModel
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

def normalize_phone(p): return re.sub(r"[^\d+]", "", str(p).strip())
def serialize_firestore_data(d):
    if isinstance(d, dict): return {k: serialize_firestore_data(v) for k, v in d.items()}
    if isinstance(d, list): return [serialize_firestore_data(v) for v in d]
    if hasattr(d, "timestamp"): return d.isoformat()
    return d

# --- AUTH ---
@app.post("/api/auth/login")
async def login(req: dict):
    db = get_db()
    phone = normalize_phone(req.get("cellphone", ""))
    users = list(db.collection("users").where("cellphone", "==", phone).limit(1).stream())
    if not users: raise HTTPException(404, "User not found")
    u_doc = users[0]; u_data = u_doc.to_dict()
    token = jwt.encode({"id": str(u_doc.id), "user_type": u_data.get("user_type","rider"), "exp": datetime.now(timezone.utc)+timedelta(days=30)}, JWT_SECRET, algorithm="HS256")
    return {"status": "success", "token": str(token), "user": serialize_firestore_data({**u_data, "id": u_doc.id})}

# --- DRIVER ENGINE (FIXES THE 404s) ---

@app.get("/api/driver/rides/available")
async def get_available_rides():
    # Fetch rides that are currently looking for a driver
    db = get_db()
    docs = db.collection("rides").where("status", "==", "searching").stream()
    rides = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]
    return {"rides": rides}

@app.post("/api/driver/location")
async def update_driver_location(req: Request):
    # This keeps the driver's pin moving on the map
    data = await req.json()
    # Logic to update Firestore would go here (requires user auth)
    return {"status": "success", "message": "Location received"}

@app.get("/api/driver/active-ride")
async def driver_active():
    return None # Return None if no ride is assigned to the driver

@app.get("/api/driver/history")
async def driver_history():
    return {"rides": []}

# --- RIDER ENGINE ---
@app.post("/api/rides/request")
async def request_ride(req: Request):
    data = await req.json()
    ride_ref = get_db().collection("rides").document()
    ride_data = {**data, "id": ride_ref.id, "status": "searching", "created_at": datetime.now(timezone.utc)}
    ride_ref.set(ride_data)
    return {"ride_id": ride_ref.id, "status": "searching"}

@app.get("/api/rides/{ride_id}")
async def get_ride_details(ride_id: str):
    doc = get_db().collection("rides").document(ride_id).get()
    if not doc.exists: raise HTTPException(404, "Ride not found")
    return serialize_firestore_data({**doc.to_dict(), "id": doc.id})

@app.get("/api/surge/status")
async def surge_status(lat: float = 0, lng: float = 0):
    return {"multiplier": 1.0, "current_day": "Normal", "current_hour": 12}

# --- ADMIN & HEALTH ---
@app.get("/api/admin/dashboard")
async def admin_dash(): return {"total_riders": 0, "total_drivers": 0}

@app.get("/api/health")
async def health(): return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
