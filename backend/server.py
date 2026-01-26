import logging
import math
import os
import asyncio
from typing import List, Optional
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Query, Header, Depends, BackgroundTasks
from pydantic import BaseModel, Field, ConfigDict
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import bcrypt
import jwt

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# --- INITIALIZATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# JWT Configuration
JWT_SECRET = os.environ.get("JWT_SECRET", "taksi_galactic_secret_2025_secure_key")
JWT_ALGORITHM = "HS256"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "D'Ahl-Enterprise9409145169086")

# Firebase initialization
SERVICE_ACCOUNT_PATH = ROOT_DIR / "firebase-service-account.json"

if not firebase_admin._apps:
    try:
        if SERVICE_ACCOUNT_PATH.exists():
            cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin Initialized with service account")
        else:
            firebase_admin.initialize_app()
            logger.info("Firebase Admin Initialized with default credentials")
    except Exception as e:
        logger.error(f"Could not initialize Firebase Admin SDK: {e}")

_db = None

def get_db():
    global _db
    if _db is None:
        _db = firestore.client()
    return _db

# --- HELPERS ---
def serialize_firestore_data(data: dict) -> dict:
    """Recursively converts Firestore objects for JSON serialization."""
    if data is None:
        return None
    if not isinstance(data, dict):
        return data
    result = {}
    for key, value in data.items():
        if value is None:
            result[key] = None
        elif hasattr(value, 'isoformat'):
            result[key] = value.isoformat()
        elif hasattr(value, '_sentinel'):  # Firestore Sentinel (SERVER_TIMESTAMP)
            result[key] = datetime.now(timezone.utc).isoformat()
        elif isinstance(value, list):
            result[key] = [serialize_firestore_data(item) if isinstance(item, dict) else 
                          (item.isoformat() if hasattr(item, 'isoformat') else item) 
                          for item in value]
        elif isinstance(value, dict):
            result[key] = serialize_firestore_data(value)
        else:
            # Check if it's a Firestore reference or other special type
            try:
                result[key] = value
            except:
                result[key] = str(value)
    return result

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc).timestamp() + (7 * 24 * 60 * 60)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except:
        return None

def get_current_user_id(
    user_id_q: Optional[str] = Query(None, alias="user_id"),
    userId_q: Optional[str] = Query(None, alias="userId"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    authorization: Optional[str] = Header(None)
):
    if user_id_q: return user_id_q
    if userId_q: return userId_q
    if x_user_id: return x_user_id
    if authorization:
        token = authorization.replace("Bearer ", "")
        decoded = decode_token(token)
        if decoded:
            return decoded.get("user_id")
        return token
    return None

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in km"""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

# --- FASTAPI APP ---
app = FastAPI(title="T'aksi API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELS ---
class UserRegister(BaseModel):
    name: str
    surname: str
    cellphone: str
    password: str
    email: Optional[str] = None

class UserLogin(BaseModel):
    cellphone: str
    password: str

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
    estimated_distance: Optional[float] = Field(0, alias="estimatedDistance")
    estimated_duration: Optional[int] = Field(0, alias="estimatedDuration")
    
    model_config = ConfigDict(populate_by_name=True)

class TopUpRequest(BaseModel):
    amount: float = Field(gt=0)
    payment_reference: Optional[str] = None

class WithdrawalRequest(BaseModel):
    amount: float = Field(gt=0)
    bank_details: str

class AdminAddBalanceRequest(BaseModel):
    amount: float
    reason: Optional[str] = "Admin Adjustment"

class LocationUpdate(BaseModel):
    lat: float
    lng: float
    heading: Optional[float] = None
    speed: Optional[float] = None

class ChatMessage(BaseModel):
    message: str
    
class UpdateRideFare(BaseModel):
    distance_km: float
    wait_minutes: int = 0
    stop_wait_minutes: int = 0

# --- PRICING LOGIC ---
PRICING_RULES = {
    'economy': {
        'base': 2.00,          # Original Base
        'per_km': 0.50,        # Original Per KM
        'per_minute_wait': 0.50, # FIXED: 0.50/min
        'free_wait_minutes': 2,  # FIXED: 2 mins free
        'stop_fee': 0.00,      # FIXED: 0 fee
        'long_distance_threshold': 7.0,
        'long_distance_fee_per_km': 0.15,
        'very_long_threshold': 30.0,
        'very_long_surcharge_per_15km': 5.00
    },
    'comfort': {
        'base': 2.50,          # Original Base
        'per_km': 0.55,
        'per_minute_wait': 0.50, # FIXED: 0.50/min
        'free_wait_minutes': 2,
        'stop_fee': 0.00,      # FIXED: 0 fee
        'long_distance_threshold': 7.0,
        'long_distance_fee_per_km': 0.18,
        'very_long_threshold': 30.0,
        'very_long_surcharge_per_15km': 6.00
    },
    'suv': {
        'base': 3.90,          # Original Base
        'per_km': 0.80,
        'per_minute_wait': 0.50, # FIXED: 0.50/min
        'free_wait_minutes': 2,
        'stop_fee': 0.00,      # FIXED: 0 fee
        'long_distance_threshold': 7.0,
        'long_distance_fee_per_km': 0.25,
        'very_long_threshold': 30.0,
        'very_long_surcharge_per_15km': 8.00
    },
    'personal': {
        'base': 4.00,          # Original Base
        'per_km': 0.70,
        'per_minute_wait': 0.50, # FIXED: 0.50/min
        'free_wait_minutes': 2,  # FIXED: Changed from 3 to 2 per request
        'stop_fee': 0.00,      # FIXED: 0 fee
        'long_distance_threshold': 7.0,
        'long_distance_fee_per_km': 0.20,
        'very_long_threshold': 30.0,
        'very_long_surcharge_per_15km': 7.00
    },
    'jumpstart': {
        'base': 4.50,
        'per_km': 0.00,
        'per_minute_wait': 0.50,
        'free_wait_minutes': 999,
        'stop_fee': 0.00,
        'long_distance_threshold': 999.0,
        'long_distance_fee_per_km': 0.00,
        'very_long_threshold': 999.0,
        'very_long_surcharge_per_15km': 0.00
    }
}

DRIVER_COMMISSION_RATE = 0.23

# --- SURGE PRICING ---
# Surge hours: Wednesday 18:00-02:00, Friday 18:00-04:00, Saturday 18:00-04:00
SURGE_SCHEDULE = {
    2: {'start': 18, 'end': 26},  # Wednesday (2) - 18:00 to 02:00 next day
    4: {'start': 18, 'end': 28},  # Friday (4) - 18:00 to 04:00 next day
    5: {'start': 18, 'end': 28},  # Saturday (5) - 18:00 to 04:00 next day
}

# Surge multipliers and corresponding commission rates
SURGE_LEVELS = {
    1.0: 0.230,   # No surge - 23.0%
    1.2: 0.232,   # x1.2 surge - 23.2%
    1.5: 0.235,   # x1.5 surge - 23.5%
    1.8: 0.238,   # x1.8 surge - 23.8%
    2.0: 0.240,   # x2.0 surge - 24.0%
}

def is_surge_time() -> bool:
    """Check if current time is within surge hours"""
    now = datetime.now(timezone.utc)
    # Adjust for Georgia timezone (UTC+4)
    georgia_hour = (now.hour + 4) % 24
    weekday = now.weekday()
    
    # Check if it's a surge day
    if weekday in SURGE_SCHEDULE:
        schedule = SURGE_SCHEDULE[weekday]
        # Handle overnight surge (e.g., 18:00 to 02:00)
        if schedule['end'] > 24:
            if georgia_hour >= schedule['start'] or georgia_hour < (schedule['end'] - 24):
                return True
        else:
            if schedule['start'] <= georgia_hour < schedule['end']:
                return True
    
    # Check if we're in the "next day" portion of previous day's surge
    prev_weekday = (weekday - 1) % 7
    if prev_weekday in SURGE_SCHEDULE:
        schedule = SURGE_SCHEDULE[prev_weekday]
        if schedule['end'] > 24 and georgia_hour < (schedule['end'] - 24):
            return True
    
    return False

def get_area_demand(lat: float, lng: float) -> float:
    """
    Calculate demand level for an area based on active rides.
    Returns a demand score from 0 to 1.
    """
    db = get_db()
    
    # Count active rides in the area (within ~5km)
    try:
        active_rides = list(db.collection('rides').where('status', 'in', ['searching', 'accepted', 'arrived', 'in_progress']).stream())
        
        nearby_rides = 0
        for ride in active_rides:
            ride_data = ride.to_dict()
            ride_lat = ride_data.get('pickup_lat')
            ride_lng = ride_data.get('pickup_lng')
            if ride_lat and ride_lng:
                dist = haversine_distance(lat, lng, ride_lat, ride_lng)
                if dist <= 5:  # Within 5km
                    nearby_rides += 1
        
        # Count online drivers in the area
        online_drivers = list(db.collection('users').where('user_type', '==', 'driver').where('is_online', '==', True).stream())
        
        nearby_drivers = 0
        for driver in online_drivers:
            driver_data = driver.to_dict()
            driver_loc = driver_data.get('current_location')
            if driver_loc and driver_loc.get('lat'):
                dist = haversine_distance(lat, lng, driver_loc['lat'], driver_loc['lng'])
                if dist <= 5:
                    nearby_drivers += 1
        
        # Calculate demand ratio (rides / drivers)
        if nearby_drivers == 0:
            demand = 1.0 if nearby_rides > 0 else 0.0
        else:
            demand = min(1.0, nearby_rides / max(1, nearby_drivers * 2))
        
        return demand
        
    except Exception as e:
        logger.warning(f"Error calculating area demand: {e}")
        return 0.3  # Default moderate demand

def get_surge_multiplier(lat: float = None, lng: float = None) -> dict:
    """
    Get current surge multiplier based on time and area demand.
    Returns: {multiplier, commission_rate, is_surge}
    """
    if not is_surge_time():
        return {
            'multiplier': 1.0,
            'commission_rate': DRIVER_COMMISSION_RATE,
            'is_surge': False,
            'surge_reason': None
        }
    
    # Get area demand if coordinates provided
    demand = 0.5  # Default moderate
    if lat and lng:
        demand = get_area_demand(lat, lng)
    
    # Determine surge level based on demand
    # demand 0-0.25 = x1.2, 0.25-0.5 = x1.5, 0.5-0.75 = x1.8, 0.75-1.0 = x2.0
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
        'multiplier': multiplier,
        'commission_rate': commission_rate,
        'is_surge': True,
        'surge_reason': reason,
        'demand_level': round(demand, 2)
    }

def calculate_fare(car_type: str, distance_km: float, wait_minutes: int = 0, 
                   stop_wait_minutes: int = 0, num_stops: int = 0,
                   surge_multiplier: float = 1.0) -> dict:
    """Calculate detailed fare breakdown"""
    rules = PRICING_RULES.get(car_type, PRICING_RULES['economy'])
    
    # Base fare
    base_fare = rules['base']
    
    # Distance fare
    distance_fare = distance_km * rules['per_km']
    
    # Long distance fee
    long_distance_fee = 0
    if distance_km > rules['long_distance_threshold']:
        extra_km = distance_km - rules['long_distance_threshold']
        long_distance_fee = extra_km * rules['long_distance_fee_per_km']
    
    # Very long distance surcharge
    very_long_surcharge = 0
    if distance_km > rules['very_long_threshold']:
        extra_km = distance_km - rules['very_long_threshold']
        num_blocks = math.ceil(extra_km / 15)
        very_long_surcharge = num_blocks * rules['very_long_surcharge_per_15km']
    
    # Pickup wait fee
    pickup_wait_fee = 0
    billable_wait = max(0, wait_minutes - rules['free_wait_minutes'])
    if billable_wait > 0:
        pickup_wait_fee = billable_wait * rules['per_minute_wait']
    
    # Stop wait fee (all stop time is billable)
    stop_wait_fee = stop_wait_minutes * rules['per_minute_wait']
    
    # Stop fees
    stop_fee = num_stops * rules['stop_fee']
    
    # Subtotal before surge
    subtotal = base_fare + distance_fare + long_distance_fee + very_long_surcharge + pickup_wait_fee + stop_wait_fee + stop_fee
    
    # Apply surge multiplier
    surge_fee = 0
    if surge_multiplier > 1.0:
        surge_fee = subtotal * (surge_multiplier - 1.0)
    
    total = subtotal + surge_fee
    
    return {
        'base': round(base_fare, 2),
        'distance': round(distance_fare, 2),
        'long_distance': round(long_distance_fee, 2),
        'very_long_surcharge': round(very_long_surcharge, 2),
        'pickup_wait': round(pickup_wait_fee, 2),
        'stop_wait': round(stop_wait_fee, 2),
        'stop_fee': round(stop_fee, 2),
        'subtotal': round(subtotal, 2),
        'surge_fee': round(surge_fee, 2),
        'surge_multiplier': surge_multiplier,
        'total': round(total, 2),
        'breakdown': {
            'distance_km': round(distance_km, 2),
            'wait_minutes': wait_minutes,
            'stop_wait_minutes': stop_wait_minutes,
            'num_stops': num_stops,
            'free_wait_minutes': rules['free_wait_minutes']
        }
    }

# --- AUTH ROUTES ---

@app.post("/api/auth/register/rider", tags=["Auth"])
async def register_rider(data: UserRegister):
    db = get_db()
    
    existing = list(db.collection('users').where('cellphone', '==', data.cellphone).limit(1).stream())
    if existing:
        raise HTTPException(400, "Phone number already registered")
    
    user_ref = db.collection('users').document()
    user_data = {
        "id": user_ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "email": data.email,
        "password_hash": hash_password(data.password),
        "user_type": "rider",
        "wallet_balance": 0.0,
        "total_rides": 0,
        "rating": 5.0,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP
    }
    user_ref.set(user_data)
    
    token = create_token(user_ref.id, "rider")
    
    # Return clean user data (without password and with proper timestamps)
    safe_user = {
        "id": user_ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "email": data.email,
        "user_type": "rider",
        "wallet_balance": 0.0,
        "total_rides": 0,
        "rating": 5.0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    return {"token": token, "user": safe_user}

@app.post("/api/auth/register/driver", tags=["Auth"])
@app.post("/api/driver/register", tags=["Auth"])
async def register_driver(data: UserRegister):
    db = get_db()
    
    existing = list(db.collection('users').where('cellphone', '==', data.cellphone).limit(1).stream())
    if existing:
        raise HTTPException(400, "Phone number already registered")
    
    user_ref = db.collection('users').document()
    user_data = {
        "id": user_ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
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
            "total_withdrawn": 0.0
        },
        "total_rides": 0,
        "rating": 5.0,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP
    }
    user_ref.set(user_data)
    
    token = create_token(user_ref.id, "driver")
    
    # Return clean user data
    safe_user = {
        "id": user_ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "email": data.email,
        "user_type": "driver",
        "registration_status": "pending_vehicle",
        "is_online": False,
        "current_location": None,
        "driver_info": {"vehicle": None, "vehicle_tier": None},
        "earnings": {
            "balance": 0.0,
            "total_earned": 0.0,
            "total_topped_up": 0.0,
            "total_withdrawn": 0.0
        },
        "total_rides": 0,
        "rating": 5.0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    return {"token": token, "user": safe_user}

@app.post("/api/auth/login", tags=["Auth"])
@app.post("/api/rider/login", tags=["Auth"])
async def login(data: UserLogin):
    db = get_db()
    
    users = list(db.collection('users').where('cellphone', '==', data.cellphone).limit(1).stream())
    
    if not users:
        raise HTTPException(401, "Invalid credentials")
    
    user_doc = users[0]
    user_data = user_doc.to_dict()
    
    if not verify_password(data.password, user_data.get('password_hash', '')):
        raise HTTPException(401, "Invalid credentials")
    
    token = create_token(user_doc.id, user_data.get('user_type', 'rider'))
    safe_user = {k: v for k, v in user_data.items() if k != 'password_hash'}
    safe_user['id'] = user_doc.id
    
    return {"token": token, "user": serialize_firestore_data(safe_user)}

@app.post("/api/driver/login", tags=["Auth"])
async def driver_login(data: UserLogin):
    db = get_db()
    
    users = list(db.collection('users').where('cellphone', '==', data.cellphone).where('user_type', '==', 'driver').limit(1).stream())
    
    if not users:
        raise HTTPException(401, "Invalid credentials or not a driver account")
    
    user_doc = users[0]
    user_data = user_doc.to_dict()
    
    if not verify_password(data.password, user_data.get('password_hash', '')):
        raise HTTPException(401, "Invalid credentials")
    
    token = create_token(user_doc.id, "driver")
    safe_user = {k: v for k, v in user_data.items() if k != 'password_hash'}
    safe_user['id'] = user_doc.id
    
    return {"token": token, "user": serialize_firestore_data(safe_user)}

@app.get("/api/auth/me", tags=["Auth"])
async def get_current_user(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    doc = db.collection('users').document(user_id).get()
    
    if not doc.exists:
        raise HTTPException(404, "User not found")
    
    user_data = doc.to_dict()
    safe_user = {k: v for k, v in user_data.items() if k != 'password_hash'}
    safe_user['id'] = doc.id
    
    return serialize_firestore_data(safe_user)

# --- DRIVER ROUTES ---

@app.post("/api/driver/vehicle", tags=["Driver"])
async def register_vehicle(vehicle: VehicleInfo, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    doc = db.collection('users').document(user_id).get()
    
    if not doc.exists:
        raise HTTPException(404, "Driver not found")
    
    make_lower = vehicle.car_make.lower()
    if any(m in make_lower for m in ['mercedes', 'bmw', 'lexus', 'audi', 'tesla']):
        tier = "comfort"
    elif any(m in make_lower for m in ['jeep', 'land rover', 'range rover', 'toyota land']):
        tier = "suv"
    else:
        tier = "economy"
    
    db.collection('users').document(user_id).update({
        "driver_info.vehicle": vehicle.model_dump(),
        "driver_info.vehicle_tier": tier,
        "registration_status": "pending_review",
        "updated_at": firestore.SERVER_TIMESTAMP
    })
    
    return {"message": "Vehicle registered successfully", "tier": tier}

@app.post("/api/driver/status", tags=["Driver"])
async def update_driver_status(is_online: bool, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    db.collection('users').document(user_id).update({
        "is_online": is_online,
        "updated_at": firestore.SERVER_TIMESTAMP
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
        "updated_at": firestore.SERVER_TIMESTAMP
    }
    
    db.collection('users').document(user_id).update({
        "current_location": location_data,
        "location_updated_at": firestore.SERVER_TIMESTAMP
    })
    
    # Also update any active ride with driver location
    active_rides = list(db.collection('rides').where('driver_id', '==', user_id).where('status', 'in', ['accepted', 'arrived', 'in_progress']).limit(1).stream())
    if active_rides:
        ride = active_rides[0]
        db.collection('rides').document(ride.id).update({
            "driver_location": location_data
        })
    
    return {"message": "Location updated"}

@app.post("/api/driver/topup/request", tags=["Driver"])
async def request_topup(request: TopUpRequest, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    driver_doc = db.collection('users').document(user_id).get()
    
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")
    
    driver_data = driver_doc.to_dict()
    
    topup_ref = db.collection('driver_topup_requests').document()
    topup_data = {
        "id": topup_ref.id,
        "driver_id": user_id,
        "driver_name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}",
        "driver_cellphone": driver_data.get('cellphone'),
        "amount": request.amount,
        "payment_reference": request.payment_reference,
        "status": "pending",
        "requested_at": firestore.SERVER_TIMESTAMP,
        "created_at": firestore.SERVER_TIMESTAMP
    }
    topup_ref.set(topup_data)
    
    return {
        "message": f"Top-up request for ₾{request.amount} submitted",
        "request_id": topup_ref.id,
        "amount": request.amount,
        "payment_link": "https://egreve.bog.ge//Taksi"
    }

@app.post("/api/driver/withdraw", tags=["Driver"])
async def request_withdrawal(request: WithdrawalRequest, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    driver_doc = db.collection('users').document(user_id).get()
    
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")
    
    driver_data = driver_doc.to_dict()
    balance = driver_data.get('earnings', {}).get('balance', 0)
    
    if request.amount > balance:
        raise HTTPException(400, f"Insufficient balance. Available: ₾{balance}")
    
    withdrawal_ref = db.collection('driver_withdrawals').document()
    withdrawal_data = {
        "id": withdrawal_ref.id,
        "driver_id": user_id,
        "driver_name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}",
        "amount": request.amount,
        "bank_details": request.bank_details,
        "status": "pending",
        "requested_at": firestore.SERVER_TIMESTAMP
    }
    withdrawal_ref.set(withdrawal_data)
    
    return {"message": f"Withdrawal request for ₾{request.amount} submitted", "request_id": withdrawal_ref.id}

@app.get("/api/driver/rides/available", tags=["Driver"])
async def get_available_rides(user_id: str = Depends(get_current_user_id)):
    """
    Bolt-style ride availability:
    - Only shows rides where the driver has been specifically notified
    - Excludes rides the driver has already declined
    - Prioritized by distance and notification order
    """
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    driver_doc = db.collection('users').document(user_id).get()
    
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")
    
    driver_data = driver_doc.to_dict()
    driver_location = driver_data.get('current_location')
    
    # Get rides where this driver was specifically notified (Bolt-style targeting)
    rides = db.collection('rides').where('status', '==', 'searching').stream()
    available = []
    
    for ride in rides:
        ride_data = ride.to_dict()
        ride_data['id'] = ride.id
        
        # Bolt-style: Only show if driver was notified and hasn't declined
        notified_drivers = ride_data.get('notified_drivers', [])
        declined_drivers = ride_data.get('declined_drivers', [])
        
        # Driver must be in the notified list and not have declined
        if user_id not in notified_drivers:
            continue
        if user_id in declined_drivers:
            continue
        
        # Calculate distance to pickup
        if driver_location and ride_data.get('pickup_lat') and ride_data.get('pickup_lng'):
            distance = haversine_distance(
                driver_location['lat'], driver_location['lng'],
                ride_data['pickup_lat'], ride_data['pickup_lng']
            )
            ride_data['distance_to_pickup'] = round(distance, 2)
        
        # Add matching info for UI
        ride_data['matching_radius'] = ride_data.get('matching_radius', 3)
        ride_data['drivers_notified'] = len(notified_drivers)
        
        available.append(serialize_firestore_data(ride_data))
    
    # Sort by distance (closest first - Bolt prioritization)
    available.sort(key=lambda x: x.get('distance_to_pickup', 999))
    
    return {"rides": available}

@app.get("/api/driver/active-ride", tags=["Driver"])
async def get_driver_active_ride(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    active_statuses = ['accepted', 'arrived', 'in_progress']
    
    for status in active_statuses:
        rides = list(db.collection('rides').where('driver_id', '==', user_id).where('status', '==', status).limit(1).stream())
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
        # Try with ordering first (requires composite index)
        rides = list(db.collection('rides').where('driver_id', '==', user_id).order_by('created_at', direction=firestore.Query.DESCENDING).limit(50).stream())
    except Exception:
        # Fallback: query without ordering (no index required)
        rides = list(db.collection('rides').where('driver_id', '==', user_id).limit(50).stream())
        # Sort in Python
        rides.sort(key=lambda r: r.to_dict().get('created_at', ''), reverse=True)
    
    return {"rides": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in rides]}

@app.get("/api/driver/rides/nearby", tags=["Driver"])
async def get_nearby_rides(
    user_id: str = Depends(get_current_user_id),
    radius: float = Query(10, description="Search radius in km")
):
    """
    Get all nearby rides within a specified radius.
    This allows drivers to see rides even if they weren't specifically notified.
    Useful for drivers who just came online or want to see all opportunities.
    """
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    driver_doc = db.collection('users').document(user_id).get()
    
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")
    
    driver_data = driver_doc.to_dict()
    driver_location = driver_data.get('current_location')
    
    if not driver_location or not driver_location.get('lat') or not driver_location.get('lng'):
        raise HTTPException(400, "Driver location not available. Please enable location sharing.")
    
    # Get all searching rides
    rides = db.collection('rides').where('status', '==', 'searching').stream()
    nearby = []
    
    for ride in rides:
        ride_data = ride.to_dict()
        ride_data['id'] = ride.id
        
        pickup_lat = ride_data.get('pickup_lat')
        pickup_lng = ride_data.get('pickup_lng')
        
        if not pickup_lat or not pickup_lng:
            continue
        
        # Calculate distance
        distance = haversine_distance(
            driver_location['lat'], driver_location['lng'],
            pickup_lat, pickup_lng
        )
        
        # Check if within specified radius
        if distance <= radius:
            ride_data['distance_to_pickup'] = round(distance, 2)
            
            # Mark if driver was notified or has declined
            ride_data['was_notified'] = user_id in ride_data.get('notified_drivers', [])
            ride_data['has_declined'] = user_id in ride_data.get('declined_drivers', [])
            
            nearby.append(serialize_firestore_data(ride_data))
    
    # Sort by distance
    nearby.sort(key=lambda x: x.get('distance_to_pickup', 999))
    
    return {
        "rides": nearby,
        "search_radius": radius,
        "driver_location": driver_location
    }

@app.post("/api/rides/{ride_id}/request-join", tags=["Driver"])
async def request_to_join_ride(
    ride_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Allow a driver to request joining a ride they weren't notified about.
    This adds them to the notified list so they can accept the ride.
    """
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    
    # Verify driver exists and is eligible
    driver_doc = db.collection('users').document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")
    
    driver_data = driver_doc.to_dict()
    
    if driver_data.get('user_type') != 'driver':
        raise HTTPException(403, "Only drivers can request to join rides")
    
    if not driver_data.get('is_online'):
        raise HTTPException(400, "You must be online to request rides")
    
    if driver_data.get('registration_status') != 'approved':
        raise HTTPException(400, "Your driver registration is not approved")
    
    # Check ride exists and is still searching
    ride_doc = db.collection('rides').document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    
    ride_data = ride_doc.to_dict()
    
    if ride_data.get('status') != 'searching':
        raise HTTPException(400, "This ride is no longer available")
    
    # Check driver hasn't declined
    if user_id in ride_data.get('declined_drivers', []):
        raise HTTPException(400, "You have already declined this ride")
    
    # Check driver balance
    estimated_fare = ride_data.get('estimated_fare', 0)
    commission_rate = ride_data.get('commission_rate', DRIVER_COMMISSION_RATE)
    required_commission = estimated_fare * commission_rate
    driver_balance = driver_data.get('earnings', {}).get('balance', 0)
    
    if driver_balance < required_commission:
        raise HTTPException(400, f"Insufficient balance. Need ₾{required_commission:.2f}")
    
    # Add driver to notified list
    db.collection('rides').document(ride_id).update({
        "notified_drivers": firestore.ArrayUnion([user_id])
    })
    
    return {
        "message": "You can now accept this ride",
        "ride_id": ride_id
    }

@app.post("/api/rides/{ride_id}/retry", tags=["Rides"])
async def retry_ride_matching(
    ride_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id)
):
    """
    Retry driver matching for a ride that had no drivers.
    Resets the matching state and starts a fresh search.
    """
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    ride_doc = db.collection('rides').document(ride_id).get()
    
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    
    ride_data = ride_doc.to_dict()
    
    # Only allow retry for rides that have no drivers or are cancelled
    if ride_data.get('status') not in ['no_drivers', 'cancelled']:
        raise HTTPException(400, f"Cannot retry ride with status: {ride_data.get('status')}")
    
    # Verify user owns this ride
    if ride_data.get('userId') != user_id:
        raise HTTPException(403, "You can only retry your own rides")
    
    # Reset matching state
    db.collection('rides').document(ride_id).update({
        "status": "searching",
        "matching_radius": 3,
        "matching_status": "Retrying - Searching within 3km",
        "matching_round": 0,
        "notified_drivers": [],
        "declined_drivers": [],
        "available_drivers": [],
        "retry_count": firestore.Increment(1),
        "retried_at": firestore.SERVER_TIMESTAMP
    })
    
    # Start matching in background
    background_tasks.add_task(match_drivers_to_ride, ride_id)
    
    return {
        "message": "Ride matching restarted",
        "ride_id": ride_id,
        "status": "searching"
    }

# --- RIDE ROUTES ---

@app.get("/api/surge/status", tags=["Rides"])
async def get_surge_status(lat: float = Query(None), lng: float = Query(None)):
    """Get current surge pricing status for a location"""
    surge_info = get_surge_multiplier(lat, lng)
    
    # Get surge schedule for display
    now = datetime.now(timezone.utc)
    georgia_hour = (now.hour + 4) % 24
    weekday = now.weekday()
    weekday_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    
    return {
        **surge_info,
        'current_day': weekday_names[weekday],
        'current_hour': georgia_hour,
        'surge_schedule': {
            'Wednesday': '18:00 - 02:00',
            'Friday': '18:00 - 04:00',
            'Saturday': '18:00 - 04:00'
        }
    }

@app.post("/api/rides/request", tags=["Rides"])
async def request_ride(ride_data: RideRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    
    # Get surge info for this location
    surge_info = get_surge_multiplier(ride_data.pickup_lat, ride_data.pickup_lng)
    surge_multiplier = surge_info['multiplier']
    commission_rate = surge_info['commission_rate']
    
    # Calculate estimated fare with surge
    num_stops = len(ride_data.stops)
    fare = calculate_fare(
        ride_data.car_type or "economy",
        ride_data.estimated_distance or 5,
        0, 0, num_stops,
        surge_multiplier
    )
    
    # Prepare stops data
    stops_data = [{"address": s.address, "lat": s.lat, "lng": s.lng, "order": s.order} for s in ride_data.stops]
    
    # Create ride document
    ride_ref = db.collection('rides').document()
    new_ride = {
        "id": ride_ref.id,
        "userId": user_id or ride_data.user_id,
        "carType": ride_data.car_type,
        "pickup": ride_data.pickup,
        "pickup_lat": ride_data.pickup_lat,
        "pickup_lng": ride_data.pickup_lng,
        "destination": ride_data.destination,
        "destination_lat": ride_data.destination_lat,
        "destination_lng": ride_data.destination_lng,
        "stops": stops_data,
        "num_stops": num_stops,
        "payment_method": ride_data.payment_method,
        "estimated_distance": ride_data.estimated_distance,
        "estimated_duration": ride_data.estimated_duration,
        "estimated_fare": fare['total'],
        "fare_breakdown": fare,
        # Surge info
        "surge_multiplier": surge_multiplier,
        "surge_info": surge_info,
        "commission_rate": commission_rate,
        "status": "searching",
        "matching_radius": 3,
        "notified_drivers": [],
        "declined_drivers": [],
        # Tracking fields
        "actual_distance": 0,
        "pickup_wait_minutes": 0,
        "stop_wait_minutes": 0,
        "route_points": [],
        "created_at": firestore.SERVER_TIMESTAMP
    }
    ride_ref.set(new_ride)
    
    # Start driver matching
    background_tasks.add_task(match_drivers_to_ride, ride_ref.id)
    
    return {
        "ride_id": ride_ref.id,
        "estimated_fare": fare['total'],
        "fare_breakdown": fare,
        "surge": surge_info,
        "status": "searching"
    }

@app.get("/api/rides/estimate", tags=["Rides"])
async def estimate_fare(
    car_type: str = "economy",
    distance: float = 5,
    stops: int = 0,
    lat: float = Query(None),
    lng: float = Query(None)
):
    """Get fare estimate with surge pricing"""
    surge_info = get_surge_multiplier(lat, lng)
    fare = calculate_fare(car_type, distance, 0, 0, stops, surge_info['multiplier'])
    return {
        **fare,
        'surge': surge_info
    }

async def match_drivers_to_ride(ride_id: str):
    """
    Bolt-style driver matching with progressive radius expansion.
    
    Algorithm:
    1. Start with 3km radius, notify closest 5 drivers
    2. Wait 30 seconds for acceptance
    3. If no acceptance, expand to 5km, notify next batch
    4. Continue expanding: 3km → 5km → 8km → 12km → 20km → 30km
    5. Each expansion notifies more drivers (5 → 5 → 8 → 10 → 15 → 20)
    6. If all radii exhausted with no acceptance, mark ride as "no_drivers"
    """
    db = get_db()
    
    # Radius progression (in km) - matches Bolt's expanding circle approach
    radius_progression = [3, 5, 8, 12, 20, 30]
    drivers_per_radius = [5, 5, 8, 10, 15, 20]
    wait_time_per_round = [30, 25, 20, 15, 15, 15]  # Decreasing wait time as urgency increases
    
    total_notified = []
    
    for idx, radius in enumerate(radius_progression):
        # Check if ride still exists and is still searching
        ride_doc = db.collection('rides').document(ride_id).get()
        if not ride_doc.exists:
            logger.info(f"Ride {ride_id} no longer exists, stopping matching")
            return
        
        ride_data = ride_doc.to_dict()
        
        # Stop if ride is no longer in searching status
        if ride_data.get('status') != 'searching':
            logger.info(f"Ride {ride_id} status changed to {ride_data.get('status')}, stopping matching")
            return
        
        pickup_lat = ride_data.get('pickup_lat')
        pickup_lng = ride_data.get('pickup_lng')
        if not pickup_lat or not pickup_lng:
            logger.error(f"Ride {ride_id} missing pickup coordinates")
            return
        
        # Update ride with current matching status
        db.collection('rides').document(ride_id).update({
            "matching_radius": radius,
            "matching_status": f"Searching within {radius}km ({idx + 1}/{len(radius_progression)})",
            "matching_round": idx + 1
        })
        
        # Get all eligible online drivers
        try:
            drivers = db.collection('users').where('user_type', '==', 'driver').where('is_online', '==', True).where('registration_status', '==', 'approved').stream()
        except Exception as e:
            # Fallback if composite index doesn't exist
            logger.warning(f"Composite index query failed, using fallback: {e}")
            all_drivers = db.collection('users').where('user_type', '==', 'driver').stream()
            drivers = [d for d in all_drivers if d.to_dict().get('is_online') and d.to_dict().get('registration_status') == 'approved']
        
        nearby_drivers = []
        declined = ride_data.get('declined_drivers', [])
        already_notified = ride_data.get('notified_drivers', [])
        
        for driver in drivers:
            driver_data = driver.to_dict()
            driver_location = driver_data.get('current_location')
            
            # Skip if already notified or declined
            if driver.id in declined or driver.id in already_notified:
                continue
            
            # Check driver has sufficient balance for commission
            estimated_fare = ride_data.get('estimated_fare', 0)
            commission_rate = ride_data.get('commission_rate', DRIVER_COMMISSION_RATE)
            required_commission = estimated_fare * commission_rate
            driver_balance = driver_data.get('earnings', {}).get('balance', 0)
            
            if driver_balance < required_commission:
                continue
            
            # Check driver location exists and is within radius
            if driver_location and driver_location.get('lat') and driver_location.get('lng'):
                distance = haversine_distance(
                    pickup_lat, pickup_lng,
                    driver_location['lat'], driver_location['lng']
                )
                
                if distance <= radius:
                    nearby_drivers.append({
                        'id': driver.id,
                        'distance': round(distance, 2),
                        'name': f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip(),
                        'vehicle': driver_data.get('driver_info', {}).get('vehicle', {}),
                        'rating': driver_data.get('rating', 5.0),
                        'balance': driver_balance
                    })
        
        # Sort by distance (closest first) and select batch
        nearby_drivers.sort(key=lambda x: x['distance'])
        batch_size = drivers_per_radius[idx]
        selected_drivers = nearby_drivers[:batch_size]
        
        if selected_drivers:
            driver_ids = [d['id'] for d in selected_drivers]
            total_notified.extend(driver_ids)
            
            # Update ride with newly notified drivers
            db.collection('rides').document(ride_id).update({
                "notified_drivers": firestore.ArrayUnion(driver_ids),
                "available_drivers": selected_drivers,
                "last_driver_notification": firestore.SERVER_TIMESTAMP,
                "drivers_notified_count": len(total_notified),
                "current_batch_drivers": len(selected_drivers)
            })
            
            logger.info(f"Ride {ride_id}: Notified {len(selected_drivers)} drivers within {radius}km radius")
            
            # Wait for drivers to respond
            await asyncio.sleep(wait_time_per_round[idx])
            
            # Check if ride was accepted during wait
            updated_ride = db.collection('rides').document(ride_id).get()
            if updated_ride.exists and updated_ride.to_dict().get('status') != 'searching':
                logger.info(f"Ride {ride_id} was accepted, stopping matching")
                return
        else:
            logger.info(f"Ride {ride_id}: No new drivers found within {radius}km radius")
        
        # If this was the last radius and no drivers available
        if idx + 1 >= len(radius_progression):
            break
    
    # No drivers found after all radius expansions
    db.collection('rides').document(ride_id).update({
        "status": "no_drivers",
        "matching_status": "No drivers available in your area",
        "matching_completed_at": firestore.SERVER_TIMESTAMP,
        "total_drivers_searched": len(total_notified)
    })
    logger.info(f"Ride {ride_id}: Matching completed, no drivers found after searching all radii")

@app.post("/api/rides/{ride_id}/accept", tags=["Rides"])
async def accept_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    
    driver_doc = db.collection('users').document(user_id).get()
    if not driver_doc.exists:
        raise HTTPException(404, "Driver not found")
    
    driver_data = driver_doc.to_dict()
    
    ride_doc = db.collection('rides').document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    
    ride_data = ride_doc.to_dict()
    
    if ride_data.get('status') != 'searching':
        raise HTTPException(400, "Ride is no longer available")
    
    # Use dynamic commission rate based on surge
    commission_rate = ride_data.get('commission_rate', DRIVER_COMMISSION_RATE)
    surge_multiplier = ride_data.get('surge_multiplier', 1.0)
    
    balance = driver_data.get('earnings', {}).get('balance', 0)
    commission = ride_data.get('estimated_fare', 0) * commission_rate
    
    if balance < commission:
        raise HTTPException(400, f"Insufficient balance. Need ₾{commission:.2f}, have ₾{balance:.2f}")
    
    new_balance = balance - commission
    db.collection('users').document(user_id).update({
        "earnings.balance": new_balance,
        "earnings.total_commission_paid": firestore.Increment(commission)
    })
    
    vehicle = driver_data.get('driver_info', {}).get('vehicle', {})
    driver_location = driver_data.get('current_location', {})
    
    db.collection('rides').document(ride_id).update({
        "status": "accepted",
        "driver_id": user_id,
        "driver_info": {
            "id": user_id,
            "name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}",
            "cellphone": driver_data.get('cellphone'),
            "car_make": vehicle.get('car_make'),
            "car_model": vehicle.get('car_model'),
            "car_color": vehicle.get('car_color'),
            "license_plate": vehicle.get('license_plate'),
            "rating": driver_data.get('rating', 5.0)
        },
        "driver_location": driver_location,
        "commission_paid": commission,
        "commission_rate_used": commission_rate,
        "accepted_at": firestore.SERVER_TIMESTAMP
    })
    
    return {
        "message": "Ride accepted!",
        "commission_deducted": commission,
        "commission_rate": f"{commission_rate*100:.1f}%",
        "surge_multiplier": surge_multiplier,
        "new_balance": new_balance
    }

@app.post("/api/rides/{ride_id}/decline", tags=["Rides"])
async def decline_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    db.collection('rides').document(ride_id).update({
        "declined_drivers": firestore.ArrayUnion([user_id])
    })
    
    return {"message": "Ride declined"}

@app.post("/api/rides/{ride_id}/arrived", tags=["Rides"])
async def driver_arrived(ride_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    db.collection('rides').document(ride_id).update({
        "status": "arrived",
        "arrived_at": firestore.SERVER_TIMESTAMP
    })
    return {"message": "Marked as arrived - wait timer started"}

@app.post("/api/rides/{ride_id}/start", tags=["Rides"])
async def start_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_db()
    
    # Calculate wait time at pickup
    ride_doc = db.collection('rides').document(ride_id).get()
    if ride_doc.exists:
        ride_data = ride_doc.to_dict()
        arrived_at = ride_data.get('arrived_at')
        wait_minutes = 0
        if arrived_at:
            now = datetime.now(timezone.utc)
            if hasattr(arrived_at, 'timestamp'):
                wait_seconds = (now - arrived_at).total_seconds()
                wait_minutes = int(wait_seconds / 60)
        
        db.collection('rides').document(ride_id).update({
            "status": "in_progress",
            "pickup_wait_minutes": wait_minutes,
            "started_at": firestore.SERVER_TIMESTAMP
        })
    
    return {"message": "Ride started"}

@app.post("/api/rides/{ride_id}/update-tracking", tags=["Rides"])
async def update_ride_tracking(ride_id: str, location: LocationUpdate, user_id: str = Depends(get_current_user_id)):
    """Update ride with driver's current location (for tracking route)"""
    db = get_db()
    
    ride_doc = db.collection('rides').document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    
    # Add to route points
    db.collection('rides').document(ride_id).update({
        "driver_location": {"lat": location.lat, "lng": location.lng, "heading": location.heading, "speed": location.speed},
        "route_points": firestore.ArrayUnion([{
            "lat": location.lat,
            "lng": location.lng,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }])
    })
    
    return {"message": "Tracking updated"}

@app.post("/api/rides/{ride_id}/stop-reached", tags=["Rides"])
async def stop_reached(ride_id: str, stop_index: int, wait_minutes: int = 0, user_id: str = Depends(get_current_user_id)):
    """Mark a stop as reached and add wait time"""
    db = get_db()
    
    db.collection('rides').document(ride_id).update({
        "stop_wait_minutes": firestore.Increment(wait_minutes),
        f"stops_completed.{stop_index}": True
    })
    
    return {"message": f"Stop {stop_index} completed, wait time: {wait_minutes} minutes"}

@app.post("/api/rides/{ride_id}/complete", tags=["Rides"])
async def complete_ride(
    ride_id: str,
    final_distance: Optional[float] = None,
    total_wait_minutes: Optional[int] = None,
    user_id: str = Depends(get_current_user_id)
):
    db = get_db()
    
    ride_doc = db.collection('rides').document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    
    ride_data = ride_doc.to_dict()
    
    # SMART DISTANCE CHECK:
    # If the driver app sends 0 or extremely low distance (GPS error), 
    # fall back to the Google Maps estimate calculated at booking.
    estimated = ride_data.get('estimated_distance', 5)
    reported = final_distance if final_distance is not None else 0
    
    # If reported distance is less than 10% of estimate, assume GPS fail and use estimate
    if reported < (estimated * 0.1):
        actual_distance = estimated
        logger.warning(f"Ride {ride_id}: GPS distance {reported}km seems wrong. Using estimate {estimated}km")
    else:
        actual_distance = reported

    # Calculate Wait Times
    # We prefer the server-side calculated wait (pickup_wait_minutes)
    pickup_wait = ride_data.get('pickup_wait_minutes', 0)
    stop_wait = ride_data.get('stop_wait_minutes', 0)
    
    num_stops = ride_data.get('num_stops', 0)
    car_type = ride_data.get('carType', 'economy')
    
    # Recalculate Final Fare
    final_fare = calculate_fare(car_type, actual_distance, pickup_wait, stop_wait, num_stops)
    
    driver_id = ride_data.get('driver_id')
    
    db.collection('rides').document(ride_id).update({
        "status": "completed",
        "actual_distance": actual_distance,
        "final_fare": final_fare['total'],
        "final_fare_breakdown": final_fare,
        "completed_at": firestore.SERVER_TIMESTAMP
    })
    
    # Update driver earnings
    if driver_id:
        commission = final_fare['total'] * DRIVER_COMMISSION_RATE
        driver_earnings = final_fare['total'] - commission
        db.collection('users').document(driver_id).update({
            "earnings.total_earned": firestore.Increment(driver_earnings),
            "total_rides": firestore.Increment(1)
        })
    
    # Update rider stats
    rider_id = ride_data.get('userId')
    if rider_id:
        db.collection('users').document(rider_id).update({
            "total_rides": firestore.Increment(1)
        })
    
    return {
        "message": "Ride completed",
        "final_fare": final_fare['total'],
        "fare_breakdown": final_fare
    }

@app.post("/api/rides/{ride_id}/cancel", tags=["Rides"])
async def cancel_ride(ride_id: str, reason: str = "User cancelled", user_id: str = Depends(get_current_user_id)):
    db = get_db()
    db.collection('rides').document(ride_id).update({
        "status": "cancelled",
        "cancellation_reason": reason,
        "cancelled_by": user_id,
        "cancelled_at": firestore.SERVER_TIMESTAMP
    })
    return {"message": "Ride cancelled"}

@app.get("/api/rides/{ride_id}", tags=["Rides"])
async def get_ride(ride_id: str):
    db = get_db()
    doc = db.collection('rides').document(ride_id).get()
    if not doc.exists:
        raise HTTPException(404, "Ride not found")
    return serialize_firestore_data({**doc.to_dict(), "id": doc.id})

# --- CHAT ROUTES ---

@app.get("/api/rides/{ride_id}/chat", tags=["Chat"])
async def get_chat_messages(ride_id: str, user_id: str = Depends(get_current_user_id)):
    """Get all chat messages for a ride"""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    
    # Verify ride exists and user has access
    ride_doc = db.collection('rides').document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    
    ride_data = ride_doc.to_dict()
    rider_id = ride_data.get('userId')
    driver_id = ride_data.get('driver_id')
    
    # Only rider or driver can access chat
    if user_id not in [rider_id, driver_id]:
        raise HTTPException(403, "Not authorized to access this chat")
    
    # Get messages
    messages = list(db.collection('rides').document(ride_id).collection('messages').order_by('timestamp').stream())
    
    return {
        "ride_id": ride_id,
        "messages": [serialize_firestore_data({**m.to_dict(), "id": m.id}) for m in messages]
    }

@app.post("/api/rides/{ride_id}/chat", tags=["Chat"])
async def send_chat_message(ride_id: str, chat: ChatMessage, user_id: str = Depends(get_current_user_id)):
    """Send a chat message"""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    
    # Verify ride exists and user has access
    ride_doc = db.collection('rides').document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    
    ride_data = ride_doc.to_dict()
    rider_id = ride_data.get('userId')
    driver_id = ride_data.get('driver_id')
    
    # Only rider or driver can send messages
    if user_id not in [rider_id, driver_id]:
        raise HTTPException(403, "Not authorized to send messages in this chat")
    
    # Determine sender type
    sender_type = "rider" if user_id == rider_id else "driver"
    
    # Get sender name
    user_doc = db.collection('users').document(user_id).get()
    sender_name = "Unknown"
    if user_doc.exists:
        user_data = user_doc.to_dict()
        sender_name = f"{user_data.get('name', '')} {user_data.get('surname', '')}".strip()
    
    # Create message
    message_ref = db.collection('rides').document(ride_id).collection('messages').document()
    message_data = {
        "id": message_ref.id,
        "sender_id": user_id,
        "sender_type": sender_type,
        "sender_name": sender_name,
        "message": chat.message,
        "timestamp": firestore.SERVER_TIMESTAMP,
        "read": False
    }
    message_ref.set(message_data)
    
    # Update ride with last message info
    db.collection('rides').document(ride_id).update({
        "last_message": {
            "text": chat.message[:50] + "..." if len(chat.message) > 50 else chat.message,
            "sender_type": sender_type,
            "timestamp": firestore.SERVER_TIMESTAMP
        },
        "unread_messages": firestore.Increment(1)
    })
    
    return {
        "message": "Message sent",
        "message_id": message_ref.id,
        "sender_type": sender_type
    }

@app.post("/api/rides/{ride_id}/chat/read", tags=["Chat"])
async def mark_messages_read(ride_id: str, user_id: str = Depends(get_current_user_id)):
    """Mark all messages as read"""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    
    # Verify access
    ride_doc = db.collection('rides').document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")
    
    ride_data = ride_doc.to_dict()
    if user_id not in [ride_data.get('userId'), ride_data.get('driver_id')]:
        raise HTTPException(403, "Not authorized")
    
    # Reset unread count
    db.collection('rides').document(ride_id).update({
        "unread_messages": 0
    })
    
    return {"message": "Messages marked as read"}

@app.get("/api/rider/history", tags=["Rider"])
async def get_rider_history(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    try:
        rides = list(db.collection('rides').where('userId', '==', user_id).order_by('created_at', direction=firestore.Query.DESCENDING).limit(50).stream())
    except Exception:
        # Fallback without ordering
        rides = list(db.collection('rides').where('userId', '==', user_id).limit(50).stream())
        rides.sort(key=lambda r: r.to_dict().get('created_at', ''), reverse=True)
    
    return {"rides": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in rides]}

@app.get("/api/rider/active-ride", tags=["Rider"])
async def get_active_ride(user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    
    db = get_db()
    active_statuses = ['searching', 'accepted', 'arrived', 'in_progress']
    
    for status in active_statuses:
        rides = list(db.collection('rides').where('userId', '==', user_id).where('status', '==', status).limit(1).stream())
        if rides:
            ride = rides[0]
            return serialize_firestore_data({**ride.to_dict(), "id": ride.id})
    
    return None

# --- ADMIN ROUTES ---

@app.get("/api/admin/dashboard", tags=["Admin"])
async def admin_dashboard():
    db = get_db()
    
    riders = list(db.collection('users').where('user_type', '==', 'rider').stream())
    drivers = list(db.collection('users').where('user_type', '==', 'driver').stream())
    active_rides = list(db.collection('rides').where('status', 'in', ['searching', 'accepted', 'arrived', 'in_progress']).stream())
    pending_drivers = list(db.collection('users').where('registration_status', '==', 'pending_review').stream())
    pending_withdrawals = list(db.collection('driver_withdrawals').where('status', '==', 'pending').stream())
    pending_topups = list(db.collection('driver_topup_requests').where('status', '==', 'pending').stream())
    
    return {
        "total_riders": len(riders),
        "total_drivers": len(drivers),
        "active_rides": len(active_rides),
        "pending_driver_approvals": len(pending_drivers),
        "pending_withdrawals": len(pending_withdrawals),
        "pending_topups": len(pending_topups)
    }

@app.get("/api/admin/riders", tags=["Admin"])
async def admin_riders():
    db = get_db()
    riders = db.collection('users').where('user_type', '==', 'rider').stream()
    return {"riders": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in riders]}

@app.get("/api/admin/riders/{id}", tags=["Admin"])
async def get_admin_rider_detail(id: str):
    db = get_db()
    doc = db.collection('users').document(id).get()
    if not doc.exists:
        raise HTTPException(404, "Rider not found")
    
    rides = db.collection('rides').where('userId', '==', id).limit(50).stream()
    
    return {
        "rider": serialize_firestore_data({**doc.to_dict(), "id": id}),
        "rides": [serialize_firestore_data({**r.to_dict(), "id": r.id}) for r in rides]
    }

@app.get("/api/admin/drivers", tags=["Admin"])
async def admin_drivers():
    db = get_db()
    drivers = db.collection('users').where('user_type', '==', 'driver').stream()
    return {"drivers": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in drivers]}

@app.get("/api/admin/drivers/pending", tags=["Admin"])
async def get_pending_drivers():
    db = get_db()
    # Get all drivers and filter by registration_status in Python to avoid composite index issues
    all_drivers = list(db.collection('users').where('user_type', '==', 'driver').stream())
    pending = [d for d in all_drivers if d.to_dict().get('registration_status') == 'pending_review']
    return {"pending_drivers": [serialize_firestore_data({**doc.to_dict(), "id": doc.id}) for doc in pending]}

@app.get("/api/admin/drivers/{id}", tags=["Admin"])
async def get_admin_driver_detail(id: str):
    db = get_db()
    doc = db.collection('users').document(id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")
    return {"driver": serialize_firestore_data({**doc.to_dict(), "id": id})}

@app.post("/api/admin/drivers/{id}/approve", tags=["Admin"])
async def admin_approve_driver(id: str):
    db = get_db()
    db.collection('users').document(id).update({
        "registration_status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP
    })
    return {"message": "Driver approved"}

@app.post("/api/admin/drivers/{id}/reject", tags=["Admin"])
async def admin_reject_driver(id: str, reason: str = "Documents not satisfactory"):
    db = get_db()
    db.collection('users').document(id).update({
        "registration_status": "rejected",
        "rejection_reason": reason,
        "rejected_at": firestore.SERVER_TIMESTAMP
    })
    return {"message": "Driver rejected"}

@app.post("/api/admin/users/{id}/add-balance", tags=["Admin"])
@app.post("/api/admin/add-balance/{id}", tags=["Admin"])
async def admin_add_balance(id: str, req: AdminAddBalanceRequest):
    db = get_db()
    ref = db.collection('users').document(id)
    doc = ref.get()
    
    if not doc.exists:
        raise HTTPException(404, "User not found")
    
    user_data = doc.to_dict()
    user_type = user_data.get('user_type', 'rider')
    
    if user_type == 'driver':
        ref.update({
            "earnings.balance": firestore.Increment(req.amount),
            "earnings.total_topped_up": firestore.Increment(abs(req.amount)) if req.amount > 0 else firestore.Increment(0)
        })
    else:
        ref.update({
            "wallet_balance": firestore.Increment(req.amount)
        })
    
    db.collection('admin_balance_logs').add({
        "target_user_id": id,
        "target_user_name": f"{user_data.get('name', '')} {user_data.get('surname', '')}",
        "target_user_type": user_type,
        "amount": req.amount,
        "reason": req.reason,
        "admin_action": "add_balance",
        "timestamp": firestore.SERVER_TIMESTAMP
    })
    
    return {"message": f"Successfully added ₾{req.amount} to {user_type} account"}

@app.get("/api/admin/topups/pending", tags=["Admin"])
async def get_pending_topups():
    db = get_db()
    topups = db.collection('driver_topup_requests').where('status', '==', 'pending').stream()
    return {"pending_topups": [serialize_firestore_data({**t.to_dict(), "id": t.id}) for t in topups]}

@app.post("/api/admin/topups/{id}/approve", tags=["Admin"])
async def approve_topup(id: str):
    db = get_db()
    topup_doc = db.collection('driver_topup_requests').document(id).get()
    
    if not topup_doc.exists:
        raise HTTPException(404, "Top-up request not found")
    
    topup_data = topup_doc.to_dict()
    driver_id = topup_data.get('driver_id')
    amount = topup_data.get('amount', 0)
    
    db.collection('users').document(driver_id).update({
        "earnings.balance": firestore.Increment(amount),
        "earnings.total_topped_up": firestore.Increment(amount)
    })
    
    db.collection('driver_topup_requests').document(id).update({
        "status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP
    })
    
    return {"message": f"Top-up of ₾{amount} approved"}

@app.post("/api/admin/topups/{id}/reject", tags=["Admin"])
async def reject_topup(id: str, reason: str = "Payment not verified"):
    db = get_db()
    db.collection('driver_topup_requests').document(id).update({
        "status": "rejected",
        "rejection_reason": reason,
        "rejected_at": firestore.SERVER_TIMESTAMP
    })
    return {"message": "Top-up request rejected"}

@app.get("/api/admin/withdrawals/pending", tags=["Admin"])
async def get_pending_withdrawals():
    db = get_db()
    withdrawals = db.collection('driver_withdrawals').where('status', '==', 'pending').stream()
    return {"pending_withdrawals": [serialize_firestore_data({**w.to_dict(), "id": w.id}) for w in withdrawals]}

@app.post("/api/admin/withdrawals/{id}/approve", tags=["Admin"])
@app.post("/api/admin/withdrawal/{id}/approve", tags=["Admin"])
async def approve_withdrawal(id: str):
    db = get_db()
    withdrawal_doc = db.collection('driver_withdrawals').document(id).get()
    
    if not withdrawal_doc.exists:
        raise HTTPException(404, "Withdrawal request not found")
    
    withdrawal_data = withdrawal_doc.to_dict()
    driver_id = withdrawal_data.get('driver_id')
    amount = withdrawal_data.get('amount', 0)
    
    db.collection('users').document(driver_id).update({
        "earnings.balance": firestore.Increment(-amount),
        "earnings.total_withdrawn": firestore.Increment(amount)
    })
    
    db.collection('driver_withdrawals').document(id).update({
        "status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP
    })
    
    return {"message": f"Withdrawal of ₾{amount} approved"}

@app.post("/api/admin/withdrawals/{id}/reject", tags=["Admin"])
@app.post("/api/admin/withdrawal/{id}/reject", tags=["Admin"])
async def reject_withdrawal(id: str):
    db = get_db()
    db.collection('driver_withdrawals').document(id).update({
        "status": "rejected",
        "rejected_at": firestore.SERVER_TIMESTAMP
    })
    return {"message": "Withdrawal rejected"}

@app.get("/api/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/api/", tags=["Health"])
async def root():
    return {"message": "T'aksi API v3 - Firebase Edition"}
