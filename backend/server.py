import logging, math, os, asyncio, base64, json, re, shutil, uuid, bcrypt, jwt, httpx
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Request
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()
app = FastAPI(title="T'aksi API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

if not firebase_admin._apps:
    firebase_admin.initialize_app()

def get_db(): return firestore.client()

# --- RIDE ENGINE (FIXED STOPS & WAIT TIME) ---

@app.post("/api/rides/{ride_id}/arrive-at-stop")
async def arrive_at_stop(ride_id: str, stop_index: int):
    # Logs when the driver reaches a mid-trip stop to start the timer
    get_db().collection("rides").document(ride_id).update({
        f"stops.{stop_index}.arrived_at": datetime.now(timezone.utc),
        "current_stop_index": stop_index,
        "waiting_on_stop": True
    })
    return {"status": "success", "start_time": datetime.now(timezone.utc)}

@app.post("/api/rides/{ride_id}/continue-from-stop")
async def continue_trip(ride_id: str, stop_index: int):
    # Calculates wait time and resumes trip
    db = get_db()
    ride_ref = db.collection("rides").document(ride_id)
    ride = ride_ref.get().to_dict()
    
    arrived_at = ride['stops'][stop_index].get('arrived_at')
    if arrived_at:
        wait_duration = (datetime.now(timezone.utc) - arrived_at).total_seconds() / 60
        wait_charge = round(wait_duration * 0.40, 2)
        
        # Add to total fare
        new_fare = ride.get("final_fare", ride.get("estimated_fare", 0)) + wait_charge
        ride_ref.update({
            f"stops.{stop_index}.completed_at": datetime.now(timezone.utc),
            f"stops.{stop_index}.wait_charge": wait_charge,
            "final_fare": new_fare,
            "waiting_on_stop": False
        })
        return {"status": "success", "wait_charge": wait_charge}
    return {"status": "error", "message": "No arrival time found"}

# Rest of your existing routes (login, search, etc.) follow...
