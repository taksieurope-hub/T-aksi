import logging
import math
import os
import asyncio
from typing import List, Optional
from datetime import datetime, timezone
from pathlib import Path
import base64

import firebase_admin
from firebase_admin import credentials, firestore

from fastapi import FastAPI, HTTPException, Query, Header, Depends, BackgroundTasks
from pydantic import BaseModel, Field, ConfigDict
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import bcrypt
import jwt
import httpx

# =========================
# 1. SETUP & CONFIG
# =========================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Set up Logging (Crucial for debugging on Render)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Security
JWT_SECRET = os.environ.get("JWT_SECRET", "taksi_super_secret_key_change_this")
JWT_ALGORITHM = "HS256"

# PayPal
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET")
PAYPAL_API_BASE = "https://api-m.paypal.com" if os.environ.get("PAYPAL_MODE") == "live" else "https://api-m.sandbox.paypal.com"

# Firebase Setup
if not firebase_admin._apps:
    try:
        # Check if we have the JSON file, otherwise rely on Render Environment Variables
        service_account_path = ROOT_DIR / "firebase-service-account.json"
        if service_account_path.exists():
            cred = credentials.Certificate(str(service_account_path))
            firebase_admin.initialize_app(cred)
        else:
            # For Render: Use Default Credentials (set via Env Vars) or dict
            logger.info("No service account file found, attempting default credentials.")
            firebase_admin.initialize_app()
    except Exception as e:
        logger.error(f"Firebase Init Error: {e}")

_db = None
def get_db():
    global _db
    if _db is None:
        _db = firestore.client()
    return _db

# =========================
# 2. MODELS (Pydantic)
# =========================

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
    car_year: int
    car_color: str
    license_plate: str

class StopLocation(BaseModel):
    address: str
    lat: float
    lng: float
    order: int = 0

class RideRequest(BaseModel):
    car_type: Optional[str] = "economy"
    pickup: str
    pickup_lat: float = Field(alias="pickupLat")
    pickup_lng: float = Field(alias="pickupLng")
    destination: Optional[str] = None
    destination_lat: Optional[float] = Field(None, alias="destinationLat")
    destination_lng: Optional[float] = Field(None, alias="destinationLng")
    stops: List[StopLocation] = []
    payment_method: str = "cash"
    payment_order_id: Optional[str] = None
    estimated_distance: float = 5.0
    estimated_duration: int = 15

    model_config = ConfigDict(populate_by_name=True)

class LocationUpdate(BaseModel):
    lat: float
    lng: float
    heading: Optional[float] = 0.0
    speed: Optional[float] = 0.0

class RateRequest(BaseModel):
    rating: int
    review: Optional[str] = ""

class ChatMessage(BaseModel):
    message: str

# =========================
# 3. HELPER FUNCTIONS
# =========================

def serialize_firestore(data):
    """Clean up Firestore timestamps for JSON response"""
    if not data: return None
    if isinstance(data, list): return [serialize_firestore(x) for x in data]
    if isinstance(data, dict):
        result = {}
        for k, v in data.items():
            if hasattr(v, 'isoformat'): result[k] = v.isoformat()
            elif isinstance(v, dict): result[k] = serialize_firestore(v)
            elif isinstance(v, list): result[k] = serialize_firestore(v)
            else: result[k] = v
        return result
    return data

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except:
        return False

def create_token(user_id: str, role: str) -> str:
    payload = {
        "user_id": user_id, 
        "role": role, 
        "exp": datetime.now(timezone.utc).timestamp() + (7 * 86400) # 7 days
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user_id(authorization: Optional[str] = Header(None)):
    if not authorization: return None
    try:
        token = authorization.replace("Bearer ", "")
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return decoded.get("user_id")
    except:
        return None

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

# =========================
# 4. PRICING LOGIC
# =========================
PRICING = {
    "economy": {"base": 2.0, "km": 0.5, "min": 0.15},
    "comfort": {"base": 3.0, "km": 0.7, "min": 0.20},
    "suv":     {"base": 5.0, "km": 1.0, "min": 0.25},
}

def calculate_fare(car_type, distance_km, duration_min=0, surge=1.0):
    rules = PRICING.get(car_type, PRICING["economy"])
    subtotal = rules["base"] + (distance_km * rules["km"]) + (duration_min * rules["min"])
    return round(subtotal * surge, 2)

# =========================
# 5. FASTAPI APP
# =========================

app = FastAPI(title="Taksi API Backend")

# Allow all origins (Fixes "Network Error" on Frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# 6. AUTH ROUTES
# =========================

@app.post("/api/auth/register/rider")
async def register_rider(data: UserRegister):
    db = get_db()
    if list(db.collection("users").where("cellphone", "==", data.cellphone).stream()):
        raise HTTPException(400, "User already exists")
    
    ref = db.collection("users").document()
    user_data = {
        "id": ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "password": hash_password(data.password),
        "user_type": "rider",
        "wallet_balance": 0.0,
        "created_at": firestore.SERVER_TIMESTAMP
    }
    ref.set(user_data)
    token = create_token(ref.id, "rider")
    return {"token": token, "user": serialize_firestore(user_data)}

@app.post("/api/auth/register/driver")
async def register_driver(data: UserRegister):
    db = get_db()
    if list(db.collection("users").where("cellphone", "==", data.cellphone).stream()):
        raise HTTPException(400, "User already exists")

    ref = db.collection("users").document()
    user_data = {
        "id": ref.id,
        "name": data.name,
        "surname": data.surname,
        "cellphone": data.cellphone,
        "password": hash_password(data.password),
        "user_type": "driver",
        "registration_status": "pending_vehicle", # Needs vehicle info next
        "is_online": False,
        "wallet_balance": 0.0,
        "created_at": firestore.SERVER_TIMESTAMP
    }
    ref.set(user_data)
    token = create_token(ref.id, "driver")
    return {"token": token, "user": serialize_firestore(user_data)}

@app.post("/api/auth/login")
async def login(data: UserLogin):
    db = get_db()
    users = list(db.collection("users").where("cellphone", "==", data.cellphone).limit(1).stream())
    if not users:
        raise HTTPException(401, "Invalid credentials")
    
    user_doc = users[0]
    user_data = user_doc.to_dict()
    
    if not verify_password(data.password, user_data.get("password", "")):
        raise HTTPException(401, "Invalid credentials")
        
    token = create_token(user_doc.id, user_data.get("user_type", "rider"))
    return {"token": token, "user": serialize_firestore({**user_data, "id": user_doc.id})}

@app.get("/api/auth/me")
async def get_me(user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401, "Unauthorized")
    doc = get_db().collection("users").document(user_id).get()
    return serialize_firestore({**doc.to_dict(), "id": doc.id})

# =========================
# 7. DRIVER LOGIC
# =========================

@app.post("/api/driver/vehicle")
async def update_vehicle(data: VehicleInfo, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    db = get_db()
    
    # Auto-assign tier based on car
    tier = "economy"
    if data.car_year > 2018: tier = "comfort"
    if "suv" in data.car_model.lower() or "jeep" in data.car_make.lower(): tier = "suv"

    db.collection("users").document(user_id).update({
        "driver_info": data.model_dump(),
        "driver_info.tier": tier,
        "registration_status": "approved" # Auto-approve for MVP
    })
    return {"status": "updated", "tier": tier}

@app.post("/api/driver/location")
async def driver_location(loc: LocationUpdate, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    
    # Update Driver Doc
    get_db().collection("users").document(user_id).update({
        "current_location": loc.model_dump(),
        "last_seen": firestore.SERVER_TIMESTAMP
    })
    
    # Update Active Ride (if any) so Rider sees the car move
    active_rides = list(get_db().collection("rides")\
        .where("driver_id", "==", user_id)\
        .where("status", "in", ["accepted", "arrived", "in_progress"])\
        .limit(1).stream())
        
    if active_rides:
        get_db().collection("rides").document(active_rides[0].id).update({
            "driver_location": loc.model_dump()
        })
        
    return {"status": "ok"}

@app.post("/api/driver/status")
async def driver_status(is_online: bool, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    get_db().collection("users").document(user_id).update({"is_online": is_online})
    return {"status": "online" if is_online else "offline"}

@app.get("/api/driver/rides/available")
async def get_available_rides(user_id: str = Depends(get_current_user_id)):
    """ Polling endpoint for drivers to see rides they are matched with """
    if not user_id: raise HTTPException(401)
    db = get_db()
    
    # Find rides where this driver is in the 'notified_drivers' list
    rides = list(db.collection("rides")\
        .where("status", "==", "searching")\
        .where("notified_drivers", "array_contains", user_id)\
        .stream())
        
    # Filter out declined
    results = []
    for r in rides:
        d = r.to_dict()
        if user_id not in d.get("declined_drivers", []):
            results.append(serialize_firestore({**d, "id": r.id}))
            
    return {"rides": results}

# =========================
# 8. RIDE ALGORITHM & DISPATCH
# =========================

async def match_drivers_bg(ride_id: str):
    """ The Core Algorithm: Expands radius to find drivers """
    db = get_db()
    radius_steps = [3, 5, 10, 20] # km
    
    for radius in radius_steps:
        # Check if ride still exists/searching
        doc = db.collection("rides").document(ride_id).get()
        if not doc.exists or doc.to_dict().get("status") != "searching":
            return # Stop if ride cancelled or taken
            
        ride_data = doc.to_dict()
        plat, plng = ride_data["pickup_lat"], ride_data["pickup_lng"]
        
        # Get ONLINE drivers
        # NOTE: For scale, use GeoFirestore. For MVP, fetch all online and filter in Python.
        drivers = list(db.collection("users")\
            .where("user_type", "==", "driver")\
            .where("is_online", "==", True)\
            .stream())
            
        matched_ids = []
        for d in drivers:
            d_data = d.to_dict()
            loc = d_data.get("current_location")
            if loc:
                dist = haversine_distance(plat, plng, loc["lat"], loc["lng"])
                if dist <= radius:
                    matched_ids.append(d.id)
        
        if matched_ids:
            # Notify these drivers
            logger.info(f"Ride {ride_id}: Notifying {len(matched_ids)} drivers at {radius}km")
            db.collection("rides").document(ride_id).update({
                "notified_drivers": firestore.ArrayUnion(matched_ids),
                "matching_radius": radius
            })
            
        # Wait 10 seconds before expanding radius
        await asyncio.sleep(10)

    # If loop finishes and no one accepted
    doc = db.collection("rides").document(ride_id).get()
    if doc.exists and doc.to_dict().get("status") == "searching":
        db.collection("rides").document(ride_id).update({"status": "no_drivers"})


@app.post("/api/rides/request")
async def request_ride(data: RideRequest, bg_tasks: BackgroundTasks, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    
    fare = calculate_fare(data.car_type, data.estimated_distance)
    
    ref = get_db().collection("rides").document()
    ride_data = {
        "id": ref.id,
        "userId": user_id,
        "pickup": data.pickup,
        "pickup_lat": data.pickup_lat,
        "pickup_lng": data.pickup_lng,
        "destination": data.destination,
        "destination_lat": data.destination_lat,
        "destination_lng": data.destination_lng,
        "carType": data.car_type,
        "status": "searching",
        "estimated_fare": fare,
        "created_at": firestore.SERVER_TIMESTAMP,
        "notified_drivers": [],
        "declined_drivers": []
    }
    ref.set(ride_data)
    
    # Start the Algorithm
    bg_tasks.add_task(match_drivers_bg, ref.id)
    
    return {"ride_id": ref.id, "estimated_fare": fare}

@app.post("/api/rides/{ride_id}/accept")
async def accept_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    db = get_db()
    
    # TRANSACTION to prevent double-booking
    @firestore.transactional
    def accept_in_transaction(transaction, ride_ref, driver_id):
        snapshot = ride_ref.get(transaction=transaction)
        if not snapshot.exists: raise HTTPException(404, "Ride not found")
        
        data = snapshot.to_dict()
        if data.get("status") != "searching":
            raise HTTPException(400, "Ride already taken or cancelled")
            
        # Get driver info
        driver_doc = db.collection("users").document(driver_id).get()
        driver_data = driver_doc.to_dict()
        
        transaction.update(ride_ref, {
            "status": "accepted",
            "driver_id": driver_id,
            "driver_info": {
                "name": f"{driver_data.get('name')} {driver_data.get('surname')}",
                "vehicle": driver_data.get("driver_info", {}),
                "cellphone": driver_data.get("cellphone"),
                "lat": driver_data.get("current_location", {}).get("lat"),
                "lng": driver_data.get("current_location", {}).get("lng")
            },
            "driver_location": driver_data.get("current_location")
        })
        return data

    ref = db.collection("rides").document(ride_id)
    transaction = db.transaction()
    try:
        accept_in_transaction(transaction, ref, user_id)
    except Exception as e:
        raise HTTPException(400, str(e))
        
    return {"status": "accepted"}

@app.post("/api/rides/{ride_id}/arrived")
async def ride_arrived(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    get_db().collection("rides").document(ride_id).update({
        "status": "arrived",
        "arrived_at": firestore.SERVER_TIMESTAMP
    })
    return {"status": "arrived"}

@app.post("/api/rides/{ride_id}/start")
async def ride_start(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    get_db().collection("rides").document(ride_id).update({
        "status": "in_progress",
        "started_at": firestore.SERVER_TIMESTAMP
    })
    return {"status": "started"}

# =========================
# 11. PAYPAL HELPERS (Add this near the top with other helpers)
# =========================
async def get_paypal_token():
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET: return None
    auth = base64.b64encode(f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PAYPAL_API_BASE}/v1/oauth2/token",
            headers={"Authorization": f"Basic {auth}"},
            data={"grant_type": "client_credentials"}
        )
        return resp.json().get("access_token") if resp.status_code == 200 else None

async def capture_paypal_payment(order_id):
    token = await get_paypal_token()
    if not token: return False
    
    async with httpx.AsyncClient() as client:
        # We try to 'Capture' the authorized payment
        resp = await client.post(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{order_id}/capture",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        )
        # If already captured or successful
        if resp.status_code in [200, 201]: return True
        # If it says "Order already captured", that's also fine
        if resp.status_code == 422 and "ORDER_ALREADY_CAPTURED" in resp.text: return True
        return False

# =========================
# 12. UPDATE THE COMPLETE RIDE FUNCTION
# =========================
@app.post("/api/rides/{ride_id}/complete")
async def ride_complete(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    db = get_db()
    
    ride_ref = db.collection("rides").document(ride_id)
    doc = ride_ref.get()
    if not doc.exists: raise HTTPException(404, "Ride not found")
    data = doc.to_dict()
    
    # 1. Calculate Final Fare (Simple version: use estimate. Complex: use GPS logs)
    final_fare = data.get("estimated_fare", 0)
    
    # 2. Handle Payment
    payment_status = "cash_collected"
    if data.get("payment_method") == "card" and data.get("payment_order_id"):
        # CAPTURE THE HELD MONEY
        success = await capture_paypal_payment(data["payment_order_id"])
        payment_status = "paid" if success else "failed"
    
    # 3. Update Ride
    ride_ref.update({
        "status": "completed",
        "completed_at": firestore.SERVER_TIMESTAMP,
        "payment_status": payment_status,
        "final_fare": final_fare
    })
    
    # 4. Update Driver Balance
    commission = final_fare * 0.20 # 20% Commission
    driver_earnings = final_fare - commission
    
    driver_ref = db.collection("users").document(data["driver_id"])
    
    if payment_status == "paid":
        # Card: We have the money. Add net earnings to driver wallet.
        driver_ref.update({
            "wallet_balance": firestore.Increment(driver_earnings),
            "total_rides": firestore.Increment(1)
        })
    else:
        # Cash: Driver has the money. We deduct commission from their wallet.
        driver_ref.update({
            "wallet_balance": firestore.Increment(-commission),
            "total_rides": firestore.Increment(1)
        })

    return {"status": "completed", "payment": payment_status}

@app.post("/api/rides/{ride_id}/cancel")
async def ride_cancel(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    get_db().collection("rides").document(ride_id).update({
        "status": "cancelled",
        "cancelled_by": user_id
    })
    return {"status": "cancelled"}

@app.get("/api/rides/{ride_id}")
async def get_ride_details(ride_id: str):
    doc = get_db().collection("rides").document(ride_id).get()
    if not doc.exists: raise HTTPException(404)
    return serialize_firestore({**doc.to_dict(), "id": doc.id})

# =========================
# 9. HISTORY & CHAT
# =========================

@app.get("/api/rider/history")
async def rider_history(user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    rides = list(get_db().collection("rides").where("userId", "==", user_id)\
        .order_by("created_at", direction=firestore.Query.DESCENDING).limit(20).stream())
    return {"rides": [serialize_firestore({**r.to_dict(), "id": r.id}) for r in rides]}

@app.get("/api/driver/history")
async def driver_history(user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    rides = list(get_db().collection("rides").where("driver_id", "==", user_id)\
        .order_by("created_at", direction=firestore.Query.DESCENDING).limit(20).stream())
    return {"rides": [serialize_firestore({**r.to_dict(), "id": r.id}) for r in rides]}

@app.post("/api/rides/{ride_id}/chat")
async def send_message(ride_id: str, msg: ChatMessage, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    ref = get_db().collection("rides").document(ride_id).collection("messages").document()
    ref.set({
        "sender_id": user_id,
        "message": msg.message,
        "timestamp": firestore.SERVER_TIMESTAMP
    })
    return {"status": "sent"}

@app.get("/api/rides/{ride_id}/chat")
async def get_messages(ride_id: str, user_id: str = Depends(get_current_user_id)):
    if not user_id: raise HTTPException(401)
    msgs = list(get_db().collection("rides").document(ride_id).collection("messages")\
        .order_by("timestamp").stream())
    return {"messages": [serialize_firestore(m.to_dict()) for m in msgs]}

# =========================
# 10. ACTIVE RIDE CHECK (CRITICAL)
# =========================

@app.get("/api/rider/active-ride")
async def get_rider_active_ride(user_id: str = Depends(get_current_user_id)):
    if not user_id: return None
    rides = list(get_db().collection("rides")\
        .where("userId", "==", user_id)\
        .where("status", "in", ["searching", "accepted", "arrived", "in_progress"])\
        .limit(1).stream())
    if rides:
        return serialize_firestore({**rides[0].to_dict(), "id": rides[0].id})
    return None

@app.get("/api/driver/active-ride")
async def get_driver_active_ride(user_id: str = Depends(get_current_user_id)):
    if not user_id: return None
    rides = list(get_db().collection("rides")\
        .where("driver_id", "==", user_id)\
        .where("status", "in", ["accepted", "arrived", "in_progress"])\
        .limit(1).stream())
    if rides:
        return serialize_firestore({**rides[0].to_dict(), "id": rides[0].id})
    return None

@app.get("/")
def health_check():
    return {"status": "Taksi API is Running"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)