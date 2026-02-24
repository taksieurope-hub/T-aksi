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
JWT_SECRET = os.getenv("JWT_SECRET", "dev_secret_change_me")
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

@app.post("/api/auth/register/rider")
async def reg_rider(req: dict):
    db = get_db()
    phone = normalize_phone(req.get("cellphone") or req.get("phone") or f"u_{uuid.uuid4().hex[:6]}")
    pw = str(req.get("password") or "pass")
    hashed = bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    data = {"name": req.get("name","Test"), "surname": req.get("surname","User"), "cellphone": phone, "password": hashed, "user_type": "rider", "created_at": datetime.now(timezone.utc)}
    ref = db.collection("users").document(); ref.set(data)
    return {"status": "success", "user_id": ref.id}

@app.post("/api/auth/login/")
@app.post("/api/auth/login")
async def login(req: LoginRequest):
    db = get_db()
    try:
        search = normalize_phone(req.cellphone) if req.cellphone else str(req.email).lower().strip()
        field = "cellphone" if req.cellphone else "email"
        users = list(db.collection("users").where(field, "==", search).limit(1).stream())
        
        if not users: raise HTTPException(404, "User not found")
        
        u_doc = users[0]
        u_data = u_doc.to_dict()
        stored_pw = str(u_data.get('password', ''))
        provided_pw = str(req.password)
        
        match = False
        try:
            if bcrypt.checkpw(provided_pw.encode('utf-8'), stored_pw.encode('utf-8')): match = True
        except:
            if provided_pw == stored_pw: match = True
            
        if not match: raise HTTPException(401, "Invalid password")
        
        token_payload = {
            "id": u_doc.id,
            "user_type": u_data.get("user_type","rider"),
            "exp": datetime.now(timezone.utc) + timedelta(days=30)
        }
        
        # Ensure token is a string
        token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        if isinstance(token, bytes): token = token.decode('utf-8')
        
        return {
            "status": "success",
            "token": token,
            "user": serialize_firestore_data({**u_data, "id": u_doc.id})
        }
    except Exception as e:
        logger.error(f"Login Crash: {str(e)}")
        raise HTTPException(500, detail=str(e))

@app.get("/api/health")
async def health(): return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
