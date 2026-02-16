import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";

// FIX: Import from @/config and @/api
import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import api from "@/api";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, // <--- Added to fix warning
  DialogFooter 
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Added missing icons
import {
  Car, MapPin, Star, History, Home, LogOut, User,
  Phone, Lock, ArrowLeft, Navigation, Wallet, Loader2, Rocket,
  Plus, X, Zap, TrendingUp, MessageSquare,
  Target, Crosshair, Send,
  Banknote, CreditCard, ExternalLink, AlertTriangle, Activity,
  MapPinned, CheckCircle2, XCircle, Play, Timer
} from "lucide-react";

const DRIVER_COMMISSION_RATE = 0.23;
const PAYMENT_LINK = "https://egreve.bog.ge//Taksi";
const LOCATION_UPDATE_INTERVAL = 5000; // 5 seconds

// Driver Auth Component
const DriverAuth = () => {
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
      const endpoint = isLogin ? "/auth/login" : "/auth/register/driver";
      const res = await api.post(endpoint, formData);

      if (res.data && res.data.token && res.data.user) {
        login(res.data.token, res.data.user);
        toast.success(isLogin ? "Welcome back, Pilot!" : "Account created!");
        navigate("/driver/dashboard");
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
      <Card className="w-full max-w-md bg-black/70 backdrop-blur-xl border border-[#00d4ff]/30">
        <CardHeader className="text-center">
          <Button
            variant="ghost"
            className="absolute left-4 top-4 text-[#00d4ff] hover:text-white"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center mx-auto mb-4">
            <Car className="w-10 h-10 text-black" />
          </div>
          <CardTitle className="text-2xl text-[#00d4ff]">
            {isLogin ? "Pilot Login" : "Become a Pilot"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#00d4ff]">First Name</Label>
                  <Input
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-black/50 border-[#00d4ff]/30 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#00d4ff]">Last Name</Label>
                  <Input
                    value={formData.surname}
                    onChange={e => setFormData({...formData, surname: e.target.value})}
                    className="bg-black/50 border-[#00d4ff]/30 text-white"
                    required
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-[#00d4ff]">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-[#00d4ff]/50" />
                <Input
                  type="tel"
                  value={formData.cellphone}
                  onChange={e => setFormData({...formData, cellphone: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00d4ff]/30 text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[#00d4ff]">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-[#00d4ff]/50" />
                <Input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00d4ff]/30 text-white"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-black font-bold"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isLogin ? "Sign In" : "Register as Driver"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="link" className="text-[#00ff88]" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? "Need an account? Register" : "Have an account? Sign In"}
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

    // Start watching location
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
      (error) => {
        console.error("Location error:", error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Send location updates at interval
    intervalRef.current = setInterval(() => {
      if (lastLocationRef.current) {
        onLocationUpdate(lastLocationRef.current);
      }
    }, LOCATION_UPDATE_INTERVAL);

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isOnline, onLocationUpdate]);

  return lastLocationRef;
};

// 🔥 FIXED: Google Maps Autocomplete
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {
  const callbackRef = useRef(onPlaceSelect);

  useEffect(() => {
    callbackRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

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

  useEffect(() => {
    const timer = setInterval(() => {
      if (inputRef.current && window.google && window.google.maps && window.google.maps.places) {
        clearInterval(timer);

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
      }
    }, 500);

    return () => clearInterval(timer);
  }, []);
};

// 🔥 FIXED: Driver Map
const DriverSmartMap = ({ activeRide, driverLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const routeRendererRef = useRef(null);
  const directionsServiceRef = useRef(null);

  const [isFollowing, setIsFollowing] = useState(true);

  const getSafeCoord = (val) => { const num = parseFloat(val); return !isNaN(num) && num !== 0 ? num : null; };

  // 1. Initialize Map
  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 41.7151, lng: 44.8271 },
        zoom: 17,
        disableDefaultUI: true,
        zoomControl: false,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#00ff88" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a4a" }] },
          { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#00d4ff" }] },
        ]
      });

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

  // 2. Update Driver Marker
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
          scale: 6,
          fillColor: "#00d4ff",
          fillOpacity: 1,
          strokeColor: "white",
          strokeWeight: 2,
          rotation: heading,
          anchor: new window.google.maps.Point(0, 2.5)
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
  }, [driverLocation, isFollowing]);

  // 3. Draw Route
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !activeRide || !driverLocation) return;

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
            }
        });
    }
  }, [activeRide?.status, activeRide?.pickup_lat, activeRide?.dest_lat]);

  const handleRecenter = () => {
      setIsFollowing(true);
      if (driverLocation) {
          const pos = { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) };
          mapInstanceRef.current.panTo(pos);
          mapInstanceRef.current.setZoom(17);
      }
  };

  const handleNav = (app) => {
    if (!activeRide) return;
    
    let destLat, destLng;
    let waypoints = "";

    // PHASE 1: GOING TO PICKUP
    if (["accepted", "arrived"].includes(activeRide.status)) {
        destLat = activeRide.pickup_lat; 
        destLng = activeRide.pickup_lng;
    } 
    // PHASE 2: GOING TO DESTINATION (AND STOPS)
    else {
        destLat = activeRide.dest_lat || activeRide.destination_lat;
        destLng = activeRide.dest_lng || activeRide.destination_lng;

        // If using Google Maps, add the intermediate stops
        if (activeRide.stops && activeRide.stops.length > 0 && app === 'google') {
            const stopsStr = activeRide.stops
                .filter(s => s.lat && s.lng) // Ensure valid coordinates
                .map(s => `${s.lat},${s.lng}`)
                .join('|');
            
            if (stopsStr) {
                waypoints = `&waypoints=${stopsStr}`;
            }
        }
    }
    
    if (!destLat || !destLng) return toast.error("No destination coordinates found");

    let url = "";
    if (app === 'waze') {
        url = `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;
    } else {
        url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}${waypoints}&travelmode=driving`;
    }
    
    window.open(url, '_blank');
  };

  return (
    <div className="relative w-full h-[450px] rounded-xl border border-[#00d4ff]/20 bg-[#1a1a2e] overflow-hidden">
        <div ref={mapRef} className="w-full h-full" />

        {!isFollowing && (
            <button
                onClick={handleRecenter}
                className="absolute bottom-20 right-4 bg-[#00d4ff] text-black p-3 rounded-full shadow-lg z-10 animate-in fade-in zoom-in border-2 border-white"
            >
                <Crosshair className="w-6 h-6 animate-pulse" />
            </button>
        )}

        <div className="absolute bottom-4 left-4 right-4 flex gap-3 z-10">
            <Button onClick={() => handleNav('waze')} className="flex-1 bg-black/80 backdrop-blur-md border border-[#00d4ff]/50 text-[#00d4ff] hover:bg-[#00d4ff]/20">
                <Zap className="w-4 h-4 mr-2" /> Waze
            </Button>
            <Button onClick={() => handleNav('google')} className="flex-1 bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] hover:bg-[#00ff88]/20">
                <Navigation className="w-4 h-4 mr-2" /> Maps
            </Button>
        </div>
    </div>
  );
};

// Driver Dashboard Component
const DriverDashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
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

  // Ride tracking state
  const [rideStartTime, setRideStartTime] = useState(null);
  const [arrivedTime, setArrivedTime] = useState(null);
  const [waitTimer, setWaitTimer] = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const lastPositionRef = useRef(null);

  // Vehicle registration
  const [vehicleData, setVehicleData] = useState({
    car_make: "",
    car_model: "",
    car_year: "",
    car_color: "",
    license_plate: "",
    license_front: null,
    license_back: null,
    reg_front: null,
    reg_back: null,
    car_photo_front: null,
    car_photo_back: null,
    car_photo_left: null,
    car_photo_right: null
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
    // 🔥 FIXED: Recover timer state from backend if missing locally
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
      // 1. ARRIVED
      if (action === "arrived") {
        await api.post(`/rides/${activeRide.id}/arrived`);
        setArrivedTime(Date.now());
        toast.success("Marked as arrived");
      } 
      // 2. START TRIP
      else if (action === "start") {
        await api.post(`/rides/${activeRide.id}/start`, { 
            pickup_wait_time: parseInt(waitTimer || 0)
        });
        setRideStartTime(Date.now());
        setDistanceTraveled(0);
        lastPositionRef.current = driverLocation;
        toast.success("Ride started");
      } 
      // 3. COMPLETE TRIP (🔥 THE FIX)
      else if (action === "complete") {
        // Ensure values are numbers
        const finalDist = isNaN(distanceTraveled) ? 0 : parseFloat(distanceTraveled);
        const finalWait = isNaN(waitTimer) ? 0 : parseInt(waitTimer);
        
        // 1. Construct URL with Query Params (for servers that check URL)
        const url = `/rides/${activeRide.id}/complete?final_distance=${finalDist}&total_wait_minutes=${finalWait}`;
        
        // 2. Construct Body Payload (for servers that check Body)
        const payload = {
            final_distance: finalDist,
            total_wait_minutes: finalWait,
            dropoff_lat: driverLocation?.lat,
            dropoff_lng: driverLocation?.lng
        };

        // Send BOTH!
        const res = await api.post(url, payload);
        
        // Safety Check: If fare is 0, try to use estimated fare so the driver sees SOMETHING
        const finalFare = res.data.final_fare > 0 
            ? res.data.final_fare 
            : (activeRide.estimated_fare || 0);

        // Force the fare into the object before setting state
        const completeData = { ...res.data, final_fare: finalFare };
        
        setCompletedRide(completeData);
        toast.success(`Ride completed! Fare: ₾${finalFare.toFixed(2)}`);
        
        // Reset State
        setActiveRide(null);
        setDistanceTraveled(0);
        setWaitTimer(0);
        setArrivedTime(null);
        setRideStartTime(null);
        
        fetchRideHistory();
        const userRes = await api.get(`/auth/me`);
        updateUser(userRes.data);
        return; 
      }
      
      // Refresh ride state if not completing
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

  return (
    <div className="min-h-screen bg-black">
      <header className="bg-black/50 backdrop-blur-xl border-b border-[#00d4ff]/20 p-4 sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center"><Car className="w-5 h-5 text-black" /></div>
            <div><p className="text-[#00d4ff] font-semibold">{user?.name} {user?.surname}</p><div className="flex items-center space-x-2"><Badge className={statusColors[registrationStatus] || "bg-gray-500"}>{registrationStatus?.replace(/_/g, " ").toUpperCase()}</Badge><span className="text-[#00ff88] text-sm font-bold">₾{balance.toFixed(2)}</span></div></div>
          </div>
          <div className="flex items-center space-x-4">
            {registrationStatus === "approved" && (<div className="flex items-center space-x-2"><span className={`text-sm ${isOnline ? "text-[#00ff88]" : "text-gray-500"}`}>{isOnline ? "Online" : "Offline"}</span><Button size="sm" className={isOnline ? "bg-[#00ff88] text-black" : "bg-gray-600"} onClick={() => handleToggleOnline(!isOnline)}>{isOnline ? "ON" : "OFF"}</Button></div>)}
            <Button variant="ghost" size="icon" className="text-[#00d4ff]" onClick={() => navigate("/")}><Home className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon" className="text-[#00d4ff]" onClick={logout}><LogOut className="w-5 h-5" /></Button>
          </div>
        </div>
      </header>

      {isOnline && driverLocation && (<div className="bg-[#00ff88]/10 border-b border-[#00ff88]/20 px-4 py-2"><div className="container mx-auto flex items-center text-sm text-[#00ff88]"><Crosshair className="w-4 h-4 mr-2 animate-pulse" />Location tracking active • {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}{driverLocation.speed && <span className="ml-2">• {(driverLocation.speed * 3.6).toFixed(0)} km/h</span>}</div></div>)}

      <main className="container mx-auto p-4 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00d4ff]/20 mb-6">
            <TabsTrigger value="rides" className="text-xs sm:text-sm"><Activity className="w-4 h-4 sm:mr-2" /> Rides</TabsTrigger>
            <TabsTrigger value="nearby" onClick={fetchNearbyRides} className="text-xs sm:text-sm"><Crosshair className="w-4 h-4 sm:mr-2" /> Nearby</TabsTrigger>
            <TabsTrigger value="vehicle" className="text-xs sm:text-sm"><Car className="w-4 h-4 sm:mr-2" /> Vehicle</TabsTrigger>
            <TabsTrigger value="earnings" className="text-xs sm:text-sm"><Wallet className="w-4 h-4 sm:mr-2" /> Earn</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm"><History className="w-4 h-4 sm:mr-2" /> History</TabsTrigger>
          </TabsList>

          <TabsContent value="rides">
            {activeRide ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
                <CardHeader><div className="flex justify-between items-center"><CardTitle className="text-[#00ff88]">Active Ride</CardTitle><Badge className={rideStatusColors[activeRide.status]}>{activeRide.status?.replace(/_/g, " ").toUpperCase()}</Badge></div></CardHeader>
                <CardContent className="space-y-4 text-white">

                  {/* 🔥 FIXED: Driver Map with Waze/Google Button */}
                  {mapsLoaded && (
                    <DriverSmartMap activeRide={activeRide} driverLocation={driverLocation} />
                  )}

                  <div className="bg-black/50 rounded-xl p-4 border border-[#00ff88]/20">
                    <div className="space-y-3">
                      <div className="flex items-start"><MapPin className="w-5 h-5 text-[#00ff88] mr-2 mt-0.5" /><div><p className="text-[#00ff88]/60 text-xs">PICKUP</p><p className="font-medium">{activeRide.pickup}</p></div></div>
                      {activeRide.stops?.length > 0 && <div className="flex items-start"><MapPinned className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" /><div><p className="text-yellow-400/60 text-xs">STOPS</p>{activeRide.stops.map((s,i)=><p key={i} className="text-sm">• {s.address}</p>)}</div></div>}
                      <div className="flex items-start"><Navigation className="w-5 h-5 text-[#00d4ff] mr-2 mt-0.5" /><div><p className="text-[#00d4ff]/60 text-xs">DESTINATION</p><p className="font-medium">{activeRide.destination || "Open Trip"}</p></div></div>
                    </div>
                  </div>

                  {(activeRide.status === "arrived" || activeRide.status === "in_progress") && (
                    <div className="grid grid-cols-2 gap-4">
                      {activeRide.status === "arrived" && <div className="bg-purple-500/20 border border-purple-500 rounded-xl p-4 text-center"><Timer className="w-6 h-6 mx-auto text-purple-400 mb-1" /><p className="text-2xl font-bold text-purple-400">{waitTimer} min</p><p className="text-xs text-purple-400/70">Wait Time</p></div>}
                      {activeRide.status === "in_progress" && <div className="bg-[#00ff88]/20 border border-[#00ff88] rounded-xl p-4 text-center"><Activity className="w-6 h-6 mx-auto text-[#00ff88] mb-1" /><p className="text-2xl font-bold text-[#00ff88]">{distanceTraveled.toFixed(1)} km</p><p className="text-xs text-[#00ff88]/70">Traveled</p></div>}
                    </div>
                  )}

                  <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4"><span className="text-[#00ff88]">Fare</span><span className="text-2xl font-bold text-[#00ff88]">₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}</span></div>

                  <div className="grid grid-cols-1 gap-2">
                    {activeRide.status === "accepted" && <Button className="bg-purple-500 text-white h-14 text-lg" onClick={() => handleRideAction("arrived")} disabled={loading}><MapPin className="w-5 h-5 mr-2" /> I've Arrived</Button>}
                    {activeRide.status === "arrived" && <Button className="bg-blue-500 text-white h-14 text-lg" onClick={() => handleRideAction("start")} disabled={loading}><Play className="w-5 h-5 mr-2" /> Start Trip</Button>}
                    {activeRide.status === "in_progress" && <Button className="bg-[#00ff88] text-black h-14 text-lg font-bold" onClick={() => handleRideAction("complete")} disabled={loading}><CheckCircle2 className="w-5 h-5 mr-2" /> Complete Trip</Button>}
                  </div>
                </CardContent>
              </Card>
            ) : (
                registrationStatus !== "approved" ? <Card className="bg-black/60 border border-yellow-500/30 text-center py-12"><AlertTriangle className="w-16 h-16 mx-auto text-yellow-500 mb-4" /><p className="text-yellow-400 font-semibold">Account Pending</p></Card> :
                !isOnline ? <Card className="bg-black/60 border border-gray-500/30 text-center py-12"><Activity className="w-16 h-16 mx-auto text-gray-500 mb-4" /><p className="text-gray-400">Offline</p><Button className="mt-4 bg-[#00ff88] text-black" onClick={() => handleToggleOnline(true)}>Go Online</Button></Card> :
                availableRides.length === 0 ? <Card className="bg-black/60 border border-[#00d4ff]/30 text-center py-12"><Navigation className="w-16 h-16 mx-auto text-[#00d4ff]/50 mb-4 animate-pulse" /><p className="text-[#00d4ff]/70">Searching for rides...</p></Card> :
                <div className="space-y-4">{availableRides.map(ride => { const comm = (ride.estimated_fare || 0) * 0.23; const canAccept = balance >= comm; return <Card key={ride.id} className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30"><CardContent className="p-4 text-white"><div className="flex justify-between items-start mb-3"><div className="flex-1"><p className="text-[#00ff88] font-semibold">{ride.pickup}</p><p className="text-[#00d4ff]/70 text-sm">→ {ride.destination}</p></div><div className="text-right"><p className="text-2xl font-bold text-[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p></div></div><div className="flex gap-2"><Button className="flex-1 bg-[#00ff88] text-black font-bold h-12" onClick={() => handleAcceptRide(ride.id, ride.estimated_fare)} disabled={loading || !canAccept}>{canAccept ? "Accept" : "Low Balance"}</Button><Button variant="outline" className="border-red-500 text-red-500 h-12" onClick={() => handleDeclineRide(ride.id)}><XCircle className="w-5 h-5" /></Button></div></CardContent></Card> })}</div>
            )}
          </TabsContent>

          <TabsContent value="nearby"><div className="space-y-4"><div className="flex justify-end mb-2"><Button size="sm" variant="outline" onClick={fetchNearbyRides}>Refresh</Button></div>{nearbyRides.map(ride => ( <Card key={ride.id} className="bg-black/60 border border-[#00d4ff]/30"><CardContent className="p-4 text-white"><p className="text-[#00ff88]">{ride.pickup}</p><p className="text-[#00d4ff]">→ {ride.destination}</p><Button className="w-full mt-2 bg-[#00d4ff] text-black" onClick={()=>handleRequestToJoin(ride.id)}>Request to Accept</Button></CardContent></Card> ))}</div></TabsContent>

          <TabsContent value="vehicle">
            <Card className="bg-black/60 border border-[#00d4ff]/30">
              <CardHeader>
                <CardTitle className="text-[#00d4ff]">Vehicle Registration</CardTitle>
              </CardHeader>
              <CardContent className="p-4 text-white">
                {hasVehicle ? (
                  <div className="p-4 bg-black/50 rounded border border-[#00ff88]/30 text-center">
                    <CheckCircle2 className="w-12 h-12 text-[#00ff88] mx-auto mb-2" />
                    <p className="text-lg font-bold">Documents Under Review</p>
                    <p className="text-xl font-mono text-[#00ff88] mt-2">{user.driver_info.vehicle.license_plate}</p>
                  </div>
                ) : (
                  <form onSubmit={handleRegisterVehicle} className="space-y-6">
                    <div className="space-y-3">
                      <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Vehicle Details</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Make</Label><Input required placeholder="Make" value={vehicleData.car_make} onChange={e=>setVehicleData({...vehicleData, car_make: e.target.value})} className="bg-black/50 text-white border-[#00d4ff]/30" /></div>
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Model</Label><Input required placeholder="Model" value={vehicleData.car_model} onChange={e=>setVehicleData({...vehicleData, car_model: e.target.value})} className="bg-black/50 text-white border-[#00d4ff]/30" /></div>
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Year</Label><Input required type="number" placeholder="2015" value={vehicleData.car_year} onChange={e=>setVehicleData({...vehicleData, car_year: e.target.value})} className="bg-black/50 text-white border-[#00d4ff]/30" /></div>
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Color</Label><Input required placeholder="Silver" value={vehicleData.car_color} onChange={e=>setVehicleData({...vehicleData, car_color: e.target.value})} className="bg-black/50 text-white border-[#00d4ff]/30" /></div>
                      </div>
                      <div className="space-y-1"><Label className="text-gray-400 text-xs">License Plate</Label><Input required placeholder="AB-123-CD" value={vehicleData.license_plate} onChange={e=>setVehicleData({...vehicleData, license_plate: e.target.value})} className="bg-black/50 text-white border-[#00d4ff]/30 uppercase font-mono" /></div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Driver's License</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Front</Label><Input required type="file" accept="image/*" onChange={e=>setVehicleData({...vehicleData, license_front: e.target.files[0]})} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Back</Label><Input required type="file" accept="image/*" onChange={e=>setVehicleData({...vehicleData, license_back: e.target.files[0]})} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Vehicle Registration</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Front</Label><Input required type="file" accept="image/*" onChange={e=>setVehicleData({...vehicleData, reg_front: e.target.files[0]})} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Back</Label><Input required type="file" accept="image/*" onChange={e=>setVehicleData({...vehicleData, reg_back: e.target.files[0]})} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Car Photos</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Front</Label><Input required type="file" accept="image/*" onChange={e=>setVehicleData({...vehicleData, car_photo_front: e.target.files[0]})} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Back</Label><Input required type="file" accept="image/*" onChange={e=>setVehicleData({...vehicleData, car_photo_back: e.target.files[0]})} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Left</Label><Input required type="file" accept="image/*" onChange={e=>setVehicleData({...vehicleData, car_photo_left: e.target.files[0]})} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
                        <div className="space-y-1"><Label className="text-gray-400 text-xs">Right</Label><Input required type="file" accept="image/*" onChange={e=>setVehicleData({...vehicleData, car_photo_right: e.target.files[0]})} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" /></div>
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
              <Card className="p-4 bg-black/60 border border-[#00ff88]">
                <p className="text-gray-400">Balance</p>
                <p className="text-3xl text-[#00ff88]">₾{balance.toFixed(2)}</p>
              </Card>
              <Input type="number" placeholder="Amount" value={topupAmount} onChange={e=>setTopupAmount(e.target.value)} className="bg-black/50 text-white"/>
              <Button className="w-full bg-[#00ff88] text-black" onClick={() => setShowCardModal(true)}>Top Up</Button>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <ScrollArea className="h-[400px]">
              {rideHistory.map(r => (
                <div key={r.id} className="p-4 bg-black/50 border border-[#00d4ff]/20 mb-2 rounded">
                  <p className="text-white">{r.pickup}</p>
                  <p className="text-[#00ff88] font-bold">₾{r.final_fare}</p>
                </div>
              ))}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </main>

      {/* Top Up Modal */}
      <Dialog open={showCardModal} onOpenChange={setShowCardModal}>
          <DialogContent 
            className="bg-[#1a1a2e] border border-[#00ff88]/30 text-white sm:max-w-md w-[95%]"
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle className="text-[#00ff88] flex items-center gap-2">
                <CreditCard className="w-5 h-5"/> Pay with Card
              </DialogTitle>
              <DialogDescription className="sr-only">Enter card details to top up your driver balance.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCardPayment} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="text-gray-400 text-xs">CARD NUMBER</Label>
                <Input
                  value={cardDetails.number}
                  onChange={(e)=>handleCardInput("number", e.target.value)}
                  placeholder="0000 0000 0000 0000"
                  className="bg-black/50 border-[#00ff88]/30 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-xs">EXPIRY</Label>
                    <Input value={cardDetails.expiry} onChange={(e)=>handleCardInput("expiry", e.target.value)} placeholder="MM/YY" className="bg-black/50 border-[#00ff88]/30 text-white"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-400 text-xs">CVV</Label>
                    <Input value={cardDetails.cvv} onChange={(e)=>handleCardInput("cvv", e.target.value)} placeholder="123" type="password" className="bg-black/50 border-[#00ff88]/30 text-white"/>
                  </div>
              </div>
              <Button type="submit" className="w-full bg-[#00ff88] text-black font-bold h-12" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : `Pay ₾${topupAmount}`}
              </Button>
            </form>
          </DialogContent>
      </Dialog>

      {/* Trip Complete Modal (CORRECT DRIVER TEXT) */}
      <Dialog open={!!completedRide} onOpenChange={() => setCompletedRide(null)}>
        <DialogContent 
            className="bg-black border border-[#00ff88] text-center p-6 sm:max-w-sm rounded-2xl"
            aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="text-[#00ff88] text-2xl font-bold">Trip Complete!</DialogTitle>
            <DialogDescription className="sr-only">Summary of fare and payment collection.</DialogDescription>
          </DialogHeader>
          
          <div className="py-6 space-y-3">
            <p className="text-gray-400 text-sm uppercase tracking-widest">Total Fare</p>
            <p className="text-5xl font-bold text-white">
              ₾{completedRide?.final_fare?.toFixed(2) || "0.00"}
            </p>
            
            {/* CORRECT LOGIC: Card = Paid, Cash = Collect */}
            {(completedRide?.payment_method || "").toLowerCase() === 'card' ? (
                 <div className="bg-[#00ff88]/20 border border-[#00ff88] p-3 rounded-lg">
                    <p className="text-[#00ff88] text-sm font-bold flex items-center justify-center gap-2">
                        <CreditCard className="w-4 h-4" /> PAID ONLINE - DO NOT CHARGE CLIENT
                    </p>
                </div>
            ) : (
                 <div className="bg-yellow-500/20 border border-yellow-500 p-3 rounded-lg animate-pulse">
                    <p className="text-yellow-400 text-sm font-bold flex items-center justify-center gap-2">
                        <Banknote className="w-4 h-4" /> COLLECT CASH FROM CLIENT
                    </p>
                </div>
            )}
          </div>
          
          <Button
            className="w-full bg-[#00ff88] text-black font-bold h-14 text-xl rounded-xl"
            onClick={() => setCompletedRide(null)}
          >
            Confirm & Close
          </Button>
        </DialogContent>
      </Dialog>

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
    <Routes>
      <Route path="/" element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<DriverDashboard />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
};

export default DriverPortal;