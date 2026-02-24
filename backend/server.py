# server.py (Taksi API - FINAL STABLE VERSION)
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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

def get_db(): return firestore.client()

security = HTTPBearer(auto_error=False)
JWT_SECRET = os.getenv("JWT_SECRET", os.getenv("SECRET_KEY", "dev_secret_change_me"))
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

def normalize_phone(p): return re.sub(r"[^\d+]", "", str(p).strip())
def serialize_firestore_data(d):
    if isinstance(d, dict): return {k: serialize_firestore_data(v) for k, v in d.items()}
    if isinstance(d, list): return [serialize_firestore_data(v) for v in d]
    if hasattr(d, "timestamp"): return d.isoformat()
    return d

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds: raise HTTPException(401, "Not authenticated")
    try:
        p = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"verify_signature": False})
        uid = p.get("id") or p.get("sub") or p.get("user_id")
        doc = get_db().collection("users").document(uid).get()
        if not doc.exists: raise HTTPException(401, "User not found")
        data = doc.to_dict(); data["id"] = uid
        return data
    except: raise HTTPException(401, "Invalid token")

async def get_current_user_id(curr = Depends(get_current_user)): return curr["id"]

class LoginRequest(BaseModel):
    cellphone: Optional[str] = None
    email: Optional[str] = None
    password: str

@app.post("/api/auth/register/rider")
async def reg_rider(req: dict):
    db = get_db()
    phone = normalize_phone(req.get("cellphone") or req.get("phone") or f"u_{uuid.uuid4().hex[:6]}")
    hashed = bcrypt.hashpw((req.get("password") or "pass").encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    data = {"name": req.get("name","Test"), "surname": req.get("surname","User"), "cellphone": phone, "password": hashed, "user_type": "rider", "created_at": datetime.now(timezone.utc)}
    ref = db.collection("users").document(); ref.set(data)
    return {"status": "success", "user_id": ref.id}

@app.post("/api/auth/login/")
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    db = get_db()
    search = normalize_phone(req.cellphone) if req.cellphone else req.email.lower().strip()
    field = "cellphone" if req.cellphone else "email"
    users = list(db.collection("users").where(field, "==", search).limit(1).stream())
    if not users: raise HTTPException(404, "User not found")
    u_doc = users[0]; u_data = u_doc.to_dict()
    match = False
    try:
        if bcrypt.checkpw(req.password.encode('utf-8'), u_data['password'].encode('utf-8')): match = True
    except:
        if req.password == u_data['password']: match = True
    if not match: raise HTTPException(401, "Invalid password")
    token = jwt.encode({"id": u_doc.id, "user_type": u_data.get("user_type","rider"), "exp": datetime.now(timezone.utc)+timedelta(days=30)}, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {"status": "success", "token": token, "user": serialize_firestore_data({**u_data, "id": u_doc.id})}

@app.get("/api/health")
async def health(): return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
