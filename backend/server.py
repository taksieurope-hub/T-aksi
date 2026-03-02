import logging
from contextlib import asynccontextmanager
import math
import os
import asyncio
import base64
import json
import re
from typing import List, Optional
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import firebase_admin
from firebase_admin import credentials, firestore, storage, messaging

from fastapi import FastAPI, HTTPException, Query, Header, Depends, BackgroundTasks, File, UploadFile, Form
import shutil
from pydantic import BaseModel, Field, ConfigDict
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import bcrypt
import jwt
import httpx
import sys
import secrets

# =========================
# ENV + INITIALIZATION
# =========================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("taksi")

JWT_SECRET = os.environ.get("JWT_SECRET")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

if not JWT_SECRET or JWT_SECRET == "taksi_galactic_secret_2025_secure_key":
    print("🚨 FATAL ERROR: JWT_SECRET is missing or insecure! Shutting down.")
    sys.exit(1)

if not ADMIN_PASSWORD:
    print("🚨 FATAL ERROR: ADMIN_PASSWORD is missing! Shutting down.")
    sys.exit(1)

JWT_ALGORITHM = "HS256"

PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET")
PAYPAL_MODE = os.environ.get("PAYPAL_MODE", "live").lower()

if PAYPAL_MODE == "sandbox":
    PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com"
    logger.warning("PayPal is running in SANDBOX mode")
else:
    PAYPAL_API_BASE = "https://api-m.paypal.com"
    logger.info("PayPal is running in LIVE mode")

FIREBASE_STORAGE_BUCKET = os.environ.get("FIREBASE_STORAGE_BUCKET", "")

SERVICE_ACCOUNT_PATH = Path(os.environ.get(
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    str(ROOT_DIR / "firebase-service-account.json")
))
FIREBASE_SA_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")


def init_firebase():
    if firebase_admin._apps:
        return
    try:
        render_secret_path = "/etc/secrets/serviceAccountKey.json"
        if os.path.exists(render_secret_path):
            cred = credentials.Certificate(render_secret_path)
            firebase_admin.initialize_app(cred, {"storageBucket": FIREBASE_STORAGE_BUCKET})
            logger.info("✅ Firebase initialized from Render Secret File.")
            return
        if SERVICE_ACCOUNT_PATH.exists():
            cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
            firebase_admin.initialize_app(cred, {"storageBucket": FIREBASE_STORAGE_BUCKET})
            logger.info(f"✅ Firebase initialized from local file: {SERVICE_ACCOUNT_PATH}")
            return
        firebase_admin.initialize_app()
        logger.warning("Firebase Admin initialized using default credentials.")
    except Exception as e:
        logger.error(f"FATAL: Could not initialize Firebase Admin SDK: {e}")
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


# =========================
# PUSH NOTIFICATIONS (FCM)
# =========================

def send_push_notification(user_id: str, title: str, body: str, data: dict = None):
    try:
        db = get_db()
        token = None

        user_doc = db.collection("users").document(user_id).get()
        if user_doc.exists:
            token = user_doc.to_dict().get("fcm_token")

        if not token:
            rider_doc = db.collection("riders").document(user_id).get()
            if rider_doc.exists:
                token = rider_doc.to_dict().get("fcm_token")

        if not token:
            logger.debug(f"No FCM token for user {user_id}")
            return

        safe_data = {k: str(v) for k, v in (data or {}).items()}

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=safe_data,
            token=token,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(sound="default", default_vibrate_timings=True),
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(aps=messaging.Aps(sound="default", badge=1)),
            ),
        )

        response = messaging.send(message)
        logger.info(f"Push sent to {user_id}: {response}")

    except messaging.UnregisteredError:
        logger.warning(f"FCM token for {user_id} is invalid. Clearing.")
        try:
            db = get_db()
            db.collection("users").document(user_id).update({"fcm_token": firestore.DELETE_FIELD})
            db.collection("riders").document(user_id).update({"fcm_token": firestore.DELETE_FIELD})
        except Exception:
            pass
    except Exception as e:
        logger.warning(f"Push notification failed for {user_id}: {e}")


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


def get_admin_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.replace("Bearer ", "")
    decoded = decode_token(token)
    if not decoded or "user_id" not in decoded:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = decoded["user_id"]
    db = get_db()
    user_doc = db.collection("users").document(user_id).get()

    if not user_doc.exists:
        if decoded.get("role") == "admin":
            return user_id
        raise HTTPException(status_code=401, detail="User not found")

    user_data = user_doc.to_dict()
    if user_data.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id


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
        logger.error("PayPal credentials missing")
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


async def upload_file_to_storage(file: UploadFile, path: str) -> Optional[str]:
    if not file:
        return None
    if not FIREBASE_STORAGE_BUCKET:
        logger.warning("FIREBASE_STORAGE_BUCKET not set — file upload skipped")
        return None
    try:
        bucket = storage.bucket()
        blob = bucket.blob(path)
        blob.upload_from_file(file.file, content_type=file.content_type or "application/octet-stream")
        blob.make_public()
        return blob.public_url
    except Exception as e:
        logger.error(f"Firebase Storage upload failed for {path}: {e}")
        return None


# =========================
# OTP / PHONE VERIFICATION
# =========================

OTP_TTL_SECONDS = 600


def _generate_otp() -> str:
    return str(secrets.randbelow(9000) + 1000)


def _send_otp_code(phone: str, code: str):
    logger.info(f"[OTP] {phone} → {code}")


# =========================
# SCHEDULED RIDE DISPATCHER
# =========================

DISPATCH_CHECK_INTERVAL = 60


async def _dispatch_scheduled_rides_loop():
    logger.info("Scheduled ride dispatcher started.")
    while True:
        try:
            await _check_and_dispatch_scheduled_rides()
        except Exception as e:
            logger.error(f"Dispatcher loop error: {e}")
        await asyncio.sleep(DISPATCH_CHECK_INTERVAL)


async def _check_and_dispatch_scheduled_rides():
    db = get_db()

    pending = list(
        db.collection("scheduled_rides")
        .where("status", "==", "scheduled")
        .stream()
    )

    for snap in pending:
        data = snap.to_dict()
        scheduled_time = data.get("scheduled_time", "")

        try:
            if scheduled_time.endswith("Z"):
                scheduled_time = scheduled_time[:-1] + "+00:00"
            sched_dt = datetime.fromisoformat(scheduled_time)
            if sched_dt.tzinfo is None:
                sched_dt = sched_dt.replace(tzinfo=timezone.utc)
        except Exception:
            logger.warning(f"Skipping scheduled ride {snap.id}: bad scheduled_time")
            continue

        if datetime.now(timezone.utc) < sched_dt:
            continue

        rider_id = data.get("rider_id")
        logger.info(f"Dispatching scheduled ride {snap.id} for rider {rider_id}")

        snap.reference.update({"status": "dispatching", "dispatched_at": firestore.SERVER_TIMESTAMP})

        try:
            surge_info = get_surge_multiplier(data.get("pickup_lat", 0), data.get("pickup_lng", 0))
            surge_multiplier = surge_info["multiplier"]
            commission_rate = surge_info["commission_rate"]

            fare = calculate_fare(
                data.get("car_type", "economy"), 5, 0, 0,
                len(data.get("stops", [])), surge_multiplier,
            )

            payment_method = data.get("payment_method", "cash")
            service_fee = 2.0 if payment_method == "card" else 0.0
            fare["service_fee"] = service_fee
            fare["total"] += service_fee

            ride_ref = db.collection("rides").document()
            ride_doc = {
                "id": ride_ref.id,
                "userId": rider_id,
                "rider_id": rider_id,
                "carType": data.get("car_type", "economy"),
                "pickup": data.get("pickup_address", ""),
                "pickup_lat": data.get("pickup_lat", 0),
                "pickup_lng": data.get("pickup_lng", 0),
                "destination": data.get("destination_address", ""),
                "destination_lat": data.get("destination_lat", 0),
                "destination_lng": data.get("destination_lng", 0),
                "stops": data.get("stops", []),
                "num_stops": len(data.get("stops", [])),
                "payment_method": payment_method,
                "paymentMethod": payment_method,
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
                "scheduled_ride_id": snap.id,
                "source": "scheduled",
                "actual_distance": 0,
                "pickup_wait_minutes": 0,
                "stop_wait_minutes": 0,
                "route_points": [],
                "created_at": firestore.SERVER_TIMESTAMP,
            }
            ride_ref.set(ride_doc)

            send_push_notification(
                rider_id,
                title="Your Scheduled Ride is Starting 🚕",
                body=f"We're finding you a driver now. Pickup: {data.get('pickup_address', '')}",
                data={"type": "scheduled_ride_dispatched", "ride_id": ride_ref.id},
            )

            asyncio.create_task(match_drivers_to_ride(ride_ref.id))

            snap.reference.update({
                "status": "dispatched",
                "live_ride_id": ride_ref.id,
                "dispatched_at": firestore.SERVER_TIMESTAMP,
            })

        except Exception as e:
            logger.error(f"Failed to dispatch scheduled ride {snap.id}: {e}")
            snap.reference.update({"status": "scheduled"})


# =========================
# FASTAPI APP
# =========================

@asynccontextmanager
async def lifespan(app_instance):
    dispatcher_task = asyncio.create_task(_dispatch_scheduled_rides_loop())
    logger.info("Background dispatcher task started.")
    yield
    dispatcher_task.cancel()
    try:
        await dispatcher_task
    except asyncio.CancelledError:
        pass
    logger.info("Background dispatcher task stopped.")


app = FastAPI(title="T'aksi API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://t-aksi-frontend.onrender.com",
        "https://t-aksi-driver.onrender.com",
        "https://taksi-admin.onrender.com",
        "https://taksi.ge",
    ],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- RATE LIMITING ---
import time
from collections import defaultdict
from starlette.responses import JSONResponse
from fastapi import Request

AUTH_RATE_LIMIT_WINDOW = 900
AUTH_MAX_REQUESTS = 10
RATE_LIMIT_WINDOW = 900
MAX_REQUESTS = 2000

ip_tracker: dict = defaultdict(list)
auth_ip_tracker: dict = defaultdict(list)

AUTH_PATHS = {
    "/api/auth/login", "/api/rider/login", "/api/driver/login",
    "/api/auth/register/rider", "/api/auth/register/driver",
    "/api/driver/register", "/api/admin/login",
}

RATE_LIMIT_EXEMPT = {
    "/api/driver/location",
    "/api/driver/rides/available",
    "/api/surge/status",
    "/api/health",
    "/api/worker/ping",
}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path

    if path in RATE_LIMIT_EXEMPT:
        return await call_next(request)

    client_ip = request.client.host if request.client else "127.0.0.1"
    current_time = time.time()

    if path in AUTH_PATHS:
        auth_ip_tracker[client_ip] = [
            t for t in auth_ip_tracker[client_ip] if current_time - t < AUTH_RATE_LIMIT_WINDOW
        ]
        if len(auth_ip_tracker[client_ip]) >= AUTH_MAX_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many login attempts. Please try again in 15 minutes."},
                headers={"Access-Control-Allow-Origin": "*"},
            )
        auth_ip_tracker[client_ip].append(current_time)

    ip_tracker[client_ip] = [t for t in ip_tracker[client_ip] if current_time - t < RATE_LIMIT_WINDOW]
    if len(ip_tracker[client_ip]) >= MAX_REQUESTS:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again in 15 minutes."},
            headers={"Access-Control-Allow-Origin": "*"},
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


class OTPSendRequest(BaseModel):
    cellphone: str = Field(min_length=6, max_length=20)


class OTPVerifyRequest(BaseModel):
    cellphone: str = Field(min_length=6, max_length=20)
    code: str = Field(min_length=4, max_length=8)


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
    pickup: Optional[str] = None
    pickup_lat: Optional[float] = Field(None, alias="pickupLat")
    pickup_lng: Optional[float] = Field(None, alias="pickupLng")
    destination: Optional[str] = None
    destination_lat: Optional[float] = Field(None, alias="destinationLat")
    destination_lng: Optional[float] = Field(None, alias="destinationLng")
    stops: Optional[List[dict]] = []
    payment_method: Optional[str] = Field("cash", alias="paymentMethod")
    payment_order_id: Optional[str] = Field(None, alias="paymentOrderId")
    estimated_distance: Optional[float] = Field(0, alias="estimatedDistance")
    estimated_duration: Optional[int] = Field(0, alias="estimatedDuration")
    price: Optional[float] = 0.0

    model_config = ConfigDict(populate_by_name=True, extra="allow")


class ScheduledRideRequest(BaseModel):
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    destination_address: str
    destination_lat: float
    destination_lng: float
    scheduled_time: str
    car_type: str = "economy"
    payment_method: str = "cash"
    stops: Optional[List[dict]] = []


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


class SOSRequest(BaseModel):
    ride_id: Optional[str] = None
    lat: float = 0.0
    lng: float = 0.0
    message: Optional[str] = "SOS triggered"


class TipRequest(BaseModel):
    amount: float = Field(gt=0, le=500)
    tip_amount: Optional[float] = None
    reference_id: Optional[str] = None


class FavoriteLocation(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    address: str
    lat: float
    lng: float
    icon: Optional[str] = "📍"


class ReferralApplyRequest(BaseModel):
    code: str


class ShareRideRequest(BaseModel):
    recipient_phone: Optional[str] = None
    recipient_email: Optional[str] = None


class SupportMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class AdminLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class FleetVehicleModel(BaseModel):
    car_make: str
    car_model: str
    car_year: int
    car_color: str
    license_plate: str
    driver_name: str
    driver_phone: str
    car_type: str = "economy"


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    surname: Optional[str] = None
    email: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class AdminUpdateUserRequest(BaseModel):
    name: Optional[str] = None
    surname: Optional[str] = None
    email: Optional[str] = None
    cellphone: Optional[str] = None
    is_online: Optional[bool] = None
    registration_status: Optional[str] = None


# =========================
# PRICING + SURGE
# =========================

PRICING_RULES = {
    "economy": {
        "base": 2.00, "per_km": 0.50, "per_minute_wait": 0.50,
        "free_wait_minutes": 2, "stop_fee": 0.00,
        "long_distance_threshold": 7.0, "long_distance_fee_per_km": 0.15,
        "very_long_threshold": 30.0, "very_long_surcharge_per_15km": 5.00,
    },
    "comfort": {
        "base": 2.50, "per_km": 0.55, "per_minute_wait": 0.50,
        "free_wait_minutes": 2, "stop_fee": 0.00,
        "long_distance_threshold": 7.0, "long_distance_fee_per_km": 0.18,
        "very_long_threshold": 30.0, "very_long_surcharge_per_15km": 6.00,
    },
    "suv": {
        "base": 3.90, "per_km": 0.80, "per_minute_wait": 0.50,
        "free_wait_minutes": 2, "stop_fee": 0.00,
        "long_distance_threshold": 7.0, "long_distance_fee_per_km": 0.25,
        "very_long_threshold": 30.0, "very_long_surcharge_per_15km": 8.00,
    },
    "personal": {
        "base": 4.00, "per_km": 0.70, "per_minute_wait": 0.50,
        "free_wait_minutes": 2, "stop_fee": 0.00,
        "long_distance_threshold": 7.0, "long_distance_fee_per_km": 0.20,
        "very_long_threshold": 30.0, "very_long_surcharge_per_15km": 7.00,
    },
    "jumpstart": {
        "base": 4.50, "per_km": 0.00, "per_minute_wait": 0.50,
        "free_wait_minutes": 999, "stop_fee": 0.00,
        "long_distance_threshold": 999.0, "long_distance_fee_per_km": 0.00,
        "very_long_threshold": 999.0, "very_long_surcharge_per_15km": 0.00,
    },
}

DRIVER_COMMISSION_RATE = 0.23

SURGE_SCHEDULE = {
    2: {"start": 18, "end": 26},
    4: {"start": 18, "end": 28},
    5: {"start": 18, "end": 28},
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
                if haversine_distance(lat, lng, ride_lat, ride_lng) <= 5:
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
                if haversine_distance(lat, lng, driver_loc["lat"], driver_loc["lng"]) <= 5:
                    nearby_drivers += 1

        if nearby_drivers == 0:
            return 1.0 if nearby_rides > 0 else 0.0
        return min(1.0, nearby_rides / max(1, nearby_drivers * 2))
    except Exception as e:
        logger.warning(f"Error calculating area demand: {e}")
        return 0.3


def get_surge_multiplier(lat: float = None, lng: float = None) -> dict:
    if not is_surge_time():
        return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None}

    demand = 0.5
    if lat and lng:
        demand = get_area_demand(lat, lng)

    if demand >= 0.75:
        multiplier, reason = 2.0, "Very high demand"
    elif demand >= 0.5:
        multiplier, reason = 1.8, "High demand"
    elif demand >= 0.25:
        multiplier, reason = 1.5, "Moderate demand"
    else:
        multiplier, reason = 1.2, "Surge hours"

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
        long_distance_fee = (distance_km - rules["long_distance_threshold"]) * rules["long_distance_fee_per_km"]

    very_long_surcharge = 0.0
    if distance_km > rules["very_long_threshold"]:
        extra_km = distance_km - rules["very_long_threshold"]
        very_long_surcharge = math.ceil(extra_km / 15) * rules["very_long_surcharge_per_15km"]

    pickup_wait_fee = max(0, wait_minutes - rules["free_wait_minutes"]) * rules["per_minute_wait"]
    stop_wait_fee = stop_wait_minutes * rules["per_minute_wait"]
    stop_fee = num_stops * rules["stop_fee"]

    subtotal = base_fare + distance_fare + long_distance_fee + very_long_surcharge + pickup_wait_fee + stop_wait_fee + stop_fee
    surge_fee = subtotal * (surge_multiplier - 1.0) if surge_multiplier > 1.0 else 0.0
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
# HEALTH
# =========================

@app.get("/api/health", tags=["System"])
async def health_check():
    return {"status": "ok", "timestamp": now_iso()}


@app.get("/api/worker/ping", tags=["System"])
async def worker_ping():
    return {"status": "alive", "timestamp": now_iso()}


# =========================
# AUTH ROUTES
# =========================

@app.post("/api/auth/register/rider", tags=["Auth"])
async def register_rider(data: UserRegister, x_phone_verified: Optional[str] = Header(None)):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

    if not x_phone_verified:
        raise HTTPException(403, "Phone number must be verified before registering.")
    token_data = decode_token(x_phone_verified)
    if not token_data or token_data.get("role") != "phone_verified":
        raise HTTPException(403, "Invalid or expired phone verification token.")
    if token_data.get("user_id") != phone_norm:
        raise HTTPException(403, "Phone token does not match the phone number being registered.")

    otp_doc = db.collection("otp_codes").document(phone_norm).get()
    if not otp_doc.exists or not otp_doc.to_dict().get("verified"):
        raise HTTPException(403, "Phone number has not been verified via OTP.")

    existing = list(db.collection("users").where("cellphone_norm", "==", phone_norm).limit(1).stream())
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
    safe_user = {k: v for k, v in user_data.items() if k != "password_hash"}
    safe_user["id"] = user_ref.id
    safe_user["created_at"] = now_iso()
    return {"token": token, "user": safe_user}


@app.post("/api/auth/register/driver", tags=["Auth"])
@app.post("/api/driver/register", tags=["Auth"])
async def register_driver(data: UserRegister, x_phone_verified: Optional[str] = Header(None)):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

    if not x_phone_verified:
        raise HTTPException(403, "Phone number must be verified before registering.")
    token_data = decode_token(x_phone_verified)
    if not token_data or token_data.get("role") != "phone_verified":
        raise HTTPException(403, "Invalid or expired phone verification token.")
    if token_data.get("user_id") != phone_norm:
        raise HTTPException(403, "Phone token does not match the phone number being registered.")

    otp_doc = db.collection("otp_codes").document(phone_norm).get()
    if not otp_doc.exists or not otp_doc.to_dict().get("verified"):
        raise HTTPException(403, "Phone number has not been verified via OTP.")

    existing = list(db.collection("users").where("cellphone_norm", "==", phone_norm).limit(1).stream())
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
    safe_user = {k: v for k, v in user_data.items() if k != "password_hash"}
    safe_user["id"] = user_ref.id
    safe_user["created_at"] = now_iso()
    return {"token": token, "user": safe_user}


@app.post("/api/auth/login", tags=["Auth"])
@app.post("/api/rider/login", tags=["Auth"])
async def login(data: UserLogin):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

    users = list(db.collection("users").where("cellphone_norm", "==", phone_norm).limit(1).stream())
    if not users:
        users = list(db.collection("users").where("cellphone", "==", data.cellphone).limit(1).stream())
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


@app.post("/api/auth/otp/send", tags=["Auth"])
async def send_otp(req: OTPSendRequest):
    db = get_db()
    phone_norm = normalize_phone(req.cellphone)
    if not phone_norm:
        raise HTTPException(422, "Invalid phone number")

    code = _generate_otp()
    expires_at = datetime.now(timezone.utc).timestamp() + OTP_TTL_SECONDS

    db.collection("otp_codes").document(phone_norm).set({
        "phone": phone_norm,
        "code": code,
        "expires_at": expires_at,
        "verified": False,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    _send_otp_code(phone_norm, code)
    return {"status": "sent", "dev_code": code, "expires_in": OTP_TTL_SECONDS}


@app.post("/api/auth/otp/verify", tags=["Auth"])
async def verify_otp(req: OTPVerifyRequest):
    db = get_db()
    phone_norm = normalize_phone(req.cellphone)
    doc = db.collection("otp_codes").document(phone_norm).get()

    if not doc.exists:
        raise HTTPException(400, "No OTP found for this number.")

    data = doc.to_dict()
    now_ts = datetime.now(timezone.utc).timestamp()

    if now_ts > data.get("expires_at", 0):
        raise HTTPException(400, "Code has expired. Please request a new one.")

    if data.get("code") != req.code.strip():
        raise HTTPException(400, "Incorrect code.")

    phone_token = create_token(phone_norm, "phone_verified")
    db.collection("otp_codes").document(phone_norm).update({
        "verified": True,
        "verified_at": firestore.SERVER_TIMESTAMP,
    })

    return {"status": "verified", "phone_token": phone_token}


@app.post("/api/admin/login", tags=["Admin"])
async def admin_login(data: AdminLoginRequest):
    if data.password != ADMIN_PASSWORD:
        raise HTTPException(401, "Invalid admin credentials")

    db = get_db()
    admins = list(db.collection("users").where("user_type", "==", "admin").limit(1).stream())
    if admins:
        admin_doc = admins[0]
        token = create_token(admin_doc.id, "admin")
        safe_user = {k: v for k, v in admin_doc.to_dict().items() if k != "password_hash"}
        safe_user["id"] = admin_doc.id
        return {"token": token, "user": serialize_firestore_data(safe_user)}

    admin_ref = db.collection("users").document("admin_master")
    admin_data = {
        "id": "admin_master",
        "name": "System",
        "surname": "Admin",
        "cellphone": "admin",
        "cellphone_norm": "admin",
        "user_type": "admin",
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    admin_ref.set(admin_data)
    token = create_token("admin_master", "admin")
    return {"token": token, "user": {**admin_data, "created_at": now_iso()}}


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
async def get_current_user(user_id: Optional[str] = Depends(get_current_user_id)):
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


@app.put("/api/auth/profile", tags=["Auth"])
async def update_profile(req: UpdateProfileRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "No fields to update")
    update_data["updated_at"] = firestore.SERVER_TIMESTAMP
    db.collection("users").document(user_id).update(update_data)
    doc = db.collection("users").document(user_id).get()
    safe_user = {k: v for k, v in doc.to_dict().items() if k != "password_hash"}
    safe_user["id"] = doc.id
    return serialize_firestore_data(safe_user)


@app.post("/api/auth/change-password", tags=["Auth"])
async def change_password(req: ChangePasswordRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "User not found")
    user_data = doc.to_dict()
    if not verify_password(req.current_password, user_data.get("password_hash", "")):
        raise HTTPException(400, "Current password is incorrect")
    db.collection("users").document(user_id).update({
        "password_hash": hash_password(req.new_password),
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Password changed successfully"}


@app.post("/api/auth/fcm-token", tags=["Auth"])
async def update_fcm_token(
    token: str = Query(...),
    user_id: Optional[str] = Depends(get_current_user_id),
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    db.collection("users").document(user_id).update({
        "fcm_token": token,
        "fcm_updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "FCM token updated"}


# =========================
# SOS ROUTES
# =========================

@app.post("/api/sos", tags=["Safety"])
async def trigger_sos(req: SOSRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    db = get_db()

    user_name = "Unknown"
    user_phone = ""
    if user_id:
        user_doc = db.collection("users").document(user_id).get()
        if user_doc.exists:
            ud = user_doc.to_dict()
            user_name = f"{ud.get('name', '')} {ud.get('surname', '')}".strip()
            user_phone = ud.get("cellphone", "")

    sos_ref = db.collection("sos_alerts").document()
    sos_data = {
        "id": sos_ref.id,
        "user_id": user_id,
        "user_name": user_name,
        "user_phone": user_phone,
        "ride_id": req.ride_id,
        "lat": req.lat,
        "lng": req.lng,
        "message": req.message or "SOS triggered",
        "status": "active",
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    sos_ref.set(sos_data)

    logger.warning(f"🚨 SOS triggered by {user_name} ({user_phone}) at {req.lat},{req.lng}")
    return {"message": "SOS alert sent. Support team has been notified.", "alert_id": sos_ref.id}


@app.get("/api/admin/sos/active", tags=["Admin"])
async def get_active_sos(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    alerts = list(db.collection("sos_alerts").where("status", "==", "active").stream())
    result = [serialize_firestore_data({**a.to_dict(), "id": a.id}) for a in alerts]
    return {"alerts": result, "count": len(result)}


@app.post("/api/admin/sos/{alert_id}/resolve", tags=["Admin"])
async def resolve_sos(alert_id: str, notes: str = Query(default=""), admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("sos_alerts").document(alert_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(404, "SOS alert not found")
    ref.update({
        "status": "resolved",
        "resolved_by": admin_id,
        "resolution_notes": notes,
        "resolved_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "SOS alert resolved"}


# =========================
# ADMIN ROUTES
# =========================

@app.get("/api/admin/dashboard", tags=["Admin"])
async def get_dashboard(admin_id: str = Depends(get_admin_user)):
    db = get_db()

    all_users = list(db.collection("users").stream())
    riders = [u for u in all_users if u.to_dict().get("user_type") == "rider"]
    drivers = [u for u in all_users if u.to_dict().get("user_type") == "driver"]
    pending_drivers = [d for d in drivers if d.to_dict().get("registration_status") == "pending_review"]

    active_rides = list(
        db.collection("rides")
        .where("status", "in", ["searching", "accepted", "arrived", "in_progress"])
        .stream()
    )

    pending_topups = list(
        db.collection("driver_topup_requests").where("status", "==", "pending").stream()
    )
    pending_withdrawals = list(
        db.collection("driver_withdrawals").where("status", "==", "pending").stream()
    )

    sos_alerts = list(
        db.collection("sos_alerts").where("status", "==", "active").stream()
    )

    return {
        "total_riders": len(riders),
        "total_drivers": len(drivers),
        "active_rides": len(active_rides),
        "pending_driver_approvals": len(pending_drivers),
        "pending_topups": len(pending_topups),
        "pending_withdrawals": len(pending_withdrawals),
        "active_sos": len(sos_alerts),
    }


@app.get("/api/admin/riders", tags=["Admin"])
async def get_all_riders(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = list(db.collection("users").where("user_type", "==", "rider").stream())
    riders = []
    for doc in docs:
        data = {k: v for k, v in doc.to_dict().items() if k != "password_hash"}
        data["id"] = doc.id
        riders.append(serialize_firestore_data(data))
    return {"riders": riders}


@app.get("/api/admin/drivers", tags=["Admin"])
async def get_all_drivers(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = list(db.collection("users").where("user_type", "==", "driver").stream())
    drivers = []
    for doc in docs:
        data = {k: v for k, v in doc.to_dict().items() if k != "password_hash"}
        data["id"] = doc.id
        drivers.append(serialize_firestore_data(data))
    return {"drivers": drivers}


@app.get("/api/admin/drivers/pending", tags=["Admin"])
async def get_pending_drivers(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = list(
        db.collection("users")
        .where("user_type", "==", "driver")
        .where("registration_status", "==", "pending_review")
        .stream()
    )
    drivers = []
    for doc in docs:
        data = {k: v for k, v in doc.to_dict().items() if k != "password_hash"}
        data["id"] = doc.id
        drivers.append(serialize_firestore_data(data))
    return {"pending_drivers": drivers}


@app.get("/api/admin/drivers/{driver_id}", tags=["Admin"])
async def get_driver_detail(driver_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    doc = db.collection("users").document(driver_id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")
    data = {k: v for k, v in doc.to_dict().items() if k != "password_hash"}
    data["id"] = doc.id
    return {"driver": serialize_firestore_data(data)}

@app.get("/api/rides/{ride_id}/receipt", tags=["Rides"])
async def get_ride_receipt(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    db = get_db()
    doc = db.collection("rides").document(ride_id).get()
    if not doc.exists:
        raise HTTPException(404, "Ride not found")
    data = doc.to_dict()
    driver_info = data.get("driver_info", {}) or {}
    return serialize_firestore_data({
        "ride_id": ride_id,
        "driver_name": driver_info.get("name", "Driver"),
        "car_type": data.get("carType") or data.get("car_type") or "economy",
        "distance_km": data.get("actual_distance") or data.get("estimated_distance") or 0,
        "payment_method": data.get("payment_method") or data.get("paymentMethod") or "cash",
        "fare_breakdown": data.get("final_fare_breakdown") or data.get("fare_breakdown") or {},
        "total": data.get("final_fare") or data.get("estimated_fare") or 0,
        "tip": data.get("tip_amount") or 0,
        "created_at": data.get("created_at"),
        "completed_at": data.get("completed_at"),
    })


@app.get("/api/admin/riders/{rider_id}", tags=["Admin"])
async def get_rider_detail(rider_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    doc = db.collection("users").document(rider_id).get()
    if not doc.exists:
        raise HTTPException(404, "Rider not found")
    data = {k: v for k, v in doc.to_dict().items() if k != "password_hash"}
    data["id"] = doc.id
    return {"rider": serialize_firestore_data(data)}


@app.post("/api/admin/drivers/{driver_id}/approve", tags=["Admin"])
async def approve_driver(driver_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    doc = db.collection("users").document(driver_id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")
    db.collection("users").document(driver_id).update({
        "registration_status": "approved",
        "approved_by": admin_id,
        "approved_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    send_push_notification(
        driver_id,
        title="Account Approved! 🎉",
        body="Your driver account has been approved. You can now go online and accept rides.",
        data={"type": "account_approved"},
    )
    return {"message": "Driver approved successfully"}


@app.post("/api/admin/drivers/{driver_id}/reject", tags=["Admin"])
async def reject_driver(driver_id: str, reason: str = Query(default=""), admin_id: str = Depends(get_admin_user)):
    db = get_db()
    doc = db.collection("users").document(driver_id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")
    db.collection("users").document(driver_id).update({
        "registration_status": "rejected",
        "rejected_by": admin_id,
        "rejection_reason": reason,
        "rejected_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    send_push_notification(
        driver_id,
        title="Account Review Update",
        body="Your driver application was not approved. Please contact support for details.",
        data={"type": "account_rejected"},
    )
    return {"message": "Driver rejected"}


@app.put("/api/admin/drivers/{driver_id}", tags=["Admin"])
async def admin_update_driver(
    driver_id: str,
    req: AdminUpdateUserRequest,
    admin_id: str = Depends(get_admin_user),
):
    db = get_db()
    doc = db.collection("users").document(driver_id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "No fields to update")
    update_data["updated_at"] = firestore.SERVER_TIMESTAMP
    db.collection("users").document(driver_id).update(update_data)
    return {"message": "Driver updated"}


@app.put("/api/admin/riders/{rider_id}", tags=["Admin"])
async def admin_update_rider(
    rider_id: str,
    req: AdminUpdateUserRequest,
    admin_id: str = Depends(get_admin_user),
):
    db = get_db()
    doc = db.collection("users").document(rider_id).get()
    if not doc.exists:
        raise HTTPException(404, "Rider not found")
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(400, "No fields to update")
    update_data["updated_at"] = firestore.SERVER_TIMESTAMP
    db.collection("users").document(rider_id).update(update_data)
    return {"message": "Rider updated"}


@app.delete("/api/admin/users/{user_id}", tags=["Admin"])
async def admin_delete_user(user_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "User not found")
    db.collection("users").document(user_id).delete()
    return {"message": "User deleted"}


@app.get("/api/admin/withdrawals/pending", tags=["Admin"])
async def get_pending_withdrawals(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = list(db.collection("driver_withdrawals").where("status", "==", "pending").stream())
    result = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]
    return {"pending_withdrawals": result}


@app.get("/api/admin/withdrawals", tags=["Admin"])
async def get_all_withdrawals(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    try:
        docs = list(
            db.collection("driver_withdrawals")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(100)
            .stream()
        )
    except Exception:
        docs = list(db.collection("driver_withdrawals").stream())
    result = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]
    return {"withdrawals": result}


@app.post("/api/admin/withdrawals/{withdrawal_id}/approve", tags=["Admin"])
async def approve_withdrawal(withdrawal_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("driver_withdrawals").document(withdrawal_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(404, "Withdrawal not found")
    data = doc.to_dict()
    if data.get("status") != "pending":
        raise HTTPException(400, f"Withdrawal is already {data.get('status')}")
    ref.update({
        "status": "approved",
        "approved_by": admin_id,
        "approved_at": firestore.SERVER_TIMESTAMP,
    })
    driver_id = data.get("driver_id")
    if driver_id:
        send_push_notification(
            driver_id,
            title="Withdrawal Approved ✅",
            body=f"Your withdrawal of ₾{data.get('amount', 0):.2f} has been approved.",
            data={"type": "withdrawal_approved"},
        )
    return {"message": "Withdrawal approved"}


@app.post("/api/admin/withdrawals/{withdrawal_id}/reject", tags=["Admin"])
async def reject_withdrawal(withdrawal_id: str, reason: str = Query(default=""), admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("driver_withdrawals").document(withdrawal_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(404, "Withdrawal not found")
    data = doc.to_dict()
    if data.get("status") != "pending":
        raise HTTPException(400, f"Withdrawal is already {data.get('status')}")

    # Refund the balance
    driver_id = data.get("driver_id")
    total_deducted = data.get("total_deducted", data.get("amount", 0))
    if driver_id and total_deducted:
        db.collection("users").document(driver_id).update({
            "earnings.balance": firestore.Increment(total_deducted)
        })

    ref.update({
        "status": "rejected",
        "rejected_by": admin_id,
        "rejection_reason": reason,
        "rejected_at": firestore.SERVER_TIMESTAMP,
    })
    if driver_id:
        send_push_notification(
            driver_id,
            title="Withdrawal Rejected",
            body=f"Your withdrawal request was rejected. Funds have been returned to your wallet.",
            data={"type": "withdrawal_rejected"},
        )
    return {"message": "Withdrawal rejected and funds refunded"}


@app.get("/api/admin/topups/pending", tags=["Admin"])
async def get_pending_topups(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = list(db.collection("driver_topup_requests").where("status", "==", "pending").stream())
    result = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]
    return {"pending_topups": result}


@app.get("/api/admin/topups", tags=["Admin"])
async def get_all_topups(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    try:
        docs = list(
            db.collection("driver_topup_requests")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(100)
            .stream()
        )
    except Exception:
        docs = list(db.collection("driver_topup_requests").stream())
    result = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]
    return {"topups": result}


@app.post("/api/admin/topups/{topup_id}/approve", tags=["Admin"])
async def approve_topup(topup_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("driver_topup_requests").document(topup_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(404, "Top-up request not found")
    data = doc.to_dict()
    if data.get("status") != "pending":
        raise HTTPException(400, f"Top-up is already {data.get('status')}")

    driver_id = data.get("driver_id")
    amount = data.get("amount", 0)

    if driver_id and amount > 0:
        db.collection("users").document(driver_id).update({
            "earnings.balance": firestore.Increment(amount),
            "earnings.total_topped_up": firestore.Increment(amount),
        })

    ref.update({
        "status": "approved",
        "approved_by": admin_id,
        "approved_at": firestore.SERVER_TIMESTAMP,
    })

    if driver_id:
        send_push_notification(
            driver_id,
            title="Top-up Approved ✅",
            body=f"₾{amount:.2f} has been added to your wallet.",
            data={"type": "topup_approved", "amount": str(amount)},
        )
    return {"message": f"Top-up of ₾{amount:.2f} approved and credited"}


@app.post("/api/admin/topups/{topup_id}/reject", tags=["Admin"])
async def reject_topup(topup_id: str, reason: str = Query(default=""), admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("driver_topup_requests").document(topup_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(404, "Top-up request not found")
    data = doc.to_dict()
    if data.get("status") != "pending":
        raise HTTPException(400, f"Top-up is already {data.get('status')}")
    ref.update({
        "status": "rejected",
        "rejected_by": admin_id,
        "rejection_reason": reason,
        "rejected_at": firestore.SERVER_TIMESTAMP,
    })
    driver_id = data.get("driver_id")
    if driver_id:
        send_push_notification(
            driver_id,
            title="Top-up Request Rejected",
            body="Your top-up request was not approved. Please contact support.",
            data={"type": "topup_rejected"},
        )
    return {"message": "Top-up request rejected"}


@app.post("/api/admin/add-balance/{user_id}", tags=["Admin"])
async def admin_add_balance(
    user_id: str,
    req: AdminAddBalanceRequest,
    admin_id: str = Depends(get_admin_user),
):
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "User not found")

    user_data = doc.to_dict()
    user_type = user_data.get("user_type")

    if user_type == "driver":
        db.collection("users").document(user_id).update({
            "earnings.balance": firestore.Increment(req.amount),
        })
    else:
        db.collection("users").document(user_id).update({
            "wallet_balance": firestore.Increment(req.amount),
        })

    db.collection("admin_balance_adjustments").add({
        "user_id": user_id,
        "admin_id": admin_id,
        "amount": req.amount,
        "reason": req.reason,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    send_push_notification(
        user_id,
        title="Balance Updated 💳",
        body=f"₾{req.amount:.2f} has been added to your account. Reason: {req.reason}",
        data={"type": "balance_added", "amount": str(req.amount)},
    )
    return {"message": f"₾{req.amount:.2f} added to {user_type} account"}


@app.post("/api/admin/dispute/refund", tags=["Admin"])
async def admin_dispute_refund(req: AdminRefundRequest, admin_id: str = Depends(get_admin_user)):
    db = get_db()

    # Deduct from driver if specified
    if req.driver_id:
        driver_doc = db.collection("users").document(req.driver_id).get()
        if driver_doc.exists:
            driver_balance = driver_doc.to_dict().get("earnings", {}).get("balance", 0)
            deduct = min(req.amount, driver_balance)
            if deduct > 0:
                db.collection("users").document(req.driver_id).update({
                    "earnings.balance": firestore.Increment(-deduct)
                })

    # Credit to rider
    if req.rider_id:
        rider_doc = db.collection("users").document(req.rider_id).get()
        if rider_doc.exists:
            db.collection("users").document(req.rider_id).update({
                "wallet_balance": firestore.Increment(req.amount)
            })
            send_push_notification(
                req.rider_id,
                title="Refund Processed ✅",
                body=f"₾{req.amount:.2f} has been refunded to your wallet.",
                data={"type": "refund", "amount": str(req.amount)},
            )

    db.collection("dispute_refunds").add({
        "driver_id": req.driver_id,
        "rider_id": req.rider_id,
        "amount": req.amount,
        "reason": req.reason,
        "admin_id": admin_id,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Refund of ₾{req.amount:.2f} processed"}


@app.get("/api/admin/rides", tags=["Admin"])
async def get_all_rides(
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    admin_id: str = Depends(get_admin_user),
):
    db = get_db()
    try:
        query = db.collection("rides")
        if status:
            query = query.where("status", "==", status)
        try:
            docs = list(query.order_by("created_at", direction=firestore.Query.DESCENDING).limit(limit).stream())
        except Exception:
            docs = list(query.limit(limit).stream())
        result = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]
        return {"rides": result, "count": len(result)}
    except Exception as e:
        logger.error(f"Error fetching rides: {e}")
        return {"rides": [], "count": 0}


@app.get("/api/admin/support/tickets/escalated", tags=["Admin"])
async def get_escalated_tickets(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    tickets = db.collection("support_tickets").where("status", "==", "escalated").limit(50).stream()
    result = [serialize_firestore_data({**t.to_dict(), "id": t.id}) for t in tickets]
    result.sort(key=lambda x: (x.get("priority", "medium"), x.get("created_at", "")))
    return {"tickets": result, "count": len(result)}


@app.post("/api/admin/support/tickets/{ticket_id}/reply", tags=["Admin"])
async def reply_to_ticket(
    ticket_id: str,
    req: SupportMessageRequest,
    admin_id: str = Depends(get_admin_user),
):
    db = get_db()
    ref = db.collection("support_tickets").document(ticket_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(404, "Ticket not found")

    reply_msg = {"role": "admin", "content": req.message, "timestamp": now_iso()}
    ref.update({
        "chat_history": firestore.ArrayUnion([reply_msg]),
        "status": "replied",
        "updated_at": firestore.SERVER_TIMESTAMP,
    })

    ticket_data = doc.to_dict()
    user_id = ticket_data.get("user_id")
    if user_id:
        send_push_notification(
            user_id,
            title="Support Reply",
            body="You have a new reply to your support ticket.",
            data={"type": "support_reply", "ticket_id": ticket_id},
        )
    return {"message": "Reply sent"}


@app.post("/api/admin/support/tickets/{ticket_id}/close", tags=["Admin"])
async def close_ticket(ticket_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("support_tickets").document(ticket_id)
    if not ref.get().exists:
        raise HTTPException(404, "Ticket not found")
    ref.update({"status": "closed", "closed_at": firestore.SERVER_TIMESTAMP})
    return {"message": "Ticket closed"}


@app.get("/api/admin/campaigns", tags=["Admin"])
async def admin_get_campaigns(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = list(db.collection("campaigns").stream())
    result = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]
    return {"campaigns": result}


@app.post("/api/admin/campaigns", tags=["Admin"])
async def admin_create_campaign(campaign: dict, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("campaigns").document()
    campaign["id"] = ref.id
    campaign["created_by"] = admin_id
    campaign["created_at"] = firestore.SERVER_TIMESTAMP
    campaign.setdefault("is_active", True)
    ref.set(campaign)
    return {"campaign_id": ref.id, "message": "Campaign created"}


@app.put("/api/admin/campaigns/{campaign_id}", tags=["Admin"])
async def admin_update_campaign(
    campaign_id: str,
    updates: dict,
    admin_id: str = Depends(get_admin_user),
):
    db = get_db()
    ref = db.collection("campaigns").document(campaign_id)
    if not ref.get().exists:
        raise HTTPException(404, "Campaign not found")
    updates["updated_at"] = firestore.SERVER_TIMESTAMP
    ref.update(updates)
    return {"message": "Campaign updated"}


@app.delete("/api/admin/campaigns/{campaign_id}", tags=["Admin"])
async def admin_delete_campaign(campaign_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("campaigns").document(campaign_id)
    if not ref.get().exists:
        raise HTTPException(404, "Campaign not found")
    ref.delete()
    return {"message": "Campaign deleted"}


# =========================
# DRIVER ROUTES
# =========================

import uuid


@app.post("/api/driver/wallet/topup/paypal", tags=["Driver"])
async def driver_topup_paypal(req: PayPalTopUpRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    access_token = await get_paypal_token()
    if not access_token:
        raise HTTPException(500, "PayPal authentication failed")

    async with httpx.AsyncClient(timeout=25) as client:
        resp = await client.get(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{req.order_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(400, "Invalid PayPal order ID")

        data = resp.json()
        if data.get("status") not in ("COMPLETED", "APPROVED"):
            raise HTTPException(400, f"PayPal payment not completed (status: {data.get('status')})")

        try:
            pp_amount = float(data["purchase_units"][0]["amount"]["value"])
            if abs(pp_amount - req.amount) > 0.01:
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
    user_id: Optional[str] = Depends(get_current_user_id),
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")

    uid_prefix = f"driver_docs/{user_id}"

    async def upload(file: UploadFile, prefix: str) -> Optional[str]:
        if not file:
            return None
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
        path = f"{uid_prefix}/{prefix}_{uuid.uuid4().hex[:8]}.{ext}"
        return await upload_file_to_storage(file, path)

    document_urls = {
        "license_front":   await upload(license_front,   "lic_front"),
        "license_back":    await upload(license_back,    "lic_back"),
        "reg_front":       await upload(reg_front,       "reg_front"),
        "reg_back":        await upload(reg_back,        "reg_back"),
        "car_photo_front": await upload(car_photo_front, "car_front"),
        "car_photo_back":  await upload(car_photo_back,  "car_back"),
        "car_photo_left":  await upload(car_photo_left,  "car_left"),
        "car_photo_right": await upload(car_photo_right, "car_right"),
    }

    vehicle_data = {
        "id": str(uuid.uuid4()),
        "car_make": car_make,
        "car_model": car_model,
        "car_year": car_year,
        "car_color": car_color,
        "license_plate": license_plate.upper(),
        "tier": "economy",
        "documents": document_urls,
        "status": "pending",
    }

    db.collection("users").document(user_id).update({
        "driver_info.vehicles": firestore.ArrayUnion([vehicle_data]),
        "driver_info.active_vehicle_id": vehicle_data["id"],
        "registration_status": "pending_review",
        "updated_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": "Vehicle added successfully!", "tier": "economy"}


@app.post("/api/driver/status", tags=["Driver"])
async def update_driver_status(is_online: bool, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    db.collection("users").document(user_id).update({
        "is_online": is_online,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": f"Status updated to {'online' if is_online else 'offline'}"}


@app.post("/api/driver/location", tags=["Driver"])
async def update_driver_location(location: LocationUpdate, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"status": "success", "note": "unauthenticated bypass"}

    try:
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
            db.collection("rides").document(active_rides[0].id).update({"driver_location": location_data})

        return {"message": "Location updated"}
    except Exception as e:
        logger.error(f"Failed to update location: {e}")
        return {"status": "error"}


@app.post("/api/driver/topup/request", tags=["Driver"])
async def request_topup(request: TopUpRequest, user_id: Optional[str] = Depends(get_current_user_id)):
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
async def get_available_rides(user_id: Optional[str] = Depends(get_current_user_id)):
    try:
        db = get_db()
        rides = db.collection("rides").where("status", "==", "searching").stream()
        available = []
        for ride in rides:
            ride_data = ride.to_dict()
            ride_data["id"] = ride.id
            available.append(serialize_firestore_data(ride_data))
        return {"rides": available}
    except Exception as e:
        logger.error(f"Error fetching available rides: {e}")
        return {"rides": []}


@app.get("/api/driver/active-ride", tags=["Driver"])
async def get_driver_active_ride(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return None
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
async def get_driver_history(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"rides": []}
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
async def get_driver_withdrawal_history(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"withdrawals": []}
    db = get_db()
    try:
        # Try asking Firebase to sort it
        docs = list(
            db.collection("driver_withdrawals")
            .where("driver_id", "==", user_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(30)
            .stream()
        )
    except Exception:
        # If Firebase fails (missing index), do it manually in Python safely
        docs = list(db.collection("driver_withdrawals").where("driver_id", "==", user_id).stream())
        # FIX: Cast the timestamp to a string to prevent the TypeError crash
        docs.sort(key=lambda d: str(d.to_dict().get("created_at", "")), reverse=True)
        
    return {"withdrawals": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


@app.get("/api/driver/topup/history", tags=["Driver"])
async def get_driver_topup_history(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"topups": []}
    db = get_db()
    try:
        docs = list(
            db.collection("driver_topup_requests")
            .where("driver_id", "==", user_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(30)
            .stream()
        )
    except Exception:
        docs = list(db.collection("driver_topup_requests").where("driver_id", "==", user_id).stream())
    return {"topups": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


@app.get("/api/driver/fleet", tags=["Driver"])
async def get_fleet(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"vehicles": []}
    db = get_db()
    docs = list(db.collection("fleet_vehicles").where("owner_id", "==", user_id).stream())
    return {"vehicles": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


@app.post("/api/driver/fleet/add", tags=["Driver"])
async def add_fleet_vehicle(vehicle: FleetVehicleModel, user_id: Optional[str] = Depends(get_current_user_id)):
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
async def remove_fleet_vehicle(vehicle_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
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
    user_id: Optional[str] = Depends(get_current_user_id),
    radius: float = Query(10, ge=0.5, le=50),
):
    if not user_id:
        return {"rides": [], "search_radius": radius, "driver_location": None}

    db = get_db()
    driver_doc = db.collection("users").document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")

    driver_data = driver_doc.to_dict()
    driver_location = driver_data.get("current_location")

    if not driver_location or not driver_location.get("lat") or not driver_location.get("lng"):
        raise HTTPException(400, "Driver location not available.")

    rides = db.collection("rides").where("status", "==", "searching").stream()
    nearby = []

    for ride in rides:
        ride_data = ride.to_dict()
        ride_data["id"] = ride.id
        pickup_lat = ride_data.get("pickup_lat")
        pickup_lng = ride_data.get("pickup_lng")
        if not pickup_lat or not pickup_lng:
            continue
        distance = haversine_distance(driver_location["lat"], driver_location["lng"], pickup_lat, pickup_lng)
        if distance <= radius:
            ride_data["distance_to_pickup"] = round(distance, 2)
            nearby.append(serialize_firestore_data(ride_data))

    nearby.sort(key=lambda x: x.get("distance_to_pickup", 999))
    return {"rides": nearby, "search_radius": radius, "driver_location": driver_location}


@app.post("/api/rides/{ride_id}/request-join", tags=["Driver"])
async def request_to_join_ride(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    driver_doc = db.collection("users").document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")

    driver_data = driver_doc.to_dict()
    if driver_data.get("user_type") != "driver":
        raise HTTPException(403, "Only drivers can request rides")
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
# CAMPAIGNS
# =========================

@app.get("/api/driver/campaigns", tags=["Driver"])
async def get_driver_campaigns(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"campaigns": []}
    db = get_db()
    try:
        campaigns_docs = list(db.collection("campaigns").where("is_active", "==", True).stream())
        driver_doc = db.collection("users").document(user_id).get()
        driver_data = driver_doc.to_dict() if driver_doc.exists else {}
        driver_rating = driver_data.get("rating", 5.0)
        driver_rides = driver_data.get("total_rides", 0)

        joined_ids = set()
        joined_docs = list(
            db.collection("campaign_participants")
            .where("driver_id", "==", user_id)
            .stream()
        )
        progress_map = {}
        for jp in joined_docs:
            jd = jp.to_dict()
            cid = jd.get("campaign_id")
            joined_ids.add(cid)
            progress_map[cid] = jd

        result = []
        for doc in campaigns_docs:
            c = doc.to_dict()
            c["id"] = doc.id
            is_joined = doc.id in joined_ids

            eligible = True
            eligibility_reason = None
            min_rating = c.get("min_rating", 0)
            min_rides = c.get("min_rides", 0)
            if driver_rating < min_rating:
                eligible = False
                eligibility_reason = f"Need ≥{min_rating} rating"
            elif driver_rides < min_rides:
                eligible = False
                eligibility_reason = f"Need ≥{min_rides} rides"

            progress_data = None
            if is_joined and doc.id in progress_map:
                pd = progress_map[doc.id]
                current = pd.get("progress", 0)
                target = c.get("target_value", 1)
                pct = min(100.0, (current / max(1, target)) * 100)
                progress_data = {
                    "current": current,
                    "target": target,
                    "percentage": pct,
                    "completed": pd.get("completed", False),
                }

            c["joined"] = is_joined
            c["eligible"] = eligible
            c["eligibility_reason"] = eligibility_reason
            c["progress"] = progress_data
            result.append(serialize_firestore_data(c))

        return {"campaigns": result}
    except Exception as e:
        logger.error(f"Error fetching campaigns: {e}")
        return {"campaigns": []}


@app.post("/api/driver/campaigns/{campaign_id}/join", tags=["Driver"])
async def join_campaign(campaign_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()

    campaign_doc = db.collection("campaigns").document(campaign_id).get()
    if not campaign_doc.exists:
        raise HTTPException(404, "Campaign not found")

    campaign = campaign_doc.to_dict()
    if not campaign.get("is_active"):
        raise HTTPException(400, "Campaign is not active")

    existing = list(
        db.collection("campaign_participants")
        .where("driver_id", "==", user_id)
        .where("campaign_id", "==", campaign_id)
        .limit(1)
        .stream()
    )
    if existing:
        raise HTTPException(400, "Already joined this campaign")

    db.collection("campaign_participants").add({
        "driver_id": user_id,
        "campaign_id": campaign_id,
        "progress": 0,
        "completed": False,
        "joined_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Joined campaign: {campaign.get('title', campaign_id)}"}


# =========================
# SUPPORT
# =========================

@app.get("/api/support/history", tags=["Support"])
async def get_support_history(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"tickets": []}
    db = get_db()
    try:
        tickets = list(
            db.collection("support_tickets")
            .where("user_id", "==", user_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(20)
            .stream()
        )
    except Exception:
        tickets = list(db.collection("support_tickets").where("user_id", "==", user_id).stream())
        tickets.sort(key=lambda t: t.to_dict().get("created_at", ""), reverse=True)
    return {"tickets": [serialize_firestore_data({**t.to_dict(), "id": t.id}) for t in tickets]}


@app.post("/api/support/message", tags=["Support"])
async def send_support_message(req: SupportMessageRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()

    user_doc = db.collection("users").document(user_id).get()
    user_data = user_doc.to_dict() if user_doc.exists else {}

    ticket_ref = db.collection("support_tickets").document()
    ticket_ref.set({
        "id": ticket_ref.id,
        "user_id": user_id,
        "user_name": f"{user_data.get('name', '')} {user_data.get('surname', '')}".strip(),
        "user_phone": user_data.get("cellphone", ""),
        "user_type": user_data.get("user_type", "unknown"),
        "message": req.message,
        "status": "open",
        "chat_history": [
            {"role": "user", "content": req.message, "timestamp": now_iso()}
        ],
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": "Support ticket created", "ticket_id": ticket_ref.id}


# =========================
# REFERRALS
# =========================

@app.get("/api/user/referral", tags=["User"])
async def get_user_referral(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()

    ref_doc = db.collection("referrals").document(user_id).get()
    if ref_doc.exists:
        data = ref_doc.to_dict()
    else:
        code = user_id[:6].upper()
        data = {
            "user_id": user_id,
            "referral_code": code,
            "referral_link": f"https://taksi.ge/ref/{code}",
            "referrals_count": 0,
            "bonus_earned": 0.0,
            "code_used": False,
            "created_at": firestore.SERVER_TIMESTAMP,
        }
        db.collection("referrals").document(user_id).set(data)

    return serialize_firestore_data(data)


@app.post("/api/user/referral/apply", tags=["User"])
async def apply_referral_code(req: ReferralApplyRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()

    my_ref = db.collection("referrals").document(user_id).get()
    if my_ref.exists and my_ref.to_dict().get("code_used"):
        raise HTTPException(400, "You have already used a referral code")

    code = req.code.strip().upper()
    owners = list(db.collection("referrals").where("referral_code", "==", code).limit(1).stream())
    if not owners:
        raise HTTPException(404, "Invalid referral code")

    owner_doc = owners[0]
    owner_id = owner_doc.to_dict().get("user_id")

    if owner_id == user_id:
        raise HTTPException(400, "You cannot use your own referral code")

    REFERRER_BONUS = 10.0
    REFERRED_BONUS = 5.0

    user_doc = db.collection("users").document(user_id).get()
    if user_doc.exists:
        user_type = user_doc.to_dict().get("user_type", "rider")
        if user_type == "driver":
            db.collection("users").document(user_id).update({
                "earnings.balance": firestore.Increment(REFERRED_BONUS)
            })
        else:
            db.collection("users").document(user_id).update({
                "wallet_balance": firestore.Increment(REFERRED_BONUS)
            })

    owner_user_doc = db.collection("users").document(owner_id).get()
    if owner_user_doc.exists:
        owner_type = owner_user_doc.to_dict().get("user_type", "rider")
        if owner_type == "driver":
            db.collection("users").document(owner_id).update({
                "earnings.balance": firestore.Increment(REFERRER_BONUS)
            })
        else:
            db.collection("users").document(owner_id).update({
                "wallet_balance": firestore.Increment(REFERRER_BONUS)
            })

    db.collection("referrals").document(owner_id).update({
        "referrals_count": firestore.Increment(1),
        "bonus_earned": firestore.Increment(REFERRER_BONUS),
    })
    db.collection("referrals").document(user_id).set({
        "user_id": user_id,
        "referral_code": user_id[:6].upper(),
        "referral_link": f"https://taksi.ge/ref/{user_id[:6].upper()}",
        "referrals_count": 0,
        "bonus_earned": REFERRED_BONUS,
        "code_used": True,
        "used_code": code,
        "created_at": firestore.SERVER_TIMESTAMP,
    }, merge=True)

    return {"message": f"Referral code applied! You received ₾{REFERRED_BONUS:.2f}"}


# =========================
# USER FAVORITES
# =========================

@app.get("/api/user/favorites", tags=["User"])
async def get_favorites(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"favorites": []}
    db = get_db()
    docs = list(db.collection("user_favorites").where("user_id", "==", user_id).stream())
    return {"favorites": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


@app.post("/api/user/favorites", tags=["User"])
async def save_favorite(fav: FavoriteLocation, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc_ref = db.collection("user_favorites").document()
    doc_ref.set({
        "id": doc_ref.id,
        "user_id": user_id,
        "name": fav.name,
        "address": fav.address,
        "lat": fav.lat,
        "lng": fav.lng,
        "icon": fav.icon or "📍",
        "created_at": firestore.SERVER_TIMESTAMP,
    })
    return {"id": doc_ref.id, "message": "Location saved"}


@app.delete("/api/user/favorites/{fav_id}", tags=["User"])
async def delete_favorite(fav_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("user_favorites").document(fav_id).get()
    if not doc.exists:
        raise HTTPException(404, "Favorite not found")
    if doc.to_dict().get("user_id") != user_id:
        raise HTTPException(403, "Not your favorite")
    db.collection("user_favorites").document(fav_id).delete()
    return {"message": "Favorite removed"}


# =========================
# LANGUAGE
# =========================

@app.get("/api/user/language", tags=["User"])
async def get_user_language(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"lang": "en"}
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if doc.exists:
        return {"lang": doc.to_dict().get("language", "en")}
    return {"lang": "en"}


@app.post("/api/user/language", tags=["User"])
async def set_user_language(lang: str = Query(...), user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    db.collection("users").document(user_id).update({"language": lang})
    return {"message": f"Language set to {lang}"}


# =========================
# RIDER WALLET
# =========================

@app.post("/api/rider/wallet/topup/paypal", tags=["Rider"])
async def rider_topup_paypal(req: PayPalTopUpRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    access_token = await get_paypal_token()
    if not access_token:
        raise HTTPException(500, "PayPal authentication failed")

    async with httpx.AsyncClient(timeout=25) as client:
        resp = await client.get(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{req.order_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(400, "Invalid PayPal order ID")

        data = resp.json()
        if data.get("status") not in ("COMPLETED", "APPROVED"):
            raise HTTPException(400, f"PayPal payment not completed (status: {data.get('status')})")

        try:
            pp_amount = float(data["purchase_units"][0]["amount"]["value"])
            if abs(pp_amount - req.amount) > 0.01:
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
        "wallet_balance": firestore.Increment(req.amount),
    })

    db.collection("wallet_transactions").add({
        "user_id": user_id,
        "type": "rider_paypal_topup",
        "amount": req.amount,
        "order_id": req.order_id,
        "paypal_mode": PAYPAL_MODE,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Successfully added ₾{req.amount:.2f} to wallet"}


@app.get("/api/rider/wallet/transactions", tags=["Rider"])
async def get_rider_wallet_transactions(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"transactions": []}
    db = get_db()
    try:
        docs = list(
            db.collection("wallet_transactions")
            .where("user_id", "==", user_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(50)
            .stream()
        )
    except Exception:
        docs = list(db.collection("wallet_transactions").where("user_id", "==", user_id).stream())
    return {"transactions": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


# =========================
# RIDE ROUTES
# =========================

@app.post("/api/rides/{ride_id}/toggle-stop-wait", tags=["Rides"])
async def toggle_stop_wait(ride_id: str, is_waiting: bool, user_id: Optional[str] = Depends(get_current_user_id)):
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
            update_data = {"stop_wait_minutes": firestore.Increment(wait_minutes), "stop_wait_start": None}
        else:
            update_data = {}

    ride_ref.update(update_data)
    return {"status": "updated", "is_waiting": is_waiting}


@app.post("/api/rides/{ride_id}/retry", tags=["Rides"])
async def retry_ride_matching(
    ride_id: str,
    background_tasks: BackgroundTasks,
    user_id: Optional[str] = Depends(get_current_user_id),
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
    user_id: Optional[str] = Depends(get_current_user_id),
):
    db = get_db()
    final_user_id = user_id or ride_data.user_id or "test_rider_id"

    if not ride_data.pickup_lat or not ride_data.pickup_lng:
        raise HTTPException(status_code=422, detail="Pickup coordinates are required.")

    surge_info = get_surge_multiplier(ride_data.pickup_lat, ride_data.pickup_lng)
    surge_multiplier = surge_info["multiplier"]
    commission_rate = surge_info["commission_rate"]

    num_stops = len(ride_data.stops)
    fare = calculate_fare(
        ride_data.car_type or "economy",
        ride_data.estimated_distance or 5,
        0, 0, num_stops, surge_multiplier,
    )

    payment_method = ride_data.payment_method
    service_fee = 2.0 if payment_method == "card" else 0.0
    fare["service_fee"] = service_fee
    fare["base_total"] = fare["total"]
    fare["total"] += service_fee

    stops_data = [
        {"address": s.get("address", ""), "lat": s.get("lat", 0), "lng": s.get("lng", 0), "order": s.get("order", 0)}
        for s in ride_data.stops if isinstance(s, dict)
    ]

    ride_ref = db.collection("rides").document()
    new_ride = {
        "id": ride_ref.id,
        "userId": final_user_id,
        "rider_id": final_user_id,
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

@app.get("/api/rider/active-ride", tags=["Rider"])
async def get_rider_active_ride(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return None
    db = get_db()
    active_statuses = ["searching", "accepted", "arrived", "in_progress"]
    # Check both userId and rider_id fields (legacy + new)
    for field in ["userId", "rider_id"]:
        for status in active_statuses:
            rides = list(
                db.collection("rides")
                .where(field, "==", user_id)
                .where("status", "==", status)
                .limit(1)
                .stream()
            )
            if rides:
                ride = rides[0]
                return serialize_firestore_data({**ride.to_dict(), "id": ride.id})
    return None

# =========================
# SCHEDULED RIDES
# =========================

@app.post("/api/rides/schedule", tags=["Rides"])
async def schedule_ride(
    req: ScheduledRideRequest,
    user_id: Optional[str] = Depends(get_current_user_id),
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    try:
        scheduled_dt = datetime.fromisoformat(req.scheduled_time.replace("Z", "+00:00"))
        if scheduled_dt.tzinfo is None:
            scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)
        if scheduled_dt <= datetime.now(timezone.utc):
            raise HTTPException(400, "Scheduled time must be in the future")
    except ValueError:
        raise HTTPException(422, "Invalid scheduled_time format")

    db = get_db()
    ref = db.collection("scheduled_rides").document()
    ref.set({
        "id": ref.id,
        "rider_id": user_id,
        "pickup_address": req.pickup_address,
        "pickup_lat": req.pickup_lat,
        "pickup_lng": req.pickup_lng,
        "destination_address": req.destination_address,
        "destination_lat": req.destination_lat,
        "destination_lng": req.destination_lng,
        "scheduled_time": req.scheduled_time,
        "car_type": req.car_type,
        "payment_method": req.payment_method,
        "stops": req.stops or [],
        "status": "scheduled",
        "created_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Ride scheduled!", "scheduled_ride_id": ref.id, "scheduled_time": req.scheduled_time}


@app.get("/api/rides/scheduled", tags=["Rides"])
async def get_scheduled_rides(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"scheduled_rides": []}
    db = get_db()
    docs = list(
        db.collection("scheduled_rides")
        .where("rider_id", "==", user_id)
        .where("status", "==", "scheduled")
        .stream()
    )
    return {"scheduled_rides": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


@app.delete("/api/rides/scheduled/{scheduled_ride_id}", tags=["Rides"])
async def cancel_scheduled_ride(scheduled_ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("scheduled_rides").document(scheduled_ride_id).get()
    if not doc.exists:
        raise HTTPException(404, "Scheduled ride not found")
    if doc.to_dict().get("rider_id") != user_id:
        raise HTTPException(403, "Not your scheduled ride")
    db.collection("scheduled_rides").document(scheduled_ride_id).update({
        "status": "cancelled",
        "cancelled_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Scheduled ride cancelled"}


# =========================
# RIDE MATCHING
# =========================

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
                if d.to_dict().get("is_online") and str(d.to_dict().get("registration_status", "")).lower() == "approved"
            ]

        nearby_drivers = []
        declined = ride_data.get("declined_drivers", [])
        already_notified = ride_data.get("notified_drivers", [])

        for driver in drivers:
            driver_data = driver.to_dict()
            if driver.id in declined or driver.id in already_notified:
                continue

            estimated_fare = ride_data.get("estimated_fare", 0)
            commission_rate = ride_data.get("commission_rate", DRIVER_COMMISSION_RATE)
            required_commission = estimated_fare * commission_rate
            driver_balance = driver_data.get("earnings", {}).get("balance", 0)
            if driver_balance < required_commission:
                continue

            driver_location = driver_data.get("current_location")
            if driver_location and driver_location.get("lat") and driver_location.get("lng"):
                distance = haversine_distance(
                    pickup_lat, pickup_lng, driver_location["lat"], driver_location["lng"]
                )
                if distance <= radius:
                    nearby_drivers.append({
                        "id": driver.id,
                        "distance": round(distance, 2),
                        "name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip(),
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
            })

            for driver in selected_drivers:
                send_push_notification(
                    driver["id"],
                    title="New Ride Request 🚕",
                    body=f"Pickup {round(driver['distance'], 1)}km away — ₾{ride_data.get('estimated_fare', 0):.0f}",
                    data={
                        "type": "ride_request",
                        "ride_id": ride_id,
                        "pickup_address": ride_data.get("pickup", ""),
                        "estimated_fare": str(ride_data.get("estimated_fare", 0)),
                    },
                )

            await asyncio.sleep(wait_time_per_round[idx])

            updated_ride = db.collection("rides").document(ride_id).get()
            if updated_ride.exists and updated_ride.to_dict().get("status") != "searching":
                return

    # No drivers found after all rounds
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

    ride_ref.update(update_data)


@app.post("/api/rides/{ride_id}/accept", tags=["Rides"])
async def accept_ride(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    final_driver_id = user_id or "test_driver_id"

    db = get_db()
    driver_doc = db.collection("users").document(final_driver_id).get()
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
    balance = driver_data.get("earnings", {}).get("balance", 0)
    held_commission = (ride_data.get("estimated_fare", 0) or 0) * commission_rate

    if balance < held_commission:
        raise HTTPException(400, f"Insufficient balance. Need ₾{held_commission:.2f}, have ₾{balance:.2f}")

    new_balance = balance - held_commission
    db.collection("users").document(final_driver_id).update({
        "earnings.balance": new_balance,
        "earnings.total_commission_paid": firestore.Increment(held_commission),
    })

    driver_info_raw = driver_data.get("driver_info", {}) or {}
    vehicles = driver_info_raw.get("vehicles", [])
    active_vehicle_id = driver_info_raw.get("active_vehicle_id")
    vehicle = next((v for v in vehicles if v.get("id") == active_vehicle_id), None)
    if not vehicle and vehicles:
        vehicle = vehicles[0]
    vehicle = vehicle or {}

    driver_location = driver_data.get("current_location", {}) or {}

    db.collection("rides").document(ride_id).update({
        "status": "accepted",
        "driver_id": final_driver_id,
        "driver_info": {
            "id": final_driver_id,
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

    rider_id = ride_data.get("userId") or ride_data.get("rider_id") or ride_data.get("user_id")
    if rider_id:
        driver_name = f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip()
        send_push_notification(
            rider_id,
            title="Driver Found! 🚗",
            body=f"{driver_name} is on the way.",
            data={"type": "ride_accepted", "ride_id": ride_id},
        )

    return {
        "message": "Ride accepted!",
        "commission_deducted": round(held_commission, 2),
        "commission_rate": f"{commission_rate * 100:.1f}%",
        "new_balance": round(new_balance, 2),
    }


@app.post("/api/rides/{ride_id}/decline", tags=["Rides"])
async def decline_ride(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    db.collection("rides").document(ride_id).update({
        "declined_drivers": firestore.ArrayUnion([user_id])
    })
    return {"message": "Ride declined"}


@app.post("/api/rides/{ride_id}/arrived", tags=["Rides"])
async def driver_arrived(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    db = get_db()
    db.collection("rides").document(ride_id).update({
        "status": "arrived",
        "arrived_at": firestore.SERVER_TIMESTAMP,
    })
    ride_doc = db.collection("rides").document(ride_id).get()
    if ride_doc.exists:
        ride_data = ride_doc.to_dict()
        rider_id = ride_data.get("userId") or ride_data.get("rider_id")
        if rider_id:
            send_push_notification(
                rider_id,
                title="Your Driver Has Arrived 📍",
                body="Your driver is waiting. Please come down.",
                data={"type": "driver_arrived", "ride_id": ride_id},
            )
    return {"message": "Marked as arrived"}


@app.post("/api/rides/{ride_id}/start", tags=["Rides"])
async def start_ride(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if ride_doc.exists:
        ride_data = ride_doc.to_dict()
        arrived_at = ride_data.get("arrived_at")
        wait_minutes = 0
        if arrived_at and hasattr(arrived_at, "timestamp"):
            wait_seconds = (datetime.now(timezone.utc) - arrived_at).total_seconds()
            wait_minutes = int(wait_seconds / 60)

        db.collection("rides").document(ride_id).update({
            "status": "in_progress",
            "pickup_wait_minutes": wait_minutes,
            "started_at": firestore.SERVER_TIMESTAMP,
        })
    return {"message": "Ride started"}


@app.post("/api/rides/{ride_id}/update-tracking", tags=["Rides"])
async def update_ride_tracking(
    ride_id: str, location: LocationUpdate, user_id: Optional[str] = Depends(get_current_user_id)
):
    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    db.collection("rides").document(ride_id).update({
        "driver_location": {
            "lat": location.lat, "lng": location.lng,
            "heading": location.heading, "speed": location.speed,
        },
        "route_points": firestore.ArrayUnion([{
            "lat": location.lat, "lng": location.lng, "timestamp": now_iso(),
        }]),
    })
    return {"message": "Tracking updated"}


@app.post("/api/rides/{ride_id}/stop-reached", tags=["Rides"])
async def stop_reached(
    ride_id: str,
    stop_index: int,
    wait_minutes: int = 0,
    user_id: Optional[str] = Depends(get_current_user_id),
):
    db = get_db()
    db.collection("rides").document(ride_id).update({
        "stop_wait_minutes": firestore.Increment(wait_minutes),
        f"stops_completed.{stop_index}": True,
    })
    return {"message": f"Stop {stop_index} completed"}


@app.post("/api/rides/{ride_id}/complete", tags=["Rides"])
async def complete_ride(
    ride_id: str,
    final_distance: Optional[float] = 0.0,
    total_wait_minutes: Optional[int] = 0,
    dropoff_lat: Optional[float] = None,
    dropoff_lng: Optional[float] = None,
    user_id: Optional[str] = Depends(get_current_user_id),
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
        try:
            rider_doc = rider_ref.get()
            if rider_doc.exists:
                wallet_balance = float(rider_doc.to_dict().get("wallet_balance", 0.0))
        except Exception:
            pass

    wallet_used = 0.0
    cash_to_collect = 0.0
    payment_status = "pending"

    if is_wallet:
        wallet_used = min(wallet_balance, total_with_fee)
        cash_to_collect = total_with_fee - wallet_used
        payment_status = "paid_fully_via_wallet" if cash_to_collect == 0 else "split_cash_required"
        if wallet_used > 0 and rider_ref:
            try:
                rider_ref.update({"wallet_balance": firestore.Increment(-float(wallet_used))})
            except Exception:
                pass
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
    
    # 1. This updates the ride successfully
    ride_ref.update(ride_updates)

    # 2. SAFELY attempt to update the Driver's balance
    if driver_id:
        try:
            held_commission = ride_data.get("commission_paid", 0) or 0
            commission_rate = ride_data.get("commission_rate", 0.23)

            actual_commission = commissionable_amount * commission_rate
            driver_share = commissionable_amount - actual_commission

            commission_refund = held_commission - actual_commission
            wallet_change = driver_share - cash_to_collect + commission_refund

            driver_doc_ref = db.collection("users").document(driver_id)
            if driver_doc_ref.get().exists:
                driver_doc_ref.update({
                    "earnings.balance": firestore.Increment(wallet_change),
                    "earnings.total_earned": firestore.Increment(driver_share),
                    "total_rides": firestore.Increment(1),
                })
        except Exception as e:
            logger.error(f"Post-ride Driver update failed gracefully: {e}")

    # 3. SAFELY attempt to update the Rider's trip count
    if rider_id and rider_ref:
        try:
            if rider_ref.get().exists:
                rider_ref.update({"total_rides": firestore.Increment(1)})
        except Exception as e:
            logger.error(f"Post-ride Rider update failed gracefully: {e}")

    # 4. Safely attempt to trigger campaign logic (if you have it)
    try:
        # We wrap this so if the campaign function is missing or fails, it won't crash the completion
        if 'update_driver_campaign_progress' in globals() and driver_id:
             update_driver_campaign_progress(driver_id, {"driver_earnings": total_with_fee})
    except Exception as e:
        logger.error(f"Campaign update failed: {e}")

    if rider_id:
        send_push_notification(
            rider_id,
            title="Ride Complete ✅",
            body=f"Your trip has ended. Total: ₾{total_with_fee:.2f}",
            data={"type": "ride_completed", "ride_id": ride_id},
        )

    # 5. Successfully return the 200 OK to the Driver App
    return {
        "message": "Ride completed",
        "payment_status": payment_status,
        "final_fare": total_with_fee,
        "wallet_used": wallet_used,
        "cash_to_collect": cash_to_collect,
        "fare_breakdown": final_fare,
    }


@app.post("/api/rides/{ride_id}/cancel", tags=["Rides"])
async def cancel_ride(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride_doc = ride_ref.get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    current_status = ride_data.get("status")

    if current_status in ["completed", "cancelled"]:
        raise HTTPException(400, f"Cannot cancel ride with status: {current_status}")

    # Refund wallet payment if card/wallet
    payment_method = ride_data.get("payment_method") or ride_data.get("paymentMethod", "cash")
    rider_id = ride_data.get("userId") or ride_data.get("rider_id") or ride_data.get("user_id")

    if "card" in str(payment_method).lower() and rider_id and not ride_data.get("refunded"):
        fare_to_refund = ride_data.get("estimated_fare", 0)
        if fare_to_refund > 0:
            db.collection("users").document(rider_id).update({
                "wallet_balance": firestore.Increment(fare_to_refund)
            })

    # Refund driver commission if already accepted
    driver_id = ride_data.get("driver_id") or ride_data.get("driverId")
    if driver_id and current_status in ["accepted", "arrived"]:
        commission_paid = ride_data.get("commission_paid", 0)
        if commission_paid > 0:
            db.collection("users").document(driver_id).update({
                "earnings.balance": firestore.Increment(commission_paid),
                "earnings.total_commission_paid": firestore.Increment(-commission_paid),
            })

    ride_ref.update({
        "status": "cancelled",
        "cancelled_by": user_id,
        "cancelled_at": firestore.SERVER_TIMESTAMP,
    })

    if driver_id:
        send_push_notification(
            driver_id,
            title="Ride Cancelled",
            body="The rider cancelled this ride. Commission refunded.",
            data={"type": "ride_cancelled", "ride_id": ride_id},
        )

    return {"message": "Ride cancelled"}


@app.get("/api/rides/{ride_id}", tags=["Rides"])
async def get_ride(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    db = get_db()
    doc = db.collection("rides").document(ride_id).get()
    if not doc.exists:
        raise HTTPException(404, "Ride not found")
    data = doc.to_dict()
    data["id"] = doc.id
    return serialize_firestore_data(data)


@app.get("/api/rides/history/rider", tags=["Rides"])
async def get_rider_history(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"rides": []}
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

@app.get("/api/rider/history", tags=["Rider"])
async def get_rider_history_v2(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"rides": []}
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


@app.post("/api/rides/{ride_id}/rate-passenger", tags=["Rides"])
async def rate_passenger(
    ride_id: str, rating_data: RatePassengerRequest, user_id: Optional[str] = Depends(get_current_user_id)
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    data = ride.to_dict()
    ride_ref.update({"passenger_rating": rating_data.rating, "passenger_review": rating_data.review})

    rider_id = data.get("userId") or data.get("rider_id")
    if rider_id:
        user_ref = db.collection("users").document(rider_id)
        user_doc = user_ref.get()
        if user_doc.exists:
            u_data = user_doc.to_dict()
            current = u_data.get("rating", 5.0)
            total_rides = u_data.get("total_rides", 1)
            new_rating = round(((current * (total_rides - 1)) + rating_data.rating) / max(1, total_rides), 2)
            user_ref.update({"rating": new_rating})

    return {"message": "Passenger rated", "rating": rating_data.rating}


@app.post("/api/rides/{ride_id}/rate/driver", tags=["Rides"])  # <--- Fixed the URL path here
async def rate_driver(
    ride_id: str, rating_data: RateDriverRequest, user_id: Optional[str] = Depends(get_current_user_id)
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    data = ride.to_dict()

    # Update the ride document with the rating
    ride_ref.update({
        "driver_rating": rating_data.rating,
        "driver_review": rating_data.review,
        "rated_at": firestore.SERVER_TIMESTAMP,
    })

    # Safely update the driver's overall rating average
    driver_id = data.get("driver_id") or data.get("driverId")
    if driver_id:
        driver_ref = db.collection("users").document(driver_id)
        driver_doc = driver_ref.get()
        if driver_doc.exists:
            d_data = driver_doc.to_dict()
            current_rating = d_data.get("rating", 5.0)
            total_rides = d_data.get("total_rides", 1)
            
            # Calculate the new average
            new_rating = ((current_rating * total_rides) + rating_data.rating) / (total_rides + 1)
            driver_ref.update({"rating": round(new_rating, 2)})

    return {"message": "Driver rated successfully"}


@app.post("/api/rides/{ride_id}/chat", tags=["Rides"])
async def send_chat_message(
    ride_id: str, msg: ChatMessage, user_id: Optional[str] = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    rider_id = ride_data.get("userId") or ride_data.get("rider_id")
    driver_id = ride_data.get("driver_id") or ride_data.get("driverId")

    sender_role = "rider" if user_id == rider_id else "driver"
    recipient_id = driver_id if sender_role == "rider" else rider_id

    message_doc = {
        "ride_id": ride_id,
        "sender_id": user_id,
        "sender_role": sender_role,
        "message": msg.message,
        "timestamp": firestore.SERVER_TIMESTAMP,
    }
    db.collection("ride_messages").add(message_doc)

    if recipient_id:
        send_push_notification(
            recipient_id,
            title=f"Message from your {'driver' if sender_role == 'rider' else 'rider'}",
            body=msg.message[:100],
            data={"type": "chat_message", "ride_id": ride_id},
        )

    return {"message": "Message sent"}


@app.get("/api/rides/{ride_id}/chat", tags=["Rides"])
async def get_chat_messages(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"messages": []}
    db = get_db()
    try:
        docs = list(
            db.collection("ride_messages")
            .where("ride_id", "==", ride_id)
            .order_by("timestamp")
            .stream()
        )
    except Exception:
        docs = list(db.collection("ride_messages").where("ride_id", "==", ride_id).stream())
    return {"messages": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}


@app.post("/api/rides/{ride_id}/tip", tags=["Rides"])
async def send_tip(
    ride_id: str, req: TipRequest, user_id: Optional[str] = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    if ride_data.get("status") != "completed":
        raise HTTPException(400, "Can only tip on completed rides")

    tip_amount = req.tip_amount or req.amount
    driver_id = ride_data.get("driver_id") or ride_data.get("driverId")
    if not driver_id:
        raise HTTPException(400, "No driver found for this ride")

    rider_doc = db.collection("users").document(user_id).get()
    if not rider_doc.exists:
        raise HTTPException(404, "Rider not found")

    rider_data = rider_doc.to_dict()
    wallet_balance = float(rider_data.get("wallet_balance", 0))
    if wallet_balance < tip_amount:
        raise HTTPException(400, f"Insufficient wallet balance. Have ₾{wallet_balance:.2f}")

    db.collection("users").document(user_id).update({
        "wallet_balance": firestore.Increment(-tip_amount)
    })
    db.collection("users").document(driver_id).update({
        "earnings.balance": firestore.Increment(tip_amount),
        "earnings.total_earned": firestore.Increment(tip_amount),
    })
    db.collection("rides").document(ride_id).update({
        "tip_amount": firestore.Increment(tip_amount),
        "tipped": True,
    })

    db.collection("tip_transactions").add({
        "ride_id": ride_id,
        "rider_id": user_id,
        "driver_id": driver_id,
        "amount": tip_amount,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    send_push_notification(
        driver_id,
        title="You received a tip! 🎉",
        body=f"₾{tip_amount:.2f} tip added to your wallet.",
        data={"type": "tip_received", "amount": str(tip_amount)},
    )

    return {"message": f"Tip of ₾{tip_amount:.2f} sent successfully"}


@app.post("/api/rides/{ride_id}/share", tags=["Rides"])
async def share_ride(
    ride_id: str, req: ShareRideRequest, user_id: Optional[str] = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("rides").document(ride_id).get()
    if not doc.exists:
        raise HTTPException(404, "Ride not found")

    share_link = f"https://taksi.ge/track/{ride_id}"
    return {
        "share_link": share_link,
        "message": "Share this link to let others track your ride",
        "ride_id": ride_id,
    }