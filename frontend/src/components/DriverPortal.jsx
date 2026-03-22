import { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import api from "@/api";
import { useLanguage } from "@/i18n/LanguageContext";
import LanguageSelector from "@/i18n/LanguageSelector";
import { DriverTripCompletionModal } from "@/components/TripCompletionModal";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RideCommunication from "./RideCommunication";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Car, MapPin, Star, History, Home, LogOut, User,
  Phone, Lock, ArrowLeft, ArrowRight, Navigation, Wallet, Loader2, Rocket,
  Plus, X, Zap, TrendingUp, MessageSquare,
  Target, Crosshair, Send, Banknote, CreditCard, ExternalLink,
  AlertTriangle, Activity, MapPinned, CheckCircle2, XCircle,
  Play, Timer, PauseCircle, Building2, Info, Car as CarIcon,
  MessageCircle, FileText, ChevronDown, ChevronUp, Trophy} from "lucide-react";

// =============================================================================
// PRICING RULES — Synced with server.py + RiderPortal exactly
// =============================================================================
const PRICING_RULES = {
  economy:   { name: "Economy",   base: 2.00, perKm: 0.50, perMinWait: 0.50, freeWait: 2,   icon: "🚗" },
  comfort:   { name: "Comfort",   base: 2.50, perKm: 0.55, perMinWait: 0.50, freeWait: 2,   icon: "🚙" },
  suv:       { name: "SUV / XL",  base: 3.90, perKm: 0.80, perMinWait: 0.50, freeWait: 2,   icon: "🚐" },
  personal:  { name: "Personal",  base: 4.00, perKm: 0.70, perMinWait: 0.50, freeWait: 2,   icon: "👤" },
  jumpstart: { name: "Jumpstart", base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, icon: "⚡" },
};

const DRIVER_COMMISSION_RATE = 0.23;
const LOCATION_UPDATE_INTERVAL = 2000; // ms

// Minimum balance reserve + fee enforced by server
const WITHDRAWAL_RESERVE = 5.00;
const WITHDRAWAL_FEE    = 1.00;

const CANCEL_REASONS = {
  accepted: [
    "Heavy Traffic / Stuck", "Car Trouble / Mechanical Issue",
    "Accidentally Accepted", "Cannot Locate Pickup Address", "Personal Emergency",
  ],
  arrived: [
    "Client Not Showing Up (Timer Expired)", "Client Refused Ride",
    "Too Much Luggage / Cargo", "Unaccompanied Minor", "No Mask / Safety Concern",
  ],
  in_progress: [
    "Client Requested Early End", "Client Behavior / Rude",
    "Safety Concern", "Wrong Destination", "Vehicle Breakdown",
  ],
};

// =============================================================================
// DRIVER WAIT TIMER
// =============================================================================
const DriverWaitTimer = ({ arrivedAt, carType }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = arrivedAt && !isNaN(new Date(arrivedAt).getTime())
      ? new Date(arrivedAt).getTime()
      : Date.now();
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [arrivedAt]);

  const rules           = PRICING_RULES[carType?.toLowerCase()] || PRICING_RULES.economy;
  const freeWaitSeconds = rules.freeWait * 60;

  if (elapsed <= freeWaitSeconds) {
    const remaining = freeWaitSeconds - elapsed;
    const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
    const secs = String(remaining % 60).padStart(2, "0");
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
  }

  const overtime    = elapsed - freeWaitSeconds;
  const mins        = String(Math.floor(overtime / 60)).padStart(2, "0");
  const secs        = String(overtime % 60).padStart(2, "0");
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
};

// =============================================================================
// WITHDRAWAL PANEL — fixed: numbers sized for small screens, history from correct endpoint
// =============================================================================
const WithdrawalPanel = ({ balance, driverId, onSuccess }) => {
  const [amount,      setAmount]      = useState("");
  const [bankDetails, setBankDetails] = useState("");
  const [bankType,    setBankType]    = useState("iban");
  const [loading,     setLoading]     = useState(false);
  const [history,     setHistory]     = useState([]);

  const maxWithdrawal = Math.max(0, balance - WITHDRAWAL_RESERVE - WITHDRAWAL_FEE);
  const requestedAmt  = parseFloat(amount) || 0;
  const totalDeducted = requestedAmt > 0 ? requestedAmt + WITHDRAWAL_FEE : 0;
  const remainingBal  = balance - totalDeducted;
  const isValid       = requestedAmt >= 1 && requestedAmt <= maxWithdrawal && bankDetails.trim().length >= 5;

  useEffect(() => {
    api.get("/driver/withdrawals/history")
      .then(r => setHistory(r.data.withdrawals || []))
      .catch(() => {});
  }, []);

  const handleWithdraw = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const res = await api.post("/driver/withdraw", {
        driver_id:    driverId,
        amount:       requestedAmt,
        bank_details: `[${bankType.toUpperCase()}] ${bankDetails.trim()}`,
      });
      toast.success(res.data.message || `₾${requestedAmt.toFixed(2)} withdrawal requested!`);
      setAmount(""); setBankDetails("");
      // Refresh history
      api.get("/driver/withdrawals/history").then(r => setHistory(r.data.withdrawals || [])).catch(() => {});
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  const bankLabels = { iban: "IBAN (Any Bank)", bog: "Bank of Georgia", tbc: "TBC Bank" };

  return (
    <div className="space-y-4">

      {/* Balance summary — FIX: smaller text so numbers fit on narrow screens */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl p-3 text-center">
          <p className="text-[#00ff88]/60 text-[10px] uppercase font-bold mb-1">Balance</p>
          <p className="text-lg font-bold text-[#00ff88] tabular-nums">₾{balance.toFixed(2)}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Max Out</p>
          <p className="text-lg font-bold text-white tabular-nums">₾{maxWithdrawal.toFixed(2)}</p>
          <p className="text-gray-500 text-[9px] mt-0.5">₾5 reserve + ₾1 fee</p>
        </div>
      </div>

      {/* Amount */}
      <div className="space-y-1.5">
        <Label className="text-gray-300 text-sm">Amount (GEL)</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff88] font-bold">₾</span>
          <Input type="number" min="1" max={maxWithdrawal} step="0.01"
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="pl-7 bg-black/50 border-[#00ff88]/30 text-white h-11" />
        </div>
        <div className="flex gap-3 text-xs">
          <button onClick={() => setAmount(String((maxWithdrawal / 2).toFixed(2)))}
            className="text-[#00d4ff] underline">½ Max</button>
          <button onClick={() => setAmount(String(maxWithdrawal.toFixed(2)))}
            className="text-[#00d4ff] underline">Full Max</button>
        </div>
      </div>

      {/* Bank selector */}
      <div className="space-y-1.5">
        <Label className="text-gray-300 text-sm">Bank</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(bankLabels).map(([key, label]) => (
            <button key={key} onClick={() => setBankType(key)}
              className={`py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                bankType === key
                  ? "bg-[#00ff88]/20 border-[#00ff88] text-[#00ff88]"
                  : "border-white/10 text-gray-400 hover:border-white/30"
              }`}>{key.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* Account number */}
      <div className="space-y-1.5">
        <Label className="text-gray-300 text-sm">{bankLabels[bankType]} Account</Label>
        <Input value={bankDetails} onChange={e => setBankDetails(e.target.value)}
          placeholder={bankType === "iban" ? "GE29NB0000000101904917" : bankType === "bog" ? "GE29BG…" : "GE29TB…"}
          className="bg-black/50 border-[#00ff88]/30 text-white font-mono text-sm uppercase" />
      </div>

      {/* Fee breakdown */}
      {requestedAmt > 0 && (
        <div className="bg-black/50 border border-white/10 rounded-xl p-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-gray-300">
            <span>You request</span><span className="font-mono tabular-nums">₾{requestedAmt.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-400">
            <span>Processing fee</span><span className="font-mono tabular-nums">−₾{WITHDRAWAL_FEE.toFixed(2)}</span>
          </div>
          <Separator className="bg-white/10" />
          <div className="flex justify-between font-bold text-white">
            <span>Total deducted</span>
            <span className="font-mono tabular-nums text-red-400">−₾{totalDeducted.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Balance after</span>
            <span className={`font-mono tabular-nums font-bold ${remainingBal >= WITHDRAWAL_RESERVE ? "text-[#00ff88]" : "text-red-400"}`}>
              ₾{remainingBal.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="flex gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
        <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-blue-300 text-[11px] leading-relaxed">
          Processed by admin within 1–2 business days. ₾5 reserve always remains.
        </p>
      </div>

      <Button onClick={handleWithdraw} disabled={!isValid || loading}
        className="w-full h-11 bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold disabled:opacity-50">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Banknote className="w-4 h-4 mr-2" />}
        {loading ? "Processing..." : `Withdraw ₾${requestedAmt > 0 ? requestedAmt.toFixed(2) : "0.00"}`}
      </Button>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">Recent Withdrawals</p>
          {history.slice(0, 6).map((w, i) => (
            <div key={i} className="flex justify-between items-center bg-black/40 rounded-lg p-2.5 border border-white/5">
              <div>
                <p className="text-white text-sm font-mono tabular-nums">₾{w.amount?.toFixed(2)}</p>
                <p className="text-gray-500 text-[10px]">{w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}</p>
              </div>
              <Badge className={
                w.status === "approved" ? "bg-green-500/20 text-green-400 border-green-500/50 text-[10px]" :
                w.status === "rejected" ? "bg-red-500/20 text-red-400 border-red-500/50 text-[10px]" :
                "bg-yellow-500/20 text-yellow-400 border-yellow-500/50 text-[10px]"
              }>{w.status || "pending"}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// DRIVER AUTH
// =============================================================================
const DriverAuth = () => {
  const { login }     = useAuth();
  const navigate      = useNavigate();
  const { t }         = useLanguage();
  const [isLogin, setIsLogin]   = useState(true);
  const [loading, setLoading]   = useState(false);
  const [formData, setFormData] = useState({ name: "", surname: "", cellphone: "", password: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register/driver";
      const res = await api.post(endpoint, formData);
      if (res.data?.token && res.data?.user) {
        login(res.data.token, res.data.user);
        toast.success(isLogin ? t("welcome_back") : t("success"));
        navigate("/driver/dashboard");
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || t("error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md glass-heavy">
        <CardHeader className="text-center relative">
          <div className="absolute right-4 top-4"><LanguageSelector variant="ghost" /></div>
          <Button variant="ghost" className="absolute left-4 top-4 text-primary hover:text-white" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> {t("back")}
          </Button>
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center mx-auto mb-4 mt-8">
            <Car className="w-10 h-10 text-black" />
          </div>
          <h2 className="text-2xl font-bold text-primary">
            {isLogin ? t("pilot_login") : t("become_pilot_title")}
          </h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-primary">{t("first_name")}</Label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="bg-background-secondary border-border text-white" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-primary">{t("last_name")}</Label>
                  <Input value={formData.surname} onChange={e => setFormData({ ...formData, surname: e.target.value })}
                    className="bg-background-secondary border-border text-white" required />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-primary">{t("phone_number")}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-primary/50" />
                <Input type="tel" value={formData.cellphone}
                  onChange={e => setFormData({ ...formData, cellphone: e.target.value })}
                  className="pl-10 bg-background-secondary border-border text-white"
                  placeholder="+995 XXX XXX XXX" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-primary">{t("password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-primary/50" />
                <Input type="password" value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="pl-10 bg-background-secondary border-border text-white" required />
              </div>
            </div>
            <Button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-secondary text-black font-bold hover:shadow-neon-cyan transition-all">
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isLogin ? t("sign_in") : t("register_driver")}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="link" className="text-secondary" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? t("need_account") : t("have_account")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// =============================================================================
// LOCATION TRACKER HOOK
// BUG FIX: onLocationUpdate stabilised via ref so GPS watch never restarts
// unnecessarily (was restarting on every activeRide status change)
// =============================================================================
const useLocationTracker = (isOnline, onLocationUpdate) => {
  const watchIdRef      = useRef(null);
  const intervalRef     = useRef(null);
  const lastLocationRef = useRef(null);
  // Stable ref — avoids the hook dep array needing the callback
  const callbackRef     = useRef(onLocationUpdate);
  useEffect(() => { callbackRef.current = onLocationUpdate; }, [onLocationUpdate]);

  useEffect(() => {
    if (!isOnline) {
      if (watchIdRef.current  != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      if (intervalRef.current != null) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastLocationRef.current = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          heading: pos.coords.heading, speed: pos.coords.speed,
        };
      },
      (err) => console.error("GPS error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    intervalRef.current = setInterval(() => {
      if (lastLocationRef.current) callbackRef.current(lastLocationRef.current);
    }, LOCATION_UPDATE_INTERVAL);

    return () => {
      if (watchIdRef.current  != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
  }, [isOnline]); // Only depends on isOnline — GPS never restarts on ride changes

  return lastLocationRef;
};

// =============================================================================
// DRIVER SMART MAP
// BUG FIX: Route is NOT redrawn on every GPS ping — only when status/target changes
// This prevents spamming the Google Directions API (each call is billed)
// =============================================================================
const DriverSmartMap = ({ activeRide, driverLocation }) => {
  const mapRef              = useRef(null);
  const mapInstanceRef      = useRef(null);
  const markerRef           = useRef(null);
  const routeRendererRef    = useRef(null);
  const directionsServiceRef= useRef(null);
  const [isFollowing, setIsFollowing]       = useState(true);
  const [mapReady, setMapReady]             = useState(false);
  const [routeSteps, setRouteSteps]         = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [rerouteCounter, setRerouteCounter]     = useState(0);

  const getSafe = (v) => { const n = parseFloat(v); return !isNaN(n) && n !== 0 ? n : null; };

  const haversineKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Init map once
  useEffect(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 }, zoom: 17,
      disableDefaultUI: true, zoomControl: false, gestureHandling: "greedy",
      backgroundColor: "#ffffff",
    });
    map.addListener("dragstart", () => setIsFollowing(false));

    routeRendererRef.current = new window.google.maps.DirectionsRenderer({
      map, suppressMarkers: false,
      polylineOptions: { strokeColor: "#0088ff", strokeWeight: 6 },
      preserveViewport: true,
    });
    directionsServiceRef.current = new window.google.maps.DirectionsService();
    mapInstanceRef.current = map;
    setMapReady(true);
  }, []);

  // Smooth animation refs
  const animFrameRef   = useRef(null);
  const prevPosRef     = useRef(null);
  const lastRerouteRef = useRef(0);

  // Update driver marker with smooth interpolation + map rotation
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation) return;
    const lat = getSafe(driverLocation.lat), lng = getSafe(driverLocation.lng);
    if (!lat || !lng) return;

    const heading   = parseFloat(driverLocation.heading) || 0;
    const targetPos = { lat, lng };

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        position: targetPos, map: mapInstanceRef.current, zIndex: 1000,
        icon: {
          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6, fillColor: "#00d4ff", fillOpacity: 1,
          strokeColor: "white", strokeWeight: 2,
          rotation: heading, anchor: new window.google.maps.Point(0, 2.5),
        },
      });
      prevPosRef.current = targetPos;
    }

    // Smooth interpolation over 1.8s (slightly under the 2s GPS interval)
    const startPos  = prevPosRef.current || targetPos;
    const startTime = performance.now();
    const duration  = 1800;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const animate = (now) => {
      const t    = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
      const cur  = { lat: startPos.lat + (targetPos.lat - startPos.lat)*ease, lng: startPos.lng + (targetPos.lng - startPos.lng)*ease };

      if (markerRef.current) {
        markerRef.current.setPosition(cur);
        markerRef.current.setIcon({ ...markerRef.current.getIcon(), rotation: heading });
      }
      if (isFollowing && mapInstanceRef.current) {
        mapInstanceRef.current.panTo(cur);
        if (heading && typeof mapInstanceRef.current.setHeading === "function") {
          mapInstanceRef.current.setHeading(heading);
        }
      }
      if (t < 1) animFrameRef.current = requestAnimationFrame(animate);
      else prevPosRef.current = targetPos;
    };
    animFrameRef.current = requestAnimationFrame(animate);

    // Auto-reroute if off route (max once per 15s)
    const now = Date.now();
    if (routeSteps.length > 0 && now - lastRerouteRef.current > 15000) {
      const step = routeSteps[currentStepIndex];
      if (step && haversineKm(lat, lng, step.end_location.lat(), step.end_location.lng()) > 0.15) {
        lastRerouteRef.current = now;
        setRerouteCounter(n => n + 1);
      }
    }

    // Advance turn-by-turn step
    if (routeSteps.length > 0 && currentStepIndex < routeSteps.length) {
      const step = routeSteps[currentStepIndex];
      if (haversineKm(lat, lng, step.end_location.lat(), step.end_location.lng()) < 0.04) setCurrentStepIndex(p => p + 1);
    }

    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [driverLocation, isFollowing, routeSteps, currentStepIndex]);

  // Redraw route ONLY when status or target destination changes
  // BUG FIX: Removed driverLocation from deps — prevented billed API call every 2s
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !directionsServiceRef.current) return;
    if (!activeRide || !driverLocation) {
      if (routeRendererRef.current) routeRendererRef.current.setDirections({ routes: [] });
      setRouteSteps([]);
      return;
    }

    const dLat = getSafe(driverLocation?.lat), dLng = getSafe(driverLocation?.lng);
    if (!dLat || !dLng) return;

    let target = null;
    if (["accepted", "arrived"].includes(activeRide.status)) {
      const lat = getSafe(activeRide.pickup_lat);
      const lng = getSafe(activeRide.pickup_lng);
      if (lat && lng) target = { lat, lng };
    } else if (activeRide.status === "in_progress") {
      const lat = getSafe(activeRide.dest_lat || activeRide.destination_lat);
      const lng = getSafe(activeRide.dest_lng || activeRide.destination_lng);
      if (lat && lng) target = { lat, lng };
    }

    if (!target) return;

    directionsServiceRef.current.route(
      { origin: { lat: dLat, lng: dLng }, destination: target, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (status === "OK" && routeRendererRef.current) {
          routeRendererRef.current.setDirections(result);
          const steps = result.routes[0].legs[0].steps;
          setRouteSteps(steps);
          setCurrentStepIndex(0);
        }
      }
    );
  }, [
    // Re-route when target changes OR when driver goes off route
    activeRide?.status,
    activeRide?.pickup_lat,
    activeRide?.dest_lat,
    activeRide?.destination_lat,
    mapReady,
    rerouteCounter,
  ]);

  const getTurnIcon = (maneuver) => {
    if (!maneuver)                    return <Navigation className="w-8 h-8" />;
    if (maneuver.includes("left"))    return <ArrowLeft className="w-8 h-8" />;
    if (maneuver.includes("right"))   return <ArrowRight className="w-8 h-8" />; // FIX: was rotated ArrowLeft
    return <Navigation className="w-8 h-8" />;
  };

  const handleZoomIn  = () => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 15) + 1);
  const handleZoomOut = () => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 15) - 1);
  const handleRecenter = () => {
    setIsFollowing(true);
    if (driverLocation && mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) });
    }
  };

  const handleNav = (app) => {
    if (!activeRide) return;
    let destLat, destLng, waypoints = "";
    if (["accepted", "arrived"].includes(activeRide.status)) {
      destLat = activeRide.pickup_lat; destLng = activeRide.pickup_lng;
    } else {
      destLat = activeRide.dest_lat || activeRide.destination_lat;
      destLng = activeRide.dest_lng || activeRide.destination_lng;
      if (activeRide.stops?.length && app === "google") {
        const wStr = activeRide.stops.filter(s => s.lat && s.lng).map(s => `${s.lat},${s.lng}`).join("|");
        if (wStr) waypoints = `&waypoints=${wStr}`;
      }
    }
    if (!destLat || !destLng) return toast.error("No destination coordinates");
    const url = app === "waze"
      ? `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`
      : `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}${waypoints}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const currentStep = routeSteps[currentStepIndex];

  return (
    <div className="fixed inset-0 w-full h-full z-0">
      <div ref={mapRef} className="w-full h-full" />

      {/* Turn-by-turn */}
      {activeRide && currentStep && (
        <div className="absolute top-28 left-4 right-4 z-20 bg-[#1a1a2e]/95 backdrop-blur-xl border border-[#00ff88]/50 rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center gap-4">
          <div className="bg-[#00ff88]/20 p-3 rounded-xl text-[#00ff88] shrink-0">
            {getTurnIcon(currentStep.maneuver)}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-2xl font-bold text-white mb-1">{currentStep.distance.text}</p>
            <p className="text-[#00ff88] font-medium text-[15px] leading-tight truncate">
              {currentStep.instructions.replace(/<[^>]*>?/gm, "")}
            </p>
          </div>
        </div>
      )}

      {/* Recenter */}
      {!isFollowing && driverLocation && (
        <button onClick={handleRecenter}
          className="absolute bottom-[48vh] left-4 bg-[#00d4ff] text-black p-3 rounded-full shadow-lg z-10 border-2 border-white">
          <Crosshair className="w-6 h-6 animate-pulse" />
        </button>
      )}

      {/* Zoom controls */}
      <div className="absolute top-1/2 right-4 -translate-y-1/2 flex flex-col gap-2 z-10">
        <button onClick={handleZoomIn}
          className="bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] w-12 h-12 rounded-xl flex items-center justify-center shadow-lg active:bg-[#00ff88]/30">
          <Plus className="w-6 h-6" />
        </button>
        <button onClick={handleZoomOut}
          className="bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] w-12 h-12 rounded-xl flex items-center justify-center shadow-lg active:bg-[#00ff88]/30">
          <span className="text-2xl font-bold leading-none -mt-1">-</span>
        </button>
      </div>

      {/* External nav */}
      {activeRide && (
        <div className="absolute top-52 right-4 flex flex-col gap-3 z-10">
          <Button size="icon" onClick={() => handleNav("waze")}
            className="bg-black/80 border border-[#00d4ff]/50 text-[#00d4ff] w-12 h-12 rounded-full">
            <Zap className="w-5 h-5" />
          </Button>
          <Button size="icon" onClick={() => handleNav("google")}
            className="bg-black/80 border border-[#00ff88]/50 text-[#00ff88] w-12 h-12 rounded-full">
            <MapPinned className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// DRIVER DASHBOARD
// =============================================================================
const DriverDashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t }    = useLanguage();

  // ---- UI ----
  const [activeTab,   setActiveTab]   = useState("rides");
  const [loading,     setLoading]     = useState(false);
  const [mapsLoaded,  setMapsLoaded]  = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const touchStartY = useRef(null);

  // ---- Online / location ----
  const [isOnline,      setIsOnline]      = useState(user?.is_online || false);
  const [driverLocation, setDriverLocation] = useState(null);

  // ---- Rides ----
  const [availableRides, setAvailableRides] = useState([]);
  const [nearbyRides,    setNearbyRides]    = useState([]);
  const [activeRide,     setActiveRide]     = useState(null);
  const [rideHistory,    setRideHistory]    = useState([]);
  const [completedRide,  setCompletedRide]  = useState(null);

  // ---- Tracking ----
  const [rideStartTime,    setRideStartTime]    = useState(null);
  const [arrivedTime,      setArrivedTime]      = useState(null);
  const [waitTimer,        setWaitTimer]        = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const [isWaitingAtStop,  setIsWaitingAtStop]  = useState(false); // FIX: declared before handleRideAction
  const lastPositionRef = useRef(null);

  // ---- Cancel ----
  const [showCancelModal,      setShowCancelModal]      = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");

  // ---- Vehicle ----
  const [vehicleData, setVehicleData] = useState({
    car_make: "", car_model: "", car_year: "", car_color: "", license_plate: "",
    license_front: null, license_back: null, reg_front: null, reg_back: null,
    car_photo_front: null, car_photo_back: null, car_photo_left: null, car_photo_right: null,
  });

  // ---- Wallet ----
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount,    setTopupAmount]    = useState("");
  const [surgeInfo,      setSurgeInfo]      = useState(null);
  const [earningsTab,    setEarningsTab]    = useState("overview");

  // ---- Fleet management ----
  const [fleetVehicles, setFleetVehicles] = useState([]);
  const [campaigns,     setCampaigns]     = useState([]);
  const [showAddFleet,  setShowAddFleet]  = useState(false);
  const [fleetLoading,  setFleetLoading]  = useState(false);
  const [newVehicle,    setNewVehicle]    = useState({
    car_make: "", car_model: "", car_year: "", car_color: "",
    license_plate: "", driver_name: "", driver_phone: "", car_type: "economy",
  });

  // ---- Trip detail + dispute ----
  const [selectedTrip,     setSelectedTrip]     = useState(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeMessage,   setDisputeMessage]   = useState("");
  const [disputeLoading,   setDisputeLoading]   = useState(false);

  const balance            = user?.earnings?.balance ?? user?.wallet_balance ?? 0;
  const totalEarned        = user?.earnings?.total_earned   ?? 0;
  const totalWithdrawn     = user?.earnings?.total_withdrawn ?? 0;
  const registrationStatus = user?.registration_status;
  const hasVehicle         = !!(user?.driver_info?.vehicle);

  // ==========================================================================
  // Maps
  // ==========================================================================
  useEffect(() => {
    if (window.google) { setMapsLoaded(true); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  // ==========================================================================
  // Auto-expand bottom sheet on status change
  // ==========================================================================
  useEffect(() => { setIsMinimized(false); }, [activeRide?.status]);

  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd   = (e) => {
    if (touchStartY.current == null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 40)       setIsMinimized(true);
    else if (delta < -40) setIsMinimized(false);
    touchStartY.current = null;
  };

  // ==========================================================================
  // Location update handler — stabilised via useRef in useLocationTracker
  // ==========================================================================
  const haversineKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Using useRef for activeRide inside the callback to avoid recreating it every status change
  const activeRideRef = useRef(activeRide);
  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);

  const handleLocationUpdate = useCallback(async (location) => {
    setDriverLocation(location);
    try {
      await api.post("/driver/location", location);
      const ride = activeRideRef.current;
      if (ride?.status === "in_progress" && lastPositionRef.current) {
        const dist = haversineKm(lastPositionRef.current.lat, lastPositionRef.current.lng, location.lat, location.lng);
        setDistanceTraveled(prev => prev + dist);
        await api.post(`/rides/${ride.id}/update-tracking`, location);
      }
      lastPositionRef.current = location;
    } catch (err) { console.error("Location update failed:", err); }
  }, []); // Empty deps — callback is stable, reads activeRide via ref

  useLocationTracker(isOnline, handleLocationUpdate);

  // ==========================================================================
  // Wait timer
  // ==========================================================================
  useEffect(() => {
    if (activeRide?.status !== "arrived") return;
    if (!arrivedTime && activeRide.arrived_at) {
      setArrivedTime(new Date(activeRide.arrived_at).getTime());
    }
    const interval = setInterval(() => {
      const start = arrivedTime || Date.now();
      setWaitTimer(Math.max(0, Math.floor((Date.now() - start) / 60000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [arrivedTime, activeRide?.status]);

  // ==========================================================================
  // Polling
  // ==========================================================================
  useEffect(() => { fetchActiveRide(); fetchRideHistory(); fetchFleet(); fetchEarnings(); fetchCampaigns(); }, []);

  useEffect(() => {
    if (registrationStatus !== "approved" || !isOnline) return;
    fetchAvailableRides();
    const iv = setInterval(fetchAvailableRides, 5000);
    return () => clearInterval(iv);
  }, [isOnline, registrationStatus]);

  const fetchAvailableRides = async () => {
    try { const r = await api.get("/driver/rides/available"); setAvailableRides(r.data.rides || []); } catch (_) {}
  };
  const fetchActiveRide = async () => {
    try { const r = await api.get("/driver/active-ride"); if (r.data) { setActiveRide(r.data); setActiveTab("rides"); } } catch (_) {}
  };

  const fetchEarnings = async () => {
    try {
      const r = await api.get("/driver/earnings");
      const d = r.data;
      updateUser({ ...user, balance: d.balance ?? user?.balance, total_earned: d.total_earned });
    } catch (_) {}
  };

  const fetchCampaigns = async () => {
    try {
      const r = await api.get("/driver/campaigns");
      setCampaigns(r.data.campaigns || []);
    } catch (_) {}
  };
  const fetchRideHistory = async () => {
    try { const r = await api.get("/driver/history"); setRideHistory(r.data.rides || []); } catch (_) {}
  };
  const fetchNearbyRides = async () => {
    try { const r = await api.get("/driver/rides/nearby?radius=10"); setNearbyRides(r.data.rides || []); } catch (_) {}
  };

  const refreshUser = async () => {
    try { const r = await api.get("/auth/me"); updateUser(r.data); } catch (_) {}
  };

  // ==========================================================================
  // Fleet
  // ==========================================================================
  const fetchFleet = async () => {
    try { const r = await api.get("/driver/fleet"); setFleetVehicles(r.data.vehicles || []); } catch (_) {}
  };

  const handleAddFleetVehicle = async (e) => {
    e.preventDefault();
    if (!newVehicle.driver_name.trim() || !newVehicle.license_plate.trim()) {
      toast.error("Driver name and license plate are required"); return;
    }
    setFleetLoading(true);
    try {
      await api.post("/driver/fleet/add", { ...newVehicle, car_year: parseInt(newVehicle.car_year) || 2020 });
      toast.success("Vehicle added to fleet!");
      setShowAddFleet(false);
      setNewVehicle({ car_make:"", car_model:"", car_year:"", car_color:"", license_plate:"", driver_name:"", driver_phone:"", car_type:"economy" });
      fetchFleet();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add vehicle");
    } finally {
      setFleetLoading(false);
    }
  };

  const handleRemoveFleetVehicle = async (vehicleId) => {
    try {
      await api.delete(`/driver/fleet/${vehicleId}`);
      toast.success("Vehicle removed");
      setFleetVehicles(prev => prev.filter(v => v.id !== vehicleId));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to remove vehicle");
    }
  };

  // ==========================================================================
  // Dispute / support ticket for a ride
  // ==========================================================================
  const handleOpenDispute = (trip) => {
    setSelectedTrip(trip);
    setDisputeMessage(`Re: Ride on ${trip.created_at ? new Date(trip.created_at).toLocaleDateString() : "recent trip"}
Pickup: ${trip.pickup}
Destination: ${trip.destination || "Open"}
Fare: ₾${trip.final_fare || trip.estimated_fare || "?"}

Issue: `);
    setShowDisputeModal(true);
  };

  const handleSubmitDispute = async () => {
    if (!disputeMessage.trim() || disputeMessage.trim().length < 20) {
      toast.error("Please describe the issue in more detail"); return;
    }
    setDisputeLoading(true);
    try {
      const res = await api.post("/support/chat", {
        message: disputeMessage,
        ticket_id: null,
      });
      toast.success("Dispute submitted! Our team will respond shortly.");
      setShowDisputeModal(false);
      setDisputeMessage("");
      setSelectedTrip(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit dispute");
    } finally {
      setDisputeLoading(false);
    }
  };

  // ==========================================================================
  // Ride actions
  // ==========================================================================
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
        await api.post(`/rides/${activeRide.id}/start`, { pickup_wait_time: parseInt(waitTimer || 0) });
        setRideStartTime(Date.now());
        setDistanceTraveled(0);
        lastPositionRef.current = driverLocation;
        window.__distanceTraveled = 0;
        window.__lastGpsPoint = null;
        window.__activeRideStatus = "in_progress";
        toast.success("Ride started!");
      }
      else if (action === "complete") {
        // Round distance to avoid floating-point noise accumulation
        const finalDist = isNaN(distanceTraveled) ? 0 : parseFloat(distanceTraveled.toFixed(2));
        const finalWait = isNaN(waitTimer)         ? 0 : parseInt(waitTimer);
        const dLat      = driverLocation?.lat || "";
        const dLng      = driverLocation?.lng || "";

        const res = await api.post(
          `/rides/${activeRide.id}/complete?final_distance=${finalDist}&total_wait_minutes=${finalWait}&dropoff_lat=${dLat}&dropoff_lng=${dLng}`
        );

        const finalFare     = res.data.final_fare   > 0 ? res.data.final_fare   : (activeRide.estimated_fare || 0);
        const cashToCollect = res.data.cash_to_collect || 0;

        if (cashToCollect > 0) {
          toast.success(`Trip done! Collect exactly ₾${cashToCollect.toFixed(2)} CASH.`, { duration: 8000 });
        } else {
          toast.success("Trip done! No cash to collect.");
        }

        setCompletedRide({ ...res.data, final_fare: finalFare });
        setActiveRide(null);
        setDistanceTraveled(0);
        setWaitTimer(0);
        setArrivedTime(null);
        setRideStartTime(null);
        setIsWaitingAtStop(false);

        fetchRideHistory();
        await refreshUser();
        return;
      }

      // For non-complete actions, refresh the ride state
      if (action !== "complete") {
        const r = await api.get(`/rides/${activeRide.id}`);
        setActiveRide(r.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide || !selectedCancelReason) return;
    setLoading(true);
    try {
      await api.post(`/rides/${activeRide.id}/cancel`, { reason: selectedCancelReason, stage: activeRide.status });
      toast.success("Ride cancelled");
      setActiveRide(null); setDistanceTraveled(0); setWaitTimer(0);
      setArrivedTime(null); setRideStartTime(null);
      setShowCancelModal(false); setSelectedCancelReason("");
      fetchRideHistory(); fetchAvailableRides();
    } catch (_) {
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
      toast.success(online ? "You are now Online" : "You are now Offline");
    } catch (_) { toast.error("Status update failed"); }
  };

  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("car_make",      vehicleData.car_make);
      fd.append("car_model",     vehicleData.car_model);
      fd.append("car_year",      parseInt(vehicleData.car_year));
      fd.append("car_color",     vehicleData.car_color);
      fd.append("license_plate", vehicleData.license_plate);
      ["license_front","license_back","reg_front","reg_back","car_photo_front","car_photo_back","car_photo_left","car_photo_right"]
        .forEach(k => { if (vehicleData[k]) fd.append(k, vehicleData[k]); });

      const res = await api.post("/driver/vehicle", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Documents submitted for review!");
      updateUser({ ...user, driver_info: { ...user.driver_info, vehicle: vehicleData }, registration_status: "pending_review" });
    } catch (_) {
      toast.error("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // BUG FIX: Added null/NaN guard on estimatedFare + use constant
  const handleAcceptRide = async (rideId, estimatedFare) => {
    if (!estimatedFare || isNaN(estimatedFare)) {
      toast.error("Invalid ride fare"); return;
    }
    const commission = estimatedFare * DRIVER_COMMISSION_RATE;
    if (balance < commission) {
      toast.error(`Insufficient balance. Need ₾${commission.toFixed(2)} for this ride.`); return;
    }
    setLoading(true);
    try {
      await api.post(`/rides/${rideId}/accept`);
      toast.success("Ride accepted!");
      const r = await api.get(`/rides/${rideId}`);
      setActiveRide(r.data);
      setAvailableRides(prev => prev.filter(ride => ride.id !== rideId));
      setDistanceTraveled(0);
    } catch (_) { toast.error("Failed to accept ride"); }
    finally { setLoading(false); }
  };

  const handleDeclineRide = async (rideId) => {
    try { await api.post(`/rides/${rideId}/decline`); setAvailableRides(prev => prev.filter(r => r.id !== rideId)); toast.info("Declined"); }
    catch (_) {}
  };

  const handleRequestToJoin = async (rideId) => {
    setLoading(true);
    try { await api.post(`/rides/${rideId}/request-join`); toast.success("Join requested!"); fetchAvailableRides(); }
    catch (_) {} finally { setLoading(false); }
  };

  const toggleStopWait = async () => {
    try {
      const newStatus = !isWaitingAtStop;
      await api.post(`/rides/${activeRide.id}/toggle-stop-wait?is_waiting=${newStatus}`);
      setIsWaitingAtStop(newStatus);
      toast.success(newStatus ? "Stop wait timer started" : "Stop wait timer paused");
    } catch (_) { toast.error("Failed to update wait status"); }
  };

  // ==========================================================================
  // Helpers
  // ==========================================================================
  const statusColors = {
    pending_vehicle: "bg-yellow-500 text-black", pending_review: "bg-orange-500 text-black",
    approved: "bg-[#00ff88] text-black", rejected: "bg-red-500 text-white",
  };
  const rideStatusColors = {
    searching: "bg-yellow-500 text-black", accepted: "bg-blue-500 text-white",
    arrived: "bg-purple-500 text-white",   in_progress: "bg-[#00ff88] text-black",
    completed: "bg-green-600 text-white",  cancelled: "bg-red-500 text-white",
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div className="fixed inset-0 w-full h-full bg-black font-sans text-white overflow-hidden flex flex-col">

      {/* MAP BACKGROUND */}
      <div className="absolute inset-0 z-0">
        {mapsLoaded && <DriverSmartMap activeRide={activeRide} driverLocation={driverLocation} />}
      </div>

      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 z-50 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
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
            <div className="flex items-center gap-1.5 shrink-0">
              {surgeInfo?.is_surge && (
                <div className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs px-2 py-1 rounded-lg font-bold">
                  🔥 {surgeInfo.multiplier}×
                </div>
              )}
              {/* Online/Offline toggle — always visible for approved drivers */}
              {registrationStatus === "approved" && (
                <button
                  onClick={() => handleToggleOnline(!isOnline)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold transition-all shrink-0 ${
                    isOnline
                      ? "bg-[#00ff88]/20 border-[#00ff88] text-[#00ff88]"
                      : "bg-gray-800 border-gray-600 text-gray-400"
                  }`}>
                  <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-[#00ff88]" : "bg-gray-500"}`} />
                  {isOnline ? "Online" : "Offline"}
                </button>
              )}
              {/* Home — always visible */}
              <Button variant="ghost" size="icon"
                className="text-[#00d4ff] shrink-0 w-9 h-9"
                onClick={() => navigate("/")}>
                <Home className="w-4 h-4" />
              </Button>
              {/* Logout — always visible, never hidden */}
              <Button variant="ghost" size="icon"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0 w-9 h-9"
                onClick={logout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        {isOnline && driverLocation && (
          <div className="bg-black/80 backdrop-blur-md border-b border-[#00ff88]/20 px-4 py-2">
            <div className="container mx-auto flex items-center text-xs text-[#00ff88]">
              <Crosshair className="w-3 h-3 mr-2 animate-pulse" />
              Tracking active • {driverLocation.lat?.toFixed(5)}, {driverLocation.lng?.toFixed(5)}
              {driverLocation.speed != null && (
                <span className="ml-2">• {(driverLocation.speed * 3.6).toFixed(0)} km/h</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM SHEET */}
      <div className="absolute bottom-0 left-0 right-0 z-40 w-full flex justify-center pointer-events-none p-2 pb-4 sm:p-4 sm:pb-6">
        <div
          className={`pointer-events-auto w-full max-w-2xl bg-black/90 backdrop-blur-2xl border border-white/10 shadow-[0_-15px_40px_rgba(0,0,0,0.8)] rounded-3xl flex flex-col overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isMinimized && activeRide ? "translate-y-[calc(100%-3rem)]" : "translate-y-0"
          }`}
          style={{ maxHeight: "75vh" }}
        >
          {/* Drag handle */}
          {activeRide && (
            <div
              className="w-full flex justify-center items-center h-12 shrink-0 cursor-pointer bg-white/5 active:bg-white/10"
              onClick={() => setIsMinimized(p => !p)}
              onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
            >
              <div className="w-16 h-1.5 bg-gray-500 rounded-full" />
            </div>
          )}

          <div className="overflow-y-auto p-3 pb-4 flex-1">
            <Tabs value={activeTab} onValueChange={setActiveTab}>

              {!activeRide && (
                <TabsList className="grid grid-cols-7 bg-black/50 border border-[#00d4ff]/20 mb-4 rounded-xl">
                  {[
                    ["rides",     "Rides",     Activity],
                    ["nearby",    "Nearby",    Crosshair],
                    ["vehicle",   "Vehicle",   Car],
                    ["fleet",     "Fleet",     Building2],
                    ["earnings",  "Earn",      Wallet],
                    ["campaigns", "Rewards",   Trophy],
                    ["history",   "History",   History],
                  ].map(([val, label, Icon]) => (
                    <TabsTrigger key={val} value={val}
                      onClick={val === "nearby" ? fetchNearbyRides : val === "fleet" ? fetchFleet : undefined}
                      className="text-[10px] sm:text-sm px-1">
                      <Icon className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline">{label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              )}

              {/* -------------------------------------------------------------- */}
              {/* RIDES TAB                                                        */}
              {/* -------------------------------------------------------------- */}
              <TabsContent value="rides" className="m-0">
                {activeRide ? (
                  <Card className="bg-transparent border-none shadow-none">
                    <CardHeader className="px-2 pt-0 pb-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-[#00ff88] font-bold text-lg">Active Ride</h3>
                        <Badge className={rideStatusColors[activeRide.status]}>
                          {activeRide.status?.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 text-white px-2 pb-2">
                      {/* Trip addresses */}
                      <div className="bg-black/50 rounded-xl p-4 border border-[#00ff88]/20 space-y-3">
                        <div className="flex items-start">
                          <MapPin className="w-5 h-5 text-[#00ff88] mr-2 mt-0.5" />
                          <div><p className="text-[#00ff88]/60 text-xs">PICKUP</p><p className="font-medium">{activeRide.pickup}</p></div>
                        </div>
                        {activeRide.stops?.filter(s => s.lat && s.lng).length > 0 && (
                          <div className="flex items-start">
                            <MapPinned className="w-5 h-5 text-yellow-400 mr-2 mt-0.5" />
                            <div>
                              <p className="text-yellow-400/60 text-xs">STOPS</p>
                              {activeRide.stops.map((s, i) => <p key={i} className="text-sm">• {s.address}</p>)}
                            </div>
                          </div>
                        )}
                        <div className="flex items-start">
                          <Navigation className="w-5 h-5 text-[#00d4ff] mr-2 mt-0.5" />
                          <div><p className="text-[#00d4ff]/60 text-xs">DESTINATION</p><p className="font-medium">{activeRide.destination || "Open Trip"}</p></div>
                        </div>
                      </div>

                      {/* Wait / distance indicators */}
                      {(activeRide.status === "arrived" || activeRide.status === "in_progress") && (
                        <div className="grid grid-cols-2 gap-4">
                          {activeRide.status === "arrived" && (
                            <DriverWaitTimer arrivedAt={activeRide.arrived_at} carType={activeRide.carType || activeRide.car_type} />
                          )}
                          {activeRide.status === "in_progress" && (
                            <div className="bg-[#00ff88]/20 border border-[#00ff88] rounded-xl p-4 text-center col-span-2">
                              <Activity className="w-6 h-6 mx-auto text-[#00ff88] mb-1" />
                              <p className="text-2xl font-bold text-[#00ff88]">{distanceTraveled.toFixed(2)} km</p>
                              <p className="text-xs text-[#00ff88]/70">Traveled</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fare */}
                      <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4">
                        <span className="text-[#00ff88]">Fare</span>
                        <span className="text-2xl font-bold text-[#00ff88]">
                          ₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2) ?? "—"}
                        </span>
                      </div>

                      {/* Communication */}
                      <RideCommunication
                        rideId={activeRide.id}
                        otherPartyPhone={activeRide.rider_phone || activeRide.rider?.cellphone}
                        otherPartyName={activeRide.rider_name || "Rider"}
                        currentUserId={user?.id}
                        isDriver={true}
                      />

                      {/* Action buttons */}
                      <div className="flex flex-col gap-3 pt-2">
                        {/* Stop wait toggle */}
                        {activeRide.status === "in_progress" && activeRide.stops?.some(s => s.lat && s.lng) && (
                          <Button
                            onClick={toggleStopWait}
                            variant={isWaitingAtStop ? "destructive" : "outline"}
                            className="w-full h-12 font-bold bg-black border-white/20 text-white"
                          >
                            {isWaitingAtStop
                              ? <><Timer className="mr-2 animate-spin" /> Finish Waiting at Stop</>
                              : <><PauseCircle className="mr-2 text-yellow-400" /> Start Stop Wait</>}
                          </Button>
                        )}

                        <div className="flex gap-3">
                          <div className="flex-1">
                            {activeRide.status === "accepted" && (
                              <Button className="w-full bg-purple-500 text-white h-14 text-lg font-bold"
                                onClick={() => handleRideAction("arrived")} disabled={loading}>
                                <MapPin className="w-5 h-5 mr-2" /> I've Arrived
                              </Button>
                            )}
                            {activeRide.status === "arrived" && (
                              <Button className="w-full bg-blue-500 text-white h-14 text-lg font-bold"
                                onClick={() => handleRideAction("start")} disabled={loading}>
                                <Play className="w-5 h-5 mr-2" /> Start Trip
                              </Button>
                            )}
                            {activeRide.status === "in_progress" && (
                              <Button className="w-full bg-[#00ff88] text-black h-14 text-lg font-bold"
                                onClick={() => handleRideAction("complete")} disabled={loading}>
                                <CheckCircle2 className="w-5 h-5 mr-2" /> Complete Trip
                              </Button>
                            )}
                          </div>
                          <Button variant="destructive"
                            className="h-14 w-14 bg-red-500/20 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                            onClick={() => setShowCancelModal(true)} disabled={loading}>
                            <XCircle className="w-6 h-6" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  registrationStatus !== "approved" ? (
                    <div className="text-center py-12">
                      <AlertTriangle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
                      <p className="text-yellow-400 font-semibold">Account Pending Review</p>
                    </div>
                  ) : !isOnline ? (
                    <div className="text-center py-12">
                      <Activity className="w-16 h-16 mx-auto text-gray-500 mb-4" />
                      <p className="text-gray-400 mb-4">You are offline</p>
                      <Button className="bg-[#00ff88] text-black font-bold h-12 px-8" onClick={() => handleToggleOnline(true)}>
                        Go Online
                      </Button>
                    </div>
                  ) : availableRides.length === 0 ? (
                    <div className="text-center py-12">
                      <Navigation className="w-16 h-16 mx-auto text-[#00d4ff]/50 mb-4 animate-pulse" />
                      <p className="text-[#00d4ff]/70">Searching for rides...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {availableRides.map(ride => {
                        const commission = (ride.estimated_fare || 0) * DRIVER_COMMISSION_RATE;
                        const canAccept  = balance >= commission && !!ride.estimated_fare;
                        return (
                          <Card key={ride.id} className="bg-black/60 border border-[#00ff88]/30">
                            <CardContent className="p-4 text-white">
                              <div className="flex justify-between items-start mb-3">
                                <div className="flex-1 pr-2">
                                  <p className="text-[#00ff88] font-semibold text-sm truncate">{ride.pickup}</p>
                                  <p className="text-[#00d4ff]/70 text-xs truncate">→ {ride.destination || "Open"}</p>
                                  {ride.car_type && (
                                    <p className="text-gray-400 text-xs mt-1 capitalize">{ride.car_type} • {PRICING_RULES[ride.car_type]?.icon}</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-2xl font-bold text-[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p>
                                  <p className="text-gray-400 text-xs">Your cut: ₾{((ride.estimated_fare || 0) * (1 - DRIVER_COMMISSION_RATE)).toFixed(2)}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button className="flex-1 bg-[#00ff88] text-black font-bold h-12"
                                  onClick={() => handleAcceptRide(ride.id, ride.estimated_fare)}
                                  disabled={loading || !canAccept}>
                                  {canAccept ? "Accept" : `Need ₾${commission.toFixed(2)}`}
                                </Button>
                                <Button variant="outline" className="border-red-500 text-red-500 h-12 w-12"
                                  onClick={() => handleDeclineRide(ride.id)}>
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

              {/* -------------------------------------------------------------- */}
              {/* NEARBY TAB                                                       */}
              {/* -------------------------------------------------------------- */}
              <TabsContent value="nearby">
                <div className="space-y-4">
                  <div className="flex justify-end mb-2">
                    <Button size="sm" variant="outline" onClick={fetchNearbyRides} className="text-white border-white/20 hover:bg-white/10">
                      Refresh
                    </Button>
                  </div>
                  {nearbyRides.length === 0 && <p className="text-center text-gray-400 py-8">No nearby rides found</p>}
                  {nearbyRides.map(ride => (
                    <Card key={ride.id} className="bg-black/60 border border-[#00d4ff]/30">
                      <CardContent className="p-4 text-white">
                        <p className="text-[#00ff88]">{ride.pickup}</p>
                        <p className="text-[#00d4ff]">→ {ride.destination}</p>
                        <Button className="w-full mt-2 bg-[#00d4ff] text-black font-bold"
                          onClick={() => handleRequestToJoin(ride.id)}>
                          Request to Accept
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* -------------------------------------------------------------- */}
              {/* VEHICLE TAB                                                      */}
              {/* -------------------------------------------------------------- */}
              <TabsContent value="vehicle">
                <div className="space-y-4">
                  <h3 className="text-[#00d4ff] font-bold text-lg">Vehicle Registration</h3>
                  {hasVehicle ? (
                    <div className="p-6 bg-black/50 rounded-xl border border-[#00ff88]/30 text-center">
                      <CheckCircle2 className="w-12 h-12 text-[#00ff88] mx-auto mb-2" />
                      <p className="text-lg font-bold">Documents Under Review</p>
                      <p className="text-xl font-mono text-[#00ff88] mt-2">
                        {user?.driver_info?.vehicle?.license_plate || "—"}
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleRegisterVehicle} className="space-y-6">
                      <div className="space-y-3">
                        <h4 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Vehicle Details</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {[["car_make","Make","text","Toyota"],["car_model","Model","text","Camry"],["car_year","Year","number","2018"],["car_color","Color","text","Silver"]].map(([key,label,type,placeholder]) => (
                            <div key={key} className="space-y-1">
                              <Label className="text-gray-400 text-xs">{label}</Label>
                              <Input required type={type} placeholder={placeholder}
                                value={vehicleData[key]} onChange={e => setVehicleData({ ...vehicleData, [key]: e.target.value })}
                                className="bg-black/50 text-white border-[#00d4ff]/30" />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-gray-400 text-xs">License Plate</Label>
                          <Input required placeholder="AB-123-CD" value={vehicleData.license_plate}
                            onChange={e => setVehicleData({ ...vehicleData, license_plate: e.target.value.toUpperCase() })}
                            className="bg-black/50 text-white border-[#00d4ff]/30 uppercase font-mono" />
                        </div>
                      </div>

                      {[
                        ["Driver's License", [["license_front","Front"],["license_back","Back"]]],
                        ["Vehicle Registration", [["reg_front","Front"],["reg_back","Back"]]],
                        ["Car Photos", [["car_photo_front","Front"],["car_photo_back","Back"],["car_photo_left","Left"],["car_photo_right","Right"]]],
                      ].map(([sectionTitle, fields]) => (
                        <div key={sectionTitle} className="space-y-3">
                          <h4 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">{sectionTitle}</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {fields.map(([key, label]) => (
                              <div key={key} className="space-y-1">
                                <Label className="text-gray-400 text-xs">{label}</Label>
                                <Input required type="file" accept="image/*"
                                  onChange={e => setVehicleData({ ...vehicleData, [key]: e.target.files[0] })}
                                  className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <Button type="submit" disabled={loading}
                        className="w-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-black font-bold h-12 mt-4">
                        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                        Submit Documents
                      </Button>
                    </form>
                  )}
                </div>
              </TabsContent>

              {/* -------------------------------------------------------------- */}
              {/* EARNINGS TAB — with Top Up + Withdraw sub-tabs                  */}
              {/* -------------------------------------------------------------- */}
              <TabsContent value="earnings">
                <div className="space-y-4">
                  {/* Stats overview */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl p-3 text-center">
                      <p className="text-[#00ff88]/60 text-[10px] uppercase font-bold mb-1">Balance</p>
                      <p className="text-xl font-bold text-[#00ff88]">₾{balance.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                      <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Total Earned</p>
                      <p className="text-xl font-bold text-white">₾{totalEarned.toFixed(2)}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                      <p className="text-gray-400 text-[10px] uppercase font-bold mb-1">Withdrawn</p>
                      <p className="text-xl font-bold text-white">₾{totalWithdrawn.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Sub-tab switcher */}
                  <div className="flex gap-2">
                    {[["overview","Overview"],["topup","Top Up"],["withdraw","Withdraw"]].map(([key, label]) => (
                      <button key={key} onClick={() => setEarningsTab(key)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all border ${
                          earningsTab === key
                            ? "bg-[#00ff88]/20 border-[#00ff88] text-[#00ff88]"
                            : "border-white/10 text-gray-400 hover:border-white/30"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Overview */}
                  {earningsTab === "overview" && (
                    <div className="space-y-3">
                      <div className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-3">
                        <p className="text-gray-400 text-xs uppercase font-bold">Commission Rate</p>
                        <div className="flex justify-between">
                          <span className="text-white">Platform commission</span>
                          <span className="text-red-400 font-mono">{(DRIVER_COMMISSION_RATE * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white">Your share</span>
                          <span className="text-[#00ff88] font-mono">{((1 - DRIVER_COMMISSION_RATE) * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1 bg-[#00ff88] text-black font-bold" onClick={() => setEarningsTab("topup")}>
                          <Plus className="w-4 h-4 mr-2" /> Top Up
                        </Button>
                        <Button className="flex-1 bg-white/10 text-white border border-white/20 font-bold" onClick={() => setEarningsTab("withdraw")}>
                          <Banknote className="w-4 h-4 mr-2" /> Withdraw
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Top Up via PayPal */}
                  {earningsTab === "topup" && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-gray-300">Amount to Add (GEL)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff88] font-bold text-lg">₾</span>
                          <Input
                            type="number" min="5" max="500" step="1"
                            value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
                            placeholder="50" className="pl-8 bg-black/50 border-[#00ff88]/30 text-white text-lg h-12"
                          />
                        </div>
                        <p className="text-gray-500 text-xs">Equivalent: ${topupAmount ? (parseFloat(topupAmount) * 0.37).toFixed(2) : "0.00"} USD</p>
                      </div>

                      {topupAmount && parseFloat(topupAmount) >= 5 ? (
                        <PayPalButtons
                          fundingSource="card"
                          style={{ layout: "vertical", shape: "rect" }}
                          createOrder={(data, actions) =>
                            actions.order.create({
                              purchase_units: [{
                                amount: {
                                  value: (parseFloat(topupAmount) * 0.37).toFixed(2),
                                  currency_code: "USD",
                                },
                              }],
                              application_context: { shipping_preference: "NO_SHIPPING" },
                            })
                          }
                          onApprove={async (data, actions) => {
                            try {
                              setLoading(true);
                              await actions.order.capture();
                              await api.post("/driver/wallet/topup/paypal", {
                                order_id: data.orderID,
                                amount: parseFloat(topupAmount),
                              });
                              toast.success(`₾${topupAmount} added to your wallet!`);
                              setTopupAmount("");
                              setEarningsTab("overview");
                              await refreshUser();
                            } catch (_) {
                              toast.error("Top-up failed. Contact support.");
                            } finally {
                              setLoading(false);
                            }
                          }}
                          onError={(err) => { console.error("PayPal error:", err); toast.error("Payment failed."); }}
                          onCancel={() => toast.info("Payment cancelled.")}
                        />
                      ) : (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                          <p className="text-yellow-400 text-sm">Enter ₾5 or more to show payment options</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Withdrawal — rendered from the WithdrawalPanel component */}
                  {earningsTab === "withdraw" && (
                    <WithdrawalPanel
                      balance={balance}
                      driverId={user?.id}
                      onSuccess={async () => {
                        setEarningsTab("overview");
                        await refreshUser();
                      }}
                    />
                  )}
                </div>
              </TabsContent>

              {/* -------------------------------------------------------------- */}
              {/* FLEET TAB                                                         */}
              {/* -------------------------------------------------------------- */}
              <TabsContent value="fleet">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[#00d4ff] font-bold text-base">My Fleet</h3>
                    <Button size="sm" onClick={() => setShowAddFleet(p => !p)}
                      className="bg-[#00ff88] text-black font-bold h-8 px-3 text-xs">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Vehicle
                    </Button>
                  </div>

                  {/* Add vehicle form */}
                  {showAddFleet && (
                    <form onSubmit={handleAddFleetVehicle}
                      className="bg-black/50 border border-[#00ff88]/30 rounded-xl p-4 space-y-3">
                      <p className="text-[#00ff88] text-xs font-bold uppercase mb-2">New Fleet Vehicle</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ["car_make",  "Make",        "text",   "Toyota"],
                          ["car_model", "Model",       "text",   "Camry"],
                          ["car_year",  "Year",        "number", "2018"],
                          ["car_color", "Color",       "text",   "Silver"],
                        ].map(([key, label, type, ph]) => (
                          <div key={key} className="space-y-1">
                            <Label className="text-gray-400 text-[10px]">{label}</Label>
                            <Input required type={type} placeholder={ph}
                              value={newVehicle[key]}
                              onChange={e => setNewVehicle(p => ({ ...p, [key]: e.target.value }))}
                              className="bg-black/60 text-white border-[#00d4ff]/30 h-9 text-sm" />
                          </div>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-[10px]">License Plate</Label>
                        <Input required placeholder="AB-123-CD"
                          value={newVehicle.license_plate}
                          onChange={e => setNewVehicle(p => ({ ...p, license_plate: e.target.value.toUpperCase() }))}
                          className="bg-black/60 text-white border-[#00d4ff]/30 h-9 font-mono uppercase text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-gray-400 text-[10px]">Driver Name</Label>
                          <Input required placeholder="Full name"
                            value={newVehicle.driver_name}
                            onChange={e => setNewVehicle(p => ({ ...p, driver_name: e.target.value }))}
                            className="bg-black/60 text-white border-[#00d4ff]/30 h-9 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-gray-400 text-[10px]">Driver Phone</Label>
                          <Input required placeholder="+995 5XX…"
                            value={newVehicle.driver_phone}
                            onChange={e => setNewVehicle(p => ({ ...p, driver_phone: e.target.value }))}
                            className="bg-black/60 text-white border-[#00d4ff]/30 h-9 text-sm" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-gray-400 text-[10px]">Vehicle Class</Label>
                        <select
                          value={newVehicle.car_type}
                          onChange={e => setNewVehicle(p => ({ ...p, car_type: e.target.value }))}
                          className="w-full h-9 bg-black/60 text-white border border-[#00d4ff]/30 rounded-md px-2 text-sm">
                          {Object.entries(PRICING_RULES).map(([k, v]) => (
                            <option key={k} value={k}>{v.icon} {v.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button type="button" variant="ghost" onClick={() => setShowAddFleet(false)}
                          className="flex-1 text-gray-400 border border-gray-700 h-9 text-sm">Cancel</Button>
                        <Button type="submit" disabled={fleetLoading}
                          className="flex-1 bg-[#00ff88] text-black font-bold h-9 text-sm">
                          {fleetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Vehicle"}
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* Fleet list */}
                  {fleetVehicles.length === 0 && !showAddFleet && (
                    <div className="text-center py-8">
                      <Building2 className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                      <p className="text-gray-400 text-sm">No fleet vehicles yet</p>
                      <p className="text-gray-600 text-xs mt-1">Add vehicles driven by your employees</p>
                    </div>
                  )}
                  {fleetVehicles.map(v => (
                    <div key={v.id} className="bg-black/50 border border-[#00d4ff]/20 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-white font-mono font-bold tracking-wider text-sm">{v.license_plate}</p>
                          <p className="text-gray-400 text-xs">{v.car_color} {v.car_make} {v.car_model} {v.car_year}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30 text-[10px]">
                            {PRICING_RULES[v.car_type]?.icon} {v.car_type}
                          </Badge>
                          <button onClick={() => handleRemoveFleetVehicle(v.id)}
                            className="text-red-400/60 hover:text-red-400 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <User className="w-3 h-3" />
                        <span>{v.driver_name}</span>
                        {v.driver_phone && <><span>•</span><span>{v.driver_phone}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* -------------------------------------------------------------- */}
              {/* CAMPAIGNS TAB                                                    */}
              {/* -------------------------------------------------------------- */}
              <TabsContent value="campaigns" className="m-0">
                <div className="space-y-3">
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Bonus Campaigns</p>
                  {campaigns.length === 0 ? (
                    <div className="text-center py-10 bg-white/3 border border-white/8 rounded-2xl">
                      <Trophy className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No active campaigns right now</p>
                      <p className="text-gray-600 text-xs mt-1">Check back soon for bonus opportunities</p>
                    </div>
                  ) : campaigns.map(camp => (
                    <div key={camp.id} className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-white font-semibold text-sm">{camp.name}</p>
                          <p className="text-gray-400 text-xs mt-0.5">{camp.description}</p>
                        </div>
                        <span className="text-amber-400 font-bold text-sm">+₾{camp.bonus_amount}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>{camp.current_progress || 0} / {camp.target} rides</span>
                          <span>{Math.round(((camp.current_progress || 0) / camp.target) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((camp.current_progress || 0) / camp.target) * 100)}%` }} />
                        </div>
                      </div>
                      {camp.joined ? (
                        <span className="text-xs text-emerald-400 font-semibold">✓ Joined</span>
                      ) : (
                        <button onClick={async () => {
                          try {
                            await api.post(`/driver/campaigns/${camp.id}/join`);
                            fetchCampaigns();
                          } catch { toast.error("Could not join campaign"); }
                        }} className="w-full h-9 bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-xl text-xs font-bold hover:bg-amber-500/30 transition-all">
                          Join Campaign
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* -------------------------------------------------------------- */}
              {/* HISTORY TAB                                                      */}
              {/* -------------------------------------------------------------- */}
              <TabsContent value="history">
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2 pr-2">
                    {rideHistory.length === 0 && <p className="text-gray-400 text-center py-6">No rides yet.</p>}
                    {rideHistory.map(r => (
                      <div key={r.id} className="bg-black/50 border border-[#00d4ff]/20 rounded-xl overflow-hidden">
                        {/* Summary row */}
                        <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-white/5"
                          onClick={() => setSelectedTrip(selectedTrip?.id === r.id ? null : r)}>
                          <div className="flex-1 min-w-0 pr-2">
                            <p className="text-white text-sm font-medium truncate">{r.pickup}</p>
                            <p className="text-gray-500 text-xs truncate">→ {r.destination || "Open"}</p>
                            <p className="text-gray-600 text-[10px] mt-0.5">
                              {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                              {r.carType && ` • ${r.carType}`}
                            </p>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <p className="text-[#00ff88] font-bold tabular-nums">
                              ₾{r.final_fare != null ? parseFloat(r.final_fare).toFixed(2) : "—"}
                            </p>
                            {selectedTrip?.id === r.id
                              ? <ChevronUp className="w-4 h-4 text-gray-400" />
                              : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {selectedTrip?.id === r.id && (
                          <div className="border-t border-white/5 px-3 pb-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                              <div className="bg-black/40 rounded-lg p-2">
                                <p className="text-gray-500 mb-0.5">Payment</p>
                                <p className="text-white capitalize">{r.payment_method || r.paymentMethod || "cash"}</p>
                              </div>
                              <div className="bg-black/40 rounded-lg p-2">
                                <p className="text-gray-500 mb-0.5">Status</p>
                                <p className="text-white capitalize">{r.status || "—"}</p>
                              </div>
                              {r.final_distance && (
                                <div className="bg-black/40 rounded-lg p-2">
                                  <p className="text-gray-500 mb-0.5">Distance</p>
                                  <p className="text-white">{parseFloat(r.final_distance).toFixed(2)} km</p>
                                </div>
                              )}
                              {r.cash_to_collect != null && (
                                <div className="bg-black/40 rounded-lg p-2">
                                  <p className="text-gray-500 mb-0.5">Cash Collected</p>
                                  <p className="text-white">₾{parseFloat(r.cash_to_collect).toFixed(2)}</p>
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleOpenDispute(r)}
                              className="w-full h-8 bg-orange-500/20 border border-orange-500/50 text-orange-400 hover:bg-orange-500/30 text-xs"
                            >
                              <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                              Report Issue / Dispute Fare
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

            </Tabs>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* CANCEL MODAL                                                          */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent
          aria-describedby="cancel-desc"
          className="bg-[#1a1a2e] border border-red-500/50 text-white sm:max-w-md w-[95%] rounded-xl z-[10000]"
        >
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Cancel Ride
            </DialogTitle>
            <DialogDescription id="cancel-desc" className="text-gray-400">
              Select a reason.{" "}
              <span className="text-red-400 font-bold block mt-1">
                Warning: Unjustified cancellations may affect your score.
              </span>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] pr-4">
            <div className="grid gap-2 py-4">
              {(CANCEL_REASONS[activeRide?.status] || CANCEL_REASONS.accepted).map(reason => (
                <div key={reason} onClick={() => setSelectedCancelReason(reason)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedCancelReason === reason
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-black/40 border-gray-700 hover:border-red-500/50 hover:bg-red-500/10"
                  }`}>
                  <p className="font-medium text-sm">{reason}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowCancelModal(false)}
              className="flex-1 text-gray-400 border border-gray-700 h-12">Back</Button>
            <Button variant="destructive" onClick={handleCancelRide}
              disabled={!selectedCancelReason || loading}
              className="flex-1 bg-red-600 hover:bg-red-700 font-bold h-12">
              Confirm Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------------------------- */}
      {/* TRIP COMPLETION MODAL                                                 */}
      {/* -------------------------------------------------------------------- */}
      <DriverTripCompletionModal
        isOpen={!!completedRide}
        onClose={() => setCompletedRide(null)}
        fareAmount={completedRide?.final_fare || completedRide?.estimated_fare}
        paymentMethod={completedRide?.payment_method || completedRide?.paymentMethod || "cash"}
        riderName={completedRide?.rider_name || completedRide?.riderName || "Rider"}
        cashToCollect={completedRide?.cash_to_collect || 0}
        onConfirm={() => setCompletedRide(null)}
      />

      {/* -------------------------------------------------------------------- */}
      {/* DISPUTE MODAL                                                         */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={showDisputeModal} onOpenChange={open => { setShowDisputeModal(open); if (!open) { setDisputeMessage(""); setSelectedTrip(null); } }}>
        <DialogContent
          aria-describedby="dispute-desc"
          className="bg-[#1a1a2e] border border-orange-500/50 text-white sm:max-w-md w-[95%] rounded-xl z-[10000]"
        >
          <DialogHeader>
            <DialogTitle className="text-orange-400 flex items-center gap-2">
              <MessageCircle className="w-5 h-5" /> Report Issue / Dispute
            </DialogTitle>
            <DialogDescription id="dispute-desc" className="text-gray-400 text-sm">
              Describe the problem with this trip. Our admin team will review and respond.
            </DialogDescription>
          </DialogHeader>

          {selectedTrip && (
            <div className="bg-black/40 rounded-xl p-3 border border-white/10 text-xs space-y-1">
              <p className="text-gray-400">Trip: <span className="text-white">{selectedTrip.pickup} → {selectedTrip.destination || "Open"}</span></p>
              <p className="text-gray-400">Fare: <span className="text-[#00ff88] font-bold">₾{(selectedTrip.final_fare || selectedTrip.estimated_fare || 0).toFixed(2)}</span></p>
              <p className="text-gray-400">Date: <span className="text-white">{selectedTrip.created_at ? new Date(selectedTrip.created_at).toLocaleDateString() : "—"}</span></p>
            </div>
          )}

          <div className="space-y-2 mt-1">
            <Label className="text-gray-300 text-sm">Your Message</Label>
            <textarea
              value={disputeMessage}
              onChange={e => setDisputeMessage(e.target.value)}
              rows={6}
              placeholder="Describe the issue in detail..."
              className="w-full bg-black/50 border border-orange-500/30 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-orange-400 placeholder:text-gray-600"
            />
            <p className="text-gray-600 text-xs text-right">{disputeMessage.length} chars (min 20)</p>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowDisputeModal(false)}
              className="flex-1 text-gray-400 border border-gray-700 h-11">
              Cancel
            </Button>
            <Button onClick={handleSubmitDispute}
              disabled={disputeMessage.trim().length < 20 || disputeLoading}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold h-11">
              {disputeLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Submit Dispute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// =============================================================================
// PORTAL ROUTER
// =============================================================================
const DriverPortal = () => {
  const { user }   = useAuth();
  const location   = useLocation();

  if (!user || user.user_type !== "driver") {
    if (location.pathname === "/driver" || location.pathname === "/driver/") return <DriverAuth />;
    return <Navigate to="/driver" replace />;
  }

  return (
    <PayPalScriptProvider options={{ "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID, currency: "USD" }}>
      <Routes>
        <Route path="/"         element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DriverDashboard />} />
        <Route path="*"         element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default DriverPortal;
