import React, { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import api from "@/api";
import { useLanguage } from "@/i18n/LanguageContext";
import LanguageSelector from "@/i18n/LanguageSelector";
import { RiderTripCompletionModal } from "@/components/TripCompletionModal";
import RatingModal from "@/components/RatingModal";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import RideCommunication from "./RideCommunication";
import { 
  Car, MapPin, History, Home, LogOut, User, Navigation, Rocket, ArrowLeft, 
  Lock, Phone, MessageSquare, Star, Clock, Shield, AlertTriangle 
} from "lucide-react";

// Pricing Rules (Updated to your specific base prices)
const PRICING_RULES = {
  economy: { name: 'Economy', base: 2.80, perKm: 0.50, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "🚗" },
  comfort: { name: 'Comfort', base: 3.38, perKm: 0.55, perMinWait: 0.45, freeWait: 2, stopFee: 0.00, icon: "🚙" },
  suv: { name: 'SUV / XL', base: 5.18, perKm: 0.80, perMinWait: 0.50, freeWait: 2, stopFee: 0.00, icon: "🚐" },
  personal: { name: 'Personal', base: 5.12, perKm: 0.70, perMinWait: 0.50, freeWait: 3, stopFee: 0.00, icon: "👤" },
  jumpstart: { name: 'Jumpstart', base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, stopFee: 0.00, icon: "⚡" }
};

// 🔥 UPDATED: Adds +2.00 GEL if paymentMethod is 'card'
const calculateFare = (carType, distanceKm, waitMin = 0, stopWaitMin = 0, numStops = 0, surgeMultiplier = 1.0, paymentMethod = 'cash') => {
  const rules = PRICING_RULES[carType] || PRICING_RULES.economy;
  let subtotal = rules.base;
  subtotal += distanceKm * rules.perKm;

  // Long distance logic
  if (distanceKm > 7) {
    subtotal += (distanceKm - 7) * 0.15;
  }
  if (distanceKm > 30) {
    subtotal += Math.ceil((distanceKm - 30) / 15) * 5;
  }

  // Wait fees
  const billableWait = Math.max(0, waitMin - rules.freeWait);
  subtotal += billableWait * rules.perMinWait;
  subtotal += stopWaitMin * rules.perMinWait;

  // Stop fees (Now 0.00)
  subtotal += numStops * rules.stopFee;

  // Surge
  const surgeFee = subtotal * (surgeMultiplier - 1.0);

  // 🔥 SERVICE FEE LOGIC
  const serviceFee = paymentMethod === 'card' ? 2.00 : 0.00;

  // Calculate Total
  const total = subtotal + surgeFee + serviceFee;

  return {
    base: rules.base,
    distance: Math.round(distanceKm * rules.perKm * 100) / 100,
    wait: Math.round((billableWait + stopWaitMin) * rules.perMinWait * 100) / 100,
    stops: numStops * rules.stopFee,
    subtotal: Math.round(subtotal * 100) / 100,
    surgeFee: Math.round(surgeFee * 100) / 100,
    serviceFee: serviceFee.toFixed(2), // Added to return object
    surgeMultiplier,
    total: Math.round(total * 100) / 100
  };
};

// Google Maps Autocomplete (LIGHT THEME DROPDOWN)
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {
  const callbackRef = useRef(onPlaceSelect);
  useEffect(() => { callbackRef.current = onPlaceSelect; }, [onPlaceSelect]);

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .pac-container { z-index: 10500 !important; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; font-family: inherit; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
      .pac-item { color: #374151; border-top: 1px solid #f3f4f6; padding: 10px; cursor: pointer; }
      .pac-item:hover { background-color: #f3f4f6; }
      .pac-item-query { color: #000000; font-weight: bold; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Initialize Autocomplete (With Safety Timer)
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

// 🔥 FIXED: Map Picker (Solves Black Screen on Re-open)
const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null); // Holds the Google Map instance
  const markerRef = useRef(null);      // Holds the red pin
  const [address, setAddress] = useState("Move map to select location...");
  const [isDragging, setIsDragging] = useState(false);
  const [locating, setLocating] = useState(false);

  // Safe center initialization
  const [center, setCenter] = useState({ lat: 41.7151, lng: 44.8271 });

  // Update center when initialLocation changes
  useEffect(() => {
      if (initialLocation && initialLocation.lat) {
          setCenter({
              lat: parseFloat(initialLocation.lat),
              lng: parseFloat(initialLocation.lng)
          });
      }
  }, [initialLocation]);

  // 🔥 CRITICAL FIX: Reset map instance when modal closes
  useEffect(() => {
    if (!isOpen) {
        mapInstanceRef.current = null; // Kill the old map instance so a new one is made next time
    }
  }, [isOpen]);

  // Initialize Map
  useEffect(() => {
    if (!isOpen || !mapRef.current || !window.google) return;

    // Only create a new map if one doesn't exist
    if (!mapInstanceRef.current) {
        const map = new window.google.maps.Map(mapRef.current, {
            center: center,
            zoom: 17,
            disableDefaultUI: true,
            clickableIcons: false,
            backgroundColor: '#1a1a2e',
            styles: [
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
            ]
        });
        mapInstanceRef.current = map;

        // Add Listeners
        map.addListener("idle", () => {
            setIsDragging(false);
            const newCenter = map.getCenter();
            const lat = newCenter.lat();
            const lng = newCenter.lng();
            setCenter({ lat, lng });

            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === 'OK' && results[0]) setAddress(results[0].formatted_address);
                else setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
            });
        });

        map.addListener("dragstart", () => setIsDragging(true));
    }
  }, [isOpen]); // Only run when isOpen changes

  const handleLocateMe = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
        const lat = parseFloat(position.coords.latitude);
        const lng = parseFloat(position.coords.longitude);
        if (mapInstanceRef.current) {
            const pos = { lat, lng };
            mapInstanceRef.current.panTo(pos);
            mapInstanceRef.current.setZoom(17);
            setCenter(pos);
        }
        setLocating(false);
    }, () => { toast.error("Could not find location"); setLocating(false); }, { enableHighAccuracy: true });
  };

  const handleConfirm = () => {
    onLocationSelect({
        address: address,
        lat: parseFloat(center.lat),
        lng: parseFloat(center.lng)
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
        <div className="absolute top-0 left-0 right-0 p-4 z-10 flex items-center justify-between pointer-events-none">
            <Button variant="ghost" size="icon" onClick={onClose} className="bg-black/50 text-white rounded-full pointer-events-auto backdrop-blur-md border border-[#00ff88]/30"><ArrowLeft className="w-6 h-6" /></Button>
            <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-[#00ff88]/30"><p className="text-[#00ff88] font-bold text-sm">{title || "Select Location"}</p></div>
        </div>
        <div className="relative flex-1 w-full h-full">
            <div ref={mapRef} className="w-full h-full" />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center pb-10">
                <div className="relative flex flex-col items-center">
                    <MapPin className={`w-12 h-12 text-[#00ff88] drop-shadow-2xl transition-transform duration-200 ${isDragging ? '-translate-y-4' : ''}`} fill="black" />
                    <div className="w-2 h-2 bg-black/50 rounded-full blur-[2px] mt-[-5px]" />
                </div>
            </div>
            <Button size="icon" className="absolute bottom-6 right-4 rounded-full w-12 h-12 bg-black/80 border border-[#00ff88]/50 text-[#00ff88] shadow-lg z-20" onClick={handleLocateMe} disabled={locating}>
                {locating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Crosshair className="w-6 h-6" />}
            </Button>
        </div>
        <div className="bg-[#1a1a2e] p-6 rounded-t-3xl border-t border-[#00ff88]/30 -mt-6 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
            <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
            <p className="text-[#00ff88] text-xs font-bold uppercase mb-1">Selected Location</p>
            <h3 className="text-white text-lg font-bold truncate mb-6">{isDragging ? "Locating..." : address}</h3>
            <Button className="w-full bg-[#00ff88] text-black font-bold h-14 text-lg rounded-xl" onClick={handleConfirm} disabled={isDragging}>{isDragging ? "Release to Select" : "Confirm Location"}</Button>
        </div>
    </div>
  );
};


// --- 3. LIVE MAP COMPONENT (Fixed: Zoom, Spaceship Icon, and Stable Route Line) ---
const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef = useRef(null);
  
  // 🔥 FIX: Track if we already drew the route for this phase to prevent vanishing lines
  const routeDrawnForStatus = useRef(null);
  
  // State to track if we should lock camera on driver
  const [isFollowing, setIsFollowing] = useState(true);

  const getSafeCoord = (val) => { const num = parseFloat(val); return !isNaN(num) && num !== 0 ? num : null; };

  // 1. Initialize Map
  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    
    if (!mapInstanceRef.current) {
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 41.7151, lng: 44.8271 },
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true, // 🔥 FIX: Enable zoom buttons
        gestureHandling: "greedy", // 🔥 FIX: Allow 1-finger panning on mobile screens
        backgroundColor: '#1a1a2e',
        styles: [
          { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] }
        ]
      });

      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false,
        polylineOptions: { strokeColor: "#00ff88", strokeWeight: 6 }
      });

      // Detect manual interaction to pause "Auto-Follow"
      map.addListener("dragstart", () => setIsFollowing(false));
      map.addListener("zoom_changed", () => setIsFollowing(false)); // Pause follow on zoom

      mapInstanceRef.current = map;
    }
  }, []);

  // 2. Routing Logic
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    const pLat = getSafeCoord(pickup?.lat);
    const pLng = getSafeCoord(pickup?.lng);
    const destLat = getSafeCoord(destination?.lat);
    const destLng = getSafeCoord(destination?.lng);
    const dLat = getSafeCoord(driverLocation?.lat);
    const dLng = getSafeCoord(driverLocation?.lng);

    // Format stops for Google Maps API
    const waypoints = stops
      .filter(s => s.lat && s.lng)
      .map(s => ({
        location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) },
        stopover: true
      }));

    // 🔥 FIX: Prevent API spam. If we already drew the line for this status, don't redraw it!
    if (routeDrawnForStatus.current === status) return;

    // MODE A: Preview (Booking)
    if (status === 'preview') {
       if (pLat && pLng && destLat && destLng) {
           calculateAndDrawRoute({ lat: pLat, lng: pLng }, { lat: destLat, lng: destLng }, waypoints);
           routeDrawnForStatus.current = status;
       }
       return; 
    }

    // MODE B: Live Ride (Driver Active)
    if (!dLat || !dLng) return; // Wait for driver location

    const origin = { lat: dLat, lng: dLng };
    let target = null;
    let activeWaypoints = [];

    if (['accepted', 'searching', 'arrived'].includes(status) && pLat) {
        target = { lat: pLat, lng: pLng }; // Driver -> Pickup
        activeWaypoints = []; // Ignore passenger's waypoints until they are in the car
    } else if (status === 'in_progress' && destLat) {
        target = { lat: destLat, lng: destLng }; // Driver -> Destination
        activeWaypoints = waypoints;
    }

    // Now safe to use
    if (origin && target) { 
        calculateAndDrawRoute(origin, target, activeWaypoints); 
        routeDrawnForStatus.current = status;
    }

  }, [pickup?.lat, destination?.lat, stops.length, status, driverLocation?.lat]); 

  const calculateAndDrawRoute = (origin, target, waypoints = []) => {
    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route({
        origin: origin,
        destination: target,
        waypoints: waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING
    }, (result, apiStatus) => {
        if (apiStatus === 'OK' && directionsRendererRef.current) {
            directionsRendererRef.current.setDirections(result);
            
            // 🔥 FIX: Always fit bounds to show the FULL line when the phase changes
            const bounds = new window.google.maps.LatLngBounds();
            bounds.extend(origin);
            bounds.extend(target);
            waypoints.forEach(wp => bounds.extend(wp.location));
            mapInstanceRef.current.fitBounds(bounds);
            
            // Add padding so pins aren't cut off on the edge of the map
            mapInstanceRef.current.panBy(0, 20);
        }
    });
  };

  // 3. Driver Marker & Camera Follow Logic
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation?.lat) return;
    
    const pos = { 
        lat: parseFloat(driverLocation.lat), 
        lng: parseFloat(driverLocation.lng) 
    };

    // 🔥 FIX: Custom Spaceship SVG Path
    const SPACESHIP_SVG = "M 0,-18 L 12,14 L 0,8 L -12,14 Z";

    // Update or Create Marker
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        icon: {
          path: SPACESHIP_SVG, // 🔥 Replaces the basic arrow
          scale: 1.5, 
          fillColor: "#00d4ff", 
          fillOpacity: 1, 
          strokeColor: "#ffffff", 
          strokeWeight: 2,
          rotation: parseFloat(driverLocation.heading) || 0,
          anchor: new window.google.maps.Point(0, 0)
        },
        zIndex: 1000
      });
    } else {
      driverMarkerRef.current.setPosition(pos);
      const icon = driverMarkerRef.current.getIcon();
      icon.rotation = parseFloat(driverLocation.heading) || 0;
      driverMarkerRef.current.setIcon(icon);
    }

    // Auto-Follow Logic
    if (isFollowing) {
        mapInstanceRef.current.panTo(pos);
    }

  }, [driverLocation, isFollowing]);

  const handleRecenter = () => {
      setIsFollowing(true);
      if (driverLocation?.lat && mapInstanceRef.current) {
          mapInstanceRef.current.panTo({
              lat: parseFloat(driverLocation.lat),
              lng: parseFloat(driverLocation.lng)
          });
      }
  };

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-[#00ff88]/20 mb-4 bg-[#1a1a2e]">
        {/* 🔥 FIX: Changed height to 50vh (half screen height) so it's massive and immersive */}
        <div ref={mapRef} style={{ height: '50vh', minHeight: '450px', width: '100%' }} />
        
        {/* Re-Center Button */}
        {!isFollowing && driverLocation && (
            <button 
                onClick={handleRecenter}
                className="absolute bottom-4 right-4 bg-black/80 text-[#00d4ff] p-3 rounded-full border border-[#00d4ff] shadow-lg z-10 hover:bg-black"
            >
                <Crosshair className="w-6 h-6 animate-pulse" />
            </button>
        )}
    </div>
  );
};

// LocationInput (LIGHT THEME BOXES)
const LocationInput = ({ value, onChange, placeholder, icon: Icon, iconColor, id, name }) => {
  const inputRef = useRef(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Uses the hook we defined earlier
  useGoogleMapsAutocomplete(inputRef, (place) => {
    onChange({ address: place.address, lat: place.lat, lng: place.lng });
  });

  return (
    <>
      <div className="relative flex items-center shadow-sm rounded-md">
        <Icon className={`absolute left-3 h-5 w-5 ${iconColor} z-10`} />
        <Input
            ref={inputRef}
            id={id}
            name={name}
            value={value?.address || ""}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
            className="pl-10 pr-10 bg-white border-gray-300 text-black font-medium placeholder:text-gray-400 focus-visible:ring-[#00ff88]"
            placeholder={placeholder}
        />
        <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 text-gray-500 hover:text-black hover:bg-gray-100 z-10"
            onClick={() => setShowMapPicker(true)}
        >
            <MapPinned className="w-5 h-5" />
        </Button>
      </div>
      
      {/* Re-uses the MapPicker component */}
      <MapPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onLocationSelect={(loc) => onChange(loc)}
        title={placeholder}
        initialLocation={value}
      />
    </>
  );
};

// Auth Component
const RiderAuth = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "", surname: "", cellphone: "", password: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register/rider";
      const res = await api.post(endpoint, formData);

      if (res.data && res.data.token && res.data.user) {
        login(res.data.token, res.data.user);
        toast.success(isLogin ? t('welcome_back') : t('success'));
        navigate("/rider/dashboard");
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
      <Card className="w-full max-w-md glass-heavy">
        <CardHeader className="text-center relative">
          <div className="absolute right-4 top-4">
            <LanguageSelector variant="ghost" />
          </div>
          <Button
            variant="ghost"
            className="absolute left-4 top-4 text-secondary hover:text-white"
            onClick={() => navigate("/")}
            data-testid="back-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('back')}
          </Button>
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-secondary to-primary flex items-center justify-center mx-auto mb-4 mt-8">
            <Rocket className="w-10 h-10 text-black" />
          </div>
          <CardTitle className="text-2xl text-secondary font-heading">
            {isLogin ? t('welcome_back') : t('join_taksi')}
          </CardTitle>
          <CardDescription className="text-primary/70">
            {isLogin ? t('sign_in_book') : t('create_account')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rider-name" className="text-secondary">{t('first_name')}</Label>
                  <Input
                    id="rider-name"
                    name="name"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-background-secondary border-border text-white"
                    required
                    autoComplete="given-name"
                    data-testid="rider-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rider-surname" className="text-secondary">{t('last_name')}</Label>
                  <Input
                    id="rider-surname"
                    name="surname"
                    value={formData.surname}
                    onChange={e => setFormData({...formData, surname: e.target.value})}
                    className="bg-background-secondary border-border text-white"
                    required
                    autoComplete="family-name"
                    data-testid="rider-surname-input"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rider-phone" className="text-secondary">{t('phone_number')}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-secondary/50" />
                <Input
                  id="rider-phone"
                  name="cellphone"
                  type="tel"
                  value={formData.cellphone}
                  onChange={e => setFormData({...formData, cellphone: e.target.value})}
                  className="pl-10 bg-background-secondary border-border text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                  autoComplete="tel"
                  data-testid="rider-phone-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rider-password" className="text-secondary">{t('password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-secondary/50" />
                <Input
                  id="rider-password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="pl-10 bg-background-secondary border-border text-white"
                  required
                  autoComplete="current-password"
                  data-testid="rider-password-input"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-secondary to-primary text-black font-bold hover:shadow-neon-green transition-all"
              disabled={loading}
              data-testid="rider-auth-submit"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isLogin ? t('sign_in') : t('sign_up')}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="link" className="text-primary" onClick={() => setIsLogin(!isLogin)} data-testid="auth-toggle">
            {isLogin ? t('need_account') : t('have_account')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// --- LIVE WAIT TIMER COMPONENT ---
const WaitTimer = ({ arrivedAt, carType }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // Start from backend timestamp if provided, otherwise start from the moment this component renders
    const startTime = arrivedAt ? new Date(arrivedAt).getTime() : Date.now();
    
    // Tick every 1 second
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [arrivedAt]);

  const rules = PRICING_RULES[carType?.toLowerCase()] || PRICING_RULES.economy;
  const freeWaitSeconds = rules.freeWait * 60; 

  if (elapsed <= freeWaitSeconds) {
    // --- FREE TIME COUNTDOWN ---
    const remaining = freeWaitSeconds - elapsed;
    const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
    const secs = (remaining % 60).toString().padStart(2, '0');
    
    return (
      <div className="bg-purple-500/20 border border-purple-500 p-4 rounded-xl flex items-center justify-between">
        <div className="flex items-center text-purple-400">
          <Timer className="w-5 h-5 mr-2 animate-pulse" /> 
          <span className="font-medium">Driver Waiting</span>
        </div>
        <div className="text-right">
          <div className="text-purple-400 font-mono text-xl font-bold">{mins}:{secs}</div>
          <div className="text-purple-400/70 text-xs uppercase font-bold tracking-wider">Free Time</div>
        </div>
      </div>
    );
  } else {
    // --- CHARGEABLE WAIT TIME ---
    const overtime = elapsed - freeWaitSeconds;
    const mins = Math.floor(overtime / 60).toString().padStart(2, '0');
    const secs = (overtime % 60).toString().padStart(2, '0');
    
    // Calculate live accumulating fee based on the exact car type pricing
    const liveFee = ((overtime / 60) * rules.perMinWait).toFixed(2);
    
    return (
      <div className="bg-red-500/20 border border-red-500 p-4 rounded-xl flex items-center justify-between shadow-[0_0_15px_rgba(239,68,68,0.2)]">
        <div className="flex items-center text-red-400">
          <Timer className="w-5 h-5 mr-2 animate-pulse" /> 
          <span className="font-medium">Paid Wait Time</span>
        </div>
        <div className="text-right">
          <div className="text-red-400 font-mono text-xl font-bold">-{mins}:{secs}</div>
          <div className="text-red-400 font-bold text-sm">+₾{liveFee}</div>
        </div>
      </div>
    );
  }
};

// Dashboard Component
const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("book");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPayPal, setShowPayPal] = useState(false);

  // --- CARD PAYMENT STATE ---
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardDetails, setCardDetails] = useState({ number: "", expiry: "", cvv: "" });
  const [completedRideData, setCompletedRideData] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Handle formatted input
  const handleCardInput = (field, value) => {
    let formatted = value;

    if (field === "number") {
      // Allow only numbers, max 16 digits
      formatted = value.replace(/\D/g, "").slice(0, 16);
    } else if (field === "expiry") {
      // Format as MM/YY
      formatted = value.replace(/\D/g, "").slice(0, 4);
      if (formatted.length >= 3) formatted = `${formatted.slice(0, 2)}/${formatted.slice(2)}`;
    } else if (field === "cvv") {
      // Max 3 digits
      formatted = value.replace(/\D/g, "").slice(0, 3);
    }

    setCardDetails({ ...cardDetails, [field]: formatted });
  };

  // Process the Card Payment
  const handleCardPayment = async (e) => {
    e.preventDefault();
    if (cardDetails.number.length < 16 || cardDetails.expiry.length < 5 || cardDetails.cvv.length < 3) {
        return toast.error("Please complete card details");
    }

    setLoading(true);
    // Simulate API processing time
    setTimeout(() => {
        setLoading(false);
        setShowCardModal(false);
        toast.success("Payment Method Verified");
        processRideRequest(); // Proceed to book the ride
    }, 1500);
  };

  // Booking state
  const [pickup, setPickup] = useState({ address: "", lat: null, lng: null });
  const [destination, setDestination] = useState({ address: "", lat: null, lng: null });
  const [stops, setStops] = useState([]);
  const [carType, setCarType] = useState("economy");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // Route info
  const [routeInfo, setRouteInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);

  // Surge pricing
  const [surgeInfo, setSurgeInfo] = useState(null);

  // Exchange rate GEL to USD (approx)
  const GEL_TO_USD = 0.37;

  // Load Google Maps
  useEffect(() => {
    if (window.google) {
      setMapsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    script.onerror = () => {
      toast.error("Failed to load Google Maps. Check API key/network.");
      console.error("Google Maps script failed");
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
    fetchSurgeStatus();
  }, []);

  useEffect(() => {
    if (pickup.lat) {
      fetchSurgeStatus();
    }
  }, [pickup.lat, pickup.lng]);

 // 🔥 FIXED: Route Calculator (Prevents Infinite Loop Crash)
  const calculateRoute = useCallback(() => {
    if (!window.google || !pickup.lat || !destination.lat) return;

    try {
      const directionsService = new window.google.maps.DirectionsService();

      // Ensure stops are valid numbers
      const waypoints = stops
        .filter(s => s.lat && s.lng)
        .map(s => ({
          location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) },
          stopover: true
        }));

      directionsService.route({
        origin: { lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng) },
        destination: { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) },
        waypoints: waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING
      }, (res, status) => {
        if (status === 'OK' && res.routes[0] && res.routes[0].legs) {
          let d = 0, t = 0;
          res.routes[0].legs.forEach(l => {
            d += l.distance.value;
            t += l.duration.value;
          });

          const newDist = Math.round(d / 100) / 10;
          const newDur = Math.round(t / 60);

          // 🔥 CRITICAL FIX: Loop Stopper
          // Only update state if the values are ACTUALLY different.
          setRouteInfo(prev => {
            if (prev && prev.distance === newDist && prev.duration === newDur) return prev;
            return { distance: newDist, duration: newDur };
          });
        } else {
          console.warn("Route failed:", status);
        }
      });
    } catch (err) {
      console.error("Route Error:", err);
    }
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, stops.length]);

  // 🔥 TRIGGER: Only run when NUMBERS change (Debounced)
  useEffect(() => {
    if (mapsLoaded && pickup.lat && destination.lat) {
      const timer = setTimeout(() => {
        calculateRoute();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mapsLoaded, pickup.lat, pickup.lng, destination.lat, destination.lng, stops.length, calculateRoute]);

  // 🔥 FIX: Added 'paymentMethod' to dependency array so price updates instantly
  useEffect(() => {
    if (routeInfo) {
      const surge = surgeInfo?.multiplier || 1.0;
      const fare = calculateFare(carType, routeInfo.distance, 0, 0, stops.length, surge, paymentMethod);
      setFareEstimate(fare);
    }
  }, [routeInfo, carType, stops.length, surgeInfo, paymentMethod]);

  // 🔥 POLL FOR ACTIVE RIDE
  useEffect(() => {
    let interval;
    if (activeRide && !["completed", "cancelled", "no_drivers"].includes(activeRide.status)) {
      interval = setInterval(fetchActiveRide, 3000);
    }
    return () => clearInterval(interval);
  }, [activeRide?.status]);

  const fetchSurgeStatus = async () => {
    try {
      const params = pickup.lat ? `?lat=${pickup.lat}&lng=${pickup.lng}` : '';
      const res = await api.get(`/surge/status${params}`);
      setSurgeInfo(res.data);
    } catch (error) {
      console.error("Error fetching surge:", error);
    }
  };

  const fetchActiveRide = async () => {
    try {
      // 🔥 THE FIX: If we already have a ride, target-lock onto its specific ID!
      if (activeRide && activeRide.id) {
        const res = await api.get(`/rides/${activeRide.id}`);
        if (res.data) {
          setActiveRide(res.data);
        }
      } else {
        // If we don't have a ride yet, ask the backend if we left one running
        const res = await api.get("/rider/active-ride");
        if (res.data) {
          setActiveRide(res.data);
        }
      }
    } catch (error) {
      // If the backend returns 404/Empty, don't crash, just wait.
      console.error("Error fetching active ride:", error);
    }
  };

  const fetchRideHistory = async () => {
    try {
      const res = await api.get(`/rider/history`);
      setRideHistory(res.data.rides || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const addStop = () => {
    if (stops.length < 3) {
      setStops([...stops, { address: "", lat: null, lng: null, order: stops.length }]);
    } else {
      toast.error("Maximum 3 stops allowed");
    }
  };

  const updateStop = (index, data) => {
    const newStops = [...stops];
    newStops[index] = { ...newStops[index], ...data };
    setStops(newStops);
  };

  const removeStop = (index) => {
    setStops(stops.filter((_, i) => i !== index));
  };

  const handleBookRide = async () => {
    if (!pickup.lat || !pickup.address) {
      toast.error("Please select a pickup address");
      return;
    }

    // Trigger the real PayPal integration
    if (paymentMethod === "card") {
      setShowPayPal(true);
      return;
    }

    // Otherwise, book immediately (Cash)
    await processRideRequest();
  };

  const processRideRequest = async () => {
    setLoading(true);
    try {
      const rideData = {
        pickup: pickup.address,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        destination: destination.address || null,
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        stops: stops.filter(s => s.lat).map((s, i) => ({
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          order: i
        })),
        carType,
        paymentMethod,
        estimatedDistance: routeInfo?.distance || 5,
        estimatedDuration: routeInfo?.duration || 15
      };

      const res = await api.post(`/rides/request`, rideData);

      toast.success("Ride requested! Searching for drivers...");
      setActiveRide({
        id: res.data.ride_id,
        status: "searching",
        estimated_fare: res.data.estimated_fare,
        fare_breakdown: res.data.fare_breakdown
      });
      setActiveTab("active");

      pollRideStatus(res.data.ride_id);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request ride");
    } finally {
      setLoading(false);
      setShowPayPal(false);
    }
  };

  const pollRideStatus = async (rideId) => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/rides/${rideId}`);
        setActiveRide(res.data);

        if (["completed", "cancelled", "no_drivers"].includes(res.data.status)) {
          clearInterval(interval);
          
          if (res.data.status === "completed") {
            // Store the completed ride data to show in modal
            setCompletedRideData({
              id: res.data.id,
              final_fare: res.data.final_fare || res.data.estimated_fare,
              payment_method: res.data.payment_method,
              driver_name: res.data.driver_info?.name || res.data.driver_name
            });
            
            fetchRideHistory();
            
            // Clear active ride after short delay
            setTimeout(() => {
              setActiveRide(null);
              setActiveTab("book");
            }, 500);
            
          } else if (res.data.status === "no_drivers") {
            toast.error("No drivers available. Please try again.");
          }
        } else if (res.data.status === "accepted" && res.data.driver_info) {
  // Only show the toast IF we haven't shown it yet
  if (!notifiedAccepted.current) {
    toast.success(`Driver ${res.data.driver_info.name} is coming!`);
    notifiedAccepted.current = true;
  }
}
      } catch (error) {
        clearInterval(interval);
      }
    }, 3000);
  };

  const handleCancelRide = async () => {
    if (!activeRide) return;

    try {
      await api.post(`/rides/${activeRide.id}/cancel`);
      toast.success("Ride cancelled");
      setActiveRide(null);
      setActiveTab("book");
    } catch (error) {
      toast.error("Failed to cancel ride");
    }
  };

  const handleRetryRide = async () => {
    if (!activeRide) return;

    try {
      const res = await api.post(`/rides/${activeRide.id}/retry`);
      toast.success("Searching for drivers again...");
      setActiveRide(prev => ({ ...prev, status: 'searching', matching_status: 'Retrying - Searching within 3km' }));
      pollRideStatus(activeRide.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to retry ride");
    }
  };

  const handleRideUpdate = (updatedData) => {
    setActiveRide(prev => ({ ...prev, ...updatedData }));
    calculateRoute();
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by your browser. Enter address manually.");
      return;
    }


    setLocationLoading(true);
    const safetyTimer = setTimeout(() => {
      setLocationLoading(false);
      toast.error("Location request timed out. Try again or enter manually.");
    }, 15000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(safetyTimer);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (!window.google) {
          setLocationLoading(false);
          toast.error("Maps not loaded. Using coordinates only.");
          setPickup({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
          return;
        }

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          setLocationLoading(false);
          if (status === 'OK' && results[0]) {
            setPickup({
              address: results[0].formatted_address,
              lat,
              lng
            });
            toast.success("Location detected!");
          } else {
            setPickup({
              address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
              lat,
              lng
            });
            toast.warning("Address lookup failed, using coordinates");
          }
        });
      },
      (error) => {
        clearTimeout(safetyTimer);
        setLocationLoading(false);
        let msg = "Could not get location.";
        if (error.code === 1) msg = "Location access denied. Enable in browser settings and try again.";
        else if (error.code === 2) msg = "Location unavailable. Check GPS/WiFi.";
        else if (error.code === 3) msg = "Request timed out. Try again.";
        toast.error(msg);
        console.error("Geolocation error:", error);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 🔥 AUTO-LOCATE RIDER ON APP LOAD
  useEffect(() => {
    // As soon as Google Maps is ready, and if we don't already have a pickup set, find the user!
    if (mapsLoaded && !pickup.lat) {
      getCurrentLocation();
    }
  }, [mapsLoaded]);

  const carTypes = Object.entries(PRICING_RULES).map(([key, val]) => ({
    value: key,
    label: val.name,
    icon: val.icon,
    base: val.base
  }));

  const statusColors = {
    searching: "bg-yellow-500 text-black",
    accepted: "bg-blue-500 text-white",
    arrived: "bg-purple-500 text-white",
    in_progress: "bg-[#00ff88] text-black",
    completed: "bg-green-600 text-white",
    cancelled: "bg-red-500 text-white",
    no_drivers: "bg-gray-500 text-white"
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-black/50 backdrop-blur-xl border-b border-[#00ff88]/20 p-4 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center">
              <Rocket className="w-5 h-5 text-black" />
            </div>
            <div>
              <p className="text-[#00ff88] font-semibold">{user?.name} {user?.surname}</p>
              <p className="text-[#00d4ff]/60 text-sm">Balance: ₾{user?.wallet_balance?.toFixed(2) || "0.00"}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" className="text-[#00ff88]" onClick={() => navigate("/")}>
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-[#00ff88]" onClick={logout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-4 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 bg-black/50 border border-[#00ff88]/20 mb-6">
            <TabsTrigger value="book" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <Car className="w-4 h-4 mr-2" /> Book
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <Navigation className="w-4 h-4 mr-2" /> Active
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <History className="w-4 h-4 mr-2" /> History
            </TabsTrigger>
            <TabsTrigger value="profile" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <User className="w-4 h-4 mr-2" /> Profile
            </TabsTrigger>
          </TabsList>

          {/* Book Tab */}
          <TabsContent value="book">
            <Card className="glass-heavy border-secondary/30">
              <CardHeader>
                <CardTitle className="text-secondary flex items-center font-heading">
                  <Rocket className="w-5 h-5 mr-2" /> {t('book_ride')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Visual Route Map */}
                {/* Visual Route Map */}
                {mapsLoaded && pickup.lat && destination.lat && (
                  <LiveTrackingMap
                    pickup={pickup}
                    destination={destination}
                    stops={stops}
                    status="preview"
                    driverLocation={null} 
                  />
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pickup-input" className="text-secondary">{t('pickup_location')}</Label>
                    <Button variant="ghost" size="sm" className="text-primary h-6" onClick={getCurrentLocation} disabled={locationLoading}>
                      {locationLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Crosshair className="w-3 h-3 mr-1" />} {t('use_my_location')}
                    </Button>
                  </div>
                  <LocationInput id="pickup-input" name="pickup" value={pickup} onChange={setPickup} placeholder={t('where_pickup')} icon={MapPin} iconColor="text-secondary" />
                </div>
                {stops.map((stop, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`stop-${index}`} className="text-yellow-400">{t('stops')} {index + 1}</Label>
                      <Button variant="ghost" size="sm" className="text-red-400 h-6" onClick={() => removeStop(index)}><X className="w-3 h-3" /></Button>
                    </div>
                    <LocationInput id={`stop-${index}`} name={`stop_${index}`} value={stop} onChange={(data) => updateStop(index, data)} placeholder={t('stop_address')} icon={MapPin} iconColor="text-yellow-400" />
                  </div>
                ))}
                {stops.length < 3 && <Button variant="outline" className="w-full border-dashed border-yellow-400/30 text-yellow-400" onClick={addStop}><Plus className="w-4 h-4 mr-2" /> {t('add_stop_free')}</Button>}
                <div className="space-y-2">
                  <Label htmlFor="destination-input" className="text-primary">{t('destination')}</Label>
                  <LocationInput id="destination-input" name="destination" value={destination} onChange={setDestination} placeholder={t('where_going')} icon={Navigation} iconColor="text-primary" />
                </div>
                {surgeInfo?.is_surge && (
                  <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center"><TrendingUp className="w-5 h-5 text-orange-400 mr-2" /><div><p className="text-orange-400 font-bold">{t('surge_active')}</p><p className="text-orange-300/70 text-sm">{surgeInfo.surge_reason}</p></div></div>
                      <Badge className="bg-orange-500 text-black text-lg px-3 py-1">x{surgeInfo.multiplier}</Badge>
                    </div>
                  </div>
                )}
                {routeInfo && (
                  <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2 text-secondary">
                      <span className="flex items-center"><RouteIcon className="w-4 h-4 mr-1" /> {t('route')}</span>
                      <span className="font-bold">{routeInfo.distance} {t('km')} • ~{routeInfo.duration} {t('min')}</span>
                    </div>
                    {fareEstimate && (
                        <div className="flex flex-col">
                            <div className="flex justify-between text-lg text-secondary font-bold">
                                <span>{t('estimated_total')}</span>
                                <span>₾{fareEstimate.total.toFixed(2)}</span>
                            </div>
                            {paymentMethod === 'card' && (
                                <p className="text-xs text-primary text-right mt-1">{t('card_fee_included')}</p>
                            )}
                        </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-secondary">{t('vehicle_class')}</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {carTypes.map((type) => {
                      const typeFare = routeInfo ? calculateFare(type.value, routeInfo.distance, 0, 0, stops.length, surgeInfo?.multiplier || 1.0, paymentMethod).total : type.base * (surgeInfo?.multiplier || 1.0);
                      return <button key={type.value} onClick={() => setCarType(type.value)} className={`p-3 rounded-xl border-2 transition-all ${carType === type.value ? "border-secondary bg-secondary/20 shadow-neon-green" : "border-secondary/20 bg-background-secondary"}`}><div className="text-2xl mb-1">{type.icon}</div><div className="text-white font-medium text-xs">{type.label}</div><div className="text-secondary text-sm">₾{typeFare.toFixed(2)}</div></button>;
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-secondary">{t('payment')}</Label>
                  <div className="flex gap-2">
                    <Button variant={paymentMethod === "cash" ? "default" : "outline"} onClick={() => setPaymentMethod("cash")} className={paymentMethod === "cash" ? "bg-secondary text-black" : "border-secondary/30 text-white"}>{t('cash')}</Button>
                    <Button variant={paymentMethod === "card" ? "default" : "outline"} onClick={() => setPaymentMethod("card")} className={paymentMethod === "card" ? "bg-secondary text-black" : "border-secondary/30 text-white"}>{t('card')}</Button>
                  </div>
                </div>
                <Button
    className="w-full bg-gradient-to-r from-secondary to-primary text-black font-bold h-14 text-lg hover:shadow-neon-green transition-all"
    onClick={handleBookRide}
    disabled={loading}
    data-testid="request-ride-btn"
>
    {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Rocket className="w-5 h-5 mr-2" />}
    {t('request_ride')}
</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 🔥 THE MISSING CARD MODAL */}
        <Dialog open={showCardModal} onOpenChange={setShowCardModal}>
          <DialogContent className="bg-[#1a1a2e] border border-[#00ff88]/30 text-white sm:max-w-md w-[95%]">
            <DialogHeader>
              <DialogTitle className="text-[#00ff88] flex items-center gap-2">
                <CreditCard className="w-5 h-5"/> Pay with Card
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCardPayment} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="text-gray-400 text-xs">CARD NUMBER</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-3.5 h-5 w-5 text-gray-500" />
                  <Input
                    value={cardDetails.number}
                    onChange={(e)=>handleCardInput("number", e.target.value)}
                    placeholder="0000 0000 0000 0000"
                    className="pl-10 bg-black/50 border-[#00ff88]/30 text-white h-12"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-xs">EXPIRY</Label>
                    <Input value={cardDetails.expiry} onChange={(e)=>handleCardInput("expiry", e.target.value)} placeholder="MM/YY" className="bg-black/50 border-[#00ff88]/30 text-white h-12 text-center" inputMode="numeric"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-xs">CVV</Label>
                    <Input value={cardDetails.cvv} onChange={(e)=>handleCardInput("cvv", e.target.value)} placeholder="123" className="bg-black/50 border-[#00ff88]/30 text-white h-12 text-center" inputMode="numeric" type="password"/>
                  </div>
              </div>
              <Button type="submit" className="w-full bg-[#00ff88] text-black font-bold h-12" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : `Pay`}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

          {/* 👇 Add this opening line to check if Card is selected 👇 */}
{paymentMethod === "card" && (
  <div className="mt-4 w-full animate-in fade-in slide-in-from-top-4">
    <PayPalButtons
      fundingSource="card"
      style={{ layout: "vertical", shape: "rect" }}
      createOrder={(data, actions) => {
        return actions.order.create({
          purchase_units: [{
            amount: {
              value: (fareEstimate.total * 0.37).toFixed(2),
              currency_code: "USD"
            }
          }],
          application_context: {
            shipping_preference: "NO_SHIPPING" // 🔥 This deletes the address/zip code fields
          }
        });
      }}
      onApprove={async (data, actions) => {
        await actions.order.capture();
        toast.success("Payment successful!");
        await processRideRequest();
      }}
    />
  </div>
)}

          {/* Active Tab */}
          <TabsContent value="active">
            {activeRide ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-[#00d4ff]">Active Ride</CardTitle>
                    <Badge className={statusColors[activeRide.status]}>{activeRide.status?.replace(/_/g, ' ').toUpperCase()}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-white">

                  {/* 🔥 NEW IMPROVED MAP RENDER */}
                  {/* 🔥 NEW IMPROVED MAP RENDER */}
                  {mapsLoaded && activeRide && (
                    <div className="w-full rounded-xl overflow-hidden mb-4 border border-[#00ff88]/20 relative">
                      <LiveTrackingMap
    status={activeRide.status} 
    driverLocation={activeRide.driver_location} 
    pickup={{ lat: parseFloat(activeRide.pickup_lat || activeRide.pickupLat), lng: parseFloat(activeRide.pickup_lng || activeRide.pickupLng) }} 
    
    // 🔥 FIX: Covers all naming conventions so the line actually draws!
    destination={ (activeRide.dest_lat || activeRide.destination_lat || activeRide.destinationLat) 
      ? { 
          lat: parseFloat(activeRide.dest_lat || activeRide.destination_lat || activeRide.destinationLat), 
          lng: parseFloat(activeRide.dest_lng || activeRide.destination_lng || activeRide.destinationLng) 
        } 
      : null 
    } 
    
    stops={activeRide.stops || []} 
  />

                      {/* Status Overlay */}
                      <div className="absolute top-2 left-2 bg-black/80 backdrop-blur px-3 py-1 rounded-full border border-white/10 z-10">
                        <p className="text-xs text-white font-bold uppercase animate-pulse">
                          {activeRide.status === 'in_progress' ? '● Live Trip' : '● Driver Arriving'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Trip Details */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-[#00ff88]/60 text-sm">Pickup</p>
                      <p>{activeRide.pickup}</p>
                    </div>
                    {activeRide.stops?.length > 0 && (
                      <div>
                        <p className="text-yellow-400/60 text-sm">Stops ({activeRide.stops.length})</p>
                        {activeRide.stops.map((stop, i) => (
                          <p key={i} className="text-sm text-yellow-400">• {stop.address}</p>
                        ))}
                      </div>
                    )}
                    <div>
                      <p className="text-[#00d4ff]/60 text-sm">Destination</p>
                      <p>{activeRide.destination || "Open Trip"}</p>
                    </div>
                  </div>

                  {/* Searching Status */}
                  {activeRide.status === "searching" && (
                    <div className="bg-yellow-500/20 border border-yellow-500 p-4 rounded-xl space-y-2">
                      <div className="flex items-center">
                        <Loader2 className="w-5 h-5 animate-spin mr-3 text-yellow-400" />
                        <span className="text-yellow-400 font-medium">
                          {activeRide.matching_status || "Searching for drivers..."}
                        </span>
                      </div>
                      {activeRide.drivers_notified_count > 0 && (
                        <p className="text-yellow-400/70 text-sm pl-8">
                          {activeRide.drivers_notified_count} drivers notified
                        </p>
                      )}
                    </div>
                  )}

                  {/* No Drivers Status */}
                  {activeRide.status === "no_drivers" && (
                    <div className="bg-gray-500/20 border border-gray-500 p-4 rounded-xl space-y-3">
                      <div className="flex items-center text-gray-300">
                        <Target className="w-5 h-5 mr-2" />
                        <span className="font-medium">No drivers available</span>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1 bg-[#00ff88] text-black font-bold" onClick={handleRetryRide}>
                          <Rocket className="w-4 h-4 mr-2" /> Retry Search
                        </Button>
                        <Button
                          variant="outline"
                          className="border-gray-500 text-gray-300"
                          onClick={() => { setActiveRide(null); setActiveTab("book"); }}
                        >
                          New Ride
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Driver Info & Secure ID View */}
{activeRide.driver_info && (
  <div className="bg-black/60 rounded-xl p-5 border border-[#00ff88]/30 shadow-[0_0_20px_rgba(0,255,136,0.1)] space-y-4">
    <div className="flex justify-between items-center border-b border-gray-800 pb-3">
      <p className="text-[#00ff88] font-bold uppercase tracking-widest text-xs">Driver Assigned</p>
      <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/50"><Lock className="w-3 h-3 mr-1"/> Background Checked</Badge>
    </div>
    
    <div className="flex items-center space-x-4">
      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center overflow-hidden border-2 border-[#00ff88]">
        {activeRide.driver_info.profile_pic ? (
          <img src={activeRide.driver_info.profile_pic} alt="Driver" className="w-full h-full object-cover" />
        ) : (
          <User className="w-8 h-8 text-black" />
        )}
      </div>
      <div className="flex-1">
        <p className="font-bold text-2xl text-white">{activeRide.driver_info.name}</p>
        <div className="flex items-center text-sm text-gray-300 mt-1">
          <Car className="w-4 h-4 mr-1 text-[#00d4ff]" />
          {/* Added car color here */}
          <span>{activeRide.driver_info.car_color || "Dark"} {activeRide.driver_info.car_make} {activeRide.driver_info.car_model}</span>
        </div>
        <div className="inline-block mt-2 px-3 py-1 bg-[#00ff88]/10 border border-[#00ff88]/50 rounded-md">
          {/* Prominent License Plate */}
          <p className="text-[#00ff88] font-mono font-bold tracking-widest text-xl uppercase">{activeRide.driver_info.license_plate}</p>
        </div>
      </div>
    </div>

    {/* Redacted Driver's License Section */}
    <div className="mt-4 pt-4 border-t border-gray-800">
      <p className="text-gray-400 text-xs mb-2 flex items-center"><User className="w-3 h-3 mr-1"/> Verified License Document</p>
      <div className="relative w-full h-32 bg-gray-900 rounded-lg overflow-hidden border border-gray-700 select-none pointer-events-none">
        <img 
          src={activeRide.driver_info.license_photo || "/api/placeholder/400/200"} 
          alt="License" 
          className="w-full h-full object-cover opacity-50 blur-[2px]" 
        />
        <div className="absolute top-2 left-2 w-16 h-20 border border-[#00ff88]/30 rounded"></div>
        
        <div className="absolute bottom-0 left-0 right-0 h-[70%] backdrop-blur-2xl bg-black/80 flex flex-col items-center justify-center">
          <div className="flex items-center text-red-500 font-bold mb-1">
            <Lock className="w-4 h-4 mr-2" /> PII REDACTED
          </div>
          <span className="text-gray-400 text-[10px] font-mono tracking-widest text-center px-4">
            SENSITIVE INFORMATION BLOCKED FOR DRIVER PRIVACY.<br/>IDENTITY VERIFIED BY ADMIN.
          </span>
        </div>
      </div>
      <div className="mt-4">
        <RideCommunication 
          rideId={activeRide.id}
          otherPartyPhone={activeRide.driver_info.cellphone}
          otherPartyName={activeRide.driver_info.name}
          currentUserId={user?.id}
          isDriver={false} 
        />
      </div>

    </div>
  </div>
)}
                  {/* Live Arrived Timer */}
  {activeRide.status === "arrived" && (
    <WaitTimer 
      arrivedAt={activeRide.arrived_at} 
      carType={activeRide.carType || carType} 
    />
  )}

                  {/* Fare & Cancel */}
                  <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4">
                    <span className="text-[#00ff88]">Estimated Fare</span>
                    <span className="text-2xl font-bold text-[#00ff88]">
                      ₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}
                    </span>
                  </div>
                  
                  {["searching", "accepted"].includes(activeRide.status) && (
                    <Button variant="destructive" className="w-full" onClick={handleCancelRide}>
                      Cancel Ride
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-center py-12">
                <Navigation className="w-20 h-20 mx-auto text-[#00ff88]/30 mb-4" />
                <p className="text-[#00ff88]/60 text-lg">No active ride</p>
                <Button className="mt-6 bg-[#00ff88] text-black font-bold" onClick={() => setActiveTab("book")}>
                  Book a Ride
                </Button>
              </Card>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
              <CardHeader>
                <CardTitle className="text-[#00ff88]">Ride History</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {rideHistory.map((ride) => (
                      <div key={ride.id} className="bg-black/50 border border-[#00ff88]/10 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between">
                          <Badge className={statusColors[ride.status]}>
                            {ride.status?.replace(/_/g, ' ').toUpperCase()}
                          </Badge>
                          <span className="text-gray-400 text-sm">
                            {ride.created_at ? new Date(ride.created_at).toLocaleDateString() : "N/A"}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-[#00ff88]/60">From: {ride.pickup}</p>
                          <p className="text-sm text-[#00d4ff]/60">To: {ride.destination || "Open"}</p>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 capitalize">{ride.carType}</span>
                          <span className="text-[#00ff88] font-bold">
                            ₾{(ride.final_fare || ride.estimated_fare)?.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
              <CardHeader>
                <CardTitle className="text-[#00ff88]">Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center">
                    <User className="w-10 h-10 text-black" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">{user?.name} {user?.surname}</h3>
                    <p className="text-[#00d4ff]">{user?.cellphone}</p>
                  </div>
                </div>
                <Separator className="bg-[#00ff88]/20" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/50 border border-[#00ff88]/20 rounded-xl p-4 text-center">
                    <Car className="w-8 h-8 mx-auto text-[#00d4ff] mb-2" />
                    <p className="text-2xl font-bold">{user?.total_rides || 0}</p>
                    <p className="text-[#00ff88]/60 text-sm">Total Rides</p>
                  </div>
                  <div className="bg-black/50 border border-[#00ff88]/20 rounded-xl p-4 text-center">
                    <Star className="w-8 h-8 mx-auto text-yellow-400 mb-2" />
                    <p className="text-2xl font-bold">{user?.rating?.toFixed(1) || "5.0"}</p>
                    <p className="text-[#00ff88]/60 text-sm">Rating</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Trip Completion Modal */}
      <RiderTripCompletionModal
        isOpen={!!completedRideData}
        onClose={() => setCompletedRideData(null)}
        fareAmount={completedRideData?.final_fare}
        paymentMethod={completedRideData?.payment_method}
        driverName={completedRideData?.driver_name}
        onRateDriver={() => {
          setShowRatingModal(true);
          setCompletedRideData(null);
        }}
      />

      {/* Rating Modal */}
      <RatingModal
        isOpen={showRatingModal}
        onClose={() => setShowRatingModal(false)}
        rideId={completedRideData?.id}
        ratingType="driver"
        driverName={completedRideData?.driver_name}
        onRatingComplete={() => {
          setShowRatingModal(false);
          toast.success(t('rating_submitted') || "Thanks for your feedback!");
        }}
      />
    </div>
  );
};

// Main Router
const RiderPortal = () => {
  const { user } = useAuth();
  const location = useLocation();
  const notifiedAccepted = useRef(false);

  if (!user || user.user_type !== "rider") {
    if (location.pathname === "/rider" || location.pathname === "/rider/") {
      return <RiderAuth />;
    }
    return <Navigate to="/rider" replace />;
  }

  return (
    <PayPalScriptProvider options={{
      "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
      currency: "USD"
    }}>
      <Routes>
        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<RiderDashboard />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default RiderPortal;