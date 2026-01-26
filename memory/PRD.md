# T'aksi Galactic - Product Requirements Document

## Overview
T'aksi is a ride-sharing platform in Georgia with three portals: Rider, Driver, and Admin. Features real-time GPS tracking, map-based location selection, multi-stop rides, surge pricing, and dynamic fare calculation.

## Tech Stack
- **Frontend:** React 19, TailwindCSS, ShadCN UI, Google Maps API
- **Backend:** FastAPI (Python) with Firebase Admin SDK
- **Database:** Firebase Firestore
- **Authentication:** JWT with bcrypt
- **Maps:** Google Maps Places & Directions API

## Features Implemented (Jan 25, 2026)

### 1. Authentication ✅
- Rider/Driver registration & login
- JWT token-based auth
- Phone number as unique identifier

### 2. Location & Maps ✅
- **Map Picker:** Click on map to select location
- **Address Autocomplete:** Google Places autocomplete on all location inputs
- **Current Location:** "Use My Location" button with GPS
- **Route Calculation:** Automatic distance & time via Google Directions API
- **Live Map:** Real-time driver position during active ride

### 3. Multi-Stop Rides ✅
- Add up to 3 stops per trip
- Each stop adds fee (₾1-2 depending on car type)
- Stop wait time is fully billable

### 4. Real-Time Driver Tracking ✅
- GPS position updated every 5 seconds when online
- Heading and speed tracked
- Live map shows driver position during ride
- Distance automatically calculated during trip

### 5. Dynamic Fare Calculation ✅
```
Base fare + Distance fee + Wait fees + Stop fees × Surge Multiplier

economy:  ₾2.00 + ₾0.50/km + ₾0.40/min (after 2 free) + ₾1.00/stop
comfort:  ₾2.50 + ₾0.55/km + ₾0.45/min (after 2 free) + ₾1.50/stop
suv:      ₾3.90 + ₾0.80/km + ₾0.50/min (after 2 free) + ₾2.00/stop
personal: ₾4.00 + ₾0.70/km + ₾0.50/min (after 3 free) + ₾1.50/stop
jumpstart: ₾4.50 flat

Long distance (>7km): +₾0.15-0.25/km extra
Very long (>30km): +₾5-8 per 15km block
```

### 6. Surge Pricing ✅ (NEW)
- **Schedule:** Wednesday, Friday, Saturday nights
- **Wednesday:** 18:00 - 02:00 (Georgia Time)
- **Friday & Saturday:** 18:00 - 04:00 (Georgia Time)
- **Multipliers:** x1.2, x1.5, x1.8, x2.0
- **Dynamic Commission:**
  - x1.0: 23.0%
  - x1.2: 23.2%
  - x1.5: 23.5%
  - x1.8: 23.8%
  - x2.0: 24.0%

### 7. Driver Flow ✅
1. Go online → GPS tracking starts
2. See available rides with distance to pickup
3. Accept ride → Commission deducted (23-24% based on surge)
4. Navigate to pickup (map shows route)
5. Mark "Arrived" → wait timer starts
6. Start trip → distance tracking begins
7. Complete → final fare calculated

### 8. Bolt-Style Matching ✅ (ENHANCED)
**Radius Expansion Algorithm:**
- Stage 1: 3km radius, notify 5 closest drivers, wait 30s
- Stage 2: 5km radius, notify 5 more drivers, wait 25s
- Stage 3: 8km radius, notify 8 more drivers, wait 20s
- Stage 4: 12km radius, notify 10 more drivers, wait 15s
- Stage 5: 20km radius, notify 15 more drivers, wait 15s
- Stage 6: 30km radius, notify 20 more drivers, wait 15s

**Driver Selection Criteria:**
- Must be online and approved
- Must have sufficient balance for commission
- Must not have declined the ride
- Sorted by distance (closest first)

**Driver Discovery Features:**
- **Available Rides:** Only shows rides where driver was specifically notified
- **Nearby Rides Tab:** Discover all rides within custom radius (5-30km)
- **Request to Join:** Request to accept rides not directly notified about
- **Retry Matching:** Riders can retry search when no drivers available

### 9. Admin Features ✅
- Dashboard with live stats
- Add/deduct balance for any user
- Approve/reject driver registrations
- Approve/reject top-up requests
- Approve/reject withdrawals

## API Endpoints

### New Endpoints (Jan 25, 2026)
- `GET /api/surge/status?lat=X&lng=Y` - Get current surge status
- `GET /api/driver/rides/nearby?radius=X` - Discover nearby rides (Bolt-style)
- `POST /api/rides/{id}/request-join` - Request to accept a ride not notified about
- `POST /api/rides/{id}/retry` - Retry driver matching for no_drivers rides
- `GET /api/rides/estimate?car_type=X&distance=Y&stops=Z&lat=A&lng=B` - Fare estimate with surge

### Existing Endpoints
- `POST /api/driver/location` - Update driver GPS
- `POST /api/rides/{id}/update-tracking` - Update ride with driver position
- `POST /api/rides/{id}/stop-reached` - Mark stop completed
- `POST /api/rides/{id}/complete?final_distance=X&total_wait_minutes=Y` - Complete ride

## Test Results (Jan 25, 2026)
- Backend: 100% pass rate (27/27 tests)
- Frontend: 100% pass rate

## Credentials
- **Admin Password:** `D'Ahl-Enterprise9409145169086`
- **Payment Link:** `https://egreve.bog.ge//Taksi`
- **Google Maps API Key:** `AIzaSyB3Sx7MOC6eSo7or6lUIHGXjCSJRr4pNZo`

## Firebase Indexes Needed
Create these composite indexes in Firebase Console:
1. rides: userId ASC, created_at DESC
2. rides: driver_id ASC, created_at DESC
3. rides: driver_id ASC, status ASC

## Upcoming Tasks (P1)
- Push notifications for new rides
- In-app chat between rider/driver
- Rating system after ride
- Driver document upload verification

## Backlog (P2)
- WebSocket for real-time updates
- Promo codes
- Corporate accounts
- Refine surge pricing zones
