import logging, math, os, asyncio, base64, json, re, shutil, uuid, bcrypt, jwt, httpx
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Depends
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
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "")
PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com" if os.getenv("PAYPAL_MODE") != "live" else "https://api-m.paypal.com"

def normalize_phone(p): return re.sub(r"[^\d+]", "", str(p).strip())
def serialize_firestore_data(d):
    if isinstance(d, dict): return {k: serialize_firestore_data(v) for k, v in d.items()}
    if isinstance(d, list): return [serialize_firestore_data(v) for v in d]
    if hasattr(d, "timestamp"): return d.isoformat()
    return d

class LoginRequest(BaseModel):
    cellphone: Optional[str] = None
    email: Optional[str] = None
    password: str

# --- REAL PAYPAL TOKEN FETCHER ---
async def get_paypal_token():
    auth = base64.b64encode(f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{PAYPAL_API_BASE}/v1/oauth2/token", headers={"Authorization": f"Basic {auth}"}, data={"grant_type": "client_credentials"})
        return resp.json().get("access_token")

# --- ROUTES ---
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    db = get_db()
    search = normalize_phone(req.cellphone) if req.cellphone else str(req.email).lower().strip()
    field = "cellphone" if req.cellphone else "email"
    users = list(db.collection("users").where(field, "==", search).limit(1).stream())
    if not users: raise HTTPException(404, "User not found")
    u_doc = users[0]; u_data = u_doc.to_dict()
    token = jwt.encode({"id": str(u_doc.id), "user_type": u_data.get("user_type","rider"), "exp": datetime.now(timezone.utc)+timedelta(days=30)}, JWT_SECRET, algorithm="HS256")
    return {"status": "success", "token": str(token), "user": serialize_firestore_data({**u_data, "id": u_doc.id})}

@app.get("/api/rider/history")
async def rider_history(): return {"rides": []}

@app.get("/api/rider/active-ride")
async def rider_active(): return None

@app.get("/api/surge/status")
async def surge_status(lat: float = 0, lng: float = 0):
    return {"multiplier": 1.0, "current_day": "Normal", "current_hour": 12}

@app.post("/api/rides/request")
@app.post("/api/rides/request/")
async def request_ride(req: dict):
    ride_ref = get_db().collection("rides").document()
    ride_data = {**req, "id": ride_ref.id, "status": "searching", "created_at": datetime.now(timezone.utc)}
    ride_ref.set(ride_data)
    return {"ride_id": ride_ref.id, "status": "searching"}

# --- UPDATED REAL PAYPAL CREATE ORDER ---
@app.post("/api/paypal/create-order")
async def paypal_order(req: dict):
    token = await get_paypal_token()
    if not token: return {"id": f"ORDER-{uuid.uuid4().hex[:8]}", "status": "MOCK_FALLBACK"} # Fallback if no keys
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{PAYPAL_API_BASE}/v2/checkout/orders", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, json={"intent": "CAPTURE", "purchase_units": [{"amount": {"currency_code": "USD", "value": str(req.get("amount", "10.00"))}}]})
        return {"id": resp.json().get("id")}

@app.get("/api/admin/dashboard")
async def admin_dash(): return {"total_riders": 0, "total_drivers": 0}

@app.get("/api/health")
async def health(): return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
