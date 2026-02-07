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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// Added missing icons (Banknote, AlertTriangle, etc.)
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
      // FIX: Use api.post
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
                  <Label htmlFor="driver-name" className="text-[#00d4ff]">First Name</Label>
                  <Input
                    id="driver-name"
                    name="name"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-black/50 border-[#00d4ff]/30 text-white"
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driver-surname" className="text-[#00d4ff]">Last Name</Label>
                  <Input
                    id="driver-surname"
                    name="surname"
                    value={formData.surname}
                    onChange={e => setFormData({...formData, surname: e.target.value})}
                    className="bg-black/50 border-[#00d4ff]/30 text-white"
                    required
                    autoComplete="family-name"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="driver-phone" className="text-[#00d4ff]">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-[#00d4ff]/50" />
                <Input
                  id="driver-phone"
                  name="cellphone"
                  type="tel"
                  value={formData.cellphone}
                  onChange={e => setFormData({...formData, cellphone: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00d4ff]/30 text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                  autoComplete="tel"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-password" className="text-[#00d4ff]">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-[#00d4ff]/50" />
                <Input
                  id="driver-password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00d4ff]/30 text-white"
                  required
                  autoComplete="current-password"
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

// Live Ride Map Component
const LiveRideMap = ({ activeRide, driverLocation, mapsLoaded }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const [eta, setEta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mapsLoaded || !window.google || !mapRef.current || !activeRide) return;

    const center = driverLocation || { lat: 41.7151, lng: 44.8271 };
    const riderPos = { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng };

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false
      });

      directionsRendererRef = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: false,
        polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5 }
      });

      riderMarkerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        position: riderPos,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#00ff88",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2
        }
      });
    }

    if (driverLocation) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new window.google.maps.Marker({
          map: mapInstanceRef.current,
          position: driverLocation,
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
      } else {
        driverMarkerRef.current.setPosition(driverLocation);
        if (driverLocation.heading) {
          driverMarkerRef.current.setIcon({
            ...driverMarkerRef.current.getIcon(),
            rotation: driverLocation.heading
          });
        }
      }

      mapInstanceRef.current.panTo(driverLocation);

      // Update navigation and ETA
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route({
        origin: driverLocation,
        destination: riderPos,
        travelMode: 'DRIVING',
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: 'pessimistic'
        }
      }, (result, status) => {
        if (status === 'OK') {
          directionsRendererRef.current.setDirections(result);
          setEta(result.routes[0].legs[0].duration_in_traffic.text);
          setError(null);
        } else {
          setError("Navigation failed");
        }
      });
    }

  }, [activeRide, driverLocation, mapsLoaded]);

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-[400px] rounded-xl border border-[#00ff88]/20" />
      {eta && (
        <Badge className="absolute top-4 left-4 bg-[#00ff88] text-black">
          ETA: {eta}
        </Badge>
      )}
      {error && (
        <Badge className="absolute top-4 left-4 bg-red-500 text-white">
          {error}
        </Badge>
      )}
    </div>
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
      await api.post(`/driver/location`, location);
      
      // If in active ride, track distance
      if (activeRide && activeRide.status === "in_progress" && lastPositionRef.current) {
        const dist = calculateDistance(
          lastPositionRef.current.lat, lastPositionRef.current.lng,
          location.lat, location.lng
        );
        setDistanceTraveled(prev => prev + dist);
        
        // Update ride tracking
        await api.post(`/rides/${activeRide.id}/update-tracking`, location);
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
      const res = await api.get(`/driver/rides/available`);
      setAvailableRides(res.data.rides || []);
    } catch (error) {
      console.error("Error fetching rides:", error);
    }
  };

  const fetchActiveRide = async () => {
    try {
      const res = await api.get(`/driver/active-ride`);
      if (res.data) {
        setActiveRide(res.data);
        setActiveTab("rides");
        if (res.data.status === "arrived" && !arrivedTime) {
          setArrivedTime(Date.now());
        }
        if (res.data.status === "in_progress" && !rideStartTime) {
          setRideStartTime(Date.now());
        }
      }
    } catch (error) {
      console.error("Error fetching active ride:", error);
    }
  };

  const fetchRideHistory = async () => {
    try {
      const res = await api.get(`/driver/history`);
      setRideHistory(res.data.rides || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const fetchNearbyRides = async () => {
    try {
      const res = await api.get(`/driver/rides/nearby?radius=${searchRadius}`);
      setNearbyRides(res.data.rides || []);
    } catch (error) {
      console.error("Error fetching nearby rides:", error);
    }
  };

  const handleRequestToJoin = async (rideId) => {
    try {
      setLoading(true);
      await api.post(`/rides/${rideId}/request-join`);
      toast.success("You can now accept this ride!");
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
      await api.post(`/driver/status`, { is_online: online });
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
      const res = await api.post(`/driver/vehicle`, vehicleData);
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
    const commission = (estimatedFare || 0) * DRIVER_COMMISSION_RATE;
    
    if (balance < commission) {
      toast.error(`Insufficient balance! Need ₾${commission.toFixed(2)}`);
      setActiveTab("earnings");
      return;
    }
    
    setLoading(true);
    try {
      const res = await api.post(`/rides/${rideId}/accept`);
      toast.success(`Ride accepted! Commission: ₾${res.data.commission_deducted?.toFixed(2)}`);
      
      if (res.data.new_balance) {
        updateUser({
          earnings: { ...user.earnings, balance: res.data.new_balance }
        });
      }
      
      const rideRes = await api.get(`/rides/${rideId}`);
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
      await api.post(`/rides/${rideId}/decline`);
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
        await api.post(`/rides/${activeRide.id}/arrived`);
        setArrivedTime(Date.now());
        toast.success("Marked as arrived - wait timer started");
      } else if (action === "start") {
        await api.post(`/rides/${activeRide.id}/start`);
        setRideStartTime(Date.now());
        setDistanceTraveled(0);
        lastPositionRef.current = driverLocation;
        toast.success("Ride started - tracking distance");
      } else if (action === "complete") {
        const res = await api.post(`/rides/${activeRide.id}/complete`, {
          final_distance: distanceTraveled,
          total_wait_minutes: waitTimer
        });
        toast.success(`Ride completed! Final fare: ₾${res.data.final_fare.toFixed(2)}`);
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
      
      const rideRes = await api.get(`/rides/${activeRide.id}`);
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
      const res = await api.post(`/driver/topup/request`, {
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
      await api.post(`/driver/withdraw`, withdrawalData);
      
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
                <Button 
                  size="sm" 
                  className={isOnline ? "bg-[#00ff88] text-black" : "bg-gray-600"}
                  onClick={() => handleToggleOnline(!isOnline)}
                >
                  {isOnline ? "ON" : "OFF"}
                </Button>
              </div>
            )}
            <Button variant="ghost" size="icon" className="text-[#00d4ff]" onClick={() => navigate("/")}>
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text[#00d4ff]" onClick={logout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ... (keep your Location indicator, Balance Warning) */}

      {/* Main Content */}
      <main className="container mx-auto p-4 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00d4ff]/20 mb-6">
            <TabsTrigger value="rides" className="data-[state=active]:bg-[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm">
              <Activity className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Rides</span>
            </TabsTrigger>
            <TabsTrigger value="nearby" className="data-[state=active]:bg-[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm" onClick={fetchNearbyRides}>
              <Crosshair className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Nearby</span>
            </TabsTrigger>
            <TabsTrigger value="vehicle" className="data-[state=active]:bg-[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm">
              <Car className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Vehicle</span>
            </TabsTrigger>
            <TabsTrigger value="earnings" className="data-[state=active]:bg[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm">
              <Wallet className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Earn</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg[#00d4ff] data-[state=active]:text-black text-xs sm:text-sm">
              <History className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          {/* Rides Tab */}
          <TabsContent value="rides">
            {activeRide ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text[#00ff88]">Active Ride</CardTitle>
                    <Badge className={rideStatusColors[activeRide.status]}>
                      {activeRide.status?.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-white">
                  {/* Live Navigation Map */}
                  {mapsLoaded && (
                    <LiveRideMap activeRide={activeRide} driverLocation={driverLocation} />
                  )}

                  {/* Ride Details */}
                  <div className="bg-black/50 rounded-xl p-4 border border[#00ff88]/20">
                    <div className="space-y-3">
                      <div className="flex items-start">
                        <MapPin className="w-5 h-5 text[#00ff88] mr-2 mt-0.5" />
                        <div>
                          <p className="text[#00ff88]/60 text-xs">PICKUP</p>
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
                        <Navigation className="w-5 h-5 text[#00d4ff] mr-2 mt-0.5" />
                        <div>
                          <p className="text[#00d4ff]/60 text-xs">DESTINATION</p>
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
                        <div className="bg[#00ff88]/20 border border[#00ff88] rounded-xl p-4 text-center">
                          <Activity className="w-6 h-6 mx-auto text[#00ff88] mb-1" />
                          <p className="text-2xl font-bold text[#00ff88]">{distanceTraveled.toFixed(1)} km</p>
                          <p className="text-xs text[#00ff88]/70">Distance Traveled</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fare */}
                  <div className="flex justify-between items-center bg[#00ff88]/10 rounded-xl p-4">
                    <span className="text[#00ff88]">
                      {activeRide.status === "completed" ? "Final Fare" : "Est. Fare"}
                    </span>
                    <span className="text-2xl font-bold text[#00ff88]">
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
                        className="bg[#00ff88] text-black h-14 text-lg font-bold" 
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
                <Button className="mt-4 bg[#00ff88] text-black" onClick={() => handleToggleOnline(true)}>
                  Go Online
                </Button>
              </Card>
            ) : availableRides.length === 0 ? (
              <Card className="bg-black/60 backdrop-blur-xl border border[#00d4ff]/30 text-center py-12">
                <Navigation className="w-16 h-16 mx-auto text[#00d4ff]/50 mb-4 animate-pulse" />
                <p className="text[#00d4ff]/70 text-lg">Searching for rides...</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {availableRides.map(ride => {
                  const commission = (ride.estimated_fare || 0) * DRIVER_COMMISSION_RATE;
                  const canAccept = balance >= commission;
                  
                  return (
                    <Card key={ride.id} className="bg-black/60 backdrop-blur-xl border border[#00ff88]/30">
                      <CardContent className="p-4 text-white">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <p className="text[#00ff88] font-semibold">{ride.pickup}</p>
                            {ride.stops?.length > 0 && (
                              <p className="text-yellow-400/70 text-sm">+{ride.stops.length} stops</p>
                            )}
                            <p className="text[#00d4ff]/70 text-sm">→ {ride.destination || "Open"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p>
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
                            className="flex-1 bg[#00ff88] text-black font-bold h-12"
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

          {/* Nearby Rides Tab */}
          <TabsContent value="nearby">
            <Card className="bg-black/60 backdrop-blur-xl border border[#00ff88]/30 mb-4">
              <CardHeader>
                <CardTitle className="text[#00ff88] flex items-center">
                  <Crosshair className="w-5 h-5 mr-2" /> Nearby Rides
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-white">Radius (km):</Label>
                    <Input
                      type="number"
                      value={searchRadius}
                      onChange={e => setSearchRadius(e.target.value)}
                      className="w-20 bg-black/50 border[#00ff88]/30 text-white"
                    />
                    <Button onClick={fetchNearbyRides} className="bg[#00ff88] text-black">
                      Search
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <ScrollArea className="h-[calc(100vh-300px)]">
              {nearbyRides.map(ride => {
                const commission = (ride.estimated_fare || 0) * DRIVER_COMMISSION_RATE;
                const canAccept = balance >= commission;
                const wasNotified = ride.was_notified;
                const hasDeclined = ride.has_declined;
                
                return (
                  <Card key={ride.id} className="mb-4 bg-black/60 backdrop-blur-xl border border[#00ff88]/30">
                    <CardContent className="p-4 text-white">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <p className="text[#00ff88] font-semibold">{ride.pickup}</p>
                          {ride.stops?.length > 0 && (
                            <p className="text-yellow-400/70 text-sm">+{ride.stops.length} stops</p>
                          )}
                          <p className="text[#00d4ff]/70 text-sm">→ {ride.destination || "Open"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p>
                          <p className="text-xs text-gray-500">Comm: ₾{commission.toFixed(2)}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm text-gray-400 mb-3">
                        <span>{ride.distance_to_pickup?.toFixed(1)} km away</span>
                        <span>{ride.drivers_notified} notified</span>
                      </div>
                      
                      {hasDeclined ? (
                        <p className="text-red-500 text-center">Declined</p>
                      ) : wasNotified ? (
                        <div className="flex gap-2">
                          <Button
                            className="flex-1 bg[#00ff88] text-black"
                            onClick={() => handleAcceptRide(ride.id, ride.estimated_fare)}
                            disabled={loading || !canAccept}
                          >
                            Accept
                          </Button>
                          <Button variant="destructive" className="flex-1" onClick={() => handleDeclineRide(ride.id)}>
                            Decline
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full bg[#00d4ff] text-black"
                          onClick={() => handleRequestToJoin(ride.id)}
                          disabled={loading || !canAccept}
                        >
                          Request to Join
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </ScrollArea>
          </TabsContent>

          {/* Vehicle Tab */}
          <TabsContent value="vehicle">
            {/* Vehicle form unchanged */}
          </TabsContent>

          {/* Earnings Tab */}
          <TabsContent value="earnings">
            {/* Earnings UI unchanged */}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            {/* History UI unchanged */}
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