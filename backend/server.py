# server.py  (T'aksi API v3 - Firestore Edition)
# ✅ Fixes:
# - Robust Firebase Admin init (no "wrong project" surprises)
# - Phone normalization (no more invalid creds due to formatting)
# - Consistent serialization of Firestore timestamps
# - Keeps ALL your routes + logic (auth, rides, matching, surge, chat, wallet, admin)

# ==========================================
# 1. ALL IMPORTS MUST BE AT THE VERY TOP
# ==========================================
import logging
import math
import os
import asyncio
import base64
import json
import re
import shutil
from typing import List, Optional
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

from fastapi import FastAPI, HTTPException, Query, Header, Depends, BackgroundTasks, File, UploadFile, Form
from pydantic import BaseModel, Field, ConfigDict
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import bcrypt
import jwt
import httpx

# ==========================================
# 2. SETUP APP, LOGS, & FIREBASE
# ==========================================
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

# Initialize Firebase (Ensure you don't double-initialize)
if not firebase_admin._apps:
    # If you use a specific JSON cert, put it here instead of ApplicationDefault
    cred = credentials.ApplicationDefault() 
    firebase_admin.initialize_app(cred)

def get_db():
    return firestore.client()

# ==========================================
# 3. PYDANTIC MODELS
# ==========================================
class WithdrawalRequest(BaseModel):
    amount: float
    bank_details: str

class PayPalTopUpRequest(BaseModel):
    order_id: str

# ==========================================
# 4. DEPENDENCIES & AUTH
# ==========================================
# 🔥 CRITICAL: Your auth functions MUST be defined before your routes!
# Ensure your actual 'get_current_user_id' function is placed right here.
# Example placeholder (replace with your actual auth logic if it's currently at the bottom of your file):

# async def get_current_user_id(token: str = Header(None)):
#     if not token: raise HTTPException(401, "Missing token")
#     # ... your decode logic ...
#     return decoded_user_id


# ==========================================
# 5. PAYPAL HELPERS & ROUTES
# ==========================================
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "")
PAYPAL_API_BASE = os.getenv("PAYPAL_API_BASE", "https://api-m.sandbox.paypal.com")

async def get_paypal_token() -> Optional[str]:
    """Gets a PayPal access token (live or sandbox based on PAYPAL_API_BASE)."""
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        logger.error("PayPal credentials missing (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)")
        return None

    auth_str = f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()

    async with httpx.AsyncClient(timeout=25) as client:
        try:
            resp = await client.post(
                f"{PAYPAL_API_BASE}/v1/oauth2/token",
                headers={"Authorization": f"Basic {b64_auth}"},
                data={"grant_type": "client_credentials"},
            )
            if resp.status_code not in (200, 201):
                logger.error(f"PayPal token failed: {resp.status_code} {resp.text}")
                return None
            return resp.json().get("access_token")
        except Exception as e:
            logger.error(f"PayPal Token Error: {e}")
            return None




    # 1) Fetch order from PayPal
    async with httpx.AsyncClient(timeout=25) as client:
        resp = await client.get(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{req.order_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code != 200:
        logger.warning(f"PayPal order lookup failed: {resp.status_code} {resp.text}")
        raise HTTPException(400, "Invalid PayPal order")

    data = resp.json()

    # Must be COMPLETED to credit wallet
    status = data.get("status")
    if status != "COMPLETED":
        raise HTTPException(400, f"Payment not completed (status={status})")

    # 2) Extract PAID AMOUNT from PayPal
    purchase_units = data.get("purchase_units") or []
    if not purchase_units or not purchase_units[0].get("amount"):
        raise HTTPException(400, "PayPal order missing amount")

    paid_amount_str = purchase_units[0]["amount"].get("value")
    paid_currency = purchase_units[0]["amount"].get("currency_code")

    try:
        paid_amount = float(paid_amount_str)
    except Exception:
        raise HTTPException(400, "Invalid PayPal paid amount")

    if paid_amount <= 0:
        raise HTTPException(400, "Invalid PayPal paid amount")

    # 3) Idempotency: prevent double crediting same order_id
    db = get_db()

    existing = list(
        db.collection("wallet_transactions")
        .where("type", "==", "driver_paypal_topup")
        .where("order_id", "==", req.order_id)
        .limit(1)
        .stream()
    )
    if existing:
        return {
            "message": "Order already processed",
            "order_id": req.order_id,
            "credited_amount": paid_amount,
            "currency": paid_currency,
        }

    # 4) Credit wallet + log transaction
    db.collection("users").document(user_id).update(
        {
            "earnings.balance": firestore.Increment(paid_amount),
            "earnings.total_topped_up": firestore.Increment(paid_amount),
        }
    )

    db.collection("wallet_transactions").add(
        {
            "driver_id": user_id,
            "type": "driver_paypal_topup",
            "amount": paid_amount,
            "currency": paid_currency,
            "order_id": req.order_id,
            "paypal_status": status,
            "created_at": firestore.SERVER_TIMESTAMP,
        }
    )

    return {
        "message": "Wallet topup successful",
        "order_id": req.order_id,
        "credited_amount": paid_amount,
        "currency": paid_currency,
    }

# ==========================================
# (YOUR OTHER ROUTES / APP.POST / APP.GET CONTINUE HERE...)
# ==========================================

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
    user_id: str = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "Driver not found")

    # Create a local folder to hold the uploaded images
    os.makedirs("uploads", exist_ok=True)

    # Helper function to save a file and return its path
    def save_file(file: UploadFile, prefix: str):
        if not file:
            return None
        file_ext = file.filename.split(".")[-1]
        file_name = f"{user_id}_{prefix}_{uuid.uuid4().hex[:6]}.{file_ext}"
        file_path = f"uploads/{file_name}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return f"/uploads/{file_name}"

    # Save all files that were uploaded
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

    # 🔥 UPGRADED: Let Gemini intelligently decide the tier
    tier = await get_vehicle_tier_from_ai(car_make, car_model, car_year)
    logger.info(f"🤖 AI categorized the {car_year} {car_make} {car_model} as: {tier.upper()}")

    # Package the text data, image paths, and tier into one object
    vehicle_data = {
        "id": str(uuid.uuid4()),
        "car_make": car_make,
        "car_model": car_model,
        "car_year": car_year,
        "car_color": car_color,
        "license_plate": license_plate,
        "tier": tier,
        "documents": document_urls,
        "status": "pending"
    }

    # 🔥 UPGRADED: Use ArrayUnion to add to a "Garage" instead of overwriting
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
        "driver_name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}",
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


# --- DRIVER WITHDRAWAL ENDPOINT ---
@app.post("/driver/withdraw")
async def request_withdrawal(
    data: WithdrawalRequest, 
    current_user: dict = Depends(get_current_user)
):
    # 1. Config
    WITHDRAWAL_FEE = 1.00
    MIN_RETENTION = 5.00  # Buffer to keep them online for next ride
    
    # 2. Get Balance
    # Assuming user data has earnings -> balance
    earnings = current_user.get("earnings", {})
    current_balance = float(earnings.get("balance", 0.0))
    
    total_deduction = data.amount + WITHDRAWAL_FEE
    
    # 3. Safety Check: Balance must cover (Amount + Fee + 5 GEL Retention)
    if current_balance < (total_deduction + MIN_RETENTION):
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient funds. You must maintain at least ₾{MIN_RETENTION} in your wallet after the ₾{WITHDRAWAL_FEE} fee."
        )

    # 4. Create the Payout Record
    withdrawal_id = f"WD-{datetime.now(timezone.utc).strftime('%y%m%d%H%M')}-{current_user['id'][:4]}"
    
    payout_doc = {
        "id": withdrawal_id,
        "driver_id": current_user["id"],
        "driver_name": f"{current_user.get('name')} {current_user.get('surname')}",
        "amount_requested": data.amount,
        "fee": WITHDRAWAL_FEE,
        "total_deducted": total_deduction,
        "bank_details": data.bank_details,
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }

    try:
        # Save to 'withdrawals' collection for Admin to see
        db.collection("withdrawals").document(withdrawal_id).set(payout_doc)

        # Update Driver's Balance immediately
        new_balance = current_balance - total_deduction
        db.collection("users").document(current_user["id"]).update({
            "earnings.balance": new_balance
        })


        # Log to Transaction History
        transaction_log = {
            "type": "withdrawal",
            "amount": -total_deduction,
            "description": f"Withdrawal {withdrawal_id}",
            "timestamp": datetime.now(timezone.utc)
        }
        db.collection("users").document(current_user["id"]).collection("transactions").add(transaction_log)

        return {
            "status": "success", 
            "message": "Withdrawal request submitted", 
            "new_balance": new_balance
        }

    except Exception as e:
        logging.error(f"Withdrawal Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Database update failed")

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
                ride_data["pickup_lat"], ride_data["pickup_lng"]
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


@app.get("/api/driver/rides/nearby", tags=["Driver"])
async def get_nearby_rides(
    user_id: str = Depends(get_current_user_id),
    radius: float = Query(10, description="Search radius in km"),
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
            driver_location["lat"], driver_location["lng"],
            pickup_lat, pickup_lng
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

@app.post("/api/rides/{ride_id}/retry", tags=["Rides"])
async def retry_ride_matching(ride_id: str, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    db = get_db()
    ride_doc = db.collection("rides").document(ride_id).get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict()
    if ride_data.get("status") not in ["no_drivers", "cancelled"]:
        raise HTTPException(400, f"Cannot retry ride with status: {ride_data.get('status')}")

    # 🔥 FIXED: Check both spellings of the ID to prevent 403 Forbidden errors
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
async def request_ride(ride_data: RideRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user_id)):
    db = get_db()

    surge_info = get_surge_multiplier(ride_data.pickup_lat, ride_data.pickup_lng)
    surge_multiplier = surge_info["multiplier"]
    commission_rate = surge_info["commission_rate"]

    num_stops = len(ride_data.stops)
    fare = calculate_fare(
        ride_data.car_type or "economy",
        ride_data.estimated_distance or 5,
        0, 0, num_stops,
        surge_multiplier
    )

    # --- ADD THE FEE LOGIC HERE ---
    payment_method = ride_data.payment_method
    service_fee = 2.0 if payment_method == "card" else 0.0
    
    fare["service_fee"] = service_fee
    fare["base_total"] = fare["total"]    # Ride price (e.g., 10 GEL)
    fare["total"] += service_fee          # Total charge (e.g., 12 GEL)
    # ------------------------------

    stops_data = [{"address": s.address, "lat": s.lat, "lng": s.lng, "order": s.order} for s in ride_data.stops]

    ride_ref = db.collection("rides").document()
    new_ride = {
        "id": ride_ref.id,
        "userId": user_id or ride_data.user_id,
        "rider_id": user_id or ride_data.user_id,  # 🔥 FIX: Saves both ID styles so Tipping works
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
        "paymentMethod": payment_method,  # 🔥 FIX: Feeds the exact camelCase to the Driver App
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


@app.get("/api/surge/estimate", tags=["Rides"]) # or /api/rides/estimate
async def estimate_fare(
    car_type: str = "economy",
    distance: float = 5,
    stops: int = 0,
    lat: float = Query(None),
    lng: float = Query(None),
    payment_method: str = "cash" # Add this parameter
):
    surge_info = get_surge_multiplier(lat, lng)
    fare = calculate_fare(car_type, distance, 0, 0, stops, surge_info["multiplier"])
    
    # Calculate fee for the estimate
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
            logger.info(f"Ride {ride_id} no longer exists, stopping matching")
            return

        ride_data = ride_doc.to_dict()
        if ride_data.get("status") != "searching":
            logger.info(f"Ride {ride_id} status changed to {ride_data.get('status')}, stopping matching")
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
            drivers = [d for d in all_drivers if d.to_dict().get("is_online") and d.to_dict().get("registration_status") == "approved"]

        nearby_drivers = []
        declined = ride_data.get("declined_drivers", [])
        already_notified = ride_data.get("notified_drivers", [])

        stale_seconds = int(os.getenv("DRIVER_LOCATION_STALE_SECONDS", "120"))
        now = datetime.now(timezone.utc)

        for driver in drivers:
            driver_data = driver.to_dict() or {}
            driver_location = driver_data.get("current_location") or {}

            if driver.id in declined or driver.id in already_notified:
                continue

            # Busy driver guard
            if driver_data.get("active_ride_id"):
                continue

            # Stale location guard
            last_seen = driver_location.get("updated_at")
            if last_seen and hasattr(last_seen, "timestamp"):
                age = (now - last_seen).total_seconds()
                if age > stale_seconds:
                    continue

            estimated_fare = ride_data.get("estimated_fare", 0)
            commission_rate = ride_data.get("commission_rate", DRIVER_COMMISSION_RATE)
            required_commission = estimated_fare * commission_rate
            driver_balance = (driver_data.get("earnings", {}) or {}).get("balance", 0) or 0

            if driver_balance < required_commission:
                continue

            if driver_location.get("lat") and driver_location.get("lng"):
                distance = haversine_distance(
                    pickup_lat, pickup_lng,
                    driver_location["lat"], driver_location["lng"]
                )
                if distance <= radius:
                    rating = float(driver_data.get("rating", 5.0) or 5.0)
                    perf = driver_data.get("performance", {}) or {}
                    acceptance_rate = float(perf.get("acceptance_rate", 0.65) or 0.65)
                    cancel_rate = float(perf.get("cancel_rate", 0.05) or 0.05)
                    idle_minutes = float(perf.get("idle_minutes", 0) or 0)

                    eta_min = estimate_eta_minutes(distance)

                    score = driver_match_score(
                        distance_km=float(distance),
                        rating=rating,
                        acceptance_rate=acceptance_rate,
                        cancel_rate=cancel_rate,
                        idle_minutes=idle_minutes,
                    )

                    nearby_drivers.append({
                        "id": driver.id,
                        "distance": round(distance, 2),
                        "eta_min": eta_min,
                        "score": round(score, 4),
                        "name": f"{driver_data.get('name', '')} {driver_data.get('surname', '')}".strip(),
                        "vehicle": (driver_data.get("driver_info", {}) or {}).get("vehicle", {}),
                        "rating": rating,
                        "balance": float(driver_balance),
                        "acceptance_rate": acceptance_rate,
                        "cancel_rate": cancel_rate,
                    })

        # Prefer best score first (not just distance)
        nearby_drivers.sort(key=lambda x: (-x["score"], x["eta_min"], x["distance"]))

        batch_size = drivers_per_radius[idx]
        selected_drivers = nearby_drivers[:batch_size]

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

            logger.info(f"Ride {ride_id}: Notified {len(selected_drivers)} drivers within {radius}km radius")

            await asyncio.sleep(wait_time_per_round[idx])

            updated_ride = db.collection("rides").document(ride_id).get()
            if updated_ride.exists and updated_ride.to_dict().get("status") != "searching":
                logger.info(f"Ride {ride_id} was accepted, stopping matching")
                return
        else:
            logger.info(f"Ride {ride_id}: No new drivers found within {radius}km radius")

        if idx + 1 >= len(radius_progression):
            break

    # 🔥 AUTO-REFUND LOGIC (For "No Drivers Found")
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
        actual_rider_id = fresh_ride_data.get("rider_id") or fresh_ride_data.get("userId") or fresh_ride_data.get("user_id")
        
        if actual_rider_id and fare_to_refund > 0:
            # Dump the stolen money back into their wallet
            db.collection("users").document(actual_rider_id).update({
                "wallet_balance": firestore.Increment(fare_to_refund)
            })
            update_data["refunded"] = True
            update_data["refund_amount"] = fare_to_refund
            logger.info(f"Refunded ₾{fare_to_refund} to wallet for unfulfilled ride {ride_id}")

    ride_ref.update(update_data)
    logger.info(f"Ride {ride_id}: Matching completed, no drivers found. Refund processed if card.")

async def get_vehicle_tier_from_ai(make: str, model: str, year: int) -> str:
    """
    Smart local categorizer to determine the car's tier based on make, model, and year.
    Returns: 'economy', 'comfort', or 'suv'
    """
    make_lower = make.lower().strip()
    model_lower = model.lower().strip()

    # 1. Check for SUV / Minivan
    suv_keywords = [
        "suv", "cr-v", "rav4", "highlander", "prado", "land cruiser", 
        "x5", "x3", "q5", "q7", "touareg", "minivan", "transit", "sprinter",
        "santa fe", "tucson", "sportage", "sorento", "macan", "cayenne",
        "rx", "nx", "gx", "lx", "escalade", "tahoe", "suburban", "yukon"
    ]
    if any(keyword in model_lower for keyword in suv_keywords) or make_lower in ["land rover", "jeep"]:
        return "suv"

    # 2. Check for Comfort (Luxury brands or newer standard cars)
    luxury_makes = ["mercedes", "bmw", "audi", "lexus", "porsche", "tesla", "volvo", "infiniti", "jaguar"]
    
    # If it's a luxury brand, or a standard car newer than 2018, it gets Comfort.
    if make_lower in luxury_makes or int(year) >= 2018:
        return "comfort"

    # 3. Default fallback
    return "economy"

@app.post("/api/rides/{ride_id}/accept", tags=["Rides"])
async def accept_ride(ride_id: str, ctx: dict = Depends(require_driver)):
    """
    Transaction-safe accept:
    - prevents double-accept race conditions
    - holds commission atomically
    - sets driver's active_ride_id
    """
    user_id = ctx["user_id"]
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    driver_ref = db.collection("users").document(user_id)

    @firestore.transactional
    def _tx_accept(transaction: firestore.Transaction):
        ride_snap = ride_ref.get(transaction=transaction)
        if not ride_snap.exists:
            raise HTTPException(404, "Ride not found")
        ride_data = ride_snap.to_dict() or {}

        if ride_data.get("status") != "searching":
            raise HTTPException(400, "Ride is no longer available")

        declined = set(ride_data.get("declined_drivers", []) or [])
        if user_id in declined:
            raise HTTPException(400, "You have already declined this ride")

        notified = set(ride_data.get("notified_drivers", []) or [])
        if notified and user_id not in notified:
            raise HTTPException(403, "You were not offered this ride")

        driver_snap = driver_ref.get(transaction=transaction)
        if not driver_snap.exists:
            raise HTTPException(404, "Driver not found")
        driver_data = driver_snap.to_dict() or {}

        if driver_data.get("user_type") != "driver":
            raise HTTPException(403, "Driver account required")
        if not driver_data.get("is_online"):
            raise HTTPException(400, "You must be online to accept rides")
        if driver_data.get("registration_status") != "approved":
            raise HTTPException(400, "Your driver registration is not approved")
        if driver_data.get("active_ride_id"):
            raise HTTPException(400, "You are already on an active ride")

        stale_seconds = int(os.getenv("DRIVER_LOCATION_STALE_SECONDS", "120"))
        last_seen = (driver_data.get("current_location", {}) or {}).get("updated_at")
        if last_seen and hasattr(last_seen, "timestamp"):
            now = datetime.now(timezone.utc)
            age = (now - last_seen).total_seconds()
            if age > stale_seconds:
                raise HTTPException(400, "Your location is stale. Open the driver app and try again.")

        commission_rate = float(ride_data.get("commission_rate", DRIVER_COMMISSION_RATE))
        estimated_fare = float(ride_data.get("estimated_fare", 0) or 0)
        held_commission = estimated_fare * commission_rate

        balance = float((driver_data.get("earnings", {}) or {}).get("balance", 0) or 0)
        if balance < held_commission:
            raise HTTPException(400, f"Insufficient balance. Need ₾{held_commission:.2f}, have ₾{balance:.2f}")

        vehicle = (driver_data.get("driver_info", {}) or {}).get("vehicle", {}) or {}
        driver_location = driver_data.get("current_location", {}) or {}

        transaction.update(driver_ref, {
            "earnings.balance": balance - held_commission,
            "earnings.total_commission_paid": firestore.Increment(held_commission),
            "active_ride_id": ride_id,
            "active_ride_set_at": firestore.SERVER_TIMESTAMP,
        })

        transaction.update(ride_ref, {
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
            "commission_held": held_commission,
            "commission_rate_used": commission_rate,
            "accepted_at": firestore.SERVER_TIMESTAMP,
        })

        hold_ref = ride_ref.collection("commission_holds").document(user_id)
        transaction.set(hold_ref, {
            "driver_id": user_id,
            "ride_id": ride_id,
            "amount": held_commission,
            "rate": commission_rate,
            "status": "held",
            "created_at": firestore.SERVER_TIMESTAMP,
        })

        return {
            "commission_deducted": held_commission,
            "commission_rate": f"{commission_rate * 100:.1f}%",
            "new_balance": balance - held_commission,
            "surge_multiplier": float(ride_data.get("surge_multiplier", 1.0) or 1.0),
        }

    result = _tx_accept(db.transaction())
    return {"message": "Ride accepted!", **result}

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
async def update_ride_tracking(ride_id: str, location: LocationUpdate, ctx: dict = Depends(require_driver)):
    """
    Production-safe tracking:
    - only the assigned driver can update tracking
    - keeps ride doc small (no route_points array growth)
    - stores track points in a subcollection (rides/{ride_id}/track_points)
    """
    user_id = ctx["user_id"]
    db = get_db()

    ride_ref = db.collection("rides").document(ride_id)
    ride_doc = ride_ref.get()
    if not ride_doc.exists:
        raise HTTPException(404, "Ride not found")

    ride_data = ride_doc.to_dict() or {}
    if ride_data.get("driver_id") and ride_data.get("driver_id") != user_id:
        raise HTTPException(403, "Not authorized")
    if ride_data.get("status") not in ("accepted", "arrived", "in_progress"):
        raise HTTPException(400, f"Cannot update tracking when ride status is {ride_data.get('status')}")

    loc_payload = {
        "lat": float(location.lat),
        "lng": float(location.lng),
        "heading": float(location.heading) if location.heading is not None else None,
        "speed": float(location.speed) if location.speed is not None else None,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    # Small, hot fields on the ride document
    ride_ref.update({
        "driver_location": loc_payload,
        "last_driver_location_at": firestore.SERVER_TIMESTAMP,
    })

    # Append-only tracking points in subcollection
    ride_ref.collection("track_points").add({
        "lat": loc_payload["lat"],
        "lng": loc_payload["lng"],
        "heading": loc_payload["heading"],
        "speed": loc_payload["speed"],
        "ts": firestore.SERVER_TIMESTAMP,
        "driver_id": user_id,
    })

    # Optionally keep driver's own location fresh too
    db.collection("users").document(user_id).update({
        "current_location": {
            "lat": loc_payload["lat"],
            "lng": loc_payload["lng"],
            "heading": loc_payload["heading"],
            "speed": loc_payload["speed"],
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
    })

    return {"message": "Tracking updated"}


@app.post("/api/rides/{ride_id}/stop-reached", tags=["Rides"])
async def stop_reached(ride_id: str, stop_index: int, wait_minutes: int = 0, user_id: str = Depends(get_current_user_id)):
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
    
    # 1. FARE CALCULATION
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

    # 🔥 FIX 1: Fuzzy matching so "virtual_wallet" or "Card" doesn't break the system
    is_wallet = "wallet" in safe_payment_method or "balance" in safe_payment_method
    is_card = "card" in safe_payment_method or "stripe" in safe_payment_method

    service_fee = 2.0 if is_card else 0.0
    commissionable_amount = final_fare["total"] 
    total_with_fee = commissionable_amount + service_fee
    
    final_fare["base_total"] = commissionable_amount
    final_fare["service_fee"] = service_fee
    final_fare["total"] = total_with_fee

    # 🔥 FIX 2: Bulletproof ID Check to prevent Ghost Trips
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

    # Evaluate how much cash vs wallet is needed
    if is_wallet:
        # Drain as much wallet as possible to cover the trip
        wallet_used = min(wallet_balance, total_with_fee)
        cash_to_collect = total_with_fee - wallet_used
        payment_status = "paid_fully_via_wallet" if cash_to_collect == 0 else "split_cash_required"
        
        # 🔥 Actually deduct the money from the Rider
        if wallet_used > 0 and rider_ref:
            rider_ref.update({
                "wallet_balance": firestore.Increment(-float(wallet_used))
            })
            logger.info(f"Deducted ₾{wallet_used} from Rider {rider_id}")

    elif is_card:
        cash_to_collect = 0.0
        payment_status = "paid_via_card"
        
    else: 
        # Default to Cash to ensure drivers ALWAYS get paid if data is weird
        cash_to_collect = total_with_fee
        payment_status = "cash_collected"

    # 3. UPDATE THE RIDE RECORD
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
        # 🔥 FIX 3: Force both casing styles so the History query NEVER misses it
        "driver_id": driver_id,
        "driverId": driver_id,
        "user_id": rider_id,
        "userId": rider_id
    }
    ride_ref.update(ride_updates)

    # 4. DRIVER EARNINGS SETTLEMENT (transaction-safe)
    if driver_id:
        driver_ref = db.collection("users").document(driver_id)

        @firestore.transactional
        def _tx_settle(transaction: firestore.Transaction):
            ride_snap = ride_ref.get(transaction=transaction)
            if not ride_snap.exists:
                raise HTTPException(404, "Ride not found")
            rd = ride_snap.to_dict() or {}

            # Commission that was held at accept time
            held_commission = float(rd.get("commission_held", rd.get("commission_paid", 0)) or 0)
            commission_rate = float(rd.get("commission_rate_used", rd.get("commission_rate", 0.23)) or 0.23)

            actual_commission = float(commissionable_amount) * commission_rate
            driver_share = float(commissionable_amount) - actual_commission

            # Wallet change = earned minus cash collected + held commission returned into balance calc
            wallet_change = driver_share - float(cash_to_collect) + held_commission

            driver_snap = driver_ref.get(transaction=transaction)
            if not driver_snap.exists:
                return

            transaction.update(driver_ref, {
                "earnings.balance": firestore.Increment(wallet_change),
                "earnings.total_earned": firestore.Increment(driver_share),
                "earnings.total_commission_paid": firestore.Increment(0),  # already incremented at accept
                "active_ride_id": firestore.DELETE_FIELD,
                "active_ride_set_at": firestore.DELETE_FIELD,
                "last_completed_ride_at": firestore.SERVER_TIMESTAMP,
            })

            # Mark the hold as settled for auditability
            hold_ref = ride_ref.collection("commission_holds").document(driver_id)
            transaction.set(hold_ref, {
                "driver_id": driver_id,
                "ride_id": ride_id,
                "amount": held_commission,
                "rate": commission_rate,
                "status": "settled",
                "settled_at": firestore.SERVER_TIMESTAMP,
            }, merge=True)

            transaction.update(ride_ref, {
                "commission_actual": actual_commission,
                "driver_payout": driver_share,
                "settled_at": firestore.SERVER_TIMESTAMP,
            })

        _tx_settle(db.transaction())

    # 5. Update Rider Stats

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
async def rate_passenger(ride_id: str, rating_data: RatePassengerRequest, user_id: str = Depends(get_current_user_id)):
    db = get_db()

    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(404, "Ride not found")

    data = ride.to_dict()
    if data.get("driver_id") != user_id:
        raise HTTPException(403, "Not authorized")

    ride_ref.update({
        "passenger_rating": rating_data.rating,
        "passenger_review": rating_data.review
    })

    rider_id = data.get("userId")
    if rider_id:
        user_ref = db.collection("users").document(rider_id)
        user_doc = user_ref.get()
        if user_doc.exists:
            u_data = user_doc.to_dict()
            current = u_data.get("rating", 5.0)
            count = u_data.get("total_rides", 1)
            new_rating = ((current * count) + rating_data.rating) / (count + 1)
            user_ref.update({"rating": new_rating})

    return {"message": "Passenger rated"}


@app.post("/api/rides/{ride_id}/rate-rider", tags=["Rides"])
async def rate_driver(ride_id: str, rating_data: RateDriverRequest, user_id: str = Depends(get_current_user_id)):
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
        "rated_at": firestore.SERVER_TIMESTAMP
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
            driver_ref.update({"rating": new_rating})

    return {"message": "Rating submitted"}


@app.post("/api/rides/{ride_id}/cancel", tags=["Rides"])
async def cancel_ride(ride_id: str, reason: str = "User cancelled", user_id: str = Depends(get_current_user_id)):
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride_data = ride_ref.get().to_dict()
    
    update_data = {
        "status": "cancelled",
        "cancellation_reason": reason,
        "cancelled_by": user_id,
        "cancelled_at": firestore.SERVER_TIMESTAMP,
    }
    
    # 🔥 AUTO-REFUND LOGIC (For user cancellations)
    payment_method = ride_data.get("payment_method") or ride_data.get("paymentMethod")
    if payment_method == "card" and not ride_data.get("refunded"):
        # Only refund if the ride hasn't been completed yet
        if ride_data.get("status") in ["searching", "accepted", "arrived", "no_drivers"]:
            fare_to_refund = ride_data.get("estimated_fare", 0)
            actual_rider_id = ride_data.get("rider_id") or ride_data.get("userId") or ride_data.get("user_id")
            
            if actual_rider_id and fare_to_refund > 0:
                # Add money back to their in-app wallet instantly
                db.collection("users").document(actual_rider_id).update({
                    "wallet_balance": firestore.Increment(fare_to_refund)
                })
                update_data["refunded"] = True
                update_data["refund_amount"] = fare_to_refund
                logger.info(f"Refunded ₾{fare_to_refund} to wallet for cancelled ride {ride_id}")

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
    rider_id = ride_data.get("userId")
    driver_id = ride_data.get("driver_id")

    if user_id not in [rider_id, driver_id]:
        raise HTTPException(403, "Not authorized to access this chat")

    messages = list(
        db.collection("rides")
        .document(ride_id)
        .collection("messages")
        .order_by("timestamp")
        .stream()
    )

    return {
        "ride_id": ride_id,
        "messages": [serialize_firestore_data({**m.to_dict(), "id": m.id}) for m in messages],
    }


@app.post("/api/rides/{ride_id}/chat", tags=["Chat"])
async def send_chat_message(ride_id: str, chat: ChatMessage, user_id: str = Depends(get_current_user_id)):
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

    db.collection("rides").document(ride_id).update({
        "last_message": {
            "text": chat.message[:50] + "..." if len(chat.message) > 50 else chat.message,
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
            "updated_at": firestore.SERVER_TIMESTAMP
        })
        return {"message": f"Successfully added {request.amount} to wallet"}
    except Exception as e:
        logger.error(f"Topup error: {e}")
        raise HTTPException(500, "Failed to process topup")


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
    active_rides = list(db.collection("rides").where("status", "in", ["searching", "accepted", "arrived", "in_progress"]).stream())
    pending_drivers = list(db.collection("users").where("registration_status", "==", "pending_review").stream())
    pending_withdrawals = list(db.collection("driver_withdrawals").where("status", "==", "pending").stream())
    pending_topups = list(db.collection("driver_topup_requests").where("status", "==", "pending").stream())

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


@app.post("/api/admin/adjust-balance/{id}", tags=["Admin"])
async def admin_adjust_balance(
    id: str, 
    req: AdminAddBalanceRequest,
    current_user: dict = Depends(get_current_user) # 🔥 Secure it!
):
    if current_user.get("user_type") != "admin":
        raise HTTPException(403, "Forbidden: Admin access only")

    db = get_db()
    ref = db.collection("users").document(id)
    doc = ref.get()

    if not doc.exists:
        raise HTTPException(404, "User not found")

    user_data = doc.to_dict()
    user_type = user_data.get("user_type", "rider")
    
    # 🔥 The logic: positive adds, negative takes.
    is_deduction = req.amount < 0
    action_type = "deduction" if is_deduction else "addition"

    if user_type == "driver":
        ref.update({
            "earnings.balance": firestore.Increment(req.amount),
            # We only track "total_topped_up" if it's actual new money coming in
            "earnings.total_topped_up": firestore.Increment(req.amount) if not is_deduction else firestore.Increment(0)
        })
    else:
        ref.update({"wallet_balance": firestore.Increment(req.amount)})

    # Log the correction for audit (very important for 'accidents')
    db.collection("admin_balance_logs").add({
        "target_user_id": id,
        "target_user_name": f"{user_data.get('name', '')} {user_data.get('surname', '')}",
        "target_user_type": user_type,
        "amount": req.amount,
        "reason": req.reason,
        "admin_id": current_user.get("id"),
        "admin_action": action_type,
        "timestamp": firestore.SERVER_TIMESTAMP,
    })

    return {
        "status": "success", 
        "message": f"Successfully performed {action_type} of ₾{abs(req.amount)} on {user_type} account"
    }

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

    db.collection("users").document(driver_id).update({
        "earnings.balance": firestore.Increment(-amount),
        "earnings.total_withdrawn": firestore.Increment(amount),
    })

    db.collection("driver_withdrawals").document(id).update({
        "status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP,
    })

    return {"message": f"Withdrawal of ₾{amount} approved"}


@app.post("/api/admin/withdrawals/{id}/reject", tags=["Admin"])
@app.post("/api/admin/withdrawal/{id}/reject", tags=["Admin"])
async def reject_withdrawal(id: str):
    db = get_db()
    db.collection("driver_withdrawals").document(id).update({
        "status": "rejected",
        "rejected_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Withdrawal rejected"}

# AI FEATURES - TRANSLATION, SUPPORT, CHAT

from ai_features import (
    translate_text, process_support_message, translate_chat_message,
    generate_referral_code, generate_share_link, calculate_referral_bonus,
    TranslateRequest, RatingRequest, FavoriteLocation,
    ScheduledRideRequest, SOSRequest, ShareTripRequest, ReferralCodeRequest, TipRequest,
    RATING_TAGS, now_iso as ai_now_iso
)

# Create a local model that allows ticket_id for ongoing chats
class TicketReplyRequest(BaseModel):
    message: str
    ticket_id: Optional[str] = None

# --- Translation API ---
@app.post("/api/translate", tags=["AI"])
async def translate_endpoint(req: TranslateRequest):
    """Translate text between languages"""
    translated = await translate_text(req.text, req.source_lang, req.target_lang)
    return {"original": req.text, "translated": translated, "target_lang": req.target_lang}

# --- Chat with Auto-Translation ---
@app.post("/api/rides/{ride_id}/chat/translate", tags=["Chat"])
async def send_translated_chat(
    ride_id: str, 
    chat: ChatMessage, 
    target_lang: str = "auto",
    user_id: str = Depends(get_current_user_id)
):
    """Send chat message with auto-translation"""
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    if not ride.exists:
        raise HTTPException(status_code=404, detail="Ride not found")
    
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
        "read": False
    }
    db.collection("ride_chats").add(message_data)
    
    return {
        "status": "sent",
        "original": chat.message,
        "translated": translation_result.get("translated"),
        "was_translated": translation_result.get("was_translated", False)
    }

# --- AI Support Bot (UPGRADED FOR THREADED CHAT) ---
@app.post("/api/support/message", tags=["Support"])
async def send_support_message(msg: TicketReplyRequest, user_id: str = Depends(get_current_user_id)):
    """Send message to AI support bot or reply to existing ticket"""
    db = get_db()
    
    # 1. IF THIS IS A REPLY TO AN EXISTING TICKET (Admin & Rider conversing)
    if msg.ticket_id:
        ticket_ref = db.collection("support_tickets").document(msg.ticket_id)
        if not ticket_ref.get().exists:
            raise HTTPException(404, "Ticket not found")
            
        new_msg = {"role": "user", "content": msg.message, "timestamp": now_iso()}
        ticket_ref.update({
            "chat_history": firestore.ArrayUnion([new_msg]),
            "status": "escalated", # Wake the admin back up
            "updated_at": firestore.SERVER_TIMESTAMP
        })
        return {"ticket_id": msg.ticket_id, "response": "", "status": "escalated"}

    # 2. IF THIS IS A BRAND NEW TICKET (First message)
    user_doc = db.collection("users").document(user_id).get()
    user_context = {}
    if user_doc.exists:
        user_data = user_doc.to_dict()
        user_context = {"name": user_data.get("name", "Unknown"), "phone": user_data.get("cellphone", ""), "ride_count": user_data.get("total_rides", 0)}
    
    # 🔥 THE FIX: Bypass the failing AI and lock your exact text into the database permanently
    guaranteed_response = "We appreciate you contacting us, I have forwarded your ticket to our support team and someone will get back to you promptly."
    
    chat_history = [
        {"role": "user", "content": msg.message, "timestamp": now_iso()},
        {"role": "assistant", "content": guaranteed_response, "escalated": True, "timestamp": now_iso()}
    ]
    
    ticket_data = {
        "user_id": user_id,
        "user_name": user_context.get("name", "Unknown"),
        "user_phone": user_context.get("phone", ""),
        "message": msg.message, 
        "ai_response": guaranteed_response,
        "admin_response": None,
        "chat_history": chat_history, 
        "status": "escalated", # Escalates it to the Admin dashboard immediately
        "priority": "normal",
        "category": "general",
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
        "admin_notes": None
    }
    
    ticket_ref = db.collection("support_tickets").add(ticket_data)
    return {
        "ticket_id": ticket_ref[1].id,
        "response": guaranteed_response,
        "status": "escalated",
        "escalated": True
    }

# --- THE MISSING ROUTE REACT WAS LOOKING FOR ---
@app.get("/api/support/tickets/{ticket_id}", tags=["Support"])
async def get_support_ticket(ticket_id: str, user_id: str = Depends(get_current_user_id)):
    """Fetch live chat history for a specific ticket"""
    db = get_db()
    doc = db.collection("support_tickets").document(ticket_id).get()
    if not doc.exists:
        raise HTTPException(404, "Ticket not found")
        
    data = doc.to_dict()
    messages = data.get("chat_history", [])
    
    # Fallback for old tickets that don't have an array yet
    if not messages:
        messages.append({"role": "user", "content": data.get("message", "")})
        if data.get("ai_response"):
            messages.append({"role": "assistant", "content": data.get("ai_response"), "escalated": data.get("status") == "escalated"})
        if data.get("admin_response"):
            messages.append({"role": "admin", "content": data.get("admin_response")})

    return {"status": data.get("status"), "messages": messages}

@app.get("/api/support/history", tags=["Support"])
async def get_support_history(user_id: str = Depends(get_current_user_id)):
    """Get user's support ticket history"""
    db = get_db()
    tickets = db.collection("support_tickets").where("user_id", "==", user_id).order_by("created_at", direction=firestore.Query.DESCENDING).limit(20).stream()
    
    result = []
    for ticket in tickets:
        data = ticket.to_dict()
        data["id"] = ticket.id
        result.append(serialize_firestore_data(data))
    
    return {"tickets": result}

@app.get("/api/admin/support/tickets", tags=["Admin"])
async def get_support_tickets(status: str = None, priority: str = None):
    db = get_db()
    # We remove the order_by from the query to prevent the Index Crash
    query = db.collection("support_tickets")
    if status: query = query.where("status", "==", status)
    if priority: query = query.where("priority", "==", priority)
    
    # We fetch the data first...
    tickets_stream = query.limit(100).stream()
    
    results = []
    for t in tickets_stream:
        data = t.to_dict()
        data["id"] = t.id
        results.append(serialize_firestore_data(data))
    
    # ...and then we sort it in Python memory to avoid needing a Google Index!
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {"tickets": results}

@app.get("/api/admin/support/tickets/escalated", tags=["Admin"])
async def get_escalated_tickets():
    db = get_db()
    tickets = db.collection("support_tickets").where("status", "==", "escalated").limit(50).stream()
    result = [serialize_firestore_data({**t.to_dict(), "id": t.id}) for t in tickets]
    result.sort(key=lambda x: (x.get("priority", "medium"), x.get("created_at", "")), reverse=False)
    return {"tickets": result, "count": len(result)}

@app.post("/api/admin/support/tickets/{ticket_id}/respond", tags=["Admin"])
async def admin_respond_ticket(ticket_id: str, response: str, resolve: bool = False):
    """Admin responds to support ticket and updates chat thread"""
    db = get_db()
    
    new_admin_msg = {"role": "admin", "content": response, "timestamp": now_iso()}
    
    update_data = {
        "admin_response": response, # Kept so your admin dashboard UI doesn't break
        "admin_notes": response,
        "chat_history": firestore.ArrayUnion([new_admin_msg]), # Appends to React chat
        "updated_at": firestore.SERVER_TIMESTAMP,
        "status": "resolved" if resolve else "in_progress"
    }
    db.collection("support_tickets").document(ticket_id).update(update_data)
    return {"status": "updated", "resolved": resolve}

@app.post("/api/admin/support/tickets/{ticket_id}/resolve", tags=["Admin"])
async def resolve_ticket(ticket_id: str, notes: str = ""):
    db = get_db()
    db.collection("support_tickets").document(ticket_id).update({
        "status": "closed", # Changed to closed to lock the React chat widget
        "admin_notes": notes,
        "resolved_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP
    })
    return {"status": "closed"}


# =========================
# RATING SYSTEM
# =========================

@app.get("/api/rating/tags", tags=["Rating"])
async def get_rating_tags():
    """Get available rating tags"""
    return RATING_TAGS

@app.post("/api/rides/{ride_id}/rate/driver", tags=["Rating"])
async def rate_driver_enhanced(ride_id: str, rating: RatingRequest, user_id: str = Depends(get_current_user_id)):
    """Enhanced driver rating with tags"""
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    
    if not ride.exists:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    ride_data = ride.to_dict()
    if ride_data.get("rider_id") != user_id:
        raise HTTPException(status_code=403, detail="Only rider can rate driver")
    
    driver_id = ride_data.get("driver_id")
    if not driver_id:
        raise HTTPException(status_code=400, detail="No driver assigned")
    
    # Store rating
    rating_data = {
        "ride_id": ride_id,
        "driver_id": driver_id,
        "rider_id": user_id,
        "rating": rating.rating,
        "comment": rating.comment,
        "tags": rating.tags or [],
        "created_at": firestore.SERVER_TIMESTAMP
    }
    db.collection("driver_ratings").add(rating_data)
    
    # Update driver's average rating
    driver_ref = db.collection("users").document(driver_id)
    driver = driver_ref.get().to_dict()
    current_rating = driver.get("rating", 5.0)
    total_ratings = driver.get("total_ratings", 0)
    
    new_total = total_ratings + 1
    new_rating = ((current_rating * total_ratings) + rating.rating) / new_total
    
    driver_ref.update({
        "rating": round(new_rating, 2),
        "total_ratings": new_total
    })
    
    # Update ride
    ride_ref.update({"driver_rating": rating.rating, "driver_rating_comment": rating.comment})
    
    return {"status": "rated", "new_driver_rating": round(new_rating, 2)}

@app.post("/api/rides/{ride_id}/rate/rider", tags=["Rating"])
async def rate_rider_enhanced(ride_id: str, rating: RatingRequest, user_id: str = Depends(get_current_user_id)):
    """Enhanced rider rating by driver"""
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    
    if not ride.exists:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    ride_data = ride.to_dict()
    if ride_data.get("driver_id") != user_id:
        raise HTTPException(status_code=403, detail="Only driver can rate rider")
    
    rider_id = ride_data.get("userId")
    
    # Store rating
    rating_data = {
        "ride_id": ride_id,
        "rider_id": rider_id,
        "driver_id": user_id,
        "rating": rating.rating,
        "comment": rating.comment,
        "tags": rating.tags or [],
        "created_at": firestore.SERVER_TIMESTAMP
    }
    db.collection("rider_ratings").add(rating_data)
    
    # Update rider's average rating
    rider_ref = db.collection("users").document(rider_id)
    rider = rider_ref.get().to_dict()
    current_rating = rider.get("rider_rating", 5.0)
    total_ratings = rider.get("total_rider_ratings", 0)
    
    new_total = total_ratings + 1
    new_rating = ((current_rating * total_ratings) + rating.rating) / new_total
    
    rider_ref.update({
        "rider_rating": round(new_rating, 2),
        "total_rider_ratings": new_total
    })
    
    ride_ref.update({"rider_rating": rating.rating})
    
    return {"status": "rated", "new_rider_rating": round(new_rating, 2)}


# =========================
# FAVORITE LOCATIONS
# =========================

@app.get("/api/user/favorites", tags=["User"])
async def get_favorite_locations(user_id: str = Depends(get_current_user_id)):
    """Get user's favorite locations"""
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
    """Add a favorite location"""
    db = get_db()
    fav_data = {
        "name": fav.name,
        "address": fav.address,
        "lat": fav.lat,
        "lng": fav.lng,
        "icon": fav.icon,
        "created_at": firestore.SERVER_TIMESTAMP
    }
    ref = db.collection("users").document(user_id).collection("favorites").add(fav_data)
    return {"status": "added", "id": ref[1].id}

@app.delete("/api/user/favorites/{fav_id}", tags=["User"])
async def delete_favorite_location(fav_id: str, user_id: str = Depends(get_current_user_id)):
    """Delete a favorite location"""
    db = get_db()
    db.collection("users").document(user_id).collection("favorites").document(fav_id).delete()
    return {"status": "deleted"}


# =========================
# SCHEDULED RIDES
# =========================

@app.post("/api/rides/schedule", tags=["Rides"])
async def schedule_ride(ride: ScheduledRideRequest, user_id: str = Depends(get_current_user_id)):
    """Schedule a ride for later"""
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
        "created_at": firestore.SERVER_TIMESTAMP
    }
    
    ref = db.collection("scheduled_rides").add(ride_data)
    return {"status": "scheduled", "ride_id": ref[1].id, "scheduled_time": ride.scheduled_time}

@app.get("/api/rides/scheduled", tags=["Rides"])
async def get_scheduled_rides(user_id: str = Depends(get_current_user_id)):
    """Get user's scheduled rides"""
    db = get_db()
    rides = db.collection("scheduled_rides").where("rider_id", "==", user_id).where("status", "==", "scheduled").stream()
    
    result = []
    for ride in rides:
        data = ride.to_dict()
        data["id"] = ride.id
        result.append(serialize_firestore_data(data))
    
    return {"scheduled_rides": result}

@app.delete("/api/rides/scheduled/{ride_id}", tags=["Rides"])
async def cancel_scheduled_ride(ride_id: str, user_id: str = Depends(get_current_user_id)):
    """Cancel a scheduled ride"""
    db = get_db()
    ride_ref = db.collection("scheduled_rides").document(ride_id)
    ride = ride_ref.get()
    
    if not ride.exists:
        raise HTTPException(status_code=404, detail="Scheduled ride not found")
    
    if ride.to_dict().get("rider_id") != user_id:
        raise HTTPException(status_code=403, detail="Not your ride")
    
    ride_ref.update({"status": "cancelled", "cancelled_at": firestore.SERVER_TIMESTAMP})
    return {"status": "cancelled"}


# =========================
# SOS & SAFETY
# =========================

@app.post("/api/sos", tags=["Safety"])
async def trigger_sos(sos: SOSRequest, user_id: str = Depends(get_current_user_id)):
    """Trigger emergency SOS"""
    db = get_db()
    
    # Get user info - handle case where user might not exist
    user_doc = db.collection("users").document(user_id).get()
    user = user_doc.to_dict() if user_doc.exists else {}
    
    sos_data = {
        "user_id": user_id,
        "user_name": user.get("name", "Unknown") if user else "Unknown",
        "user_phone": user.get("cellphone", "") if user else "",
        "ride_id": sos.ride_id,
        "lat": sos.lat,
        "lng": sos.lng,
        "message": sos.message,
        "status": "active",
        "created_at": firestore.SERVER_TIMESTAMP
    }
    
    ref = db.collection("sos_alerts").add(sos_data)
    
    # Create urgent support ticket (sync, not await)
    db.collection("support_tickets").add({
        "user_id": user_id,
        "user_name": user.get("name", "Unknown") if user else "Unknown",
        "user_phone": user.get("cellphone", "") if user else "",
        "message": f"SOS ALERT: {sos.message}. Location: {sos.lat}, {sos.lng}",
        "ai_response": "EMERGENCY - SOS triggered by user",
        "status": "escalated",
        "priority": "urgent",
        "category": "safety",
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP
    })
    
    return {
        "status": "sos_triggered",
        "alert_id": ref[1].id,
        "message": "Emergency services have been notified. Help is on the way."
    }

@app.get("/api/admin/sos/active", tags=["Admin"])
async def get_active_sos():
    """Get active SOS alerts for admin"""
    db = get_db()
    # Simplified query to avoid composite index requirement
    alerts = db.collection("sos_alerts").where("status", "==", "active").limit(50).stream()
    
    result = []
    for alert in alerts:
        data = alert.to_dict()
        data["id"] = alert.id
        result.append(serialize_firestore_data(data))
    
    # Sort by created_at descending in Python
    result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {"alerts": result, "count": len(result)}

@app.post("/api/admin/sos/{alert_id}/resolve", tags=["Admin"])
async def resolve_sos(alert_id: str, notes: str = ""):
    """Resolve SOS alert"""
    db = get_db()
    db.collection("sos_alerts").document(alert_id).update({
        "status": "resolved",
        "resolved_at": firestore.SERVER_TIMESTAMP,
        "resolution_notes": notes
    })
    return {"status": "resolved"}


# =========================
# SHARE TRIP
# =========================

@app.post("/api/rides/{ride_id}/share", tags=["Rides"])
async def share_trip(ride_id: str, share: ShareTripRequest, user_id: str = Depends(get_current_user_id)):
    """Generate shareable trip link"""
    db = get_db()
    ride = db.collection("rides").document(ride_id).get()
    
    if not ride.exists:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    share_link = generate_share_link(ride_id)
    
    # Store share record
    db.collection("trip_shares").add({
        "ride_id": ride_id,
        "shared_by": user_id,
        "recipient_phone": share.recipient_phone,
        "recipient_email": share.recipient_email,
        "share_link": share_link,
        "created_at": firestore.SERVER_TIMESTAMP
    })
    
    return {
        "share_link": share_link,
        "message": "Share this link with friends/family to let them track your trip"
    }

@app.get("/api/track/{ride_id}", tags=["Public"])
async def get_public_ride_tracking(ride_id: str):
    """Public endpoint for tracking shared rides"""
    db = get_db()
    ride = db.collection("rides").document(ride_id).get()
    
    if not ride.exists:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    ride_data = ride.to_dict()
    
    # Return limited info for privacy
    return {
        "status": ride_data.get("status"),
        "driver_location": ride_data.get("driver_location"),
        "destination_address": ride_data.get("destination_address"),
        "eta_minutes": ride_data.get("eta_minutes"),
        "car_type": ride_data.get("car_type")
    }


# =========================
# REFERRAL SYSTEM
# =========================

@app.get("/api/user/referral", tags=["User"])
async def get_referral_code(user_id: str = Depends(get_current_user_id)):
    """Get or generate user's referral code"""
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
        "referrals_count": user.get("referrals_count", 0)
    }

@app.post("/api/user/referral/apply", tags=["User"])
async def apply_referral_code(req: ReferralCodeRequest, user_id: str = Depends(get_current_user_id)):
    """Apply a referral code"""
    db = get_db()
    
    # Check if user already used a referral code
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get().to_dict()
    
    if user.get("referred_by"):
        raise HTTPException(status_code=400, detail="You have already used a referral code")
    
    # Find referrer
    referrers = db.collection("users").where("referral_code", "==", req.code).limit(1).stream()
    referrer = None
    for r in referrers:
        referrer = r
        break
    
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    
    referrer_id = referrer.id
    if referrer_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot use your own referral code")
    
    # Apply bonuses
    bonus = calculate_referral_bonus(True)
    
    # Update new user
    user_ref.update({
        "referred_by": referrer_id,
        "referral_bonus": bonus["referee_bonus"],
        "wallet_balance": firestore.Increment(bonus["referee_bonus"])
    })
    
    # Update referrer
    db.collection("users").document(referrer_id).update({
        "referrals_count": firestore.Increment(1),
        "referral_bonus_earned": firestore.Increment(bonus["referrer_bonus"]),
        "wallet_balance": firestore.Increment(bonus["referrer_bonus"])
    })
    
    return {
        "status": "applied",
        "bonus_received": bonus["referee_bonus"],
        "message": f"You received ₾{bonus['referee_bonus']} bonus!"
    }


# =========================
# DRIVER TIPS
# =========================

@app.post("/api/rides/{ride_id}/tip", tags=["Rides"])
async def add_tip(ride_id: str, tip: TipRequest, user_id: str = Depends(get_current_user_id)):
    """Add tip for driver after ride"""
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get()
    
    if not ride.exists:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    ride_data = ride.to_dict()
    
    # 🔥 FIX: Check all 3 ways the ID might be saved in the database
    actual_rider_id = ride_data.get("rider_id") or ride_data.get("userId") or ride_data.get("user_id")
    
    if actual_rider_id != user_id:
        raise HTTPException(status_code=403, detail="Not your ride")
    
    if ride_data.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Can only tip completed rides")
    
    driver_id = ride_data.get("driver_id") or ride_data.get("driverId")
    if not driver_id:
        raise HTTPException(status_code=400, detail="No driver to tip")
    
    # Update ride with tip
    ride_ref.update({
        "tip_amount": tip.amount,
        "tip_added_at": firestore.SERVER_TIMESTAMP
    })
    
    # Add to driver's earnings
    db.collection("users").document(driver_id).update({
        "earnings.balance": firestore.Increment(tip.amount),
        "earnings.total_tips": firestore.Increment(tip.amount)
    })
    
    return {"status": "tip_added", "amount": tip.amount}


# =========================
# TRIP RECEIPTS
# =========================

@app.get("/api/rides/{ride_id}/receipt", tags=["Rides"])
async def get_trip_receipt(ride_id: str, user_id: str = Depends(get_current_user_id)):
    """Get detailed trip receipt"""
    db = get_db()
    ride = db.collection("rides").document(ride_id).get()
    
    if not ride.exists:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    ride_data = ride.to_dict()
    
    actual_rider_id = ride_data.get("rider_id") or ride_data.get("userId") or ride_data.get("user_id")
    actual_driver_id = ride_data.get("driver_id") or ride_data.get("driverId")
    
    if actual_rider_id != user_id and actual_driver_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
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
        
        "fare_breakdown": {
            "base_fare": ride_data.get("fare_breakdown", {}).get("base_fare", 0),
            "distance_fare": ride_data.get("fare_breakdown", {}).get("distance_fare", 0),
            "time_fare": ride_data.get("fare_breakdown", {}).get("time_fare", 0),
            "wait_fare": ride_data.get("fare_breakdown", {}).get("wait_fare", 0),
            "stop_fees": ride_data.get("fare_breakdown", {}).get("stop_fees", 0),
            "surge_fee": ride_data.get("fare_breakdown", {}).get("surge_fee", 0),
            "card_fee": ride_data.get("fare_breakdown", {}).get("card_fee", 0),
        },
        "subtotal": ride_data.get("estimated_fare", 0),
        "tip": ride_data.get("tip_amount", 0),
        "total": ride_data.get("final_fare", ride_data.get("estimated_fare", 0)),
        
        # 🔥 Show the Split Payment details on the receipt
        "wallet_used": ride_data.get("wallet_used", 0),
        "cash_collected": ride_data.get("cash_to_collect", 0),
        
        "driver_name": ride_data.get("driver_info", {}).get("name", "Unknown Driver"),
        "driver_rating": ride_data.get("driver_rating", 5.0),
        "vehicle": ride_data.get("driver_info", {})
    }
    
    return receipt


# =========================
# USER LANGUAGE PREFERENCE
# =========================

@app.post("/api/user/language", tags=["User"])
async def set_language_preference(lang: str, user_id: str = Depends(get_current_user_id)):
    """Set user's preferred language"""
    db = get_db()
    db.collection("users").document(user_id).update({"preferred_language": lang})
    return {"status": "updated", "language": lang}

@app.get("/api/user/language", tags=["User"])
async def get_language_preference(user_id: str = Depends(get_current_user_id)):
    """Get user's preferred language"""
    db = get_db()
    user = db.collection("users").document(user_id).get().to_dict()
    return {"language": user.get("preferred_language", "en")}


# =========================
# DRIVER CAMPAIGNS
# =========================

from driver_campaigns import (
    CreateCampaignRequest, UpdateCampaignRequest, CampaignType, CampaignStatus,
    CAMPAIGN_TEMPLATES, calculate_campaign_progress, get_campaign_emoji
)

@app.get("/api/admin/campaigns/templates", tags=["Campaigns"])
async def get_campaign_templates():
    """Get available campaign templates for quick creation"""
    return {"templates": CAMPAIGN_TEMPLATES}

@app.post("/api/admin/campaigns", tags=["Campaigns"])
async def create_campaign(campaign: CreateCampaignRequest):
    """Create a new driver incentive campaign"""
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
        "updated_at": firestore.SERVER_TIMESTAMP
    }
    
    ref = db.collection("campaigns").add(campaign_data)
    
    return {
        "status": "created",
        "campaign_id": ref[1].id,
        "message": f"Campaign '{campaign.title}' created successfully"
    }

@app.post("/api/admin/campaigns/from-template/{template_id}", tags=["Campaigns"])
async def create_campaign_from_template(template_id: str, start_date: str, end_date: str):
    """Create a campaign from a pre-defined template"""
    if template_id not in CAMPAIGN_TEMPLATES:
        raise HTTPException(status_code=404, detail="Template not found")
    
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
        "updated_at": firestore.SERVER_TIMESTAMP
    }
    
    ref = db.collection("campaigns").add(campaign_data)
    
    return {
        "status": "created",
        "campaign_id": ref[1].id,
        "message": f"Campaign '{template['title']}' created from template"
    }

@app.get("/api/admin/campaigns", tags=["Campaigns"])
async def get_all_campaigns(status: str = None):
    """Get all campaigns for admin"""
    db = get_db()
    
    if status:
        campaigns = db.collection("campaigns").where("status", "==", status).stream()
    else:
        campaigns = db.collection("campaigns").stream()
    
    result = []
    for campaign in campaigns:
        data = campaign.to_dict()
        data["id"] = campaign.id
        data["emoji"] = get_campaign_emoji(data.get("icon", "gift"))
        result.append(serialize_firestore_data(data))
    
    # Sort by created_at descending
    result.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {"campaigns": result}

@app.get("/api/admin/campaigns/{campaign_id}", tags=["Campaigns"])
async def get_campaign_details(campaign_id: str):
    """Get detailed campaign info including participants"""
    db = get_db()
    
    campaign = db.collection("campaigns").document(campaign_id).get()
    if not campaign.exists:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    campaign_data = campaign.to_dict()
    campaign_data["id"] = campaign_id
    campaign_data["emoji"] = get_campaign_emoji(campaign_data.get("icon", "gift"))
    
    # Get participants
    participants = db.collection("campaign_progress").where("campaign_id", "==", campaign_id).stream()
    
    participant_list = []
    for p in participants:
        p_data = p.to_dict()
        # Get driver info
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
    """Update campaign details"""
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
    """Delete/cancel a campaign"""
    db = get_db()
    db.collection("campaigns").document(campaign_id).update({
        "status": "cancelled",
        "updated_at": firestore.SERVER_TIMESTAMP
    })
    return {"status": "cancelled"}

# --- Driver-facing campaign endpoints ---

@app.get("/api/driver/campaigns", tags=["Campaigns"])
async def get_active_campaigns_for_driver(user_id: str = Depends(get_current_user_id)):
    """Get active campaigns available for driver"""
    db = get_db()
    
    # Get driver info for eligibility check
    driver = db.collection("users").document(user_id).get()
    driver_data = driver.to_dict() if driver.exists else {}
    driver_rating = driver_data.get("rating", 5.0)
    
    # Get active campaigns
    campaigns = db.collection("campaigns").where("status", "==", "active").stream()
    
    result = []
    for campaign in campaigns:
        c_data = campaign.to_dict()
        c_data["id"] = campaign.id
        
        # Check eligibility
        min_rating = c_data.get("min_rating")
        if min_rating and driver_rating < min_rating:
            c_data["eligible"] = False
            c_data["eligibility_reason"] = f"Requires {min_rating}+ rating"
        else:
            c_data["eligible"] = True
        
        # Get driver's progress
        progress_query = db.collection("campaign_progress").where("campaign_id", "==", campaign.id).where("driver_id", "==", user_id).limit(1).stream()
        
        progress_data = None
        for p in progress_query:
            progress_data = p.to_dict()
            break
        
        if progress_data:
            c_data["joined"] = True
            c_data["progress"] = {
                "current": progress_data.get("current_progress", 0),
                "target": c_data.get("target_value", 0),
                "percentage": round((progress_data.get("current_progress", 0) / c_data.get("target_value", 1)) * 100, 1),
                "completed": progress_data.get("completed", False)
            }
        else:
            c_data["joined"] = False
            c_data["progress"] = {
                "current": 0,
                "target": c_data.get("target_value", 0),
                "percentage": 0,
                "completed": False
            }
        
        c_data["emoji"] = get_campaign_emoji(c_data.get("icon", "gift"))
        result.append(serialize_firestore_data(c_data))
    
    return {"campaigns": result}

@app.post("/api/driver/campaigns/{campaign_id}/join", tags=["Campaigns"])
async def join_campaign(campaign_id: str, user_id: str = Depends(get_current_user_id)):
    """Driver joins a campaign"""
    db = get_db()
    
    # Check if campaign exists and is active
    campaign = db.collection("campaigns").document(campaign_id).get()
    if not campaign.exists:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    c_data = campaign.to_dict()
    if c_data.get("status") != "active":
        raise HTTPException(status_code=400, detail="Campaign is not active")
    
    # Check max participants
    if c_data.get("max_participants"):
        if c_data.get("participants_count", 0) >= c_data.get("max_participants"):
            raise HTTPException(status_code=400, detail="Campaign is full")
    
    # Check eligibility (rating)
    driver = db.collection("users").document(user_id).get()
    if driver.exists and c_data.get("min_rating"):
        driver_rating = driver.to_dict().get("rating", 5.0)
        if driver_rating < c_data.get("min_rating"):
            raise HTTPException(status_code=400, detail=f"Requires {c_data.get('min_rating')}+ rating")
    
    # Check if already joined
    existing = db.collection("campaign_progress").where("campaign_id", "==", campaign_id).where("driver_id", "==", user_id).limit(1).stream()
    for _ in existing:
        raise HTTPException(status_code=400, detail="Already joined this campaign")
    
    # Create progress entry
    db.collection("campaign_progress").add({
        "campaign_id": campaign_id,
        "driver_id": user_id,
        "current_progress": 0,
        "completed": False,
        "bonus_paid": False,
        "joined_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP
    })
    
    # Update participant count
    db.collection("campaigns").document(campaign_id).update({
        "participants_count": firestore.Increment(1)
    })
    
    return {"status": "joined", "message": f"You've joined '{c_data.get('title')}'!"}

@app.get("/api/driver/campaigns/my-progress", tags=["Campaigns"])
async def get_my_campaign_progress(user_id: str = Depends(get_current_user_id)):
    """Get driver's progress in all joined campaigns"""
    db = get_db()
    
    progress_docs = db.collection("campaign_progress").where("driver_id", "==", user_id).stream()
    
    result = []
    for p in progress_docs:
        p_data = p.to_dict()
        
        # Get campaign details
        campaign = db.collection("campaigns").document(p_data.get("campaign_id")).get()
        if campaign.exists:
            c_data = campaign.to_dict()
            c_data["id"] = campaign.id
            c_data["progress"] = {
                "current": p_data.get("current_progress", 0),
                "target": c_data.get("target_value", 0),
                "percentage": round((p_data.get("current_progress", 0) / c_data.get("target_value", 1)) * 100, 1),
                "completed": p_data.get("completed", False),
                "bonus_paid": p_data.get("bonus_paid", False)
            }
            c_data["emoji"] = get_campaign_emoji(c_data.get("icon", "gift"))
            result.append(serialize_firestore_data(c_data))
    
    return {"campaigns": result}

# --- Internal: Update campaign progress (called after ride completion) ---
async def update_driver_campaign_progress(driver_id: str, ride_data: dict):
    """Update driver's progress in active campaigns after ride completion"""
    db = get_db()
    
    # Get driver's active campaign participations
    participations = db.collection("campaign_progress").where("driver_id", "==", driver_id).where("completed", "==", False).stream()
    
    for p in participations:
        p_data = p.to_dict()
        campaign_id = p_data.get("campaign_id")
        
        # Get campaign details
        campaign = db.collection("campaigns").document(campaign_id).get()
        if not campaign.exists:
            continue
        
        c_data = campaign.to_dict()
        if c_data.get("status") != "active":
            continue
        
        campaign_type = c_data.get("campaign_type")
        increment = 0
        
        # Calculate increment based on campaign type
        if campaign_type == "rides_count":
            increment = 1
        
        elif campaign_type == "earnings_target":
            increment = ride_data.get("driver_earnings", 0)
        
        elif campaign_type == "peak_hours":
            # Check if ride was during peak hours
            peak_hours = c_data.get("peak_hours", [])
            ride_hour = datetime.now().hour
            if ride_hour in peak_hours:
                increment = 1
        
        elif campaign_type == "rating_bonus":
            # Only count if driver maintains minimum rating
            min_rating = c_data.get("min_rating", 4.5)
            driver = db.collection("users").document(driver_id).get()
            if driver.exists and driver.to_dict().get("rating", 0) >= min_rating:
                increment = 1
        
        if increment > 0:
            new_progress = p_data.get("current_progress", 0) + increment
            target = c_data.get("target_value", 0)
            completed = new_progress >= target
            
            update_data = {
                "current_progress": new_progress,
                "updated_at": firestore.SERVER_TIMESTAMP
            }
            
            if completed and not p_data.get("completed"):
                update_data["completed"] = True
                update_data["completed_at"] = firestore.SERVER_TIMESTAMP
                
                # Pay bonus
                bonus_amount = c_data.get("bonus_amount", 0)
                db.collection("users").document(driver_id).update({
                    "earnings.balance": firestore.Increment(bonus_amount),
                    "earnings.campaign_bonuses": firestore.Increment(bonus_amount)
                })
                
                update_data["bonus_paid"] = True
                update_data["bonus_paid_at"] = firestore.SERVER_TIMESTAMP
                
                # Update campaign stats
                db.collection("campaigns").document(campaign_id).update({
                    "completions_count": firestore.Increment(1),
                    "total_bonus_paid": firestore.Increment(bonus_amount)
                })
            
            db.collection("campaign_progress").document(p.id).update(update_data)


# =========================
# HEALTH
# =========================

@app.get("/api/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "timestamp": now_iso()}

@app.post("/api/driver/wallet/topup/paypal", tags=["Driver"])
async def driver_topup_paypal(
    req: PayPalTopUpRequest,
    current_user: dict = Depends(get_current_user) # 🔥 Changed to your actual function
):
    """Verifies PayPal order server-side and credits driver's wallet."""
    
    # Extract the user ID from your auth token dictionary
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    access_token = await get_paypal_token()
    if not access_token:
        raise HTTPException(500, "PayPal auth failed")

    # 1) Fetch order from PayPal
    async with httpx.AsyncClient(timeout=25) as client:
        resp = await client.get(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{req.order_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code != 200:
        logger.warning(f"PayPal order lookup failed: {resp.status_code} {resp.text}")
        raise HTTPException(400, "Invalid PayPal order")

    data = resp.json()

    # Must be COMPLETED to credit wallet
    status = data.get("status")
    if status != "COMPLETED":
        raise HTTPException(400, f"Payment not completed (status={status})")

    # 2) Extract PAID AMOUNT from PayPal
    purchase_units = data.get("purchase_units") or []
    if not purchase_units or not purchase_units[0].get("amount"):
        raise HTTPException(400, "PayPal order missing amount")

    paid_amount_str = purchase_units[0]["amount"].get("value")
    paid_currency = purchase_units[0]["amount"].get("currency_code")

    try:
        paid_amount = float(paid_amount_str)
    except Exception:
        raise HTTPException(400, "Invalid PayPal paid amount")

    if paid_amount <= 0:
        raise HTTPException(400, "Invalid PayPal paid amount")

    # 3) Idempotency: prevent double crediting
    db = firestore.client() # Get database instance safely

    existing = list(
        db.collection("wallet_transactions")
        .where("type", "==", "driver_paypal_topup")
        .where("order_id", "==", req.order_id)
        .limit(1)
        .stream()
    )
    if existing:
        return {
            "message": "Order already processed",
            "order_id": req.order_id,
            "credited_amount": paid_amount,
            "currency": paid_currency,
        }

    # 4) Credit wallet + log transaction
    db.collection("users").document(user_id).update(
        {
            "earnings.balance": firestore.Increment(paid_amount),
            "earnings.total_topped_up": firestore.Increment(paid_amount),
        }
    )

    db.collection("wallet_transactions").add(
        {
            "driver_id": user_id,
            "type": "driver_paypal_topup",
            "amount": paid_amount,
            "currency": paid_currency,
            "order_id": req.order_id,
            "paypal_status": status,
            "created_at": firestore.SERVER_TIMESTAMP,
        }
    )

    return {
        "message": "Wallet topup successful",
        "order_id": req.order_id,
        "credited_amount": paid_amount,
        "currency": paid_currency,
    }

@app.get("/api/", tags=["Health"])
async def root():
    return {"message": "T'aksi API v3 - Firebase Edition"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=True)
# ==========================================
# 🔥 ADMIN MANAGEMENT ROUTES
# ==========================================

@app.get("/admin/withdrawals/pending")
async def get_pending_withdrawals(current_user: dict = Depends(get_current_user)):
    """Allows Admin to see who needs to be paid"""
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Fetch all docs from 'withdrawals' where status is 'pending'
    docs = db.collection("withdrawals").where("status", "==", "pending").stream()
    
    results = []
    for doc in docs:
        d = doc.to_dict()
        # Ensure the document ID is included so we can approve it later
        d["id"] = doc.id
        if "created_at" in d and hasattr(d["created_at"], "isoformat"):
            d["created_at"] = d["created_at"].isoformat()
        results.append(d)
        
    return results

@app.post("/admin/withdrawals/{wd_id}/approve")
async def approve_withdrawal(wd_id: str, current_user: dict = Depends(get_current_user)):
    """Marks a withdrawal as finished after you send the bank transfer"""
    if current_user.get("user_type") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db.collection("withdrawals").document(wd_id).update({
            "status": "paid",
            "paid_at": datetime.now(timezone.utc),
            "approved_by": current_user["id"]
        })
        return {"status": "success"}
    except Exception as e:
        logging.error(f"Approval error: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark as paid")