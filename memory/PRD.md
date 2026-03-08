# T'aksi - Galactic Ride-Hailing Application PRD

## Project Overview
**Name**: T'aksi (თ'აქსი)  
**Tagline**: "Your Ride Across the Galaxy"  
**Type**: Full-stack ride-hailing application  
**Stack**: React (Vite) + FastAPI + Firebase Firestore  
**Date**: March 8, 2026

---

## Original Problem Statement
Build a premium ride-hailing application better than Bolt, Uber, Yandex, and Maxim with:
1. Waze-style auto-rotating maps that face direction of travel
2. Smoother ride animations for rider and driver
3. Less cramped driver screen with clean maps
4. Smooth PayPal card vaulting
5. Full multi-language support (12 languages)
6. Real-time ride tracking for passengers
7. Firebase database integration

---

## User Personas

### Rider
- Books rides via phone app
- Tracks driver in real-time
- Pays via PayPal card vault
- Multi-language support

### Driver (Pilot)
- Accepts ride requests
- Uses navigation HUD while driving
- Manages earnings and withdrawals
- Real-time location broadcasting

### Admin
- Manages fleet and drivers
- Views analytics and earnings
- Handles support tickets

---

## Core Requirements (Static)

### Map Navigation
- [x] Auto-rotate map to face direction of travel
- [x] Smooth 55° tilt for immersive driving view
- [x] Compact and full HUD toggle modes
- [x] Smooth heading animation with lerp interpolation
- [x] External navigation to Waze/Google Maps

### Driver Experience
- [x] DriverSmartMap with smooth position animation
- [x] Compact NavHUD with turn-by-turn directions
- [x] ETA countdown timer
- [x] Speed indicator (km/h)
- [x] Re-center button when user pans away
- [x] HUD size toggle (compact/full)

### Rider Experience
- [x] RiderMap with smooth driver marker animation
- [x] Real-time driver tracking during active ride
- [x] Pulse animation during driver search
- [x] Route preview during booking

### Payment (PayPal)
- [x] Card vaulting with PayPal SDK
- [x] Multiple cards support
- [x] Set default card
- [x] Skeleton loading states
- [x] Animated success/error feedback

### Multi-language (i18n)
- [x] Georgian (ქართული) - Default
- [x] English
- [x] Russian (Русский)
- [x] Hindi (हिंदी)
- [x] Chinese (中文)
- [x] Dutch (Nederlands)
- [x] French (Français)
- [x] German (Deutsch)
- [x] Polish (Polski)
- [x] Afrikaans
- [x] isiZulu
- [x] isiXhosa

---

## What's Been Implemented (March 8, 2026)

### PWA Audit Fixes (Based on Report Guide)
- **Security Headers**: Added `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Content-Security-Policy`
- **robots.txt**: Updated with proper directives for public/login-gated sections
- **manifest.webmanifest**: PWA manifest with proper icons, shortcuts, theme colors
- **HTML Meta Tags**: Added description, Open Graph, Twitter Card meta tags
- **Offline Fallback**: offline.html page for service worker
- **Noscript Fallback**: Added for JavaScript-disabled browsers

### Map Improvements
- **DriverSmartMap**: 
  - Smooth marker position interpolation with requestAnimationFrame
  - Auto-rotate map heading using animateHeading with smooth lerp (0.08 easing)
  - 55° immersive tilt angle
  - Compact HUD mode toggle for cleaner driving view
  - Modern SVG driver arrow with glow effect
  
- **RiderMap**:
  - Smooth driver marker animation during active ride (400ms ease-out)
  - Better car icon sizing (40x40)

### UI/UX Improvements
- **NavHUD**: 
  - Compact mode with smaller turn indicator
  - Inline speed display
  - Minimal "then" preview for next turn
  
- **PaymentMethodManager**:
  - Gradient brand badges with hover effects
  - Skeleton loading for cards
  - Animated success/error states with slide-in
  - Modern card styling with transform effects

### Map Styles
- Updated to modern dark theme
- Removed POI clutter for cleaner navigation
- Transit hidden for driving focus

---

## Prioritized Backlog

### P0 - Critical (Done)
- [x] Map auto-rotation
- [x] Smooth marker animation
- [x] Multi-language support

### P1 - Important
- [ ] Fix language persistence on navigation
- [ ] Add turn-by-turn voice guidance (optional)
- [ ] Improve route preview styling

### P2 - Nice to Have
- [ ] Offline map caching
- [ ] Night mode map style
- [ ] Driver rating animations
- [ ] Ride history export

---

## Technical Architecture

```
/app
├── backend/
│   ├── server.py          # FastAPI main server (4000+ lines)
│   ├── firebase-service-account.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── DriverPortal.jsx    # Driver app with SmartMap
│   │   │   ├── RiderPortal.jsx     # Rider app
│   │   │   ├── Ridermap.jsx        # Rider map component
│   │   │   ├── Paymentmethodmanager.jsx
│   │   │   └── maps/
│   │   │       └── LiveTrackingMap.jsx
│   │   ├── i18n/
│   │   │   ├── translations.js     # 12 languages
│   │   │   └── LanguageContext.jsx
│   │   └── config.jsx
│   └── .env
└── memory/
    └── PRD.md
```

---

## Environment Configuration

### Frontend (.env)
```
VITE_GOOGLE_MAPS_API_KEY=AIzaSyAAenq7Dyy1R8tS49JxKf70Nxtf5es4QJ4
VITE_PAYPAL_CLIENT_ID=AR1tgXOIjqZQ7hObQi8NFV1VnInwSH4IO9K8mVrzv4Bl3ZgFWb8Rz9W9EvP1ZHf0pkUGR-EgAfrsqNR0
VITE_USE_LOCALSTORAGE_FALLBACK=true
```

### Backend (.env)
```
JWT_SECRET=wP8zK2mR5vX9nQ3bL1sJ7fT4hY6uG0vE
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
FIREBASE_STORAGE_BUCKET=t-aksi-eu.firebasestorage.app
```

---

## Next Action Items

1. **Language Persistence**: Store selected language in localStorage and persist across navigation
2. **Driver Dashboard Analytics**: Add earnings charts and ride statistics
3. **Push Notifications**: Implement Firebase Cloud Messaging for ride alerts
4. **Surge Pricing**: Real-time demand-based pricing indicators

---

## Enhancement Ideas

- **Revenue**: Implement ride passes / subscription tiers for frequent riders
- **Engagement**: Add referral rewards with shareable promo codes
- **Experience**: Scheduled rides booking in advance
