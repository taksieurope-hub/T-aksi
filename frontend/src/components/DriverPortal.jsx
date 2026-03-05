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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import RideCommunication from "./RideCommunication";
import {
  Car, MapPin, Star, History, Home, LogOut, User, Phone, Lock,
  ArrowLeft, ArrowRight, Navigation, Wallet, Loader2, Rocket, Plus, X,
  Zap, TrendingUp, MessageSquare, Target, Crosshair, Send, Banknote,
  CreditCard, ExternalLink, AlertTriangle, Activity, MapPinned,
  CheckCircle2, XCircle, Play, Timer, PauseCircle, Building2, Info,
  Shield, Users, Gift, LifeBuoy, Copy, Share2, ChevronDown, ChevronUp,
  ChevronRight, Bell, Flame, Calendar, Truck, Settings, RefreshCw,
  Award, BarChart3, FileText, Heart, Headphones, AlertCircle,
  CornerUpLeft, CornerUpRight, RotateCcw, Merge, ArrowUp,
} from "lucide-react";

// =============================================================================
// CONSTANTS — synced with server.py
// =============================================================================
const PRICING_RULES = {
  economy:   { name: "Economy",   base: 2.00, perKm: 0.50, perMinWait: 0.50, freeWait: 2,   icon: "🚗" },
  comfort:   { name: "Comfort",   base: 2.50, perKm: 0.55, perMinWait: 0.50, freeWait: 2,   icon: "🚙" },
  suv:       { name: "SUV / XL",  base: 3.90, perKm: 0.80, perMinWait: 0.50, freeWait: 2,   icon: "🚐" },
  personal:  { name: "Personal",  base: 4.00, perKm: 0.70, perMinWait: 0.50, freeWait: 2,   icon: "👤" },
  jumpstart: { name: "Jumpstart", base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, icon: "⚡" },
};

const DRIVER_COMMISSION_RATE = 0.23;
const LOCATION_UPDATE_INTERVAL = 2000;
const WITHDRAWAL_RESERVE = 5.00;
const WITHDRAWAL_FEE = 1.00;

const CANCEL_REASONS = {
  accepted:    ["Heavy Traffic / Stuck", "Car Trouble", "Accidentally Accepted", "Cannot Locate Pickup", "Personal Emergency"],
  arrived:     ["Client Not Showing (Timer Expired)", "Client Refused Ride", "Too Much Luggage", "Unaccompanied Minor", "Safety Concern"],
  in_progress: ["Client Requested Early End", "Client Behavior / Rude", "Safety Concern", "Wrong Destination", "Vehicle Breakdown"],
};

// =============================================================================
// DESIGN TOKENS
// =============================================================================
const C = {
  green:  "#00ff88",
  cyan:   "#00d4ff",
  bg:     "#07070f",
  card:   "#0e0e1c",
  card2:  "#13132a",
  border: "rgba(255,255,255,0.07)",
  muted:  "rgba(255,255,255,0.4)",
};

// =============================================================================
// GOOGLE MAPS SINGLETON LOADER
// =============================================================================
let mapsLoadState = "idle";
const mapsReadyCallbacks = [];

const loadGoogleMaps = (apiKey) => {
  if (mapsLoadState === "loaded" && window.google?.maps) return Promise.resolve();
  if (mapsLoadState === "loaded" && !window.google?.maps) mapsLoadState = "idle";
  if (mapsLoadState === "loading") return new Promise((res, rej) => mapsReadyCallbacks.push({ res, rej }));

  mapsLoadState = "loading";
  return new Promise((res, rej) => {
    mapsReadyCallbacks.push({ res, rej });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=__taksiMapsReady`;
    script.async = true;
    script.defer = true;
    window.__taksiMapsReady = () => {
      mapsLoadState = "loaded";
      mapsReadyCallbacks.forEach(cb => cb.res());
      mapsReadyCallbacks.length = 0;
      delete window.__taksiMapsReady;
    };
    script.onerror = () => {
      mapsLoadState = "error";
      mapsReadyCallbacks.forEach(cb => cb.rej(new Error("Maps failed")));
      mapsReadyCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
};

// =============================================================================
// SHARED UI COMPONENTS
// =============================================================================
const GlassCard = ({ children, className = "", accent = false }) => (
  <div className={`rounded-2xl border ${accent ? "border-[#00ff88]/25 bg-[#00ff88]/5" : "border-white/7 bg-white/3"} backdrop-blur-sm ${className}`}>
    {children}
  </div>
);

const StatPill = ({ label, value, color = "text-white" }) => (
  <div className="bg-white/4 rounded-xl p-3 text-center border border-white/7">
    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{label}</p>
    <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
  </div>
);

const SectionHeader = ({ icon: Icon, title, subtitle, action }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      {Icon && <div className="w-7 h-7 rounded-lg bg-[#00ff88]/15 flex items-center justify-center"><Icon className="w-4 h-4 text-[#00ff88]" /></div>}
      <div>
        <h3 className="text-white font-semibold text-[15px]">{title}</h3>
        {subtitle && <p className="text-white/40 text-xs">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

const BackButton = ({ onClick, label = "Back" }) => (
  <button onClick={onClick} className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-4 transition-colors">
    <ArrowLeft className="w-4 h-4" /> {label}
  </button>
);

const StatusBadge = ({ status }) => {
  const map = {
    pending_vehicle:    ["bg-amber-500/20 text-amber-400 border-amber-500/30",   "Pending Vehicle"],
    pending_review:     ["bg-orange-500/20 text-orange-400 border-orange-500/30","Under Review"],
    approved:           ["bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30",   "Approved"],
    rejected:           ["bg-red-500/20 text-red-400 border-red-500/30",         "Rejected"],
    searching:          ["bg-yellow-500/20 text-yellow-400 border-yellow-500/30","Searching"],
    accepted:           ["bg-blue-500/20 text-blue-400 border-blue-500/30",      "Accepted"],
    arrived:            ["bg-purple-500/20 text-purple-400 border-purple-500/30","Arrived"],
    in_progress:        ["bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30",   "In Progress"],
    completed:          ["bg-emerald-500/20 text-emerald-400 border-emerald-500/30","Completed"],
    cancelled:          ["bg-red-500/20 text-red-400 border-red-500/30",         "Cancelled"],
    escalated:          ["bg-red-500/20 text-red-400 border-red-500/30",         "Escalated"],
    in_progress_ticket: ["bg-blue-500/20 text-blue-400 border-blue-500/30",      "In Progress"],
    resolved:           ["bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30",   "Resolved"],
    closed:             ["bg-white/10 text-white/40 border-white/10",            "Closed"],
    active:             ["bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30",   "Active"],
    pending:            ["bg-amber-500/20 text-amber-400 border-amber-500/30",   "Pending"],
    approved_w:         ["bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30",   "Approved"],
    rejected_w:         ["bg-red-500/20 text-red-400 border-red-500/30",         "Rejected"],
  };
  const [cls, label] = map[status] || ["bg-white/10 text-white/50 border-white/10", status || "Unknown"];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>{label}</span>;
};

// =============================================================================
// DRIVER WAIT TIMER
// =============================================================================

const DriverWaitTimer = ({ arrivedAt, carType, onUpdate }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // ... your existing interval logic ...
    
    // NEW: Calculate and send the data up whenever elapsed changes
    const rules = PRICING_RULES[carType?.toLowerCase()] || PRICING_RULES.economy;
    const freeWaitSec = rules.freeWait * 60;
    
    if (elapsed > freeWaitSec) {
      const overtimeSec = elapsed - freeWaitSec;
      const overtimeMin = overtimeSec / 60;
      // Tell the parent component the current stats
      onUpdate?.({
        minutes: overtimeMin,
        earned: overtimeMin * rules.perMinWait
      });
    }
  }, [elapsed, carType, arrivedAt, onUpdate]);

  const rules = PRICING_RULES[carType?.toLowerCase()] || PRICING_RULES.economy;
  const freeWaitSec = rules.freeWait * 60;

  if (elapsed <= freeWaitSec) {
    const rem = freeWaitSec - elapsed;
    return (
      <div className="col-span-2 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-blue-400">
          <Timer className="w-5 h-5 animate-pulse" />
          <span className="font-medium text-sm">Free Wait</span>
        </div>
        <div className="text-right">
          <div className="text-blue-300 font-mono text-2xl font-bold">
            {String(Math.floor(rem / 60)).padStart(2, "0")}:{String(rem % 60).padStart(2, "0")}
          </div>
          <div className="text-blue-400/50 text-[10px] uppercase tracking-wider">remaining</div>
        </div>
      </div>
    );
  }

  const overtime = elapsed - freeWaitSec;
  const earned = ((overtime / 60) * rules.perMinWait).toFixed(2);
  return (
    <div className="col-span-2 bg-[#00ff88]/10 border border-[#00ff88]/40 rounded-xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-[#00ff88]">
        <Timer className="w-5 h-5 animate-pulse" />
        <span className="font-medium text-sm">Paid Wait</span>
      </div>
      <div className="text-right">
        <div className="text-[#00ff88] font-mono text-2xl font-bold">
          {String(Math.floor(overtime / 60)).padStart(2, "0")}:{String(overtime % 60).padStart(2, "0")}
        </div>
        <div className="text-[#00ff88] font-bold text-sm">+₾{earned}</div>
      </div>
    </div>
  );
};

// =============================================================================
// SURGE INDICATOR
// =============================================================================
const SurgeIndicator = ({ location }) => {
  const [surge, setSurge] = useState(null);
  useEffect(() => {
    const fetch = async () => {
      try {
        const q = location ? `?lat=${location.lat}&lng=${location.lng}` : "";
        const r = await api.get(`/surge/status${q}`);
        setSurge(r.data);
      } catch (_) {}
    };
    fetch();
    const iv = setInterval(fetch, 60000);
    return () => clearInterval(iv);
  }, [location?.lat, location?.lng]);

  if (!surge?.is_surge) return null;
  return (
    <div className="flex items-center gap-1.5 bg-orange-500/15 border border-orange-500/30 rounded-lg px-2.5 py-1">
      <Flame className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
      <span className="text-orange-300 text-xs font-bold">{surge.multiplier}x</span>
    </div>
  );
};

// =============================================================================
// SOS BUTTON
// =============================================================================
const SOSButton = ({ activeRide, location }) => {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const trigger = async () => {
    setLoading(true);
    try {
      await api.post("/sos", {
        ride_id: activeRide?.id || null,
        lat: location?.lat || 0,
        lng: location?.lng || 0,
        message: `Driver SOS — Ride: ${activeRide?.id || "none"}`,
      });
      toast.error("🚨 SOS sent! Support team has been alerted.", { duration: 10000 });
      setConfirm(false);
    } catch (_) {
      toast.error("SOS failed — call emergency services directly");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={() => setConfirm(true)}
        className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/40 rounded-lg px-2.5 py-1 active:bg-red-500/30 transition-colors">
        <Shield className="w-3.5 h-3.5 text-red-400" />
        <span className="text-red-400 text-xs font-bold">SOS</span>
      </button>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="bg-[#0e0e1c] border border-red-500/50 text-white max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2 text-xl">
              <Shield className="w-6 h-6" /> Emergency SOS
            </DialogTitle>
            <DialogDescription className="text-white/60 text-sm">
              This will immediately alert the T'aksi support team with your location. Use only in genuine emergencies.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-2">
            <Button variant="ghost" onClick={() => setConfirm(false)} className="flex-1 border border-white/10 text-white/60 h-12">Cancel</Button>
            <Button onClick={trigger} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold h-12">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "🚨 Send SOS"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// =============================================================================
// RATE PASSENGER MODAL
// =============================================================================
const RatePassengerModal = ({ rideId, riderName, onDone }) => {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/rides/${rideId}/rate-passenger`, { rating, review });
      toast.success("Passenger rated!");
      onDone();
    } catch (_) {
      toast.error("Failed to submit rating");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-white/60 text-sm text-center">How was your ride with <span className="text-white font-medium">{riderName || "this passenger"}</span>?</p>
      <div className="flex justify-center gap-3">
        {[1,2,3,4,5].map(s => (
          <button key={s} onClick={() => setRating(s)}
            className={`w-12 h-12 rounded-xl text-2xl transition-all ${s <= rating ? "bg-[#00ff88]/20 border border-[#00ff88] scale-110" : "bg-white/5 border border-white/10"}`}>
            ⭐
          </button>
        ))}
      </div>
      <Input value={review} onChange={e => setReview(e.target.value)} placeholder="Optional feedback..."
        className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
      <div className="flex gap-3">
        <Button variant="ghost" onClick={onDone} className="flex-1 border border-white/10 text-white/60">Skip</Button>
        <Button onClick={submit} disabled={loading} className="flex-1 bg-[#00ff88] text-black font-bold">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Rating"}
        </Button>
      </div>
    </div>
  );
};

// =============================================================================
// WITHDRAWAL PANEL
// =============================================================================
const WithdrawalPanel = ({ balance, driverId, onSuccess }) => {
  const [amount, setAmount] = useState("");
  const [bankDetails, setBankDetails] = useState("");
  const [bankType, setBankType] = useState("iban");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const maxW = Math.max(0, balance - WITHDRAWAL_RESERVE - WITHDRAWAL_FEE);
  const amt = parseFloat(amount) || 0;
  const isValid = amt >= 1 && amt <= maxW && bankDetails.trim().length >= 5;

  useEffect(() => {
    api.get("/driver/withdrawals/history").then(r => setHistory(r.data.withdrawals || [])).catch(() => {});
  }, []);

  const submit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const r = await api.post("/driver/withdraw", {
        driver_id: driverId, amount: amt,
        bank_details: `[${bankType.toUpperCase()}] ${bankDetails.trim()}`,
      });
      toast.success(r.data.message || `Withdrawal of ₾${amt.toFixed(2)} requested!`);
      setAmount(""); setBankDetails("");
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Withdrawal failed");
    } finally { setLoading(false); }
  };

  const bankLabels = { iban: "IBAN", bog: "Bank of Georgia", tbc: "TBC Bank" };
  const bankPlaceholders = {
    iban: "GE29NB0000000101904917", bog: "GE29BG0000000101904917", tbc: "GE29TB0000000101904917",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <GlassCard accent className="p-4 text-center">
          <p className="text-[#00ff88]/50 text-[10px] uppercase tracking-widest mb-1">Balance</p>
          <p className="text-2xl font-bold font-mono text-[#00ff88]">₾{balance.toFixed(2)}</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1">Max Withdraw</p>
          <p className="text-2xl font-bold font-mono text-white">₾{maxW.toFixed(2)}</p>
          <p className="text-white/30 text-[9px] mt-0.5">₾5 reserve + ₾1 fee</p>
        </GlassCard>
      </div>

      <div className="space-y-1.5">
        <Label className="text-white/60 text-xs uppercase tracking-wider">Amount (GEL)</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff88] font-bold">₾</span>
          <Input type="number" min="1" max={maxW} value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" className="pl-7 bg-white/4 border-white/10 text-white text-lg h-12 font-mono" />
        </div>
        <div className="flex gap-3 text-xs">
          <button onClick={() => setAmount(String(Math.floor(maxW / 2)))} className="text-[#00d4ff] underline">Half</button>
          <button onClick={() => setAmount(String(maxW.toFixed(2)))} className="text-[#00d4ff] underline">Max</button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-white/60 text-xs uppercase tracking-wider">Transfer Method</Label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(bankLabels).map(([k, v]) => (
            <button key={k} onClick={() => setBankType(k)}
              className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${bankType === k ? "bg-[#00ff88]/15 border-[#00ff88]/50 text-[#00ff88]" : "border-white/10 text-white/40 hover:border-white/25"}`}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-white/60 text-xs uppercase tracking-wider">{bankLabels[bankType]} Details</Label>
        <Input value={bankDetails} onChange={e => setBankDetails(e.target.value)} placeholder={bankPlaceholders[bankType]}
          className="bg-white/4 border-white/10 text-white font-mono uppercase placeholder:normal-case placeholder:text-white/20" />
      </div>

      {amt > 0 && (
        <GlassCard className="p-4 space-y-2 text-sm">
          <div className="flex justify-between text-white/70"><span>Requested</span><span className="font-mono">₾{amt.toFixed(2)}</span></div>
          <div className="flex justify-between text-red-400"><span>Processing fee</span><span className="font-mono">−₾{WITHDRAWAL_FEE.toFixed(2)}</span></div>
          <Separator className="bg-white/10" />
          <div className="flex justify-between text-white font-bold"><span>Total deducted</span><span className="font-mono text-red-400">−₾{(amt + WITHDRAWAL_FEE).toFixed(2)}</span></div>
          <div className="flex justify-between">
            <span className="text-white/50">Balance after</span>
            <span className={`font-mono font-bold ${balance - amt - WITHDRAWAL_FEE >= WITHDRAWAL_RESERVE ? "text-[#00ff88]" : "text-red-400"}`}>
              ₾{(balance - amt - WITHDRAWAL_FEE).toFixed(2)}
            </span>
          </div>
        </GlassCard>
      )}

      <div className="flex gap-2 bg-blue-500/8 border border-blue-500/20 rounded-xl p-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-blue-300/80 text-xs leading-relaxed">Processed by admin in 1–2 business days. ₾5 reserve always maintained.</p>
      </div>

      <Button onClick={submit} disabled={!isValid || loading}
        className="w-full h-12 bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold disabled:opacity-30">
        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Banknote className="w-5 h-5 mr-2" />}
        {loading ? "Processing..." : `Withdraw ₾${amt > 0 ? amt.toFixed(2) : "0.00"}`}
      </Button>

      {history.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-white/30 text-[10px] uppercase tracking-widest">Recent</p>
          {history.slice(0, 5).map((w, i) => (
            <div key={i} className="flex justify-between items-center bg-white/3 rounded-xl p-3 border border-white/5">
              <div>
                <p className="text-white font-mono font-bold">₾{w.amount?.toFixed(2)}</p>
                <p className="text-white/30 text-xs">{w.created_at ? new Date(w.created_at).toLocaleDateString() : "—"}</p>
              </div>
              <StatusBadge status={w.status === "approved" ? "approved_w" : w.status === "rejected" ? "rejected_w" : "pending"} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// CAMPAIGNS PANEL
// =============================================================================
const CampaignsPanel = ({ driverRating }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(null);
  const [tab, setTab] = useState("available");

  useEffect(() => {
    api.get("/driver/campaigns").then(r => { setCampaigns(r.data.campaigns || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const joinCampaign = async (id, title) => {
    setJoining(id);
    try {
      await api.post(`/driver/campaigns/${id}/join`);
      toast.success(`Joined "${title}"!`);
      const r = await api.get("/driver/campaigns");
      setCampaigns(r.data.campaigns || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to join");
    } finally { setJoining(null); }
  };

  const available = campaigns.filter(c => !c.joined);
  const joined = campaigns.filter(c => c.joined);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#00ff88]" /></div>;

  return (
    <div className="space-y-4">
      <SectionHeader icon={Award} title="Driver Campaigns" subtitle="Complete challenges, earn bonuses" />

      <div className="flex gap-2">
        {[["available", "Available", available.length], ["joined", "My Progress", joined.length]].map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${tab === k ? "bg-[#00ff88]/15 border-[#00ff88]/40 text-[#00ff88]" : "border-white/10 text-white/40"}`}>
            {l} {n > 0 && <span className="ml-1 bg-[#00ff88]/20 text-[#00ff88] text-xs px-1.5 rounded-full">{n}</span>}
          </button>
        ))}
      </div>

      {tab === "available" && (
        <div className="space-y-3">
          {available.length === 0 && (
            <div className="text-center py-8 text-white/30">
              <Award className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No new campaigns available</p>
            </div>
          )}
          {available.map(c => (
            <GlassCard key={c.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{c.emoji || "🎯"}</span>
                  <div>
                    <p className="text-white font-semibold">{c.title}</p>
                    <p className="text-white/50 text-xs mt-0.5">{c.description}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-[#00ff88] font-bold font-mono">+₾{c.bonus_amount}</p>
                  <p className="text-white/30 text-[10px]">bonus</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-white/40">
                  <Target className="w-3 h-3" />
                  <span>Goal: {c.target_value} {c.campaign_type === "rides_count" ? "rides" : c.campaign_type === "earnings_target" ? "GEL earned" : "tasks"}</span>
                </div>
                {!c.eligible ? (
                  <span className="text-amber-400/70 text-xs">{c.eligibility_reason}</span>
                ) : (
                  <Button size="sm" onClick={() => joinCampaign(c.id, c.title)} disabled={joining === c.id}
                    className="bg-[#00ff88]/15 border border-[#00ff88]/40 text-[#00ff88] hover:bg-[#00ff88]/25 h-8 text-xs">
                    {joining === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Join"}
                  </Button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {tab === "joined" && (
        <div className="space-y-3">
          {joined.length === 0 && (
            <div className="text-center py-8 text-white/30">
              <Target className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>Join campaigns to see your progress</p>
            </div>
          )}
          {joined.map(c => {
            const pct = c.progress?.percentage || 0;
            const done = c.progress?.completed;
            return (
              <GlassCard key={c.id} className={`p-4 ${done ? "border-[#00ff88]/30" : ""}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{c.emoji || "🎯"}</span>
                    <div>
                      <p className="text-white font-semibold">{c.title}</p>
                      <p className="text-white/50 text-xs">{c.progress?.current}/{c.progress?.target} {c.campaign_type === "rides_count" ? "rides" : "completed"}</p>
                    </div>
                  </div>
                  {done ? <StatusBadge status="approved" /> : <p className="text-[#00ff88] font-bold font-mono">+₾{c.bonus_amount}</p>}
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${done ? "bg-[#00ff88]" : "bg-gradient-to-r from-[#00ff88] to-[#00d4ff]"}`}
                      style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>{pct.toFixed(1)}% complete</span>
                    {done && <span className="text-[#00ff88]">✓ Bonus earned!</span>}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// FLEET PANEL
// =============================================================================
const FleetPanel = ({ registrationStatus }) => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ car_make: "", car_model: "", car_year: "", car_color: "", license_plate: "", driver_name: "", driver_phone: "", car_type: "economy" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/driver/fleet").then(r => { setVehicles(r.data.vehicles || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const addVehicle = async () => {
    setSubmitting(true);
    try {
      await api.post("/driver/fleet/add", { ...form, car_year: parseInt(form.car_year), license_plate: form.license_plate.toUpperCase() });
      toast.success("Fleet vehicle added!");
      const r = await api.get("/driver/fleet");
      setVehicles(r.data.vehicles || []);
      setShowAdd(false);
      setForm({ car_make: "", car_model: "", car_year: "", car_color: "", license_plate: "", driver_name: "", driver_phone: "", car_type: "economy" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add vehicle");
    } finally { setSubmitting(false); }
  };

  const removeVehicle = async (id) => {
    try {
      await api.delete(`/driver/fleet/${id}`);
      setVehicles(prev => prev.filter(v => v.id !== id));
      toast.success("Vehicle removed");
    } catch (_) { toast.error("Failed to remove"); }
  };

  if (registrationStatus !== "approved") {
    return (
      <div className="text-center py-12">
        <Truck className="w-12 h-12 text-white/20 mx-auto mb-3" />
        <p className="text-white/40 text-sm">Your account must be approved<br />before managing fleet vehicles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader icon={Truck} title="Fleet Management" subtitle="Manage your vehicles & drivers"
        action={<Button size="sm" onClick={() => setShowAdd(!showAdd)} className={`h-8 text-xs font-bold ${showAdd ? "bg-red-500/20 border border-red-500/40 text-red-400" : "bg-[#00ff88]/15 border border-[#00ff88]/40 text-[#00ff88]"}`}>
          {showAdd ? <><X className="w-3.5 h-3.5 mr-1" /> Cancel</> : <><Plus className="w-3.5 h-3.5 mr-1" /> Add Vehicle</>}
        </Button>}
      />

      {showAdd && (
        <GlassCard className="p-4 space-y-3">
          <p className="text-white/60 text-xs uppercase tracking-wider mb-1">Vehicle Details</p>
          <div className="grid grid-cols-2 gap-2.5">
            {[["car_make","Make","Toyota"],["car_model","Model","Camry"],["car_year","Year","2020"],["car_color","Color","Silver"],["license_plate","Plate","AB-123-CD"],["driver_name","Driver Name","Full Name"],["driver_phone","Driver Phone","+995 555 000 000"]].map(([k,l,p]) => (
              <div key={k} className={`space-y-1 ${k === "driver_name" || k === "driver_phone" ? "col-span-2" : ""}`}>
                <Label className="text-white/40 text-[11px]">{l}</Label>
                <Input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} placeholder={p}
                  className="bg-white/4 border-white/10 text-white h-9 text-sm placeholder:text-white/20" />
              </div>
            ))}
            <div className="col-span-2 space-y-1">
              <Label className="text-white/40 text-[11px]">Vehicle Type</Label>
              <select value={form.car_type} onChange={e => setForm({ ...form, car_type: e.target.value })}
                className="w-full bg-white/4 border border-white/10 text-white rounded-lg h-9 px-3 text-sm">
                {Object.entries(PRICING_RULES).map(([k, v]) => <option key={k} value={k} className="bg-[#0e0e1c]">{v.icon} {v.name}</option>)}
              </select>
            </div>
          </div>
          <Button onClick={addVehicle} disabled={submitting || !form.car_make || !form.license_plate || !form.driver_name}
            className="w-full bg-[#00ff88] text-black font-bold h-10">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Add to Fleet
          </Button>
        </GlassCard>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-[#00ff88]" /></div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-10 text-white/30">
          <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No fleet vehicles yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vehicles.map(v => (
            <GlassCard key={v.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-semibold">{v.car_year} {v.car_make} {v.car_model}</p>
                    <StatusBadge status={v.status || "active"} />
                  </div>
                  <p className="text-white/40 text-sm font-mono">{v.license_plate}</p>
                  <p className="text-white/50 text-xs mt-1.5">🧑 {v.driver_name} · {v.driver_phone}</p>
                </div>
                <button onClick={() => removeVehicle(v.id)} className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// SUPPORT PANEL
// =============================================================================
const SupportPanel = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api.get("/support/history").then(r => { setTickets(r.data.tickets || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post("/support/message", { message: message.trim() });
      toast.success("Support ticket created. We'll respond shortly.");
      setMessage("");
      const r = await api.get("/support/history");
      setTickets(r.data.tickets || []);
    } catch (_) {
      toast.error("Failed to send message");
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader icon={Headphones} title="Support" subtitle="Get help from our team" />

      <GlassCard className="p-4 space-y-3">
        <Label className="text-white/60 text-xs uppercase tracking-wider">New Message</Label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
          placeholder="Describe your issue..."
          className="w-full bg-white/4 border border-white/10 rounded-xl p-3 text-white text-sm resize-none placeholder:text-white/20 focus:outline-none focus:border-[#00ff88]/40" />
        <Button onClick={send} disabled={!message.trim() || sending}
          className="w-full bg-[#00ff88] text-black font-bold h-10">
          {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
          {sending ? "Sending..." : "Send Message"}
        </Button>
      </GlassCard>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-[#00ff88]" /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-8 text-white/30">
          <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>No tickets yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-white/30 text-[10px] uppercase tracking-widest">Previous Tickets</p>
          {tickets.map(t => (
            <GlassCard key={t.id} className="overflow-hidden">
              <button className="w-full p-4 flex items-center justify-between text-left" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                <div>
                  <p className="text-white text-sm line-clamp-1 font-medium">{t.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={t.status === "in_progress" ? "in_progress_ticket" : t.status} />
                    <span className="text-white/30 text-[10px]">{t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}</span>
                  </div>
                </div>
                {expandedId === t.id ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />}
              </button>
              {expandedId === t.id && (
                <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3">
                  {(t.chat_history || []).map((msg, i) => (
                    <div key={i} className={`rounded-xl p-3 text-sm ${msg.role === "user" ? "bg-[#00ff88]/8 border border-[#00ff88]/15 ml-4" : "bg-white/4 border border-white/8 mr-4"}`}>
                      <p className={`text-[10px] uppercase tracking-wider mb-1 ${msg.role === "user" ? "text-[#00ff88]/60" : msg.role === "admin" ? "text-blue-400/70" : "text-white/40"}`}>
                        {msg.role === "user" ? "You" : msg.role === "admin" ? "Support Agent" : "System"}
                      </p>
                      <p className="text-white/80">{msg.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// REFERRAL PANEL
// =============================================================================
const ReferralPanel = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api.get("/user/referral").then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const copyCode = () => {
    navigator.clipboard.writeText(data.referral_code);
    toast.success("Code copied!");
  };

  const applyCode = async () => {
    if (!code.trim()) return;
    setApplying(true);
    try {
      const r = await api.post("/user/referral/apply", { code: code.trim().toUpperCase() });
      toast.success(r.data.message || "Referral code applied!");
      setCode("");
      const r2 = await api.get("/user/referral");
      setData(r2.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid code");
    } finally { setApplying(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#00ff88]" /></div>;

  return (
    <div className="space-y-4">
      <SectionHeader icon={Gift} title="Referrals" subtitle="Invite drivers, earn bonuses" />

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatPill label="Referrals" value={data.referrals_count || 0} color="text-white" />
            <StatPill label="Bonus Earned" value={`₾${(data.bonus_earned || 0).toFixed(2)}`} color="text-[#00ff88]" />
          </div>

          <GlassCard accent className="p-4 space-y-3">
            <p className="text-[#00ff88]/60 text-[10px] uppercase tracking-widest">Your Code</p>
            <div className="flex items-center gap-3">
              <p className="text-3xl font-bold font-mono tracking-widest text-white flex-1">{data.referral_code}</p>
              <button onClick={copyCode} className="p-2.5 rounded-xl bg-[#00ff88]/15 border border-[#00ff88]/30 text-[#00ff88] hover:bg-[#00ff88]/25 transition-colors">
                <Copy className="w-4 h-4" />
              </button>
              <button onClick={() => navigator.share?.({ title: "Join T'aksi", url: data.referral_link || `https://taksi.ge/ref/${data.referral_code}` })}
                className="p-2.5 rounded-xl bg-[#00d4ff]/15 border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/25 transition-colors">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </GlassCard>

          <GlassCard className="p-4 space-y-3">
            <p className="text-white/60 text-[10px] uppercase tracking-widest">Apply a Code</p>
            <div className="flex gap-2">
              <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ENTER CODE"
                className="bg-white/4 border-white/10 text-white font-mono uppercase placeholder:normal-case placeholder:text-white/20 flex-1" />
              <Button onClick={applyCode} disabled={!code.trim() || applying} className="bg-[#00ff88] text-black font-bold px-5">
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <p className="text-white/60 text-xs uppercase tracking-wider mb-3">How it works</p>
            {[["Invite a friend", "Share your code with another driver"], ["They sign up", "Friend registers with your code"], ["Both earn bonus", "₾5 for them + ₾10 for you"]].map(([t,d],i) => (
              <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
                <div className="w-6 h-6 rounded-full bg-[#00ff88]/15 border border-[#00ff88]/30 flex items-center justify-center text-[#00ff88] text-xs font-bold shrink-0">{i+1}</div>
                <div><p className="text-white text-sm font-medium">{t}</p><p className="text-white/40 text-xs">{d}</p></div>
              </div>
            ))}
          </GlassCard>
        </>
      )}
    </div>
  );
};

// =============================================================================
// MORE PANEL
// =============================================================================
const MorePanel = ({ registrationStatus, driverRating, activeRide, driverLocation }) => {
  const [view, setView] = useState("menu");

  const menuItems = [
    { id: "campaigns", label: "Campaigns",  icon: Award,      desc: "Challenges & bonuses",  color: "text-yellow-400",  bg: "bg-yellow-400/10", border: "border-yellow-400/20" },
    { id: "fleet",     label: "Fleet",      icon: Truck,      desc: "Manage your vehicles",  color: "text-blue-400",    bg: "bg-blue-400/10",   border: "border-blue-400/20" },
    { id: "referrals", label: "Referrals",  icon: Gift,       desc: "Invite & earn",         color: "text-purple-400",  bg: "bg-purple-400/10", border: "border-purple-400/20" },
    { id: "support",   label: "Support",    icon: Headphones, desc: "Get help",              color: "text-[#00d4ff]",   bg: "bg-[#00d4ff]/10",  border: "border-[#00d4ff]/20" },
  ];

  if (view !== "menu") {
    const back = () => setView("menu");
    if (view === "campaigns") return <div><BackButton onClick={back} /><CampaignsPanel driverRating={driverRating} /></div>;
    if (view === "fleet")     return <div><BackButton onClick={back} /><FleetPanel registrationStatus={registrationStatus} /></div>;
    if (view === "referrals") return <div><BackButton onClick={back} /><ReferralPanel /></div>;
    if (view === "support")   return <div><BackButton onClick={back} /><SupportPanel /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {menuItems.map(({ id, label, icon: Icon, desc, color, bg, border }) => (
          <button key={id} onClick={() => setView(id)}
            className={`${bg} border ${border} rounded-2xl p-4 text-left transition-all active:scale-95`}>
            <Icon className={`w-6 h-6 ${color} mb-2`} />
            <p className="text-white font-semibold text-sm">{label}</p>
            <p className="text-white/40 text-xs mt-0.5">{desc}</p>
            <ChevronRight className={`w-4 h-4 ${color} mt-2`} />
          </button>
        ))}
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Emergency SOS</p>
              <p className="text-white/40 text-xs">Alert support instantly</p>
            </div>
          </div>
          <SOSButton activeRide={activeRide} location={driverLocation} />
        </div>
      </GlassCard>
    </div>
  );
};

// =============================================================================
// LOCATION TRACKER HOOK
// =============================================================================
const useLocationTracker = (isOnline, onLocationUpdate) => {
  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const lastLocationRef = useRef(null);
  const callbackRef = useRef(onLocationUpdate);
  useEffect(() => { callbackRef.current = onLocationUpdate; }, [onLocationUpdate]);

  useEffect(() => {
    if (!isOnline) {
      if (watchIdRef.current != null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      if (intervalRef.current != null) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => { lastLocationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading, speed: pos.coords.speed }; },
      err => console.error("GPS error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    intervalRef.current = setInterval(() => {
      if (lastLocationRef.current) callbackRef.current(lastLocationRef.current);
    }, LOCATION_UPDATE_INTERVAL);
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
  }, [isOnline]);

  return lastLocationRef;
};

// =============================================================================
// NAV HUD HELPERS (for DriverSmartMap)
// =============================================================================
const stripHtml = (html) => (html || "").replace(/<[^>]*>/g, "");

const getManeuverInfo = (maneuver = "", instruction = "") => {
  const m = (maneuver + " " + instruction).toLowerCase();
  if (m.includes("sharp-left") || m.includes("uturn-left"))
    return { Icon: RotateCcw, color: "#f97316", flip: false };
  if (m.includes("sharp-right") || m.includes("uturn-right"))
    return { Icon: RotateCcw, color: "#f97316", flip: true };
  if (m.includes("turn-left") || (m.includes("left") && !m.includes("right")))
    return { Icon: CornerUpLeft, color: "#60a5fa", flip: false };
  if (m.includes("turn-right") || m.includes("right"))
    return { Icon: CornerUpRight, color: "#60a5fa", flip: false };
  if (m.includes("merge") || m.includes("ramp"))
    return { Icon: Merge, color: "#a78bfa", flip: false };
  if (m.includes("roundabout"))
    return { Icon: RotateCcw, color: "#facc15", flip: false };
  if (m.includes("destination") || m.includes("arrive"))
    return { Icon: MapPinned, color: "#00ff88", flip: false };
  return { Icon: ArrowUp, color: "#00ff88", flip: false };
};

const lerpAngle = (from, to, t) => {
  const diff = ((to - from + 540) % 360) - 180;
  return (from + diff * t + 360) % 360;
};

const LaneIndicator = ({ lanes }) => {
  if (!lanes?.length) return null;
  return (
    <div className="flex items-center justify-center gap-1 mt-2 pb-1">
      {lanes.map((lane, i) => {
        const active = lane.indications?.some((ind) =>
          ["straight", "slight left", "slight right", "left", "right"].includes(ind)
        );
        const ind = lane.indications?.[0];
        return (
          <div key={i} className={`flex flex-col items-center justify-center w-8 h-8 rounded-lg transition-all ${active ? "bg-[#00ff88]/25 border border-[#00ff88]/60" : "bg-white/8 border border-white/15 opacity-40"}`}>
            <ArrowUp className={`w-4 h-4 ${active ? "text-[#00ff88]" : "text-white/50"}`}
              style={{ transform: ind === "left" ? "rotate(-45deg)" : ind === "right" ? "rotate(45deg)" : "none" }} />
          </div>
        );
      })}
    </div>
  );
};

const NavHUD = ({ step, nextStep, speed }) => {
  if (!step) return null;
  const { Icon, color, flip } = getManeuverInfo(step.maneuver || "", step.instructions || "");
  const nextInfo = nextStep ? getManeuverInfo(nextStep.maneuver || "", nextStep.instructions || "") : null;
  return (
    <div className="absolute top-[72px] left-3 right-3 z-30" style={{ pointerEvents: "none" }}>
      <div className="rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "rgba(7,7,15,0.93)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)" }}>
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${color}18`, border: `2px solid ${color}50` }}>
            <Icon className="w-9 h-9" style={{ color, transform: flip ? "scaleX(-1)" : "none" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black leading-none tracking-tight" style={{ color, fontSize: "2rem", fontVariantNumeric: "tabular-nums" }}>
              {step.distance?.text || ""}
            </p>
            <p className="text-white text-sm font-semibold mt-1 leading-tight line-clamp-2">
              {stripHtml(step.instructions)}
            </p>
          </div>
        </div>
        {step.lane_restrictions?.length > 0 && <div className="px-4"><LaneIndicator lanes={step.lane_restrictions} /></div>}
        {nextStep && nextInfo && (
          <div className="flex items-center gap-2 px-4 py-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
            <span className="text-white/35 text-xs uppercase tracking-widest shrink-0">Then</span>
            <nextInfo.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: nextInfo.color }} />
            <span className="text-white/60 text-xs truncate">{stripHtml(nextStep.instructions)}</span>
            <span className="text-white/35 text-xs ml-auto shrink-0">{nextStep.distance?.text}</span>
          </div>
        )}
      </div>
      {speed != null && (
        <div className="absolute right-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl shadow-lg"
          style={{ top: "calc(100% + 8px)", background: "rgba(7,7,15,0.9)", border: "1.5px solid rgba(255,255,255,0.12)", backdropFilter: "blur(16px)" }}>
          <span className="text-white font-black text-lg leading-none">{Math.round(speed * 3.6)}</span>
          <span className="text-white/35 text-[9px] uppercase tracking-wider">km/h</span>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// MAP STYLES
// =============================================================================
const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
];

// =============================================================================
// DRIVER SMART MAP
// =============================================================================
const DriverSmartMap = ({ activeRide, driverLocation }) => {
  const mapRef               = useRef(null);
  const mapInstanceRef       = useRef(null);
  const markerRef            = useRef(null);
  const pickupMarkerRef      = useRef(null);
  const destMarkerRef        = useRef(null);
  const routeRendererRef     = useRef(null);
  const directionsServiceRef = useRef(null);
  const headingRef           = useRef(0);
  const rafRef               = useRef(null);
  const etaIntervalRef       = useRef(null);
  const prevRideIdRef        = useRef(null);
  // Rerouting: track last route-request origin to detect deviation
  const lastRouteOriginRef   = useRef(null);
  const rerouteTimerRef      = useRef(null);

  const [isFollowing, setIsFollowing] = useState(true);
  const [routeSteps,  setRouteSteps]  = useState([]);
  const [stepIdx,     setStepIdx]     = useState(0);
  const [speed,       setSpeed]       = useState(null);
  const [etaSeconds,  setEtaSeconds]  = useState(null);

  const getSafe = (v) => { const n = parseFloat(v); return !isNaN(n) && n !== 0 ? n : null; };
  const hvKm = (lat1, lo1, lat2, lo2) => {
    const R = 6371, dL = (lat2-lat1)*Math.PI/180, dl = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const fmtEta = (secs) => {
    if (!secs || secs <= 0) return null;
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // SVG pin helpers
  const makePickupIcon = () => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#00ff88"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>')}`,
    scaledSize: new window.google.maps.Size(28, 37),
    anchor: new window.google.maps.Point(14, 37),
  });

  const makeDestIcon = () => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#ff4444"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>')}`,
    scaledSize: new window.google.maps.Size(28, 37),
    anchor: new window.google.maps.Point(14, 37),
  });

  const upsertPin = (ref, position, icon) => {
    if (!mapInstanceRef.current || !position) return;
    if (!ref.current) {
      ref.current = new window.google.maps.Marker({ position, map: mapInstanceRef.current, icon, zIndex: 900 });
    } else {
      ref.current.setPosition(position);
      ref.current.setIcon(icon);
      ref.current.setMap(mapInstanceRef.current);
    }
  };
  const removePin = (ref) => { if (ref.current) { ref.current.setMap(null); ref.current = null; } };

  const startEtaCountdown = (durationSecs) => {
    if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
    let remaining = durationSecs;
    setEtaSeconds(remaining);
    etaIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(etaIntervalRef.current); setEtaSeconds(0); }
      else setEtaSeconds(remaining);
    }, 1000);
  };

  useEffect(() => () => { if (etaIntervalRef.current) clearInterval(etaIntervalRef.current); }, []);

  const animateHeading = useCallback((targetHeading) => {
    if (!mapInstanceRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const current = headingRef.current;
      const next = lerpAngle(current, targetHeading, 0.12);
      headingRef.current = next;
      mapInstanceRef.current.setHeading(next);
      if (Math.abs(((next - targetHeading + 540) % 360) - 180) > 0.5) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Map init
  useEffect(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 },
      zoom: 17,
      tilt: 45,
      heading: 0,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      backgroundColor: "#07070f",
      styles: MAP_STYLES,
      padding: { bottom: 200, left: 0, right: 0, top: 0 },
    });
    routeRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,   // We draw our own pins
      preserveViewport: true,
      polylineOptions: {
        strokeColor: "#00ff88",
        strokeWeight: 7,
        strokeOpacity: 0.8,
        strokeLineCap: "round",
        strokeLineJoin: "round",
      },
    });
    directionsServiceRef.current = new window.google.maps.DirectionsService();
    // dragstart → stop following so re-centre button appears
    map.addListener("dragstart", () => setIsFollowing(false));
    mapInstanceRef.current = map;
  }, []);

  // Driver position update — heading rotation, step advance
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation) return;
    const lat = getSafe(driverLocation.lat), lng = getSafe(driverLocation.lng);
    if (!lat || !lng) return;
    const pos = { lat, lng };
    const heading = parseFloat(driverLocation.heading) || 0;
    setSpeed(driverLocation.speed ?? null);

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        position: pos, map: mapInstanceRef.current, zIndex: 1000,
        icon: {
          path: "M-2,0 L0,-5 L2,0 L0,-1.5 Z",
          scale: 8, fillColor: "#00ff88", fillOpacity: 1,
          strokeColor: "#ffffff", strokeWeight: 2,
          rotation: 0, anchor: new window.google.maps.Point(0, -2.5),
        },
      });
    } else {
      markerRef.current.setPosition(pos);
      const icon = markerRef.current.getIcon();
      markerRef.current.setIcon({ ...icon, rotation: 0 });
    }

    if (isFollowing) {
      mapInstanceRef.current.panTo(pos);
      animateHeading(heading);
      if (mapInstanceRef.current.getTilt() !== 45) mapInstanceRef.current.setTilt(45);
    }

    if (routeSteps.length > 0 && stepIdx < routeSteps.length) {
      const step = routeSteps[stepIdx];
      if (step.end_location && hvKm(lat, lng, step.end_location.lat(), step.end_location.lng()) < 0.04) {
        setStepIdx(p => p + 1);
      }
    }
  }, [driverLocation, isFollowing, routeSteps, stepIdx, animateHeading]);

  // Auto-fit on new ride accept — zoom to show driver + pickup
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    if (!activeRide || activeRide.status !== "accepted") return;
    const rideKey = activeRide.id || activeRide.pickup_lat;
    if (prevRideIdRef.current === rideKey) return;
    prevRideIdRef.current = rideKey;

    const dLat = getSafe(driverLocation?.lat), dLng = getSafe(driverLocation?.lng);
    const pLat = getSafe(activeRide.pickup_lat),  pLng = getSafe(activeRide.pickup_lng);
    if (!dLat || !pLat) return;

    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: dLat, lng: dLng });
    bounds.extend({ lat: pLat, lng: pLng });
    mapInstanceRef.current.fitBounds(bounds, { top: 120, bottom: 240, left: 60, right: 60 });
    // Resume following after 3s
    setTimeout(() => setIsFollowing(true), 3000);
  }, [activeRide?.status, activeRide?.id]);

  // Core route-request function — shared by initial route + reroute
  const requestRoute = useCallback((dLat, dLng, target) => {
    if (!directionsServiceRef.current || !routeRendererRef.current) return;
    lastRouteOriginRef.current = { lat: dLat, lng: dLng };
    directionsServiceRef.current.route(
      { origin: { lat: dLat, lng: dLng }, destination: target, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (status === "OK" && routeRendererRef.current) {
          routeRendererRef.current.setDirections(result);
          setRouteSteps(result.routes[0].legs[0].steps);
          setStepIdx(0);
          const duration = result.routes[0]?.legs[0]?.duration?.value;
          if (duration) startEtaCountdown(duration);
        }
      }
    );
  }, []);

  // Directions + ETA + pins — fires on status/coord change
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !directionsServiceRef.current) return;
    if (!activeRide || !driverLocation) {
      routeRendererRef.current?.setDirections({ routes: [] });
      setRouteSteps([]);
      setEtaSeconds(null);
      removePin(pickupMarkerRef);
      removePin(destMarkerRef);
      lastRouteOriginRef.current = null;
      return;
    }

    const dLat = getSafe(driverLocation?.lat), dLng = getSafe(driverLocation?.lng);
    if (!dLat || !dLng) return;

    let target = null;
    if (["accepted", "arrived"].includes(activeRide.status)) {
      const lat = getSafe(activeRide.pickup_lat), lng = getSafe(activeRide.pickup_lng);
      if (lat && lng) {
        target = { lat, lng };
        upsertPin(pickupMarkerRef, target, makePickupIcon());
        removePin(destMarkerRef);
      }
    } else if (activeRide.status === "in_progress") {
      const lat = getSafe(activeRide.dest_lat || activeRide.destination_lat);
      const lng = getSafe(activeRide.dest_lng || activeRide.destination_lng);
      if (lat && lng) {
        target = { lat, lng };
        upsertPin(destMarkerRef, target, makeDestIcon());
        removePin(pickupMarkerRef);
      }
    }

    if (!target) return;
    requestRoute(dLat, dLng, target);
  }, [activeRide?.status, activeRide?.pickup_lat, activeRide?.dest_lat, activeRide?.destination_lat, requestRoute]);

  // Auto-reroute when driver deviates >120m during active ride (checks every 15s)
  useEffect(() => {
    if (rerouteTimerRef.current) clearInterval(rerouteTimerRef.current);
    if (!activeRide || !["accepted", "arrived", "in_progress"].includes(activeRide.status)) return;

    rerouteTimerRef.current = setInterval(() => {
      if (!mapInstanceRef.current || !window.google || !directionsServiceRef.current) return;
      const dLat = getSafe(driverLocation?.lat), dLng = getSafe(driverLocation?.lng);
      if (!dLat || !dLng) return;

      const lastOrigin = lastRouteOriginRef.current;
      // Only reroute if driver has moved at least 120m from where the last route was calculated
      if (lastOrigin && hvKm(dLat, dLng, lastOrigin.lat, lastOrigin.lng) < 0.12) return;

      let target = null;
      if (["accepted", "arrived"].includes(activeRide.status)) {
        const lat = getSafe(activeRide.pickup_lat), lng = getSafe(activeRide.pickup_lng);
        if (lat && lng) target = { lat, lng };
      } else if (activeRide.status === "in_progress") {
        const lat = getSafe(activeRide.dest_lat || activeRide.destination_lat);
        const lng = getSafe(activeRide.dest_lng || activeRide.destination_lng);
        if (lat && lng) target = { lat, lng };
      }

      if (target) requestRoute(dLat, dLng, target);
    }, 15000);

    return () => { if (rerouteTimerRef.current) clearInterval(rerouteTimerRef.current); };
  }, [activeRide?.status, activeRide?.id, driverLocation, requestRoute]);

  const handleNav = (app) => {
    if (!activeRide) return;
    const isPickup = ["accepted", "arrived"].includes(activeRide.status);
    const destLat = isPickup ? activeRide.pickup_lat : (activeRide.dest_lat || activeRide.destination_lat);
    const destLng = isPickup ? activeRide.pickup_lng : (activeRide.dest_lng || activeRide.destination_lng);
    if (!destLat || !destLng) return toast.error("No coordinates available");
    const url = app === "waze"
      ? `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`
      : `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const curStep  = routeSteps[stepIdx];
  const nextStep = routeSteps[stepIdx + 1];
  const etaLabel = ["accepted","arrived"].includes(activeRide?.status) ? "to pickup" : "to destination";

  return (
    <div className="fixed inset-0 w-full h-full z-0">
      <div ref={mapRef} className="w-full h-full" />

      {/* Turn-by-turn HUD */}
      {activeRide && <NavHUD step={curStep} nextStep={nextStep} speed={speed} />}

      {/* ETA countdown pill */}
      {activeRide && etaSeconds != null && etaSeconds > 0 && (
        <div className="absolute z-20 pointer-events-none" style={{ top: 72 + 88 + 16, left: "50%", transform: "translateX(-50%)" }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full shadow-xl"
            style={{ background: "rgba(7,7,15,0.92)", border: "1px solid rgba(0,212,255,0.35)", backdropFilter: "blur(16px)" }}>
            <Timer className="w-3.5 h-3.5 text-[#00d4ff]" />
            <span className="text-[#00d4ff] font-bold text-sm font-mono">{fmtEta(etaSeconds)}</span>
            <span className="text-white/35 text-xs">{etaLabel}</span>
          </div>
        </div>
      )}

      {/* Re-centre button */}
      {!isFollowing && driverLocation && (
        <button onClick={() => {
            setIsFollowing(true);
            const lat = parseFloat(driverLocation.lat), lng = parseFloat(driverLocation.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
              mapInstanceRef.current?.panTo({ lat, lng });
              mapInstanceRef.current?.setTilt(45);
              headingRef.current = parseFloat(driverLocation.heading) || headingRef.current;
            }
          }}
          className="absolute z-20 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl transition-all active:scale-95"
          style={{ bottom: "calc(72vh + 16px)", left: "50%", transform: "translateX(-50%)", background: "rgba(0,204,119,0.95)" }}>
          <Crosshair className="w-4 h-4 text-white animate-pulse" />
          <span className="text-white text-sm font-bold">Re-centre</span>
        </button>
      )}

      {/* Controls column: zoom, north, waze, google */}
      <div className="absolute flex flex-col gap-2 z-10" style={{ right: 16, top: "50%", transform: "translateY(-50%)" }}>
        <button onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom()||15)+1)}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-800 text-xl font-bold shadow-lg active:scale-95 transition-transform"
          style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}>+</button>
        <button onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom()||15)-1)}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-gray-800 text-xl font-bold shadow-lg active:scale-95 transition-transform"
          style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}>−</button>
        <button onClick={() => { mapInstanceRef.current?.setHeading(0); headingRef.current = 0; }}
          className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }} title="Reset north">
          <Navigation className="w-4 h-4 text-gray-700" />
        </button>
        {activeRide && <div style={{ height: 1, background: "rgba(200,200,200,0.4)", margin: "2px 4px" }} />}
        {activeRide && (
          <button onClick={() => handleNav("waze")}
            className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            style={{ background: "rgba(0,212,255,0.9)", backdropFilter: "blur(8px)" }} title="Open in Waze">
            <Zap className="w-5 h-5 text-white" />
          </button>
        )}
        {activeRide && (
          <button onClick={() => handleNav("google")}
            className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            style={{ background: "rgba(0,204,119,0.9)", backdropFilter: "blur(8px)" }} title="Open in Google Maps">
            <MapPinned className="w-5 h-5 text-white" />
          </button>
        )}
      </div>
    </div>
  );
};



// =============================================================================
// ADD-STOP INPUT — lightweight autocomplete for mid-trip stop addition
// =============================================================================
const AddStopInput = ({ value, onChange, mapsLoaded }) => {
  const inputRef = useRef(null);
  const acRef    = useRef(null);
  useEffect(() => {
    if (!mapsLoaded || !inputRef.current || acRef.current) return;
    if (!window.google?.maps?.places) return;
    acRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "ge" },
      fields: ["formatted_address", "geometry", "name"],
    });
    acRef.current.addListener("place_changed", () => {
      const place = acRef.current.getPlace();
      if (place?.geometry) {
        onChange({
          address: place.formatted_address || place.name || "",
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
        if (inputRef.current) inputRef.current.blur();
      }
    });
  }, [mapsLoaded]);
  return (
    <div className="relative flex items-center">
      <MapPin className="absolute left-3 h-4 w-4 text-[#00d4ff] pointer-events-none z-10" />
      <input
        ref={inputRef}
        value={value?.address || ""}
        onChange={e => onChange({ ...value, address: e.target.value })}
        placeholder="Search stop address…"
        autoComplete="off"
        className="w-full pl-9 pr-3 h-11 bg-white/5 border border-white/10 text-white text-sm rounded-xl placeholder:text-white/25 outline-none focus:border-[#00d4ff]/40"
      />
    </div>
  );
};

// =============================================================================
// DRIVER AUTH
// =============================================================================
const DriverAuth = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", surname: "", cellphone: "", password: "" });

  // OTP state
  const [otpStep, setOtpStep]       = useState("form"); // "form" | "otp" | "done"
  const [otpCode, setOtpCode]       = useState("");
  const [phoneToken, setPhoneToken] = useState(null);

  const handleSendOtp = async () => {
    if (!form.cellphone) return toast.error("Enter your phone number first");
    setLoading(true);
    try {
      await api.post("/auth/otp/send", { cellphone: form.cellphone });
      toast.success("Verification code sent!");
      setOtpStep("otp");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send code");
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const res = await api.post("/auth/otp/verify", { cellphone: form.cellphone, code: otpCode });
      setPhoneToken(res.data.phone_token);
      setOtpStep("done");
      toast.success("Phone verified ✓");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Incorrect code");
    } finally { setLoading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const r = await api.post("/auth/login", form);
        if (r.data?.token && r.data?.user) {
          login(r.data.token, r.data.user);
          toast.success(t("welcome_back"));
          navigate("/driver/dashboard");
        }
      } else {
        if (!phoneToken) return toast.error("Please verify your phone number first");
        const r = await api.post("/auth/register/driver", form, {
          headers: { "X-Phone-Verified": phoneToken },
        });
        if (r.data?.token && r.data?.user) {
          login(r.data.token, r.data.user);
          toast.success(t("success"));
          navigate("/driver/dashboard");
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || t("error"));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#07070f" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="absolute top-4 right-4"><LanguageSelector variant="ghost" /></div>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-8 mx-auto transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#00ff88] to-[#00d4ff] flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(0,255,136,0.3)]">
            <Car className="w-10 h-10 text-black" />
          </div>
          <h1 className="text-3xl font-bold text-white">{isLogin ? "Sign In" : "Register"}</h1>
          <p className="text-white/40 text-sm mt-1">{isLogin ? "Welcome back, pilot" : "Join the T'aksi fleet"}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {!isLogin && (
            <div className="grid grid-cols-2 gap-3">
              {[["name","First Name"],["surname","Last Name"]].map(([k,l]) => (
                <div key={k} className="space-y-1.5">
                  <Label className="text-white/50 text-xs">{l}</Label>
                  <Input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                    className="bg-white/5 border-white/10 text-white h-11 placeholder:text-white/20" required />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-white/50 text-xs">Phone Number</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <Input type="tel" value={form.cellphone}
                  onChange={e => { setForm({ ...form, cellphone: e.target.value }); setOtpStep("form"); setPhoneToken(null); }}
                  placeholder="+995 555 000 000"
                  className="pl-9 bg-white/5 border-white/10 text-white h-11 placeholder:text-white/20"
                  required disabled={otpStep === "otp" || otpStep === "done"} />
              </div>
              {!isLogin && otpStep === "form" && (
                <Button type="button" onClick={handleSendOtp} disabled={loading || !form.cellphone}
                  className="h-11 px-3 bg-white/10 text-white text-xs rounded-xl border border-white/10 hover:bg-white/15">
                  Verify
                </Button>
              )}
              {!isLogin && otpStep === "done" && (
                <div className="h-11 px-3 flex items-center text-[#00ff88] text-xs font-bold">✓ Verified</div>
              )}
            </div>
          </div>

          {/* OTP confirmation step */}
          {!isLogin && otpStep === "otp" && (
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs">Enter 4-digit code</Label>
              <div className="flex gap-2">
                <Input value={otpCode} onChange={e => setOtpCode(e.target.value)} maxLength={4}
                  placeholder="0000"
                  className="bg-white/5 border-white/10 text-white h-11 text-center text-lg tracking-widest flex-1" />
                <Button type="button" onClick={handleVerifyOtp} disabled={loading || otpCode.length < 4}
                  className="h-11 px-4 bg-[#00d4ff] text-black font-bold rounded-xl text-sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
              <button type="button" onClick={handleSendOtp} className="text-white/30 text-xs hover:text-white/60">
                Resend code
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-white/50 text-xs">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                className="pl-9 bg-white/5 border-white/10 text-white h-11" required />
            </div>
          </div>
          <Button type="submit" disabled={loading || (!isLogin ? otpStep !== "done" : false)}
            className="w-full h-12 bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold text-base mt-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {isLogin ? "Sign In" : "Create Account"}
          </Button>
        </form>

        <button onClick={() => setIsLogin(!isLogin)} className="w-full text-center text-white/40 hover:text-white text-sm mt-4 transition-colors">
          {isLogin ? "Don't have an account? Register" : "Already have an account? Sign In"}
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// DRIVER DASHBOARD
// =============================================================================
const DriverDashboard = () => {
  // Inside your main Driver Dashboard / Portal component
const [totalWaitData, setTotalWaitData] = useState({ minutes: 0, earned: 0 });
const [totalStopMinutes, setTotalStopMinutes] = useState(0);
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const handleStopFinished = (minutes) => {
  setTotalStopMinutes(prev => prev + minutes);
};

  const [activeTab, setActiveTab] = useState("rides");
  const [loading, setLoading] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(() => !!window.google?.maps);
  const [isMinimized, setIsMinimized] = useState(false);
  const touchStartY = useRef(null);

  const [isOnline, setIsOnline] = useState(user?.is_online || false);
  const [driverLocation, setDriverLocation] = useState(null);

  const [availableRides, setAvailableRides] = useState([]);
  const [nearbyRides, setNearbyRides] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [completedRide, setCompletedRide] = useState(null);

  const [rideStartTime, setRideStartTime] = useState(null);
  const [arrivedTime, setArrivedTime] = useState(null);
  const [waitTimer, setWaitTimer] = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const [isWaitingAtStop, setIsWaitingAtStop] = useState(false);
  // Mid-trip wait timer state
  const [midTripWaiting,    setMidTripWaiting]    = useState(false);
  const [midTripWaitStart,  setMidTripWaitStart]  = useState(null);   // Date.ms
  const [midTripWaitSecs,   setMidTripWaitSecs]   = useState(0);      // live elapsed seconds
  const [midTripWaitBanked, setMidTripWaitBanked] = useState(0);      // confirmed minutes banked
  const [liveFare,          setLiveFare]          = useState(null);   // live fare incl. wait fee
  // Add-stop mid-trip
  const [showAddStop,    setShowAddStop]    = useState(false);
  const [newStopAddress, setNewStopAddress] = useState({ address: "", lat: null, lng: null });
  const lastPositionRef = useRef(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [showRateModal, setShowRateModal] = useState(false);
  const [rateRideId, setRateRideId] = useState(null);
  const [rateRiderName, setRateRiderName] = useState("");

  const [vehicleData, setVehicleData] = useState({
    car_make:"", car_model:"", car_year:"", car_color:"", license_plate:"",
    license_front:null, license_back:null, reg_front:null, reg_back:null,
    car_photo_front:null, car_photo_back:null, car_photo_left:null, car_photo_right:null,
  });

  const [earningsTab, setEarningsTab] = useState("overview");
  const [topupAmount, setTopupAmount] = useState("");

  const balance = user?.earnings?.balance ?? user?.wallet_balance ?? 0;
  const totalEarned = user?.earnings?.total_earned ?? 0;
  const totalWithdrawn = user?.earnings?.total_withdrawn ?? 0;
  const commissionPaid = user?.earnings?.total_commission_paid ?? 0;
  const registrationStatus = user?.registration_status?.toLowerCase();
  const hasVehicle = !!(user?.driver_info?.vehicle);

  // ===========================================================================
  // FIX: Maps — use singleton loader, not a nested useEffect
  // ===========================================================================
  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return; }
    loadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
      .then(() => setMapsLoaded(true))
      .catch(() => toast.error("Failed to load Google Maps"));
  }, []);

  useEffect(() => { setIsMinimized(false); }, [activeRide?.status]);

  const handleTouchStart = e => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = e => {
    if (touchStartY.current == null) return;
    const d = e.changedTouches[0].clientY - touchStartY.current;
    if (d > 40) setIsMinimized(true);
    else if (d < -40) setIsMinimized(false);
    touchStartY.current = null;
  };

  const hvKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371, dL = (lat2-lat1)*Math.PI/180, dl = (lng2-lng1)*Math.PI/180;
    const a = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const activeRideRef = useRef(activeRide);
  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);

  const lastNetworkPingRef = useRef(0);
  const lastSentLocationRef = useRef(null);

  const handleLocationUpdate = useCallback(async (location) => {
    setDriverLocation(location);
    const now = Date.now();

    // Increment distance when ride is in_progress
    const ride = activeRideRef.current;
    if (ride?.status === "in_progress" && lastPositionRef.current) {
      const prev = lastPositionRef.current;
      const R = 6371;
      const dLat = (location.lat - prev.lat) * Math.PI / 180;
      const dLng = (location.lng - prev.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(prev.lat*Math.PI/180)*Math.cos(location.lat*Math.PI/180)*Math.sin(dLng/2)**2;
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      // Only count movement > 5m to avoid GPS jitter
      if (distKm > 0.005) {
        setDistanceTraveled(prev => prev + distKm);
      }
    }
    lastPositionRef.current = location;

    // Skip network call if: (a) sent within last 10s AND (b) moved < 15m since last send.
    // This cuts location POSTs by ~80% when stationary, preventing rate limit hits.
    const last = lastSentLocationRef.current;
    const movedEnough = !last || (() => {
      const R = 6371000;
      const dLat = (location.lat - last.lat) * Math.PI / 180;
      const dLng = (location.lng - last.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(last.lat * Math.PI/180) * Math.cos(location.lat * Math.PI/180) * Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) > 15;  // > 15 metres
    })();
    const enoughTimePassed = now - lastNetworkPingRef.current >= 10000;

    if (!movedEnough && !enoughTimePassed) return;

    lastNetworkPingRef.current = now;
    try {
      await api.post("/driver/location", location);
      lastSentLocationRef.current = location;
    } catch (_) {}
  }, []);

  useLocationTracker(isOnline, handleLocationUpdate);

  // ===========================================================================
  // Wait timer — anchored to server's arrived_at
  // ===========================================================================
  useEffect(() => {
    if (activeRide?.status !== "arrived") return;
    const serverArrivedAt = activeRide.arrived_at;
    const startMs = serverArrivedAt && !isNaN(new Date(serverArrivedAt).getTime())
      ? new Date(serverArrivedAt).getTime()
      : (arrivedTime ?? Date.now());
    if (!arrivedTime) setArrivedTime(startMs);
    const iv = setInterval(() => {
      const totalElapsedMin = Math.floor((Date.now() - startMs) / 60000);
      setWaitTimer(totalElapsedMin);
    }, 1000);
    return () => clearInterval(iv);
  }, [activeRide?.status, activeRide?.arrived_at]);

  // Mid-trip wait ticker
  useEffect(() => {
    if (!midTripWaiting || !midTripWaitStart) return;
    const iv = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - midTripWaitStart) / 1000);
      setMidTripWaitSecs(elapsedSec);
      // Live fare preview (client-side only, backend confirms on stop)
      if (activeRide) {
        const car   = (activeRide.carType || activeRide.car_type || "economy").toLowerCase();
        const rules = PRICING_RULES[car] || PRICING_RULES.economy;
        const dist  = distanceTraveled || activeRide.estimated_distance || 0;
        const bankedMin = midTripWaitBanked + elapsedSec / 60;
        const billableWait = Math.max(0, bankedMin - rules.freeWait);
        const base = rules.base + dist * rules.perKm;
        const waitFee = billableWait * rules.perMinWait;
        setLiveFare(Math.round((base + waitFee) * 100) / 100);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [midTripWaiting, midTripWaitStart, midTripWaitBanked, activeRide, distanceTraveled]);

  useEffect(() => { fetchActiveRide(); fetchRideHistory(); }, []);
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
  const fetchRideHistory = async () => {
    try { const r = await api.get("/driver/history"); setRideHistory(r.data.rides || []); } catch (_) {}
  };
  const fetchNearbyRides = async () => {
    try { const r = await api.get("/driver/rides/nearby?radius=10"); setNearbyRides(r.data.rides || []); } catch (_) {}
  };
  const refreshUser = async () => {
    try { const r = await api.get("/auth/me"); updateUser(r.data); } catch (_) {}
  };

  const handleRideAction = async (action) => {
    if (!activeRide) return;
    setLoading(true);
    try {
      if (action === "arrived") {
        await api.post(`/rides/${activeRide.id}/arrived`);
        setArrivedTime(null);
        
        toast.success("Marked as arrived");
      } else if (action === "start") {
        await api.post(`/rides/${activeRide.id}/start`, { pickup_wait_time: waitTimer });
        setRideStartTime(Date.now());
        setDistanceTraveled(0);
        setWaitTimer(0);
        setArrivedTime(null);
        lastPositionRef.current = driverLocation;
        toast.success("Ride started!");
      } else if (action === "complete") {
        // We define these here so the code doesn't "break" looking for them
        const finalDist = isNaN(distanceTraveled) ? 0 : parseFloat(distanceTraveled.toFixed(2));
        
        // Summing the two types of wait time: Pickup + Mid-trip Stops
        const pickupWait = parseFloat(waitTimer) || 0;
        const stopWait = parseFloat(midTripWaitBanked) || 0;
        const finalWait = (pickupWait + stopWait).toFixed(2);

        // The API call
        const res = await api.post(
          `/rides/${activeRide.id}/complete?final_distance=${finalDist}&total_wait_minutes=${finalWait}&dropoff_lat=${driverLocation?.lat || ""}&dropoff_lng=${driverLocation?.lng || ""}`
        );

        // --- THE REST IS YOUR ORIGINAL SUCCESS LOGIC ---
        const cashToCollect = res.data.cash_to_collect || 0;
        toast.success(
          cashToCollect > 0
            ? `Collect ₾${cashToCollect.toFixed(2)} cash from passenger`
            : "Ride complete! No cash needed.",
          { duration: 8000 }
        );

        const riderName = activeRide.rider_name || activeRide.driver_info?.rider_name || "Passenger";
        setRateRideId(activeRide.id);
        setRateRiderName(riderName);
        setCompletedRide({ ...res.data, final_fare: res.data.final_fare || activeRide.estimated_fare });
        
        // Cleanup state
        setActiveRide(null);
        setDistanceTraveled(0); setWaitTimer(0); setArrivedTime(null); setRideStartTime(null); 
        setIsWaitingAtStop(false); setMidTripWaiting(false); setMidTripWaitStart(null); 
        setMidTripWaitSecs(0); setMidTripWaitBanked(0); setLiveFare(null);
        
        fetchRideHistory(); await refreshUser();
        return;
      }
      if (action !== "complete") {
        const r = await api.get(`/rides/${activeRide.id}`);
        setActiveRide(r.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Action failed");
    } finally { setLoading(false); }
  };

  const handleCancelRide = async () => {
    if (!activeRide || !cancelReason) return;
    setLoading(true);
    try {
      await api.post(`/rides/${activeRide.id}/cancel`, { reason: cancelReason });
      toast.success("Ride cancelled");
      setActiveRide(null); setDistanceTraveled(0); setWaitTimer(0); setArrivedTime(null); setRideStartTime(null);
      setShowCancelModal(false); setCancelReason("");
      fetchRideHistory(); fetchAvailableRides();
    } catch (_) { toast.error("Failed to cancel"); }
    finally { setLoading(false); }
  };

  const handleToggleOnline = async (online) => {
    try {
      await api.post(`/driver/status?is_online=${online}`);
      setIsOnline(online);
      updateUser({ ...user, is_online: online });
      toast.success(online ? "You're online" : "You're offline");
    } catch (_) { toast.error("Failed to update status"); }
  };

  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      ["car_make","car_model","car_year","car_color","license_plate"].forEach(k =>
        fd.append(k, k === "car_year" ? parseInt(vehicleData[k]) : vehicleData[k])
      );
      ["license_front","license_back","reg_front","reg_back","car_photo_front","car_photo_back","car_photo_left","car_photo_right"]
        .forEach(k => { if (vehicleData[k]) fd.append(k, vehicleData[k]); });
      await api.post("/driver/vehicle", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Documents submitted!");
      updateUser({ ...user, driver_info: { ...user.driver_info, vehicle: vehicleData }, registration_status: "pending_review" });
    } catch (_) { toast.error("Upload failed. Please try again."); }
    finally { setLoading(false); }
  };

  const handleAcceptRide = async (rideId) => {
  setLoading(true);
  try {
    await api.post(`/rides/${rideId}/accept`);
    toast.success("Ride accepted!");

    const r = await api.get(`/rides/${rideId}`);
    setActiveRide(r.data);
    setAvailableRides(prev => prev.filter(ride => ride.id !== rideId));
    setDistanceTraveled(0);

  } catch (error) {
    // THIS IS THE MONEY LINE
    console.error("DEBUG ACCEPT ERROR:", error.response?.data);
    
    const backendMessage = error.response?.data?.message || "Failed to accept";
    toast.error(backendMessage);

    // If it's a 400, the ride is likely dead/gone. Remove it from view.
    if (error.response?.status === 400) {
       setAvailableRides(prev => prev.filter(ride => ride.id !== rideId));
    }
  } finally {
    setLoading(false);
  }
};

  const handleDeclineRide = async (rideId) => {
    try { await api.post(`/rides/${rideId}/decline`); setAvailableRides(prev => prev.filter(r => r.id !== rideId)); }
    catch (_) {}
  };

  const toggleMidTripWait = async () => {
    if (!midTripWaiting) {
      // Start wait timer
      setMidTripWaiting(true);
      setMidTripWaitStart(Date.now());
      setMidTripWaitSecs(0);
      try {
        await api.post(`/rides/${activeRide.id}/toggle-stop-wait?is_waiting=true`);
      } catch (_) {}
      toast.success("Wait timer started — ₾0.50/min");
    } else {
      // Stop — bank the time
      setMidTripWaiting(false);
      const elapsedMin = midTripWaitSecs / 60;
      try {
        await api.post(`/rides/${activeRide.id}/toggle-stop-wait?is_waiting=false`);
        const newBanked = midTripWaitBanked + elapsedMin;
        setMidTripWaitBanked(newBanked);
        setMidTripWaitSecs(0);
        setMidTripWaitStart(null);
        const min = Math.floor(newBanked);
        const sec = Math.round((newBanked - min) * 60);
        toast.success(`Wait saved: ${min}m ${sec}s · resuming trip`);
      } catch (_) {
        // Fallback: bank locally
        setMidTripWaitBanked(prev => prev + elapsedMin);
        setMidTripWaitSecs(0);
        setMidTripWaitStart(null);
        toast.success("Wait banked locally");
      }
    }
  };

  // Stop at current location — banks wait time and marks stop complete
  const stopAtCurrentLocation = async () => {
    if (!driverLocation?.lat) { toast.error("GPS location unavailable"); return; }
    if (midTripWaiting) {
      // If wait timer is running, stop it first
      await toggleMidTripWait();
    }
    try {
      const stopIdx = (activeRide.stops?.filter(s => s.lat).length || 0);
      await api.post(`/rides/${activeRide.id}/stop-reached?stop_index=${stopIdx}&wait_minutes=${Math.ceil(midTripWaitBanked)}`);
      toast.success("Stop recorded at current location");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to record stop");
    }
  };

  const addStopMidTrip = async () => {
    if (!newStopAddress.lat) { toast.error("Select a valid stop location"); return; }
    try {
      const res = await api.post(
        `/rides/${activeRide.id}/add-stop?stop_address=${encodeURIComponent(newStopAddress.address)}&stop_lat=${newStopAddress.lat}&stop_lng=${newStopAddress.lng}`
      );
      setActiveRide(prev => ({ ...prev, stops: res.data.stops, estimated_fare: res.data.new_estimated_fare }));
      setLiveFare(res.data.new_estimated_fare);
      setShowAddStop(false);
      setNewStopAddress({ address: "", lat: null, lng: null });
      toast.success(`Stop added — new fare ₾${res.data.new_estimated_fare.toFixed(2)}`);
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to add stop"); }
  };

  const toggleStopWait = async () => {
    try {
      const next = !isWaitingAtStop;
      await api.post(`/rides/${activeRide.id}/toggle-stop-wait?is_waiting=${next}`);
      setIsWaitingAtStop(next);
      toast.success(next ? "Stop wait started" : "Stop wait paused");
    } catch (_) {}
  };

  const tabs = [
    { id: "rides",    icon: Activity,  label: "Rides"   },
    { id: "earnings", icon: Wallet,    label: "Wallet"  },
    { id: "history",  icon: History,   label: "History" },
    { id: "more",     icon: Settings,  label: "More"    },
  ];

  const rideStatusConfig = {
    accepted:    { color: "#60a5fa", label: "Heading to Pickup" },
    arrived:     { color: "#a78bfa", label: "Waiting for Passenger" },
    in_progress: { color: "#00ff88", label: "Ride In Progress" },
  };
  const rsc = rideStatusConfig[activeRide?.status] || {};

  const waitDisplayMin = Math.floor(waitTimer);
  const waitDisplaySec = 0;

  return (
    <div className="fixed inset-0 bg-[#07070f] font-sans text-white overflow-hidden">
      {/* MAP */}
      <div className="absolute inset-0 z-0">
        {mapsLoaded && <DriverSmartMap activeRide={activeRide} driverLocation={driverLocation} />}
        {!mapsLoaded && (
          <div className="w-full h-full bg-gradient-to-b from-[#07070f] to-[#0e0e1c] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#00ff88]/40" />
          </div>
        )}
      </div>

      {/* HEADER */}
      <header className="absolute top-0 left-0 right-0 z-50 bg-[#07070f]/85 backdrop-blur-2xl border-b border-white/6">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00ff88] to-[#00d4ff] flex items-center justify-center">
              <Car className="w-5 h-5 text-black" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">{user?.name} {user?.surname}</p>
              <div className="flex items-center gap-2">
                <StatusBadge status={registrationStatus} />
                {user?.rating && <span className="text-yellow-400 text-xs">⭐ {user.rating?.toFixed(1)}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SurgeIndicator location={driverLocation} />
            <div className="bg-[#00ff88]/10 border border-[#00ff88]/25 rounded-lg px-2.5 py-1.5">
              <span className="text-[#00ff88] font-bold font-mono text-sm">₾{balance.toFixed(2)}</span>
            </div>
            {registrationStatus === "approved" && (
              <button onClick={() => handleToggleOnline(!isOnline)}
                className={`relative w-14 h-7 rounded-full transition-colors duration-300 border ${isOnline ? "bg-[#00ff88]/25 border-[#00ff88]/50" : "bg-white/8 border-white/15"}`}>
                <div className={`absolute top-0.5 w-6 h-6 rounded-full transition-transform duration-300 shadow-lg ${isOnline ? "translate-x-7 bg-[#00ff88]" : "translate-x-0.5 bg-white/40"}`} />
              </button>
            )}
            <button onClick={logout} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-red-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isOnline && driverLocation && (
          <div className="px-4 pb-2 flex items-center gap-2 text-[10px] text-[#00ff88]/50">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
            GPS Active · {driverLocation.lat?.toFixed(5)}, {driverLocation.lng?.toFixed(5)}
            {driverLocation.speed != null && <span>· {(driverLocation.speed * 3.6).toFixed(0)} km/h</span>}
          </div>
        )}
      </header>

      {/* ACTIVE RIDE PILL (minimized) */}
      {activeRide && isMinimized && (
        <button onClick={() => setIsMinimized(false)}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full border backdrop-blur-xl shadow-2xl transition-all"
          style={{ background: `${rsc.color}18`, borderColor: `${rsc.color}40` }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: rsc.color }} />
          <span className="text-sm font-semibold" style={{ color: rsc.color }}>{rsc.label}</span>
          <ChevronUp className="w-4 h-4" style={{ color: rsc.color }} />
        </button>
      )}

      {/* BOTTOM SHEET */}
      <div className={`absolute bottom-0 left-0 right-0 z-40 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isMinimized && activeRide ? "translate-y-[calc(100%-0px)]" : "translate-y-0"}`}>
        <div className="bg-[#0a0a18]/95 backdrop-blur-3xl border-t border-white/8 rounded-t-3xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.8)]"
          style={{ maxHeight: "72vh" }}>

          <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={() => setIsMinimized(p => !p)} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <div className="w-12 h-1 bg-white/15 rounded-full" />
          </div>

          {!activeRide && (
            <div className="flex items-center px-2 pb-2 pt-1 border-b border-white/5">
              {tabs.map(({ id, icon: Icon, label }) => {
                const active = activeTab === id;
                return (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all relative ${active ? "text-[#00ff88]" : "text-white/30 hover:text-white/50"}`}>
                    <Icon className={`w-5 h-5 transition-transform ${active ? "scale-110" : ""}`} />
                    <span className="text-[9px] uppercase tracking-wider font-bold">{label}</span>
                    {active && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#00ff88] shadow-[0_0_6px_#00ff88]" />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="overflow-y-auto px-4 pb-6 pt-3" style={{ maxHeight: activeRide ? "65vh" : "calc(72vh - 80px)" }}>

            {/* ACTIVE RIDE */}
            {activeRide && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-lg">Active Ride</p>
                    <p className="text-white/40 text-xs">
                      {activeRide.carType || activeRide.car_type} · {PRICING_RULES[(activeRide.carType || activeRide.car_type)?.toLowerCase()]?.icon || "🚗"}
                    </p>
                  </div>
                  <StatusBadge status={activeRide.status} />
                </div>

                <GlassCard className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88] mt-1 shrink-0" />
                    <div>
                      <p className="text-white/40 text-[10px] uppercase tracking-wider">Pickup</p>
                      <p className="text-white text-sm font-medium">{activeRide.pickup}</p>
                    </div>
                  </div>
                  {activeRide.stops?.filter(s => s.lat).length > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 mt-1 shrink-0" />
                      <div>
                        <p className="text-yellow-400/60 text-[10px] uppercase tracking-wider">Stops ({activeRide.stops.length})</p>
                        {activeRide.stops.filter(s => s.lat).map((s, i) => <p key={i} className="text-white/70 text-xs">· {s.address}</p>)}
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#00d4ff] mt-1 shrink-0" />
                    <div>
                      <p className="text-[#00d4ff]/60 text-[10px] uppercase tracking-wider">Destination</p>
                      <p className="text-white text-sm font-medium">{activeRide.destination || "Open Trip"}</p>
                    </div>
                  </div>
                </GlassCard>

                {activeRide.status === "arrived" && (
                  <DriverWaitTimer 
  arrivedAt={activeRide.arrived_at} 
  carType={activeRide.carType || activeRide.car_type} 
  // This uses the setWaitTimer function that ALREADY exists in your file
  onUpdate={(data) => setWaitTimer(data.minutes)} 
/>
                )}
                {activeRide.status === "in_progress" && (
                  <GlassCard accent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#00ff88]">
                      <Activity className="w-5 h-5 animate-pulse" />
                      <span className="font-medium text-sm">Distance Traveled</span>
                    </div>
                    <span className="text-[#00ff88] font-bold font-mono text-2xl">{distanceTraveled.toFixed(2)} km</span>
                  </GlassCard>
                )}

                {/* ── Live Fare Card ─────────────────────────────── */}
                <div className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-all ${midTripWaiting ? "bg-amber-500/10 border-amber-500/30 animate-pulse" : "bg-gradient-to-r from-[#00ff88]/10 to-[#00d4ff]/10 border-[#00ff88]/20"}`}>
                  <div>
                    <span className="text-white/60 text-sm">
                      {midTripWaiting ? "Wait charge running…" : "Current Fare"}
                    </span>
                    {midTripWaiting && (
                      <p className="text-amber-400 text-xs mt-0.5 font-mono">
                        +{String(Math.floor(midTripWaitSecs / 60)).padStart(2,"0")}:{String(midTripWaitSecs % 60).padStart(2,"0")} · ₾{((midTripWaitBanked + midTripWaitSecs / 60) * 0.50).toFixed(2)} wait fee
                      </p>
                    )}
                  </div>
                  <span className={`text-2xl font-bold font-mono transition-colors ${midTripWaiting ? "text-amber-400" : "text-[#00ff88]"}`}>
                    ₾{(liveFare ?? activeRide.final_fare ?? activeRide.estimated_fare)?.toFixed(2) ?? "—"}
                  </span>
                </div>

                {/* ── Mid-trip Wait Timer ─────────────────────────── */}
                {activeRide.status === "in_progress" && (
                  <button onClick={toggleMidTripWait}
                    className={`w-full h-12 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 ${
                      midTripWaiting
                        ? "bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.3)]"
                        : "bg-white/5 border-white/15 text-white/60 hover:border-amber-500/40 hover:text-amber-400"
                    }`}>
                    {midTripWaiting
                      ? <><Timer className="w-4 h-4 animate-spin" /> Stop waiting — resume trip</>
                      : <><PauseCircle className="w-4 h-4" /> Start wait timer (₾0.50/min)</>
                    }
                  </button>
                )}

                {/* ── Stop at current location ────────────────────── */}
                {activeRide.status === "in_progress" && !midTripWaiting && (
                  <button onClick={stopAtCurrentLocation}
                    className="w-full h-11 rounded-xl border border-yellow-500/25 bg-yellow-500/8 text-yellow-400/80 text-sm font-semibold flex items-center justify-center gap-2 hover:border-yellow-500/50 hover:text-yellow-300 hover:bg-yellow-500/12 transition-all active:scale-95">
                    <MapPin className="w-4 h-4" /> Stop here (record stop at my location)
                  </button>
                )}

                <RideCommunication
                  rideId={activeRide.id}
                  otherPartyPhone={activeRide.rider_phone || activeRide.rider?.cellphone}
                  otherPartyName={activeRide.rider_name || "Rider"}
                  currentUserId={user?.id}
                  isDriver={true}
                />

                <div className="flex gap-3">
                  {activeRide.status === "accepted" && (
                    <Button className="flex-1 bg-purple-500 hover:bg-purple-600 text-white font-bold h-14 text-base" onClick={() => handleRideAction("arrived")} disabled={loading}>
                      {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <MapPin className="w-5 h-5 mr-2" />} I've Arrived
                    </Button>
                  )}
                  {activeRide.status === "arrived" && (
                    <Button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold h-14 text-base" onClick={() => handleRideAction("start")} disabled={loading}>
                      {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Play className="w-5 h-5 mr-2" />} Start Ride
                    </Button>
                  )}
                  {activeRide.status === "in_progress" && (
                    <Button className="flex-1 bg-[#00ff88] hover:bg-[#00e070] text-black font-bold h-14 text-base" onClick={() => handleRideAction("complete")} disabled={loading}>
                      {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />} Complete
                    </Button>
                  )}
                  <button onClick={() => setShowCancelModal(true)}
                    className="w-14 h-14 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors">
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}

            {/* RIDES TAB */}
            {!activeRide && activeTab === "rides" && (
              <div>
                {registrationStatus !== "approved" ? (
                  <div className="text-center py-10">
                    <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                    <p className="text-white font-semibold">Account Pending Review</p>
                    <p className="text-white/40 text-sm mt-1">We'll notify you once approved</p>
                  </div>
                ) : !isOnline ? (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
                      <Activity className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-white font-semibold">You're Offline</p>
                    <p className="text-white/40 text-sm mb-4 mt-1">Toggle online to receive rides</p>
                    <Button className="bg-[#00ff88] text-black font-bold px-8 h-12" onClick={() => handleToggleOnline(true)}>
                      Go Online
                    </Button>
                  </div>
                ) : availableRides.length === 0 ? (
                  <div className="space-y-4">
                    <div className="text-center py-8">
                      <div className="w-14 h-14 rounded-2xl bg-[#00d4ff]/8 border border-[#00d4ff]/15 flex items-center justify-center mx-auto mb-3">
                        <Navigation className="w-7 h-7 text-[#00d4ff]/50 animate-pulse" />
                      </div>
                      <p className="text-white font-semibold text-sm">Searching for rides…</p>
                      <p className="text-white/30 text-xs mt-1">New requests appear automatically</p>
                    </div>
                    {nearbyRides.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white/30 text-[10px] uppercase tracking-widest">{nearbyRides.length} rides nearby</p>
                          <button onClick={fetchNearbyRides} className="text-[#00d4ff] text-xs flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
                        </div>
                        {nearbyRides.map(ride => (
                          <GlassCard key={ride.id} className="p-3.5 mb-2">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1 pr-2">
                                <p className="text-white text-sm font-medium truncate">{ride.pickup}</p>
                                <p className="text-white/40 text-xs">→ {ride.destination || "Open"}</p>
                                {ride.distance_to_pickup != null && <p className="text-[#00d4ff] text-xs mt-0.5">📍 {ride.distance_to_pickup?.toFixed(1)} km</p>}
                              </div>
                              <p className="text-[#00ff88] font-bold font-mono shrink-0">₾{ride.estimated_fare?.toFixed(2)}</p>
                            </div>
                            <Button className="w-full bg-[#00d4ff]/12 border border-[#00d4ff]/25 text-[#00d4ff] font-bold h-9 text-sm hover:bg-[#00d4ff]/20 rounded-xl"
                              onClick={async () => {
                                setLoading(true);
                                try { await api.post(`/rides/${ride.id}/request-join`); toast.success("Requested!"); fetchNearbyRides(); }
                                catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
                                finally { setLoading(false); }
                              }}>
                              Request to Accept
                            </Button>
                          </GlassCard>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-white/30 text-[10px] uppercase tracking-widest">{availableRides.length} available {availableRides.length === 1 ? "ride" : "rides"}</p>
                    {availableRides.map(ride => {
                      const commission = (ride.estimated_fare || 0) * DRIVER_COMMISSION_RATE;
                      const driverCut = (ride.estimated_fare || 0) * (1 - DRIVER_COMMISSION_RATE);
                      const canAccept = balance >= commission && !!ride.estimated_fare;
                      const tier = PRICING_RULES[ride.car_type?.toLowerCase()] || PRICING_RULES.economy;
                      return (
                        <GlassCard key={ride.id} className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 pr-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{tier.icon}</span>
                                <span className="text-white/50 text-xs uppercase tracking-wider font-semibold">{tier.name}</span>
                                {ride.surge_multiplier > 1 && (
                                  <span className="text-orange-400 text-[10px] font-bold bg-orange-500/15 border border-orange-500/25 rounded-md px-1.5 py-0.5">{ride.surge_multiplier}× surge</span>
                                )}
                              </div>
                              <div className="flex items-stretch gap-2.5">
                                <div className="flex flex-col items-center gap-0.5 mt-1">
                                  <div className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_6px_#00ff88]" />
                                  <div className="w-0.5 flex-1 bg-white/10 rounded-full min-h-[14px]" />
                                  <div className="w-2 h-2 rounded-full bg-[#00d4ff] shadow-[0_0_6px_#00d4ff]" />
                                </div>
                                <div className="flex-1 space-y-1.5">
                                  <p className="text-white font-medium text-sm leading-tight">{ride.pickup}</p>
                                  <p className="text-white/40 text-xs">{ride.destination || "Open Trip"}</p>
                                </div>
                              </div>
                              {ride.distance_to_pickup != null && (
                                <p className="text-[#00d4ff] text-xs mt-1.5 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> {ride.distance_to_pickup} km away
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-2xl font-bold font-mono text-[#00ff88]">₾{ride.estimated_fare?.toFixed(2)}</p>
                              <p className="text-white/35 text-xs">you get</p>
                              <p className="text-white/70 text-sm font-bold font-mono">₾{driverCut.toFixed(2)}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2 border-t border-white/5">
                            <Button className="flex-1 bg-[#00ff88] hover:bg-[#00e070] text-black font-bold h-11 rounded-xl" disabled={loading || !canAccept}
                              onClick={() => handleAcceptRide(ride.id)}>
                              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : canAccept ? "✓ Accept Ride" : `Need ₾${commission.toFixed(2)}`}
                            </Button>
                            <button onClick={() => handleDeclineRide(ride.id)}
                              className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors active:scale-95">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </GlassCard>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* EARNINGS TAB */}
            {!activeRide && activeTab === "earnings" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <GlassCard accent className="p-4">
                    <p className="text-[#00ff88]/50 text-[10px] uppercase tracking-widest mb-1">Balance</p>
                    <p className="text-3xl font-bold font-mono text-[#00ff88]">₾{balance.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="p-4">
                    <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1">Total Earned</p>
                    <p className="text-3xl font-bold font-mono text-white">₾{totalEarned.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="p-3">
                    <p className="text-red-400/60 text-[10px] uppercase tracking-widest mb-0.5">Commission</p>
                    <p className="text-lg font-bold font-mono text-red-400">₾{commissionPaid.toFixed(2)}</p>
                  </GlassCard>
                  <GlassCard className="p-3">
                    <p className="text-white/40 text-[10px] uppercase tracking-widest mb-0.5">Withdrawn</p>
                    <p className="text-lg font-bold font-mono text-white/60">₾{totalWithdrawn.toFixed(2)}</p>
                  </GlassCard>
                </div>

                <div className="flex gap-2">
                  {[["overview","Overview"],["topup","Top Up"],["withdraw","Withdraw"]].map(([k,l]) => (
                    <button key={k} onClick={() => setEarningsTab(k)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${earningsTab === k ? "bg-[#00ff88]/15 border-[#00ff88]/40 text-[#00ff88]" : "border-white/10 text-white/30 hover:text-white/60"}`}>
                      {l}
                    </button>
                  ))}
                </div>

                {earningsTab === "overview" && (
                  <GlassCard className="p-4 space-y-3">
                    <p className="text-white/40 text-[10px] uppercase tracking-widest">Commission Breakdown</p>
                    {[
                      ["Platform cut", `${(DRIVER_COMMISSION_RATE * 100).toFixed(0)}%`, "text-red-400"],
                      ["Your share",   `${((1-DRIVER_COMMISSION_RATE) * 100).toFixed(0)}%`, "text-[#00ff88]"],
                      ["Surge commission", "23–24%", "text-orange-400"],
                    ].map(([l,v,c]) => (
                      <div key={l} className="flex justify-between items-center">
                        <span className="text-white/60 text-sm">{l}</span>
                        <span className={`font-mono font-bold ${c}`}>{v}</span>
                      </div>
                    ))}
                  </GlassCard>
                )}

                {earningsTab === "topup" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-white/60 text-xs uppercase tracking-wider">Amount (GEL)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00ff88] font-bold">₾</span>
                        <Input type="number" min="5" max="500" value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
                          placeholder="50" className="pl-7 bg-white/4 border-white/10 text-white text-lg h-12 font-mono" />
                      </div>
                      <p className="text-white/30 text-xs">
                        ≈ ${topupAmount && !isNaN(parseFloat(topupAmount)) ? (parseFloat(topupAmount) * 0.37).toFixed(2) : "0.00"} USD
                      </p>
                    </div>

                    {topupAmount && parseFloat(topupAmount) >= 5 ? (
                      <PayPalButtons
                        fundingSource="card"
                        style={{ layout: "vertical", shape: "rect", color: "black" }}
                        createOrder={(data, actions) => actions.order.create({
                          purchase_units: [{ amount: { value: (parseFloat(topupAmount) * 0.37).toFixed(2), currency_code: "USD" } }],
                          application_context: { shipping_preference: "NO_SHIPPING" },
                        })}
                        onApprove={async (data, actions) => {
                          try {
                            setLoading(true);
                            await actions.order.capture();
                            await api.post("/driver/wallet/topup/paypal", { order_id: data.orderID, amount: parseFloat(topupAmount) });
                            toast.success(`₾${topupAmount} added!`);
                            setTopupAmount(""); setEarningsTab("overview");
                            await refreshUser();
                          } catch (_) { toast.error("Top-up failed. Contact support."); }
                          finally { setLoading(false); }
                        }}
                        onError={() => toast.error("Payment failed.")}
                        onCancel={() => toast.info("Payment cancelled.")}
                      />
                    ) : (
                      <GlassCard className="p-4 text-center">
                        <p className="text-white/30 text-sm">Enter ₾5 or more to show payment options</p>
                      </GlassCard>
                    )}

                    <Separator className="bg-white/5" />

                    <div className="space-y-2">
                      <p className="text-white/30 text-[10px] uppercase tracking-widest">Manual Top-up via Bank Transfer</p>
                      <GlassCard className="p-4">
                        <p className="text-white/60 text-sm mb-3">Transfer to our BOG account, then submit your reference number below for manual processing.</p>
                        <a href="https://egreve.bog.ge//Taksi" target="_blank" rel="noreferrer"
                          className="flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-[#00d4ff]/15 border border-[#00d4ff]/30 text-[#00d4ff] font-bold text-sm">
                          <ExternalLink className="w-4 h-4" /> Open BOG Payment Page
                        </a>
                      </GlassCard>
                    </div>
                  </div>
                )}

                {earningsTab === "withdraw" && (
                  <WithdrawalPanel balance={balance} driverId={user?.id} onSuccess={async () => { setEarningsTab("overview"); await refreshUser(); }} />
                )}
              </div>
            )}

            {/* HISTORY TAB */}
            {!activeRide && activeTab === "history" && (
              <div className="space-y-2.5">
                {rideHistory.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="w-14 h-14 rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center mx-auto mb-3">
                      <History className="w-7 h-7 text-white/20" />
                    </div>
                    <p className="text-white/50 font-semibold text-sm">No rides yet</p>
                    <p className="text-white/25 text-xs mt-1">Completed rides will appear here</p>
                  </div>
                ) : rideHistory.map(r => (
                  <GlassCard key={r.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 pr-3 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shrink-0" />
                          <p className="text-white text-sm font-medium truncate">{r.pickup}</p>
                        </div>
                        {r.destination && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] shrink-0" />
                            <p className="text-white/40 text-xs truncate">{r.destination}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <StatusBadge status={r.status} />
                          <span className="text-white/25 text-[10px]">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</span>
                          <span className="text-white/25 text-[10px] capitalize">{r.carType || r.car_type}</span>
                        </div>
                      </div>
                      <p className="text-[#00ff88] font-bold font-mono text-base shrink-0">
                        ₾{r.final_fare != null ? parseFloat(r.final_fare).toFixed(2) : (r.estimated_fare?.toFixed(2) ?? "—")}
                      </p>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}

            {/* MORE TAB */}
            {!activeRide && activeTab === "more" && (
              <MorePanel
                registrationStatus={registrationStatus}
                driverRating={user?.rating}
                activeRide={activeRide}
                driverLocation={driverLocation}
              />
            )}

          </div>
        </div>
      </div>

      {/* Vehicle registration modal */}
      {registrationStatus === "pending_vehicle" && !hasVehicle && (
        <div className="absolute inset-0 z-[60] bg-[#07070f]/96 backdrop-blur-2xl flex items-end">
          <div className="w-full bg-[#0a0a18] border-t border-white/8 rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-2xl bg-[#00ff88]/10 flex items-center justify-center mx-auto mb-3">
                <Car className="w-7 h-7 text-[#00ff88]" />
              </div>
              <h2 className="text-xl font-bold text-white">Register Your Vehicle</h2>
              <p className="text-white/40 text-sm mt-1">To start driving, submit your documents for review</p>
            </div>
            <form onSubmit={handleRegisterVehicle} className="space-y-4">
              <GlassCard className="p-4 space-y-3">
                <p className="text-white/40 text-[10px] uppercase tracking-widest">Vehicle Details</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[["car_make","Make","Toyota"],["car_model","Model","Camry"],["car_year","Year","2018","number"],["car_color","Color","Silver"]].map(([k,l,p,t="text"]) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-white/40 text-[11px]">{l}</Label>
                      <Input required type={t} placeholder={p} value={vehicleData[k]}
                        onChange={e => setVehicleData({ ...vehicleData, [k]: e.target.value })}
                        className="bg-white/4 border-white/10 text-white h-9 text-sm placeholder:text-white/20" />
                    </div>
                  ))}
                  <div className="col-span-2 space-y-1">
                    <Label className="text-white/40 text-[11px]">License Plate</Label>
                    <Input required placeholder="AB-123-CD" value={vehicleData.license_plate}
                      onChange={e => setVehicleData({ ...vehicleData, license_plate: e.target.value.toUpperCase() })}
                      className="bg-white/4 border-white/10 text-white h-9 font-mono uppercase placeholder:normal-case placeholder:text-white/20" />
                  </div>
                </div>
              </GlassCard>

              {[
                ["Driver's License", [["license_front","Front"],["license_back","Back"]]],
                ["Registration Card", [["reg_front","Front"],["reg_back","Back"]]],
                ["Car Photos", [["car_photo_front","Front"],["car_photo_back","Back"],["car_photo_left","Left"],["car_photo_right","Right"]]],
              ].map(([title, fields]) => (
                <GlassCard key={title} className="p-4 space-y-3">
                  <p className="text-white/40 text-[10px] uppercase tracking-widest">{title}</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {fields.map(([k, l]) => (
                      <div key={k} className="space-y-1">
                        <Label className="text-white/40 text-[11px]">{l} {vehicleData[k] && <span className="text-[#00ff88]">✓</span>}</Label>
                        <input required type="file" accept="image/*" onChange={e => setVehicleData({ ...vehicleData, [k]: e.target.files[0] })}
                          className="w-full bg-white/4 border border-white/10 text-white rounded-lg p-2 text-xs file:bg-[#00ff88]/15 file:text-[#00ff88] file:border-0 file:rounded file:px-2 file:py-0.5 file:text-xs file:font-bold file:mr-2" />
                      </div>
                    ))}
                  </div>
                </GlassCard>
              ))}

              <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-black font-bold text-base">
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Submit Documents for Review
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="bg-[#0e0e1c] border border-white/10 text-white max-w-sm w-[95vw] rounded-2xl z-[100]">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Cancel Ride
            </DialogTitle>
            <DialogDescription className="text-white/50 text-sm">
              Select a reason. Unjustified cancellations may affect your score.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 my-2 max-h-64 overflow-y-auto">
            {(CANCEL_REASONS[activeRide?.status] || CANCEL_REASONS.accepted).map(reason => (
              <div key={reason} onClick={() => setCancelReason(reason)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${cancelReason === reason ? "bg-red-500/15 border-red-500/40 text-red-400" : "border-white/8 text-white/60 hover:border-white/20"}`}>
                <p className="text-sm font-medium">{reason}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setShowCancelModal(false)} className="flex-1 border border-white/10 text-white/50 h-11">Back</Button>
            <Button onClick={handleCancelRide} disabled={!cancelReason || loading} className="flex-1 bg-red-600 hover:bg-red-700 font-bold h-11">
              Confirm Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* RATE PASSENGER MODAL */}
      <Dialog open={showRateModal} onOpenChange={setShowRateModal}>
        <DialogContent className="bg-[#0e0e1c] border border-white/10 text-white max-w-sm w-[95vw] rounded-2xl z-[100]">
          <DialogHeader>
            <DialogTitle className="text-[#00ff88] flex items-center gap-2">
              <Star className="w-5 h-5" /> Rate Passenger
            </DialogTitle>
          </DialogHeader>
          <RatePassengerModal rideId={rateRideId} riderName={rateRiderName} onDone={() => setShowRateModal(false)} />
        </DialogContent>
      </Dialog>

      {/* TRIP COMPLETION MODAL */}
      <DriverTripCompletionModal
        isOpen={!!completedRide}
        onClose={() => {
          setCompletedRide(null);
          setShowRateModal(true); // ✅ ADD THIS: Opens rating after closing fare
        }}
        fareAmount={completedRide?.final_fare || completedRide?.estimated_fare}
        paymentMethod={completedRide?.payment_method || completedRide?.paymentMethod || "cash"}
        riderName={completedRide?.rider_name || "Rider"}
        cashToCollect={completedRide?.cash_to_collect || 0}
        onConfirm={() => {
          setCompletedRide(null);
          setShowRateModal(true); // ✅ ADD THIS: Opens rating after confirming fare
        }}
      />

    </div>   
  );         
};           

// =============================================================================
// PORTAL ROUTER
// =============================================================================
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

if (!PAYPAL_CLIENT_ID) {
  console.error(
    "❌ VITE_PAYPAL_CLIENT_ID is not set. " +
    "Add it to your Render frontend service environment variables and redeploy."
  );
}

const DriverPortal = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.user_type !== "driver") {
    if (location.pathname === "/driver" || location.pathname === "/driver/") return <DriverAuth />;
    return <Navigate to="/driver" replace />;
  }

  return (
   <PayPalScriptProvider
      options={{
        "client-id": PAYPAL_CLIENT_ID || "sb",
        currency: "USD",
        vault: true // 👈 Swapped capture for vault
      }}
    >
      <Routes>
        <Route path="/"         element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DriverDashboard />} />
        <Route path="*"         element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default DriverPortal;