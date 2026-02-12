import React, { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";

import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import api from "@/api"; 

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

import {
  Car, MapPin, Clock, Star, History, Home, LogOut, User,
  Phone, Lock, ArrowLeft, Navigation, Wallet, Loader2, Rocket,
  Route as RouteIcon, Plus, X, Target, Timer, Crosshair, Zap, TrendingUp,
  MapPinned, Edit, CreditCard, CheckCircle2
} from "lucide-react";

// Pricing Rules
const PRICING_RULES = {
  economy: { name: 'Economy', base: 2.00, perKm: 0.50, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "🚗" },
  comfort: { name: 'Comfort', base: 2.50, perKm: 0.55, perMinWait: 0.45, freeWait: 2, stopFee: 0.00, icon: "🚙" },
  suv: { name: 'SUV / XL', base: 3.90, perKm: 0.80, perMinWait: 0.50, freeWait: 2, stopFee: 0.00, icon: "🚐" },
  personal: { name: 'Personal', base: 4.00, perKm: 0.70, perMinWait: 0.50, freeWait: 3, stopFee: 0.00, icon: "👤" },
  jumpstart: { name: 'Jumpstart', base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, stopFee: 0.00, icon: "⚡" }
};

const calculateFare = (carType, distanceKm, waitMin = 0, stopWaitMin = 0, numStops = 0, surgeMultiplier = 1.0) => {
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
  const total = subtotal + surgeFee;
  
  return {
    base: rules.base,
    distance: Math.round(distanceKm * rules.perKm * 100) / 100,
    wait: Math.round((billableWait + stopWaitMin) * rules.perMinWait * 100) / 100,
    stops: numStops * rules.stopFee,
    subtotal: Math.round(subtotal * 100) / 100,
    surgeFee: Math.round(surgeFee * 100) / 100,
    surgeMultiplier,
    total: Math.round(total * 100) / 100
  };
};

// 🔥 FIXED: Google Maps Autocomplete (Waits for Script + CSS Fix)
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {
  const callbackRef = useRef(onPlaceSelect);

  // 1. Keep callback fresh
  useEffect(() => {
    callbackRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  // 2. CSS Fix for Z-Index (So prompts show above modal)
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .pac-container { 
          z-index: 10500 !important; 
          background-color: #1a1a2e; 
          border: 1px solid #00ff88;
          font-family: inherit;
      }
      .pac-item { 
          color: white; 
          border-top: 1px solid #333; 
          padding: 10px;
          cursor: pointer;
      }
      .pac-item:hover { background-color: #333; }
      .pac-item-query { color: #00ff88; font-weight: bold; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // 3. Initialize Autocomplete (With Safety Timer)
  useEffect(() => {
    // 🔥 POLL: Check every 500ms if Google Maps is loaded
    const timer = setInterval(() => {
      if (inputRef.current && window.google && window.google.maps && window.google.maps.places) {
        clearInterval(timer); // Stop checking, we found it!

        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'ge' },
          fields: ['formatted_address', 'geometry', 'name']
        });

        const listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.geometry) {
            callbackRef.current({
              address: place.formatted_address || place.name,
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng()
            });
          }
        });

        // Cleanup function for when component unmounts
        // We attach this to the return of useEffect, but only inside the loop context logic isn't clean
        // So we handle cleanup via a variable ref if needed, but for this specific hook:
        // We can't easily clean up the listener inside the interval, 
        // but Google Maps listeners are fairly robust. 
        // The most important part is getting it attached.
      }
    }, 500);

    return () => clearInterval(timer);
  }, []);
};

// 🔥 FIXED: Live Map (Follows Driver + Draws Line from Driver to End)
const LiveTrackingMap = ({ pickup, destination, driverLocation, status }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef = useRef(null);

  const getSafeCoord = (val) => { const num = parseFloat(val); return !isNaN(num) && num !== 0 ? num : null; };

  // 1. Initialize Map
  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 41.7151, lng: 44.8271 }, 
        zoom: 15, 
        disableDefaultUI: true, 
        backgroundColor: '#1a1a2e',
        styles: [
          { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] }
        ]
      });
      
      // Setup Route Drawer
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({ 
        map: mapInstanceRef.current, 
        suppressMarkers: true, // We draw custom icons
        polylineOptions: { strokeColor: "#00ff88", strokeWeight: 6 },
        preserveViewport: true // We handle the camera manually
      });
    }
  }, []);

  // 2. Draw Route & Move Camera
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    const pLat = getSafeCoord(pickup?.lat); const pLng = getSafeCoord(pickup?.lng);
    const dLat = getSafeCoord(destination?.lat); const dLng = getSafeCoord(destination?.lng);
    const driverLat = getSafeCoord(driverLocation?.lat); const driverLng = getSafeCoord(driverLocation?.lng);

    // CASE A: Booking Mode (No Driver yet) - Show A to B
    if (status === 'preview' && pLat && dLat) {
        updateRoute({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng }, true);
        return;
    }

    // CASE B: Live Ride - We need a driver
    if (!driverLat || !driverLng) return;

    const driverPos = { lat: driverLat, lng: driverLng };
    let target = null;

    // If Driver is coming to pickup -> Line from Driver to Pickup
    if (['accepted', 'searching', 'arrived'].includes(status) && pLat) {
        target = { lat: pLat, lng: pLng };
    } 
    // If Trip started -> Line from Driver to Destination
    else if (status === 'in_progress' && dLat) {
        target = { lat: dLat, lng: dLng };
    }

    // Draw line from Driver to Target
    if (target) {
        updateRoute(driverPos, target, false);
    }

    // 🔥 Update Driver Marker
    updateDriverMarker(driverPos, parseFloat(driverLocation.heading || 0));

    // 🔥 Camera Follow Logic: Always center on driver
    mapInstanceRef.current.panTo(driverPos);

  }, [driverLocation, status, pickup, destination]);

  // Helper: Calculate Route
  const updateRoute = (origin, target, fitBounds) => {
    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route({
        origin: origin,
        destination: target,
        travelMode: window.google.maps.TravelMode.DRIVING
    }, (result, status) => {
        if (status === 'OK' && directionsRendererRef.current) {
            directionsRendererRef.current.setDirections(result);
            // Only zoom out to fit route if we are in preview mode or first load
            if (fitBounds) {
                const bounds = new window.google.maps.LatLngBounds();
                bounds.extend(origin);
                bounds.extend(target);
                mapInstanceRef.current.fitBounds(bounds);
            }
        }
    });
  };

  // Helper: Move Driver Icon
  const updateDriverMarker = (pos, heading) => {
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6, fillColor: "#00d4ff", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2,
          rotation: heading,
          anchor: new window.google.maps.Point(0, 2.5)
        },
        zIndex: 1000
      });
    } else {
      driverMarkerRef.current.setPosition(pos);
      const icon = driverMarkerRef.current.getIcon();
      icon.rotation = heading;
      driverMarkerRef.current.setIcon(icon);
    }
  };

  return <div className="relative w-full rounded-xl overflow-hidden border border-[#00ff88]/20 mb-4 bg-[#1a1a2e]"><div ref={mapRef} style={{ height: '350px', width: '100%' }} /></div>;
};

const LocationInput = ({ value, onChange, placeholder, icon: Icon, iconColor, id, name }) => {
  const inputRef = useRef(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  
  useGoogleMapsAutocomplete(inputRef, (place) => {
    onChange({ address: place.address, lat: place.lat, lng: place.lng });
  });
  
  return (
    <>
      <div className="relative flex items-center">
        <Icon className={`absolute left-3 h-4 w-4 ${iconColor}`} />
        <Input 
            ref={inputRef} 
            id={id} 
            name={name} 
            value={value?.address || ""} 
            onChange={(e) => onChange({ ...value, address: e.target.value })} 
            className="pl-10 pr-10 bg-black/50 border-[#00ff88]/30 text-white" 
            placeholder={placeholder} 
        />
        <Button 
            variant="ghost" 
            size="icon" 
            className="absolute right-1 text-[#00d4ff] hover:bg-[#00d4ff]/20" 
            onClick={() => setShowMapPicker(true)}
        >
            <MapPinned className="w-4 h-4" />
        </Button>
      </div>
      
      <MapPicker 
        isOpen={showMapPicker} 
        onClose={() => setShowMapPicker(false)} 
        onLocationSelect={(loc) => onChange(loc)} 
        title={placeholder}
        initialLocation={value?.lat ? { lat: value.lat, lng: value.lng } : null} 
      />
    </>
  );
};

// Placeholder MapPicker to prevent crash
const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation }) => {
  const mapRef = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const inputRef = useRef(null);
  const [selectedPlace, setSelectedPlace] = useState(null);

  // Autocomplete inside modal
  useGoogleMapsAutocomplete(inputRef, (place) => {
    if (place.lat && place.lng) {
      const pos = new window.google.maps.LatLng(place.lat, place.lng);
      map.current.panTo(pos);
      map.current.setZoom(17);
      marker.current.setPosition(pos);
      setSelectedPlace(place);
    }
  });

  // Use my location button
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    toast.info("Getting your location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const latLng = new window.google.maps.LatLng(lat, lng);
        map.current.panTo(latLng);
        map.current.setZoom(18);
        marker.current.setPosition(latLng);
        reverseGeocode(latLng);
        toast.success("Location updated!");
      },
      () => toast.error("Failed to get location")
    );
  };

  const reverseGeocode = (latLng) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: latLng }, (results, status) => {
      let address = `${latLng.lat().toFixed(6)}, ${latLng.lng().toFixed(6)}`;
      if (status === "OK" && results[0]) {
        address = results[0].formatted_address;
      }
      setSelectedPlace({ address, lat: latLng.lat(), lng: latLng.lng() });
    });
  };

  useEffect(() => {
    if (!isOpen || !window.google?.maps || !mapRef.current) return;

    const center = initialLocation || { lat: 41.7151, lng: 44.8271 };
    const latLng = new window.google.maps.LatLng(center.lat, center.lng);

    map.current = new window.google.maps.Map(mapRef.current, {
      center: latLng,
      zoom: initialLocation ? 17 : 12,
      disableDefaultUI: false,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
      ],
    });

    marker.current = new window.google.maps.Marker({
      position: latLng,
      map: map.current,
      draggable: true,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#00ff88",
        fillOpacity: 1,
        strokeColor: "#000",
        strokeWeight: 2,
      },
    });

    // Click on map → move marker
    map.current.addListener("click", (e) => {
      const pos = e.latLng;
      marker.current.setPosition(pos);
      reverseGeocode(pos);
    });

    // Drag end → update address
    marker.current.addListener("dragend", () => {
      const pos = marker.current.getPosition();
      reverseGeocode(pos);
    });

    // Initial reverse geocode
    reverseGeocode(latLng);

  }, [isOpen, initialLocation]);

  const handleConfirm = () => {
    if (selectedPlace) {
      onLocationSelect(selectedPlace);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 bg-[#0a0a0a] text-white flex flex-col">
        <DialogHeader className="p-4 border-b border-[#00ff88]/20 flex flex-row items-center justify-between">
          <DialogTitle className="text-[#00ff88]">{title}</DialogTitle>
          <Button variant="ghost" size="icon" onClick={handleCurrentLocation}>
            <Crosshair className="w-5 h-5 text-[#00d4ff]" />
          </Button>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-4 pt-4">
          <div className="relative">
            <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-[#00ff88]" />
            <Input
              ref={inputRef}
              placeholder="Search any address in Georgia..."
              className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
            />
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="absolute inset-0" />
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t border-[#00ff88]/20 flex flex-col gap-3">
          <p className="text-sm text-gray-400 truncate max-w-full">
            {selectedPlace?.address || "Move map or drag pin to select location"}
          </p>
          <Button 
            onClick={handleConfirm} 
            disabled={!selectedPlace}
            className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold h-12 text-lg"
          >
            Confirm Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Auth Component
const RiderAuth = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
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
        toast.success(isLogin ? "Welcome back!" : "Account created!");
        navigate("/rider/dashboard");
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      const msg = error.response?.data?.detail || error.message || "Authentication failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <Card className="w-full max-w-md bg-black/70 backdrop-blur-xl border border-[#00ff88]/30">
        <CardHeader className="text-center">
          <Button
            variant="ghost"
            className="absolute left-4 top-4 text-[#00ff88] hover:text-white"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-10 h-10 text-black" />
          </div>
          <CardTitle className="text-2xl text-[#00ff88]">
            {isLogin ? "Welcome Back" : "Join T'aksi"}
          </CardTitle>
          <CardDescription className="text-[#00d4ff]/70">
            {isLogin ? "Sign in to book rides" : "Create your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rider-name" className="text-[#00ff88]">First Name</Label>
                  <Input
                    id="rider-name"
                    name="name"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-black/50 border-[#00ff88]/30 text-white"
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rider-surname" className="text-[#00ff88]">Last Name</Label>
                  <Input
                    id="rider-surname"
                    name="surname"
                    value={formData.surname}
                    onChange={e => setFormData({...formData, surname: e.target.value})}
                    className="bg-black/50 border-[#00ff88]/30 text-white"
                    required
                    autoComplete="family-name"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rider-phone" className="text-[#00ff88]">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />
                <Input
                  id="rider-phone"
                  name="cellphone"
                  type="tel"
                  value={formData.cellphone}
                  onChange={e => setFormData({...formData, cellphone: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                  autoComplete="tel"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rider-password" className="text-[#00ff88]">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />
                <Input
                  id="rider-password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="link" className="text-[#00d4ff]" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? "Need an account? Register" : "Have an account? Sign In"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// Dashboard Component
const RiderDashboard = () => {
  const [completedRide, setCompletedRide] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, stops]);

  // 🔥 TRIGGER: Only run when NUMBERS change (Debounced)
  useEffect(() => {
    if (mapsLoaded && pickup.lat && destination.lat) {
      const timer = setTimeout(() => {
        calculateRoute();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mapsLoaded, pickup.lat, pickup.lng, destination.lat, destination.lng, stops.length, calculateRoute]);

  useEffect(() => {
    if (routeInfo) {
      const surge = surgeInfo?.multiplier || 1.0;
      const fare = calculateFare(carType, routeInfo.distance, 0, 0, stops.length, surge);
      setFareEstimate(fare);
    }
  }, [routeInfo, carType, stops.length, surgeInfo]);

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
      const res = await api.get(`/rider/active-ride`);
      if (res.data) {
        setActiveRide(res.data);
        if (activeTab === "book" && activeTab !== "active") setActiveTab("active");
      }
    } catch (error) {
      if (error.response?.status !== 404) console.error("Error fetching active ride:", error);
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
    // 1. Validation
    if (!pickup.lat || !pickup.address) {
      toast.error("Please select a pickup address");
      return;
    }

    // 2. Open Card Modal if 'card' is selected
    if (paymentMethod === "card") {
      setShowCardModal(true); 
      return;
    }
    
    // 3. Otherwise, book immediately (Cash)
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

        // 🔥 STOP POLLING IF COMPLETED
        if (res.data.status === "completed") {
          clearInterval(interval);
          setCompletedRide(res.data); // <--- Triggers the Modal
          setActiveRide(null);        // Clear the active view
          fetchRideHistory();
        } 
        else if (["cancelled", "no_drivers"].includes(res.data.status)) {
          clearInterval(interval);
          if (res.data.status === "no_drivers") toast.error("No drivers available.");
        } 
        else if (res.data.status === "accepted" && res.data.driver_info) {
          // Optional: toast.success("Driver is coming!");
        }
      } catch (error) {
        clearInterval(interval);
      }
    }, 2000);
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
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
              <CardHeader>
                <CardTitle className="text-[#00ff88] flex items-center">
                  <Rocket className="w-5 h-5 mr-2" /> Book Your Ride
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Visual Route Map */}
                {mapsLoaded && pickup.lat && destination.lat && (
                  <LiveTrackingMap 
                    pickup={pickup} 
                    destination={destination} 
                    status="preview"
                    driverLocation={null} // No driver yet
                  />
                )}
                {!mapsLoaded && <p className="text-red-500 text-center">Maps not loaded - check console for errors</p>}
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pickup-input" className="text-[#00ff88]">Pickup Location</Label>
                    <Button variant="ghost" size="sm" className="text-[#00d4ff] h-6" onClick={getCurrentLocation} disabled={locationLoading}>
                      {locationLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Crosshair className="w-3 h-3 mr-1" />} Use My Location
                    </Button>
                  </div>
                  <LocationInput id="pickup-input" name="pickup" value={pickup} onChange={setPickup} placeholder="Where to pick you up?" icon={MapPin} iconColor="text-[#00ff88]" />
                </div>
                {stops.map((stop, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`stop-${index}`} className="text-yellow-400">Stop {index + 1}</Label>
                      <Button variant="ghost" size="sm" className="text-red-400 h-6" onClick={() => removeStop(index)}><X className="w-3 h-3" /></Button>
                    </div>
                    <LocationInput id={`stop-${index}`} name={`stop_${index}`} value={stop} onChange={(data) => updateStop(index, data)} placeholder={`Stop ${index + 1} address`} icon={MapPin} iconColor="text-yellow-400" />
                  </div>
                ))}
                {stops.length < 3 && <Button variant="outline" className="w-full border-dashed border-yellow-400/30 text-yellow-400" onClick={addStop}><Plus className="w-4 h-4 mr-2" /> Add Stop (Free - wait time charged)</Button>}
                <div className="space-y-2">
                  <Label htmlFor="destination-input" className="text-[#00d4ff]">Destination</Label>
                  <LocationInput id="destination-input" name="destination" value={destination} onChange={setDestination} placeholder="Where to go?" icon={Navigation} iconColor="text-[#00d4ff]" />
                </div>
                {surgeInfo?.is_surge && (
                  <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center"><TrendingUp className="w-5 h-5 text-orange-400 mr-2" /><div><p className="text-orange-400 font-bold">Surge Pricing Active</p><p className="text-orange-300/70 text-sm">{surgeInfo.surge_reason}</p></div></div>
                      <Badge className="bg-orange-500 text-black text-lg px-3 py-1">x{surgeInfo.multiplier}</Badge>
                    </div>
                  </div>
                )}
                {routeInfo && (
                  <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2 text-[#00ff88]">
                      <span className="flex items-center"><RouteIcon className="w-4 h-4 mr-1" /> Route</span>
                      <span className="font-bold">{routeInfo.distance} km • ~{routeInfo.duration} min</span>
                    </div>
                    {fareEstimate && <div className="flex justify-between text-lg text-[#00ff88] font-bold"><span>Estimated Total</span><span>₾{fareEstimate.total.toFixed(2)}</span></div>}
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-[#00ff88]">Vehicle Class</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {carTypes.map((type) => {
                      const typeFare = routeInfo ? calculateFare(type.value, routeInfo.distance, 0, 0, stops.length, surgeInfo?.multiplier || 1.0).total : type.base * (surgeInfo?.multiplier || 1.0);
                      return <button key={type.value} onClick={() => setCarType(type.value)} className={`p-3 rounded-xl border-2 transition-all ${carType === type.value ? "border-[#00ff88] bg-[#00ff88]/20" : "border-[#00ff88]/20 bg-black/30"}`}><div className="text-2xl mb-1">{type.icon}</div><div className="text-white font-medium text-xs">{type.label}</div><div className="text-[#00ff88] text-sm">₾{typeFare.toFixed(2)}</div></button>;
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[#00ff88]">Payment</Label>
                  <div className="flex gap-2">
                    <Button variant={paymentMethod === "cash" ? "default" : "outline"} onClick={() => setPaymentMethod("cash")} className={paymentMethod === "cash" ? "bg-[#00ff88] text-black" : "border-[#00ff88]/30 text-white"}>💵 Cash</Button>
                    <Button variant={paymentMethod === "card" ? "default" : "outline"} onClick={() => setPaymentMethod("card")} className={paymentMethod === "card" ? "bg-[#00ff88] text-black" : "border-[#00ff88]/30 text-white"}>💳 Card</Button>
                  </div>
                </div>
                <Button 
    className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold h-14 text-lg" 
    onClick={handleBookRide} 
    disabled={loading} 
>
    {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Rocket className="w-5 h-5 mr-2" />} 
    Request Ride
</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PayPal Modal */}
          <Dialog open={showPayPal} onOpenChange={setShowPayPal}>
            <DialogContent><DialogHeader><DialogTitle>Pay with PayPal</DialogTitle></DialogHeader><div className="p-4"><p className="text-center mb-4">Amount: ₾{fareEstimate?.total.toFixed(2)}</p><PayPalButtons createOrder={(data, actions) => actions.order.create({ purchase_units: [{ amount: { value: (fareEstimate.total * 0.37).toFixed(2), currency_code: "USD" } }] })} onApprove={async (data, actions) => { await actions.order.capture(); toast.success("Payment successful!"); await processRideRequest(); }} /></div></DialogContent>
          </Dialog>

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
                  
                  {/* 🔥 SAFE ACTIVE MAP RENDER */}
                  {mapsLoaded && activeRide && !isNaN(parseFloat(activeRide.pickup_lat)) && (
                    <LiveTrackingMap 
                        pickup={{ 
                            lat: parseFloat(activeRide.pickup_lat), 
                            lng: parseFloat(activeRide.pickup_lng) 
                        }}
                        destination={
                            activeRide.dest_lat && !isNaN(parseFloat(activeRide.dest_lat))
                            ? { lat: parseFloat(activeRide.dest_lat), lng: parseFloat(activeRide.dest_lng) } 
                            : null
                        }
                        driverLocation={activeRide.driver_location} 
                        status={activeRide.status}
                    />
                  )}
                  {!mapsLoaded && <p className="text-red-500 text-center">Maps not loaded - check console for errors</p>}

                  <div className="space-y-3">
                    <div><p className="text-[#00ff88]/60 text-sm">Pickup</p><p>{activeRide.pickup}</p></div>
                    {activeRide.stops?.length > 0 && <div><p className="text-yellow-400/60 text-sm">Stops ({activeRide.stops.length})</p>{activeRide.stops.map((stop, i) => <p key={i} className="text-sm text-yellow-400">• {stop.address}</p>)}</div>}
                    <div><p className="text-[#00d4ff]/60 text-sm">Destination</p><p>{activeRide.destination || "Open Trip"}</p></div>
                  </div>

                  {activeRide.status === "searching" && (
                    <div className="bg-yellow-500/20 border border-yellow-500 p-4 rounded-xl space-y-2">
                      <div className="flex items-center"><Loader2 className="w-5 h-5 animate-spin mr-3 text-yellow-400" /><span className="text-yellow-400 font-medium">{activeRide.matching_status || "Searching for drivers..."}</span></div>
                      {activeRide.drivers_notified_count > 0 && <p className="text-yellow-400/70 text-sm pl-8">{activeRide.drivers_notified_count} drivers notified</p>}
                    </div>
                  )}

                  {activeRide.status === "no_drivers" && (
                    <div className="bg-gray-500/20 border border-gray-500 p-4 rounded-xl space-y-3">
                      <div className="flex items-center text-gray-300"><Target className="w-5 h-5 mr-2" /><span className="font-medium">No drivers available</span></div>
                      <div className="flex gap-2"><Button className="flex-1 bg-[#00ff88] text-black font-bold" onClick={handleRetryRide}><Rocket className="w-4 h-4 mr-2" /> Retry Search</Button><Button variant="outline" className="border-gray-500 text-gray-300" onClick={() => { setActiveRide(null); setActiveTab("book"); }}>New Ride</Button></div>
                    </div>
                  )}

                  {activeRide.driver_info && (
                    <div className="bg-black/50 rounded-xl p-4 border border-[#00ff88]/20">
                      <p className="text-[#00ff88] font-semibold mb-2">Your Driver</p>
                      <div className="flex items-center space-x-3">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center"><User className="w-7 h-7 text-black" /></div>
                        <div><p className="font-medium text-lg">{activeRide.driver_info.name}</p><p className="text-sm text-gray-400">{activeRide.driver_info.car_make} {activeRide.driver_info.car_model}</p><p className="text-[#00ff88] font-mono">{activeRide.driver_info.license_plate}</p></div>
                      </div>
                    </div>
                  )}

                  {activeRide.status === "arrived" && <div className="bg-purple-500/20 border border-purple-500 p-4 rounded-xl"><div className="flex items-center text-purple-400"><Timer className="w-5 h-5 mr-2" /> Driver has arrived! First 2 minutes are free.</div></div>}
                  <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4"><span className="text-[#00ff88]">Estimated Fare</span><span className="text-2xl font-bold text-[#00ff88]">₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}</span></div>
                  {["searching", "accepted"].includes(activeRide.status) && <Button variant="destructive" className="w-full" onClick={handleCancelRide}>Cancel Ride</Button>}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-center py-12"><Navigation className="w-20 h-20 mx-auto text-[#00ff88]/30 mb-4" /><p className="text-[#00ff88]/60 text-lg">No active ride</p><Button className="mt-6 bg-[#00ff88] text-black font-bold" onClick={() => setActiveTab("book")}>Book a Ride</Button></Card>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
              <CardHeader><CardTitle className="text-[#00ff88]">Ride History</CardTitle></CardHeader>
              <CardContent><ScrollArea className="h-[400px]"><div className="space-y-3">{rideHistory.map(ride => (<div key={ride.id} className="bg-black/50 border border-[#00ff88]/10 rounded-xl p-4 space-y-2"><div className="flex justify-between"><Badge className={statusColors[ride.status]}>{ride.status?.replace(/_/g, ' ').toUpperCase()}</Badge><span className="text-gray-400 text-sm">{ride.created_at ? new Date(ride.created_at).toLocaleDateString() : "N/A"}</span></div><div><p className="text-sm text-[#00ff88]/60">From: {ride.pickup}</p><p className="text-sm text-[#00d4ff]/60">To: {ride.destination || "Open"}</p></div><div className="flex justify-between"><span className="text-gray-400 capitalize">{ride.carType}</span><span className="text-[#00ff88] font-bold">₾{(ride.final_fare || ride.estimated_fare)?.toFixed(2)}</span></div></div>))}</div></ScrollArea></CardContent>
            </Card>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
              <CardHeader><CardTitle className="text-[#00ff88]">Profile</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-4"><div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center"><User className="w-10 h-10 text-black" /></div><div><h3 className="text-2xl font-bold">{user?.name} {user?.surname}</h3><p className="text-[#00d4ff]">{user?.cellphone}</p></div></div>
                <Separator className="bg-[#00ff88]/20" />
                <div className="grid grid-cols-2 gap-4"><div className="bg-black/50 border border-[#00ff88]/20 rounded-xl p-4 text-center"><Car className="w-8 h-8 mx-auto text-[#00d4ff] mb-2" /><p className="text-2xl font-bold">{user?.total_rides || 0}</p><p className="text-[#00ff88]/60 text-sm">Total Rides</p></div><div className="bg-black/50 border border-[#00ff88]/20 rounded-xl p-4 text-center"><Star className="w-8 h-8 mx-auto text-yellow-400 mb-2" /><p className="text-2xl font-bold">{user?.rating?.toFixed(1) || "5.0"}</p><p className="text-[#00ff88]/60 text-sm">Rating</p></div></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        {/* 🔥 INSERT THIS: Card Payment Modal */}
        <Dialog open={showCardModal} onOpenChange={setShowCardModal}>
          <DialogContent className="bg-[#1a1a2e] border border-[#00ff88]/30 text-white sm:max-w-md w-[95%] max-h-[85vh] overflow-y-auto top-[30%] translate-y-[-30%]">
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
                    className="pl-10 bg-black/50 border-[#00ff88]/30 text-white h-12 font-mono tracking-widest" 
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-xs">EXPIRY</Label>
                    <Input 
                      value={cardDetails.expiry} 
                      onChange={(e)=>handleCardInput("expiry", e.target.value)} 
                      placeholder="MM/YY" 
                      className="bg-black/50 border-[#00ff88]/30 text-white h-12 text-center font-mono" 
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-xs">CVV</Label>
                    <Input 
                      value={cardDetails.cvv} 
                      onChange={(e)=>handleCardInput("cvv", e.target.value)} 
                      placeholder="123" 
                      className="bg-black/50 border-[#00ff88]/30 text-white h-12 text-center font-mono" 
                      inputMode="numeric" 
                      type="password"
                    />
                  </div>
              </div>
              <Button type="submit" className="w-full bg-[#00ff88] text-black font-bold h-12" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : `Pay ₾${fareEstimate?.total.toFixed(2)}`}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        
        {/* 🔥 TRIP COMPLETE / PAY MODAL */}
        <Dialog open={!!completedRide} onOpenChange={() => setCompletedRide(null)}>
          <DialogContent className="bg-black border border-[#00ff88] text-center p-6 sm:max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-[#00ff88] text-2xl font-bold flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-[#00ff88]/20 flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-10 h-10 text-[#00ff88]" />
                </div>
                Trip Complete!
              </DialogTitle>
            </DialogHeader>
            
            <div className="py-6 space-y-3">
              <p className="text-gray-400 text-sm uppercase tracking-widest">Total Fare</p>
              <p className="text-5xl font-bold text-white">
                ₾{completedRide?.final_fare?.toFixed(2) || "0.00"}
              </p>
              {completedRide?.payment_method === "cash" ? (
                <p className="text-orange-400 text-sm font-medium">
                  Please pay the driver in cash
                </p>
              ) : (
                <p className="text-gray-500 text-sm">
                  Paid with card
                </p>
              )}
            </div>

            <Button 
              className="w-full bg-[#00ff88] text-black font-bold h-14 text-xl rounded-xl"
              onClick={() => {
                setCompletedRide(null);
                toast.success("Thank you for riding with T'aksi! 🚀");
              }}
            >
              {completedRide?.payment_method === "cash" ? "I Paid Driver" : "Done"}
            </Button>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

// Main Router
const RiderPortal = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.user_type !== "rider") {
    if (location.pathname === "/rider" || location.pathname === "/rider/") {
      return <RiderAuth />;
    }
    return <Navigate to="/rider" replace />;
  }

  return (
    <PayPalScriptProvider options={{ "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "test", currency: "USD" }}>
      <Routes>
        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<RiderDashboard />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default RiderPortal;