# T'aksi Galactic - Product Requirements Document

## Overview
T'aksi Galactic is a premium ride-sharing application for the Georgian market, designed to compete with and exceed Bolt's user experience.

## Original Problem Statement
User had existing T'aksi codebase and wanted to:
1. Build iOS application support
2. Implement UI/UX enhancements with premium design
3. Fix i18n to work across entire app (not just landing page)
4. Add in-app chat between riders/drivers with auto-translate
5. Add AI chatbot for support with escalation to admin
6. Add all missing features to compete with Bolt/Uber

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS + Framer Motion
- **Backend**: FastAPI + Python
- **Database**: Firebase Firestore
- **AI**: Gemini 3 Flash (via emergentintegrations)
- **Mobile**: Capacitor (iOS & Android)
- **Maps**: Google Maps API
- **Payments**: PayPal integration

## User Personas
1. **Riders**: Georgian citizens seeking premium ride-hailing experience
2. **Drivers (Pilots)**: Individuals looking for flexible income opportunities
3. **Admins**: Platform operators managing users, approvals, support, and withdrawals

## Core Features

### Rider Portal
- Book rides with pickup, destination, and up to 3 stops
- Real-time driver tracking
- Multiple vehicle classes (Economy, Comfort, Premium, XL, Luxury)
- Surge pricing visibility
- Cash and card payment options
- Ride history
- **NEW**: Favorite locations (Home, Work, etc.)
- **NEW**: Scheduled rides (book for later)
- **NEW**: Share trip with friends/family
- **NEW**: Rate driver with tags and tips
- **NEW**: SOS emergency button
- **NEW**: AI support chat

### Driver Portal  
- Go online/offline status
- Accept/reject ride requests
- Turn-by-turn navigation
- Earnings wallet with top-up and withdrawal
- Vehicle registration and document upload
- Cancellation with reason tracking
- **NEW**: Rate riders with tags
- **NEW**: In-app chat with auto-translate
- **NEW**: Trip receipts
- **NEW**: SOS emergency button

### Admin Portal
- Overview dashboard with stats
- Driver approval workflow
- Withdrawal request management
- User management
- **NEW**: Support ticket management with AI escalation
- **NEW**: Active SOS alert monitoring and resolution
- **NEW**: Escalated ticket queue

### AI Features (Gemini 3 Flash)
- **Auto-translate chat**: Real-time translation between rider and driver
- **Support chatbot**: Handles FAQ, trip issues, payment questions
- **Smart escalation**: AI identifies urgent issues and escalates to admin

---

## What's Been Implemented

### Session 1 - Feb 19, 2026

#### iOS App Capability
- [x] Configured Capacitor for iOS and Android builds
- [x] Added native plugins: Geolocation, Push Notifications, Splash Screen, Status Bar
- [x] Created iOS build script at `/app/frontend/scripts/build-ios.sh`
- [x] Updated `capacitor.config.json` with proper iOS/Android settings

#### UI/UX Enhancements (Cyber-Noir Luxury Theme)
- [x] Updated Tailwind config with premium design tokens
- [x] Implemented glassmorphism card effects
- [x] Applied Clash Display font for headings, Manrope for body
- [x] Neon glow effects (cyan #00d4ff, green #00ff88)
- [x] Dark background with premium depth layering
- [x] Mobile-first responsive design

#### i18n Fix (Full Translation Support)
- [x] Extended translations for all portals (Rider, Driver, Admin)
- [x] Added language selector to auth pages
- [x] 8 languages supported: Georgian, English, Russian, Hindi, Chinese, Dutch, French, German

### Session 2 - Feb 19, 2026

#### In-App Chat with Auto-Translate
- [x] Backend translation endpoint `/api/translate`
- [x] Chat translation endpoint `/api/rides/{ride_id}/chat/translate`
- [x] Gemini 3 Flash integration via emergentintegrations

#### AI Support Chatbot
- [x] Support message endpoint `/api/support/message`
- [x] Smart categorization (FAQ, trip, payment, safety, etc.)
- [x] Automatic escalation for urgent issues
- [x] Support history endpoint `/api/support/history`
- [x] SupportChatWidget component (floating button)

#### Admin Support Panel
- [x] AdminSupportPanel component with ticket management
- [x] SOS alert monitoring
- [x] Ticket filtering (escalated, in_progress, resolved, ai_handled)
- [x] Admin response and resolution workflow
- [x] Added Support tab to Admin portal

#### Driver Campaigns System
- [x] Campaign CRUD endpoints (create, read, update, delete)
- [x] 6 Pre-built campaign templates:
  - Weekend Warrior (20 rides = ₾30 bonus)
  - Rush Hour Hero (10 peak rides = ₾25)
  - 5-Star Excellence (50 rated rides = ₾40)
  - 7-Day Streak (daily rides = ₾50)
  - Earnings Milestone (₾500 = ₾35 bonus)
  - Welcome Bonus (first 25 rides = ₾75)
- [x] Campaign types: rides_count, earnings_target, peak_hours, rating_bonus, streak, new_driver
- [x] Admin campaigns panel with:
  - Create custom campaigns
  - Quick templates
  - Campaign filtering (active/paused/completed/cancelled)
  - Participant tracking
  - Pause/resume campaigns
- [x] Driver campaign participation endpoints
- [x] Automatic progress tracking after ride completion
- [x] Auto-bonus payout when target reached

#### Rating System
- [x] Rating tags (positive and negative)
- [x] Driver rating endpoint with tags
- [x] Rider rating endpoint with tags
- [x] RatingModal component with star rating, tags, and tips
- [x] Average rating calculation and storage

#### SOS Emergency
- [x] SOS trigger endpoint `/api/sos`
- [x] Active SOS alerts endpoint `/api/admin/sos/active`
- [x] SOS resolution endpoint
- [x] SOSButton component with countdown confirmation

#### Share Trip
- [x] Share trip endpoint `/api/rides/{ride_id}/share`
- [x] Public tracking endpoint `/api/track/{ride_id}`
- [x] ShareTripModal component with WhatsApp, SMS, Email sharing

#### Favorite Locations
- [x] CRUD endpoints for favorites
- [x] FavoriteLocations component with icons
- [x] Geocoding integration

#### Scheduled Rides
- [x] Schedule ride endpoint
- [x] Get scheduled rides endpoint
- [x] Cancel scheduled ride endpoint

#### Referral System
- [x] Get/generate referral code endpoint
- [x] Apply referral code endpoint
- [x] Bonus calculation (₾5 referrer, ₾3 referee)

#### Driver Tips
- [x] Add tip endpoint
- [x] Tip integration in RatingModal

#### Trip Receipts
- [x] Detailed receipt endpoint with fare breakdown

---

## Backlog (Prioritized)

### P0 - Critical (For Launch)
- [ ] Push notifications implementation (FCM integration)
- [ ] SMS verification for phone numbers
- [ ] Real payment processing (Stripe/PayPal live)

### P1 - High Priority
- [ ] In-app voice messages
- [ ] Driver incentives/bonuses
- [ ] Promo codes and discount system
- [ ] Driver document verification workflow

### P2 - Medium Priority
- [ ] Dark/light theme toggle
- [ ] Multi-currency support
- [ ] Trip splitting (share fare with friends)
- [ ] Corporate accounts

### P3 - Nice to Have
- [ ] Accessibility improvements (WCAG 2.1)
- [ ] Performance optimization (code splitting)
- [ ] Offline mode for drivers
- [ ] Advanced analytics dashboard

---

## API Endpoints Added

### AI & Chat
- `POST /api/translate` - Translate text
- `POST /api/rides/{ride_id}/chat/translate` - Send translated chat

### Support
- `POST /api/support/message` - Send support message (AI responds)
- `GET /api/support/history` - Get support ticket history
- `GET /api/admin/support/tickets` - Get tickets (filterable)
- `GET /api/admin/support/tickets/escalated` - Get escalated tickets
- `POST /api/admin/support/tickets/{id}/respond` - Admin response
- `POST /api/admin/support/tickets/{id}/resolve` - Resolve ticket

### Rating
- `GET /api/rating/tags` - Get available tags
- `POST /api/rides/{id}/rate/driver` - Rate driver with tags
- `POST /api/rides/{id}/rate/rider` - Rate rider with tags

### Safety
- `POST /api/sos` - Trigger SOS
- `GET /api/admin/sos/active` - Get active SOS alerts
- `POST /api/admin/sos/{id}/resolve` - Resolve SOS

### Sharing
- `POST /api/rides/{id}/share` - Generate share link
- `GET /api/track/{id}` - Public ride tracking

### Favorites
- `GET /api/user/favorites` - Get saved places
- `POST /api/user/favorites` - Add saved place
- `DELETE /api/user/favorites/{id}` - Remove saved place

### Scheduled Rides
- `POST /api/rides/schedule` - Schedule ride
- `GET /api/rides/scheduled` - Get scheduled rides
- `DELETE /api/rides/scheduled/{id}` - Cancel scheduled ride

### Referrals
- `GET /api/user/referral` - Get referral code
- `POST /api/user/referral/apply` - Apply referral code

### Tips & Receipts
- `POST /api/rides/{id}/tip` - Add tip
- `GET /api/rides/{id}/receipt` - Get trip receipt

---

## Next Steps
1. **iOS Deployment**: Run build script on Mac, configure signing, submit to App Store
2. **Android Build**: `npx cap sync android && npx cap open android`
3. **Push Notifications**: Integrate Firebase Cloud Messaging
4. **Production Deployment**: Set up production Firebase project and payment credentials

---

## Technical Notes
- Backend runs on port 8001, frontend on 3000
- Firebase service account at `/app/backend/firebase-service-account.json`
- All API routes prefixed with `/api/`
- Hot reload enabled for both frontend and backend
- Emergent LLM key used for AI features
