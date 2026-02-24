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

# --- AUTH ---
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    db = get_db()
    search = normalize_phone(req.cellphone) if req.cellphone else str(req.email).lower().strip()
    field = "cellphone" if req.cellphone else "email"
    users = list(db.collection("users").where(field, "==", search).limit(1).stream())
    if not users: raise HTTPException(404, "User not found")
    u_doc = users[0]; u_data = u_doc.to_dict()
    token = jwt.encode({"id": str(u_doc.id), "user_type": u_data.get("user_type","rider"), "exp": datetime.now(timezone.utc)+timedelta(days=30)}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"status": "success", "token": str(token), "user": serialize_firestore_data({**u_data, "id": u_doc.id})}

# --- ADMIN DASHBOARD ROUTES (RESTORED) ---

@app.get("/api/admin/dashboard")
async def admin_dashboard():
    db = get_db()
    riders = list(db.collection("users").where("user_type", "==", "rider").stream())
    drivers = list(db.collection("users").where("user_type", "==", "driver").stream())
    return {
        "total_riders": len(riders),
        "total_drivers": len(drivers),
        "active_rides": 0,
        "pending_driver_approvals": 0,
        "pending_withdrawals": 0,
        "pending_topups": 0,
    }

@app.get("/api/admin/riders")
async def get_all_riders():
    db = get_db()
    docs = db.collection("users").where("user_type", "==", "rider").stream()
    return {"riders": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}

@app.get("/api/admin/drivers")
async def get_all_drivers():
    db = get_db()
    docs = db.collection("users").where("user_type", "==", "driver").stream()
    return {"drivers": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}

@app.get("/api/admin/topups/pending")
async def get_pending_topups():
    return {"pending_topups": []}

@app.get("/api/admin/drivers/pending")
async def get_pending_drivers():
    return {"pending_drivers": []}

@app.get("/api/admin/withdrawals/pending")
async def get_pending_withdrawals():
    return {"pending_withdrawals": []}

@app.get("/api/health")
async def health(): return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
