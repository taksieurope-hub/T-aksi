// DriverPortal.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";

// Your existing imports (kept)
import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import api from "@/api";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import {
  Car,
  MapPin,
  History,
  Home,
  LogOut,
  User,
  Phone,
  Lock,
  ArrowLeft,
  Navigation,
  Wallet,
  Loader2,
  Rocket,
  Plus,
  X,
  Zap,
  TrendingUp,
  MessageSquare,
  Crosshair,
  Send,
  Banknote,
  CreditCard,
  AlertTriangle,
  Activity,
  MapPinned,
  CheckCircle2,
  XCircle,
  Play,
  Timer,
  CalendarClock,
  Gift,
  Headphones,
  ShieldAlert,
} from "lucide-react";

// Pricing Rules (kept)
const PRICING_RULES = {
  economy: { name: "Economy", base: 2.8, perKm: 0.5, perMinWait: 0.4, freeWait: 2, stopFee: 0.0, icon: "🚗" },
  comfort: { name: "Comfort", base: 3.38, perKm: 0.55, perMinWait: 0.45, freeWait: 2, stopFee: 0.0, icon: "🚙" },
  suv: { name: "SUV / XL", base: 5.18, perKm: 0.8, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "🚐" },
  personal: { name: "Personal", base: 5.12, perKm: 0.7, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "👤" },
  jumpstart: { name: "Jumpstart", base: 4.5, perKm: 0.0, perMinWait: 0.4, freeWait: 2, stopFee: 0.0, icon: "⚡" },
};

const DRIVER_COMMISSION_RATE = 0.23;
const PAYMENT_LINK = "https://egreve.bog.ge//Taksi";
const LOCATION_UPDATE_INTERVAL = 2000;

const CANCEL_REASONS = {
  accepted: ["Heavy Traffic / Stuck", "Car Trouble / Mechanical Issue", "Accidentally Accepted", "Cannot Locate Pickup Address", "Personal Emergency"],
  arrived: ["Client Not Showing Up (Timer Expired)", "Client Refused Ride", "Too Much Luggage / Cargo", "Unaccompanied Minor", "No Mask / Safety Concern"],
  in_progress: ["Client Requested Early End", "Client Behavior / Rude", "Safety Concern", "Wrong Destination", "Vehicle Breakdown"],
};

// -----------------------------
// Driver Auth (kept)
// -----------------------------
const DriverAuth = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
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
          <Button variant="ghost" className="absolute left-4 top-4 text-[#00d4ff] hover:text-white" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center mx-auto mb-4">
            <Car className="w-10 h-10 text-black" />
          </div>

          <CardTitle className="text-2xl text-[#00d4ff]">{isLogin ? "Pilot Login" : "Become a Pilot"}</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#00d4ff]">First Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-black/50 border-[#00d4ff]/30 text-white" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#00d4ff]">Last Name</Label>
                  <Input value={formData.surname} onChange={(e) => setFormData({ ...formData, surname: e.target.value })} className="bg-black/50 border-[#00d4ff]/30 text-white" required />
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
                  onChange={(e) => setFormData({ ...formData, cellphone: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-10 bg-black/50 border-[#00d4ff]/30 text-white"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-black font-bold" disabled={loading}>
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

// -----------------------------
// Location Tracker (kept)
// -----------------------------
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
        lastLocationRef.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
        };
      },
      (error) => console.error("Location error:", error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    intervalRef.current = setInterval(() => {
      if (lastLocationRef.current) onLocationUpdate(lastLocationRef.current);
    }, LOCATION_UPDATE_INTERVAL);

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOnline, onLocationUpdate]);

  return lastLocationRef;
};

// -----------------------------
// Bolt-style bottom nav
// -----------------------------
const BottomNav = ({ value, onChange, hasActiveRide }) => {
  const Item = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => onChange(id)}
      className={`flex flex-col items-center justify-center flex-1 py-2 ${value === id ? "text-[#00ff88]" : "text-white/60"}`}
    >
      <Icon className="w-5 h-5 mb-1" />
      <span className="text-[11px]">{label}</span>
      {id === "rides" && hasActiveRide ? <span className="mt-1 text-[10px] px-2 py-0.5 rounded-full bg-[#00ff88]/20 text-[#00ff88]">LIVE</span> : null}
    </button>
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-t border-white/10">
      <div className="mx-auto max-w-2xl flex">
        <Item id="home" icon={Home} label="Home" />
        <Item id="earn" icon={TrendingUp} label="Earn more" />
        <Item id="rides" icon={History} label="Rides" />
        <Item id="help" icon={MessageSquare} label="Help" />
      </div>
    </div>
  );
};

const StatTile = ({ label, value, sub, tone = "green" }) => {
  const tones = {
    green: "border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88]",
    cyan: "border-[#00d4ff]/30 bg-[#00d4ff]/10 text-[#00d4ff]",
    gray: "border-white/10 bg-white/5 text-white",
    red: "border-red-500/30 bg-red-500/10 text-red-400",
  };
  return (
    <div className={`rounded-xl p-3 border ${tones[tone]}`}>
      <div className="text-[11px] opacity-70">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
      {sub ? <div className="text-[11px] opacity-70 mt-1">{sub}</div> : null}
    </div>
  );
};

// -----------------------------
// Google Map (kept minimal + your neon route)
// -----------------------------
const DriverSmartMap = ({ activeRide, driverLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const routeRendererRef = useRef(null);
  const directionsServiceRef = useRef(null);

  const [isFollowing, setIsFollowing] = useState(true);
  const getSafeCoord = (val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num !== 0 ? num : null;
  };

  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 41.7151, lng: 44.8271 },
        zoom: 17,
        disableDefaultUI: true,
        zoomControl: false,
        gestureHandling: "greedy",
        backgroundColor: "#ffffff",
        styles: [
          { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
          { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
          { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dadada" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#e9e9e9" }] },
        ],
      });

      mapInstanceRef.current.addListener("dragstart", () => setIsFollowing(false));

      routeRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: false,
        polylineOptions: { strokeColor: "#00ff88", strokeWeight: 6 },
        preserveViewport: true,
      });

      directionsServiceRef.current = new window.google.maps.DirectionsService();
    }
  }, []);

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
          anchor: new window.google.maps.Point(0, 2.5),
        },
        zIndex: 1000,
      });
    } else {
      markerRef.current.setPosition(pos);
      const icon = markerRef.current.getIcon();
      icon.rotation = heading;
      markerRef.current.setIcon(icon);
    }

    if (isFollowing) mapInstanceRef.current.panTo(pos);
  }, [driverLocation, isFollowing]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !activeRide || !driverLocation) return;

    const dLat = getSafeCoord(driverLocation.lat);
    const dLng = getSafeCoord(driverLocation.lng);
    if (!dLat || !dLng) return;

    let target = null;
    if (["accepted", "arrived"].includes(activeRide.status)) {
      target = { lat: parseFloat(activeRide.pickup_lat), lng: parseFloat(activeRide.pickup_lng) };
    } else if (activeRide.status === "in_progress") {
      target = {
        lat: parseFloat(activeRide.dest_lat || activeRide.destination_lat),
        lng: parseFloat(activeRide.dest_lng || activeRide.destination_lng),
      };
    }

    if (target && target.lat) {
      directionsServiceRef.current.route(
        {
          origin: { lat: dLat, lng: dLng },
          destination: target,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && routeRendererRef.current) {
            routeRendererRef.current.setDirections(result);
          }
        }
      );
    }
  }, [activeRide?.status, activeRide?.pickup_lat, activeRide?.dest_lat, activeRide?.dest_lng, activeRide?.destination_lat, activeRide?.destination_lng, driverLocation]);

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

    if (["accepted", "arrived"].includes(activeRide.status)) {
      destLat = activeRide.pickup_lat;
      destLng = activeRide.pickup_lng;
    } else {
      destLat = activeRide.dest_lat || activeRide.destination_lat;
      destLng = activeRide.dest_lng || activeRide.destination_lng;

      if (activeRide.stops && activeRide.stops.length > 0 && app === "google") {
        const stopsStr = activeRide.stops
          .filter((s) => s.lat && s.lng)
          .map((s) => `${s.lat},${s.lng}`)
          .join("|");
        if (stopsStr) waypoints = `&waypoints=${stopsStr}`;
      }
    }

    if (!destLat || !destLng) return toast.error("No destination coordinates found");

    const url =
      app === "waze"
        ? `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`
        : `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}${waypoints}&travelmode=driving`;

    window.open(url, "_blank");
  };

  return (
    <div className="relative w-full h-[72vh] rounded-2xl border border-white/10 bg-[#1a1a2e] overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />

      {!isFollowing && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-24 right-4 bg-[#00d4ff] text-black p-3 rounded-full shadow-lg z-10 animate-in fade-in zoom-in border-2 border-white"
        >
          <Crosshair className="w-6 h-6 animate-pulse" />
        </button>
      )}

      <div className="absolute bottom-4 left-4 right-4 flex gap-3 z-10">
        <Button onClick={() => handleNav("waze")} className="flex-1 bg-black/80 backdrop-blur-md border border-[#00d4ff]/50 text-[#00d4ff] hover:bg-[#00d4ff]/20">
          <Zap className="w-4 h-4 mr-2" /> Waze
        </Button>
        <Button onClick={() => handleNav("google")} className="flex-1 bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] hover:bg-[#00ff88]/20">
          <Navigation className="w-4 h-4 mr-2" /> Maps
        </Button>
      </div>
    </div>
  );
};

// -----------------------------
// Earn More (Bolt style)
// -----------------------------
const EarnMoreScreen = ({ onScheduled, onRefer, onCampaigns }) => {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-white font-semibold">Earn more</div>
        <div className="text-white/60 text-sm mt-1">Boost your weekly income with scheduled rides, referrals and campaigns.</div>
      </div>

      <button onClick={onScheduled} className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 text-left">
        <div className="flex items-center gap-3 text-white">
          <CalendarClock className="w-5 h-5 text-[#00ff88]" />
          <div>
            <div className="font-semibold">Scheduled ride requests</div>
            <div className="text-sm text-white/60">Accept planned trips</div>
          </div>
        </div>
      </button>

      <button onClick={onRefer} className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 text-left">
        <div className="flex items-center gap-3 text-white">
          <Gift className="w-5 h-5 text-[#00d4ff]" />
          <div>
            <div className="font-semibold">Refer a friend</div>
            <div className="text-sm text-white/60">Invite drivers and earn rewards</div>
          </div>
        </div>
      </button>

      <button onClick={onCampaigns} className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 text-left">
        <div className="flex items-center gap-3 text-white">
          <Rocket className="w-5 h-5 text-yellow-400" />
          <div>
            <div className="font-semibold">Campaigns</div>
            <div className="text-sm text-white/60">Bonuses and boosts</div>
          </div>
        </div>
      </button>

      <div className="h-24" />
    </div>
  );
};

// -----------------------------
// Help (Bolt style) + Support (sends to admin portal)
// -----------------------------
const HelpScreen = ({ openSupport, openSafety }) => {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-white font-semibold">Driver Help</div>
        <div className="text-white/60 text-sm mt-1">Get help with a trip, support, and safety tools.</div>
      </div>

      <button onClick={openSupport} className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 text-left">
        <div className="flex items-center gap-3 text-white">
          <Headphones className="w-5 h-5 text-[#00d4ff]" />
          <div>
            <div className="font-semibold">Contact support</div>
            <div className="text-sm text-white/60">Send a message to admin portal</div>
          </div>
        </div>
      </button>

      <button onClick={openSafety} className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 text-left">
        <div className="flex items-center gap-3 text-white">
          <ShieldAlert className="w-5 h-5 text-red-400" />
          <div>
            <div className="font-semibold">Safety toolkit</div>
            <div className="text-sm text-white/60">Emergency actions & trip sharing</div>
          </div>
        </div>
      </button>

      <div className="h-24" />
    </div>
  );
};

// -----------------------------
// Driver Dashboard (BOLT UI WRAP) - YOUR LOGIC KEPT
// -----------------------------
const DriverDashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  // Bolt-style bottom nav
  const [nav, setNav] = useState("home");

  // Your existing states (kept)
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

  // Cancellation
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");

  // Topups (kept)
  const [topupAmount, setTopupAmount] = useState("");
  const [topupReference, setTopupReference] = useState("");
  const [showCardModal, setShowCardModal] = useState(false);
  const [cardDetails, setCardDetails] = useState({ number: "", expiry: "", cvv: "" });

  // Completed modal (kept)
  const [completedRide, setCompletedRide] = useState(null);

  // Ride tracking (kept)
  const [rideStartTime, setRideStartTime] = useState(null);
  const [arrivedTime, setArrivedTime] = useState(null);
  const [waitTimer, setWaitTimer] = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const lastPositionRef = useRef(null);

  // Vehicle registration (kept)
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
    car_photo_right: null,
  });

  // Scheduled rides (new)
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [scheduledRides, setScheduledRides] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);

  // Refer a friend (new)
  const [referOpen, setReferOpen] = useState(false);
  const [refCode, setRefCode] = useState("");

  // Campaigns (new)
  const [campaignsOpen, setCampaignsOpen] = useState(false);

  // Support modal (new) -> sends to admin portal
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSending, setSupportSending] = useState(false);

  // Menu
  const [menuOpen, setMenuOpen] = useState(false);
  const balance = user?.earnings?.balance || 0;
  const registrationStatus = user?.registration_status;
  const hasVehicle = user?.driver_info?.vehicle;

  // Map script (kept)
  useEffect(() => {
    if (window.google) {
      setMapsLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Distance calc (kept)
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Location update (kept)
  const handleLocationUpdate = useCallback(
    async (location) => {
      setDriverLocation(location);
      try {
        await api.post(`/driver/location`, location);
        if (activeRide && activeRide.status === "in_progress" && lastPositionRef.current) {
          const dist = calculateDistance(lastPositionRef.current.lat, lastPositionRef.current.lng, location.lat, location.lng);
          setDistanceTraveled((prev) => prev + dist);
          await api.post(`/rides/${activeRide.id}/update-tracking`, location);
        }
        lastPositionRef.current = location;
      } catch (error) {
        console.error("Failed to update location:", error);
      }
    },
    [activeRide]
  );

  useLocationTracker(isOnline, handleLocationUpdate);

  // Wait timer (kept)
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

  // Fetch functions (kept)
  const fetchAvailableRides = async () => {
    try {
      const res = await api.get(`/driver/rides/available`);
      setAvailableRides(res.data.rides || []);
    } catch (e) {}
  };

  const fetchActiveRide = async () => {
    try {
      const res = await api.get(`/driver/active-ride`);
      if (res.data) {
        setActiveRide(res.data);
        setActiveTab("rides");
      }
    } catch (e) {}
  };

  const fetchRideHistory = async () => {
    try {
      const res = await api.get(`/driver/history`);
      setRideHistory(res.data.rides || []);
    } catch (e) {}
  };

  const fetchNearbyRides = async () => {
    try {
      const res = await api.get(`/driver/rides/nearby?radius=${searchRadius}`);
      setNearbyRides(res.data.rides || []);
    } catch (e) {}
  };

  // Initial loads (kept)
  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
  }, []);

  // Polling (kept EXACT gating logic)
  useEffect(() => {
    if (registrationStatus === "approved" && isOnline) {
      fetchAvailableRides();
      const interval = setInterval(fetchAvailableRides, 5000);
      return () => clearInterval(interval);
    }
  }, [isOnline, registrationStatus]);

  // Ride Actions (kept)
  const handleRideAction = async (action) => {
    if (!activeRide) return;
    setLoading(true);

    try {
      if (action === "arrived") {
        await api.post(`/rides/${activeRide.id}/arrived`);
        setArrivedTime(Date.now());
        toast.success("Marked as arrived");
      } else if (action === "start") {
        await api.post(`/rides/${activeRide.id}/start`, {
          pickup_wait_time: parseInt(waitTimer || 0),
        });
        setRideStartTime(Date.now());
        setDistanceTraveled(0);
        lastPositionRef.current = driverLocation;
        toast.success("Ride started");
      } else if (action === "complete") {
        const finalDist = isNaN(distanceTraveled) ? 0 : parseFloat(distanceTraveled);
        const finalWait = isNaN(waitTimer) ? 0 : parseInt(waitTimer);

        const url = `/rides/${activeRide.id}/complete?final_distance=${finalDist}&total_wait_minutes=${finalWait}`;
        const payload = {
          final_distance: finalDist,
          total_wait_minutes: finalWait,
          dropoff_lat: driverLocation?.lat,
          dropoff_lng: driverLocation?.lng,
        };

        const res = await api.post(url, payload);

        const finalFare = res.data.final_fare > 0 ? res.data.final_fare : activeRide.estimated_fare || 0;
        const completeData = { ...res.data, final_fare: finalFare };

        setCompletedRide(completeData);
        toast.success(`Ride completed! Fare: ₾${finalFare.toFixed(2)}`);

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
        stage: activeRide.status,
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
    try {
      await api.post(`/driver/status?is_online=${online}`);
      setIsOnline(online);
      updateUser({ ...user, is_online: online });
      toast.success(online ? "Online" : "Offline");
    } catch (e) {
      toast.error("Failed");
    }
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

      const res = await api.post(`/driver/vehicle`, formData, { headers: { "Content-Type": "multipart/form-data" } });

      toast.success("Documents submitted for review!");
      updateUser({
        ...user,
        driver_info: { ...user.driver_info, vehicle: vehicleData, vehicle_tier: res.data?.tier || "standard" },
        registration_status: "pending_review",
      });
    } catch (e) {
      console.error(e);
      toast.error("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRide = async (rideId, estimatedFare) => {
    if (balance < estimatedFare * 0.23) return toast.error("Insufficient balance");
    setLoading(true);
    try {
      await api.post(`/rides/${rideId}/accept`);
      toast.success("Accepted!");
      const rideRes = await api.get(`/rides/${rideId}`);
      setActiveRide(rideRes.data);
      setAvailableRides((p) => p.filter((r) => r.id !== rideId));
      setDistanceTraveled(0);
      setNav("rides");
      setActiveTab("rides");
    } catch (e) {
      toast.error("Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineRide = async (rideId) => {
    try {
      await api.post(`/rides/${rideId}/decline`);
      setAvailableRides((p) => p.filter((r) => r.id !== rideId));
      toast.info("Declined");
    } catch (e) {}
  };

  const handleRequestToJoin = async (rideId) => {
    setLoading(true);
    try {
      await api.post(`/rides/${rideId}/request-join`);
      toast.success("Requested!");
      fetchAvailableRides();
    } catch (e) {} finally {
      setLoading(false);
    }
  };

  const handleRequestTopup = async () => {
    setLoading(true);
    try {
      await api.post(`/driver/topup/request`, { amount: parseFloat(topupAmount), payment_reference: topupReference });
      toast.success("Request sent");
      window.open("https://bankofgeorgia.ge", "_blank");
    } catch (e) {} finally {
      setLoading(false);
    }
  };

  // Card modal formatting (kept)
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

  // -----------------------------
  // Scheduled rides (new, minimal, works if backend exists)
  // -----------------------------
  const fetchScheduledRides = async () => {
    setScheduledLoading(true);
    try {
      // You can keep this endpoint OR match your backend.
      // This does NOT touch ride logic. It only loads scheduled list.
      const res = await api.get("/driver/rides/scheduled");
      setScheduledRides(res.data.rides || []);
    } catch (e) {
      setScheduledRides([]);
    } finally {
      setScheduledLoading(false);
    }
  };

  const openScheduled = () => {
    setScheduledOpen(true);
    fetchScheduledRides();
  };

  const acceptScheduled = async (ride) => {
    if (!ride?.id) return;
    const est = ride.estimated_fare || 0;
    if (balance < est * DRIVER_COMMISSION_RATE) return toast.error("Insufficient balance");
    setLoading(true);
    try {
      await api.post(`/rides/${ride.id}/accept`);
      toast.success("Scheduled ride accepted!");
      const rideRes = await api.get(`/rides/${ride.id}`);
      setActiveRide(rideRes.data);
      setScheduledOpen(false);
      setNav("rides");
      setActiveTab("rides");
      fetchScheduledRides();
    } catch (e) {
      toast.error("Failed to accept");
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // Refer / Campaigns (required behavior)
  // -----------------------------
  const openRefer = () => {
    setReferOpen(true);
    // simple deterministic code so you can later generate from backend
    const base = `${user?.id || user?.cellphone || "TAKSI"}`.toString().replace(/\W/g, "").slice(-6);
    setRefCode(`TAKSI-${base || "000000"}`.toUpperCase());
  };

  const openCampaigns = () => {
    setCampaignsOpen(true);
  };

  // -----------------------------
  // Support -> sends to admin portal (required)
  // -----------------------------
  const sendSupportMessage = async () => {
    if (!supportMessage.trim()) return toast.error("Write a message first");
    setSupportSending(true);
    try {
      const payload = {
        subject: supportSubject || "Driver Support",
        message: supportMessage,
        driver_id: user?.id,
        driver_name: `${user?.name || ""} ${user?.surname || ""}`.trim(),
        driver_phone: user?.cellphone,
        ride_id: activeRide?.id || null,
        created_at: new Date().toISOString(),
      };

      // Try a dedicated admin endpoint first, then a generic one.
      try {
        await api.post("/admin/support/messages", payload);
      } catch (e1) {
        await api.post("/support/messages", payload);
      }

      toast.success("Sent to admin portal");
      setSupportOpen(false);
      setSupportSubject("");
      setSupportMessage("");
    } catch (e) {
      toast.error("Failed to send");
    } finally {
      setSupportSending(false);
    }
  };

  const statusColors = {
    pending_vehicle: "bg-yellow-500 text-black",
    pending_review: "bg-orange-500 text-black",
    approved: "bg-[#00ff88] text-black",
    rejected: "bg-red-500 text-white",
  };
  const rideStatusColors = {
    searching: "bg-yellow-500 text-black",
    accepted: "bg-blue-500 text-white",
    arrived: "bg-purple-500 text-white",
    in_progress: "bg-[#00ff88] text-black",
    completed: "bg-green-600 text-white",
    cancelled: "bg-red-500 text-white",
  };

  // -----------------------------
  // Bolt Home UI (uses your map + your online toggle)
  // -----------------------------
  const HomeScreen = () => (
    <div className="relative">
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#1a1a2e]">
        {mapsLoaded ? (
          <DriverSmartMap activeRide={activeRide} driverLocation={driverLocation} />
        ) : (
          <div className="w-full h-[72vh] flex items-center justify-center text-white/60">Loading map…</div>
        )}
      </div>

      {/* Top overlay row (Bolt-like) */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
        <button onClick={() => setMenuOpen(true)} className="bg-black/70 border border-white/10 rounded-full px-3 py-2 text-white flex items-center gap-2">
          <User className="w-4 h-4 text-[#00d4ff]" />
          <span className="text-sm">{user?.name}</span>
          <Badge className={`ml-2 ${statusColors[registrationStatus] || "bg-gray-500"}`}>
            {registrationStatus?.replace(/_/g, " ").toUpperCase()}
          </Badge>
        </button>

        <div className="bg-black/70 border border-white/10 rounded-full px-3 py-2 text-white text-sm">₾{balance.toFixed(2)}</div>
      </div>

      {/* Big online pill */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[19vh] z-10 w-[86%] max-w-md">
        <button
          onClick={() => handleToggleOnline(!isOnline)}
          className={`w-full rounded-full py-4 font-bold text-lg shadow-xl border ${
            isOnline ? "bg-[#00ff88] text-black border-white/20" : "bg-black/80 text-white border-white/15"
          }`}
          disabled={registrationStatus !== "approved"}
          title={registrationStatus !== "approved" ? "Account not approved yet" : ""}
        >
          {registrationStatus !== "approved" ? "Account Pending" : isOnline ? "Online" : "Go online"}
        </button>
      </div>

      {/* Stats tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatTile label="Today’s earnings" value={`₾${(user?.earnings?.today || 0).toFixed(2)}`} tone="green" />
        <StatTile label="This week" value={`₾${(user?.earnings?.week || 0).toFixed(2)}`} tone="cyan" />
        <StatTile label="Driver score" value={`${user?.driver_info?.score ?? 94}%`} sub="Keep it high" tone="gray" />
        <StatTile label="Acceptance rate" value={`${user?.driver_info?.acceptance_rate ?? 85}%`} sub={isOnline ? "Active" : "Offline"} tone={isOnline ? "green" : "gray"} />
      </div>

      <div className="h-24" />
    </div>
  );

  // -----------------------------
  // Rides screen (keeps your Tabs + your logic)
  // -----------------------------
  const RidesScreen = () => (
    <div className="space-y-3">
      {/* live location chip */}
      {isOnline && driverLocation && (
        <div className="bg-[#00ff88]/10 border border-[#00ff88]/20 px-4 py-2 rounded-2xl">
          <div className="flex items-center text-sm text-[#00ff88]">
            <Crosshair className="w-4 h-4 mr-2 animate-pulse" />
            Location tracking active • {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
            {driverLocation.speed ? <span className="ml-2">• {(driverLocation.speed * 3.6).toFixed(0)} km/h</span> : null}
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00d4ff]/20 mb-2">
          <TabsTrigger value="rides" className="text-xs sm:text-sm">
            <Activity className="w-4 h-4 sm:mr-2" /> Rides
          </TabsTrigger>
          <TabsTrigger value="nearby" onClick={fetchNearbyRides} className="text-xs sm:text-sm">
            <Crosshair className="w-4 h-4 sm:mr-2" /> Nearby
          </TabsTrigger>
          <TabsTrigger value="vehicle" className="text-xs sm:text-sm">
            <Car className="w-4 h-4 sm:mr-2" /> Vehicle
          </TabsTrigger>
          <TabsTrigger value="earnings" className="text-xs sm:text-sm">
            <Wallet className="w-4 h-4 sm:mr-2" /> Earn
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm">
            <History className="w-4 h-4 sm:mr-2" /> History
          </TabsTrigger>
        </TabsList>

        {/* --------- RIDES TAB (your core flow) --------- */}
        <TabsContent value="rides">
          {activeRide ? (
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-[#00ff88]">Active Ride</CardTitle>
                  <Badge className={rideStatusColors[activeRide.status]}>{activeRide.status?.replace(/_/g, " ").toUpperCase()}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 text-white">
                {mapsLoaded ? <DriverSmartMap activeRide={activeRide} driverLocation={driverLocation} /> : null}

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
                            <p key={i} className="text-sm">
                              • {s.address}
                            </p>
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
                      <div className="bg-purple-500/20 border border-purple-500 rounded-xl p-4 text-center">
                        <Timer className="w-6 h-6 mx-auto text-purple-400 mb-1" />
                        <p className="text-2xl font-bold text-purple-400">{waitTimer} min</p>
                        <p className="text-xs text-purple-400/70">Wait Time</p>
                      </div>
                    )}
                    {activeRide.status === "in_progress" && (
                      <div className="bg-[#00ff88]/20 border border-[#00ff88] rounded-xl p-4 text-center">
                        <Activity className="w-6 h-6 mx-auto text-[#00ff88] mb-1" />
                        <p className="text-2xl font-bold text-[#00ff88]">{distanceTraveled.toFixed(1)} km</p>
                        <p className="text-xs text-[#00ff88]/70">Traveled</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4">
                  <span className="text-[#00ff88]">Fare</span>
                  <span className="text-2xl font-bold text-[#00ff88]">₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}</span>
                </div>

                <div className="flex gap-3 pt-2">
                  <div className="flex-1">
                    {activeRide.status === "accepted" && (
                      <Button className="w-full bg-purple-500 text-white h-14 text-lg" onClick={() => handleRideAction("arrived")} disabled={loading}>
                        <MapPin className="w-5 h-5 mr-2" /> I've Arrived
                      </Button>
                    )}
                    {activeRide.status === "arrived" && (
                      <Button className="w-full bg-blue-500 text-white h-14 text-lg" onClick={() => handleRideAction("start")} disabled={loading}>
                        <Play className="w-5 h-5 mr-2" /> Start Trip
                      </Button>
                    )}
                    {activeRide.status === "in_progress" && (
                      <Button className="w-full bg-[#00ff88] text-black h-14 text-lg font-bold" onClick={() => handleRideAction("complete")} disabled={loading}>
                        <CheckCircle2 className="w-5 h-5 mr-2" /> Complete Trip
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="destructive"
                    className="h-14 w-14 bg-red-500/20 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                    onClick={() => setShowCancelModal(true)}
                    disabled={loading}
                  >
                    <XCircle className="w-6 h-6" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : registrationStatus !== "approved" ? (
            <Card className="bg-black/60 border border-yellow-500/30 text-center py-12">
              <AlertTriangle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
              <p className="text-yellow-400 font-semibold">Account Pending</p>
              <p className="text-yellow-200/60 text-sm mt-2">Complete vehicle docs and wait for approval.</p>
            </Card>
          ) : !isOnline ? (
            <Card className="bg-black/60 border border-gray-500/30 text-center py-12">
              <Activity className="w-16 h-16 mx-auto text-gray-500 mb-4" />
              <p className="text-gray-400">Offline</p>
              <Button className="mt-4 bg-[#00ff88] text-black" onClick={() => handleToggleOnline(true)}>
                Go Online
              </Button>
            </Card>
          ) : availableRides.length === 0 ? (
            <Card className="bg-black/60 border border-[#00d4ff]/30 text-center py-12">
              <Navigation className="w-16 h-16 mx-auto text-[#00d4ff]/50 mb-4 animate-pulse" />
              <p className="text-[#00d4ff]/70">Searching for rides...</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {availableRides.map((ride) => {
                const comm = (ride.estimated_fare || 0) * 0.23;
                const canAccept = balance >= comm;
                return (
                  <Card key={ride.id} className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
                    <CardContent className="p-4 text-white">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <p className="text-[#00ff88] font-semibold">{ride.pickup}</p>
                          <p className="text-[#00d4ff]/70 text-sm">→ {ride.destination}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p>
                          <p className="text-xs text-white/50 mt-1">Comm: ₾{comm.toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1 bg-[#00ff88] text-black font-bold h-12" onClick={() => handleAcceptRide(ride.id, ride.estimated_fare)} disabled={loading || !canAccept}>
                          {canAccept ? "Accept" : "Low Balance"}
                        </Button>
                        <Button variant="outline" className="border-red-500 text-red-500 h-12" onClick={() => handleDeclineRide(ride.id)} disabled={loading}>
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

        {/* --------- NEARBY TAB (kept) --------- */}
        <TabsContent value="nearby">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-white/70 text-sm">Radius (km)</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(parseFloat(e.target.value || 10))}
                  className="w-24 bg-black/50 text-white border-white/10"
                />
                <Button size="sm" variant="outline" onClick={fetchNearbyRides} disabled={loading}>
                  Refresh
                </Button>
              </div>
            </div>

            {nearbyRides.map((ride) => (
              <Card key={ride.id} className="bg-black/60 border border-[#00d4ff]/30">
                <CardContent className="p-4 text-white">
                  <p className="text-[#00ff88]">{ride.pickup}</p>
                  <p className="text-[#00d4ff]">→ {ride.destination}</p>
                  <Button className="w-full mt-2 bg-[#00d4ff] text-black" onClick={() => handleRequestToJoin(ride.id)} disabled={loading}>
                    Request to Accept
                  </Button>
                </CardContent>
              </Card>
            ))}

            {nearbyRides.length === 0 ? (
              <Card className="bg-black/60 border border-white/10 text-center py-10">
                <CardContent className="text-white/60">No nearby rides right now.</CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* --------- VEHICLE TAB (kept) --------- */}
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
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Make</Label>
                        <Input
                          required
                          placeholder="Make"
                          value={vehicleData.car_make}
                          onChange={(e) => setVehicleData({ ...vehicleData, car_make: e.target.value })}
                          className="bg-black/50 text-white border-[#00d4ff]/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Model</Label>
                        <Input
                          required
                          placeholder="Model"
                          value={vehicleData.car_model}
                          onChange={(e) => setVehicleData({ ...vehicleData, car_model: e.target.value })}
                          className="bg-black/50 text-white border-[#00d4ff]/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Year</Label>
                        <Input
                          required
                          type="number"
                          placeholder="2015"
                          value={vehicleData.car_year}
                          onChange={(e) => setVehicleData({ ...vehicleData, car_year: e.target.value })}
                          className="bg-black/50 text-white border-[#00d4ff]/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Color</Label>
                        <Input
                          required
                          placeholder="Silver"
                          value={vehicleData.car_color}
                          onChange={(e) => setVehicleData({ ...vehicleData, car_color: e.target.value })}
                          className="bg-black/50 text-white border-[#00d4ff]/30"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-gray-400 text-xs">License Plate</Label>
                      <Input
                        required
                        placeholder="AB-123-CD"
                        value={vehicleData.license_plate}
                        onChange={(e) => setVehicleData({ ...vehicleData, license_plate: e.target.value })}
                        className="bg-black/50 text-white border-[#00d4ff]/30 uppercase font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Driver's License</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Front</Label>
                        <Input required type="file" accept="image/*" onChange={(e) => setVehicleData({ ...vehicleData, license_front: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Back</Label>
                        <Input required type="file" accept="image/*" onChange={(e) => setVehicleData({ ...vehicleData, license_back: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Vehicle Registration</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Front</Label>
                        <Input required type="file" accept="image/*" onChange={(e) => setVehicleData({ ...vehicleData, reg_front: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Back</Label>
                        <Input required type="file" accept="image/*" onChange={(e) => setVehicleData({ ...vehicleData, reg_back: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Car Photos</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Front</Label>
                        <Input required type="file" accept="image/*" onChange={(e) => setVehicleData({ ...vehicleData, car_photo_front: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Back</Label>
                        <Input required type="file" accept="image/*" onChange={(e) => setVehicleData({ ...vehicleData, car_photo_back: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Left</Label>
                        <Input required type="file" accept="image/*" onChange={(e) => setVehicleData({ ...vehicleData, car_photo_left: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-xs">Right</Label>
                        <Input required type="file" accept="image/*" onChange={(e) => setVehicleData({ ...vehicleData, car_photo_right: e.target.files[0] })} className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                      </div>
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

        {/* --------- EARNINGS TAB (kept) --------- */}
        <TabsContent value="earnings">
          <div className="space-y-4">
            <Card className="p-4 bg-black/60 border border-[#00ff88] rounded-2xl">
              <p className="text-gray-400">Balance</p>
              <p className="text-3xl text-[#00ff88]">₾{balance.toFixed(2)}</p>
            </Card>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="text-white font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#00ff88]" /> Top up
              </div>
              <Input type="number" placeholder="Amount" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} className="bg-black/50 text-white border-white/10" />
              <Input
                placeholder="Reference (optional)"
                value={topupReference}
                onChange={(e) => setTopupReference(e.target.value)}
                className="bg-black/50 text-white border-white/10"
              />
              <Button className="w-full bg-[#00ff88] text-black font-bold" onClick={() => setShowCardModal(true)} disabled={!topupAmount}>
                Top Up
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* --------- HISTORY TAB (kept) --------- */}
        <TabsContent value="history">
          <ScrollArea className="h-[460px] rounded-2xl border border-white/10 bg-black/30">
            <div className="p-3 space-y-2">
              {rideHistory.map((r) => (
                <div key={r.id} className="p-4 bg-black/50 border border-[#00d4ff]/20 rounded-2xl">
                  <div className="text-white font-medium">{r.pickup}</div>
                  <div className="text-white/60 text-sm">{r.destination}</div>
                  <div className="text-[#00ff88] font-bold mt-2">₾{r.final_fare}</div>
                </div>
              ))}
              {rideHistory.length === 0 ? <div className="text-white/60 p-6 text-center">No ride history yet.</div> : null}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="h-24" />
    </div>
  );

  // -----------------------------
  // Main layout
  // -----------------------------
  return (
    <div className="min-h-screen bg-black">
      {/* Top header (Bolt-like minimal) */}
      <header className="bg-black/50 backdrop-blur-xl border-b border-white/10 p-3 sticky top-0 z-50">
        <div className="container mx-auto max-w-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center">
              <Car className="w-4 h-4 text-black" />
            </div>
            <div>
              <div className="text-white font-semibold leading-tight">T&apos;aksi Driver</div>
              <div className="text-white/50 text-xs">{user?.name} {user?.surname}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={statusColors[registrationStatus] || "bg-gray-500"}>{registrationStatus?.replace(/_/g, " ").toUpperCase()}</Badge>

            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white" onClick={() => setMenuOpen(true)}>
              <User className="w-5 h-5" />
            </Button>

            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white" onClick={logout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-2xl">
        {nav === "home" ? (
          <HomeScreen />
        ) : nav === "earn" ? (
          <EarnMoreScreen onScheduled={openScheduled} onRefer={openRefer} onCampaigns={openCampaigns} />
        ) : nav === "help" ? (
          <HelpScreen openSupport={() => setSupportOpen(true)} openSafety={() => toast.info("Safety toolkit: coming next")} />
        ) : (
          <RidesScreen />
        )}
      </main>

      <BottomNav value={nav} onChange={setNav} hasActiveRide={!!activeRide} />

      {/* -----------------------------
          Menu Sheet (Bolt-like)
         ----------------------------- */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent className="bg-black text-white border-white/10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center">
                <User className="w-5 h-5 text-black" />
              </div>
              <div>
                <div className="font-semibold">{user?.name} {user?.surname}</div>
                <div className="text-white/60 text-sm">{user?.cellphone}</div>
              </div>
            </div>

            <Separator className="bg-white/10" />

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-white/60 text-xs">Balance</div>
                <div className="text-[#00ff88] font-bold text-xl">₾{balance.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-white/60 text-xs">Online</div>
                <div className={`font-bold text-xl ${isOnline ? "text-[#00ff88]" : "text-white/50"}`}>{isOnline ? "YES" : "NO"}</div>
              </div>
            </div>

            <Button
              className={`w-full rounded-2xl h-12 font-bold ${isOnline ? "bg-[#00ff88] text-black" : "bg-white/10 text-white"}`}
              onClick={() => handleToggleOnline(!isOnline)}
              disabled={registrationStatus !== "approved"}
            >
              {registrationStatus !== "approved" ? "Pending Approval" : isOnline ? "Go Offline" : "Go Online"}
            </Button>

            <Button variant="outline" className="w-full rounded-2xl h-12 border-white/10 text-white" onClick={() => { setMenuOpen(false); setNav("rides"); }}>
              Go to Rides
            </Button>

            <Button variant="outline" className="w-full rounded-2xl h-12 border-white/10 text-white" onClick={() => { setMenuOpen(false); setSupportOpen(true); }}>
              Contact Support
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* -----------------------------
          Scheduled rides modal
         ----------------------------- */}
      <Dialog open={scheduledOpen} onOpenChange={setScheduledOpen}>
        <DialogContent className="bg-[#0b0b12] border border-white/10 text-white sm:max-w-md w-[95%] rounded-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-[#00ff88]" />
              Scheduled rides
            </DialogTitle>
            <DialogDescription className="text-white/60">Planned trips that you can accept in advance.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button variant="outline" className="border-white/10 text-white" onClick={fetchScheduledRides} disabled={scheduledLoading}>
              {scheduledLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Refresh
            </Button>
          </div>

          <ScrollArea className="max-h-[360px] pr-3">
            <div className="space-y-3">
              {scheduledRides.map((ride) => (
                <div key={ride.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[#00ff88] font-semibold">{ride.pickup}</div>
                  <div className="text-white/60 text-sm">→ {ride.destination}</div>
                  <div className="flex items-center justify-between mt-3">
                    <div>
                      <div className="text-white/60 text-xs">Fare</div>
                      <div className="text-white font-bold">₾{(ride.estimated_fare || 0).toFixed(2)}</div>
                    </div>
                    <Button className="bg-[#00ff88] text-black font-bold rounded-xl" onClick={() => acceptScheduled(ride)} disabled={loading}>
                      Accept
                    </Button>
                  </div>
                </div>
              ))}

              {scheduledRides.length === 0 ? (
                <div className="text-center text-white/60 py-10">
                  <div className="mx-auto w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                    <CalendarClock className="w-6 h-6" />
                  </div>
                  No scheduled rides currently.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* -----------------------------
          Refer a friend modal
         ----------------------------- */}
      <Dialog open={referOpen} onOpenChange={setReferOpen}>
        <DialogContent className="bg-[#0b0b12] border border-white/10 text-white sm:max-w-md w-[95%] rounded-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-[#00d4ff]" />
              Refer a friend
            </DialogTitle>
            <DialogDescription className="text-white/60">Share your referral code with drivers.</DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-white/60 text-xs">Your code</div>
            <div className="mt-2 font-mono text-xl text-white">{refCode}</div>
            <Button
              className="mt-4 w-full bg-white/10 text-white border border-white/10 rounded-2xl"
              onClick={() => {
                navigator.clipboard?.writeText(refCode);
                toast.success("Copied");
              }}
            >
              Copy code
            </Button>
          </div>

          <div className="text-white/60 text-sm">
            Rewards: <span className="text-white">Coming soon</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* -----------------------------
          Campaigns modal (required: say currently no campaigns)
         ----------------------------- */}
      <Dialog open={campaignsOpen} onOpenChange={setCampaignsOpen}>
        <DialogContent className="bg-[#0b0b12] border border-white/10 text-white sm:max-w-md w-[95%] rounded-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-yellow-400" />
              Campaigns
            </DialogTitle>
            <DialogDescription className="text-white/60">Bonuses, boosts and challenges.</DialogDescription>
          </DialogHeader>

          <div className="text-center py-10">
            <div className="mx-auto w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
              <Rocket className="w-6 h-6 text-yellow-400" />
            </div>
            <div className="text-white font-semibold">Currently no campaigns</div>
            <div className="text-white/60 text-sm mt-1">Check back later.</div>
          </div>
        </DialogContent>
      </Dialog>

      {/* -----------------------------
          Support modal (sends to admin portal)
         ----------------------------- */}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogContent className="bg-[#0b0b12] border border-white/10 text-white sm:max-w-md w-[95%] rounded-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Headphones className="w-5 h-5 text-[#00d4ff]" />
              Contact support
            </DialogTitle>
            <DialogDescription className="text-white/60">This sends a message to your admin portal inbox.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-white/70 text-xs">SUBJECT (optional)</Label>
              <Input value={supportSubject} onChange={(e) => setSupportSubject(e.target.value)} className="bg-black/50 border-white/10 text-white" placeholder="e.g. Payment / Ride issue" />
            </div>

            <div className="space-y-1">
              <Label className="text-white/70 text-xs">MESSAGE</Label>
              <textarea
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                className="w-full min-h-[140px] rounded-xl bg-black/50 border border-white/10 p-3 text-white outline-none focus:border-[#00d4ff]/60"
                placeholder="Explain the issue. If it’s about a ride, include what happened."
              />
            </div>

            <Button onClick={sendSupportMessage} disabled={supportSending} className="w-full bg-[#00d4ff] text-black font-bold rounded-2xl h-12">
              {supportSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send to admin portal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* -----------------------------
          Top up modal (kept)
         ----------------------------- */}
      <Dialog open={showCardModal} onOpenChange={setShowCardModal}>
        <DialogContent className="bg-[#1a1a2e] border border-[#00ff88]/30 text-white sm:max-w-md w-[95%] rounded-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-[#00ff88] flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Pay with Card
            </DialogTitle>
            <DialogDescription className="sr-only">Enter card details to top up your driver balance.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCardPayment} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-gray-400 text-xs">CARD NUMBER</Label>
              <Input value={cardDetails.number} onChange={(e) => handleCardInput("number", e.target.value)} placeholder="0000 0000 0000 0000" className="bg-black/50 border-[#00ff88]/30 text-white" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-400 text-xs">EXPIRY</Label>
                <Input value={cardDetails.expiry} onChange={(e) => handleCardInput("expiry", e.target.value)} placeholder="MM/YY" className="bg-black/50 border-[#00ff88]/30 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-400 text-xs">CVV</Label>
                <Input value={cardDetails.cvv} onChange={(e) => handleCardInput("cvv", e.target.value)} placeholder="123" type="password" className="bg-black/50 border-[#00ff88]/30 text-white" />
              </div>
            </div>

            <Button type="submit" className="w-full bg-[#00ff88] text-black font-bold h-12 rounded-2xl" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : `Pay ₾${topupAmount}`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* -----------------------------
          Cancellation modal (kept)
         ----------------------------- */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="bg-[#1a1a2e] border border-red-500/50 text-white sm:max-w-md w-[95%] rounded-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Cancel Ride
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Please select a reason. <span className="text-red-400 font-bold block mt-1">Warning: Unjustified cancellations may affect your driver score.</span>
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[300px] pr-4">
            <div className="grid gap-2 py-4">
              {(CANCEL_REASONS[activeRide?.status] || CANCEL_REASONS.accepted).map((reason) => (
                <div
                  key={reason}
                  onClick={() => setSelectedCancelReason(reason)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedCancelReason === reason ? "bg-red-500 text-white border-red-500" : "bg-black/40 border-gray-700 hover:border-red-500/50 hover:bg-red-500/10"
                  }`}
                >
                  <p className="font-medium text-sm">{reason}</p>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowCancelModal(false)} className="flex-1 text-gray-400">
              Back
            </Button>
            <Button variant="destructive" onClick={handleCancelRide} disabled={!selectedCancelReason || loading} className="flex-1 bg-red-600 hover:bg-red-700 font-bold">
              Confirm Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* -----------------------------
          Trip complete modal (kept)
         ----------------------------- */}
      <Dialog open={!!completedRide} onOpenChange={() => setCompletedRide(null)}>
        <DialogContent className="bg-black border border-[#00ff88] text-center p-6 sm:max-w-sm rounded-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-[#00ff88] text-2xl font-bold">Trip Complete!</DialogTitle>
            <DialogDescription className="sr-only">Summary of fare and payment collection.</DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-3">
            <p className="text-gray-400 text-sm uppercase tracking-widest">Total Fare</p>
            <p className="text-5xl font-bold text-white">₾{completedRide?.final_fare?.toFixed(2) || "0.00"}</p>

            {(completedRide?.payment_method || "").toLowerCase() === "card" ? (
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

          <Button className="w-full bg-[#00ff88] text-black font-bold h-14 text-xl rounded-xl" onClick={() => setCompletedRide(null)}>
            Confirm & Close
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// -----------------------------
// Main Router (kept)
// -----------------------------
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
