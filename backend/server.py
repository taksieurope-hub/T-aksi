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
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("taksi")

JWT_SECRET = os.environ.get("JWT_SECRET", "taksi_galactic_secret_2025_secure_key")
JWT_ALGORITHM = "HS256"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

if not ADMIN_PASSWORD:
    raise RuntimeError("ADMIN_PASSWORD environment variable is not set")

# PayPal — reads PAYPAL_MODE from .env; defaults to "live"
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET")
PAYPAL_MODE = os.environ.get("PAYPAL_MODE", "live").lower()

if PAYPAL_MODE == "sandbox":
    PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com"
    logger.warning("PayPal is running in SANDBOX mode — switch PAYPAL_MODE=live before launch")
else:
    PAYPAL_API_BASE = "https://api-m.paypal.com"
    logger.info("PayPal is running in LIVE mode")

# CORS
ALLOW_ORIGINS = [
    "https://t-aksi-frontend.onrender.com",
    "http://localhost:5173",
    "http://localhost:3000",
]

# Firebase
SERVICE_ACCOUNT_PATH = Path(os.environ.get(
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    str(ROOT_DIR / "firebase-service-account.json")
))
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
        firebase_admin.initialize_app()
        logger.warning("Firebase Admin initialized using default credentials (ADC).")
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
    if data is None:
        return None
    if isinstance(data, (str, int, float, bool)):
        return data
    if hasattr(data, "isoformat"):
        try:
            return data.isoformat()
        except Exception:
            pass
    if hasattr(data, "timestamp"):
        try:
            return datetime.fromtimestamp(data.timestamp(), tz=timezone.utc).isoformat()
        except Exception:
            pass
    if isinstance(data, dict):
        out = {}
        for k, v in data.items():
            if hasattr(v, "_sentinel"):
                out[k] = now_iso()
            else:
                out[k] = serialize_firestore_data(v)
        return out
    if isinstance(data, list):
        return [serialize_firestore_data(x) for x in data]
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
        "exp": int(datetime.now(timezone.utc).timestamp()) + (7 * 24 * 60 * 60),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


def normalize_phone(phone: str) -> str:
    if not phone:
        return ""
    p = phone.strip()
    p = re.sub(r"[^\d+]", "", p)
    if p.startswith("00"):
        p = "+" + p[2:]
    return p


def get_current_user_id(authorization: Optional[str] = Header(None)) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    try:
        decoded = decode_token(token)
        if decoded and "user_id" in decoded:
            return decoded.get("user_id")
    except Exception:
        return None
    return None


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def get_paypal_token() -> Optional[str]:
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        logger.error("PayPal credentials missing — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env")
        return None

    auth_str = f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            response = await client.post(
                f"{PAYPAL_API_BASE}/v1/oauth2/token",
                headers={"Authorization": f"Basic {b64_auth}"},
                data={"grant_type": "client_credentials"},
            )
            if response.status_code not in (200, 201):
                logger.error(f"PayPal token request failed: {response.status_code}")
                return None
            return response.json().get("access_token")
        except Exception as e:
            logger.error(f"PayPal token error: {e}")
            return None


# =========================
# FASTAPI APP
# =========================

app = FastAPI(title="T'aksi API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origins=[
        "http://localhost:5173",
        "https://t-aksi-frontend.onrender.com",
        "https://taksi-admin.onrender.com", 
    ],
)

# --- RATE LIMITING ---
import time
from collections import defaultdict
from starlette.responses import JSONResponse
from fastapi import Request

# General rate limit: 100 requests per 15 minutes per IP
RATE_LIMIT_WINDOW = 900       # 15 minutes
MAX_REQUESTS = 100

# Strict rate limit for auth endpoints: 10 attempts per 15 minutes per IP
AUTH_RATE_LIMIT_WINDOW = 900
AUTH_MAX_REQUESTS = 10

ip_tracker: dict = defaultdict(list)
auth_ip_tracker: dict = defaultdict(list)

AUTH_PATHS = {"/api/auth/login", "/api/rider/login", "/api/driver/login", "/api/auth/register/rider", "/api/auth/register/driver", "/api/driver/register"}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.url.path == "/api/health":
        return await call_next(request)

    client_ip = request.client.host if request.client else "127.0.0.1"
    current_time = time.time()
    path = request.url.path

    # Strict limiter for auth endpoints
    if path in AUTH_PATHS:
        auth_ip_tracker[client_ip] = [
            t for t in auth_ip_tracker[client_ip] if current_time - t < AUTH_RATE_LIMIT_WINDOW
        ]
        if len(auth_ip_tracker[client_ip]) >= AUTH_MAX_REQUESTS:
            logger.warning(f"Auth rate limit exceeded for IP: {client_ip}")
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many login attempts. Please try again in 15 minutes."},
            )
        auth_ip_tracker[client_ip].append(current_time)

    # General limiter for all endpoints
    ip_tracker[client_ip] = [t for t in ip_tracker[client_ip] if current_time - t < RATE_LIMIT_WINDOW]
    if len(ip_tracker[client_ip]) >= MAX_REQUESTS:
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again in 15 minutes."},
        )
    ip_tracker[client_ip].append(current_time)

    return await call_next(request)


# =========================
# MODELS
# =========================

class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    surname: str = Field(min_length=1, max_length=100)
    cellphone: str = Field(min_length=6, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    email: Optional[str] = None


class UserLogin(BaseModel):
    cellphone: str = Field(min_length=6, max_length=20)
    password: str = Field(min_length=1, max_length=128)


class VehicleInfo(BaseModel):
    car_make: str
    car_model: str
    car_year: int = Field(ge=1990, le=2030)
    car_color: str
    license_plate: str


class StopLocation(BaseModel):
    address: str
    lat: float
    lng: float
    order: int = 0


class RideRequest(BaseModel):
    user_id: Optional[str] = Field(None, alias="userId")
    car_type: Optional[str] = Field("economy", alias="carType")
    pickup: str
    pickup_lat: float = Field(alias="pickupLat")
    pickup_lng: float = Field(alias="pickupLng")
    destination: Optional[str] = None
    destination_lat: Optional[float] = Field(None, alias="destinationLat")
    destination_lng: Optional[float] = Field(None, alias="destinationLng")
    stops: List[StopLocation] = []
    payment_method: Optional[str] = Field("cash", alias="paymentMethod")
    payment_order_id: Optional[str] = Field(None, alias="paymentOrderId")
    estimated_distance: Optional[float] = Field(0, alias="estimatedDistance")
    estimated_duration: Optional[int] = Field(0, alias="estimatedDuration")

    model_config = ConfigDict(populate_by_name=True)


class RiderWalletTopUp(BaseModel):
    amount: float = Field(gt=0, le=10000)
    reference: Optional[str] = None


class TopUpRequest(BaseModel):
    amount: float = Field(gt=0, le=10000)
    payment_reference: Optional[str] = None


class WithdrawalRequest(BaseModel):
    amount: float = Field(gt=0)
    bank_details: str


class AdminAddBalanceRequest(BaseModel):
    amount: float
    reason: Optional[str] = "Admin Adjustment"


class AdminRefundRequest(BaseModel):
    driver_id: str
    rider_id: str
    amount: float
    reason: str


class LocationUpdate(BaseModel):
    lat: float
    lng: float
    heading: Optional[float] = None
    speed: Optional[float] = None


class RatePassengerRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    review: Optional[str] = ""


class RateDriverRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    review: Optional[str] = ""


class ChatMessage(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class UpdateRideFare(BaseModel):
    distance_km: float
    wait_minutes: int = 0
    stop_wait_minutes: int = 0


class WithdrawRequest(BaseModel):
    driver_id: str
    amount: float = Field(gt=0)
    bank_details: str


class PayPalTopUpRequest(BaseModel):
    order_id: str
    amount: float = Field(gt=0, le=10000)


# =========================
# PRICING + SURGE
# =========================

PRICING_RULES = {
    "economy": {
        "base": 2.00,
        "per_km": 0.50,
        "per_minute_wait": 0.50,
        "free_wait_minutes": 2,
        "stop_fee": 0.00,
        "long_distance_threshold": 7.0,
        "long_distance_fee_per_km": 0.15,
        "very_long_threshold": 30.0,
        "very_long_surcharge_per_15km": 5.00,
    },
    "comfort": {
        "base": 2.50,
        "per_km": 0.55,
        "per_minute_wait": 0.50,
        "free_wait_minutes": 2,
        "stop_fee": 0.00,
        "long_distance_threshold": 7.0,
        "long_distance_fee_per_km": 0.18,
        "very_long_threshold": 30.0,
        "very_long_surcharge_per_15km": 6.00,
    },
    "suv": {
        "base": 3.90,
        "per_km": 0.80,
        "per_minute_wait": 0.50,
        "free_wait_minutes": 2,
        "stop_fee": 0.00,
        "long_distance_threshold": 7.0,
        "long_distance_fee_per_km": 0.25,
        "very_long_threshold": 30.0,
        "very_long_surcharge_per_15km": 8.00,
    },
    "personal": {
        "base": 4.00,
        "per_km": 0.70,
        "per_minute_wait": 0.50,
        "free_wait_minutes": 2,
        "stop_fee": 0.00,
        "long_distance_threshold": 7.0,
        "long_distance_fee_per_km": 0.20,
        "very_long_threshold": 30.0,
        "very_long_surcharge_per_15km": 7.00,
    },
    "jumpstart": {
        "base": 4.50,
        "per_km": 0.00,
        "per_minute_wait": 0.50,
        "free_wait_minutes": 999,
        "stop_fee": 0.00,
        "long_distance_threshold": 999.0,
        "long_distance_fee_per_km": 0.00,
        "very_long_threshold": 999.0,
        "very_long_surcharge_per_15km": 0.00,
    },
}

DRIVER_COMMISSION_RATE = 0.23

SURGE_SCHEDULE = {
    2: {"start": 18, "end": 26},   # Wednesday 18:00 → 02:00
    4: {"start": 18, "end": 28},   # Friday 18:00 → 04:00
    5: {"start": 18, "end": 28},   # Saturday 18:00 → 04:00
}

SURGE_LEVELS = {
    1.0: 0.230,
    1.2: 0.232,
    1.5: 0.235,
    1.8: 0.238,
    2.0: 0.240,
}


def is_surge_time() -> bool:
    now = datetime.now(timezone.utc)
    georgia_hour = (now.hour + 4) % 24
    weekday = now.weekday()

    if weekday in SURGE_SCHEDULE:
        schedule = SURGE_SCHEDULE[weekday]
        if schedule["end"] > 24:
            if georgia_hour >= schedule["start"] or georgia_hour < (schedule["end"] - 24):
                return True
        else:
            if schedule["start"] <= georgia_hour < schedule["end"]:
                return True

    prev_weekday = (weekday - 1) % 7
    if prev_weekday in SURGE_SCHEDULE:
        schedule = SURGE_SCHEDULE[prev_weekday]
        if schedule["end"] > 24 and georgia_hour < (schedule["end"] - 24):
            return True

    return False


def get_area_demand(lat: float, lng: float) -> float:
    db = get_db()
    try:
        active_rides = list(
            db.collection("rides")
            .where("status", "in", ["searching", "accepted", "arrived", "in_progress"])
            .stream()
        )

        nearby_rides = 0
        for ride in active_rides:
            ride_data = ride.to_dict()
            ride_lat = ride_data.get("pickup_lat")
            ride_lng = ride_data.get("pickup_lng")
            if ride_lat and ride_lng:
                dist = haversine_distance(lat, lng, ride_lat, ride_lng)
                if dist <= 5:
                    nearby_rides += 1

        online_drivers = list(
            db.collection("users")
            .where("user_type", "==", "driver")
            .where("is_online", "==", True)
            .stream()
        )

        nearby_drivers = 0
        for driver in online_drivers:
            driver_data = driver.to_dict()
            driver_loc = driver_data.get("current_location")
            if driver_loc and driver_loc.get("lat"):
                dist = haversine_distance(lat, lng, driver_loc["lat"], driver_loc["lng"])
                if dist <= 5:
                    nearby_drivers += 1

        if nearby_drivers == 0:
            demand = 1.0 if nearby_rides > 0 else 0.0
        else:
            demand = min(1.0, nearby_rides / max(1, nearby_drivers * 2))

        return demand

    except Exception as e:
        logger.warning(f"Error calculating area demand: {e}")
        return 0.3


def get_surge_multiplier(lat: float = None, lng: float = None) -> dict:
    if not is_surge_time():
        return {
            "multiplier": 1.0,
            "commission_rate": DRIVER_COMMISSION_RATE,
            "is_surge": False,
            "surge_reason": None,
        }

    demand = 0.5
    if lat and lng:
        demand = get_area_demand(lat, lng)

    if demand >= 0.75:
        multiplier = 2.0
        reason = "Very high demand"
    elif demand >= 0.5:
        multiplier = 1.8
        reason = "High demand"
    elif demand >= 0.25:
        multiplier = 1.5
        reason = "Moderate demand"
    else:
        multiplier = 1.2
        reason = "Surge hours"

    commission_rate = SURGE_LEVELS.get(multiplier, DRIVER_COMMISSION_RATE)

    return {
        "multiplier": multiplier,
        "commission_rate": commission_rate,
        "is_surge": True,
        "surge_reason": reason,
        "demand_level": round(demand, 2),
    }


def calculate_fare(
    car_type: str,
    distance_km: float,
    wait_minutes: int = 0,
    stop_wait_minutes: int = 0,
    num_stops: int = 0,
    surge_multiplier: float = 1.0,
) -> dict:
    rules = PRICING_RULES.get(car_type, PRICING_RULES["economy"])

    base_fare = rules["base"]
    distance_fare = distance_km * rules["per_km"]

    long_distance_fee = 0.0
    if distance_km > rules["long_distance_threshold"]:
        extra_km = distance_km - rules["long_distance_threshold"]
        long_distance_fee = extra_km * rules["long_distance_fee_per_km"]

    very_long_surcharge = 0.0
    if distance_km > rules["very_long_threshold"]:
        extra_km = distance_km - rules["very_long_threshold"]
        num_blocks = math.ceil(extra_km / 15)
        very_long_surcharge = num_blocks * rules["very_long_surcharge_per_15km"]

    pickup_wait_fee = 0.0
    billable_wait = max(0, wait_minutes - rules["free_wait_minutes"])
    if billable_wait > 0:
        pickup_wait_fee = billable_wait * rules["per_minute_wait"]

    stop_wait_fee = stop_wait_minutes * rules["per_minute_wait"]
    stop_fee = num_stops * rules["stop_fee"]

    subtotal = (
        base_fare
        + distance_fare
        + long_distance_fee
        + very_long_surcharge
        + pickup_wait_fee
        + stop_wait_fee
        + stop_fee
    )

    surge_fee = 0.0
    if surge_multiplier > 1.0:
        surge_fee = subtotal * (surge_multiplier - 1.0)

    total = subtotal + surge_fee

    return {
        "base": round(base_fare, 2),
        "distance": round(distance_fare, 2),
        "long_distance": round(long_distance_fee, 2),
        "very_long_surcharge": round(very_long_surcharge, 2),
        "pickup_wait": round(pickup_wait_fee, 2),
        "stop_wait": round(stop_wait_fee, 2),
        "stop_fee": round(stop_fee, 2),
        "subtotal": round(subtotal, 2),
        "surge_fee": round(surge_fee, 2),
        "surge_multiplier": surge_multiplier,
        "base_total": round(total, 2),
        "total": round(total, 2),
        "breakdown": {
            "distance_km": round(distance_km, 2),
            "wait_minutes": wait_minutes,
            "stop_wait_minutes": stop_wait_minutes,
            "num_stops": num_stops,
            "free_wait_minutes": rules["free_wait_minutes"],
        },
    }


# =========================
# AUTH ROUTES
# =========================

@app.post("/api/auth/register/rider", tags=["Auth"])
async def register_rider(data: UserRegister):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

    existing = list(
        db.collection("users").where("cellphone_norm", "==", phone_norm).limit(1).stream()
    )
    if existing:
        raise HTTPException(400, "Phone number already registered")

    user_ref = db.collection("users").document()
    user_data = {
        "id": user_ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "cellphone_norm": phone_norm,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "user_type": "rider",
        "wallet_balance": 0.0,
        "total_rides": 0,
        "rating": 5.0,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    user_ref.set(user_data)

    token = create_token(user_ref.id, "rider")
    safe_user = {
        "id": user_ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "cellphone_norm": phone_norm,
        "email": data.email,
        "user_type": "rider",
        "wallet_balance": 0.0,
        "total_rides": 0,
        "rating": 5.0,
        "created_at": now_iso(),
    }
    return {"token": token, "user": safe_user}


@app.post("/api/auth/register/driver", tags=["Auth"])
@app.post("/api/driver/register", tags=["Auth"])
async def register_driver(data: UserRegister):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

    existing = list(
        db.collection("users").where("cellphone_norm", "==", phone_norm).limit(1).stream()
    )
    if existing:
        raise HTTPException(400, "Phone number already registered")

    user_ref = db.collection("users").document()
    user_data = {
        "id": user_ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "cellphone_norm": phone_norm,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "user_type": "driver",
        "registration_status": "pending_vehicle",
        "is_online": False,
        "current_location": None,
        "driver_info": {"vehicle": None, "vehicle_tier": None},
        "earnings": {
            "balance": 0.0,
            "total_earned": 0.0,
            "total_topped_up": 0.0,
            "total_withdrawn": 0.0,
            "total_commission_paid": 0.0,
        },
        "total_rides": 0,
        "rating": 5.0,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    user_ref.set(user_data)

    token = create_token(user_ref.id, "driver")
    safe_user = {
        "id": user_ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "cellphone_norm": phone_norm,
        "email": data.email,
        "user_type": "driver",
        "registration_status": "pending_vehicle",
        "is_online": False,
        "current_location": None,
        "driver_info": {"vehicle": None, "vehicle_tier": None},
        "earnings": user_data["earnings"],
        "total_rides": 0,
        "rating": 5.0,
        "created_at": now_iso(),
    }
    return {"token": token, "user": safe_user}


@app.post("/api/auth/login", tags=["Auth"])
@app.post("/api/rider/login", tags=["Auth"])
async def login(data: UserLogin):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

    users = list(
        db.collection("users").where("cellphone_norm", "==", phone_norm).limit(1).stream()
    )
    if not users:
        users = list(
            db.collection("users").where("cellphone", "==", data.cellphone).limit(1).stream()
        )
    if not users:
        raise HTTPException(401, "Invalid credentials")

    user_doc = users[0]
    user_data = user_doc.to_dict()

    if not verify_password(data.password, user_data.get("password_hash", "")):
        raise HTTPException(401, "Invalid credentials")

    token = create_token(user_doc.id, user_data.get("user_type", "rider"))
    safe_user = {k: v for k, v in user_data.items() if k != "password_hash"}
    safe_user["id"] = user_doc.id
    return {"token": token, "user": serialize_firestore_data(safe_user)}


@app.post("/api/driver/login", tags=["Auth"])
async def driver_login(data: UserLogin):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

    users = list(
        db.collection("users")
        .where("cellphone_norm", "==", phone_norm)
        .where("user_type", "==", "driver")
        .limit(1)
        .stream()
    )
    if not users:
        users = list(
            db.collection("users")
            .where("cellphone", "==", data.cellphone)
            .where("user_type", "==", "driver")
            .limit(1)
            .stream()
        )
    if not users:
        raise HTTPException(401, "Invalid credentials or not a driver account")

    user_doc = users[0]
    user_data = user_doc.to_dict()

    if not verify_password(data.password, user_data.get("password_hash", "")):
        raise HTTPException(401, "Invalid credentials")

    token = create_token(user_doc.id, "driver")
    safe_user = {k: v for k, v in user_data.items() if k != "password_hash"}
    safe_user["id"] = user_doc.id
    return {"token": token, "user": serialize_firestore_data(safe_user)}


@app.get("/api/auth/me", tags=["Auth"])
async def get_current_user(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "User not found")
    user_data = doc.to_dict()
    safe_user = {k: v for k, v in user_data.items() if k != "password_hash"}
    safe_user["id"] = doc.id
    return serialize_firestore_data(safe_user)


# =========================
# DRIVER ROUTES
# =========================

import uuid


@app.post("/api/driver/wallet/topup/paypal", tags=["Driver"])
async def driver_topup_paypal(req: PayPalTopUpRequest, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    access_token = await get_paypal_token()
    if not access_token:
        raise HTTPException(500, "PayPal authentication failed — check credentials in .env")

    async with httpx.AsyncClient(timeout=25) as client:
        resp = await client.get(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{req.order_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(400, "Invalid PayPal order ID")

        data = resp.json()
        order_status = data.get("status")
        if order_status not in ("COMPLETED", "APPROVED"):
            raise HTTPException(400, f"PayPal payment not completed (status: {order_status})")

        try:
            pp_amount = float(
                data["purchase_units"][0]["amount"]["value"]
            )
            if abs(pp_amount - req.amount) > 0.01:
                logger.warning(
                    f"PayPal amount mismatch: claimed={req.amount}, actual={pp_amount}, user={user_id}"
                )
                raise HTTPException(400, "Payment amount mismatch")
        except (KeyError, IndexError, TypeError):
            logger.warning(f"Could not verify PayPal amount for order {req.order_id}")

    db = get_db()

    existing = list(
        db.collection("wallet_transactions")
        .where("order_id", "==", req.order_id)
        .limit(1)
        .stream()
    )
    if existing:
        raise HTTPException(409, "This PayPal order has already been processed")

    db.collection("users").document(user_id).update({
        "earnings.balance": firestore.Increment(req.amount),
        "earnings.total_topped_up": firestore.Increment(req.amount),
    })

    db.collection("wallet_transactions").add({
        "driver_id": user_id,
        "type": "driver_paypal_topup",
        "amount": req.amount,
        "order_id": req.order_id,
        "paypal_mode": PAYPAL_MODE,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Successfully added ₾{req.amount:.2f} to wallet"}


@app.post("/api/driver/vehicle", tags=["Driver"])
async def register_vehicle(
    car_make: str = Form(...),
    car_model: str = Form(...),
    car_year: int = Form(...),
    car_color: str = Form(...),
    license_plate: str = Form(...),
    license_front: Optional[UploadFile] = File(None),
    license_back: Optional[UploadFile] = File(None),
    reg_front: Optional[UploadFile] = File(None),
    reg_back: Optional[UploadFile] = File(None),
    car_photo_front: Optional[UploadFile] = File(None),
    car_photo_back: Optional[UploadFile] = File(None),
    car_photo_left: Optional[UploadFile] = File(None),
    car_photo_right: Optional[UploadFile] = File(None),
    user_id: str = Depends(get_current_user_id),
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")

    os.makedirs("uploads", exist_ok=True)

    def save_file(file: UploadFile, prefix: str):
        if not file:
            return None
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
        file_name = f"{user_id}_{prefix}_{uuid.uuid4().hex[:8]}.{ext}"
        file_path = f"uploads/{file_name}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return f"/uploads/{file_name}"

    document_urls = {
        "license_front": save_file(license_front, "lic_front"),
        "license_back": save_file(license_back, "lic_back"),
        "reg_front": save_file(reg_front, "reg_front"),
        "reg_back": save_file(reg_back, "reg_back"),
        "car_photo_front": save_file(car_photo_front, "car_front"),
        "car_photo_back": save_file(car_photo_back, "car_back"),
        "car_photo_left": save_file(car_photo_left, "car_left"),
        "car_photo_right": save_file(car_photo_right, "car_right"),
    }

    tier = await get_vehicle_tier_from_ai(car_make, car_model, car_year)
    logger.info(f"Vehicle tier assigned: {car_year} {car_make} {car_model} → {tier.upper()}")

    vehicle_data = {
        "id": str(uuid.uuid4()),
        "car_make": car_make,
        "car_model": car_model,
        "car_year": car_year,
        "car_color": car_color,
        "license_plate": license_plate.upper(),
        "tier": tier,
        "documents": document_urls,
        "status": "pending",
    }

    db.collection("users").document(user_id).update({
        "driver_info.vehicles": firestore.ArrayUnion([vehicle_data]),
        "driver_info.active_vehicle_id": vehicle_data["id"],
        "registration_status": "pending_review",
        "updated_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": "Vehicle added to your garage successfully!", "tier": tier}


@app.post("/api/driver/status", tags=["Driver"])
async def update_driver_status(is_online: bool, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    db.collection("users").document(user_id).update({
        "is_online": is_online,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": f"Status updated to {'online' if is_online else 'offline'}"}


@app.post("/api/driver/location", tags=["Driver"])
async def update_driver_location(location: LocationUpdate, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    location_data = {
        "lat": location.lat,
        "lng": location.lng,
        "heading": location.heading,
        "speed": location.speed,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    db.collection("users").document(user_id).update({
        "current_location": location_data,
        "location_updated_at": firestore.SERVER_TIMESTAMP,
    })

    active_rides = list(
        db.collection("rides")
        .where("driver_id", "==", user_id)
        .where("status", "in", ["accepted", "arrived", "in_progress"])
        .limit(1)
        .stream()
    )
    if active_rides:
        ride = active_rides[0]
        db.collection("rides").document(ride.id).update({"driver_location": location_data})

    return {"message": "Location updated"}


@app.post("/api/driver/topup/request", tags=["Driver"])
async def request_topup(request: TopUpRequest, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    driver_doc = db.collection("users").document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")

    driver_data = driver_doc.to_dict()

    topup_ref = db.collection("driver_topup_requests").document()
    topup_data = {
        "id": topup_ref.id,
        "driver_id": user_id,
        "driver_name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip(),
        "driver_cellphone": driver_data.get("cellphone"),
        "amount": request.amount,
        "payment_reference": request.payment_reference,
        "status": "pending",
        "requested_at": firestore.SERVER_TIMESTAMP,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    topup_ref.set(topup_data)

    return {
        "message": f"Top-up request for ₾{request.amount} submitted",
        "request_id": topup_ref.id,
        "amount": request.amount,
        "payment_link": "https://egreve.bog.ge//Taksi",
    }


@app.post("/api/driver/withdraw", tags=["Driver"])
async def request_withdrawal(req: WithdrawRequest):
    db = get_db()
    driver_ref = db.collection("users").document(req.driver_id)
    doc = driver_ref.get()

    if not doc.exists:
        raise HTTPException(404, "Driver not found")

    data = doc.to_dict()
    earnings = data.get("earnings", {}).get("balance")
    if earnings is None:
        earnings = data.get("wallet_balance", 0.0)
        update_field = "wallet_balance"
    else:
        update_field = "earnings.balance"

    WITHDRAWAL_FEE = 1.0
    MINIMUM_RESERVE = 5.0
    total_deduction = req.amount + WITHDRAWAL_FEE

    if earnings - total_deduction < MINIMUM_RESERVE:
        max_withdrawal = max(0.0, earnings - MINIMUM_RESERVE - WITHDRAWAL_FEE)
        raise HTTPException(
            400,
            f"Insufficient funds. Must keep ₾{MINIMUM_RESERVE:.2f} reserve + ₾{WITHDRAWAL_FEE:.2f} fee. "
            f"Max withdrawal: ₾{max_withdrawal:.2f}",
        )

    driver_ref.update({update_field: firestore.Increment(-total_deduction)})

    # ── CHANGE 1: Added driver_name and driver_phone ──────────────────────────
    db.collection("driver_withdrawals").add({
        "driver_id": req.driver_id,
        "driver_name": f"{data.get('name', '')} {data.get('surname', '')}".strip(),
        "driver_phone": data.get("cellphone", ""),
        "amount": req.amount,
        "fee": WITHDRAWAL_FEE,
        "total_deducted": total_deduction,
        "bank_details": req.bank_details,
        "status": "pending",
        "timestamp": firestore.SERVER_TIMESTAMP,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Withdrawal of ₾{req.amount:.2f} requested. ₾{WITHDRAWAL_FEE:.2f} fee applied."}


@app.get("/api/driver/rides/available", tags=["Driver"])
async def get_available_rides(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    driver_doc = db.collection("users").document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")

    driver_data = driver_doc.to_dict()
    driver_location = driver_data.get("current_location")

    rides = db.collection("rides").where("status", "==", "searching").stream()
    available = []

    for ride in rides:
        ride_data = ride.to_dict()
        ride_data["id"] = ride.id

        notified_drivers = ride_data.get("notified_drivers", [])
        declined_drivers = ride_data.get("declined_drivers", [])

        if user_id not in notified_drivers:
            continue
        if user_id in declined_drivers:
            continue

        if driver_location and ride_data.get("pickup_lat") and ride_data.get("pickup_lng"):
            distance = haversine_distance(
                driver_location["lat"], driver_location["lng"],
                ride_data["pickup_lat"], ride_data["pickup_lng"],
            )
            ride_data["distance_to_pickup"] = round(distance, 2)

        ride_data["matching_radius"] = ride_data.get("matching_radius", 3)
        ride_data["drivers_notified"] = len(notified_drivers)
        available.append(serialize_firestore_data(ride_data))

    available.sort(key=lambda x: x.get("distance_to_pickup", 999))
    return {"rides": available}


@app.get("/api/driver/active-ride", tags=["Driver"])
async def get_driver_active_ride(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    for status in ["accepted", "arrived", "in_progress"]:
        rides = list(
            db.collection("rides")
            .where("driver_id", "==", user_id)
            .where("status", "==", status)
            .limit(1)
            .stream()
        )
        if rides:
            ride = rides[0]
            return serialize_firestore_data({**ride.to_dict(), "id": ride.id})
    return None


@app.get("/api/driver/history", tags=["Driver"])
async def get_driver_history(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    try:
        rides = list(
            db.collection("rides")
            .where("driver_id", "==", user_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(50)
            .stream()
        )
    except Exception:
        rides = list(db.collection("rides").where("driver_id", "==", user_id).limit(50).stream())
        rides.sort(key=lambda r: r.to_dict().get("created_at", ""), reverse=True)
    return {"rides": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in rides]}


@app.get("/api/driver/withdrawals/history", tags=["Driver"])
async def get_driver_withdrawal_history(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    try:
        docs = list(
            db.collection("driver_withdrawals")
            .where("driver_id", "==", user_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(30)
            .stream()
        )
    except Exception:
        docs = list(db.collection("driver_withdrawals").where("driver_id", "==", user_id).stream())
        docs.sort(key=lambda d: d.to_dict().get("created_at", ""), reverse=True)
    return {"withdrawals": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


class FleetVehicleModel(BaseModel):
    car_make: str
    car_model: str
    car_year: int
    car_color: str
    license_plate: str
    driver_name: str
    driver_phone: str
    car_type: str = "economy"


@app.get("/api/driver/fleet", tags=["Driver"])
async def get_fleet(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    docs = list(db.collection("fleet_vehicles").where("owner_id", "==", user_id).stream())
    return {"vehicles": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


@app.post("/api/driver/fleet/add", tags=["Driver"])
async def add_fleet_vehicle(vehicle: FleetVehicleModel, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    owner_doc = db.collection("users").document(user_id).get()
    if not owner_doc.exists:
        raise HTTPException(404, "Driver account not found")
    owner_data = owner_doc.to_dict()
    if owner_data.get("registration_status") != "approved":
        raise HTTPException(403, "Your account must be approved before adding fleet vehicles")
    existing = list(
        db.collection("fleet_vehicles").where("license_plate", "==", vehicle.license_plate.upper()).stream()
    )
    if existing:
        raise HTTPException(400, f"License plate {vehicle.license_plate.upper()} is already registered")
    doc_ref = db.collection("fleet_vehicles").document()
    doc_ref.set({
        "id": doc_ref.id,
        "owner_id": user_id,
        "owner_name": f"{owner_data.get('name', '')} {owner_data.get('surname', '')}".strip(),
        "car_make": vehicle.car_make,
        "car_model": vehicle.car_model,
        "car_year": vehicle.car_year,
        "car_color": vehicle.car_color,
        "license_plate": vehicle.license_plate.upper(),
        "driver_name": vehicle.driver_name,
        "driver_phone": vehicle.driver_phone,
        "car_type": vehicle.car_type,
        "status": "active",
        "is_online": False,
        "created_at": firestore.SERVER_TIMESTAMP,
    })
    return {"vehicle_id": doc_ref.id, "message": "Fleet vehicle added successfully"}


@app.delete("/api/driver/fleet/{vehicle_id}", tags=["Driver"])
async def remove_fleet_vehicle(vehicle_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("fleet_vehicles").document(vehicle_id).get()
    if not doc.exists:
        raise HTTPException(404, "Vehicle not found")
    if doc.to_dict().get("owner_id") != user_id:
        raise HTTPException(403, "Not your vehicle")
    db.collection("fleet_vehicles").document(vehicle_id).delete()
    return {"message": "Vehicle removed"}


@app.get("/api/driver/rides/nearby", tags=["Driver"])
async def get_nearby_rides(
    user_id: str = Depends(get_current_user_id),
    radius: float = Query(10, description="Search radius in km", ge=0.5, le=50),
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    driver_doc = db.collection("users").document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")

    driver_data = driver_doc.to_dict()
    driver_location = driver_data.get("current_location")

    if not driver_location or not driver_location.get("lat") or not driver_location.get("lng"):
        raise HTTPException(400, "Driver location not available. Please enable location sharing.")

    rides = db.collection("rides").where("status", "==", "searching").stream()
    nearby = []

    for ride in rides:
        ride_data = ride.to_dict()
        ride_data["id"] = ride.id

        pickup_lat = ride_data.get("pickup_lat")
        pickup_lng = ride_data.get("pickup_lng")
        if not pickup_lat or not pickup_lng:
            continue

        distance = haversine_distance(
            driver_location["lat"], driver_location["lng"], pickup_lat, pickup_lng
        )

        if distance <= radius:
            ride_data["distance_to_pickup"] = round(distance, 2)
            ride_data["was_notified"] = user_id in ride_data.get("notified_drivers", [])
            ride_data["has_declined"] = user_id in ride_data.get("declined_drivers", [])
            nearby.append(serialize_firestore_data(ride_data))

    nearby.sort(key=lambda x: x.get("distance_to_pickup", 999))
    return {"rides": nearby, "search_radius": radius, "driver_location": driver_location}


@app.post("/api/rides/{ride_id}/request-join", tags=["Driver"])
async def request_to_join_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    driver_doc = db.collection("users").document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")

    driver_data = driver_doc.to_dict()

    if driver_data.get("user_type") != "driver":
        raise HTTPException(403, "Only drivers can request to join rides")
    if not driver_data.get("is_online"):
        raise HTTPException(400, "You must be online to request rides")
    if driver_data.get("registration_status") != "approved":
        raise HTTPException(400, "Your driver registration is not approved")

    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    if ride_data.get("status") != "searching":
        raise HTTPException(400, "This ride is no longer available")

    if user_id in ride_data.get("declined_drivers", []):
        raise HTTPException(400, "You have already declined this ride")

    estimated_fare = ride_data.get("estimated_fare", 0)
    commission_rate = ride_data.get("commission_rate", DRIVER_COMMISSION_RATE)
    required_commission = estimated_fare * commission_rate
    driver_balance = driver_data.get("earnings", {}).get("balance", 0)

    if driver_balance < required_commission:
        raise HTTPException(400, f"Insufficient balance. Need ₾{required_commission:.2f}")

    db.collection("rides").document(ride_id).update({
        "notified_drivers": firestore.ArrayUnion([user_id])
    })

    return {"message": "You can now accept this ride", "ride_id": ride_id}


# =========================
# RIDE ROUTES
# =========================

@app.post("/api/rides/{ride_id}/toggle-stop-wait", tags=["Rides"])
async def toggle_stop_wait(ride_id: str, is_waiting: bool, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)

    if is_waiting:
        update_data = {"stop_wait_start": firestore.SERVER_TIMESTAMP}
    else:
        ride_snap = ride_ref.get()
        ride_data = ride_snap.to_dict()
        start_time = ride_data.get("stop_wait_start")

        if start_time:
            wait_seconds = (datetime.now(timezone.utc) - start_time).total_seconds()
            wait_minutes = round(wait_seconds / 60, 2)
            update_data = {
                "stop_wait_minutes": firestore.Increment(wait_minutes),
                "stop_wait_start": None,
            }
        else:
            update_data = {}

    ride_ref.update(update_data)
    return {"status": "updated", "is_waiting": is_waiting}


@app.post("/api/rides/{ride_id}/retry", tags=["Rides"])
async def retry_ride_matching(
    ride_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    if ride_data.get("status") not in ["no_drivers", "cancelled"]:
        raise HTTPException(400, f"Cannot retry ride with status: {ride_data.get('status')}")

    ride_owner = ride_data.get("userId") or ride_data.get("user_id")
    if ride_owner != user_id:
        raise HTTPException(403, "You can only retry your own rides")

    db.collection("rides").document(ride_id).update({
        "status": "searching",
        "matching_radius": 3,
        "matching_status": "Retrying - Searching within 3km",
        "matching_round": 0,
        "notified_drivers": [],
        "declined_drivers": [],
        "available_drivers": [],
        "retry_count": firestore.Increment(1),
        "retried_at": firestore.SERVER_TIMESTAMP,
    })

    background_tasks.add_task(match_drivers_to_ride, ride_id)
    return {"message": "Ride matching restarted", "ride_id": ride_id, "status": "searching"}


@app.get("/api/surge/status", tags=["Rides"])
async def get_surge_status(lat: float = Query(None), lng: float = Query(None)):
    surge_info = get_surge_multiplier(lat, lng)
    now = datetime.now(timezone.utc)
    georgia_hour = (now.hour + 4) % 24
    weekday = now.weekday()
    weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return {
        **surge_info,
        "current_day": weekday_names[weekday],
        "current_hour": georgia_hour,
        "surge_schedule": {
            "Wednesday": "18:00 - 02:00",
            "Friday": "18:00 - 04:00",
            "Saturday": "18:00 - 04:00",
        },
    }


@app.post("/api/rides/request", tags=["Rides"])
async def request_ride(
    ride_data: RideRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    db = get_db()

    surge_info = get_surge_multiplier(ride_data.pickup_lat, ride_data.pickup_lng)
    surge_multiplier = surge_info["multiplier"]
    commission_rate = surge_info["commission_rate"]

    num_stops = len(ride_data.stops)
    fare = calculate_fare(
        ride_data.car_type or "economy",
        ride_data.estimated_distance or 5,
        0, 0, num_stops,
        surge_multiplier,
    )

    payment_method = ride_data.payment_method
    service_fee = 2.0 if payment_method == "card" else 0.0
    fare["service_fee"] = service_fee
    fare["base_total"] = fare["total"]
    fare["total"] += service_fee

    stops_data = [
        {"address": s.address, "lat": s.lat, "lng": s.lng, "order": s.order}
        for s in ride_data.stops
    ]

    ride_ref = db.collection("rides").document()
    new_ride = {
        "id": ride_ref.id,
        "userId": user_id or ride_data.user_id,
        "rider_id": user_id or ride_data.user_id,
        "carType": ride_data.car_type,
        "pickup": ride_data.pickup,
        "pickup_lat": ride_data.pickup_lat,
        "pickup_lng": ride_data.pickup_lng,
        "destination": ride_data.destination,
        "destination_lat": ride_data.destination_lat,
        "destination_lng": ride_data.destination_lng,
        "stops": stops_data,
        "num_stops": num_stops,
        "payment_method": payment_method,
        "paymentMethod": payment_method,
        "payment_order_id": ride_data.payment_order_id,
        "estimated_distance": ride_data.estimated_distance,
        "estimated_duration": ride_data.estimated_duration,
        "estimated_fare": fare["total"],
        "fare_breakdown": fare,
        "service_fee": service_fee,
        "surge_multiplier": surge_multiplier,
        "surge_info": surge_info,
        "commission_rate": commission_rate,
        "status": "searching",
        "matching_radius": 3,
        "notified_drivers": [],
        "declined_drivers": [],
        "actual_distance": 0,
        "pickup_wait_minutes": 0,
        "stop_wait_minutes": 0,
        "route_points": [],
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    ride_ref.set(new_ride)
    background_tasks.add_task(match_drivers_to_ride, ride_ref.id)

    return {
        "ride_id": ride_ref.id,
        "estimated_fare": fare["total"],
        "fare_breakdown": fare,
        "surge": surge_info,
        "status": "searching",
    }


@app.get("/api/surge/estimate", tags=["Rides"])
async def estimate_fare(
    car_type: str = "economy",
    distance: float = 5,
    stops: int = 0,
    lat: float = Query(None),
    lng: float = Query(None),
    payment_method: str = "cash",
):
    surge_info = get_surge_multiplier(lat, lng)
    fare = calculate_fare(car_type, distance, 0, 0, stops, surge_info["multiplier"])

    service_fee = 2.0 if payment_method == "card" else 0.0
    fare["service_fee"] = service_fee
    fare["base_total"] = fare["total"]
    fare["total"] += service_fee

    return {**fare, "surge": surge_info}


async def match_drivers_to_ride(ride_id: str):
    db = get_db()

    radius_progression = [3, 5, 8, 12, 20, 30]
    drivers_per_radius = [5, 5, 8, 10, 15, 20]
    wait_time_per_round = [30, 25, 20, 15, 15, 15]

    total_notified = []

    for idx, radius in enumerate(radius_progression):
        ride_doc = db.collection("rides").document(ride_id).get()
        if not ride_doc.exists:
            return

        ride_data = ride_doc.to_dict()
        if ride_data.get("status") != "searching":
            return

        pickup_lat = ride_data.get("pickup_lat")
        pickup_lng = ride_data.get("pickup_lng")
        if not pickup_lat or not pickup_lng:
            logger.error(f"Ride {ride_id} missing pickup coordinates")
            return

        db.collection("rides").document(ride_id).update({
            "matching_radius": radius,
            "matching_status": f"Searching within {radius}km ({idx + 1}/{len(radius_progression)})",
            "matching_round": idx + 1,
        })

        try:
            drivers = (
                db.collection("users")
                .where("user_type", "==", "driver")
                .where("is_online", "==", True)
                .where("registration_status", "==", "approved")
                .stream()
            )
        except Exception as e:
            logger.warning(f"Composite index query failed, using fallback: {e}")
            all_drivers = db.collection("users").where("user_type", "==", "driver").stream()
            drivers = [
                d for d in all_drivers
                if d.to_dict().get("is_online") and d.to_dict().get("registration_status") == "approved"
            ]

        nearby_drivers = []
        declined = ride_data.get("declined_drivers", [])
        already_notified = ride_data.get("notified_drivers", [])

        for driver in drivers:
            driver_data = driver.to_dict()
            driver_location = driver_data.get("current_location")

            if driver.id in declined or driver.id in already_notified:
                continue

            estimated_fare = ride_data.get("estimated_fare", 0)
            commission_rate = ride_data.get("commission_rate", DRIVER_COMMISSION_RATE)
            required_commission = estimated_fare * commission_rate
            driver_balance = driver_data.get("earnings", {}).get("balance", 0)

            if driver_balance < required_commission:
                continue

            if driver_location and driver_location.get("lat") and driver_location.get("lng"):
                distance = haversine_distance(
                    pickup_lat, pickup_lng,
                    driver_location["lat"], driver_location["lng"],
                )
                if distance <= radius:
                    nearby_drivers.append({
                        "id": driver.id,
                        "distance": round(distance, 2),
                        "name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip(),
                        "vehicle": driver_data.get("driver_info", {}).get("vehicle", {}),
                        "rating": driver_data.get("rating", 5.0),
                        "balance": driver_balance,
                    })

        nearby_drivers.sort(key=lambda x: x["distance"])
        selected_drivers = nearby_drivers[: drivers_per_radius[idx]]

        if selected_drivers:
            driver_ids = [d["id"] for d in selected_drivers]
            total_notified.extend(driver_ids)

            db.collection("rides").document(ride_id).update({
                "notified_drivers": firestore.ArrayUnion(driver_ids),
                "available_drivers": selected_drivers,
                "last_driver_notification": firestore.SERVER_TIMESTAMP,
                "drivers_notified_count": len(total_notified),
                "current_batch_drivers": len(selected_drivers),
            })

            await asyncio.sleep(wait_time_per_round[idx])

            updated_ride = db.collection("rides").document(ride_id).get()
            if updated_ride.exists and updated_ride.to_dict().get("status") != "searching":
                return
        else:
            logger.info(f"Ride {ride_id}: No new drivers found within {radius}km")

    ride_ref = db.collection("rides").document(ride_id)
    fresh_ride_data = ride_ref.get().to_dict()

    update_data = {
        "status": "no_drivers",
        "matching_status": "No drivers available in your area",
        "matching_completed_at": firestore.SERVER_TIMESTAMP,
        "total_drivers_searched": len(total_notified),
    }

    payment_method = fresh_ride_data.get("payment_method") or fresh_ride_data.get("paymentMethod")
    if payment_method == "card" and not fresh_ride_data.get("refunded"):
        fare_to_refund = fresh_ride_data.get("estimated_fare", 0)
        actual_rider_id = (
            fresh_ride_data.get("rider_id")
            or fresh_ride_data.get("userId")
            or fresh_ride_data.get("user_id")
        )
        if actual_rider_id and fare_to_refund > 0:
            db.collection("users").document(actual_rider_id).update({
                "wallet_balance": firestore.Increment(fare_to_refund)
            })
            update_data["refunded"] = True
            update_data["refund_amount"] = fare_to_refund
            logger.info(f"Refunded ₾{fare_to_refund} to rider {actual_rider_id} for unfulfilled ride {ride_id}")

    ride_ref.update(update_data)


async def get_vehicle_tier_from_ai(make: str, model: str, year: int) -> str:
    make_lower = make.lower().strip()
    model_lower = model.lower().strip()

    suv_keywords = [
        "suv", "cr-v", "rav4", "highlander", "prado", "land cruiser",
        "x5", "x3", "q5", "q7", "touareg", "minivan", "transit", "sprinter",
        "santa fe", "tucson", "sportage", "sorento", "macan", "cayenne",
        "rx", "nx", "gx", "lx", "escalade", "tahoe", "suburban", "yukon",
    ]
    if any(kw in model_lower for kw in suv_keywords) or make_lower in ["land rover", "jeep"]:
        return "suv"

    luxury_makes = ["mercedes", "bmw", "audi", "lexus", "porsche", "tesla", "volvo", "infiniti", "jaguar"]
    if make_lower in luxury_makes or int(year) >= 2018:
        return "comfort"

    return "economy"


@app.post("/api/rides/{ride_id}/accept", tags=["Rides"])
async def accept_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()

    driver_doc = db.collection("users").document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")
    driver_data = driver_doc.to_dict()

    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    ride_data = ride_doc.to_dict()

    if ride_data.get("status") != "searching":
        raise HTTPException(400, "Ride is no longer available")

    commission_rate = ride_data.get("commission_rate", DRIVER_COMMISSION_RATE)
    surge_multiplier = ride_data.get("surge_multiplier", 1.0)

    balance = driver_data.get("earnings", {}).get("balance", 0)
    held_commission = (ride_data.get("estimated_fare", 0) or 0) * commission_rate

    if balance < held_commission:
        raise HTTPException(400, f"Insufficient balance. Need ₾{held_commission:.2f}, have ₾{balance:.2f}")

    new_balance = balance - held_commission
    db.collection("users").document(user_id).update({
        "earnings.balance": new_balance,
        "earnings.total_commission_paid": firestore.Increment(held_commission),
    })

    vehicle = driver_data.get("driver_info", {}).get("vehicle", {}) or {}
    driver_location = driver_data.get("current_location", {}) or {}

    db.collection("rides").document(ride_id).update({
        "status": "accepted",
        "driver_id": user_id,
        "driver_info": {
            "id": user_id,
            "name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip(),
            "cellphone": driver_data.get("cellphone"),
            "car_make": vehicle.get("car_make"),
            "car_model": vehicle.get("car_model"),
            "car_color": vehicle.get("car_color"),
            "license_plate": vehicle.get("license_plate"),
            "rating": driver_data.get("rating", 5.0),
        },
        "driver_location": driver_location,
        "commission_paid": held_commission,
        "commission_rate_used": commission_rate,
        "accepted_at": firestore.SERVER_TIMESTAMP,
    })

    return {
        "message": "Ride accepted!",
        "commission_deducted": round(held_commission, 2),
        "commission_rate": f"{commission_rate * 100:.1f}%",
        "surge_multiplier": surge_multiplier,
        "new_balance": round(new_balance, 2),
    }


@app.post("/api/rides/{ride_id}/decline", tags=["Rides"])
async def decline_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    db.collection("rides").document(ride_id).update({
        "declined_drivers": firestore.ArrayUnion([user_id])
    })
    return {"message": "Ride declined"}


@app.post("/api/rides/{ride_id}/arrived", tags=["Rides"])
async def driver_arrived(ride_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    db.collection("rides").document(ride_id).update({
        "status": "arrived",
        "arrived_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Marked as arrived - wait timer started"}


@app.post("/api/rides/{ride_id}/start", tags=["Rides"])
async def start_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if ride_doc.exists:
        ride_data = ride_doc.to_dict()
        arrived_at = ride_data.get("arrived_at")
        wait_minutes = 0
        if arrived_at and hasattr(arrived_at, "timestamp"):
            now = datetime.now(timezone.utc)
            wait_seconds = (now - arrived_at).total_seconds()
            wait_minutes = int(wait_seconds / 60)

        db.collection("rides").document(ride_id).update({
            "status": "in_progress",
            "pickup_wait_minutes": wait_minutes,
            "started_at": firestore.SERVER_TIMESTAMP,
        })
    return {"message": "Ride started"}


@app.post("/api/rides/{ride_id}/update-tracking", tags=["Rides"])
async def update_ride_tracking(
    ride_id: str, location: LocationUpdate, user_id: str = Depends(get_current_user_id)
):
    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    db.collection("rides").document(ride_id).update({
        "driver_location": {
            "lat": location.lat,
            "lng": location.lng,
            "heading": location.heading,
            "speed": location.speed,
        },
        "route_points": firestore.ArrayUnion([{
            "lat": location.lat,
            "lng": location.lng,
            "timestamp": now_iso(),
        }]),
    })
    return {"message": "Tracking updated"}


@app.post("/api/rides/{ride_id}/stop-reached", tags=["Rides"])
async def stop_reached(
    ride_id: str,
    stop_index: int,
    wait_minutes: int = 0,
    user_id: str = Depends(get_current_user_id),
):
    db = get_db()
    db.collection("rides").document(ride_id).update({
        "stop_wait_minutes": firestore.Increment(wait_minutes),
        f"stops_completed.{stop_index}": True,
    })
    return {"message": f"Stop {stop_index} completed, wait time: {wait_minutes} minutes"}


@app.post("/api/rides/{ride_id}/complete", tags=["Rides"])
async def complete_ride(
    ride_id: str,
    final_distance: Optional[float] = 0.0,
    total_wait_minutes: Optional[int] = 0,
    dropoff_lat: Optional[float] = None,
    dropoff_lng: Optional[float] = None,
    user_id: str = Depends(get_current_user_id),
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride_snap = ride_ref.get()

    if not ride_snap.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_snap.to_dict()

    billing_distance = ride_data.get("estimated_distance", 0)
    recorded_actual_distance = final_distance if final_distance else billing_distance
    pickup_wait = ride_data.get("pickup_wait_minutes", 0)
    stop_wait = ride_data.get("stop_wait_minutes", 0)
    num_stops = ride_data.get("num_stops", 0)
    car_type = ride_data.get("carType") or ride_data.get("car_type") or "economy"
    surge_multiplier = ride_data.get("surge_multiplier", 1.0)

    final_fare = calculate_fare(car_type, billing_distance, pickup_wait, stop_wait, num_stops, surge_multiplier)

    raw_payment = ride_data.get("payment_method") or ride_data.get("paymentMethod") or "cash"
    safe_payment_method = str(raw_payment).lower().strip()

    is_wallet = "wallet" in safe_payment_method or "balance" in safe_payment_method
    is_card = "card" in safe_payment_method or "stripe" in safe_payment_method

    service_fee = 2.0 if is_card else 0.0
    commissionable_amount = final_fare["total"]
    total_with_fee = commissionable_amount + service_fee

    final_fare["base_total"] = commissionable_amount
    final_fare["service_fee"] = service_fee
    final_fare["total"] = total_with_fee

    rider_id = ride_data.get("userId") or ride_data.get("rider_id") or ride_data.get("user_id")
    driver_id = ride_data.get("driverId") or ride_data.get("driver_id")

    rider_ref = db.collection("users").document(rider_id) if rider_id else None

    wallet_balance = 0.0
    if rider_ref:
        rider_doc = rider_ref.get()
        if rider_doc.exists:
            wallet_balance = float(rider_doc.to_dict().get("wallet_balance", 0.0))

    wallet_used = 0.0
    cash_to_collect = 0.0
    payment_status = "pending"

    if is_wallet:
        wallet_used = min(wallet_balance, total_with_fee)
        cash_to_collect = total_with_fee - wallet_used
        payment_status = "paid_fully_via_wallet" if cash_to_collect == 0 else "split_cash_required"
        if wallet_used > 0 and rider_ref:
            rider_ref.update({"wallet_balance": firestore.Increment(-float(wallet_used))})
    elif is_card:
        cash_to_collect = 0.0
        payment_status = "paid_via_card"
    else:
        cash_to_collect = total_with_fee
        payment_status = "cash_collected"

    ride_updates = {
        "status": "completed",
        "actual_distance": recorded_actual_distance,
        "billed_distance": billing_distance,
        "final_fare": total_with_fee,
        "wallet_used": float(wallet_used),
        "cash_to_collect": float(cash_to_collect),
        "final_fare_breakdown": final_fare,
        "payment_status": payment_status,
        "completed_at": firestore.SERVER_TIMESTAMP,
        "driver_id": driver_id,
        "driverId": driver_id,
        "user_id": rider_id,
        "userId": rider_id,
    }
    ride_ref.update(ride_updates)

    if driver_id:
        held_commission = ride_data.get("commission_paid", 0) or 0
        commission_rate = ride_data.get("commission_rate", 0.23)

        actual_commission = commissionable_amount * commission_rate
        driver_share = commissionable_amount - actual_commission

        commission_refund = held_commission - actual_commission
        wallet_change = driver_share - cash_to_collect + commission_refund

        db.collection("users").document(driver_id).update({
            "earnings.balance": firestore.Increment(wallet_change),
            "earnings.total_earned": firestore.Increment(driver_share),
            "total_rides": firestore.Increment(1),
        })

    if rider_id and rider_ref:
        rider_ref.update({"total_rides": firestore.Increment(1)})

    return {
        "message": "Ride completed",
        "payment_status": payment_status,
        "final_fare": total_with_fee,
        "wallet_used": wallet_used,
        "cash_to_collect": cash_to_collect,
        "fare_breakdown": final_fare,
    }


@app.post("/api/rides/{ride_id}/rate-passenger", tags=["Rides"])
async def rate_passenger(
    ride_id: str, rating_data: RatePassengerRequest, user_id: str = Depends(get_current_user_id)
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    data = ride.to_dict()
    if data.get("driver_id") != user_id:
        raise HTTPException(403, "Not authorized")

    ride_ref.update({"passenger_rating": rating_data.rating, "passenger_review": rating_data.review})

    rider_id = data.get("userId")
    if rider_id:
        user_ref = db.collection("users").document(rider_id)
        user_doc = user_ref.get()
        if user_doc.exists:
            u_data = user_doc.to_dict()
            current = u_data.get("rating", 5.0)
            count = u_data.get("total_rides", 1)
            new_rating = ((current * count) + rating_data.rating) / (count + 1)
            user_ref.update({"rating": round(new_rating, 2)})

    return {"message": "Passenger rated"}


@app.post("/api/rides/{ride_id}/rate-rider", tags=["Rides"])
async def rate_driver(
    ride_id: str, rating_data: RateDriverRequest, user_id: str = Depends(get_current_user_id)
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    data = ride.to_dict()
    if data.get("userId") != user_id:
        raise HTTPException(403, "Not authorized")

    ride_ref.update({
        "rider_rating": rating_data.rating,
        "rider_review": rating_data.review,
        "rated_at": firestore.SERVER_TIMESTAMP,
    })

    driver_id = data.get("driver_id")
    if driver_id:
        driver_ref = db.collection("users").document(driver_id)
        driver_doc = driver_ref.get()
        if driver_doc.exists:
            d_data = driver_doc.to_dict()
            current_rating = d_data.get("rating", 5.0)
            total_rides = d_data.get("total_rides", 1)
            new_rating = ((current_rating * total_rides) + rating_data.rating) / (total_rides + 1)
            driver_ref.update({"rating": round(new_rating, 2)})

    return {"message": "Rating submitted"}


@app.post("/api/rides/{ride_id}/cancel", tags=["Rides"])
async def cancel_ride(
    ride_id: str,
    reason: str = "User cancelled",
    user_id: str = Depends(get_current_user_id),
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride_snap = ride_ref.get()
    if not ride_snap.exists:
        raise HTTPException(404, "Ride not found")
    ride_data = ride_snap.to_dict()

    update_data = {
        "status": "cancelled",
        "cancellation_reason": reason,
        "cancelled_by": user_id,
        "cancelled_at": firestore.SERVER_TIMESTAMP,
    }

    payment_method = ride_data.get("payment_method") or ride_data.get("paymentMethod")
    if payment_method == "card" and not ride_data.get("refunded"):
        if ride_data.get("status") in ["searching", "accepted", "arrived", "no_drivers"]:
            fare_to_refund = ride_data.get("estimated_fare", 0)
            actual_rider_id = (
                ride_data.get("rider_id")
                or ride_data.get("userId")
                or ride_data.get("user_id")
            )
            if actual_rider_id and fare_to_refund > 0:
                db.collection("users").document(actual_rider_id).update({
                    "wallet_balance": firestore.Increment(fare_to_refund)
                })
                update_data["refunded"] = True
                update_data["refund_amount"] = fare_to_refund
                logger.info(f"Refunded ₾{fare_to_refund} for cancelled ride {ride_id}")

    ride_ref.update(update_data)
    return {"message": "Ride cancelled. Card payments have been refunded to your wallet."}


@app.get("/api/rides/{ride_id}", tags=["Rides"])
async def get_ride(ride_id: str):
    db = get_db()
    doc = db.collection("rides").document(ride_id).get()
    if not doc.exists:
        raise HTTPException(404, "Ride not found")
    return serialize_firestore_data({**doc.to_dict(), "id": doc.id})


# =========================
# CHAT ROUTES
# =========================

@app.get("/api/rides/{ride_id}/chat", tags=["Chat"])
async def get_chat_messages(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    if user_id not in [ride_data.get("userId"), ride_data.get("driver_id")]:
        raise HTTPException(403, "Not authorized to access this chat")

    messages = list(
        db.collection("rides").document(ride_id).collection("messages").order_by("timestamp").stream()
    )
    return {
        "ride_id": ride_id,
        "messages": [serialize_firestore_data({**m.to_dict(), "id": m.id}) for m in messages],
    }


@app.post("/api/rides/{ride_id}/chat", tags=["Chat"])
async def send_chat_message(
    ride_id: str, chat: ChatMessage, user_id: str = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    rider_id = ride_data.get("userId")
    driver_id = ride_data.get("driver_id")

    if user_id not in [rider_id, driver_id]:
        raise HTTPException(403, "Not authorized to send messages in this chat")

    sender_type = "rider" if user_id == rider_id else "driver"

    user_doc = db.collection("users").document(user_id).get()
    sender_name = "Unknown"
    if user_doc.exists:
        user_data = user_doc.to_dict()
        sender_name = f"{user_data.get('name', '')} {user_data.get('surname', '')}".strip()

    message_ref = db.collection("rides").document(ride_id).collection("messages").document()
    message_data = {
        "id": message_ref.id,
        "sender_id": user_id,
        "sender_type": sender_type,
        "sender_name": sender_name,
        "message": chat.message,
        "timestamp": firestore.SERVER_TIMESTAMP,
        "read": False,
    }
    message_ref.set(message_data)

    preview = chat.message[:50] + "..." if len(chat.message) > 50 else chat.message
    db.collection("rides").document(ride_id).update({
        "last_message": {
            "text": preview,
            "sender_type": sender_type,
            "timestamp": firestore.SERVER_TIMESTAMP,
        },
        "unread_messages": firestore.Increment(1),
    })

    return {"message": "Message sent", "message_id": message_ref.id, "sender_type": sender_type}


@app.post("/api/rides/{ride_id}/chat/read", tags=["Chat"])
async def mark_messages_read(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    if user_id not in [ride_data.get("userId"), ride_data.get("driver_id")]:
        raise HTTPException(403, "Not authorized")

    db.collection("rides").document(ride_id).update({"unread_messages": 0})
    return {"message": "Messages marked as read"}


# =========================
# RIDER WALLET
# =========================

@app.post("/api/rider/wallet/topup", tags=["Rider"])
async def rider_topup(request: RiderWalletTopUp, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    try:
        db.collection("users").document(user_id).update({
            "wallet_balance": firestore.Increment(request.amount),
            "updated_at": firestore.SERVER_TIMESTAMP,
        })
        return {"message": f"Successfully added ₾{request.amount:.2f} to wallet"}
    except Exception as e:
        logger.error(f"Rider topup error for user {user_id}: {e}")
        raise HTTPException(500, "Failed to process top-up")


# =========================
# RIDER HISTORY
# =========================

@app.get("/api/rider/history", tags=["Rider"])
async def get_rider_history(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    try:
        rides = list(
            db.collection("rides")
            .where("userId", "==", user_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(50)
            .stream()
        )
    except Exception:
        rides = list(db.collection("rides").where("userId", "==", user_id).limit(50).stream())
        rides.sort(key=lambda r: r.to_dict().get("created_at", ""), reverse=True)
    return {"rides": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in rides]}


@app.get("/api/rider/active-ride", tags=["Rider"])
async def get_active_ride(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    for status in ["searching", "accepted", "arrived", "in_progress"]:
        rides = list(
            db.collection("rides")
            .where("userId", "==", user_id)
            .where("status", "==", status)
            .limit(1)
            .stream()
        )
        if rides:
            ride = rides[0]
            return serialize_firestore_data({**ride.to_dict(), "id": ride.id})
    return None


# =========================
# ADMIN ROUTES
# =========================

@app.get("/api/admin/dashboard", tags=["Admin"])
async def admin_dashboard():
    db = get_db()
    riders = list(db.collection("users").where("user_type", "==", "rider").stream())
    drivers = list(db.collection("users").where("user_type", "==", "driver").stream())
    active_rides = list(
        db.collection("rides")
        .where("status", "in", ["searching", "accepted", "arrived", "in_progress"])
        .stream()
    )
    pending_drivers = list(
        db.collection("users").where("registration_status", "==", "pending_review").stream()
    )
    pending_withdrawals = list(
        db.collection("driver_withdrawals").where("status", "==", "pending").stream()
    )
    pending_topups = list(
        db.collection("driver_topup_requests").where("status", "==", "pending").stream()
    )
    return {
        "total_riders": len(riders),
        "total_drivers": len(drivers),
        "active_rides": len(active_rides),
        "pending_driver_approvals": len(pending_drivers),
        "pending_withdrawals": len(pending_withdrawals),
        "pending_topups": len(pending_topups),
    }


@app.get("/api/admin/riders", tags=["Admin"])
async def admin_riders():
    db = get_db()
    riders = db.collection("users").where("user_type", "==", "rider").stream()
    return {"riders": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in riders]}


@app.get("/api/admin/riders/{id}", tags=["Admin"])
async def get_admin_rider_detail(id: str):
    db = get_db()
    doc = db.collection("users").document(id).get()
    if not doc.exists:
        raise HTTPException(404, "Rider not found")
    rides = db.collection("rides").where("userId", "==", id).limit(50).stream()
    return {
        "rider": serialize_firestore_data({**doc.to_dict(), "id": id}),
        "rides": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in rides],
    }


@app.get("/api/admin/drivers", tags=["Admin"])
async def admin_drivers():
    db = get_db()
    drivers = db.collection("users").where("user_type", "==", "driver").stream()
    return {"drivers": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in drivers]}


@app.get("/api/admin/drivers/pending", tags=["Admin"])
async def get_pending_drivers():
    db = get_db()
    all_drivers = list(db.collection("users").where("user_type", "==", "driver").stream())
    pending = [d for d in all_drivers if d.to_dict().get("registration_status") == "pending_review"]
    return {"pending_drivers": [serialize_firestore_data({**doc.to_dict(), "id": doc.id}) for doc in pending]}


@app.get("/api/admin/drivers/{id}", tags=["Admin"])
async def get_admin_driver_detail(id: str):
    db = get_db()
    doc = db.collection("users").document(id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")
    return {"driver": serialize_firestore_data({**doc.to_dict(), "id": id})}


@app.post("/api/admin/drivers/{id}/approve", tags=["Admin"])
async def admin_approve_driver(id: str):
    db = get_db()
    db.collection("users").document(id).update({
        "registration_status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Driver approved"}


@app.post("/api/admin/drivers/{id}/reject", tags=["Admin"])
async def admin_reject_driver(id: str, reason: str = "Documents not satisfactory"):
    db = get_db()
    db.collection("users").document(id).update({
        "registration_status": "rejected",
        "rejection_reason": reason,
        "rejected_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Driver rejected"}


@app.post("/api/admin/users/{id}/add-balance", tags=["Admin"])
@app.post("/api/admin/add-balance/{id}", tags=["Admin"])
async def admin_add_balance(id: str, req: AdminAddBalanceRequest):
    db = get_db()
    ref = db.collection("users").document(id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(404, "User not found")

    user_data = doc.to_dict()
    user_type = user_data.get("user_type", "rider")

    if user_type == "driver":
        ref.update({
            "earnings.balance": firestore.Increment(req.amount),
            "earnings.total_topped_up": firestore.Increment(abs(req.amount)) if req.amount > 0 else firestore.Increment(0),
        })
    else:
        ref.update({"wallet_balance": firestore.Increment(req.amount)})

    db.collection("admin_balance_logs").add({
        "target_user_id": id,
        "target_user_name": f"{user_data.get('name', '')} {user_data.get('surname', '')}".strip(),
        "target_user_type": user_type,
        "amount": req.amount,
        "reason": req.reason,
        "admin_action": "add_balance",
        "timestamp": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Successfully added ₾{req.amount} to {user_type} account"}


@app.get("/api/admin/topups/pending", tags=["Admin"])
async def get_pending_topups():
    db = get_db()
    topups = db.collection("driver_topup_requests").where("status", "==", "pending").stream()
    return {"pending_topups": [serialize_firestore_data({**t.to_dict(), "id": t.id}) for t in topups]}


@app.post("/api/admin/topups/{id}/approve", tags=["Admin"])
async def approve_topup(id: str):
    db = get_db()
    topup_doc = db.collection("driver_topup_requests").document(id).get()
    if not topup_doc.exists:
        raise HTTPException(404, "Top-up request not found")

    topup_data = topup_doc.to_dict()
    driver_id = topup_data.get("driver_id")
    amount = topup_data.get("amount", 0)

    db.collection("users").document(driver_id).update({
        "earnings.balance": firestore.Increment(amount),
        "earnings.total_topped_up": firestore.Increment(amount),
    })
    db.collection("driver_topup_requests").document(id).update({
        "status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": f"Top-up of ₾{amount} approved"}


@app.post("/api/admin/topups/{id}/reject", tags=["Admin"])
async def reject_topup(id: str, reason: str = "Payment not verified"):
    db = get_db()
    db.collection("driver_topup_requests").document(id).update({
        "status": "rejected",
        "rejection_reason": reason,
        "rejected_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Top-up request rejected"}


@app.get("/api/admin/withdrawals/pending", tags=["Admin"])
async def get_pending_withdrawals():
    db = get_db()
    withdrawals = db.collection("driver_withdrawals").where("status", "==", "pending").stream()
    return {"pending_withdrawals": [serialize_firestore_data({**w.to_dict(), "id": w.id}) for w in withdrawals]}


@app.post("/api/admin/withdrawals/{id}/approve", tags=["Admin"])
@app.post("/api/admin/withdrawal/{id}/approve", tags=["Admin"])
async def approve_withdrawal(id: str):
    db = get_db()
    withdrawal_doc = db.collection("driver_withdrawals").document(id).get()
    if not withdrawal_doc.exists:
        raise HTTPException(404, "Withdrawal request not found")

    withdrawal_data = withdrawal_doc.to_dict()
    driver_id = withdrawal_data.get("driver_id")
    amount = withdrawal_data.get("amount", 0)

    db.collection("driver_withdrawals").document(id).update({
        "status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP,
    })

    db.collection("admin_balance_logs").add({
        "target_user_id": driver_id,
        "amount": -amount,
        "reason": f"Withdrawal approved (ID: {id})",
        "admin_action": "withdrawal_approved",
        "timestamp": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Withdrawal of ₾{amount} approved"}


@app.post("/api/admin/withdrawals/{id}/reject", tags=["Admin"])
@app.post("/api/admin/withdrawal/{id}/reject", tags=["Admin"])
async def reject_withdrawal(id: str):
    db = get_db()
    withdrawal_doc = db.collection("driver_withdrawals").document(id).get()
    if not withdrawal_doc.exists:
        raise HTTPException(404, "Withdrawal request not found")

    withdrawal_data = withdrawal_doc.to_dict()
    driver_id = withdrawal_data.get("driver_id")
    total_deducted = withdrawal_data.get("total_deducted", 0)

    if driver_id and total_deducted > 0:
        db.collection("users").document(driver_id).update({
            "earnings.balance": firestore.Increment(total_deducted)
        })

    db.collection("driver_withdrawals").document(id).update({
        "status": "rejected",
        "rejected_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Withdrawal rejected and funds returned to driver wallet"}


@app.post("/api/admin/dispute/refund", tags=["Admin"])
async def admin_refund_ride(req: AdminRefundRequest):
    db = get_db()

    driver_ref = db.collection("users").document(req.driver_id)
    if not driver_ref.get().exists:
        raise HTTPException(404, "Driver not found")

    rider_ref = db.collection("users").document(req.rider_id)
    if not rider_ref.get().exists:
        raise HTTPException(404, "Rider not found")

    refund_amount = abs(req.amount)

    driver_ref.update({"earnings.balance": firestore.Increment(-refund_amount)})
    rider_ref.update({"wallet_balance": firestore.Increment(refund_amount)})

    db.collection("admin_balance_logs").add({
        "driver_id": req.driver_id,
        "rider_id": req.rider_id,
        "amount": refund_amount,
        "reason": req.reason,
        "admin_action": "dispute_refund",
        "timestamp": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Successfully refunded ₾{refund_amount:.2f} from Driver to Rider."}


# =========================
# AI FEATURES
# =========================

from ai_features import (
    translate_text, process_support_message, translate_chat_message,
    generate_referral_code, generate_share_link, calculate_referral_bonus,
    TranslateRequest, RatingRequest, FavoriteLocation,
    ScheduledRideRequest, SOSRequest, ShareTripRequest, ReferralCodeRequest, TipRequest,
    RATING_TAGS, now_iso as ai_now_iso,
)


class TicketReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    ticket_id: Optional[str] = None


@app.post("/api/translate", tags=["AI"])
async def translate_endpoint(req: TranslateRequest):
    translated = await translate_text(req.text, req.source_lang, req.target_lang)
    return {"original": req.text, "translated": translated, "target_lang": req.target_lang}


@app.post("/api/rides/{ride_id}/chat/translate", tags=["Chat"])
async def send_translated_chat(
    ride_id: str,
    chat: ChatMessage,
    target_lang: str = "auto",
    user_id: str = Depends(get_current_user_id),
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride.to_dict()
    sender_role = "rider" if user_id == ride_data.get("rider_id") else "driver"
    rider_lang = ride_data.get("rider_lang", "en")
    driver_lang = ride_data.get("driver_lang", "en")

    sender_lang = rider_lang if sender_role == "rider" else driver_lang
    recipient_lang = driver_lang if sender_role == "rider" else rider_lang

    translation_result = await translate_chat_message(chat.message, sender_lang, recipient_lang)

    message_data = {
        "ride_id": ride_id,
        "sender_id": user_id,
        "sender_role": sender_role,
        "message": chat.message,
        "translated_message": translation_result.get("translated", chat.message),
        "was_translated": translation_result.get("was_translated", False),
        "from_lang": sender_lang,
        "to_lang": recipient_lang,
        "timestamp": firestore.SERVER_TIMESTAMP,
        "read": False,
    }
    db.collection("ride_chats").add(message_data)

    return {
        "status": "sent",
        "original": chat.message,
        "translated": translation_result.get("translated"),
        "was_translated": translation_result.get("was_translated", False),
    }


# ── CHANGE 2: AI-powered support endpoint ────────────────────────────────────
@app.post("/api/support/message", tags=["Support"])
async def send_support_message(msg: TicketReplyRequest, user_id: str = Depends(get_current_user_id)):
    db = get_db()

    # ── Reply to existing ticket ──────────────────────────────────────────────
    if msg.ticket_id:
        ticket_ref = db.collection("support_tickets").document(msg.ticket_id)
        ticket_doc = ticket_ref.get()
        if not ticket_doc.exists:
            raise HTTPException(404, "Ticket not found")

        ticket_data = ticket_doc.to_dict()
        chat_history = ticket_data.get("chat_history", [])

        new_user_msg = {"role": "user", "content": msg.message, "timestamp": now_iso()}
        chat_history.append(new_user_msg)

        # Re-run AI processing on the follow-up message
        ai_result = await process_support_message(msg.message, user_context={}, chat_history=chat_history)

        new_ai_msg = {
            "role": "assistant",
            "content": ai_result.get("response", ""),
            "timestamp": now_iso(),
        }
        chat_history.append(new_ai_msg)

        update_data = {
            "chat_history": chat_history,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }

        # Re-escalate if follow-up triggers new keywords
        if ai_result.get("needs_escalation") and not ticket_data.get("needs_human"):
            update_data["needs_human"] = True
            update_data["priority"] = ai_result.get("priority", ticket_data.get("priority", "normal"))
            update_data["admin_tag"] = ai_result.get("admin_tag", "")
            update_data["escalation_reason"] = ai_result.get("escalation_reason", "")
            update_data["matched_keywords"] = ai_result.get("matched_keywords", [])
            update_data["status"] = "escalated"

        ticket_ref.update(update_data)
        return {
            "ticket_id": msg.ticket_id,
            "response": ai_result.get("response", ""),
            "needs_escalation": ai_result.get("needs_escalation", False),
        }

    # ── New ticket ────────────────────────────────────────────────────────────
    user_context = {}
    if user_id:
        user_doc = db.collection("users").document(user_id).get()
        if user_doc.exists:
            u = user_doc.to_dict()
            user_context = {
                "name": u.get("name", "Unknown"),
                "phone": u.get("cellphone", ""),
                "ride_count": u.get("total_rides", 0),
                "user_type": u.get("user_type", "rider"),
            }

    initial_history = [{"role": "user", "content": msg.message, "timestamp": now_iso()}]
    ai_result = await process_support_message(msg.message, user_context=user_context, chat_history=initial_history)

    ai_response = ai_result.get("response", "We've received your message and our support team will be in touch shortly.")

    chat_history = [
        {"role": "user", "content": msg.message, "timestamp": now_iso()},
        {"role": "assistant", "content": ai_response, "timestamp": now_iso()},
    ]

    ticket_data = {
        "user_id": user_id or "anonymous",
        "user_name": user_context.get("name", "Unknown"),
        "user_phone": user_context.get("phone", ""),
        "user_type": user_context.get("user_type", "rider"),
        "message": msg.message,
        "ai_response": ai_response,
        "admin_response": None,
        "chat_history": chat_history,
        # AI escalation metadata — used by AdminSupportPanel
        "needs_human": ai_result.get("needs_escalation", False),
        "ai_handled": not ai_result.get("needs_escalation", False),
        "priority": ai_result.get("priority", "normal"),
        "category": ai_result.get("category", "general"),
        "admin_tag": ai_result.get("admin_tag", ""),
        "escalation_reason": ai_result.get("escalation_reason", ""),
        "matched_keywords": ai_result.get("matched_keywords", []),
        "status": "escalated" if ai_result.get("needs_escalation") else "open",
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
        "admin_notes": None,
    }

    ticket_ref = db.collection("support_tickets").add(ticket_data)
    return {
        "ticket_id": ticket_ref[1].id,
        "response": ai_response,
        "needs_escalation": ai_result.get("needs_escalation", False),
        "priority": ai_result.get("priority", "normal"),
        "admin_tag": ai_result.get("admin_tag", ""),
    }


@app.get("/api/support/tickets/{ticket_id}", tags=["Support"])
async def get_support_ticket(ticket_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    doc = db.collection("support_tickets").document(ticket_id).get()
    if not doc.exists:
        raise HTTPException(404, "Ticket not found")

    data = doc.to_dict()
    messages = data.get("chat_history", [])

    if not messages:
        messages.append({"role": "user", "content": data.get("message", "")})
        if data.get("ai_response"):
            messages.append({
                "role": "assistant",
                "content": data.get("ai_response"),
                "escalated": data.get("status") == "escalated",
            })
        if data.get("admin_response"):
            messages.append({"role": "admin", "content": data.get("admin_response")})

    return {"status": data.get("status"), "messages": messages}


@app.get("/api/support/history", tags=["Support"])
async def get_support_history(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    tickets = (
        db.collection("support_tickets")
        .where("user_id", "==", user_id)
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(20)
        .stream()
    )
    result = []
    for ticket in tickets:
        data = ticket.to_dict()
        data["id"] = ticket.id
        result.append(serialize_firestore_data(data))
    return {"tickets": result}


@app.get("/api/admin/support/tickets", tags=["Admin"])
async def get_support_tickets(status: str = None, priority: str = None):
    db = get_db()
    query = db.collection("support_tickets")
    if status:
        query = query.where("status", "==", status)
    if priority:
        query = query.where("priority", "==", priority)

    results = []
    for t in query.limit(100).stream():
        data = t.to_dict()
        data["id"] = t.id
        results.append(serialize_firestore_data(data))

    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"tickets": results}


@app.get("/api/admin/support/tickets/escalated", tags=["Admin"])
async def get_escalated_tickets():
    db = get_db()
    tickets = db.collection("support_tickets").where("status", "==", "escalated").limit(50).stream()
    result = [serialize_firestore_data({**t.to_dict(), "id": t.id}) for t in tickets]
    result.sort(key=lambda x: (x.get("priority", "medium"), x.get("created_at", "")))
    return {"tickets": result, "count": len(result)}


@app.post("/api/admin/support/tickets/{ticket_id}/respond", tags=["Admin"])
async def admin_respond_ticket(ticket_id: str, response: str, resolve: bool = False):
    db = get_db()
    new_admin_msg = {"role": "admin", "content": response, "timestamp": now_iso()}
    db.collection("support_tickets").document(ticket_id).update({
        "admin_response": response,
        "admin_notes": response,
        "chat_history": firestore.ArrayUnion([new_admin_msg]),
        "updated_at": firestore.SERVER_TIMESTAMP,
        "status": "resolved" if resolve else "in_progress",
    })
    return {"status": "updated", "resolved": resolve}


@app.post("/api/admin/support/tickets/{ticket_id}/resolve", tags=["Admin"])
async def resolve_ticket(ticket_id: str, notes: str = ""):
    db = get_db()
    db.collection("support_tickets").document(ticket_id).update({
        "status": "closed",
        "admin_notes": notes,
        "resolved_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"status": "closed"}


# =========================
# RATING SYSTEM
# =========================

@app.get("/api/rating/tags", tags=["Rating"])
async def get_rating_tags():
    return RATING_TAGS


@app.post("/api/rides/{ride_id}/rate/driver", tags=["Rating"])
async def rate_driver_enhanced(
    ride_id: str, rating: RatingRequest, user_id: str = Depends(get_current_user_id)
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()

    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride.to_dict()
    if ride_data.get("rider_id") != user_id:
        raise HTTPException(403, "Only rider can rate driver")

    driver_id = ride_data.get("driver_id")
    if not driver_id:
        raise HTTPException(400, "No driver assigned")

    db.collection("driver_ratings").add({
        "ride_id": ride_id,
        "driver_id": driver_id,
        "rider_id": user_id,
        "rating": rating.rating,
        "comment": rating.comment,
        "tags": rating.tags or [],
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    driver_ref = db.collection("users").document(driver_id)
    driver = driver_ref.get().to_dict()
    current_rating = driver.get("rating", 5.0)
    total_ratings = driver.get("total_ratings", 0)
    new_total = total_ratings + 1
    new_rating = ((current_rating * total_ratings) + rating.rating) / new_total

    driver_ref.update({"rating": round(new_rating, 2), "total_ratings": new_total})
    ride_ref.update({"driver_rating": rating.rating, "driver_rating_comment": rating.comment})

    return {"status": "rated", "new_driver_rating": round(new_rating, 2)}


@app.post("/api/rides/{ride_id}/rate/rider", tags=["Rating"])
async def rate_rider_enhanced(
    ride_id: str, rating: RatingRequest, user_id: str = Depends(get_current_user_id)
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()

    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride.to_dict()
    if ride_data.get("driver_id") != user_id:
        raise HTTPException(403, "Only driver can rate rider")

    rider_id = ride_data.get("userId")

    db.collection("rider_ratings").add({
        "ride_id": ride_id,
        "rider_id": rider_id,
        "driver_id": user_id,
        "rating": rating.rating,
        "comment": rating.comment,
        "tags": rating.tags or [],
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    rider_ref = db.collection("users").document(rider_id)
    rider = rider_ref.get().to_dict()
    current_rating = rider.get("rider_rating", 5.0)
    total_ratings = rider.get("total_rider_ratings", 0)
    new_total = total_ratings + 1
    new_rating = ((current_rating * total_ratings) + rating.rating) / new_total

    rider_ref.update({"rider_rating": round(new_rating, 2), "total_rider_ratings": new_total})
    ride_ref.update({"rider_rating": rating.rating})

    return {"status": "rated", "new_rider_rating": round(new_rating, 2)}


# =========================
# FAVORITE LOCATIONS
# =========================

@app.get("/api/user/favorites", tags=["User"])
async def get_favorite_locations(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    favorites = db.collection("users").document(user_id).collection("favorites").stream()
    result = []
    for fav in favorites:
        data = fav.to_dict()
        data["id"] = fav.id
        result.append(data)
    return {"favorites": result}


@app.post("/api/user/favorites", tags=["User"])
async def add_favorite_location(fav: FavoriteLocation, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    fav_data = {
        "name": fav.name,
        "address": fav.address,
        "lat": fav.lat,
        "lng": fav.lng,
        "icon": fav.icon,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection("users").document(user_id).collection("favorites").add(fav_data)
    return {"status": "added", "id": ref[1].id}


@app.delete("/api/user/favorites/{fav_id}", tags=["User"])
async def delete_favorite_location(fav_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    db.collection("users").document(user_id).collection("favorites").document(fav_id).delete()
    return {"status": "deleted"}


# =========================
# SCHEDULED RIDES
# =========================

@app.post("/api/rides/schedule", tags=["Rides"])
async def schedule_ride(ride: ScheduledRideRequest, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    ride_data = {
        "rider_id": user_id,
        "pickup_address": ride.pickup_address,
        "pickup_lat": ride.pickup_lat,
        "pickup_lng": ride.pickup_lng,
        "destination_address": ride.destination_address,
        "destination_lat": ride.destination_lat,
        "destination_lng": ride.destination_lng,
        "scheduled_time": ride.scheduled_time,
        "car_type": ride.car_type,
        "payment_method": ride.payment_method,
        "stops": ride.stops,
        "status": "scheduled",
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection("scheduled_rides").add(ride_data)
    return {"status": "scheduled", "ride_id": ref[1].id, "scheduled_time": ride.scheduled_time}


@app.get("/api/rides/scheduled", tags=["Rides"])
async def get_scheduled_rides(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    rides = (
        db.collection("scheduled_rides")
        .where("rider_id", "==", user_id)
        .where("status", "==", "scheduled")
        .stream()
    )
    result = []
    for ride in rides:
        data = ride.to_dict()
        data["id"] = ride.id
        result.append(serialize_firestore_data(data))
    return {"scheduled_rides": result}


@app.delete("/api/rides/scheduled/{ride_id}", tags=["Rides"])
async def cancel_scheduled_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    ride_ref = db.collection("scheduled_rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(404, "Scheduled ride not found")
    if ride.to_dict().get("rider_id") != user_id:
        raise HTTPException(403, "Not your ride")
    ride_ref.update({"status": "cancelled", "cancelled_at": firestore.SERVER_TIMESTAMP})
    return {"status": "cancelled"}


# =========================
# SOS & SAFETY
# =========================

@app.post("/api/sos", tags=["Safety"])
async def trigger_sos(sos: SOSRequest, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user_doc = db.collection("users").document(user_id).get()
    user = user_doc.to_dict() if user_doc.exists else {}

    sos_data = {
        "user_id": user_id,
        "user_name": user.get("name", "Unknown"),
        "user_phone": user.get("cellphone", ""),
        "ride_id": sos.ride_id,
        "lat": sos.lat,
        "lng": sos.lng,
        "message": sos.message,
        "status": "active",
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection("sos_alerts").add(sos_data)

    db.collection("support_tickets").add({
        "user_id": user_id,
        "user_name": user.get("name", "Unknown"),
        "user_phone": user.get("cellphone", ""),
        "message": f"SOS ALERT: {sos.message}. Location: {sos.lat}, {sos.lng}",
        "ai_response": "EMERGENCY - SOS triggered by user",
        "status": "escalated",
        "priority": "urgent",
        "category": "safety",
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })

    return {
        "status": "sos_triggered",
        "alert_id": ref[1].id,
        "message": "Emergency services have been notified. Help is on the way.",
    }


@app.get("/api/admin/sos/active", tags=["Admin"])
async def get_active_sos():
    db = get_db()
    alerts = db.collection("sos_alerts").where("status", "==", "active").limit(50).stream()
    result = [serialize_firestore_data({**a.to_dict(), "id": a.id}) for a in alerts]
    result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"alerts": result, "count": len(result)}


@app.post("/api/admin/sos/{alert_id}/resolve", tags=["Admin"])
async def resolve_sos(alert_id: str, notes: str = ""):
    db = get_db()
    db.collection("sos_alerts").document(alert_id).update({
        "status": "resolved",
        "resolved_at": firestore.SERVER_TIMESTAMP,
        "resolution_notes": notes,
    })
    return {"status": "resolved"}


# =========================
# SHARE TRIP
# =========================

@app.post("/api/rides/{ride_id}/share", tags=["Rides"])
async def share_trip(ride_id: str, share: ShareTripRequest, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    ride = db.collection("rides").document(ride_id).get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    share_link = generate_share_link(ride_id)
    db.collection("trip_shares").add({
        "ride_id": ride_id,
        "shared_by": user_id,
        "recipient_phone": share.recipient_phone,
        "recipient_email": share.recipient_email,
        "share_link": share_link,
        "created_at": firestore.SERVER_TIMESTAMP,
    })
    return {"share_link": share_link, "message": "Share this link to let others track your trip"}


@app.get("/api/track/{ride_id}", tags=["Public"])
async def get_public_ride_tracking(ride_id: str):
    db = get_db()
    ride = db.collection("rides").document(ride_id).get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")
    ride_data = ride.to_dict()
    return {
        "status": ride_data.get("status"),
        "driver_location": ride_data.get("driver_location"),
        "destination_address": ride_data.get("destination_address"),
        "eta_minutes": ride_data.get("eta_minutes"),
        "car_type": ride_data.get("car_type"),
    }


# =========================
# REFERRAL SYSTEM
# =========================

@app.get("/api/user/referral", tags=["User"])
async def get_referral_code(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get().to_dict()

    referral_code = user.get("referral_code")
    if not referral_code:
        referral_code = generate_referral_code(user_id)
        user_ref.update({"referral_code": referral_code})

    return {
        "referral_code": referral_code,
        "referral_link": f"https://taksi.ge/ref/{referral_code}",
        "bonus_earned": user.get("referral_bonus_earned", 0),
        "referrals_count": user.get("referrals_count", 0),
    }


@app.post("/api/user/referral/apply", tags=["User"])
async def apply_referral_code(req: ReferralCodeRequest, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get().to_dict()

    if user.get("referred_by"):
        raise HTTPException(400, "You have already used a referral code")

    referrers = db.collection("users").where("referral_code", "==", req.code).limit(1).stream()
    referrer = None
    for r in referrers:
        referrer = r
        break

    if not referrer:
        raise HTTPException(404, "Invalid referral code")

    referrer_id = referrer.id
    if referrer_id == user_id:
        raise HTTPException(400, "Cannot use your own referral code")

    bonus = calculate_referral_bonus(True)
    user_ref.update({
        "referred_by": referrer_id,
        "referral_bonus": bonus["referee_bonus"],
        "wallet_balance": firestore.Increment(bonus["referee_bonus"]),
    })

    db.collection("users").document(referrer_id).update({
        "referrals_count": firestore.Increment(1),
        "referral_bonus_earned": firestore.Increment(bonus["referrer_bonus"]),
        "wallet_balance": firestore.Increment(bonus["referrer_bonus"]),
    })

    return {
        "status": "applied",
        "bonus_received": bonus["referee_bonus"],
        "message": f"You received ₾{bonus['referee_bonus']} bonus!",
    }


# =========================
# DRIVER TIPS
# =========================

@app.post("/api/rides/{ride_id}/tip", tags=["Rides"])
async def add_tip(ride_id: str, tip: TipRequest, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()

    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride.to_dict()
    actual_rider_id = ride_data.get("rider_id") or ride_data.get("userId") or ride_data.get("user_id")

    if actual_rider_id != user_id:
        raise HTTPException(403, "Not your ride")
    if ride_data.get("status") != "completed":
        raise HTTPException(400, "Can only tip completed rides")

    driver_id = ride_data.get("driver_id") or ride_data.get("driverId")
    if not driver_id:
        raise HTTPException(400, "No driver to tip")

    ride_ref.update({"tip_amount": tip.amount, "tip_added_at": firestore.SERVER_TIMESTAMP})
    db.collection("users").document(driver_id).update({
        "earnings.balance": firestore.Increment(tip.amount),
        "earnings.total_tips": firestore.Increment(tip.amount),
    })

    return {"status": "tip_added", "amount": tip.amount}


# =========================
# TRIP RECEIPTS
# =========================

@app.get("/api/rides/{ride_id}/receipt", tags=["Rides"])
async def get_trip_receipt(ride_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    ride = db.collection("rides").document(ride_id).get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride.to_dict()
    actual_rider_id = ride_data.get("rider_id") or ride_data.get("userId") or ride_data.get("user_id")
    actual_driver_id = ride_data.get("driver_id") or ride_data.get("driverId")

    if actual_rider_id != user_id and actual_driver_id != user_id:
        raise HTTPException(403, "Not authorized")

    raw_payment = ride_data.get("payment_method") or ride_data.get("paymentMethod") or "cash"
    safe_payment_method = str(raw_payment).lower()

    receipt = {
        "ride_id": ride_id,
        "date": serialize_firestore_data(ride_data).get("created_at"),
        "pickup": ride_data.get("pickup_address") or ride_data.get("pickup"),
        "destination": ride_data.get("destination_address") or ride_data.get("destination"),
        "stops": ride_data.get("stops", []),
        "distance_km": ride_data.get("billed_distance", ride_data.get("estimated_distance")),
        "duration_min": ride_data.get("actual_duration_min"),
        "car_type": ride_data.get("car_type") or ride_data.get("carType"),
        "payment_method": safe_payment_method,
        "paymentMethod": safe_payment_method,
        "fare_breakdown": ride_data.get("fare_breakdown", {}),
        "subtotal": ride_data.get("estimated_fare", 0),
        "tip": ride_data.get("tip_amount", 0),
        "total": ride_data.get("final_fare", ride_data.get("estimated_fare", 0)),
        "wallet_used": ride_data.get("wallet_used", 0),
        "cash_collected": ride_data.get("cash_to_collect", 0),
        "driver_name": ride_data.get("driver_info", {}).get("name", "Unknown Driver") if ride_data.get("driver_info") else "Unknown Driver",
        "driver_rating": ride_data.get("driver_rating", 5.0),
        "vehicle": ride_data.get("driver_info", {}),
    }
    return receipt


# =========================
# USER LANGUAGE PREFERENCE
# =========================

@app.post("/api/user/language", tags=["User"])
async def set_language_preference(lang: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    db.collection("users").document(user_id).update({"preferred_language": lang})
    return {"status": "updated", "language": lang}


@app.get("/api/user/language", tags=["User"])
async def get_language_preference(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    user = db.collection("users").document(user_id).get().to_dict()
    return {"language": user.get("preferred_language", "en")}


# =========================
# DRIVER CAMPAIGNS
# =========================

from driver_campaigns import (
    CreateCampaignRequest, UpdateCampaignRequest, CampaignType, CampaignStatus,
    CAMPAIGN_TEMPLATES, calculate_campaign_progress, get_campaign_emoji,
)


@app.get("/api/admin/campaigns/templates", tags=["Campaigns"])
async def get_campaign_templates():
    return {"templates": CAMPAIGN_TEMPLATES}


@app.post("/api/admin/campaigns", tags=["Campaigns"])
async def create_campaign(campaign: CreateCampaignRequest):
    db = get_db()
    campaign_data = {
        "title": campaign.title,
        "description": campaign.description,
        "campaign_type": campaign.campaign_type,
        "target_value": campaign.target_value,
        "bonus_amount": campaign.bonus_amount,
        "start_date": campaign.start_date,
        "end_date": campaign.end_date,
        "min_rating": campaign.min_rating,
        "area_coords": campaign.area_coords,
        "peak_hours": campaign.peak_hours,
        "max_participants": campaign.max_participants,
        "is_recurring": campaign.is_recurring,
        "icon": campaign.icon,
        "color": campaign.color,
        "status": "active",
        "participants_count": 0,
        "completions_count": 0,
        "total_bonus_paid": 0,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection("campaigns").add(campaign_data)
    return {"status": "created", "campaign_id": ref[1].id, "message": f"Campaign '{campaign.title}' created"}


@app.post("/api/admin/campaigns/from-template/{template_id}", tags=["Campaigns"])
async def create_campaign_from_template(template_id: str, start_date: str, end_date: str):
    if template_id not in CAMPAIGN_TEMPLATES:
        raise HTTPException(404, "Template not found")
    template = CAMPAIGN_TEMPLATES[template_id]
    db = get_db()
    campaign_data = {
        **template,
        "start_date": start_date,
        "end_date": end_date,
        "status": "active",
        "participants_count": 0,
        "completions_count": 0,
        "total_bonus_paid": 0,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    ref = db.collection("campaigns").add(campaign_data)
    return {"status": "created", "campaign_id": ref[1].id}


@app.get("/api/admin/campaigns", tags=["Campaigns"])
async def get_all_campaigns(status: str = None):
    db = get_db()
    query = db.collection("campaigns")
    if status:
        query = query.where("status", "==", status)
    result = []
    for campaign in query.stream():
        data = campaign.to_dict()
        data["id"] = campaign.id
        data["emoji"] = get_campaign_emoji(data.get("icon", "gift"))
        result.append(serialize_firestore_data(data))
    result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"campaigns": result}


@app.get("/api/admin/campaigns/{campaign_id}", tags=["Campaigns"])
async def get_campaign_details(campaign_id: str):
    db = get_db()
    campaign = db.collection("campaigns").document(campaign_id).get()
    if not campaign.exists:
        raise HTTPException(404, "Campaign not found")

    campaign_data = campaign.to_dict()
    campaign_data["id"] = campaign_id
    campaign_data["emoji"] = get_campaign_emoji(campaign_data.get("icon", "gift"))

    participants = db.collection("campaign_progress").where("campaign_id", "==", campaign_id).stream()
    participant_list = []
    for p in participants:
        p_data = p.to_dict()
        driver = db.collection("users").document(p_data.get("driver_id", "")).get()
        if driver.exists:
            driver_data = driver.to_dict()
            p_data["driver_name"] = driver_data.get("name", "Unknown")
            p_data["driver_phone"] = driver_data.get("cellphone", "")
        participant_list.append(serialize_firestore_data(p_data))

    campaign_data["participants"] = participant_list
    return serialize_firestore_data(campaign_data)


@app.put("/api/admin/campaigns/{campaign_id}", tags=["Campaigns"])
async def update_campaign(campaign_id: str, update: UpdateCampaignRequest):
    db = get_db()
    update_data = {"updated_at": firestore.SERVER_TIMESTAMP}
    if update.title:
        update_data["title"] = update.title
    if update.description:
        update_data["description"] = update.description
    if update.bonus_amount:
        update_data["bonus_amount"] = update.bonus_amount
    if update.end_date:
        update_data["end_date"] = update.end_date
    if update.status:
        update_data["status"] = update.status
    db.collection("campaigns").document(campaign_id).update(update_data)
    return {"status": "updated"}


@app.delete("/api/admin/campaigns/{campaign_id}", tags=["Campaigns"])
async def delete_campaign(campaign_id: str):
    db = get_db()
    db.collection("campaigns").document(campaign_id).update({
        "status": "cancelled",
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"status": "cancelled"}


@app.get("/api/driver/campaigns", tags=["Campaigns"])
async def get_active_campaigns_for_driver(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    driver = db.collection("users").document(user_id).get()
    driver_data = driver.to_dict() if driver.exists else {}
    driver_rating = driver_data.get("rating", 5.0)

    result = []
    for campaign in db.collection("campaigns").where("status", "==", "active").stream():
        c_data = campaign.to_dict()
        c_data["id"] = campaign.id

        min_rating = c_data.get("min_rating")
        c_data["eligible"] = not (min_rating and driver_rating < min_rating)
        c_data["eligibility_reason"] = f"Requires {min_rating}+ rating" if not c_data["eligible"] else None

        progress_data = None
        for p in (
            db.collection("campaign_progress")
            .where("campaign_id", "==", campaign.id)
            .where("driver_id", "==", user_id)
            .limit(1)
            .stream()
        ):
            progress_data = p.to_dict()
            break

        target = c_data.get("target_value", 1)
        current = progress_data.get("current_progress", 0) if progress_data else 0
        c_data["joined"] = progress_data is not None
        c_data["progress"] = {
            "current": current,
            "target": target,
            "percentage": round((current / target) * 100, 1),
            "completed": progress_data.get("completed", False) if progress_data else False,
        }
        c_data["emoji"] = get_campaign_emoji(c_data.get("icon", "gift"))
        result.append(serialize_firestore_data(c_data))

    return {"campaigns": result}


@app.post("/api/driver/campaigns/{campaign_id}/join", tags=["Campaigns"])
async def join_campaign(campaign_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    campaign = db.collection("campaigns").document(campaign_id).get()
    if not campaign.exists:
        raise HTTPException(404, "Campaign not found")

    c_data = campaign.to_dict()
    if c_data.get("status") != "active":
        raise HTTPException(400, "Campaign is not active")
    if c_data.get("max_participants") and c_data.get("participants_count", 0) >= c_data.get("max_participants"):
        raise HTTPException(400, "Campaign is full")

    driver = db.collection("users").document(user_id).get()
    if driver.exists and c_data.get("min_rating"):
        if driver.to_dict().get("rating", 5.0) < c_data.get("min_rating"):
            raise HTTPException(400, f"Requires {c_data.get('min_rating')}+ rating")

    for _ in (
        db.collection("campaign_progress")
        .where("campaign_id", "==", campaign_id)
        .where("driver_id", "==", user_id)
        .limit(1)
        .stream()
    ):
        raise HTTPException(400, "Already joined this campaign")

    db.collection("campaign_progress").add({
        "campaign_id": campaign_id,
        "driver_id": user_id,
        "current_progress": 0,
        "completed": False,
        "bonus_paid": False,
        "joined_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    db.collection("campaigns").document(campaign_id).update({"participants_count": firestore.Increment(1)})
    return {"status": "joined", "message": f"You've joined '{c_data.get('title')}'!"}


@app.get("/api/driver/campaigns/my-progress", tags=["Campaigns"])
async def get_my_campaign_progress(user_id: str = Depends(get_current_user_id)):
    db = get_db()
    result = []
    for p in db.collection("campaign_progress").where("driver_id", "==", user_id).stream():
        p_data = p.to_dict()
        campaign = db.collection("campaigns").document(p_data.get("campaign_id")).get()
        if campaign.exists:
            c_data = campaign.to_dict()
            c_data["id"] = campaign.id
            target = c_data.get("target_value", 1)
            current = p_data.get("current_progress", 0)
            c_data["progress"] = {
                "current": current,
                "target": target,
                "percentage": round((current / target) * 100, 1),
                "completed": p_data.get("completed", False),
                "bonus_paid": p_data.get("bonus_paid", False),
            }
            c_data["emoji"] = get_campaign_emoji(c_data.get("icon", "gift"))
            result.append(serialize_firestore_data(c_data))
    return {"campaigns": result}


async def update_driver_campaign_progress(driver_id: str, ride_data: dict):
    db = get_db()
    for p in (
        db.collection("campaign_progress")
        .where("driver_id", "==", driver_id)
        .where("completed", "==", False)
        .stream()
    ):
        p_data = p.to_dict()
        campaign_id = p_data.get("campaign_id")

        campaign = db.collection("campaigns").document(campaign_id).get()
        if not campaign.exists:
            continue

        c_data = campaign.to_dict()
        if c_data.get("status") != "active":
            continue

        campaign_type = c_data.get("campaign_type")
        increment = 0

        if campaign_type == "rides_count":
            increment = 1
        elif campaign_type == "earnings_target":
            increment = ride_data.get("driver_earnings", 0)
        elif campaign_type == "peak_hours":
            peak_hours = c_data.get("peak_hours", [])
            if datetime.now().hour in peak_hours:
                increment = 1
        elif campaign_type == "rating_bonus":
            min_rating = c_data.get("min_rating", 4.5)
            driver = db.collection("users").document(driver_id).get()
            if driver.exists and driver.to_dict().get("rating", 0) >= min_rating:
                increment = 1

        if increment > 0:
            new_progress = p_data.get("current_progress", 0) + increment
            target = c_data.get("target_value", 0)
            completed = new_progress >= target

            update_data = {"current_progress": new_progress, "updated_at": firestore.SERVER_TIMESTAMP}

            if completed and not p_data.get("completed"):
                update_data["completed"] = True
                update_data["completed_at"] = firestore.SERVER_TIMESTAMP

                bonus_amount = c_data.get("bonus_amount", 0)
                db.collection("users").document(driver_id).update({
                    "earnings.balance": firestore.Increment(bonus_amount),
                    "earnings.campaign_bonuses": firestore.Increment(bonus_amount),
                })

                update_data["bonus_paid"] = True
                update_data["bonus_paid_at"] = firestore.SERVER_TIMESTAMP

                db.collection("campaigns").document(campaign_id).update({
                    "completions_count": firestore.Increment(1),
                    "total_bonus_paid": firestore.Increment(bonus_amount),
                })

            db.collection("campaign_progress").document(p.id).update(update_data)


# =========================
# PAYPAL CLIENT TOKEN
# =========================

@app.get("/api/paypal/client-token", tags=["Payments"])
async def get_paypal_client_token():
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        raise HTTPException(500, "PayPal credentials not configured")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            auth_response = await client.post(
                f"{PAYPAL_API_BASE}/v1/oauth2/token",
                auth=(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET),
                data={"grant_type": "client_credentials"},
            )
            if auth_response.status_code not in (200, 201):
                raise HTTPException(500, "Failed to authenticate with PayPal")

            access_token = auth_response.json().get("access_token")

            token_response = await client.post(
                f"{PAYPAL_API_BASE}/v1/identity/generate-token",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            return token_response.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PayPal client token error: {e}")
        raise HTTPException(500, "Failed to generate PayPal client token")


# =========================
# HEALTH
# =========================

@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "timestamp": now_iso(),
        "paypal_mode": PAYPAL_MODE,
    }


@app.get("/api/", tags=["Health"])
async def root():
    return {"message": "T'aksi API v3 - Firebase Edition"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=False,  # Never reload in production
    )