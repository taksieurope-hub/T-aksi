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
import { Switch } from "@/components/ui/switch";
import {
  Car, MapPin, Clock, Star, History, Home, LogOut, User,
  Phone, Lock, ArrowLeft, Navigation, Wallet, DollarSign, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Banknote, Rocket,
  ExternalLink, CreditCard, Plus, Activity, Timer, Crosshair,
  Route as RouteIcon, Play, Square, MapPinned
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
      const endpoint = isLogin ? "/driver/login" : "/auth/register/driver";
      const res = await axios.post(`${API}${endpoint}`, formData);
      
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

// Live Map Component for Active Ride
const LiveRideMap = ({ activeRide, driverLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const routeRendererRef = useRef(null);
  
  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    
    const center = driverLocation || { lat: 41.7151, lng: 44.8271 };
    
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 15,
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
      
      routeRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: "#00ff88",
          strokeWeight: 4
        }
      });
    }
    
    // Update driver marker
    if (driverLocation) {
      if (!markerRef.current) {
        markerRef.current = new window.google.maps.Marker({
          map: mapInstanceRef.current,
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: "#00d4ff",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            rotation: driverLocation.heading || 0
          }
        });
      }
      
      markerRef.current.setPosition(new window.google.maps.LatLng(driverLocation.lat, driverLocation.lng));
      if (driverLocation.heading) {
        markerRef.current.setIcon({
          ...markerRef.current.getIcon(),
          rotation: driverLocation.heading
        });
      }
      
      mapInstanceRef.current.panTo(new window.google.maps.LatLng(driverLocation.lat, driverLocation.lng));
    }
    
    // Draw route to pickup/destination
    if (activeRide && driverLocation) {
      const directionsService = new window.google.maps.DirectionsService();
      
      let destination;
      if (activeRide.status === "accepted" || activeRide.status === "arrived") {
        // Navigate to pickup
        destination = { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng };
      } else if (activeRide.status === "in_progress") {
        // Navigate to destination or next stop
        destination = { lat: activeRide.destination_lat, lng: activeRide.destination_lng };
      }
      
      if (destination && destination.lat) {
        directionsService.route({
          origin: new window.google.maps.LatLng(driverLocation.lat, driverLocation.lng),
          destination: new window.google.maps.LatLng(destination.lat, destination.lng),
          travelMode: window.google.maps.TravelMode.DRIVING
        }, (result, status) => {
          if (status === 'OK' && routeRendererRef.current) {
            routeRendererRef.current.setDirections(result);
          }
        });
      }
    }
  }, [activeRide, driverLocation]);
  
  return (
    <div ref={mapRef} className="w-full h-[300px] rounded-xl border border-[#00d4ff]/20" />
  );
};

// Driver Dashboard
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
    car_make: "", car_model: "", car_year: "", car_color: "", license_plate: ""
  });
  
  // Top-up
  const [topupAmount, setTopupAmount] = useState("");
  const [topupReference, setTopupReference] = useState("");
  
  // Withdrawal
  const [withdrawalData, setWithdrawalData] = useState({ amount: "", bank_details: "" });

  const balance = user?.earnings?.balance || 0;
  const registrationStatus = user?.registration_status;
  const hasVehicle = user?.driver_info?.vehicle;

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
    document.head.appendChild(script);
  }, []);

  // Location update handler
  const handleLocationUpdate = useCallback(async (location) => {
    setDriverLocation(location);
    
    try {
      await axios.post(`${API}/driver/location`, location);
      
      // If in active ride, track distance
      if (activeRide && activeRide.status === "in_progress" && lastPositionRef.current) {
        const dist = calculateDistance(
          lastPositionRef.current.lat, lastPositionRef.current.lng,
          location.lat, location.lng
        );
        setDistanceTraveled(prev => prev + dist);
        
        // Update ride tracking
        await axios.post(`${API}/rides/${activeRide.id}/update-tracking`, location);
      }
      
      lastPositionRef.current = location;
    } catch (error) {
      console.error("Failed to update location:", error);
    }
  }, [activeRide]);
  
  // Use location tracker
  useLocationTracker(isOnline, handleLocationUpdate);
  
  // Calculate distance between two points (km)
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Wait timer
  useEffect(() => {
    let interval;
    if (arrivedTime && activeRide?.status === "arrived") {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - arrivedTime) / 60000);
        setWaitTimer(elapsed);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [arrivedTime, activeRide]);

  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
  }, []);

  useEffect(() => {
    if (registrationStatus === "approved" && isOnline) {
      fetchAvailableRides();
      const interval = setInterval(fetchAvailableRides, 5000);
      return () => clearInterval(interval);
    }
  }, [isOnline, registrationStatus]);

  const fetchAvailableRides = async () => {
    try {
      const res = await axios.get(`${API}/driver/rides/available`);
      setAvailableRides(res.data.rides || []);
    } catch (error) {
      console.error("Error fetching rides:", error);
    }
  };

  const fetchActiveRide = async () => {
    try {
      const res = await axios.get(`${API}/driver/active-ride`);
      if (res.data) {
        setActiveRide(res.data);
        setActiveTab("rides");
      }
    } catch (error) {
      console.error("Error fetching active ride:", error);
    }
  };

  const fetchRideHistory = async () => {
    try {
      const res = await axios.get(`${API}/driver/history`);
      setRideHistory(res.data.rides || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const fetchNearbyRides = async () => {
    try {
      const res = await axios.get(`${API}/driver/rides/nearby?radius=${searchRadius}`);
      setNearbyRides(res.data.rides || []);
    } catch (error) {
      console.error("Error fetching nearby rides:", error);
    }
  };

  const handleRequestToJoin = async (rideId) => {
    try {
      setLoading(true);
      await axios.post(`${API}/rides/${rideId}/request-join`);
      toast.success("You can now accept this ride!");
      // Move ride from nearby to available
      fetchAvailableRides();
      fetchNearbyRides();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request ride");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOnline = async (online) => {
    try {
      await axios.post(`${API}/driver/status?is_online=${online}`);
      setIsOnline(online);
      updateUser({ is_online: online });
      toast.success(online ? "You are now online!" : "You are now offline");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await axios.post(`${API}/driver/vehicle`, {
        ...vehicleData,
        car_year: parseInt(vehicleData.car_year)
      });
      
      toast.success(`Vehicle registered! Tier: ${res.data.tier}`);
      updateUser({
        driver_info: { vehicle: vehicleData, vehicle_tier: res.data.tier },
        registration_status: "pending_review"
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to register vehicle");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRide = async (rideId, estimatedFare) => {
    const commission = estimatedFare * DRIVER_COMMISSION_RATE;
    
    if (balance < commission) {
      toast.error(`Insufficient balance! Need ₾${commission.toFixed(2)}`);
      setActiveTab("earnings");
      return;
    }
    
    setLoading(true);
    try {
      const res = await axios.post(`${API}/rides/${rideId}/accept`);
      toast.success(`Ride accepted! Commission: ₾${res.data.commission_deducted.toFixed(2)}`);
      
      updateUser({
        earnings: { ...user.earnings, balance: res.data.new_balance }
      });
      
      const rideRes = await axios.get(`${API}/rides/${rideId}`);
      setActiveRide(rideRes.data);
      setAvailableRides(prev => prev.filter(r => r.id !== rideId));
      setDistanceTraveled(0);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to accept ride");
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineRide = async (rideId) => {
    try {
      await axios.post(`${API}/rides/${rideId}/decline`);
      setAvailableRides(prev => prev.filter(r => r.id !== rideId));
      toast.info("Ride declined");
    } catch (error) {
      toast.error("Failed to decline ride");
    }
  };

  const handleRideAction = async (action) => {
    if (!activeRide) return;
    
    setLoading(true);
    try {
      if (action === "arrived") {
        await axios.post(`${API}/rides/${activeRide.id}/arrived`);
        setArrivedTime(Date.now());
        toast.success("Marked as arrived - wait timer started");
      } else if (action === "start") {
        await axios.post(`${API}/rides/${activeRide.id}/start`);
        setRideStartTime(Date.now());
        setDistanceTraveled(0);
        lastPositionRef.current = driverLocation;
        toast.success("Ride started - tracking distance");
      } else if (action === "complete") {
        const res = await axios.post(`${API}/rides/${activeRide.id}/complete?final_distance=${distanceTraveled.toFixed(2)}&total_wait_minutes=${waitTimer}`);
        toast.success(`Ride completed! Final fare: ₾${res.data.final_fare.toFixed(2)}`);
        setActiveRide(null);
        setDistanceTraveled(0);
        setWaitTimer(0);
        setArrivedTime(null);
        setRideStartTime(null);
        fetchRideHistory();
        const userRes = await axios.get(`${API}/auth/me`);
        updateUser(userRes.data);
        return;
      }
      
      const rideRes = await axios.get(`${API}/rides/${activeRide.id}`);
      setActiveRide(rideRes.data);
    } catch (error) {
      toast.error(`Failed to ${action}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestTopup = async () => {
    if (!topupAmount || parseFloat(topupAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    setLoading(true);
    try {
      const res = await axios.post(`${API}/driver/topup/request`, {
        amount: parseFloat(topupAmount),
        payment_reference: topupReference
      });
      
      toast.success(res.data.message);
      setTopupAmount("");
      setTopupReference("");
      window.open(PAYMENT_LINK, "_blank");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request top-up");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!withdrawalData.amount || !withdrawalData.bank_details) {
      toast.error("Please fill all fields");
      return;
    }
    
    setLoading(true);
    try {
      await axios.post(`${API}/driver/withdraw`, {
        amount: parseFloat(withdrawalData.amount),
        bank_details: withdrawalData.bank_details
      });
      
      toast.success("Withdrawal request submitted!");
      setWithdrawalData({ amount: "", bank_details: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request withdrawal");
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    pending_vehicle: "bg-yellow-500 text-black",
    pending_review: "bg-orange-500 text-black",
    approved: "bg-[#00ff88] text-black",
    rejected: "bg-red-500 text-white"
  };

  const rideStatusColors = {
    searching: "bg-yellow-500 text-black",
    accepted: "bg-blue-500 text-white",
    arrived: "bg-purple-500 text-white",
    in_progress: "bg-[#00ff88] text-black",
    completed: "bg-green-600 text-white",
    cancelled: "bg-red-500 text-white"
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-black/50 backdrop-blur-xl border-b border-[#00d4ff]/20 p-4 sticky top-0 z-50">
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
          
          <div className="flex items-center space-x-4">
            {registrationStatus === "approved" && (
              <div className="flex items-center space-x-2">
                <span className={`text-sm ${isOnline ? "text-[#00ff88]" : "text-gray-500"}`}>
                  {isOnline ? "Online" : "Offline"}
                </span>
                <Switch
                  checked={isOnline}
                  onCheckedChange={handleToggleOnline}
                  className="data-[state=checked]:bg-[#00ff88]"
                />
              </div>
            )}
            <Button variant="ghost" size="icon" className="text-[#00d4ff]" onClick={() => navigate("/")}>
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-[#00d4ff]" onClick={logout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Location indicator when online */}
      {isOnline && driverLocation && (
        <div className="bg-[#00ff88]/10 border-b border-[#00ff88]/20 px-4 py-2">
          <div className="container mx-auto flex items-center text-sm text-[#00ff88]">
            <Crosshair className="w-4 h-4 mr-2 animate-pulse" />
            Location tracking active • {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
            {driverLocation.speed && <span className="ml-2">• {(driverLocation.speed * 3.6).toFixed(0)} km/h</span>}
          </div>
        </div>
      )}

      {/* Balance Warning */}
      {balance < 5 && registrationStatus === "approved" && (
        <div className="bg-yellow-500/20 border-b border-yellow-500 px-4 py-3">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <span className="text-yellow-400">Low balance! Top up to accept rides.</span>
            </div>
            <Button size="sm" onClick={() => setActiveTab("earnings")} className="bg-yellow-500 text-black">
              Top Up
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto p-4 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00d4ff]/20 mb-6">
            <TabsTrigger value="rides" className="data-[state=active]:bg-[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm">
              <Activity className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Rides</span>
            </TabsTrigger>
            <TabsTrigger value="nearby" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm" onClick={fetchNearbyRides}>
              <Crosshair className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Nearby</span>
            </TabsTrigger>
            <TabsTrigger value="vehicle" className="data-[state=active]:bg-[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm">
              <Car className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Vehicle</span>
            </TabsTrigger>
            <TabsTrigger value="earnings" className="data-[state=active]:bg-[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm">
              <Wallet className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Earn</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm">
              <History className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          {/* Rides Tab */}
          <TabsContent value="rides">
            {activeRide ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-[#00ff88]">Active Ride</CardTitle>
                    <Badge className={rideStatusColors[activeRide.status]}>
                      {activeRide.status?.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-white">
                  {/* Live Map */}
                  {mapsLoaded && (
                    <LiveRideMap activeRide={activeRide} driverLocation={driverLocation} />
                  )}

                  {/* Ride Details */}
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
                            <p className="text-yellow-400/60 text-xs">STOPS ({activeRide.stops.length})</p>
                            {activeRide.stops.map((stop, i) => (
                              <p key={i} className="text-sm text-yellow-400">• {stop.address}</p>
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

                  {/* Live Tracking Stats */}
                  {(activeRide.status === "arrived" || activeRide.status === "in_progress") && (
                    <div className="grid grid-cols-2 gap-4">
                      {activeRide.status === "arrived" && (
                        <div className="bg-purple-500/20 border border-purple-500 rounded-xl p-4 text-center">
                          <Timer className="w-6 h-6 mx-auto text-purple-400 mb-1" />
                          <p className="text-2xl font-bold text-purple-400">{waitTimer} min</p>
                          <p className="text-xs text-purple-400/70">Wait Time (2 free)</p>
                        </div>
                      )}
                      {activeRide.status === "in_progress" && (
                        <div className="bg-[#00ff88]/20 border border-[#00ff88] rounded-xl p-4 text-center">
                          <RouteIcon className="w-6 h-6 mx-auto text-[#00ff88] mb-1" />
                          <p className="text-2xl font-bold text-[#00ff88]">{distanceTraveled.toFixed(1)} km</p>
                          <p className="text-xs text-[#00ff88]/70">Distance Traveled</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fare */}
                  <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4">
                    <span className="text-[#00ff88]">
                      {activeRide.status === "completed" ? "Final Fare" : "Est. Fare"}
                    </span>
                    <span className="text-2xl font-bold text-[#00ff88]">
                      ₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-1 gap-2">
                    {activeRide.status === "accepted" && (
                      <Button 
                        className="bg-purple-500 text-white h-14 text-lg" 
                        onClick={() => handleRideAction("arrived")} 
                        disabled={loading}
                      >
                        <MapPin className="w-5 h-5 mr-2" /> I've Arrived at Pickup
                      </Button>
                    )}
                    {activeRide.status === "arrived" && (
                      <Button 
                        className="bg-blue-500 text-white h-14 text-lg" 
                        onClick={() => handleRideAction("start")} 
                        disabled={loading}
                      >
                        <Play className="w-5 h-5 mr-2" /> Start Trip
                      </Button>
                    )}
                    {activeRide.status === "in_progress" && (
                      <Button 
                        className="bg-[#00ff88] text-black h-14 text-lg font-bold" 
                        onClick={() => handleRideAction("complete")} 
                        disabled={loading}
                      >
                        <CheckCircle2 className="w-5 h-5 mr-2" /> Complete Trip
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : registrationStatus !== "approved" ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-yellow-500/30 text-center py-12">
                <AlertTriangle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
                <p className="text-yellow-400 text-lg font-semibold">Account Pending</p>
                <p className="text-gray-500 mt-2">
                  {registrationStatus === "pending_vehicle" 
                    ? "Please register your vehicle" 
                    : "Under review"}
                </p>
                {registrationStatus === "pending_vehicle" && (
                  <Button className="mt-4" onClick={() => setActiveTab("vehicle")}>
                    Register Vehicle
                  </Button>
                )}
              </Card>
            ) : !isOnline ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-gray-500/30 text-center py-12">
                <Activity className="w-16 h-16 mx-auto text-gray-500 mb-4" />
                <p className="text-gray-400 text-lg">You are offline</p>
                <Button className="mt-4 bg-[#00ff88] text-black" onClick={() => handleToggleOnline(true)}>
                  Go Online
                </Button>
              </Card>
            ) : availableRides.length === 0 ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30 text-center py-12">
                <Navigation className="w-16 h-16 mx-auto text-[#00d4ff]/50 mb-4 animate-pulse" />
                <p className="text-[#00d4ff]/70 text-lg">Searching for rides...</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {availableRides.map(ride => {
                  const commission = (ride.estimated_fare || 0) * DRIVER_COMMISSION_RATE;
                  const canAccept = balance >= commission;
                  
                  return (
                    <Card key={ride.id} className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
                      <CardContent className="p-4 text-white">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="text-[#00ff88] font-semibold">{ride.pickup}</p>
                            {ride.stops?.length > 0 && (
                              <p className="text-yellow-400/70 text-sm">+{ride.stops.length} stops</p>
                            )}
                            <p className="text-[#00d4ff]/70 text-sm">→ {ride.destination || "Open"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">Comm: ₾{commission.toFixed(2)}</p>
                          </div>
                        </div>
                        
                        {ride.distance_to_pickup !== undefined && (
                          <div className="flex items-center text-sm text-gray-400 mb-3">
                            <MapPin className="w-3 h-3 mr-1" />
                            {ride.distance_to_pickup.toFixed(1)} km away
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          <Button
                            className="flex-1 bg-[#00ff88] text-black font-bold h-12"
                            onClick={() => handleAcceptRide(ride.id, ride.estimated_fare)}
                            disabled={loading || !canAccept}
                          >
                            {canAccept ? (
                              <><CheckCircle2 className="w-4 h-4 mr-2" /> Accept</>
                            ) : (
                              "Low Balance"
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            className="border-red-500 text-red-500 h-12"
                            onClick={() => handleDeclineRide(ride.id)}
                          >
                            <XCircle className="w-5 h-5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Nearby Rides Tab - Discover rides in your area */}
          <TabsContent value="nearby">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30 mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-[#00ff88] flex items-center justify-between">
                  <span><Crosshair className="w-5 h-5 mr-2 inline" /> Nearby Rides</span>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="border-[#00ff88] text-[#00ff88]"
                    onClick={fetchNearbyRides}
                  >
                    <Navigation className="w-4 h-4 mr-1" /> Refresh
                  </Button>
                </CardTitle>
                <p className="text-gray-400 text-sm">
                  Discover all ride requests in your area, even if you weren't notified
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Label className="text-white">Search Radius:</Label>
                  <select 
                    value={searchRadius} 
                    onChange={(e) => { setSearchRadius(Number(e.target.value)); fetchNearbyRides(); }}
                    className="bg-black/50 border border-[#00d4ff]/30 text-white rounded-md px-3 py-2"
                  >
                    <option value={5}>5 km</option>
                    <option value={10}>10 km</option>
                    <option value={15}>15 km</option>
                    <option value={20}>20 km</option>
                    <option value={30}>30 km</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            {nearbyRides.length === 0 ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30 text-center py-12">
                <MapPin className="w-16 h-16 mx-auto text-[#00d4ff]/50 mb-4" />
                <p className="text-[#00d4ff]/70 text-lg">No rides within {searchRadius}km</p>
                <p className="text-gray-500 text-sm mt-2">Try increasing the search radius</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {nearbyRides.map(ride => {
                  const commission = (ride.estimated_fare || 0) * DRIVER_COMMISSION_RATE;
                  const canAccept = balance >= commission;
                  const wasNotified = ride.was_notified;
                  const hasDeclined = ride.has_declined;
                  
                  return (
                    <Card key={ride.id} className={`bg-black/60 backdrop-blur-xl border ${wasNotified ? 'border-[#00ff88]/50' : 'border-[#00d4ff]/30'}`}>
                      <CardContent className="p-4 text-white">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {wasNotified && <Badge className="bg-[#00ff88]/20 text-[#00ff88] text-xs">Notified</Badge>}
                              {hasDeclined && <Badge className="bg-red-500/20 text-red-400 text-xs">Declined</Badge>}
                            </div>
                            <p className="text-[#00ff88] font-semibold">{ride.pickup}</p>
                            {ride.stops?.length > 0 && (
                              <p className="text-yellow-400/70 text-sm">+{ride.stops.length} stops</p>
                            )}
                            <p className="text-[#00d4ff]/70 text-sm">→ {ride.destination || "Open"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">Comm: ₾{commission.toFixed(2)}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
                          <div className="flex items-center">
                            <MapPin className="w-3 h-3 mr-1" />
                            {ride.distance_to_pickup?.toFixed(1)} km away
                          </div>
                          <div className="flex items-center">
                            <Activity className="w-3 h-3 mr-1" />
                            Searching {ride.matching_radius}km
                          </div>
                        </div>
                        
                        {hasDeclined ? (
                          <Badge className="w-full justify-center py-2 bg-gray-700 text-gray-400">
                            You declined this ride
                          </Badge>
                        ) : wasNotified ? (
                          <div className="flex gap-2">
                            <Button
                              className="flex-1 bg-[#00ff88] text-black font-bold h-12"
                              onClick={() => handleAcceptRide(ride.id, ride.estimated_fare)}
                              disabled={loading || !canAccept}
                            >
                              {canAccept ? (
                                <><CheckCircle2 className="w-4 h-4 mr-2" /> Accept</>
                              ) : (
                                "Low Balance"
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              className="border-red-500 text-red-500 h-12"
                              onClick={() => handleDeclineRide(ride.id)}
                            >
                              <XCircle className="w-5 h-5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            className="w-full bg-[#00d4ff] text-black font-bold h-12"
                            onClick={() => handleRequestToJoin(ride.id)}
                            disabled={loading || !canAccept}
                          >
                            {canAccept ? (
                              <><Plus className="w-4 h-4 mr-2" /> Request to Accept</>
                            ) : (
                              "Low Balance - Top Up First"
                            )}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Vehicle Tab */}
          <TabsContent value="vehicle">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30">
              <CardHeader>
                <CardTitle className="text-[#00d4ff] flex items-center">
                  <Car className="w-5 h-5 mr-2" /> Vehicle
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hasVehicle ? (
                  <div className="space-y-4 text-white">
                    <div className="bg-black/50 rounded-xl p-4 border border-[#00ff88]/20">
                      <p className="text-[#00ff88] font-semibold mb-2">Registered Vehicle</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><p className="text-gray-500">Make</p><p>{user.driver_info.vehicle.car_make}</p></div>
                        <div><p className="text-gray-500">Model</p><p>{user.driver_info.vehicle.car_model}</p></div>
                        <div><p className="text-gray-500">Year</p><p>{user.driver_info.vehicle.car_year}</p></div>
                        <div><p className="text-gray-500">Color</p><p>{user.driver_info.vehicle.car_color}</p></div>
                        <div className="col-span-2">
                          <p className="text-gray-500">License Plate</p>
                          <p className="text-lg font-mono">{user.driver_info.vehicle.license_plate}</p>
                        </div>
                      </div>
                    </div>
                    <Badge className="bg-gradient-to-r from-purple-500 to-[#00d4ff] text-white">
                      Tier: {user.driver_info.vehicle_tier?.toUpperCase()}
                    </Badge>
                  </div>
                ) : (
                  <form onSubmit={handleRegisterVehicle} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[#00d4ff]">Make</Label>
                        <Input
                          value={vehicleData.car_make}
                          onChange={e => setVehicleData({...vehicleData, car_make: e.target.value})}
                          className="bg-black/50 border-[#00d4ff]/30 text-white"
                          placeholder="Toyota"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#00d4ff]">Model</Label>
                        <Input
                          value={vehicleData.car_model}
                          onChange={e => setVehicleData({...vehicleData, car_model: e.target.value})}
                          className="bg-black/50 border-[#00d4ff]/30 text-white"
                          placeholder="Camry"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[#00d4ff]">Year</Label>
                        <Input
                          type="number"
                          value={vehicleData.car_year}
                          onChange={e => setVehicleData({...vehicleData, car_year: e.target.value})}
                          className="bg-black/50 border-[#00d4ff]/30 text-white"
                          placeholder="2020"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[#00d4ff]">Color</Label>
                        <Input
                          value={vehicleData.car_color}
                          onChange={e => setVehicleData({...vehicleData, car_color: e.target.value})}
                          className="bg-black/50 border-[#00d4ff]/30 text-white"
                          placeholder="Black"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[#00d4ff]">License Plate</Label>
                      <Input
                        value={vehicleData.license_plate}
                        onChange={e => setVehicleData({...vehicleData, license_plate: e.target.value.toUpperCase()})}
                        className="bg-black/50 border-[#00d4ff]/30 text-white font-mono"
                        placeholder="AA-123-BB"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full bg-[#00d4ff] text-black font-bold" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                      Register Vehicle
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Earnings Tab */}
          <TabsContent value="earnings">
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-black/60 border border-[#00ff88]/30 p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase">Available</p>
                  <p className="text-2xl font-bold text-[#00ff88]">₾{balance.toFixed(2)}</p>
                </Card>
                <Card className="bg-black/60 border border-[#00d4ff]/30 p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase">Total Earned</p>
                  <p className="text-2xl font-bold text-[#00d4ff]">₾{(user?.earnings?.total_earned || 0).toFixed(0)}</p>
                </Card>
                <Card className="bg-black/60 border border-purple-500/30 p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase">Topped Up</p>
                  <p className="text-2xl font-bold text-purple-400">₾{(user?.earnings?.total_topped_up || 0).toFixed(0)}</p>
                </Card>
                <Card className="bg-black/60 border border-red-500/30 p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase">Withdrawn</p>
                  <p className="text-2xl font-bold text-red-400">₾{(user?.earnings?.total_withdrawn || 0).toFixed(0)}</p>
                </Card>
              </div>

              <Card className="bg-gradient-to-br from-[#00ff88]/10 to-transparent border border-[#00ff88]/30">
                <CardHeader>
                  <CardTitle className="text-[#00ff88] flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" /> Top Up Balance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[#00ff88]">Amount (₾)</Label>
                      <Input
                        type="number"
                        value={topupAmount}
                        onChange={e => setTopupAmount(e.target.value)}
                        className="bg-black/50 border-[#00ff88]/30 text-white"
                        placeholder="50.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[#00ff88]">Reference (optional)</Label>
                      <Input
                        value={topupReference}
                        onChange={e => setTopupReference(e.target.value)}
                        className="bg-black/50 border-[#00ff88]/30 text-white"
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full bg-[#00ff88] text-black font-bold h-12"
                    onClick={handleRequestTopup}
                    disabled={loading || !topupAmount}
                  >
                    Submit Request & Pay
                  </Button>
                  <a href={PAYMENT_LINK} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 text-[#00d4ff] hover:underline">
                    <ExternalLink className="w-4 h-4" /> Bank of Georgia
                  </a>
                </CardContent>
              </Card>

              <Card className="bg-black/60 border border-[#00d4ff]/30">
                <CardHeader>
                  <CardTitle className="text-[#00d4ff] flex items-center">
                    <Banknote className="w-5 h-5 mr-2" /> Withdraw
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[#00d4ff]">Amount (₾)</Label>
                    <Input
                      type="number"
                      value={withdrawalData.amount}
                      onChange={e => setWithdrawalData({...withdrawalData, amount: e.target.value})}
                      className="bg-black/50 border-[#00d4ff]/30 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#00d4ff]">Bank Details / IBAN</Label>
                    <Input
                      value={withdrawalData.bank_details}
                      onChange={e => setWithdrawalData({...withdrawalData, bank_details: e.target.value})}
                      className="bg-black/50 border-[#00d4ff]/30 text-white"
                    />
                  </div>
                  <Button
                    className="w-full bg-[#00d4ff] text-black font-bold"
                    onClick={handleWithdrawal}
                    disabled={loading || balance <= 0}
                  >
                    Request Withdrawal
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-black/60 border border-gray-500/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Commission Rate</span>
                    <span className="text-[#00ff88] font-bold">23%</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30">
              <CardHeader>
                <CardTitle className="text-[#00d4ff]">Ride History</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {rideHistory.length === 0 ? (
                    <div className="text-center text-gray-500 py-12">No rides yet</div>
                  ) : (
                    <div className="space-y-3">
                      {rideHistory.map(ride => (
                        <div key={ride.id} className="bg-black/50 border border-[#00d4ff]/10 rounded-xl p-4">
                          <div className="flex justify-between items-start mb-2">
                            <Badge className={rideStatusColors[ride.status]}>
                              {ride.status?.replace(/_/g, " ").toUpperCase()}
                            </Badge>
                            <span className="text-gray-500 text-sm">
                              {ride.created_at ? new Date(ride.created_at).toLocaleDateString() : "N/A"}
                            </span>
                          </div>
                          <p className="text-white text-sm">{ride.pickup}</p>
                          <p className="text-gray-500 text-xs">→ {ride.destination || "Open"}</p>
                          <div className="flex justify-between items-center mt-2">
                            <span className="text-gray-400 capitalize text-sm">{ride.carType}</span>
                            <span className="text-[#00ff88] font-bold">
                              ₾{(ride.final_fare || ride.estimated_fare)?.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
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
      <Route path="/" element={<Navigate to="/driver/dashboard" replace />} />
      <Route path="/dashboard" element={<DriverDashboard />} />
      <Route path="*" element={<Navigate to="/driver/dashboard" replace />} />
    </Routes>
  );
};

export default DriverPortal;
