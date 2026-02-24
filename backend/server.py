import logging, math, os, asyncio, base64, json, re, shutil, uuid, bcrypt, jwt, httpx
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Query, Header, Depends, BackgroundTasks, File, UploadFile, Form
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

load_dotenv()
logger = logging.getLogger(__name__)
app = FastAPI(title="T'aksi API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not firebase_admin._apps:
    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
    except:
        firebase_admin.initialize_app()

def get_db(): return firestore.client()

security = HTTPBearer(auto_error=False)
JWT_SECRET = str(os.getenv("JWT_SECRET", "dev_secret_change_me"))
JWT_ALGORITHM = "HS256"

# --- HELPERS ---
def normalize_phone(p): return re.sub(r"[^\d+]", "", str(p).strip())
def serialize_firestore_data(d):
    if isinstance(d, dict): return {k: serialize_firestore_data(v) for k, v in d.items()}
    if isinstance(d, list): return [serialize_firestore_data(v) for v in d]
    if hasattr(d, "timestamp"): return d.isoformat()
    return d

def calculate_fare(dist_km, car_type="economy"):
    rates = {"economy": 1.2, "comfort": 1.5, "suv": 1.8}
    base = 3.0
    total = base + (dist_km * rates.get(car_type, 1.2))
    return {"total": round(total, 2), "base": base, "dist_fare": round(dist_km * 1.2, 2)}

# --- MODELS ---
class LoginRequest(BaseModel):
    cellphone: Optional[str] = None
    email: Optional[str] = None
    password: str

class RideRequest(BaseModel):
    pickup: str; pickup_lat: float; pickup_lng: float
    destination: str; destination_lat: float; destination_lng: float
    car_type: str = "economy"; estimated_distance: float = 0

# --- AUTH ---
@app.post("/api/auth/register/rider")
async def reg_rider(req: dict):
    db = get_db()
    phone = normalize_phone(req.get("cellphone") or req.get("phone") or f"u_{uuid.uuid4().hex[:6]}")
    hashed = bcrypt.hashpw(str(req.get("password","pass")).encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    data = {"name": req.get("name","Test"), "cellphone": phone, "password": hashed, "user_type": "rider", "wallet_balance": 0.0, "created_at": datetime.now(timezone.utc)}
    ref = db.collection("users").document(); ref.set(data)
    return {"status": "success", "user_id": ref.id}

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    db = get_db()
    search = normalize_phone(req.cellphone) if req.cellphone else str(req.email).lower().strip()
    field = "cellphone" if req.cellphone else "email"
    users = list(db.collection("users").where(field, "==", search).limit(1).stream())
    if not users: raise HTTPException(404, "User not found")
    u_doc = users[0]; u_data = u_doc.to_dict()
    token = jwt.encode({"id": str(u_doc.id), "user_type": u_data.get("user_type","rider"), "exp": datetime.now(timezone.utc)+timedelta(days=30)}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    if isinstance(token, bytes): token = token.decode('utf-8')
    return {"status": "success", "token": str(token), "user": serialize_firestore_data({**u_data, "id": u_doc.id})}

# --- RIDER FEATURES ---
@app.get("/api/rider/history")
async def rider_history(): return {"rides": []}

@app.get("/api/rider/active-ride")
async def rider_active(): return None

@app.get("/api/surge/status")
async def surge_status(lat: float = 0, lng: float = 0):
    return {"multiplier": 1.0, "current_day": "Normal", "current_hour": 12}

@app.post("/api/rides/request")
async def request_ride(req: RideRequest):
    db = get_db()
    fare = calculate_fare(req.estimated_distance, req.car_type)
    ride_ref = db.collection("rides").document()
    ride_data = {**req.dict(), "id": ride_ref.id, "status": "searching", "estimated_fare": fare["total"], "created_at": datetime.now(timezone.utc)}
    ride_ref.set(ride_data)
    return {"ride_id": ride_ref.id, "status": "searching", "estimated_fare": fare["total"]}

# --- PAYPAL ---
@app.post("/api/paypal/create-order")
async def paypal_order(req: dict):
    return {"id": f"PAY-{uuid.uuid4().hex[:8]}", "status": "CREATED"}

# --- ADMIN ---
@app.get("/api/admin/dashboard")
async def admin_dash():
    db = get_db()
    r = len(list(db.collection("users").where("user_type","==","rider").stream()))
    d = len(list(db.collection("users").where("user_type","==","driver").stream()))
    return {"total_riders": r, "total_drivers": d, "active_rides": 0, "pending_driver_approvals": 0, "pending_withdrawals": 0, "pending_topups": 0}

@app.get("/api/admin/riders")
async def admin_riders():
    docs = get_db().collection("users").where("user_type","==","rider").stream()
    return {"riders": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}

@app.get("/api/admin/drivers")
async def admin_drivers():
    docs = get_db().collection("users").where("user_type","==","driver").stream()
    return {"drivers": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}

@app.get("/api/health")
async def health(): return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
