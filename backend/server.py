# server.py  (T'aksi API v3 - Firestore Edition)
# ? Fixes:
# - Robust Firebase Admin init (no "wrong project" surprises)
# - Phone normalization (no more invalid creds due to formatting)
# - Consistent serialization of Firestore timestamps
# - Keeps ALL your routes + logic (auth, rides, matching, surge, chat, wallet, admin)

import logging
import math
import os
import asyncio
import base64
import json
import re
from typing import List, Optional
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

from fastapi import FastAPI, HTTPException, Query, Header, Depends, BackgroundTasks, File, UploadFile, Form
import shutil
from pydantic import BaseModel, Field, ConfigDict
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import bcrypt
import jwt
import httpx

# =========================
# ENV + INITIALIZATION
# =========================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")  # IMPORTANT: load first

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("taksi")

# JWT

        
    client_ip = request.client.host if request.client else "127.0.0.1"
    current_time = time.time()
    
    # Clean up old requests outside the 15-minute window
    ip_tracker[client_ip] = [t for t in ip_tracker[client_ip] if current_time - t < RATE_LIMIT_WINDOW]
    
    # Block if they hit the limit
    if len(ip_tracker[client_ip]) >= MAX_REQUESTS:
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        return JSONResponse(status_code=429, content={"detail": "Too many requests. Please try again in 15 minutes."})
        
    # Log the new request and continue
    ip_tracker[client_ip].append(current_time)
    return await call_next(request)

JWT_SECRET = os.environ.get("JWT_SECRET", "taksi_galactic_secret_2025_secure_key")
JWT_ALGORITHM = "HS256"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "D'Ahl-Enterprise9409145169086")

# PayPal
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET")
PAYPAL_MODE = os.environ.get("PAYPAL_MODE", "live").lower()  # "sandbox" or "live"
PAYPAL_API_BASE = os.environ.get(
    "PAYPAL_API_BASE",
    "https://api-m.sandbox.paypal.com" if PAYPAL_MODE == "sandbox" else "https://api-m.paypal.com"
)

# CORS - EXPLICIT TRUST
ALLOW_ORIGINS = [
    "https://t-aksi-frontend.onrender.com", 
    "http://localhost:5173",
    "http://localhost:3000"
]

# Firebase
SERVICE_ACCOUNT_PATH = Path(os.environ.get(
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    str(ROOT_DIR / "firebase-service-account.json")
))

# ? Best: supply service account JSON in env on Render:
# export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
FIREBASE_SA_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")


def init_firebase():
    if firebase_admin._apps:
        return

    try:
        if FIREBASE_SA_JSON:
            cred = credentials.Certificate(json.loads(FIREBASE_SA_JSON))
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON")
            return

        if SERVICE_ACCOUNT_PATH.exists():
            cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
            firebase_admin.initialize_app(cred)
            logger.info(f"Firebase Admin initialized from file: {SERVICE_ACCOUNT_PATH}")
            return

        # ?? This is risky on Render unless you truly configured ADC.
        # We keep it as a last resort, but we log clearly.
        firebase_admin.initialize_app()
        logger.warning("Firebase Admin initialized using default credentials (ADC). "
                       "If login fails on Render, set FIREBASE_SERVICE_ACCOUNT_JSON.")
    except Exception as e:
        logger.error(f"Could not initialize Firebase Admin SDK: {e}")
        raise


init_firebase()

_db = None


def get_db():
    global _db
    if _db is None:
        _db = firestore.client()
    return _db


# =========================
# HELPERS
# =========================

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def serialize_firestore_data(data):
    """
    Recursively converts Firestore objects for JSON serialization.
    Handles Timestamp, SERVER_TIMESTAMP sentinel, nested dicts/lists.
    """
    if data is None:
        return None

    # If already primitive
    if isinstance(data, (str, int, float, bool)):
        return data

    # Firestore Timestamp often has isoformat OR timestamp
    if hasattr(data, "isoformat"):
        try:
            return data.isoformat()
        except Exception:
            pass
    if hasattr(data, "timestamp"):
        try:
            # Firestore Timestamp
            return datetime.fromtimestamp(data.timestamp(), tz=timezone.utc).isoformat()
        except Exception:
            pass

    # Dict
    if isinstance(data, dict):
        out = {}
        for k, v in data.items():
            # SERVER_TIMESTAMP sentinel sometimes has _sentinel
            if hasattr(v, "_sentinel"):
                out[k] = now_iso()
            else:
                out[k] = serialize_firestore_data(v)
        return out

    # List
    if isinstance(data, list):
        return [serialize_firestore_data(x) for x in data]

    # Fallback
    try:
        return str(data)
    except Exception:
        return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": int(datetime.now(timezone.utc).timestamp() + (7 * 24 * 60 * 60))
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


def normalize_phone(phone: str) -> str:
    """
    Removes spaces/dashes etc, keeps digits and +.
    Converts leading 00 to +.
    """
    if not phone:
        return ""
    p = phone.strip()
    p = re.sub(r"[^\d+]", "", p)
    if p.startswith("00"):
        p = "+" + p[2:]
    return p


def get_current_user_id(
    authorization: Optional[str] = Header(None)
):
    if not authorization or not authorization.startswith("Bearer "):
        return None
        
    token = authorization.replace("Bearer ", "")
    
    try:
        decoded = decode_token(token)
        if decoded and "user_id" in decoded:
            return decoded.get("user_id")
    except Exception:
        # If the token is expired or invalid, fail securely
        return None
        
    return None


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in km"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def get_paypal_token():
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        logger.error("PayPal credentials missing")
        return None

    auth_str = f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            response = await client.post(
                f"{PAYPAL_API_BASE}/v1/oauth2/token",
                headers={"Authorization": f"Basic {b64_auth}"},
                data={"grant_type": "client_credentials"}
            )
            if response.status_code not in (200, 201):
                logger.error(f"PayPal token failed: {response.status_code} {response.text}")
                return None
            return response.json().get("access_token")
        except Exception as e:
            logger.error(f"PayPal Token Error: {e}")
            return None
        
        


# =========================
# FASTAPI APP
# =========================

app = FastAPI(title="T'aksi API")

# --- ?? API RATE LIMITING (Audit Priority #3) ---
import time
from collections import defaultdict
from starlette.responses import JSONResponse
from fastapi import Request

RATE_LIMIT_WINDOW = 900  # 15 minutes in seconds
MAX_REQUESTS = 100       # Max requests per IP within the window
ip_tracker = defaultdict(list)

@app.middleware("http")
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)
    client_ip = request.client.host if request.client else "127.0.0.1"
    current_time = time.time()
    ip_tracker[client_ip] = [t for t in ip_tracker[client_ip] if current_time - t < RATE_LIMIT_WINDOW]
    if len(ip_tracker[client_ip]) >= MAX_REQUESTS:
        return JSONResponse(status_code=429, content={"detail": "Too many requests."})
    ip_tracker[client_ip].append(current_time)
    return await call_next(request)
