import logging
from contextlib import asynccontextmanager
import math
import os
import asyncio
import base64
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import firebase_admin
from firebase_admin import credentials, firestore, storage, messaging, auth as firebase_auth

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import FastAPI, HTTPException, Query, Header, Depends, BackgroundTasks, File, UploadFile, Form, Body, Response, Cookie, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict

from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import bcrypt
import jwt
import httpx
import sys
import secrets

load_dotenv()

# --- SECURE COOKIE SETTINGS ---
COOKIE_NAME = "token"
COOKIE_MAX_AGE = 7 * 24 * 3600
COOKIE_SECURE = True
COOKIE_SAMESITE = "none"
COOKIE_HTTPONLY = True
COOKIE_PATH = "/"


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        httponly=COOKIE_HTTPONLY,
        samesite=COOKIE_SAMESITE,
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        httponly=COOKIE_HTTPONLY,
        samesite=COOKIE_SAMESITE,
    )


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
    print("?? FATAL ERROR: JWT_SECRET is missing or insecure! Shutting down.")
    sys.exit(1)

if not ADMIN_PASSWORD:
    print("?? FATAL ERROR: ADMIN_PASSWORD is missing! Shutting down.")
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

# --- FIX: FRONTEND_URL env var controls share links ---------------------------
# Set FRONTEND_URL=https://t-aksi-frontend.onrender.com in Render environment vars
# Default is the onrender domain so it works without any config change
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://t-aksi-frontend.onrender.com")

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
            logger.info("? Firebase initialized from Render Secret File.")
            return
        if SERVICE_ACCOUNT_PATH.exists():
            cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
            firebase_admin.initialize_app(cred, {"storageBucket": FIREBASE_STORAGE_BUCKET})
            logger.info(f"? Firebase initialized from local file: {SERVICE_ACCOUNT_PATH}")
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
            logger.debug(f"No FCM token for user {user_id}")
            return

        safe_data = {k: str(v) for k, v in (data or {}).items()}

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=safe_data,
            token=token,
            android=messaging.AndroidConfig(
                priority="high",
                ttl=60,
                notification=messaging.AndroidNotification(
                    sound="ride_alert",
                    default_vibrate_timings=False,
                    vibrate_timings=[0.5, 0.3, 0.5, 0.3, 0.5],
                    priority=messaging.AndroidNotificationPriority.MAX,
                    visibility=messaging.AndroidNotificationVisibility.PUBLIC,
                    notification_count=1,
                    sticky=True,
                    local_only=False,
                ),
            ),
            apns=messaging.APNSConfig(
                headers={"apns-priority": "10", "apns-push-type": "alert"},
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound=messaging.CriticalSound(name="ride_alert.wav", critical=1, volume=1.0),
                        badge=1,
                        content_available=True,
                    )
                ),
            ),
        )

        response = messaging.send(message)
        logger.info(f"Push sent to {user_id}: {response}")

    except messaging.UnregisteredError:
        logger.warning(f"FCM token for {user_id} is invalid. Clearing.")
        try:
            db = get_db()
            db.collection("users").document(user_id).update({"fcm_token": firestore.DELETE_FIELD})
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


def get_current_user_id(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Cookie(None),
) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        raw = authorization.replace("Bearer ", "")
        try:
            decoded = decode_token(raw)
            if decoded and "user_id" in decoded:
                return decoded["user_id"]
        except Exception:
            pass
    if token:
        try:
            decoded = decode_token(token)
            if decoded and "user_id" in decoded:
                return decoded["user_id"]
        except Exception:
            pass
    return None


def get_admin_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Cookie(None),
):
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.replace("Bearer ", "")
    elif token:
        raw_token = token
    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    decoded = decode_token(raw_token)
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
        logger.warning("FIREBASE_STORAGE_BUCKET not set ? file upload skipped")
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
    # TODO: wire up real SMS provider (Twilio / etc)
    logger.info(f"[OTP] Sending code to {phone}")


# =========================
# CARD VAULT HELPER
# =========================

def _save_card_vault(db, user_id: str, vault_id: str, last4: Optional[str] = None, brand: Optional[str] = None):
    """Save a vaulted PayPal card to user profile, deduplicating by vault_id."""
    try:
        user_ref = db.collection("users").document(user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            return
        existing = user_doc.to_dict().get("saved_cards", [])
        if any(c.get("vault_id") == vault_id for c in existing):
            return  # already saved
        user_ref.update({
            "saved_cards": firestore.ArrayUnion([{
                "vault_id": vault_id,
                "last4": last4,
                "brand": brand,
                "added_at": now_iso(),
            }])
        })
    except Exception as e:
        logger.warning(f"Card vault save failed for {user_id}: {e}")


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
                title="Your Scheduled Ride is Starting ??",
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
        "http://localhost:3000",
        "https://t-aksi-frontend.onrender.com",
        "https://t-aksi-driver.onrender.com",
        "https://taksi-admin.onrender.com",
        "https://taksi.ge",
        "https://www.taksi.ge",
        "https://transit-elite.preview.emergentagent.com",
    ],
    allow_origin_regex=r"https://.*\.(onrender\.com|emergentagent\.com)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- FIX: Security headers middleware -----------------------------------------
# Adds all 4 headers that were MISSING in the PWA audit report:
#   Content-Security-Policy, X-Frame-Options, Referrer-Policy, Permissions-Policy
@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "camera=(), microphone=(), geolocation=(self), payment=(self)"
    )
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.sandbox.paypal.com "
        "https://maps.googleapis.com https://maps.gstatic.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https: blob:; "
        "connect-src 'self' https://api-m.paypal.com https://api-m.sandbox.paypal.com "
        "https://maps.googleapis.com https://firestore.googleapis.com "
        "https://fcm.googleapis.com wss:; "
        "frame-src https://www.paypal.com https://www.sandbox.paypal.com; "
        "worker-src 'self' blob:;"
    )
    return response


# --- RATE LIMITING ---
import time
from collections import defaultdict

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
    vault_id: Optional[str] = Field(None, alias="vault_id")
    card_last4: Optional[str] = Field(None, alias="card_last4")
    card_brand: Optional[str] = Field(None, alias="card_brand")

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
    amount: float = Field(gt=0)
    bank_details: str


class PayPalTopUpRequest(BaseModel):
    order_id: str
    amount: float = Field(gt=0, le=10000)
    vault_id: Optional[str] = None
    card_last4: Optional[str] = None
    card_brand: Optional[str] = None


class SOSRequest(BaseModel):
    ride_id: Optional[str] = None
    lat: float = 0.0
    lng: float = 0.0
    message: Optional[str] = "SOS triggered"


class TipRequest(BaseModel):
    amount: float = Field(gt=0, le=500)
    tip_amount: Optional[float] = None
    reference_id: Optional[str] = None
    vault_id: Optional[str] = None
    card_last4: Optional[str] = None
    card_brand: Optional[str] = None


class FavoriteLocation(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    address: str
    lat: float
    lng: float
    icon: Optional[str] = "??"


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
        return 0.0


def get_surge_multiplier(lat: float = None, lng: float = None) -> dict:
    """Demand-based surge — only activates when 10+ drivers are online platform-wide."""
    demand = 0.0
    if lat and lng:
        # Check total online drivers first - no surge below 10
        try:
            db = get_db()
            total_online = len(list(db.collection("users")
                .where("user_type", "==", "driver")
                .where("is_online", "==", True)
                .stream()))
            if total_online < 10:
                return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None, "demand_level": 0.0}
        except Exception:
            return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None, "demand_level": 0.0}
        demand = get_area_demand(lat, lng)

    # demand = rides / (drivers * 2), so 0.5 = rides exceed half the drivers
    if demand >= 1.0:
        multiplier, reason = 2.0, "Very high demand in your area"
    elif demand >= 0.75:
        multiplier, reason = 1.8, "High demand in your area"
    elif demand >= 0.60:
        multiplier, reason = 1.5, "Moderate demand in your area"
    elif demand >= 0.50:
        multiplier, reason = 1.2, "More requests than half your local drivers"
    else:
        return {"multiplier": 1.0, "commission_rate": DRIVER_COMMISSION_RATE, "is_surge": False, "surge_reason": None, "demand_level": round(demand, 2)}

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
    wait_minutes: float = 0.0,
    stop_wait_minutes: float = 0.0,
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


@app.post("/api/feedback")
async def submit_feedback(req: Request, user_id: Optional[str] = Depends(get_current_user_id)):
    # ?? ADD THIS EXACT LINE ??
    db = get_db() 
    
    data = await req.json()
    db.collection("feedback").add({
        "user_id": user_id,
        "user_type": data.get("user_type", "rider"),
        "nps": data.get("nps"),
        "category": data.get("category"),
        "stars": data.get("stars"),
        "comment": data.get("comment", ""),
        "created_at": firestore.SERVER_TIMESTAMP,
    })
    return {"status": "ok"}

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
async def register_rider(data: UserRegister, response: Response):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

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
        "welcome_discount_rides_remaining": 2,
        "welcome_discount_pct": 15,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    user_ref.set(user_data)

    token = create_token(user_ref.id, "rider")
    set_auth_cookie(response, token)
    safe_user = {k: v for k, v in user_data.items() if k not in ["password_hash", "created_at", "updated_at"]}
    safe_user["id"] = user_ref.id
    safe_user["created_at"] = now_iso()
    safe_user["updated_at"] = now_iso()
    
    return {"token": token, "user": safe_user}


@app.post("/api/auth/register/driver", tags=["Auth"])
@app.post("/api/driver/register", tags=["Auth"])
async def register_driver(data: UserRegister, response: Response):
    db = get_db()
    phone_norm = normalize_phone(data.cellphone)

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
        "preferred_radius": 2.0,
        "acceptance_rate": 100.0,
        "total_requests": 0,
        "total_accepted": 0,
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
    # Signup bonus tier
    total_registered = len(list(db.collection("users").where("user_type", "==", "driver").stream()))
    if total_registered < 10:
        signup_bonus = 50.0
    elif total_registered < 50:
        signup_bonus = 20.0
    elif total_registered < 100:
        signup_bonus = 10.0
    else:
        signup_bonus = 0.0
    user_data["earnings"]["signup_bonus"] = signup_bonus
    user_data["earnings"]["signup_bonus_used"] = 0.0
    user_ref.set(user_data)

    token = create_token(user_ref.id, "driver")
    set_auth_cookie(response, token)
    
    # ? Strip out password AND both timestamp sentinels
    safe_user = {k: v for k, v in user_data.items() if k not in ["password_hash", "created_at", "updated_at"]}
    safe_user["id"] = user_ref.id
    safe_user["created_at"] = now_iso()
    safe_user["updated_at"] = now_iso() # ? Safely added back as text
    
    return {"token": token, "user": safe_user}


@app.post("/api/auth/login", tags=["Auth"])
@app.post("/api/rider/login", tags=["Auth"])
async def login(data: UserLogin, response: Response):
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
    set_auth_cookie(response, token)
    safe_user = {k: v for k, v in user_data.items() if k != "password_hash"}
    safe_user["id"] = user_doc.id
    return {"token": token, "user": serialize_firestore_data(safe_user)}



@app.post("/api/auth/firebase-phone/verify", tags=["Auth"])
async def verify_firebase_phone(req: Request):
    data = await req.json()
    id_token = data.get("id_token")
    if not id_token:
        raise HTTPException(400, "Missing id_token")
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        phone = decoded.get("phone_number")
        if not phone:
            raise HTTPException(400, "No phone number in token")
        phone_norm = normalize_phone(phone)
        phone_token = create_token(phone_norm, "phone_verified")
        return {"status": "verified", "phone_token": phone_token, "phone_norm": phone_norm}
    except Exception as e:
        raise HTTPException(400, f"Invalid Firebase token: {str(e)}")

AGORA_APP_ID = "952b4fa249fe44e08b64836a9f6c2a43"
AGORA_APP_CERTIFICATE = os.environ.get("AGORA_APP_CERTIFICATE", "6fe49d41759a4319be3ee5768188c326")

@app.get("/api/agora/token", tags=["Calls"])
async def get_agora_token(channel: str, user_id: str = Depends(get_current_user_id)):
    if not AGORA_APP_CERTIFICATE:
        # No certificate - return app ID only (testing mode)
        return {"token": AGORA_APP_ID, "app_id": AGORA_APP_ID, "channel": channel}
    try:
        from agora_token_builder import RtcTokenBuilder, Role_Publisher
        expire = int(time.time()) + 3600
        token = RtcTokenBuilder.buildTokenWithUid(
            AGORA_APP_ID, AGORA_APP_CERTIFICATE, channel, 0, Role_Publisher, expire
        )
        return {"token": token, "app_id": AGORA_APP_ID, "channel": channel}
    except ImportError:
        try:
            from agora_token import RtcTokenBuilder
            expire = int(time.time()) + 3600
            token = RtcTokenBuilder.build_token_with_uid(
                AGORA_APP_ID, AGORA_APP_CERTIFICATE, channel, 0, 1, expire, expire
            )
            return {"token": token, "app_id": AGORA_APP_ID, "channel": channel}
        except Exception as e2:
            logger.error(f"Agora token error: {e2}")
            return {"token": AGORA_APP_ID, "app_id": AGORA_APP_ID, "channel": channel}
    except Exception as e:
        logger.error(f"Agora token error: {e}")
        return {"token": AGORA_APP_ID, "app_id": AGORA_APP_ID, "channel": channel}

@app.post("/api/auth/demo-login", tags=["Auth"])
async def demo_login(response: Response, user_type: str = Query(...)):
    db = get_db()
    if user_type == "rider":
        phone = "+995500000001"
        name = "Demo"
        surname = "Rider"
    elif user_type == "driver":
        phone = "+995500000002"
        name = "Demo"
        surname = "Driver"
    else:
        raise HTTPException(400, "Invalid user type")
    phone_norm = normalize_phone(phone)
    existing = list(db.collection("users").where("cellphone_norm", "==", phone_norm).limit(1).stream())
    if existing:
        doc = existing[0]
        token = create_token(doc.id, user_type)
        set_auth_cookie(response, token)
        safe = {k: v for k, v in doc.to_dict().items() if k != "password_hash"}
        safe["id"] = doc.id
        return {"token": token, "user": serialize_firestore_data(safe)}
    user_ref = db.collection("users").document()
    user_data = {
        "id": user_ref.id,
        "name": name,
        "surname": surname,
        "cellphone": phone,
        "cellphone_norm": phone_norm,
        "user_type": user_type,
        "password_hash": hash_password("demo1234"),
        "registration_status": "approved" if user_type == "driver" else None,
        "is_online": False,
        "driver_info": {"vehicle": {"car_make": "Toyota", "car_model": "Camry", "car_year": 2020, "car_color": "Black", "license_plate": "DEMO-01"}, "vehicle_tier": "economy"} if user_type == "driver" else None,
        "earnings": {"balance": 10.0, "total_earned": 0.0, "total_topped_up": 0.0, "total_withdrawn": 0.0, "total_commission_paid": 0.0, "signup_bonus": 10.0, "signup_bonus_used": 0.0},
        "wallet_balance": 10.0,
        "total_rides": 0,
        "rating": 5.0,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    user_ref.set(user_data)
    token = create_token(user_ref.id, user_type)
    set_auth_cookie(response, token)
    safe = {k: v for k, v in user_data.items() if k != "password_hash"}
    safe["id"] = user_ref.id
    return {"token": token, "user": serialize_firestore_data(safe)}

@app.post("/api/auth/otp/send", tags=["Auth"])
async def send_otp(req: OTPSendRequest):
    db = get_db()
    phone_norm = normalize_phone(req.cellphone)
    if not phone_norm:
        raise HTTPException(422, "Invalid phone number")

    # ?? TEMPORARY BYPASS: Hardcode the OTP to "1111"
    code = _generate_otp()
    expires_at = datetime.now(timezone.utc).timestamp() + OTP_TTL_SECONDS

    db.collection("otp_codes").document(phone_norm).set({
        "phone": phone_norm,
        "code": code,
        "expires_at": expires_at,
        "verified": False,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    # ?? TEMPORARY BYPASS: Comment out the real SMS sender
    _send_otp_code(phone_norm, code)

    return {"status": "sent", "expires_in": OTP_TTL_SECONDS}


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
async def admin_login(data: AdminLoginRequest, response: Response):
    if data.password != ADMIN_PASSWORD:
        raise HTTPException(401, "Invalid admin credentials")

    db = get_db()
    admins = list(db.collection("users").where("user_type", "==", "admin").limit(1).stream())
    if admins:
        admin_doc = admins[0]
        token = create_token(admin_doc.id, "admin")
        set_auth_cookie(response, token)
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
    set_auth_cookie(response, token)
    return {"token": token, "user": {**admin_data, "created_at": now_iso()}}


@app.post("/api/driver/login", tags=["Auth"])
async def driver_login(data: UserLogin, response: Response):
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
    set_auth_cookie(response, token)
    safe_user = {k: v for k, v in user_data.items() if k != "password_hash"}
    safe_user["id"] = user_doc.id
    return {"token": token, "user": serialize_firestore_data(safe_user)}


@app.post("/api/auth/logout", tags=["Auth"])
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"message": "Logged out successfully"}


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
            user_phone = ud.get("cellphone_norm") or ud.get("cellphone", "")

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

    logger.warning(f"?? SOS triggered by {user_name} ({user_phone}) at {req.lat},{req.lng}")
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

@app.get("/api/rides/estimate", tags=["Rides"])
def estimate_fare(
    car_type: str = Query("economy", description="Car type: economy, comfort, or business"),
    distance: float = Query(..., description="Distance in km", gt=0)
):
    """
    Estimate fare based on distance and car type.
    No authentication required (public endpoint for previews).
    """
    try:
        fare = calculate_fare(distance, car_type)
        return {"fare": fare}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
        title="Account Approved! ??",
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
            title="Withdrawal Approved ?",
            body=f"Your withdrawal of ?{data.get('amount', 0):.2f} has been approved.",
            data={"type": "withdrawal_approved"},
        )
    return {"message": "Withdrawal approved"}


@app.post("/api/admin/withdrawal/{id}/reject", tags=["Admin"])
async def reject_withdrawal(id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    withdrawal_doc = db.collection("driver_withdrawals").document(id).get()
    if not withdrawal_doc.exists:
        raise HTTPException(404, "Withdrawal request not found")

    withdrawal_data = withdrawal_doc.to_dict()
    driver_id = withdrawal_data.get("driver_id")

    total_deducted = withdrawal_data.get("total_deducted", 0)
    if not total_deducted or total_deducted == 0:
        amount = withdrawal_data.get("amount", 0)
        fee = withdrawal_data.get("fee", 1.0)
        total_deducted = amount + fee

    if driver_id and total_deducted > 0:
        driver_ref = db.collection("users").document(driver_id)
        driver_doc = driver_ref.get()

        if driver_doc.exists:
            driver_data = driver_doc.to_dict()
            if "earnings" in driver_data and "balance" in driver_data["earnings"]:
                update_field = "earnings.balance"
            else:
                update_field = "wallet_balance"

            driver_ref.update({
                update_field: firestore.Increment(total_deducted)
            })

    db.collection("driver_withdrawals").document(id).update({
        "status": "rejected",
        "rejected_at": firestore.SERVER_TIMESTAMP,
        "rejected_by": admin_id,
    })
    return {"message": "Withdrawal rejected and funds returned to driver wallet"}


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
            title="Top-up Approved ?",
            body=f"?{amount:.2f} has been added to your wallet.",
            data={"type": "topup_approved", "amount": str(amount)},
        )
    return {"message": f"Top-up of ?{amount:.2f} approved and credited"}


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
        title="Balance Updated ??",
        body=f"?{req.amount:.2f} has been added to your account. Reason: {req.reason}",
        data={"type": "balance_added", "amount": str(req.amount)},
    )
    return {"message": f"?{req.amount:.2f} added to {user_type} account"}


@app.post("/api/admin/dispute/refund", tags=["Admin"])
async def admin_dispute_refund(req: AdminRefundRequest, admin_id: str = Depends(get_admin_user)):
    db = get_db()

    if req.driver_id:
        driver_doc = db.collection("users").document(req.driver_id).get()
        if driver_doc.exists:
            driver_balance = driver_doc.to_dict().get("earnings", {}).get("balance", 0)
            deduct = min(req.amount, driver_balance)
            if deduct > 0:
                db.collection("users").document(req.driver_id).update({
                    "earnings.balance": firestore.Increment(-deduct)
                })

    if req.rider_id:
        rider_doc = db.collection("users").document(req.rider_id).get()
        if rider_doc.exists:
            db.collection("users").document(req.rider_id).update({
                "wallet_balance": firestore.Increment(req.amount)
            })
            send_push_notification(
                req.rider_id,
                title="Refund Processed ?",
                body=f"?{req.amount:.2f} has been refunded to your wallet.",
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

    return {"message": f"Refund of ?{req.amount:.2f} processed"}


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

        # 1. FIX THE FEEDBACK 404 ERROR
@app.get("/api/admin/feedback", tags=["Admin"])
async def get_all_feedback(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    try:
        # Try to get the newest feedback first
        docs = list(
            db.collection("feedback")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(100)
            .stream()
        )
    except Exception:
        # Fallback if Firebase hasn't built the index yet
        docs = list(db.collection("feedback").stream())
        
    result = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]
    return {"feedback": result}

@app.get("/api/admin/campaigns/templates", tags=["Admin"])
async def get_campaign_templates(admin_id: str = Depends(get_admin_user)):
    # Providing default templates so the frontend stops crashing
    templates = [
        {
            "id": "t1", 
            "title": "Weekend Warrior", 
            "description": "Complete 10 rides this weekend.", 
            "target_value": 10, 
            "reward": 20
        },
        {
            "id": "t2", 
            "title": "5-Star Driver", 
            "description": "Maintain a 5-star rating for 20 rides.", 
            "target_value": 20, 
            "reward": 50
        }
    ]
    return {"templates": templates}

@app.get("/api/admin/support/tickets", tags=["Admin"])
async def get_all_support_tickets(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    # This fetches EVERYTHING so the dashboard can show the full list
    tickets = db.collection("support_tickets").order_by("created_at", direction=firestore.Query.DESCENDING).limit(100).stream()
    result = [serialize_firestore_data({**t.to_dict(), "id": t.id}) for t in tickets]
    return {"tickets": result, "count": len(result)}

@app.get("/api/admin/support/tickets/escalated", tags=["Admin"])
async def get_escalated_tickets(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    # 1. Fetch from Firestore
    tickets = db.collection("support_tickets").where("status", "==", "escalated").limit(50).stream()
    result = [serialize_firestore_data({**t.to_dict(), "id": t.id}) for t in tickets]
    
    # 2. Map priorities to numbers so they sort correctly (0 is top priority)
    prio_weight = {"high": 0, "medium": 1, "low": 2}

    # 3. Sort by priority number, then by date
    result.sort(key=lambda x: (
        prio_weight.get(str(x.get("priority", "medium")).lower(), 1), 
        str(x.get("created_at", "")) # Convert to string to prevent crashing on missing dates
    ))

    return {"tickets": result, "count": len(result)}

@app.post("/api/admin/support/tickets/{ticket_id}/respond", tags=["Admin"])
async def respond_support_ticket(ticket_id: str, response: str = Query(default=""), resolve: bool = Query(default=False), admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("support_tickets").document(ticket_id)
    update = {"status": "resolved" if resolve else "in_progress", "admin_reply": response, "replied_at": firestore.SERVER_TIMESTAMP}
    ref.update(update)
    return {"status": "ok"}

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


@app.post("/api/admin/support/tickets/{ticket_id}/resolve", tags=["Admin"])
async def resolve_support_ticket(ticket_id: str, notes: str = Query(default="Resolved by admin"), admin_id: str = Depends(get_admin_user)):
    db = get_db()
    ref = db.collection("support_tickets").document(ticket_id)
    ref.update({"status": "resolved", "resolved_at": firestore.SERVER_TIMESTAMP, "resolution_notes": notes})
    return {"status": "resolved"}

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

    if req.vault_id:
        _save_card_vault(db, user_id, req.vault_id, req.card_last4, req.card_brand)

    return {"message": f"Successfully added ?{req.amount:.2f} to wallet"}


@app.post("/api/driver/vehicle", tags=["Driver"])
async def register_vehicle(
    car_make: str = Form(...),
    car_model: str = Form(...),
    car_year: int = Form(...),
    car_color: str = Form(...),
    license_plate: str = Form(...),
    vehicle_tier: str = Form("economy"),
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
        "tier": vehicle_tier.lower() if vehicle_tier in ["economy","comfort","suv","jumpstart","personal"] else "economy",
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
        "message": f"Top-up request for ?{request.amount} submitted",
        "request_id": topup_ref.id,
        "amount": request.amount,
        "payment_link": "https://egreve.bog.ge//Taksi",
    }


@app.post("/api/driver/withdraw", tags=["Driver"])
async def request_withdrawal(req: WithdrawRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    driver_ref = db.collection("users").document(user_id)
    doc = driver_ref.get()

    if not doc.exists:
        raise HTTPException(404, "Driver not found")

    data = doc.to_dict()

    if data.get("user_type") != "driver":
        raise HTTPException(403, "Only drivers can request withdrawals")

    earnings = data.get("earnings", {}).get("balance")
    if earnings is None:
        earnings = data.get("wallet_balance", 0.0)
        update_field = "wallet_balance"
    else:
        update_field = "earnings.balance"

    WITHDRAWAL_FEE = 1.0
    MINIMUM_RESERVE = 5.0
    total_deduction = req.amount + WITHDRAWAL_FEE
    signup_bonus = data.get("earnings", {}).get("signup_bonus", 0.0)
    signup_bonus_used = data.get("earnings", {}).get("signup_bonus_used", 0.0)
    remaining_bonus = max(0.0, signup_bonus - signup_bonus_used)
    withdrawable_balance = max(0.0, earnings - remaining_bonus)

    if withdrawable_balance - total_deduction < MINIMUM_RESERVE:
        max_withdrawal = max(0.0, withdrawable_balance - MINIMUM_RESERVE - WITHDRAWAL_FEE)
        raise HTTPException(
            400,
            f"Insufficient funds. Must keep ?{MINIMUM_RESERVE:.2f} reserve + ?{WITHDRAWAL_FEE:.2f} fee. "
            f"Max withdrawal: ?{max_withdrawal:.2f}",
        )

    driver_ref.update({update_field: firestore.Increment(-total_deduction)})

    db.collection("driver_withdrawals").add({
        "driver_id": user_id,
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

    return {"message": f"Withdrawal of ?{req.amount:.2f} requested. ?{WITHDRAWAL_FEE:.2f} fee applied."}


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
        rides.sort(key=lambda r: str(r.to_dict().get("created_at", "")), reverse=True)
    return {"rides": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in rides]}


@app.get("/api/driver/withdrawals/history", tags=["Driver"])
async def get_driver_withdrawal_history(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"withdrawals": []}
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
        raise HTTPException(400, f"Insufficient balance. Need ?{required_commission:.2f}")

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
                eligibility_reason = f"Need ={min_rating} rating"
            elif driver_rides < min_rides:
                eligible = False
                eligibility_reason = f"Need ={min_rides} rides"

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
        tickets.sort(key=lambda t: str(t.to_dict().get("created_at", "")), reverse=True)
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
        "user_phone": user_data.get("cellphone_norm") or user_data.get("cellphone", ""),
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

    return {"message": f"Referral code applied! You received ?{REFERRED_BONUS:.2f}"}


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
        "icon": fav.icon or "??",
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

@app.post("/api/rider/wallet/vault", tags=["Wallet"])
async def vault_card_only(
    payload: dict = Body(...),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    billing_token = payload.get("billing_token") or payload.get("vault_id")
    if not billing_token:
        raise HTTPException(status_code=400, detail="Missing billing token")
    _save_card_vault(db, user_id, billing_token, payload.get("last4"), payload.get("brand"))
    return {"status": "success", "message": "Card reference saved"}


@app.post("/api/rider/wallet/topup-vaulted", tags=["Wallet"])
async def topup_vaulted(
    payload: dict = Body(...),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    amount_gel = payload.get("amount", 0)
    vault_id = payload.get("vault_id")
    if not vault_id or amount_gel <= 0:
        raise HTTPException(400, "vault_id and amount are required")

    # TODO: charge via PayPal vault API here
    db.collection("users").document(user_id).update({
        "wallet_balance": firestore.Increment(amount_gel)
    })
    return {"status": "success", "message": f"?{amount_gel:.2f} added to wallet"}


@app.post("/api/rider/wallet/topup", tags=["Rider"])
@app.post("/api/rider/wallet/topup/paypal", tags=["Rider"])
async def rider_topup_paypal(req: PayPalTopUpRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()

    if req.order_id:
        access_token = await get_paypal_token()
        if access_token:
            async with httpx.AsyncClient(timeout=25) as client:
                try:
                    resp = await client.get(
                        f"{PAYPAL_API_BASE}/v2/checkout/orders/{req.order_id}",
                        headers={"Authorization": f"Bearer {access_token}"},
                    )
                    if resp.status_code == 200:
                        order_data = resp.json()
                        if order_data.get("status") not in ("COMPLETED", "APPROVED"):
                            raise HTTPException(400, "PayPal payment not completed")
                        existing = list(
                            db.collection("wallet_transactions")
                            .where("order_id", "==", req.order_id)
                            .limit(1)
                            .stream()
                        )
                        if existing:
                            raise HTTPException(409, "This PayPal order has already been processed")
                except HTTPException:
                    raise
                except Exception as e:
                    logger.warning(f"PayPal order verification failed: {e}")

    db.collection("users").document(user_id).update({
        "wallet_balance": firestore.Increment(req.amount),
    })

    db.collection("wallet_transactions").add({
        "user_id": user_id,
        "type": "rider_topup",
        "amount": req.amount,
        "order_id": req.order_id,
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    if req.vault_id:
        _save_card_vault(db, user_id, req.vault_id, req.card_last4, req.card_brand)

    return {"message": f"Successfully added ?{req.amount:.2f} to wallet"}


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
            try:
                if hasattr(start_time, "timestamp"):
                    start_dt = datetime.fromtimestamp(start_time.timestamp(), tz=timezone.utc)
                else:
                    start_dt = start_time
                wait_seconds = (datetime.now(timezone.utc) - start_dt).total_seconds()
                wait_minutes = round(max(0.0, wait_seconds / 60.0), 4)
            except Exception:
                wait_minutes = 0.0
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

    ride_owner = ride_data.get("userId") or ride_data.get("user_id") or ride_data.get("rider_id")
    if ride_owner and ride_owner != user_id:
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
    final_user_id = user_id or ride_data.user_id
    if not final_user_id:
        raise HTTPException(401, "Authentication required to request a ride")

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
    # Apply lifetime promo discount
    _rider_doc = db.collection("users").document(final_user_id).get()
    _rider_promo = (_rider_doc.to_dict() or {}).get("promo", {}) if _rider_doc.exists else {}
    if _rider_promo.get("active") and _rider_promo.get("type") == "lifetime":
        _disc_pct = float(_rider_promo.get("discount_pct", 0)) / 100.0
        _disc_amt = round(fare["total"] * _disc_pct, 2)
        fare["total"] = round(fare["total"] - _disc_amt, 2)
        fare["promo_discount"] = _disc_amt
        fare["promo_code"] = _rider_promo.get("code", "")
    # Apply welcome discount for new riders (first 2 rides)
    _rider_doc3 = db.collection("users").document(final_user_id).get()
    _rider_d3 = _rider_doc3.to_dict() or {} if _rider_doc3.exists else {}
    _welcome_remaining = int(_rider_d3.get("welcome_discount_rides_remaining", 0))
    if _welcome_remaining > 0:
        _welcome_disc = round(fare["total"] * 0.15, 2)
        fare["total"] = round(fare["total"] - _welcome_disc, 2)
        fare["welcome_discount"] = _welcome_disc
        db.collection("users").document(final_user_id).update({"welcome_discount_rides_remaining": firestore.Increment(-1)})
    # Apply loyalty 15% discount if earned
    _rider_doc2 = db.collection("users").document(final_user_id).get()
    _rider_d2 = _rider_doc2.to_dict() or {} if _rider_doc2.exists else {}
    if _rider_d2.get("loyalty_free_ride_earned"):
        _loyalty_disc = round(fare["total"] * 0.15, 2)
        fare["total"] = round(fare["total"] - _loyalty_disc, 2)
        fare["loyalty_discount"] = _loyalty_disc
        # Clear the flag so it only applies once
        db.collection("users").document(final_user_id).update({"loyalty_free_ride_earned": False, "loyalty_discount_pct": 0})

    stops_data = [
        {"address": s.get("address", ""), "lat": s.get("lat", 0), "lng": s.get("lng", 0), "order": s.get("order", 0)}
        for s in ride_data.stops if isinstance(s, dict)
    ]

    if getattr(ride_data, 'vault_id', None):
        _save_card_vault(db, final_user_id, ride_data.vault_id, ride_data.card_last4, ride_data.card_brand)

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
        "vault_id": getattr(ride_data, 'vault_id', None),
        "card_last4": getattr(ride_data, 'card_last4', None),
        "card_brand": getattr(ride_data, 'card_brand', None),
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

    radius_progression = [2, 4, 6, 10, 15, 25]
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
        # Also check drivers finishing nearby rides (within 1km of dropoff)
        finishing_drivers = []
        try:
            active_rides = db.collection("rides").where("status", "in", ["in_progress", "arrived"]).stream()
            for ar in active_rides:
                ard = ar.to_dict()
                dropoff_lat = ard.get("dropoff_lat")
                dropoff_lng = ard.get("dropoff_lng")
                if not dropoff_lat or not dropoff_lng:
                    continue
                dist_to_new_pickup = haversine_distance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
                if dist_to_new_pickup <= 1.0:
                    finishing_driver_id = ard.get("driver_id")
                    if finishing_driver_id and finishing_driver_id not in declined and finishing_driver_id not in already_notified:
                        finishing_drivers.append(finishing_driver_id)
        except Exception as e:
            logger.warning(f"Finishing drivers check failed: {e}")

        for driver in drivers:
            driver_data = driver.to_dict()
            if driver.id in declined or driver.id in already_notified:
                continue

            estimated_fare = ride_data.get("estimated_fare", 0)
            commission_rate = ride_data.get("commission_rate", DRIVER_COMMISSION_RATE)
            required_commission = estimated_fare * commission_rate
            _earn = driver_data.get("earnings", {})
            driver_balance = _earn.get("balance", 0)
            _bonus = _earn.get("signup_bonus", 0)
            _bonus_used = _earn.get("signup_bonus_used", 0)
            _remaining_bonus = max(0, _bonus - _bonus_used)
            _effective_balance = driver_balance + _remaining_bonus
            ride_payment = ride_data.get("payment_method", "cash")
            if ride_payment == "cash" and _effective_balance < required_commission:
                continue


            ride_car_type = (ride_data.get("carType") or "economy").lower()
            ELIGIBLE_TYPES = {"economy":{"economy","jumpstart","personal"},"comfort":{"comfort","economy","jumpstart","personal"},"suv":{"suv","comfort","economy","jumpstart","personal"},"jumpstart":{"economy","comfort","suv","personal","jumpstart"},"personal":{"economy","comfort","suv","personal","jumpstart"}}
            allowed = ELIGIBLE_TYPES.get(ride_car_type, {"economy"})
            dv = driver_data.get("driver_info",{}).get("vehicles",[])
            da = driver_data.get("driver_info",{}).get("active_vehicle_id")
            dveh = next((v for v in dv if v.get("id")==da), dv[0] if dv else {})
            driver_tier = (dveh.get("tier") or dveh.get("vehicle_tier") or driver_data.get("driver_info",{}).get("vehicle_tier") or "economy").lower()
            if driver_tier not in allowed: continue
            driver_location = driver_data.get("current_location")
            if driver_location and driver_location.get("lat") and driver_location.get("lng"):
                distance = haversine_distance(
                    pickup_lat, pickup_lng, driver_location["lat"], driver_location["lng"]
                )
                driver_preferred_radius = driver_data.get("preferred_radius", 2.0)
                effective_radius = max(radius, driver_preferred_radius)
                is_finishing_nearby = driver.id in finishing_drivers
                if distance <= effective_radius or is_finishing_nearby:
                    nearby_drivers.append({
                        "id": driver.id,
                        "distance": round(distance, 2),
                        "name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip(),
                        "rating": driver_data.get("rating", 5.0),
                        "balance": driver_balance,
                    })

        nearby_drivers.sort(key=lambda x: (x["distance"], -x.get("acceptance_rate", 100)))
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
                    title=f"New {(ride_data.get('carType') or 'Economy').title()} Ride Request",
                    body=f"Pickup {round(driver['distance'], 1)}km away - GEL {ride_data.get('estimated_fare', 0):.0f}",
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
    balance = driver_data.get("earnings", {}).get("balance", 0)
    held_commission = (ride_data.get("estimated_fare", 0) or 0) * commission_rate

    # Balance check ? driver must have enough to cover commission
    if balance < held_commission:
        raise HTTPException(
            400,
            f"Insufficient balance. Need ?{held_commission:.2f} to accept this ride. "
            f"Current balance: ?{balance:.2f}. Please top up your wallet."
        )


    _rct = (ride_data.get("carType") or "economy").lower()
    _E = {"economy":{"economy","jumpstart","personal"},"comfort":{"comfort","economy","jumpstart","personal"},"suv":{"suv","comfort","economy","jumpstart","personal"},"jumpstart":{"economy","comfort","suv","personal","jumpstart"},"personal":{"economy","comfort","suv","personal","jumpstart"}}
    _dv = driver_data.get("driver_info",{}).get("vehicles",[])
    _da = driver_data.get("driver_info",{}).get("active_vehicle_id")
    _dav = next((v for v in _dv if v.get("id")==_da), _dv[0] if _dv else {})
    if _dav.get("tier","economy").lower() not in _E.get(_rct,{"economy"}): raise __import__("fastapi").HTTPException(403,"Wrong vehicle type for this ride.")
    new_balance = balance - held_commission
    db.collection("users").document(user_id).update({
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
        "driver_id": user_id,
        "driver_info": {
            "id": user_id,
            "name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip(),
            "cellphone": driver_data.get("cellphone_norm") or driver_data.get("cellphone"),
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
            title="Driver Found! ??",
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
    # Track acceptance rate
    try:
        driver_ref = db.collection("users").document(user_id)
        driver_doc = driver_ref.get()
        if driver_doc.exists:
            dd = driver_doc.to_dict()
            total_req = dd.get("total_requests", 0) + 1
            total_acc = dd.get("total_accepted", 0)
            acc_rate = round((total_acc / total_req) * 100, 1) if total_req > 0 else 100.0
            driver_ref.update({"total_requests": total_req, "acceptance_rate": acc_rate})
    except Exception as e:
        logger.warning(f"Acceptance rate update failed: {e}")
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
                title="Your Driver Has Arrived ??",
                body="Your driver is waiting. Please come down.",
                data={"type": "driver_arrived", "ride_id": ride_id},
            )
    return {"message": "Marked as arrived"}


@app.post("/api/rides/{ride_id}/start", tags=["Rides"])
async def start_ride(
    ride_id: str,
    body: dict = Body(default={}),
    user_id: Optional[str] = Depends(get_current_user_id),
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    ride_data = ride_doc.to_dict()

    # Prefer client-sent wait time (fractional minutes, e.g. 2.5 = 2m30s).
    # Fall back to server-side calculation only if client didn't send it.
    client_wait = body.get("pickup_wait_time")
    if client_wait is not None:
        try:
            wait_minutes = float(client_wait)
        except (TypeError, ValueError):
            wait_minutes = 0.0
    else:
        # Server-side fallback: calculate from arrived_at timestamp
        arrived_at = ride_data.get("arrived_at")
        wait_minutes = 0.0
        if arrived_at and hasattr(arrived_at, "timestamp"):
            try:
                wait_seconds = (datetime.now(timezone.utc) - arrived_at).total_seconds()
                wait_minutes = max(0.0, wait_seconds / 60.0)
            except Exception:
                wait_minutes = 0.0

    db.collection("rides").document(ride_id).update({
        "status": "in_progress",
        "pickup_wait_minutes": wait_minutes,
        "started_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Ride started", "pickup_wait_minutes": round(wait_minutes, 4)}


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


@app.post("/api/rides/{ride_id}/mid-trip-wait", tags=["Rides"])
async def mid_trip_wait(
    ride_id: str,
    action: str = Query(..., description="'start' or 'stop'"),
    user_id: Optional[str] = Depends(get_current_user_id),
):
    """
    Start or stop a mid-trip wait timer (e.g. driver waiting at a stop).
    On stop, banks the elapsed minutes into stop_wait_minutes and recalculates the fare.
    """
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    if action not in ("start", "stop"):
        raise HTTPException(400, "action must be 'start' or 'stop'")

    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride_snap = ride_ref.get()
    if not ride_snap.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_snap.to_dict()

    if action == "start":
        ride_ref.update({"mid_trip_wait_start": firestore.SERVER_TIMESTAMP})
        return {"message": "Wait timer started"}

    # action == "stop" ? bank elapsed time, recalculate fare
    start_ts = ride_data.get("mid_trip_wait_start")
    elapsed_min = 0.0

    if start_ts is not None:
        try:
            if hasattr(start_ts, "timestamp"):
                start_dt = datetime.fromtimestamp(start_ts.timestamp(), tz=timezone.utc)
            else:
                start_dt = start_ts
            elapsed_sec = (datetime.now(timezone.utc) - start_dt).total_seconds()
            elapsed_min = max(0.0, elapsed_sec / 60.0)
        except Exception as e:
            logger.warning(f"mid_trip_wait stop: could not compute elapsed: {e}")

    # Accumulate into stop_wait_minutes
    current_stop_wait = float(ride_data.get("stop_wait_minutes", 0) or 0)
    new_stop_wait = current_stop_wait + elapsed_min

    # Recalculate fare
    car_type = ride_data.get("carType") or ride_data.get("car_type") or "economy"
    distance  = float(ride_data.get("estimated_distance", 0) or 0)
    pickup_wait = float(ride_data.get("pickup_wait_minutes", 0) or 0)
    num_stops = ride_data.get("num_stops", 0)
    surge     = float(ride_data.get("surge_multiplier", 1.0) or 1.0)

    new_fare = calculate_fare(car_type, distance, pickup_wait, new_stop_wait, num_stops, surge)

    ride_ref.update({
        "stop_wait_minutes": new_stop_wait,
        "mid_trip_wait_start": None,
        "estimated_fare": new_fare["total"],
        "fare_breakdown": new_fare,
    })

    return {
        "message": "Wait timer stopped",
        "accumulated_minutes": round(new_stop_wait, 4),
        "elapsed_minutes": round(elapsed_min, 4),
        "new_estimated_fare": new_fare["total"],
        "fare_breakdown": new_fare,
    }


@app.post("/api/rides/{ride_id}/complete", tags=["Rides"])
async def complete_ride(
    ride_id: str,
    final_distance: Optional[float] = 0.0,
    total_wait_minutes: Optional[float] = None,   # float ? fractional minutes from driver client
    dropoff_lat: Optional[float] = None,
    dropoff_lng: Optional[float] = None,
    user_id: Optional[str] = Depends(get_current_user_id),
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride_snap = ride_ref.get()

    if not ride_snap.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_snap.to_dict()

    # -- Distance: use actual GPS-tracked distance, fall back to estimate ------
    estimated_distance = ride_data.get("estimated_distance", 0) or 0
    billing_distance = final_distance if (final_distance and final_distance > 0) else estimated_distance
    recorded_actual_distance = billing_distance

    # -- Wait minutes: trust client value if provided, else read from DB -------
    db_pickup_wait = float(ride_data.get("pickup_wait_minutes", 0) or 0)
    db_stop_wait   = float(ride_data.get("stop_wait_minutes", 0) or 0)

    if total_wait_minutes is not None and total_wait_minutes >= 0:
        # Client sends the total (pickup + mid-trip). Split proportionally using DB values,
        # or assign all to pickup if there's no mid-trip wait on record.
        total_db = db_pickup_wait + db_stop_wait
        if total_db > 0:
            ratio = db_pickup_wait / total_db
            pickup_wait = total_wait_minutes * ratio
            stop_wait   = total_wait_minutes * (1 - ratio)
        else:
            pickup_wait = total_wait_minutes
            stop_wait   = 0.0
    else:
        # Fallback: use whatever the DB recorded (set by /start and mid-trip endpoints)
        pickup_wait = db_pickup_wait
        stop_wait   = db_stop_wait

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

    is_corporate = "corporate" in safe_payment_method

    if is_corporate:
        # Charge the corporate wallet
        corp_id = ride_data.get("corporate_account_id")
        corp_balance = 0.0
        if corp_id:
            try:
                corp_doc = db.collection("corporate_accounts").document(corp_id).get()
                if corp_doc.exists:
                    corp_balance = float(corp_doc.to_dict().get("wallet_balance", 0.0))
            except Exception:
                pass
        if corp_balance >= total_with_fee:
            db.collection("corporate_accounts").document(corp_id).update({
                "wallet_balance": firestore.Increment(-float(total_with_fee))
            })
            cash_to_collect = 0.0
            payment_status = "paid_via_corporate"
        else:
            # Corporate wallet insufficient - fall back to cash
            cash_to_collect = total_with_fee
            payment_status = "corporate_insufficient_funds"
    elif is_wallet:
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

    ride_ref.update(ride_updates)

    if driver_id:
        try:
            held_commission = ride_data.get("commission_paid", 0) or 0
            commission_rate = ride_data.get("commission_rate", 0.23)

            actual_commission = commissionable_amount * commission_rate
            driver_share = commissionable_amount - actual_commission

            commission_refund = held_commission - actual_commission
            wallet_change = driver_share - cash_to_collect + commission_refund

            driver_doc_ref = db.collection("users").document(driver_id)
            # Signup bonus: for cash trips, deduct commission from bonus first
            _driver_data = driver_doc_ref.get().to_dict() or {}
            _earnings = _driver_data.get("earnings", {})
            _bonus = float(_earnings.get("signup_bonus", 0.0))
            _bonus_used = float(_earnings.get("signup_bonus_used", 0.0))
            _remaining_bonus = max(0.0, _bonus - _bonus_used)
            _is_cash = not is_card and not is_wallet
            if _is_cash and _remaining_bonus > 0:
                _comm_from_bonus = min(actual_commission, _remaining_bonus)
                driver_doc_ref.update({
                    "earnings.signup_bonus_used": firestore.Increment(_comm_from_bonus),
                    "earnings.balance": firestore.Increment(wallet_change),
                    "earnings.total_earned": firestore.Increment(driver_share),
                    "total_rides": firestore.Increment(1),
                })
            else:
                driver_doc_ref.update({
                    "earnings.balance": firestore.Increment(wallet_change),
                    "earnings.total_earned": firestore.Increment(driver_share),
                    "total_rides": firestore.Increment(1),
                })
        except Exception as e:
            logger.error(f"Post-ride Driver update failed gracefully: {e}")
    # Competition trip tracking
    if driver_id:
        try:
            from datetime import datetime, timezone, timedelta
            _now = datetime.now(timezone.utc)
            _anchor = datetime(2026, 3, 16, 0, 0, 0, tzinfo=timezone.utc)
            _week_num = (_now - _anchor).days // 7
            _is_comp = (_week_num % 2) == 0
            if _is_comp:
                _week_start = _anchor + timedelta(weeks=_week_num)
                _week_key = _week_start.strftime("%Y-%m-%d")
                db.collection("users").document(driver_id).update({
                    f"competition_trips.{_week_key}": firestore.Increment(1)
                })
        except Exception as e:
            logger.error(f"Competition trip tracking failed: {e}")

    if rider_id and rider_ref:
        try:
            if rider_ref.get().exists:
                _rider_data = rider_ref.get().to_dict() or {}
                _total = int(_rider_data.get("total_rides", 0)) + 1
                _cycle_rides = _total % 13  # 0 = just completed 13th ride
                _loyalty_update = {
                    "total_rides": firestore.Increment(1),
                    "loyalty_rides_in_cycle": _cycle_rides,
                }
                if _total > 0 and _total % 13 == 0:
                    _loyalty_update["loyalty_free_ride_earned"] = True
                    _loyalty_update["loyalty_discount_pct"] = 15
                    send_push_notification(
                        rider_id,
                        title="ðŸŽ‰ Free Ride Discount Earned!",
                        body="You completed 12 rides! Your next ride is 15% off.",
                        data={"type": "loyalty_reward"},
                    )
                rider_ref.update(_loyalty_update)
        except Exception as e:
            logger.error(f"Post-ride Rider update failed gracefully: {e}")

    if rider_id:
        send_push_notification(
            rider_id,
            title="Ride Complete ?",
            body=f"Your trip has ended. Total: ?{total_with_fee:.2f}",
            data={"type": "ride_completed", "ride_id": ride_id},
        )

    # Send email receipt to rider
    try:
        if rider_id:
            rider_doc = db.collection("users").document(rider_id).get()
            if rider_doc.exists:
                rider_data = rider_doc.to_dict()
                rider_email = rider_data.get("email")
                rider_name = rider_data.get("name", "Rider")
                if rider_email:
                    full_ride_data = {**ride_data, **ride_updates, "id": ride_id}
                    import threading
                    threading.Thread(
                        target=send_email_receipt,
                        args=(rider_email, full_ride_data, rider_name),
                        daemon=True
                    ).start()
    except Exception as e:
        logger.warning(f"Email receipt trigger failed: {e}")

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

    payment_method = ride_data.get("payment_method") or ride_data.get("paymentMethod", "cash")
    rider_id = ride_data.get("userId") or ride_data.get("rider_id") or ride_data.get("user_id")

    if "card" in str(payment_method).lower() and rider_id and not ride_data.get("refunded"):
        fare_to_refund = ride_data.get("estimated_fare", 0)
        if fare_to_refund > 0:
            db.collection("users").document(rider_id).update({
                "wallet_balance": firestore.Increment(fare_to_refund)
            })

    driver_id = ride_data.get("driver_id") or ride_data.get("driverId")
    if driver_id and current_status in ["accepted", "arrived"]:
        commission_paid = ride_data.get("commission_paid", 0)
        if commission_paid > 0:
            db.collection("users").document(driver_id).update({
                "earnings.balance": firestore.Increment(commission_paid),
                "earnings.total_commission_paid": firestore.Increment(-commission_paid),
            })

    # Cancellation fee: 3 GEL if rider cancels after driver has arrived
    cancellation_fee = 0.0
    is_rider_cancel = (user_id == rider_id)
    if is_rider_cancel and current_status == "arrived" and driver_id:
        cancellation_fee = 3.0
        if rider_id:
            rider_doc = db.collection("users").document(rider_id).get()
            rider_data = rider_doc.to_dict() if rider_doc.exists else {}
            rider_balance = float(rider_data.get("wallet_balance", 0))
            actual_fee = min(cancellation_fee, rider_balance) if rider_balance > 0 else 0.0
            if actual_fee > 0:
                db.collection("users").document(rider_id).update({
                    "wallet_balance": firestore.Increment(-actual_fee)
                })
                db.collection("users").document(driver_id).update({
                    "earnings.balance": firestore.Increment(actual_fee),
                    "earnings.total_earned": firestore.Increment(actual_fee),
                })
                cancellation_fee = actual_fee
    ride_ref.update({
        "status": "cancelled",
        "cancelled_by": user_id,
        "cancelled_at": firestore.SERVER_TIMESTAMP,
        "cancellation_fee": cancellation_fee,
    })
    if driver_id:
        if cancellation_fee > 0:
            send_push_notification(
                driver_id,
                title="Ride Cancelled - Fee Applied",
                body=f"Rider cancelled after arrival. GEL {cancellation_fee:.2f} no-show fee paid to you.",
                data={"type": "ride_cancelled", "ride_id": ride_id, "fee": str(cancellation_fee)},
            )
        else:
            send_push_notification(
                driver_id,
                title="Ride Cancelled",
                body="The rider cancelled this ride. Commission refunded.",
                data={"type": "ride_cancelled", "ride_id": ride_id},
            )
    if rider_id and cancellation_fee > 0:
        send_push_notification(
            rider_id,
            title="Cancellation Fee Applied",
            body=f"GEL {cancellation_fee:.2f} no-show fee charged as the driver had already arrived.",
            data={"type": "cancellation_fee", "fee": str(cancellation_fee)},
        )
    msg = "Ride cancelled"
    if cancellation_fee > 0:
        msg = f"Ride cancelled. GEL {cancellation_fee:.2f} no-show fee applied."
    return {"message": msg, "cancellation_fee": cancellation_fee}

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
        rides.sort(key=lambda r: str(r.to_dict().get("created_at", "")), reverse=True)
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
        rides.sort(key=lambda r: str(r.to_dict().get("created_at", "")), reverse=True)
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


# --- FIX: registered on BOTH paths so frontend works regardless of which it calls
@app.post("/api/rides/{ride_id}/rate-driver", tags=["Rides"])
@app.post("/api/rides/{ride_id}/rate/driver", tags=["Rides"])
async def rate_driver(
    ride_id: str, rating_data: RateDriverRequest, user_id: Optional[str] = Depends(get_current_user_id)
):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    data = ride.to_dict()

    ride_ref.update({
        "driver_rating": rating_data.rating,
        "driver_review": rating_data.review,
        "rated_at": firestore.SERVER_TIMESTAMP,
    })

    driver_id = data.get("driver_id") or data.get("driverId")
    if driver_id:
        driver_ref = db.collection("users").document(driver_id)
        driver_doc = driver_ref.get()
        if driver_doc.exists:
            d_data = driver_doc.to_dict()
            current_rating = d_data.get("rating", 5.0)
            total_rides = d_data.get("total_rides", 1)
            new_rating = ((current_rating * total_rides) + rating_data.rating) / (total_rides + 1)
            driver_ref.update({"rating": round(new_rating, 2)})

    return {"message": "Driver rated successfully"}


# --- FIX 1: CHAT ? sender_role saved with every message -----------------------
# Each message now stores sender_role = "rider" or "driver"
# Frontend uses this field to align chat bubbles (left = other, right = you)
# FCM push notification sent to the OTHER party so they get notified
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

    # Determine who is sending and who should receive the notification
    if user_id == rider_id:
        sender_role = "rider"
        recipient_id = driver_id
        notification_title = "Message from your rider ??"
    elif user_id == driver_id:
        sender_role = "driver"
        recipient_id = rider_id
        notification_title = "Message from your driver ??"
    else:
        raise HTTPException(403, "You are not a participant in this ride")

    # Save message with sender_role so frontend can distinguish bubbles
    message_doc = {
        "ride_id":     ride_id,
        "sender_id":   user_id,
        "sender_role": sender_role,   # ? "rider" or "driver" ? frontend uses this
        "message":     msg.message,
        "timestamp":   firestore.SERVER_TIMESTAMP,
        "read":        False,
    }
    db.collection("ride_messages").add(message_doc)

    # Push to the OTHER party so they get notified
    if recipient_id:
        send_push_notification(
            recipient_id,
            title=notification_title,
            body=msg.message[:100],
            data={"type": "chat_message", "ride_id": ride_id},
        )

    return {"message": "Message sent", "sender_role": sender_role}


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
    tip_amount = req.tip_amount or req.amount
    driver_id = ride_data.get("driver_id") or ride_data.get("driverId")

    if not req.reference_id:
        rider_doc = db.collection("users").document(user_id).get()
        rider_data = rider_doc.to_dict()
        wallet_balance = float(rider_data.get("wallet_balance", 0))
        if wallet_balance < tip_amount:
            raise HTTPException(400, f"Insufficient wallet balance.")

        db.collection("users").document(user_id).update({
            "wallet_balance": firestore.Increment(-tip_amount)
        })

    if req.vault_id:
        _save_card_vault(db, user_id, req.vault_id, req.card_last4, req.card_brand)

    if driver_id:
        db.collection("users").document(driver_id).update({
            "earnings.balance": firestore.Increment(tip_amount),
            "earnings.total_earned": firestore.Increment(tip_amount),
        })

    db.collection("rides").document(ride_id).update({
        "tip_amount": firestore.Increment(tip_amount),
        "tipped": True,
    })

    return {"message": "Tip processed"}


# --- FIX 2: SHARE RIDE ? uses FRONTEND_URL instead of hardcoded taksi.ge ------
# The old code had: share_link = f"https://taksi.ge/track/{ride_id}"
# taksi.ge/track doesn't exist ? "server cannot be found" error on the recipient's phone
# Now uses FRONTEND_URL env var (defaults to t-aksi-frontend.onrender.com)
# To override: set FRONTEND_URL=https://taksi.ge in your Render environment variables
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

    share_link = f"{FRONTEND_URL}/track/{ride_id}"
    return {
        "share_link": share_link,
        "message": "Share this link to let others track your ride",
        "ride_id": ride_id,
    }

# redeploy
# ============================================================
# COMPETITION SYSTEM
# ============================================================
import math as _math

def get_competition_week(now=None):
    """Returns (is_competition_week, week_start, week_end) based on bi-weekly Monday schedule.
    Anchor date: 2026-03-16 (first competition Monday).
    Competition weeks are even-numbered cycles (0, 2, 4...).
    """
    from datetime import datetime, timezone, timedelta
    if now is None:
        now = datetime.now(timezone.utc)
    anchor = datetime(2026, 3, 16, 0, 0, 0, tzinfo=timezone.utc)
    days_since = (now - anchor).days
    week_num = days_since // 7
    is_comp = (week_num % 2) == 0
    week_start = anchor + timedelta(weeks=week_num)
    week_end = week_start + timedelta(weeks=1)
    return is_comp, week_start, week_end

@app.get("/api/competition/status", tags=["Competition"])
async def get_competition_status():
    from datetime import datetime, timezone
    is_comp, week_start, week_end = get_competition_week()
    return {
        "active": is_comp,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "prizes": [150, 120, 90, 60, 30],
    }

@app.get("/api/competition/leaderboard", tags=["Competition"])
async def get_competition_leaderboard():
    from datetime import datetime, timezone
    db = get_db()
    is_comp, week_start, week_end = get_competition_week()
    week_key = week_start.strftime("%Y-%m-%d")
    drivers = db.collection("users").where("role", "==", "driver").stream()
    board = []
    for d in drivers:
        data = d.to_dict()
        comp_trips = (data.get("competition_trips") or {}).get(week_key, 0)
        if comp_trips > 0:
            board.append({
                "driver_id": d.id,
                "name": f"{data.get('name','')} {data.get('surname','')}".strip(),
                "trips": comp_trips,
                "avatar": data.get("profile_photo", ""),
            })
    board.sort(key=lambda x: x["trips"], reverse=True)
    prizes = [150, 120, 90, 60, 30]
    for i, entry in enumerate(board[:5]):
        entry["prize"] = prizes[i]
        entry["rank"] = i + 1
    return {"active": is_comp, "week_key": week_key, "leaderboard": board[:20]}
@app.post("/api/admin/competition/payout", tags=["Competition"])
async def run_competition_payout(admin_id: str = Depends(get_admin_user)):
    """Pay out prizes to top 5 drivers for the most recently completed competition week."""
    from datetime import datetime, timezone, timedelta
    db = get_db()
    now = datetime.now(timezone.utc)
    anchor = datetime(2026, 3, 16, 0, 0, 0, tzinfo=timezone.utc)
    days_since = (now - anchor).days
    week_num = days_since // 7
    is_comp = (week_num % 2) == 0

    # If currently a competition week, pay out the PREVIOUS competition week
    # If currently a break week, pay out the competition week that just ended
    if is_comp:
        payout_week_num = week_num - 2  # previous competition week
    else:
        payout_week_num = week_num - 1  # competition week that just ended

    if payout_week_num < 0:
        raise HTTPException(400, "No completed competition week to pay out yet")

    week_start = anchor + timedelta(weeks=payout_week_num)
    week_key = week_start.strftime("%Y-%m-%d")

    # Check if already paid out
    payout_ref = db.collection("competition_payouts").document(week_key)
    if payout_ref.get().exists:
        raise HTTPException(400, f"Week {week_key} has already been paid out")

    # Get all drivers and their trip counts for that week
    drivers = db.collection("users").where("role", "==", "driver").stream()
    board = []
    for d in drivers:
        data = d.to_dict()
        trips = (data.get("competition_trips") or {}).get(week_key, 0)
        if trips > 0:
            board.append({"driver_id": d.id, "name": f"{data.get('name','')} {data.get('surname','')}".strip(), "trips": trips})

    board.sort(key=lambda x: x["trips"], reverse=True)
    prizes = [150, 120, 90, 60, 30]
    results = []

    for i, entry in enumerate(board[:5]):
        prize = prizes[i]
        driver_id = entry["driver_id"]
        db.collection("users").document(driver_id).update({
            "earnings.balance": firestore.Increment(prize),
            "earnings.total_earned": firestore.Increment(prize),
        })
        send_push_notification(
            driver_id,
            title="Ã°Å¸Ââ€  Competition Prize!",
            body=f"Congratulations! You finished #{i+1} and won {prize} GEL!",
            data={"type": "competition_prize", "amount": str(prize), "rank": str(i+1)},
        )
        results.append({"rank": i+1, "driver_id": driver_id, "name": entry["name"], "trips": entry["trips"], "prize": prize})

    # Mark as paid out
    payout_ref.set({
        "week_key": week_key,
        "paid_at": firestore.SERVER_TIMESTAMP,
        "paid_by": admin_id,
        "results": results,
    })

    return {"message": f"Payout complete for week {week_key}", "results": results}

@app.get("/api/admin/competition/payout-history", tags=["Competition"])
async def get_payout_history(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = list(db.collection("competition_payouts").stream())
    return {"payouts": [d.to_dict() for d in docs]}
@app.get("/api/admin/financials", tags=["Admin"])
async def get_financials(
    period: str = Query(default="month"),  # week, month, quarter, year, all
    admin_id: str = Depends(get_admin_user)
):
    from datetime import datetime, timezone, timedelta
    db = get_db()
    now = datetime.now(timezone.utc)

    # Determine date range
    if period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter_start_month = ((now.month - 1) // 3) * 3 + 1
        start = now.replace(month=quarter_start_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start = None

    # Fetch completed rides (filter date in Python to avoid composite index requirement)
    rides_query = db.collection("rides").where("status", "==", "completed")
    all_rides = list(rides_query.stream())
    if start:
        rides = []
        for r in all_rides:
            try:
                ca = r.to_dict().get("created_at")
                if ca is None:
                    continue
                if hasattr(ca, "tzinfo"):
                    if ca.tzinfo is None:
                        from datetime import timezone as _tz
                        ca = ca.replace(tzinfo=_tz.utc)
                    if ca >= start:
                        rides.append(r)
                else:
                    rides.append(r)
            except:
                rides.append(r)
    else:
        rides = all_rides

    total_rides = len(rides)
    gross_revenue = 0.0       # total fares paid by riders
    platform_commission = 0.0  # our cut
    driver_earnings = 0.0     # driver share
    card_fees = 0.0           # service fees from card payments
    cash_rides = 0
    card_rides = 0
    wallet_rides = 0
    surge_revenue = 0.0
    daily_breakdown = {}
    driver_breakdown = {}

    for r in rides:
        data = r.to_dict()
        fare = data.get("final_fare") or data.get("estimated_fare") or 0
        commission_rate = data.get("commission_rate", 0.23)
        service_fee = data.get("service_fee", 0) or 0
        surge_mult = data.get("surge_multiplier", 1.0) or 1.0
        payment = data.get("payment_method", "cash")
        driver_id = data.get("driver_id", "")
        created_at = data.get("created_at")

        commissionable = float(fare) - float(service_fee)
        commission = round(commissionable * commission_rate, 2)
        driver_share = round(commissionable - commission, 2)

        gross_revenue += float(fare)
        platform_commission += commission
        driver_earnings += driver_share
        card_fees += float(service_fee)

        if payment == "cash": cash_rides += 1
        elif payment == "card": card_rides += 1
        elif payment == "wallet": wallet_rides += 1

        if surge_mult > 1.0:
            surge_revenue += commission

        # Daily breakdown
        if created_at:
            try:
                if hasattr(created_at, "strftime"):
                    day_key = created_at.strftime("%Y-%m-%d")
                else:
                    day_key = str(created_at)[:10]
                if day_key not in daily_breakdown:
                    daily_breakdown[day_key] = {"date": day_key, "rides": 0, "gross": 0.0, "commission": 0.0, "driver_earnings": 0.0}
                daily_breakdown[day_key]["rides"] += 1
                daily_breakdown[day_key]["gross"] += float(fare)
                daily_breakdown[day_key]["commission"] += commission
                daily_breakdown[day_key]["driver_earnings"] += driver_share
            except: pass

        # Per-driver breakdown
        if driver_id:
            if driver_id not in driver_breakdown:
                driver_breakdown[driver_id] = {"driver_id": driver_id, "rides": 0, "gross": 0.0, "commission": 0.0, "driver_earnings": 0.0}
            driver_breakdown[driver_id]["rides"] += 1
            driver_breakdown[driver_id]["gross"] += float(fare)
            driver_breakdown[driver_id]["commission"] += commission
            driver_breakdown[driver_id]["driver_earnings"] += driver_share

    # Enrich driver names
    driver_ids = list(driver_breakdown.keys())
    for did in driver_ids:
        try:
            doc = db.collection("users").document(did).get()
            if doc.exists:
                d = doc.to_dict()
                driver_breakdown[did]["name"] = f"{d.get('name','')} {d.get('surname','')}".strip()
                driver_breakdown[did]["phone"] = d.get("cellphone", "")
        except: pass

    # Georgia tax brackets 2024 (individual income tax is flat 20%, VAT 18% on turnover > 100k GEL)
    # For a company: income tax 15%, dividend tax 5%
    annual_projection = platform_commission * (365 / max((now - start).days if start else 365, 1))
    if annual_projection < 500:
        tax_bracket = "0% - Below minimum threshold"
        est_tax_rate = 0.0
    elif annual_projection < 100000:
        tax_bracket = "20% - Individual income tax (Georgia)"
        est_tax_rate = 0.20
    else:
        tax_bracket = "15% corporate + 18% VAT - Large business threshold"
        est_tax_rate = 0.20

    estimated_tax = round(platform_commission * est_tax_rate, 2)
    net_after_tax = round(platform_commission - estimated_tax, 2)

    # Wallet top-ups (money in from riders)
    topups = list(db.collection("driver_topup_requests").where("status", "==", "approved").stream())
    total_topups = sum(float(t.to_dict().get("amount", 0)) for t in topups)

    # Withdrawals paid out
    withdrawals = list(db.collection("driver_withdrawals").where("status", "==", "approved").stream())
    total_withdrawals = sum(float(w.to_dict().get("amount", 0)) for w in withdrawals)

    # Build human-readable period label
    month_names = ["January","February","March","April","May","June","July","August","September","October","November","December"]
    if period == "week":
        period_label = f"Week of {(now - timedelta(days=7)).strftime('%d %b')} - {now.strftime('%d %b %Y')}"
    elif period == "month":
        period_label = f"{month_names[now.month-1]} {now.year}"
    elif period == "quarter":
        q = ((now.month - 1) // 3) + 1
        period_label = f"Q{q} {now.year}"
    elif period == "year":
        period_label = f"Full Year {now.year}"
    else:
        period_label = "All Time"

    return {
        "period": period,
        "period_label": period_label,
        "date_from": start.strftime("%d %b %Y") if start else "All time",
        "date_to": now.strftime("%d %b %Y"),
        "summary": {
            "total_rides": total_rides,
            "gross_revenue": round(gross_revenue, 2),
            "platform_commission": round(platform_commission, 2),
            "driver_earnings": round(driver_earnings, 2),
            "card_service_fees": round(card_fees, 2),
            "surge_revenue": round(surge_revenue, 2),
            "cash_rides": cash_rides,
            "card_rides": card_rides,
            "wallet_rides": wallet_rides,
            "total_topups": round(total_topups, 2),
            "total_withdrawals": round(total_withdrawals, 2),
            "net_platform_revenue": round(platform_commission + card_fees, 2),
        },
        "tax": {
            "annual_projection": round(annual_projection, 2),
            "bracket": tax_bracket,
            "rate": est_tax_rate,
            "estimated_tax": estimated_tax,
            "net_after_tax": net_after_tax,
        },
        "daily_breakdown": sorted(daily_breakdown.values(), key=lambda x: x["date"]),
        "driver_breakdown": sorted(driver_breakdown.values(), key=lambda x: x["commission"], reverse=True),
    }

@app.post("/api/driver/bank-details", tags=["Driver"])
async def save_bank_details(
    bank_type: str = Query(...),
    bank_account: str = Query(...),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    if len(bank_account.strip()) < 5:
        raise HTTPException(400, "Invalid bank account details")
    db = get_db()
    db.collection("users").document(user_id).update({
        "saved_bank_type": bank_type.lower(),
        "saved_bank_account": bank_account.strip().upper(),
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Bank details saved"}

@app.get("/api/driver/bank-details", tags=["Driver"])
async def get_bank_details(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "User not found")
    data = doc.to_dict()
    return {
        "bank_type": data.get("saved_bank_type", ""),
        "bank_account": data.get("saved_bank_account", ""),
    }

@app.post("/api/rider/charge-saved-card", tags=["Wallet"])
async def charge_saved_card(
    payload: dict = Body(...),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Charge a PayPal vaulted card directly â€” no frontend PayPal buttons needed."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    vault_id = payload.get("vault_id")
    amount_gel = float(payload.get("amount_gel", 0))
    description = payload.get("description", "T'aksi ride payment")
    if not vault_id or amount_gel <= 0:
        raise HTTPException(400, "vault_id and amount_gel are required")
    amount_usd = round(amount_gel * 0.37, 2)
    if amount_usd < 0.01:
        raise HTTPException(400, "Amount too small to charge")
    token = await get_paypal_token()
    if not token:
        raise HTTPException(502, "PayPal unavailable")
    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Create order with saved payment source
        order_payload = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {"currency_code": "USD", "value": str(amount_usd)},
                "description": description,
            }],
            "payment_source": {
                "card": {
                    "vault_id": vault_id,
                }
            }
        }
        create_resp = await client.post(
            f"{PAYPAL_API_BASE}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=order_payload,
        )
        if create_resp.status_code not in (200, 201):
            logger.error(f"PayPal vault order create failed: {create_resp.text}")
            raise HTTPException(502, "Failed to create PayPal order")
        order_data = create_resp.json()
        order_id = order_data.get("id")
        if not order_id:
            raise HTTPException(502, "No order ID returned from PayPal")
        # Step 2: Capture the order
        capture_resp = await client.post(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={},
        )
        if capture_resp.status_code not in (200, 201):
            logger.error(f"PayPal vault capture failed: {capture_resp.text}")
            raise HTTPException(502, "Failed to capture PayPal payment")
        capture_data = capture_resp.json()
        capture_status = capture_data.get("status")
        if capture_status != "COMPLETED":
            raise HTTPException(402, f"Payment not completed: {capture_status}")
        return {
            "status": "success",
            "order_id": order_id,
            "amount_gel": amount_gel,
            "amount_usd": amount_usd,
        }

@app.get("/api/rider/saved-cards", tags=["Wallet"])
async def get_saved_cards(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        return {"saved_cards": []}
    cards = doc.to_dict().get("saved_cards", [])
    return {"saved_cards": cards}

@app.delete("/api/rider/saved-cards/{vault_id}", tags=["Wallet"])
async def delete_saved_card(vault_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "User not found")
    cards = doc.to_dict().get("saved_cards", [])
    updated = [c for c in cards if c.get("vault_id") != vault_id]
    db.collection("users").document(user_id).update({"saved_cards": updated})
    return {"message": "Card removed"}

@app.post("/api/admin/clear-test-data", tags=["Admin"])
async def clear_test_data(
    payload: dict = Body(...),
    admin_id: str = Depends(get_admin_user)
):
    """Delete all test/dummy rides from Firestore. Requires admin password confirmation."""
    import os
    admin_password = payload.get("password", "")
    correct_password = os.environ.get("ADMIN_CLEAR_PASSWORD", "TaksiClear2026!")
    if admin_password != correct_password:
        raise HTTPException(403, "Incorrect password")
    db = get_db()
    # Delete all rides
    rides = list(db.collection("rides").stream())
    deleted_rides = 0
    batch = db.batch()
    for i, r in enumerate(rides):
        batch.delete(r.reference)
        deleted_rides += 1
        if (i + 1) % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()
    return {
        "message": f"Cleared {deleted_rides} rides from the database.",
        "deleted_rides": deleted_rides,
    }
@app.get("/api/admin/live-map", tags=["Admin"])
async def get_live_map(admin_id: str = Depends(get_admin_user)):
    """Returns all online drivers with locations and any active rides."""
    db = get_db()
    # Get all online drivers
    online_drivers = list(db.collection("users").where("is_online", "==", True).where("role", "==", "driver").stream())
    # Get all active rides
    active_rides = list(db.collection("rides").where("status", "in", ["searching", "accepted", "arrived", "in_progress"]).stream())
    ride_map = {}
    for r in active_rides:
        rd = r.to_dict()
        did = rd.get("driver_id")
        if did:
            ride_map[did] = {
                "ride_id": r.id,
                "status": rd.get("status"),
                "rider_name": rd.get("rider_name", "Rider"),
                "pickup_address": rd.get("pickup_address", ""),
                "destination_address": rd.get("destination_address", rd.get("dest_address", "")),
                "fare": rd.get("final_fare") or rd.get("estimated_fare") or 0,
                "pickup_lat": rd.get("pickup_lat"),
                "pickup_lng": rd.get("pickup_lng"),
            }
    drivers_out = []
    for d in online_drivers:
        data = d.to_dict()
        loc = data.get("current_location")
        if not loc or not loc.get("lat"):
            continue
        drivers_out.append({
            "driver_id": d.id,
            "name": f"{data.get('name','')} {data.get('surname','')}".strip(),
            "phone": data.get("cellphone", ""),
            "rating": data.get("rating", 5.0),
            "lat": loc.get("lat"),
            "lng": loc.get("lng"),
            "heading": loc.get("heading", 0),
            "active_ride": ride_map.get(d.id),
        })
    # Also get searching rides with no driver yet
    searching = []
    for r in active_rides:
        rd = r.to_dict()
        if rd.get("status") == "searching" and not rd.get("driver_id"):
            searching.append({
                "ride_id": r.id,
                "pickup_lat": rd.get("pickup_lat"),
                "pickup_lng": rd.get("pickup_lng"),
                "pickup_address": rd.get("pickup_address", ""),
                "rider_name": rd.get("rider_name", "Rider"),
                "fare": rd.get("estimated_fare") or 0,
            })
    return {
        "drivers": drivers_out,
        "searching_rides": searching,
        "total_online": len(drivers_out),
        "total_active_rides": len([d for d in drivers_out if d.get("active_ride")]),
    }

@app.get("/api/surge/zones", tags=["Surge"])
async def get_surge_zones():
    """Returns demand hotspot zones for the driver map."""
    db = get_db()
    try:
        active_rides = list(
            db.collection("rides")
            .where("status", "in", ["searching", "accepted", "arrived", "in_progress"])
            .stream()
        )
        online_drivers = list(
            db.collection("users")
            .where("role", "==", "driver")
            .where("is_online", "==", True)
            .stream()
        )

        # Build grid cells (0.02 deg ~ 2km squares)
        CELL_SIZE = 0.02
        ride_cells = {}
        for ride in active_rides:
            rd = ride.to_dict()
            lat = rd.get("pickup_lat")
            lng = rd.get("pickup_lng")
            if not lat or not lng:
                continue
            cell = (round(lat / CELL_SIZE) * CELL_SIZE, round(lng / CELL_SIZE) * CELL_SIZE)
            ride_cells[cell] = ride_cells.get(cell, 0) + 1

        driver_cells = {}
        for driver in online_drivers:
            dd = driver.to_dict()
            loc = dd.get("current_location")
            if not loc or not loc.get("lat"):
                continue
            lat, lng = loc["lat"], loc["lng"]
            cell = (round(lat / CELL_SIZE) * CELL_SIZE, round(lng / CELL_SIZE) * CELL_SIZE)
            driver_cells[cell] = driver_cells.get(cell, 0) + 1

        zones = []
        for cell, ride_count in ride_cells.items():
            driver_count = driver_cells.get(cell, 0)
            # Check nearby cells for drivers too
            for dlat in [-CELL_SIZE, 0, CELL_SIZE]:
                for dlng in [-CELL_SIZE, 0, CELL_SIZE]:
                    neighbor = (round((cell[0]+dlat)/CELL_SIZE)*CELL_SIZE, round((cell[1]+dlng)/CELL_SIZE)*CELL_SIZE)
                    driver_count += driver_cells.get(neighbor, 0)

            if driver_count == 0:
                demand = 1.0
            else:
                demand = min(1.0, ride_count / max(1, driver_count * 2))

            if demand >= 0.50:
                if demand >= 1.0:
                    level, color, multiplier = "very_high", "#ff2200", 2.0
                elif demand >= 0.75:
                    level, color, multiplier = "high", "#ff6600", 1.8
                elif demand >= 0.60:
                    level, color, multiplier = "moderate", "#ffaa00", 1.5
                else:
                    level, color, multiplier = "elevated", "#ffdd00", 1.2

                zones.append({
                    "lat": cell[0],
                    "lng": cell[1],
                    "ride_count": ride_count,
                    "driver_count": driver_count,
                    "demand": round(demand, 2),
                    "level": level,
                    "color": color,
                    "multiplier": multiplier,
                    "radius": 1500,
                })

        return {"zones": zones, "total_active_rides": len(active_rides), "total_online_drivers": len(online_drivers)}
    except Exception as e:
        logger.error(f"Surge zones error: {e}")
        return {"zones": []}


@app.post("/api/driver/preferred-radius", tags=["Driver"])
async def set_preferred_radius(
    radius: float = Query(..., ge=1.0, le=25.0),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Driver sets their preferred search radius in km."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    db.collection("users").document(user_id).update({"preferred_radius": radius})
    return {"message": "Preferred radius updated", "radius": radius}


# ==============================================================================
# CORPORATE ACCOUNTS
# ==============================================================================

class CorporateSignup(BaseModel):
    company_name: str
    contact_name: str
    contact_email: str
    contact_phone: str
    password: str
    tax_id: Optional[str] = None

class CorporateLogin(BaseModel):
    contact_email: str
    password: str

class AddEmployeeRequest(BaseModel):
    phone: str

class CorporateTopUp(BaseModel):
    amount: float

@app.post("/api/corporate/register", tags=["Corporate"])
async def corporate_register(data: CorporateSignup, response: Response):
    """Company self-registers - starts as pending_review until T'aksi admin approves."""
    db = get_db()
    existing = list(db.collection("corporate_accounts")
        .where("contact_email", "==", data.contact_email).limit(1).stream())
    if existing:
        raise HTTPException(400, "An account with this email already exists.")

    corp_ref = db.collection("corporate_accounts").document()
    corp_data = {
        "id": corp_ref.id,
        "company_name": data.company_name,
        "contact_name": data.contact_name,
        "contact_email": data.contact_email,
        "contact_phone": data.contact_phone,
        "tax_id": data.tax_id or "",
        "password_hash": hash_password(data.password),
        "wallet_balance": 0.0,
        "status": "pending_review",
        "employees": [],
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    corp_ref.set(corp_data)

    token = create_token(corp_ref.id, "corporate")
    response.set_cookie("auth_token", token, httponly=True, samesite="none", secure=True, max_age=86400*30)
    safe = {k: v for k, v in corp_data.items() if k != "password_hash"}
    safe["id"] = corp_ref.id
    return {"token": token, "corporate": safe}


@app.post("/api/corporate/login", tags=["Corporate"])
async def corporate_login(data: CorporateLogin, response: Response):
    db = get_db()
    docs = list(db.collection("corporate_accounts")
        .where("contact_email", "==", data.contact_email).limit(1).stream())
    if not docs:
        raise HTTPException(401, "Invalid email or password.")
    corp = docs[0].to_dict()
    corp["id"] = docs[0].id
    if not verify_password(data.password, corp.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password.")

    token = create_token(corp["id"], "corporate")
    response.set_cookie("auth_token", token, httponly=True, samesite="none", secure=True, max_age=86400*30)
    safe = {k: v for k, v in corp.items() if k != "password_hash"}
    return {"token": token, "corporate": safe}


@app.get("/api/corporate/me", tags=["Corporate"])
async def corporate_me(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("corporate_accounts").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "Corporate account not found")
    corp = doc.to_dict()
    corp["id"] = doc.id
    return {k: v for k, v in corp.items() if k != "password_hash"}


@app.post("/api/corporate/employees/add", tags=["Corporate"])
async def add_employee(data: AddEmployeeRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    """Company admin adds an employee by phone number."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()

    corp_doc = db.collection("corporate_accounts").document(user_id).get()
    if not corp_doc.exists:
        raise HTTPException(404, "Corporate account not found")
    corp_data = corp_doc.to_dict()
    if corp_data.get("status") != "approved":
        raise HTTPException(403, "Your corporate account is not yet approved.")

    phone_norm = normalize_phone(data.phone)
    rider_docs = list(db.collection("users")
        .where("cellphone_norm", "==", phone_norm)
        .where("user_type", "==", "rider")
        .limit(1).stream())
    if not rider_docs:
        raise HTTPException(404, "No rider account found with that phone number. They must register first.")

    rider = rider_docs[0]
    rider_id = rider.id
    employees = corp_data.get("employees", [])
    if any(e["rider_id"] == rider_id for e in employees):
        raise HTTPException(400, "This person is already in your account.")

    rider_data = rider.to_dict()
    employee_entry = {
        "rider_id": rider_id,
        "name": rider_data.get("name", "") + " " + rider_data.get("surname", ""),
        "phone": data.phone,
        "added_at": now_iso(),
    }
    db.collection("corporate_accounts").document(user_id).update({
        "employees": firestore.ArrayUnion([employee_entry])
    })
    # Tag the rider so they see the Business payment option
    db.collection("users").document(rider_id).update({
        "corporate_account_id": user_id,
        "corporate_company_name": corp_data.get("company_name", ""),
    })
    return {"message": "Employee added", "employee": employee_entry}


@app.post("/api/corporate/employees/remove", tags=["Corporate"])
async def remove_employee(data: AddEmployeeRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    corp_doc = db.collection("corporate_accounts").document(user_id).get()
    if not corp_doc.exists:
        raise HTTPException(404, "Corporate account not found")

    phone_norm = normalize_phone(data.phone)
    corp_data = corp_doc.to_dict()
    employees = corp_data.get("employees", [])
    to_remove = next((e for e in employees if normalize_phone(e["phone"]) == phone_norm), None)
    if not to_remove:
        raise HTTPException(404, "Employee not found")

    db.collection("corporate_accounts").document(user_id).update({
        "employees": firestore.ArrayRemove([to_remove])
    })
    # Remove the corporate tag from their rider profile
    try:
        db.collection("users").document(to_remove["rider_id"]).update({
            "corporate_account_id": firestore.DELETE_FIELD,
            "corporate_company_name": firestore.DELETE_FIELD,
        })
    except Exception:
        pass
    return {"message": "Employee removed"}


@app.post("/api/corporate/topup", tags=["Corporate"])
async def corporate_topup(data: CorporateTopUp, user_id: Optional[str] = Depends(get_current_user_id)):
    """Top up the corporate wallet (admin-initiated for now, PayPal integration later)."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    db = get_db()
    corp_doc = db.collection("corporate_accounts").document(user_id).get()
    if not corp_doc.exists:
        raise HTTPException(404, "Corporate account not found")
    db.collection("corporate_accounts").document(user_id).update({
        "wallet_balance": firestore.Increment(data.amount),
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": f"Topped up GEL {data.amount:.2f}"}


@app.get("/api/corporate/rides", tags=["Corporate"])
async def corporate_rides(
    limit: int = Query(50, le=200),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Get all rides charged to this corporate account."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    rides = db.collection("rides")        .where("payment_method", "==", "corporate")        .where("corporate_account_id", "==", user_id)        .order_by("created_at", direction=firestore.Query.DESCENDING)        .limit(limit).stream()
    result = []
    for r in rides:
        d = r.to_dict()
        d["id"] = r.id
        result.append(serialize_firestore_data(d))
    return {"rides": result, "total": len(result)}


# Admin endpoints for corporate management
@app.get("/api/admin/corporate", tags=["Admin"])
async def admin_list_corporate(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = db.collection("corporate_accounts").stream()
    result = []
    for d in docs:
        corp = d.to_dict()
        corp["id"] = d.id
        corp.pop("password_hash", None)
        result.append(serialize_firestore_data(corp))
    return {"accounts": result}


@app.post("/api/admin/corporate/{corp_id}/approve", tags=["Admin"])
async def admin_approve_corporate(corp_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    db.collection("corporate_accounts").document(corp_id).update({
        "status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP,
        "approved_by": admin_id,
    })
    return {"message": "Corporate account approved"}


@app.post("/api/admin/corporate/{corp_id}/reject", tags=["Admin"])
async def admin_reject_corporate(corp_id: str, reason: str = Query(""), admin_id: str = Depends(get_admin_user)):
    db = get_db()
    db.collection("corporate_accounts").document(corp_id).update({
        "status": "rejected",
        "rejection_reason": reason,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Corporate account rejected"}


@app.post("/api/admin/corporate/{corp_id}/topup", tags=["Admin"])
async def admin_topup_corporate(corp_id: str, data: CorporateTopUp, admin_id: str = Depends(get_admin_user)):
    """Admin manually tops up a corporate wallet (e.g. after bank transfer)."""
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    db = get_db()
    db.collection("corporate_accounts").document(corp_id).update({
        "wallet_balance": firestore.Increment(data.amount),
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": f"Added GEL {data.amount:.2f} to corporate wallet"}
