import logging, math, os, asyncio, base64, json, re, shutil, uuid, bcrypt, jwt, httpx
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Request
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
def serialize_firestore_data(d):
    if isinstance(d, dict): return {k: serialize_firestore_data(v) for k, v in d.items()}
    if isinstance(d, list): return [serialize_firestore_data(v) for v in d]
    if hasattr(d, "timestamp"): return d.isoformat()
    return d

# --- ADMIN POWER: SEARCH & WALLET ---

@app.get("/api/admin/users/search")
async def search_users(q: str):
    db = get_db()
    # We search by phone exactly or try to match names (case-insensitive search in Firestore is limited, so we fetch and filter)
    docs = db.collection("users").stream()
    query = q.lower()
    results = []
    for d in docs:
        u = d.to_dict()
        name = f"{u.get('name', '')} {u.get('surname', '')}".lower()
        phone = str(u.get('cellphone', ''))
        if query in name or query in phone:
            results.append(serialize_firestore_data({**u, "id": d.id}))
    return {"users": results[:20]} # Limit to top 20 matches

@app.post("/api/admin/drivers/{driver_id}/wallet/deduct")
async def deduct_funds(driver_id: str, req: Request):
    db = get_db()
    data = await req.json()
    amount = float(data.get("amount", 0))
    reason = data.get("reason", "Admin deduction")
    
    doc_ref = db.collection("users").document(driver_id)
    doc = doc_ref.get()
    if not doc.exists: raise HTTPException(404, "Driver not found")
    
    current_balance = float(doc.to_dict().get("wallet_balance", 0))
    new_balance = current_balance - amount
    
    # Update balance and log the transaction
    doc_ref.update({"wallet_balance": new_balance})
    db.collection("transactions").add({
        "user_id": driver_id,
        "amount": -amount,
        "type": "admin_deduction",
        "reason": reason,
        "timestamp": datetime.now(timezone.utc)
    })
    return {"status": "success", "new_balance": new_balance}

# --- EXISTING ROUTES (KEEPING YOUR API ALIVE) ---
@app.post("/api/auth/login")
async def login(req: dict):
    db = get_db()
    users = list(db.collection("users").where("cellphone", "==", str(req.get("cellphone",""))).limit(1).stream())
    if not users: raise HTTPException(404, "User not found")
    u_doc = users[0]; u_data = u_doc.to_dict()
    token = jwt.encode({"id": str(u_doc.id), "user_type": u_data.get("user_type","admin")}, "dev_secret", algorithm="HS256")
    return {"status": "success", "token": str(token), "user": serialize_firestore_data({**u_data, "id": u_doc.id})}

@app.get("/api/admin/dashboard")
async def admin_dash(): return {"total_riders": 0, "total_drivers": 0}

@app.get("/api/health")
async def health(): return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
