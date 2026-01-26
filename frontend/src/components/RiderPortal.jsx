import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth, API, GOOGLE_MAPS_API_KEY } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import {
  Car, MapPin, Clock, Star, History, Home, LogOut, User,
  Phone, Lock, ArrowLeft, Navigation, Wallet, Loader2, Rocket,
  Route as RouteIcon, Plus, X, Target, Timer, Crosshair, Zap, TrendingUp, MessageSquare, Send, CreditCard
} from "lucide-react";

const mapStyles = `
  .gm-style, div[aria-label="Map"] {
    min-height: 100% !important;
    height: 100% !important;
    width: 100% !important;
    border-radius: 0.5rem;
  }
`;

const PRICING_RULES = {
  economy: { name: 'Economy', base: 2.00, perKm: 0.50, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "🚗" },
  comfort: { name: 'Comfort', base: 2.50, perKm: 0.55, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "🚙" },
  suv: { name: 'SUV / XL', base: 3.90, perKm: 0.80, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "🚐" },
  personal: { name: 'Personal', base: 4.00, perKm: 0.70, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "👤" },
  jumpstart: { name: 'Jumpstart', base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, stopFee: 0.00, icon: "⚡" }
};

// --- CALCULATE FARE (FIXED BRACING) ---
const calculateFare = (carType, distanceKm, waitMin = 0, stopWaitMin = 0, numStops = 0, surgeMultiplier = 1.0) => {
  const rules = PRICING_RULES[carType] || PRICING_RULES.economy;
  let subtotal = rules.base;

  subtotal += distanceKm * rules.perKm;
  if (distanceKm > 7) subtotal += (distanceKm - 7) * 0.15;
  if (distanceKm > 30) subtotal += Math.ceil((distanceKm - 30) / 15) * 5;

  const billableWait = Math.max(0, waitMin - rules.freeWait);
  const totalWait = billableWait + stopWaitMin;
  subtotal += totalWait * rules.perMinWait;
  subtotal += numStops * rules.stopFee;

  const surgeFee = subtotal * (surgeMultiplier - 1.0);
  const total = subtotal + surgeFee;

  return {
    base: rules.base,
    distance: Math.round(distanceKm * rules.perKm * 100) / 100,
    wait: Math.round(totalWait * rules.perMinWait * 100) / 100,
    stops: numStops * rules.stopFee,
    subtotal: Math.round(subtotal * 100) / 100,
    surgeFee: Math.round(surgeFee * 100) / 100,
    surgeMultiplier,
    total: Math.round(total * 100) / 100
  };
};

// --- CHAT INTERFACE (FIXED BRACING) ---
const ChatInterface = ({ rideId, driverName }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const { user } = useAuth();

  const fetchMessages = async () => {
    try {
      const res = await axios.get(`${API}/rides/${rideId}/chat`);
      setMessages(res.data.messages || []);
      await axios.post(`${API}/rides/${rideId}/chat/read`);
    } catch (error) { console.error("Chat error:", error); }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [rideId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await axios.post(`${API}/rides/${rideId}/chat`, { message: newMessage });
      setNewMessage("");
      fetchMessages();
    } catch (error) { toast.error("Failed to send"); }
    finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender_id === user.id ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl p-3 ${msg.sender_id === user.id ? "bg-[#00ff88] text-black" : "bg-[#1a1a2e] text-white"}`}>
              <p className="text-sm">{msg.message}</p>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={sendMessage} className="p-4 border-t border-[#00ff88]/20 flex gap-2">
        <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Message..." className="bg-black text-white" />
        <Button type="submit" disabled={sending} className="bg-[#00ff88] text-black"><Send className="w-4 h-4" /></Button>
      </form>
    </div>
  );
};

const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {
  useEffect(() => {
    if (!inputRef.current || !window.google) return;
    
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'ge' },
      fields: ['formatted_address', 'geometry', 'name']
    });
    
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        // --- THIS LINE FIXES THE BUG ---
        if(inputRef.current) inputRef.current.value = place.formatted_address || place.name;
        // -------------------------------
        
        onPlaceSelect({
          address: place.formatted_address || place.name,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        });
      }
    });
  }, [inputRef, onPlaceSelect]);
};

// Map Picker Component (FIXED LAYOUT - Sticky Button)
const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!isOpen || !mapRef.current || !window.google) return;
    
    const defaultCenter = initialLocation || { lat: 41.7151, lng: 44.8271 }; // Tbilisi
    
    const map = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 14,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#00ff88" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a4a" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#00d4ff" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#000033" }] }
      ],
      disableDefaultUI: true,
      zoomControl: true
    });
    
    mapInstanceRef.current = map;
    
    const marker = new window.google.maps.Marker({
      map,
      draggable: true,
      position: defaultCenter,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: "#00ff88",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3
      }
    });
    
    markerRef.current = marker;
    
    const updateLocation = (latLng) => {
        const lat = latLng.lat();
        const lng = latLng.lng();
        marker.setPosition(latLng);
        setSelectedLocation({ lat, lng });
        reverseGeocode(lat, lng);
    };

    // Click to set location
    map.addListener('click', (e) => updateLocation(e.latLng));
    
    // Drag marker
    marker.addListener('dragend', () => updateLocation(marker.getPosition()));
    
    // Set initial location if provided
    if (initialLocation) {
      marker.setPosition(initialLocation);
      setSelectedLocation(initialLocation);
      reverseGeocode(initialLocation.lat, initialLocation.lng);
    }
    
  }, [isOpen, initialLocation]);
  
  const reverseGeocode = async (lat, lng) => {
    if (!window.google) return;
    
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results[0]) {
        setAddress(results[0].formatted_address);
      }
    });
  };
  
  const getCurrentLocation = () => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const pos = { lat, lng };
        
        if (mapInstanceRef.current) {
          mapInstanceRef.current.setCenter(pos);
          mapInstanceRef.current.setZoom(16);
        }
        if (markerRef.current) {
          markerRef.current.setPosition(pos);
        }
        
        setSelectedLocation(pos);
        reverseGeocode(lat, lng);
        setLoading(false);
      },
      (error) => {
        toast.error("Could not get your location");
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };
  
  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationSelect({
        address: address || "Selected Location",
        lat: selectedLocation.lat,
        lng: selectedLocation.lng
      });
      onClose();
    } else {
      toast.error("Please select a location on the map");
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black border border-[#00ff88]/30 w-[95vw] max-w-md h-[90vh] flex flex-col p-0 gap-0">
        <style>{mapStyles}</style>
        <DialogHeader className="p-4 bg-black/80 z-10 w-full border-b border-[#00ff88]/20 flex-none">
          <DialogTitle className="text-[#00ff88] flex items-center">
            <MapPin className="w-5 h-5 mr-2" /> {title || "Select Location"}
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-xs">
             Drag map to pin location.
          </DialogDescription>
        </DialogHeader>
        
        {/* Map Container - Takes available space */}
        <div className="flex-1 w-full min-h-[300px] relative">
          <div ref={mapRef} className="w-full h-full" />
        </div>
        
        {/* Sticky Footer */}
        <div className="w-full p-4 bg-black border-t border-[#00ff88]/30 flex flex-col gap-3 flex-none">
            {address && (
            <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl p-3">
                <p className="text-[#00ff88] text-xs font-bold uppercase">Selected Address:</p>
                <p className="text-white text-sm truncate">{address}</p>
            </div>
            )}
            
            <div className="flex gap-2">
            <Button
                variant="outline"
                className="border-[#00d4ff]/30 text-[#00d4ff] flex-1"
                onClick={getCurrentLocation}
                disabled={loading}
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crosshair className="w-4 h-4 mr-2" />}
                GPS
            </Button>
            <Button 
                className="flex-1 bg-[#00ff88] text-black font-bold"
                onClick={handleConfirm}
                disabled={!selectedLocation}
            >
                Confirm Location
            </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Location Input Component (FIXED)
const LocationInput = ({ value, onChange, onMapSelect, placeholder, icon: Icon, iconColor }) => {
  const inputRef = useRef(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  
  useGoogleMapsAutocomplete(inputRef, (place) => {
    onChange({ address: place.address, lat: place.lat, lng: place.lng });
  });

  // Keep input value in sync with state if state changes externally
  useEffect(() => {
      if(inputRef.current && value?.address && inputRef.current.value !== value.address) {
          inputRef.current.value = value.address;
      }
  }, [value]);
  
  return (
    <>
      <div className="relative flex items-center">
        <Icon className={`absolute left-3 h-4 w-4 ${iconColor}`} />
        <Input
          ref={inputRef}
          defaultValue={value?.address || ""}
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
          <Target className="w-4 h-4" />
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

const LiveTrackingMap = ({ pickup, destination, driverLocation, status }) => {
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const [eta, setEta] = useState(null);

  // 1. Initialize Map
  useEffect(() => {
    if (!window.google || !mapRef.current) return;
    
    // Fallback coordinates if locations are missing
    const initialCenter = driverLocation?.lat ? driverLocation : (pickup?.lat ? pickup : { lat: 41.7151, lng: 44.8271 });
    
    const map = new window.google.maps.Map(mapRef.current, { 
      zoom: 15, 
      center: initialCenter, 
      disableDefaultUI: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] }
      ]
    });
    
    rendererRef.current = new window.google.maps.DirectionsRenderer({ 
      map, 
      suppressMarkers: false,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5 }
    });
  }, []);

  // 2. Handle Routing Logic
  useEffect(() => {
    if (!window.google || !rendererRef.current) return;
    
    const start = driverLocation?.lat ? driverLocation : pickup;
    const end = status === 'in_progress' ? destination : pickup;
    
    if (!start?.lat || !end?.lat) return;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      { 
        origin: new window.google.maps.LatLng(parseFloat(start.lat), parseFloat(start.lng)), 
        destination: new window.google.maps.LatLng(parseFloat(end.lat), parseFloat(end.lng)), 
        travelMode: window.google.maps.TravelMode.DRIVING 
      },
      (res, stat) => {
        if (stat === "OK") {
          rendererRef.current.setDirections(res);
          if (res.routes[0].legs[0]) {
            setEta(res.routes[0].legs[0].duration.text);
          }
        }
      }
    );
  }, [driverLocation, status, pickup, destination]);

  // THIS RETURN IS NOW PROPERLY INSIDE THE FUNCTION SCOPE
  return (
    <div className="relative w-full h-[300px] rounded-xl overflow-hidden border border-[#00ff88]/30 mt-4 mb-4">
      <div ref={mapRef} className="w-full h-full" />
      {eta && (
        <div className="absolute top-4 right-4 bg-black/80 border border-[#00ff88] px-4 py-2 rounded-lg backdrop-blur-md z-10 shadow-[0_0_15px_rgba(0,255,136,0.3)]">
          <p className="text-[#00ff88] font-bold text-xl">{eta}</p>
          <p className="text-[10px] text-white uppercase tracking-wider">Estimated Arrival</p>
        </div>
      )}
    </div>
  );
}; // <--- MAKE SURE THIS BRACE EXISTS HERE

// Auth Component (Unchanged from your logic)
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
      const res = await axios.post(`${API}${endpoint}`, formData);
      
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
                  <Label className="text-[#00ff88]">First Name</Label>
                  <Input
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-black/50 border-[#00ff88]/30 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#00ff88]">Last Name</Label>
                  <Input
                    value={formData.surname}
                    onChange={e => setFormData({...formData, surname: e.target.value})}
                    className="bg-black/50 border-[#00ff88]/30 text-white"
                    required
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-[#00ff88]">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />
                <Input
                  type="tel"
                  value={formData.cellphone}
                  onChange={e => setFormData({...formData, cellphone: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[#00ff88]">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />
                <Input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
                  required
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
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("book");
  const [loading, setLoading] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [waitTime, setWaitTime] = useState(0);

  // Polling Reference (Fix for multiple intervals)
  const pollRef = useRef(null);
  
  // Booking state
  const [pickup, setPickup] = useState({ address: "", lat: null, lng: null });
  const [destination, setDestination] = useState({ address: "", lat: null, lng: null });
  const [stops, setStops] = useState([]);
  const [carType, setCarType] = useState("economy");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  
  // Top Up State
  const [topupAmount, setTopupAmount] = useState("");
  
  // Route info
  const [routeInfo, setRouteInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  
  // Surge pricing
  const [surgeInfo, setSurgeInfo] = useState(null);

  // Cleanup polling on unmount (Fix for memory leaks)
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Load Google Maps
  useEffect(() => {
    if (window.google) {
      setMapsLoaded(true);
      return;
    }
    
    if (!GOOGLE_MAPS_API_KEY) {
      console.error("Google Maps API Key is missing!");
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Live Wait Time Calculator
  useEffect(() => {
      let interval;
      if (activeRide?.status === 'arrived' && activeRide.arrived_at) {
          const arrivalTime = new Date(activeRide.arrived_at).getTime();
          interval = setInterval(() => {
              const now = Date.now();
              const diffMinutes = Math.floor((now - arrivalTime) / 60000);
              setWaitTime(diffMinutes > 0 ? diffMinutes : 0);
          }, 1000);
      } else {
          setWaitTime(0);
      }
      return () => clearInterval(interval);
  }, [activeRide]);

  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
    fetchSurgeStatus();
  }, []);
  
  // Fetch surge status when pickup location changes
  useEffect(() => {
    if (pickup.lat) {
      fetchSurgeStatus();
    }
  }, [pickup.lat, pickup.lng]);

  // Calculate route when locations change
  useEffect(() => {
    if (mapsLoaded && pickup.lat && destination.lat) {
      calculateRoute();
    }
  }, [pickup, destination, stops, mapsLoaded]);

  // Update fare when route or car type or surge changes
  useEffect(() => {
    if (routeInfo) {
      const surge = surgeInfo?.multiplier || 1.0;
      const fare = calculateFare(carType, routeInfo.distance, waitTime, 0, stops.length, surge);
      setFareEstimate(fare);
    }
  }, [routeInfo, carType, stops.length, surgeInfo, waitTime]);
  
  const fetchSurgeStatus = async () => {
    try {
      const params = pickup.lat ? `?lat=${pickup.lat}&lng=${pickup.lng}` : '';
      const res = await axios.get(`${API}/surge/status${params}`);
      setSurgeInfo(res.data);
    } catch (error) {
      console.error("Error fetching surge:", error);
    }
  };

  const calculateRoute = async () => {
    if (!window.google || !pickup.lat || !destination.lat) return;
    
    const directionsService = new window.google.maps.DirectionsService();
    
    // Build waypoints from stops
    const waypoints = stops
      .filter(s => s.lat && s.lng)
      .map(s => ({
        location: new window.google.maps.LatLng(s.lat, s.lng),
        stopover: true
      }));
    
    directionsService.route(
      {
        origin: new window.google.maps.LatLng(pickup.lat, pickup.lng),
        destination: new window.google.maps.LatLng(destination.lat, destination.lng),
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false
      },
      (result, status) => {
        if (status === 'OK') {
          let totalDistance = 0;
          let totalDuration = 0;
          
          result.routes[0].legs.forEach(leg => {
            totalDistance += leg.distance.value;
            totalDuration += leg.duration.value;
          });
          
          setRouteInfo({
            distance: Math.round(totalDistance / 100) / 10, // km with 1 decimal
            duration: Math.round(totalDuration / 60) // minutes
          });
        }
      }
    );
  };

  const fetchActiveRide = async () => {
    try {
      const res = await axios.get(`${API}/rider/active-ride`);
      if (res.data) {
        setActiveRide(res.data);
        setActiveTab("active");
        pollRideStatus(res.data.id);
      }
    } catch (error) {
      console.error("Error fetching active ride:", error);
    }
  };

  const fetchRideHistory = async () => {
    try {
      const res = await axios.get(`${API}/rider/history`);
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

  const handleBookRide = async (paid = false) => {
    if (!pickup.lat || !pickup.address) {
      toast.error("Please select pickup location");
      return;
    }
    
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
        estimatedDuration: routeInfo?.duration || 15,
        paid // Flag if paid via PayPal/Card
      };
      
      const res = await axios.post(`${API}/rides/request`, rideData);
      
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
    }
  };

  const handleWalletTopUp = async (details) => {
      const amount = parseFloat(topupAmount);
      try {
          // In production, send details.orderID to backend to verify
          await axios.post(`${API}/rider/wallet/topup`, { amount, reference: details.orderID });
          updateUser({ ...user, wallet_balance: (user.wallet_balance || 0) + amount });
          toast.success(`Success! ₾${amount} added to wallet.`);
          setTopupAmount("");
      } catch (e) {
          toast.error("Top up failed");
      }
  };

  // FIXED POLLING FUNCTION
  const pollRideStatus = async (rideId) => {
    // 1. Clear existing interval
    if (pollRef.current) clearInterval(pollRef.current);

    // 2. Start new interval
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/rides/${rideId}`);
        setActiveRide(res.data);
        
        if (["completed", "cancelled", "no_drivers"].includes(res.data.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          
          if (res.data.status === "completed") {
            toast.success("Ride completed!");
            fetchRideHistory();
          } else if (res.data.status === "no_drivers") {
            toast.error("No drivers available. Please try again.");
          }
        } else if (res.data.status === "accepted" && res.data.driver_info) {
          // Optional: You can move this toast to a useEffect looking at status changes to avoid spam
          // toast.success(`Driver ${res.data.driver_info.name} is coming!`);
        }
      } catch (error) {
        // Stop polling on 404 or persistent errors
        if (error.response?.status === 404) {
             clearInterval(pollRef.current);
        }
      }
    }, 3000);
  };

  const handleCancelRide = async () => {
    if (!activeRide) return;
    
    try {
      await axios.post(`${API}/rides/${activeRide.id}/cancel`);
      
      // Stop polling immediately
      if (pollRef.current) clearInterval(pollRef.current);

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
      const res = await axios.post(`${API}/rides/${activeRide.id}/retry`);
      toast.success("Searching for drivers again...");
      setActiveRide(prev => ({ ...prev, status: 'searching', matching_status: 'Retrying - Searching within 3km' }));
      pollRideStatus(activeRide.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to retry ride");
    }
  };

  const getCurrentLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        if (window.google) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === 'OK' && results[0]) {
              setPickup({
                address: results[0].formatted_address,
                lat,
                lng
              });
              toast.success("Location detected!");
            }
          });
        }
      },
      () => toast.error("Could not get location"),
      { enableHighAccuracy: true }
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
      <style>{mapStyles}</style>
      
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
          <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00ff88]/20 mb-6">
            <TabsTrigger value="book" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
              <Car className="w-4 h-4 sm:mr-2" /> Book
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
              <Navigation className="w-4 h-4 sm:mr-2" /> Ride
            </TabsTrigger>
            <TabsTrigger value="wallet" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
              <Wallet className="w-4 h-4 sm:mr-2" /> Pay
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
              <History className="w-4 h-4 sm:mr-2" /> Hist
            </TabsTrigger>
            <TabsTrigger value="profile" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
              <User className="w-4 h-4 sm:mr-2" /> Prof
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
                {/* Pickup */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[#00ff88]">Pickup Location</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#00d4ff] h-6"
                      onClick={getCurrentLocation}
                    >
                      <Crosshair className="w-3 h-3 mr-1" /> Use My Location
                    </Button>
                  </div>
                  <LocationInput
                    value={pickup}
                    onChange={setPickup}
                    placeholder="Where to pick you up?"
                    icon={MapPin}
                    iconColor="text-[#00ff88]"
                  />
                </div>

                {/* Stops */}
                {stops.map((stop, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-yellow-400">Stop {index + 1}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 h-6"
                        onClick={() => removeStop(index)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <LocationInput
                      value={stop}
                      onChange={(data) => updateStop(index, data)}
                      placeholder={`Stop ${index + 1} address`}
                      icon={MapPin}
                      iconColor="text-yellow-400"
                    />
                  </div>
                ))}

                {/* Add Stop Button */}
                {stops.length < 3 && (
                  <Button
                    variant="outline"
                    className="w-full border-dashed border-yellow-400/30 text-yellow-400"
                    onClick={addStop}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Stop (+₾{PRICING_RULES[carType]?.stopFee.toFixed(2)})
                  </Button>
                )}

                {/* Destination */}
                <div className="space-y-2">
                  <Label className="text-[#00d4ff]">Destination</Label>
                  <LocationInput
                    value={destination}
                    onChange={setDestination}
                    placeholder="Where to go?"
                    icon={Navigation}
                    iconColor="text-[#00d4ff]"
                  />
                </div>
                
                {/* Surge Pricing Banner */}
                {surgeInfo?.is_surge && (
                  <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <TrendingUp className="w-5 h-5 text-orange-400 mr-2" />
                        <div>
                          <p className="text-orange-400 font-bold">Surge Pricing Active</p>
                          <p className="text-orange-300/70 text-sm">{surgeInfo.surge_reason}</p>
                        </div>
                      </div>
                      <Badge className="bg-orange-500 text-black text-lg px-3 py-1">
                        x{surgeInfo.multiplier}
                      </Badge>
                    </div>
                    <p className="text-xs text-orange-300/50 mt-2">
                      Wed 18:00-02:00 • Fri-Sat 18:00-04:00
                    </p>
                  </div>
                )}

                {/* Route Info */}
                {routeInfo && (
                  <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2 text-[#00ff88]">
                      <span className="flex items-center"><RouteIcon className="w-4 h-4 mr-1" /> Route</span>
                      <span className="font-bold">{routeInfo.distance} km • ~{routeInfo.duration} min</span>
                    </div>
                    {fareEstimate && (
                      <>
                        <Separator className="bg-[#00ff88]/20 my-2" />
                        <div className="space-y-1 text-white text-sm">
                          <div className="flex justify-between"><span>Base</span><span>₾{fareEstimate.base.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Distance</span><span>₾{fareEstimate.distance.toFixed(2)}</span></div>
                          {fareEstimate.stops > 0 && (
                            <div className="flex justify-between text-yellow-400"><span>Stops ({stops.length})</span><span>₾{fareEstimate.stops.toFixed(2)}</span></div>
                          )}
                          {fareEstimate.surgeFee > 0 && (
                            <>
                              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>₾{fareEstimate.subtotal.toFixed(2)}</span></div>
                              <div className="flex justify-between text-orange-400 font-semibold">
                                <span className="flex items-center"><Zap className="w-3 h-3 mr-1" /> Surge x{fareEstimate.surgeMultiplier}</span>
                                <span>+₾{fareEstimate.surgeFee.toFixed(2)}</span>
                              </div>
                            </>
                          )}
                          <Separator className="bg-[#00ff88]/20 my-2" />
                          <div className="flex justify-between text-lg text-[#00ff88] font-bold">
                            <span>Estimated Total</span>
                            <span>₾{fareEstimate.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Car Type */}
                <div className="space-y-2">
                  <Label className="text-[#00ff88]">Vehicle Class {surgeInfo?.is_surge && <span className="text-orange-400 text-xs">(Surge x{surgeInfo.multiplier})</span>}</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {carTypes.map((type) => {
                      const typeFare = routeInfo 
                        ? calculateFare(type.value, routeInfo.distance, 0, 0, stops.length, surgeInfo?.multiplier || 1.0).total 
                        : type.base * (surgeInfo?.multiplier || 1.0);
                      return (
                        <button
                          key={type.value}
                          onClick={() => setCarType(type.value)}
                          className={`p-3 rounded-xl border-2 transition-all ${
                            carType === type.value 
                              ? "border-[#00ff88] bg-[#00ff88]/20" 
                              : "border-[#00ff88]/20 bg-black/30"
                          }`}
                        >
                          <div className="text-2xl mb-1">{type.icon}</div>
                          <div className="text-white font-medium text-xs">{type.label}</div>
                          <div className={`text-sm ${surgeInfo?.is_surge ? 'text-orange-400' : 'text-[#00ff88]'}`}>
                            ₾{typeFare.toFixed(2)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment */}
                <div className="space-y-2">
                  <Label className="text-[#00ff88]">Payment Method</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={paymentMethod === "cash" ? "default" : "outline"}
                      onClick={() => setPaymentMethod("cash")}
                      className={paymentMethod === "cash" ? "bg-[#00ff88] text-black w-1/2" : "border-[#00ff88]/30 text-white w-1/2"}
                    >
                      💵 Cash
                    </Button>
                    <Button
                      variant={paymentMethod === "card" ? "default" : "outline"}
                      onClick={() => setPaymentMethod("card")}
                      className={paymentMethod === "card" ? "bg-[#00d4ff] text-black w-1/2" : "border-[#00d4ff]/30 text-white w-1/2"}
                    >
                      💳 PayPal / Card
                    </Button>
                  </div>
                </div>

                {paymentMethod === 'cash' ? (
                   <Button
                    className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold text-lg py-6"
                    onClick={() => handleBookRide(false)}
                    disabled={loading || !pickup.lat}
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Rocket className="w-5 h-5 mr-2" />}
                    Request Ride (Cash)
                  </Button>
                ) : (
                  <div className="mt-4 p-2 bg-white rounded-xl">
                     <PayPalButtons 
                        style={{ layout: "vertical", shape: "rect", borderRadius: 10 }}
                        disabled={!fareEstimate || !pickup.lat}
                        forceReRender={[fareEstimate?.total]}
                        createOrder={async (data, actions) => {
                           return actions.order.create({
                               purchase_units: [{
                                   amount: { value: fareEstimate.total, currency_code: "USD" }
                               }]
                           });
                        }}
                        onApprove={async (data, actions) => {
                           await actions.order.capture();
                           handleBookRide(true);
                        }}
                     />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Active Tab */}
          <TabsContent value="active">
            {activeRide ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-[#00d4ff]">Active Ride</CardTitle>
                    <Badge className={statusColors[activeRide.status]}>
                      {activeRide.status?.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-white">
                  {/* LIVE MAP Integration */}
                  {['accepted', 'arrived', 'in_progress'].includes(activeRide.status) && (
                      <LiveTrackingMap 
                        pickup={{ lat: parseFloat(activeRide.pickupLat), lng: parseFloat(activeRide.pickupLng) }}
                        destination={{ lat: parseFloat(activeRide.destinationLat || 0), lng: parseFloat(activeRide.destinationLng || 0) }}
                        driverLocation={{ 
                            lat: activeRide.driver_info?.lat || parseFloat(activeRide.pickupLat) + 0.005, 
                            lng: activeRide.driver_info?.lng || parseFloat(activeRide.pickupLng) + 0.005 
                        }}
                        status={activeRide.status}
                      />
                  )}

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

                  {activeRide.driver_info && (
                    <div className="bg-black/50 rounded-xl p-4 border border-[#00ff88]/20">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-[#00ff88] font-semibold">Your Driver</p>
                        
                        {/* CHAT BUTTON */}
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button size="sm" className="bg-[#00ff88] text-black">
                              <MessageSquare className="w-4 h-4 mr-1" /> Chat
                              {activeRide.unread_messages > 0 && (
                                <Badge className="ml-1 bg-red-500 text-white h-5 w-5 rounded-full p-0 flex items-center justify-center">
                                  {activeRide.unread_messages}
                                </Badge>
                              )}
                            </Button>
                          </SheetTrigger>
                          <SheetContent side="bottom" className="h-[80vh] bg-black border-t border-[#00ff88]/30">
                            <SheetHeader>
                              <SheetTitle className="text-[#00ff88]">
                                Chat with {activeRide.driver_info.name}
                              </SheetTitle>
                            </SheetHeader>
                            <ChatInterface 
                              rideId={activeRide.id} 
                              driverName={activeRide.driver_info.name}
                            />
                          </SheetContent>
                        </Sheet>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center">
                          <User className="w-7 h-7 text-black" />
                        </div>
                        <div>
                          <p className="font-medium text-lg">{activeRide.driver_info.name}</p>
                          <p className="text-sm text-gray-400">
                            {activeRide.driver_info.car_make} {activeRide.driver_info.car_model}
                          </p>
                          <p className="text-[#00ff88] font-mono">{activeRide.driver_info.license_plate}</p>
                        </div>
                      </div>
                    </div>
                  )}

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

          {/* Wallet Tab - NEW */}
          <TabsContent value="wallet">
             <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30">
                <CardHeader>
                   <CardTitle className="text-[#00ff88]">My Wallet</CardTitle>
                   <CardDescription>Top up your balance for card rides</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                   <div className="text-center p-6 bg-[#00ff88]/10 rounded-xl border border-[#00ff88]/20">
                      <p className="text-sm text-gray-400 uppercase">Current Balance</p>
                      <p className="text-4xl font-bold text-[#00ff88]">₾{user?.wallet_balance?.toFixed(2) || "0.00"}</p>
                   </div>

                   <div className="space-y-2">
                      <Label>Add Money (Top Up)</Label>
                      <Input 
                        type="number" 
                        placeholder="Enter amount (e.g. 50)" 
                        value={topupAmount} 
                        onChange={(e) => setTopupAmount(e.target.value)} 
                        className="bg-black/50 border-[#00d4ff]/30 text-white"
                      />
                   </div>

                   {topupAmount && parseFloat(topupAmount) > 0 && (
                      <div className="bg-white p-2 rounded-lg">
                        <PayPalButtons 
                            style={{ layout: "vertical", shape: "rect" }}
                            createOrder={(data, actions) => {
                                return actions.order.create({ purchase_units: [{ amount: { value: topupAmount, currency_code: "USD" } }] });
                            }}
                            onApprove={async (data, actions) => {
                                await actions.order.capture();
                                handleWalletTopUp(data); // Assume this function updates user balance via API
                            }}
                        />
                      </div>
                   )}
                </CardContent>
             </Card>
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
                    {rideHistory.length === 0 && (
                      <div className="text-center text-gray-500 py-8">No rides yet</div>
                    )}
                    {rideHistory.map(ride => (
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
        <Route path="/" element={<Navigate to="/rider/dashboard" replace />} />
        <Route path="/dashboard" element={<RiderDashboard />} />
        <Route path="*" element={<Navigate to="/rider/dashboard" replace />} />
        </Routes>
    </PayPalScriptProvider>
  );
};

export default RiderPortal;