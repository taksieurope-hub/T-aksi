import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import api from "@/api";
import { useLanguage } from "@/i18n/LanguageContext";
import LanguageSelector from "@/i18n/LanguageSelector";
import { DriverTripCompletionModal } from "@/components/TripCompletionModal";
import { auth } from "../lib/firebase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RideCommunication from "./RideCommunication";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Car, MapPin, Star, History, Home, LogOut, User,
  Phone, Lock, ArrowLeft, Navigation, Wallet, Loader2, Rocket,
  Plus, X, Zap, TrendingUp, MessageSquare,
  Target, Crosshair, Send,
  Banknote, CreditCard, ExternalLink, AlertTriangle, Activity,
  MapPinned, CheckCircle2, XCircle, Play, Timer, PauseCircle
} from "lucide-react";

// Pricing Rules (Needed for Wait Timer & Earning Calculations)
const PRICING_RULES = {
  economy: { name: 'Economy', base: 2.80, perKm: 0.50, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "🚗" },
  comfort: { name: 'Comfort', base: 3.38, perKm: 0.55, perMinWait: 0.45, freeWait: 2, stopFee: 0.00, icon: "🚙" },
  suv: { name: 'SUV / XL', base: 5.18, perKm: 0.80, perMinWait: 0.50, freeWait: 2, stopFee: 0.00, icon: "🚐" },
  personal: { name: 'Personal', base: 5.12, perKm: 0.70, perMinWait: 0.50, freeWait: 2, stopFee: 0.00, icon: "👤" },
  jumpstart: { name: 'Jumpstart', base: 4.50, perKm: 0.00, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "⚡" }
};

const DRIVER_COMMISSION_RATE = 0.23;
const PAYMENT_LINK = "https://egreve.bog.ge//Taksi";
const LOCATION_UPDATE_INTERVAL = 2000; // 2 seconds

const CANCEL_REASONS = {
  accepted: [ 
    "Heavy Traffic / Stuck", "Car Trouble / Mechanical Issue", 
    "Accidentally Accepted", "Cannot Locate Pickup Address", "Personal Emergency" 
  ],
  arrived: [ 
    "Client Not Showing Up (Timer Expired)", "Client Refused Ride", 
    "Too Much Luggage / Cargo", "Unaccompanied Minor", "No Mask / Safety Concern" 
  ],
  in_progress: [ 
    "Client Requested Early End", "Client Behavior / Rude", 
    "Safety Concern", "Wrong Destination", "Vehicle Breakdown" 
  ]
};

// --- DRIVER WAIT TIMER COMPONENT ---
const DriverWaitTimer = ({ arrivedAt, carType }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = arrivedAt ? new Date(arrivedAt).getTime() : Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [arrivedAt]);

  const rules = PRICING_RULES[carType?.toLowerCase()] || PRICING_RULES.economy;
  const freeWaitSeconds = rules.freeWait * 60; 

  if (elapsed <= freeWaitSeconds) {
    const remaining = freeWaitSeconds - elapsed;
    const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
    const secs = (remaining % 60).toString().padStart(2, '0');
    
    return (
      <div className="bg-blue-500/20 border border-blue-500 p-4 rounded-xl flex items-center justify-between col-span-2">
        <div className="flex items-center text-blue-400">
          <Timer className="w-5 h-5 mr-2 animate-pulse" /> 
          <span className="font-medium">Free Wait Time</span>
        </div>
        <div className="text-right">
          <div className="text-blue-400 font-mono text-xl font-bold">{mins}:{secs}</div>
          <div className="text-blue-400/70 text-[10px] uppercase font-bold tracking-wider">Remaining</div>
        </div>
      </div>
    );
  } else {
    const overtime = elapsed - freeWaitSeconds;
    const mins = Math.floor(overtime / 60).toString().padStart(2, '0');
    const secs = (overtime % 60).toString().padStart(2, '0');
    const liveEarnings = ((overtime / 60) * rules.perMinWait).toFixed(2);
    
    return (
      <div className="bg-[#00ff88]/20 border border-[#00ff88] p-4 rounded-xl flex items-center justify-between shadow-[0_0_15px_rgba(0,255,136,0.2)] col-span-2">
        <div className="flex items-center text-[#00ff88]">
          <Timer className="w-5 h-5 mr-2 animate-pulse" /> 
          <span className="font-medium">Paid Wait Time</span>
        </div>
        <div className="text-right">
          <div className="text-[#00ff88] font-mono text-xl font-bold">{mins}:{secs}</div>
          <div className="text-[#00ff88] font-bold text-sm">Earned: +₾{liveEarnings}</div>
        </div>
      </div>
    );
  }
};

// Driver Auth Component
const DriverAuth = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", surname: "", cellphone: "", password: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register/driver";
      const res = await api.post(endpoint, formData);
      if (res.data && res.data.token && res.data.user) {
        login(res.data.token, res.data.user);
        toast.success(isLogin ? t('welcome_back') : t('success'));
        navigate("/driver/dashboard");
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      const msg = error.response?.data?.detail || error.message || t('error');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md glass-heavy" data-testid="driver-auth-card">
        <CardHeader className="text-center relative">
          <div className="absolute right-4 top-4">
            <LanguageSelector variant="ghost" />
          </div>
          <Button variant="ghost" className="absolute left-4 top-4 text-primary hover:text-white" onClick={() => navigate("/")} data-testid="driver-back-btn">
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('back')}
          </Button>
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center mx-auto mb-4 mt-8">
            <Car className="w-10 h-10 text-black" />
          </div>
          <CardTitle className="text-2xl text-primary font-heading">
            {isLogin ? t('pilot_login') : t('become_pilot_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-primary">{t('first_name')}</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="bg-background-secondary border-border text-white" required data-testid="driver-name-input" />
                </div>
                <div className="space-y-2">
                  <Label className="text-primary">{t('last_name')}</Label>
                  <Input value={formData.surname} onChange={e => setFormData({...formData, surname: e.target.value})} className="bg-background-secondary border-border text-white" required data-testid="driver-surname-input" />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-primary">{t('phone_number')}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-primary/50" />
                <Input type="tel" value={formData.cellphone} onChange={e => setFormData({...formData, cellphone: e.target.value})} className="pl-10 bg-background-secondary border-border text-white" placeholder="+995 XXX XXX XXX" required data-testid="driver-phone-input" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-primary">{t('password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-primary/50" />
                <Input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="pl-10 bg-background-secondary border-border text-white" required data-testid="driver-password-input" />
              </div>
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-primary to-secondary text-black font-bold hover:shadow-neon-cyan transition-all" disabled={loading} data-testid="driver-auth-submit">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isLogin ? t('sign_in') : t('register_driver')}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="link" className="text-secondary" onClick={() => setIsLogin(!isLogin)} data-testid="driver-auth-toggle">
            {isLogin ? t('need_account') : t('have_account')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// Real-time Location Tracker Hook
const useLocationTracker = (isOnline, onLocationUpdate) => {
  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastLocationRef = useRef(null);

  useEffect(() => {
    if (!isOnline) {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed
        };
        lastLocationRef.current = location;
      },
      (error) => { console.error("Location error:", error); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    intervalRef.current = setInterval(() => {
      if (lastLocationRef.current) {
        onLocationUpdate(lastLocationRef.current);
      }
    }, LOCATION_UPDATE_INTERVAL);

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOnline, onLocationUpdate]);

  return lastLocationRef;
};

// Google Maps Autocomplete
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {
  const callbackRef = useRef(onPlaceSelect);
  useEffect(() => { callbackRef.current = onPlaceSelect; }, [onPlaceSelect]);

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .pac-container { z-index: 10500 !important; background-color: #1a1a2e; border: 1px solid #00ff88; font-family: inherit; }
      .pac-item { color: white; border-top: 1px solid #333; padding: 10px; cursor: pointer; }
      .pac-item:hover { background-color: #333; }
      .pac-item-query { color: #00ff88; font-weight: bold; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (inputRef.current && window.google && window.google.maps && window.google.maps.places) {
        clearInterval(timer);
        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'ge' },
          fields: ['formatted_address', 'geometry', 'name']
        });
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.geometry) {
            callbackRef.current({
              address: place.formatted_address || place.name,
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            });
          }
        });
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);
};

// 🔥 UPGRADED: Driver Map (Full Screen, Custom Zoom, Turn-by-Turn Navigation)
const DriverSmartMap = ({ activeRide, driverLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const routeRendererRef = useRef(null);
  const directionsServiceRef = useRef(null);

  const [isFollowing, setIsFollowing] = useState(true);
  
  // --- TURN-BY-TURN NAVIGATION STATE ---
  const [routeSteps, setRouteSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const getSafeCoord = (val) => { const num = parseFloat(val); return !isNaN(num) && num !== 0 ? num : null; };

  // Helper for turn-by-turn distance matching
  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
      const R = 6371; 
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  };

  // 1. Initialize Map
  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 41.7151, lng: 44.8271 },
        zoom: 17,
        disableDefaultUI: true, // Hides default tiny buttons
        zoomControl: false, 
        gestureHandling: "greedy", // Allows 1-finger panning on mobile
        backgroundColor: '#ffffff',
        styles: [
          { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
          { elementType: "labels.icon", stylers: [{ visibility: "off" }] }, 
          { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
          { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
          { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#e9e9e9" }] }
        ]
      });

      // Pause auto-follow if the driver pans the map manually
      mapInstanceRef.current.addListener("dragstart", () => setIsFollowing(false));

      routeRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: false,
        polylineOptions: { strokeColor: "#00ff88", strokeWeight: 6 },
        preserveViewport: true
      });

      directionsServiceRef.current = new window.google.maps.DirectionsService();
    }
  }, []);

  // 2. Update Driver Marker & Turn-by-Turn Logic
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation) return;

    const lat = getSafeCoord(driverLocation.lat);
    const lng = getSafeCoord(driverLocation.lng);
    const heading = parseFloat(driverLocation.heading) || 0;

    if (!lat || !lng) return;
    const pos = { lat, lng };

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6, fillColor: "#00d4ff", fillOpacity: 1, strokeColor: "white", strokeWeight: 2,
          rotation: heading, anchor: new window.google.maps.Point(0, 2.5)
        },
        zIndex: 1000
      });
    } else {
      markerRef.current.setPosition(pos);
      const icon = markerRef.current.getIcon();
      icon.rotation = heading;
      markerRef.current.setIcon(icon);
    }

    if (isFollowing) {
        mapInstanceRef.current.panTo(pos);
    }

    // --- TURN-BY-TURN STEP PROGRESSION ---
    if (routeSteps.length > 0 && currentStepIndex < routeSteps.length) {
        const currentStep = routeSteps[currentStepIndex];
        const stepEndLat = currentStep.end_location.lat();
        const stepEndLng = currentStep.end_location.lng();
        
        // Calculate how far driver is from the exact turning point
        const distanceToTurn = getDistanceKm(lat, lng, stepEndLat, stepEndLng);
        
        // If driver is within 40 meters (0.04 km) of the turn, jump to the next instruction
        if (distanceToTurn < 0.04) {
            setCurrentStepIndex(prev => prev + 1);
        }
    }
  }, [driverLocation, isFollowing, routeSteps, currentStepIndex]);

  // 3. Draw Route & Extract Steps
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !activeRide || !driverLocation) {
        if (routeRendererRef.current) routeRendererRef.current.setDirections({routes: []});
        setRouteSteps([]);
        return;
    }

    const dLat = getSafeCoord(driverLocation.lat);
    const dLng = getSafeCoord(driverLocation.lng);
    if (!dLat || !dLng) return;

    let target = null;
    if (["accepted", "arrived"].includes(activeRide.status)) {
        target = { lat: parseFloat(activeRide.pickup_lat), lng: parseFloat(activeRide.pickup_lng) };
    } else if (activeRide.status === "in_progress") {
        target = { lat: parseFloat(activeRide.dest_lat || activeRide.destination_lat), lng: parseFloat(activeRide.dest_lng || activeRide.destination_lng) };
    }

    if (target && target.lat) {
        directionsServiceRef.current.route({
            origin: { lat: dLat, lng: dLng },
            destination: target,
            travelMode: window.google.maps.TravelMode.DRIVING
        }, (result, status) => {
            if (status === 'OK' && routeRendererRef.current) {
                routeRendererRef.current.setDirections(result);
                routeRendererRef.current.setMap(mapInstanceRef.current); // 🔥 Ensure it's attached to the map instance
                
                // Extract steps for the navigation panel
                const steps = result.routes[0].legs[0].steps;
                setRouteSteps(steps);
                setCurrentStepIndex(0); // Reset to first step
            } else {
                console.error(`Directions request failed due to ${status}`);
            }
        });
    }
  }, [
      driverLocation?.lat, 
      driverLocation?.lng, 
      activeRide?.status, 
      activeRide?.pickup_lat, 
      activeRide?.dest_lat
  ]); // 🔥 FIX: Added driverLocation to the dependency array

  // --- MANUAL ZOOM CONTROLS ---
  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.setZoom(mapInstanceRef.current.getZoom() + 1);
  };
  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.setZoom(mapInstanceRef.current.getZoom() - 1);
  };

  const handleRecenter = () => {
      setIsFollowing(true);
      if (driverLocation) {
          mapInstanceRef.current.panTo({ lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) });
      }
  };

  const handleNav = (app) => { 
    if (!activeRide) return;
    let destLat, destLng; let waypoints = "";
    if (["accepted", "arrived"].includes(activeRide.status)) { destLat = activeRide.pickup_lat; destLng = activeRide.pickup_lng; } 
    else {
        destLat = activeRide.dest_lat || activeRide.destination_lat; destLng = activeRide.dest_lng || activeRide.destination_lng;
        if (activeRide.stops && activeRide.stops.length > 0 && app === 'google') {
            const stopsStr = activeRide.stops.filter(s => s.lat && s.lng).map(s => `${s.lat},${s.lng}`).join('|');
            if (stopsStr) waypoints = `&waypoints=${stopsStr}`;
        }
    }
    if (!destLat || !destLng) return toast.error("No destination coordinates found");
    const url = app === 'waze' ? `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes` : `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}${waypoints}&travelmode=driving`;
    window.open(url, '_blank');
  };

  // Turn Icon Mapper
  const getTurnIcon = (maneuver) => {
      if (!maneuver) return <Navigation className="w-8 h-8" />;
      if (maneuver.includes("left")) return <ArrowLeft className="w-8 h-8" />;
      if (maneuver.includes("right")) return <ArrowLeft className="w-8 h-8 rotate-180" />; // flipped left for right
      return <Navigation className="w-8 h-8" />; // default straight
  };

  const currentStep = routeSteps[currentStepIndex];

  return (
    <div className="fixed inset-0 w-full h-full z-0 pointer-events-auto">
        <div ref={mapRef} className="w-full h-full" />

        {/* 🔥 TURN-BY-TURN NAVIGATION PANEL */}
        {activeRide && currentStep && (
            <div className="absolute top-28 left-4 right-4 z-20 bg-[#1a1a2e]/95 backdrop-blur-xl border border-[#00ff88]/50 rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center gap-4">
                <div className="bg-[#00ff88]/20 p-3 rounded-xl text-[#00ff88] flex-shrink-0">
                    {getTurnIcon(currentStep.maneuver)}
                </div>
                <div className="flex-1 overflow-hidden">
                    <p className="text-2xl font-bold text-white mb-1">{currentStep.distance.text}</p>
                    {/* Cleans HTML tags from Google API (e.g. "Turn <b>left</b>") */}
                    <p className="text-[#00ff88] font-medium text-[15px] leading-tight truncate">
                        {currentStep.instructions.replace(/<[^>]*>?/gm, '')}
                    </p>
                </div>
            </div>
        )}

        {/* Recenter Button */}
        {!isFollowing && driverLocation && (
            <button onClick={handleRecenter} className="absolute bottom-[48vh] left-4 bg-[#00d4ff] text-black p-3 rounded-full shadow-lg z-10 animate-in fade-in zoom-in border-2 border-white">
                <Crosshair className="w-6 h-6 animate-pulse" />
            </button>
        )}

        {/* 🔥 CUSTOM DRIVER-FRIENDLY ZOOM CONTROLS */}
        <div className="absolute top-1/2 right-4 transform -translate-y-1/2 flex flex-col gap-2 z-10">
            <button onClick={handleZoomIn} className="bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] w-12 h-12 rounded-xl flex items-center justify-center shadow-lg active:bg-[#00ff88]/30 transition-colors">
                <Plus className="w-6 h-6" />
            </button>
            <button onClick={handleZoomOut} className="bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] w-12 h-12 rounded-xl flex items-center justify-center shadow-lg active:bg-[#00ff88]/30 transition-colors">
                <span className="text-2xl font-bold leading-none -mt-1">-</span>
            </button>
        </div>

        {/* External Nav Buttons */}
        {activeRide && (
            <div className="absolute top-52 right-4 flex flex-col gap-3 z-10">
                <Button size="icon" onClick={() => handleNav('waze')} className="bg-black/80 backdrop-blur-md border border-[#00d4ff]/50 text-[#00d4ff] hover:bg-[#00d4ff]/20 w-12 h-12 rounded-full shadow-lg">
                    <Zap className="w-5 h-5" />
                </Button>
                <Button size="icon" onClick={() => handleNav('google')} className="bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] hover:bg-[#00ff88]/20 w-12 h-12 rounded-full shadow-lg">
                    <MapPinned className="w-5 h-5" />
                </Button>
            </div>
        )}
    </div>
  );
};

// Driver Dashboard Component
const DriverDashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("rides");
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(user?.is_online || false);
  const [availableRides, setAvailableRides] = useState([]);
  const [nearbyRides, setNearbyRides] = useState([]);
  const [searchRadius, setSearchRadius] = useState(10);
  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  
  // Cancellation State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");

  // Ride tracking state
  const [rideStartTime, setRideStartTime] = useState(null);
  const [arrivedTime, setArrivedTime] = useState(null);
  const [waitTimer, setWaitTimer] = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const lastPositionRef = useRef(null);

  // Vehicle registration
  const [vehicleData, setVehicleData] = useState({
    car_make: "", car_model: "", car_year: "", car_color: "", license_plate: "",
    license_front: null, license_back: null, reg_front: null, reg_back: null,
    car_photo_front: null, car_photo_back: null, car_photo_left: null, car_photo_right: null
  });
  const [topupAmount, setTopupAmount] = useState("");
  const [topupReference, setTopupReference] = useState("");
  const [withdrawalData, setWithdrawalData] = useState({ amount: "", bank_details: "" });
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardDetails, setCardDetails] = useState({ number: "", expiry: "", cvv: "" });
  const [completedRide, setCompletedRide] = useState(null);

  const balance = user?.earnings?.balance || 0;
  const registrationStatus = user?.registration_status;
  const hasVehicle = user?.driver_info?.vehicle;

  const handleCardInput = (field, value) => {
    let formatted = value;
    if (field === "number") formatted = value.replace(/\D/g, "").slice(0, 16);
    else if (field === "expiry") {
      formatted = value.replace(/\D/g, "").slice(0, 4);
      if (formatted.length >= 3) formatted = `${formatted.slice(0, 2)}/${formatted.slice(2)}`;
    } else if (field === "cvv") formatted = value.replace(/\D/g, "").slice(0, 3);
    setCardDetails({ ...cardDetails, [field]: formatted });
  };

  const handleCardPayment = async (e) => {
    e.preventDefault();
    if (cardDetails.number.length < 16 || cardDetails.expiry.length < 5 || cardDetails.cvv.length < 3) {
        return toast.error("Please complete card details");
    }
    setLoading(true);
    setTimeout(() => {
        setLoading(false);
        setShowCardModal(false);
        toast.success("Payment Method Verified");
        handleRequestTopup();
    }, 1500);
  };

  // --- PANEL SWIPE STATE ---
  const [isMinimized, setIsMinimized] = useState(false);
  const touchStartY = useRef(null);

  // Auto-expand the panel whenever the trip status changes (e.g., you arrive)
  useEffect(() => {
    setIsMinimized(false);
  }, [activeRide?.status]);

  // Touch logic to detect swipes
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (!touchStartY.current) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;

    if (deltaY > 40) {
      setIsMinimized(true); // Swiped down
    } else if (deltaY < -40) {
      setIsMinimized(false); // Swiped up
    }
    touchStartY.current = null;
  };

  useEffect(() => {
    if (window.google) { setMapsLoaded(true); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleLocationUpdate = useCallback(async (location) => {
    setDriverLocation(location);
    try {
      await api.post(`/driver/location`, location);
      if (activeRide && activeRide.status === "in_progress" && lastPositionRef.current) {
        const dist = calculateDistance(lastPositionRef.current.lat, lastPositionRef.current.lng, location.lat, location.lng);
        setDistanceTraveled(prev => prev + dist);
        await api.post(`/rides/${activeRide.id}/update-tracking`, location);
      }
      lastPositionRef.current = location;
    } catch (error) { console.error("Failed to update location:", error); }
  }, [activeRide]);

  useLocationTracker(isOnline, handleLocationUpdate);

  useEffect(() => {
    let interval;
    if (activeRide?.status === "arrived") {
        if (!arrivedTime && activeRide.arrived_at) {
            setArrivedTime(new Date(activeRide.arrived_at).getTime());
        }
        interval = setInterval(() => { 
            const start = arrivedTime || Date.now();
            setWaitTimer(Math.max(0, Math.floor((Date.now() - start) / 60000))); 
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [arrivedTime, activeRide]);

  useEffect(() => { fetchActiveRide(); fetchRideHistory(); }, []);
  useEffect(() => { if (registrationStatus === "approved" && isOnline) { fetchAvailableRides(); const interval = setInterval(fetchAvailableRides, 5000); return () => clearInterval(interval); } }, [isOnline, registrationStatus]);

  const fetchAvailableRides = async () => { try { const res = await api.get(`/driver/rides/available`); setAvailableRides(res.data.rides || []); } catch (e) {} };
  const fetchActiveRide = async () => { try { const res = await api.get(`/driver/active-ride`); if (res.data) { setActiveRide(res.data); setActiveTab("rides"); } } catch (e) {} };
  const fetchRideHistory = async () => { try { const res = await api.get(`/driver/history`); setRideHistory(res.data.rides || []); } catch (e) {} };
  const fetchNearbyRides = async () => { try { const res = await api.get(`/driver/rides/nearby?radius=${searchRadius}`); setNearbyRides(res.data.rides || []); } catch (e) {} };

  const handleRideAction = async (action) => {
    if (!activeRide) return;
    setLoading(true);

    try {
      if (action === "arrived") {
        await api.post(`/rides/${activeRide.id}/arrived`);
        setArrivedTime(Date.now());
        toast.success("Marked as arrived");
      } 
      else if (action === "start") {
        await api.post(`/rides/${activeRide.id}/start`, { 
            pickup_wait_time: parseInt(waitTimer || 0)
        });
        setRideStartTime(Date.now());
        setDistanceTraveled(0);
        lastPositionRef.current = driverLocation;
        toast.success("Ride started");
      } 

     else if (action === "complete") {
        const finalDist = isNaN(distanceTraveled) ? 0 : parseFloat(distanceTraveled);
        const finalWait = isNaN(waitTimer) ? 0 : parseInt(waitTimer);
        const dLat = driverLocation?.lat || "";
        const dLng = driverLocation?.lng || "";
        
        // 🔥 FIX 1: Explicitly define the endpoint with all variables in the URL string so FastAPI accepts it
        const completeEndpoint = `/rides/${activeRide.id}/complete?final_distance=${finalDist}&total_wait_minutes=${finalWait}&dropoff_lat=${dLat}&dropoff_lng=${dLng}`;

        // 🔥 FIX 2: Send the POST request to the endpoint we just defined
        const res = await api.post(completeEndpoint);
        
        const finalFare = res.data.final_fare > 0 
            ? res.data.final_fare 
            : (activeRide.estimated_fare || 0);
            
        // Make sure the driver knows exactly how much CASH to ask for!
        const cashToCollect = res.data.cash_to_collect || 0;

        const completeData = { ...res.data, final_fare: finalFare };
        
        setCompletedRide(completeData);
        
        if (cashToCollect > 0) {
            toast.success(`Trip Done! Collect exactly ₾${cashToCollect.toFixed(2)} in CASH.`, { duration: 8000 });
        } else {
            toast.success(`Trip Done! Paid fully via Wallet/Card. Do not collect cash.`);
        }
        
        setActiveRide(null);
        setDistanceTraveled(0);
        setWaitTimer(0);
        setArrivedTime(null);
        setRideStartTime(null);
        setIsWaitingAtStop(false); // Reset stop wait toggle
        
        fetchRideHistory();
        const userRes = await api.get(`/auth/me`);
        updateUser(userRes.data);
        return; 
      }
      
      if (action !== "complete") {
          const rideRes = await api.get(`/rides/${activeRide.id}`);
          setActiveRide(rideRes.data);
      }

    } catch (e) {
        console.error("Action Error:", e);
        const errorMsg = e.response?.data?.detail || "Action failed";
        toast.error(errorMsg);
    } finally {
        setLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide || !selectedCancelReason) return;
    setLoading(true);

    try {
      await api.post(`/rides/${activeRide.id}/cancel`, {
        reason: selectedCancelReason,
        stage: activeRide.status 
      });

      toast.success("Ride cancelled");
      
      setActiveRide(null);
      setDistanceTraveled(0);
      setWaitTimer(0);
      setArrivedTime(null);
      setRideStartTime(null);
      setShowCancelModal(false);
      setSelectedCancelReason("");
      
      fetchRideHistory();
      fetchAvailableRides();

    } catch (e) {
      console.error(e);
      toast.error("Failed to cancel ride");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOnline = async (online) => {
    try { await api.post(`/driver/status?is_online=${online}`); setIsOnline(online); updateUser({ ...user, is_online: online }); toast.success(online ? "Online" : "Offline"); } catch (e) { toast.error("Failed"); }
  };

  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("car_make", vehicleData.car_make);
      formData.append("car_model", vehicleData.car_model);
      formData.append("car_year", parseInt(vehicleData.car_year));
      formData.append("car_color", vehicleData.car_color);
      formData.append("license_plate", vehicleData.license_plate);

      if (vehicleData.license_front) formData.append("license_front", vehicleData.license_front);
      if (vehicleData.license_back) formData.append("license_back", vehicleData.license_back);
      if (vehicleData.reg_front) formData.append("reg_front", vehicleData.reg_front);
      if (vehicleData.reg_back) formData.append("reg_back", vehicleData.reg_back);
      if (vehicleData.car_photo_front) formData.append("car_photo_front", vehicleData.car_photo_front);
      if (vehicleData.car_photo_back) formData.append("car_photo_back", vehicleData.car_photo_back);
      if (vehicleData.car_photo_left) formData.append("car_photo_left", vehicleData.car_photo_left);
      if (vehicleData.car_photo_right) formData.append("car_photo_right", vehicleData.car_photo_right);

      const res = await api.post(`/driver/vehicle`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success("Documents submitted for review!");
      updateUser({
        ...user,
        driver_info: { ...user.driver_info, vehicle: vehicleData, vehicle_tier: res.data?.tier || "standard" },
        registration_status: "pending_review"
      });
    } catch (e) {
      console.error(e);
      toast.error("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRide = async (rideId, estimatedFare) => { if (balance < estimatedFare * 0.23) return toast.error("Insufficient balance"); setLoading(true); try { await api.post(`/rides/${rideId}/accept`); toast.success("Accepted!"); const rideRes = await api.get(`/rides/${rideId}`); setActiveRide(rideRes.data); setAvailableRides(p => p.filter(r => r.id !== rideId)); setDistanceTraveled(0); } catch (e) { toast.error("Failed"); } finally { setLoading(false); } };
  const handleDeclineRide = async (rideId) => { try { await api.post(`/rides/${rideId}/decline`); setAvailableRides(p => p.filter(r => r.id !== rideId)); toast.info("Declined"); } catch (e) {} };
  const handleRequestToJoin = async (rideId) => { setLoading(true); try { await api.post(`/rides/${rideId}/request-join`); toast.success("Requested!"); fetchAvailableRides(); } catch (e) {} finally { setLoading(false); } };
  const handleRequestTopup = async () => { setLoading(true); try { await api.post(`/driver/topup/request`, { amount: parseFloat(topupAmount), payment_reference: topupReference }); toast.success("Request sent"); window.open("https://bankofgeorgia.ge", "_blank"); } catch(e) {} finally { setLoading(false); } };
  const handleWithdrawal = async () => { setLoading(true); try { await api.post(`/driver/withdraw`, { amount: parseFloat(withdrawalData.amount), bank_details: withdrawalData.bank_details }); toast.success("Requested"); } catch(e) {} finally { setLoading(false); } };

  const statusColors = { pending_vehicle: "bg-yellow-500 text-black", pending_review: "bg-orange-500 text-black", approved: "bg-[#00ff88] text-black", rejected: "bg-red-500 text-white" };
  const rideStatusColors = { searching: "bg-yellow-500 text-black", accepted: "bg-blue-500 text-white", arrived: "bg-purple-500 text-white", in_progress: "bg-[#00ff88] text-black", completed: "bg-green-600 text-white", cancelled: "bg-red-500 text-white" };
  const [isWaitingAtStop, setIsWaitingAtStop] = useState(false);

  const toggleStopWait = async () => {
    try {
      const newStatus = !isWaitingAtStop;
      // 🔥 FIX: Send is_waiting as a URL parameter, NOT a JSON body
      await api.post(`/rides/${activeRide.id}/toggle-stop-wait?is_waiting=${newStatus}`);
      setIsWaitingAtStop(newStatus);
      toast.success(newStatus ? "Stop wait timer started" : "Stop wait timer paused");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update wait status");
    }
  };

  return (
    // 🔥 THE MASTER LAYOUT FIX: fixed inset-0 completely locks it to the exact screen bounds
    <div className="fixed inset-0 w-full h-full bg-black font-sans text-white overflow-hidden flex flex-col">
      
      {/* 1. MAP BACKGROUND (Behind everything) */}
      <div className="absolute inset-0 z-0 pointer-events-auto">
        {mapsLoaded && <DriverSmartMap activeRide={activeRide} driverLocation={driverLocation} />}
      </div>

      {/* 2. PINNED HEADER (Always visible at the top) */}
      <div className="absolute top-0 left-0 right-0 z-50 pointer-events-auto shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <header className="bg-black/90 backdrop-blur-xl border-b border-[#00d4ff]/30 p-3 sm:p-4">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center">
                <Car className="w-5 h-5 text-black" />
              </div>
              <div>
                <p className="text-[#00d4ff] font-semibold">{user?.name} {user?.surname}</p>
                <div className="flex items-center space-x-2">
                  <Badge className={statusColors[registrationStatus] || "bg-gray-500"}>
                    {registrationStatus?.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  <span className="text-[#00ff88] text-sm font-bold">₾{balance.toFixed(2)}</span>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {registrationStatus === "approved" && (
                <div className="flex items-center space-x-2">
                  <span className={`text-xs sm:text-sm ${isOnline ? "text-[#00ff88]" : "text-gray-500"}`}>
                    {isOnline ? "Online" : "Offline"}
                  </span>
                  <Button size="sm" className={isOnline ? "bg-[#00ff88] text-black" : "bg-gray-600"} onClick={() => handleToggleOnline(!isOnline)}>
                    {isOnline ? "ON" : "OFF"}
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="icon" className="text-[#00d4ff]" onClick={() => navigate("/")}>
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-red-400" onClick={logout}>
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </header>

        {isOnline && driverLocation && (
          <div className="bg-black/80 backdrop-blur-md border-b border-[#00ff88]/20 px-4 py-2 shadow-sm">
            <div className="container mx-auto flex items-center text-xs text-[#00ff88]">
              <Crosshair className="w-3 h-3 mr-2 animate-pulse" />
              Tracking active • {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
              {driverLocation.speed && <span className="ml-2">• {(driverLocation.speed * 3.6).toFixed(0)} km/h</span>}
            </div>
          </div>
        )}
      </div>

      {/* 3. PINNED BOTTOM SHEET (Always visible at the bottom) */}
      <div className="absolute bottom-0 left-0 right-0 z-40 w-full flex justify-center pointer-events-none p-2 pb-4 sm:p-4 sm:pb-6">
        
        <div 
          className={`pointer-events-auto w-full max-w-2xl bg-black/90 backdrop-blur-2xl border border-white/10 shadow-[0_-15px_40px_rgba(0,0,0,0.8)] rounded-3xl flex flex-col overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isMinimized && activeRide ? "translate-y-[calc(100%-3rem)]" : "translate-y-0"
          }`}
          style={{ maxHeight: "75vh" }}
        >
          
          {/* Drag Handle */}
          {activeRide && (
            <div 
              className="w-full flex justify-center items-center h-12 shrink-0 cursor-pointer bg-white/5 active:bg-white/10 transition-colors" 
              onClick={() => setIsMinimized(!isMinimized)}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-16 h-1.5 bg-gray-500 rounded-full" />
            </div>
          )}

          {/* Tab Content */}
          <div className="overflow-y-auto p-3 pb-4 scrollbar-hide flex-1">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              
              {!activeRide && (
                <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00d4ff]/20 mb-4 rounded-xl">
                  <TabsTrigger value="rides" className="text-xs sm:text-sm"><Activity className="w-4 h-4 sm:mr-2" /> Rides</TabsTrigger>
                  <TabsTrigger value="nearby" onClick={fetchNearbyRides} className="text-xs sm:text-sm"><Crosshair className="w-4 h-4 sm:mr-2" /> Nearby</TabsTrigger>
                  <TabsTrigger value="vehicle" className="text-xs sm:text-sm"><Car className="w-4 h-4 sm:mr-2" /> Vehicle</TabsTrigger>
                  <TabsTrigger value="earnings" className="text-xs sm:text-sm"><Wallet className="w-4 h-4 sm:mr-2" /> Earn</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs sm:text-sm"><History className="w-4 h-4 sm:mr-2" /> History</TabsTrigger>
                </TabsList>
              )}

              <TabsContent value="rides" className="m-0">
                {activeRide ? (
                  <Card className="bg-transparent border-none shadow-none">
                    <CardHeader className="px-2 pt-0 pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-[#00ff88]">Active Ride</CardTitle>
                        <Badge className={rideStatusColors[activeRide.status]}>
                          {activeRide.status?.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 text-white px-2 pb-2">

                      <div className="bg-black/50 rounded-xl p-4 border border-[#00ff88]/20">
                        <div className="space-y-3">
                          <div className="flex items-start">
                            <MapPin className="w-5 h-5 text-[#00ff88] mr-2 mt-0.5" />
                            <div>
                              <p className="text-[#00ff88]/60 text-xs">PICKUP</p>
                              <p className="font-medium">{activeRide.pickup}</p>
                            </div>
                          </div>
                          {activeRide.stops?.length > 0 && (
                            <div className="flex items-start">
                              <MapPinned className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" />
                              <div>
                                <p className="text-yellow-400/60 text-xs">STOPS</p>
                                {activeRide.stops.map((s, i) => (
                                  <p key={i} className="text-sm">• {s.address}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex items-start">
                            <Navigation className="w-5 h-5 text-[#00d4ff] mr-2 mt-0.5" />
                            <div>
                              <p className="text-[#00d4ff]/60 text-xs">DESTINATION</p>
                              <p className="font-medium">{activeRide.destination || "Open Trip"}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {(activeRide.status === "arrived" || activeRide.status === "in_progress") && (
                        <div className="grid grid-cols-2 gap-4">
                          {activeRide.status === "arrived" && (
                            <DriverWaitTimer arrivedAt={activeRide.arrived_at} carType={activeRide.carType} />
                          )}
                          {activeRide.status === "in_progress" && (
                            <div className="bg-[#00ff88]/20 border border-[#00ff88] rounded-xl p-4 text-center col-span-2">
                              <Activity className="w-6 h-6 mx-auto text-[#00ff88] mb-1" />
                              <p className="text-2xl font-bold text-[#00ff88]">{distanceTraveled.toFixed(1)} km</p>
                              <p className="text-xs text-[#00ff88]/70">Traveled</p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4">
                        <span className="text-[#00ff88]">Fare</span>
                        <span className="text-2xl font-bold text-[#00ff88]">
                          ₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-3">
                        <RideCommunication 
                          rideId={activeRide.id}
                          otherPartyPhone={activeRide.rider_phone || activeRide.rider?.cellphone}
                          otherPartyName={activeRide.rider_name || "Rider"}
                          currentUserId={user?.id}
                          isDriver={true} 
                        />
                      </div>

                      <div className="flex flex-col gap-3 pt-2">
                        
                        {/* Stop Wait Button */}
                        {activeRide.status === "in_progress" && activeRide.stops?.length > 0 && (
                          <Button 
                            onClick={toggleStopWait}
                            variant={isWaitingAtStop ? "destructive" : "outline"}
                            className="w-full h-12 font-bold bg-black border-white/20 text-white"
                          >
                            {isWaitingAtStop ? (
                              <><Timer className="mr-2 animate-spin" /> Finish Waiting at Stop</>
                            ) : (
                              <><PauseCircle className="mr-2 text-yellow-400" /> Start Stop Wait</>
                            )}
                          </Button>
                        )}

                        <div className="flex gap-3">
                          <div className="flex-1">
                            {activeRide.status === "accepted" && (
                              <Button className="w-full bg-purple-500 text-white h-14 text-lg font-bold" onClick={() => handleRideAction("arrived")} disabled={loading}>
                                <MapPin className="w-5 h-5 mr-2" /> I've Arrived
                              </Button>
                            )}
                            {activeRide.status === "arrived" && (
                              <Button className="w-full bg-blue-500 text-white h-14 text-lg font-bold" onClick={() => handleRideAction("start")} disabled={loading}>
                                <Play className="w-5 h-5 mr-2" /> Start Trip
                              </Button>
                            )}
                            {activeRide.status === "in_progress" && (
                              <Button className="w-full bg-[#00ff88] text-black h-14 text-lg font-bold" onClick={() => handleRideAction("complete")} disabled={loading}>
                                <CheckCircle2 className="w-5 h-5 mr-2" /> Complete Trip
                              </Button>
                            )}
                          </div>
                          
                          {/* Cancel Button */}
                          <Button 
                            variant="destructive" 
                            className="h-14 w-14 bg-red-500/20 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                            onClick={() => setShowCancelModal(true)}
                            disabled={loading}
                          >
                            <XCircle className="w-6 h-6" />
                          </Button>
                        </div>

                      </div>

                    </CardContent>
                  </Card>
                ) : (
                  registrationStatus !== "approved" ? (
                    <Card className="bg-transparent border border-yellow-500/30 text-center py-12">
                      <AlertTriangle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
                      <p className="text-yellow-400 font-semibold">Account Pending Review</p>
                    </Card>
                  ) : !isOnline ? (
                    <Card className="bg-transparent border border-gray-500/30 text-center py-12">
                      <Activity className="w-16 h-16 mx-auto text-gray-500 mb-4" />
                      <p className="text-gray-400">Offline</p>
                      <Button className="mt-4 bg-[#00ff88] text-black font-bold h-12 px-8" onClick={() => handleToggleOnline(true)}>Go Online</Button>
                    </Card>
                  ) : availableRides.length === 0 ? (
                    <Card className="bg-transparent border border-[#00d4ff]/30 text-center py-12">
                      <Navigation className="w-16 h-16 mx-auto text-[#00d4ff]/50 mb-4 animate-pulse" />
                      <p className="text-[#00d4ff]/70">Searching for rides...</p>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {availableRides.map(ride => {
                        const comm = (ride.estimated_fare || 0) * 0.23;
                        const canAccept = balance >= comm;
                        return (
                          <Card key={ride.id} className="bg-black/60 border border-[#00ff88]/30">
                            <CardContent className="p-4 text-white">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1 pr-2">
                                  <p className="text-[#00ff88] font-semibold text-sm sm:text-base truncate">{ride.pickup}</p>
                                  <p className="text-[#00d4ff]/70 text-xs sm:text-sm truncate">→ {ride.destination}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xl sm:text-2xl font-bold text-[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button className="flex-1 bg-[#00ff88] text-black font-bold h-12" onClick={() => handleAcceptRide(ride.id, ride.estimated_fare)} disabled={loading || !canAccept}>
                                  {canAccept ? "Accept" : "Low Balance"}
                                </Button>
                                <Button variant="outline" className="border-red-500 text-red-500 h-12 w-12" onClick={() => handleDeclineRide(ride.id)}>
                                  <XCircle className="w-5 h-5" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )
                )}
              </TabsContent>

              <TabsContent value="nearby">
                 <div className="space-y-4">
                    <div className="flex justify-end mb-2">
                      <Button size="sm" variant="outline" onClick={fetchNearbyRides} className="text-white border-white/20 hover:bg-white/10">Refresh</Button>
                    </div>
                    {nearbyRides.map(ride => (
                      <Card key={ride.id} className="bg-black/60 border border-[#00d4ff]/30">
                        <CardContent className="p-4 text-white">
                          <p className="text-[#00ff88]">{ride.pickup}</p>
                          <p className="text-[#00d4ff]">→ {ride.destination}</p>
                          <Button className="w-full mt-2 bg-[#00d4ff] text-black font-bold" onClick={() => handleRequestToJoin(ride.id)}>Request to Accept</Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
              </TabsContent>

              <TabsContent value="vehicle">
                  <Card className="bg-transparent border-none shadow-none">
                    <CardHeader className="px-0 pt-0">
                      <CardTitle className="text-[#00d4ff]">Vehicle Registration</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 text-white">
                      {hasVehicle ? (
                        <div className="p-6 bg-black/50 rounded-xl border border-[#00ff88]/30 text-center">
                          <CheckCircle2 className="w-12 h-12 text-[#00ff88] mx-auto mb-2" />
                          <p className="text-lg font-bold">Documents Under Review</p>
                          <p className="text-xl font-mono text-[#00ff88] mt-2">{user.driver_info.vehicle.license_plate}</p>
                        </div>
                      ) : (
                        <form onSubmit={handleRegisterVehicle} className="space-y-6">
                          <div className="space-y-3">
                            <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Vehicle Details</h3>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Make</Label><Input required placeholder="Make" value={vehicleData.car_make} onChange={e => setVehicleData({ ...vehicleData, car_make: e.target.value })} className="bg-black/50 text-white border-[#00d4ff]/30" /></div>
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Model</Label><Input required placeholder="Model" value={vehicleData.car_model} onChange={e => setVehicleData({ ...vehicleData, car_model: e.target.value })} className="bg-black/50 text-white border-[#00d4ff]/30" /></div>
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Year</Label><Input required type="number" placeholder="2015" value={vehicleData.car_year} onChange={e => setVehicleData({ ...vehicleData, car_year: e.target.value })} className="bg-black/50 text-white border-[#00d4ff]/30" /></div>
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Color</Label><Input required placeholder="Silver" value={vehicleData.car_color} onChange={e => setVehicleData({ ...vehicleData, car_color: e.target.value })} className="bg-black/50 text-white border-[#00d4ff]/30" /></div>
                            </div>
                            <div className="space-y-1"><Label className="text-gray-400 text-xs">License Plate</Label><Input required placeholder="AB-123-CD" value={vehicleData.license_plate} onChange={e => setVehicleData({ ...vehicleData, license_plate: e.target.value })} className="bg-black/50 text-white border-[#00d4ff]/30 uppercase font-mono" /></div>
                          </div>

                          <div className="space-y-3">
                            <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Driver's License</h3>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Front</Label><Input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, license_front: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Back</Label><Input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, license_back: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Vehicle Registration</h3>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Front</Label><Input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, reg_front: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Back</Label><Input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, reg_back: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Car Photos</h3>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Front</Label><Input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, car_photo_front: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Back</Label><Input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, car_photo_back: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Left</Label><Input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, car_photo_left: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                              <div className="space-y-1"><Label className="text-gray-400 text-xs">Right</Label><Input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, car_photo_right: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                            </div>
                          </div>

                          <Button type="submit" className="w-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-black font-bold h-12 mt-4" disabled={loading}>
                            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Submit Documents"}
                          </Button>
                        </form>
                      )}
                    </CardContent>
                  </Card>
              </TabsContent>

              <TabsContent value="earnings">
                <div className="space-y-4">
                  <Card className="p-6 bg-black/60 border border-[#00ff88] text-center">
                    <p className="text-gray-400">Balance</p>
                    <p className="text-4xl font-bold text-[#00ff88]">₾{balance.toFixed(2)}</p>
                  </Card>
                  <Input type="number" placeholder="Amount" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} className="bg-black/50 text-white border-[#00d4ff]/30 h-12" />
                  <Button className="w-full bg-[#00ff88] text-black h-12 font-bold" onClick={() => setShowCardModal(true)}>Top Up</Button>
                </div>
              </TabsContent>

              <TabsContent value="history">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2 pr-4">
                    {rideHistory.length === 0 ? <p className="text-gray-400 text-center py-6">No rides yet.</p> : null}
                    {rideHistory.map(r => (
                      <div key={r.id} className="p-4 bg-black/50 border border-[#00d4ff]/20 rounded-xl">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-white text-sm truncate pr-2">{r.pickup}</p>
                          <p className="text-[#00ff88] font-bold">₾{r.final_fare}</p>
                        </div>
                        <p className="text-gray-500 text-xs">{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

            </Tabs>
          </div>
        </div>
      </div>

      {/* --- MODALS OVERLAYING THE ENTIRE SCREEN --- */}
      <Dialog open={showCardModal} onOpenChange={setShowCardModal}>
        <DialogContent className="bg-[#1a1a2e] border border-[#00ff88]/30 text-white sm:max-w-md w-[95%] rounded-xl z-[10000]">
          <DialogHeader>
            <DialogTitle className="text-[#00ff88] flex items-center gap-2">
              <Wallet className="w-5 h-5" /> Top Up Wallet
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 relative z-50">
            <PayPalButtons
              fundingSource="card"
              style={{ layout: "vertical", shape: "rect" }}
              createOrder={(data, actions) => {
                const usdAmount = (parseFloat(topupAmount) * 0.37).toFixed(2);
                return actions.order.create({
                  purchase_units: [{ amount: { value: usdAmount, currency_code: "USD" } }],
                  application_context: { shipping_preference: "NO_SHIPPING" }
                });
              }}
              onApprove={async (data, actions) => {
                try {
                  setLoading(true);
                  await actions.order.capture(); 
                  await api.post(`/driver/wallet/topup/paypal`, { order_id: data.orderID, amount: parseFloat(topupAmount) });
                  toast.success(`Successfully added ₾${topupAmount}!`);
                  setShowCardModal(false); setTopupAmount("");
                  const userRes = await api.get(`/auth/me`); updateUser(userRes.data);
                } catch (error) { toast.error("Top-up failed."); } finally { setLoading(false); }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="bg-[#1a1a2e] border border-red-500/50 text-white sm:max-w-md w-[95%] rounded-xl z-[10000]">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Cancel Ride
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Please select a reason. <span className="text-red-400 font-bold block mt-1">Warning: Unjustified cancellations may affect your score.</span>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] pr-4">
            <div className="grid gap-2 py-4">
              {(CANCEL_REASONS[activeRide?.status] || CANCEL_REASONS.accepted).map((reason) => (
                <div
                  key={reason} onClick={() => setSelectedCancelReason(reason)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedCancelReason === reason ? "bg-red-500 text-white border-red-500" : "bg-black/40 border-gray-700 hover:border-red-500/50 hover:bg-red-500/10"}`}
                >
                  <p className="font-medium text-sm">{reason}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowCancelModal(false)} className="flex-1 text-gray-400 border border-gray-700 h-12">Back</Button>
            <Button variant="destructive" onClick={handleCancelRide} disabled={!selectedCancelReason || loading} className="flex-1 bg-red-600 hover:bg-red-700 font-bold h-12">Confirm Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>

      <DriverTripCompletionModal
        isOpen={!!completedRide}
        onClose={() => setCompletedRide(null)}
        fareAmount={completedRide?.final_fare}
        paymentMethod={completedRide?.payment_method}
        riderName={completedRide?.rider_name}
        onConfirm={() => setCompletedRide(null)}
      />

    </div>
  );
}; 

// Main Router
const DriverPortal = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.user_type !== "driver") {
    if (location.pathname === "/driver" || location.pathname === "/driver/") {
      return <DriverAuth />;
    }
    return <Navigate to="/driver" replace />;
  }

  return (
    <PayPalScriptProvider options={{ "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID, currency: "USD" }}>
      <Routes>
        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DriverDashboard />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default DriverPortal;