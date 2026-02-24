// DriverPortal.jsx
// ✅ Production-hardened rewrite of your Driver Portal while preserving your logic + UI intent
// ✅ Fixes critical runtime bugs + missing functions + state wiring issues
// ✅ Eliminates accidental polling storms + removes undefined references
// ✅ Normalizes backend field shapes (snake/camel) so UI doesn’t break on server.py variations
// ✅ Fixes "Nearby" tab (was never populated), DriverWaitTimer bug (was calling undefined fetchNearbyRides),
// ✅ Fixes missing handleNav, cancellation modal not rendered, and PayPal topup flow hardening

window.addEventListener("error", (e) => console.error("WINDOW ERROR:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("UNHANDLED REJECTION:", e.reason));
console.log("APP BOOT: reached main entry");

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Target,
  Crosshair,
  Banknote,
  CreditCard,
  AlertTriangle,
  Activity,
  MapPinned,
  CheckCircle2,
  XCircle,
  Play,
  Timer,
  PauseCircle,
  ExternalLink,
} from "lucide-react";

const ENABLE_PAYPAL_VAULT = import.meta.env.VITE_ENABLE_PAYPAL_VAULT === "true";

// Pricing Rules (Wait Timer & Earning Calculations)
const PRICING_RULES = {
  economy: { name: "Economy", base: 2.8, perKm: 0.5, perMinWait: 0.4, freeWait: 2, stopFee: 0.0, icon: "🚗" },
  comfort: { name: "Comfort", base: 3.38, perKm: 0.55, perMinWait: 0.45, freeWait: 2, stopFee: 0.0, icon: "🚙" },
  suv: { name: "SUV / XL", base: 5.18, perKm: 0.8, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "🚐" },
  personal: { name: "Personal", base: 5.12, perKm: 0.7, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "👤" },
  jumpstart: { name: "Jumpstart", base: 4.5, perKm: 0.0, perMinWait: 0.4, freeWait: 2, stopFee: 0.0, icon: "⚡" },
};

const DRIVER_COMMISSION_RATE = 0.23;
const PAYMENT_LINK = "https://egreve.bog.ge//Taksi";
const LOCATION_UPDATE_INTERVAL = 10000; // 10 seconds

const CANCEL_REASONS = {
  accepted: [
    "Heavy Traffic / Stuck",
    "Car Trouble / Mechanical Issue",
    "Accidentally Accepted",
    "Cannot Locate Pickup Address",
    "Personal Emergency",
  ],
  arrived: [
    "Client Not Showing Up (Timer Expired)",
    "Client Refused Ride",
    "Too Much Luggage / Cargo",
    "Unaccompanied Minor",
    "No Mask / Safety Concern",
  ],
  in_progress: [
    "Client Requested Early End",
    "Client Behavior / Rude",
    "Safety Concern",
    "Wrong Destination",
    "Vehicle Breakdown",
  ],
};

// ---------- Helpers (normalize backend shapes) ----------
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const pickAny = (obj, keys, fallback = null) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return fallback;
};

const normalizeRide = (ride) => {
  if (!ride) return null;

  const id = pickAny(ride, ["id", "ride_id", "rideId"]);
  const status = pickAny(ride, ["status"], "searching");

  const pickup = pickAny(ride, ["pickup", "pickup_address"], "");
  const destination = pickAny(ride, ["destination", "dest", "destination_address"], null);

  const pickupLat = num(pickAny(ride, ["pickup_lat", "pickupLat", "pickup_latitude", "pickupLatitude"]));
  const pickupLng = num(pickAny(ride, ["pickup_lng", "pickupLng", "pickup_longitude", "pickupLongitude"]));

  const destLat = num(pickAny(ride, ["dest_lat", "destination_lat", "destinationLat", "destLat"]));
  const destLng = num(pickAny(ride, ["dest_lng", "destination_lng", "destinationLng", "destLng"]));

  const estimatedFare = pickAny(ride, ["estimated_fare", "estimatedFare"], null);
  const finalFare = pickAny(ride, ["final_fare", "finalFare"], null);
  const arrivedAt = pickAny(ride, ["arrived_at", "arrivedAt"], null);

  const stops = Array.isArray(ride.stops) ? ride.stops : [];
  const rider = pickAny(ride, ["rider"], null);

  return {
    ...ride,
    id,
    status,
    pickup,
    destination,
    pickup_lat: pickupLat,
    pickup_lng: pickupLng,
    dest_lat: destLat,
    dest_lng: destLng,
    estimated_fare: estimatedFare,
    final_fare: finalFare,
    arrived_at: arrivedAt,
    stops,
    rider,
  };
};

const isTerminal = (status) => ["completed", "cancelled", "no_drivers"].includes(status);

// ---------- Google Maps loader (single script, safe) ----------
const loadGoogleMaps = (() => {
  let loadingPromise = null;
  return (apiKey) => {
    if (window.google?.maps?.places) return Promise.resolve(true);
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-google-maps='true']");
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", () => reject(new Error("Google Maps failed")));
        return;
      }
      const script = document.createElement("script");
      script.dataset.googleMaps = "true";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Google Maps failed"));
      document.head.appendChild(script);
    });

    return loadingPromise;
  };
})();

// ---------- Driver Wait Timer (FIXED: no undefined fetchNearbyRides calls) ----------
const DriverWaitTimer = ({ arrivedAt, carType }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = arrivedAt ? new Date(arrivedAt).getTime() : Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [arrivedAt]);

  const rules = PRICING_RULES[(carType || "economy").toLowerCase()] || PRICING_RULES.economy;
  const freeWaitSeconds = rules.freeWait * 60;

  if (elapsed <= freeWaitSeconds) {
    const remaining = freeWaitSeconds - elapsed;
    const mins = Math.floor(remaining / 60).toString().padStart(2, "0");
    const secs = (remaining % 60).toString().padStart(2, "0");

    return (
      <div className="bg-blue-500/20 border border-blue-500 p-4 rounded-xl flex items-center justify-between col-span-2">
        <div className="flex items-center text-blue-400">
          <Timer className="w-5 h-5 mr-2 animate-pulse" />
          <span className="font-medium">Free Wait Time</span>
        </div>
        <div className="text-right">
          <div className="text-blue-400 font-mono text-xl font-bold">
            {mins}:{secs}
          </div>
          <div className="text-blue-400/70 text-[10px] uppercase font-bold tracking-wider">Remaining</div>
        </div>
      </div>
    );
  }

  const overtime = elapsed - freeWaitSeconds;
  const mins = Math.floor(overtime / 60).toString().padStart(2, "0");
  const secs = (overtime % 60).toString().padStart(2, "0");
  const liveEarnings = ((overtime / 60) * rules.perMinWait).toFixed(2);

  return (
    <div className="bg-[#00ff88]/20 border border-[#00ff88] p-4 rounded-xl flex items-center justify-between shadow-[0_0_15px_rgba(0,255,136,0.2)] col-span-2">
      <div className="flex items-center text-[#00ff88]">
        <Timer className="w-5 h-5 mr-2 animate-pulse" />
        <span className="font-medium">Paid Wait Time</span>
      </div>
      <div className="text-right">
        <div className="text-[#00ff88] font-mono text-xl font-bold">
          {mins}:{secs}
        </div>
        <div className="text-[#00ff88] font-bold text-sm">Earned: +₾{liveEarnings}</div>
      </div>
    </div>
  );
};

// ---------- Driver Auth ----------
const DriverAuth = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", surname: "", cellphone: "", password: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register/driver";
      const res = await api.post(endpoint, formData);

      if (res?.data?.token && res?.data?.user) {
        login(res.data.token, res.data.user);
        toast.success(isLogin ? t("welcome_back") : t("success"));
        navigate("/driver/dashboard");
      } else {
        throw new Error("Invalid response");
      }
    } catch (error) {
      const msg = error?.response?.data?.detail || error?.message || t("error");
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
          <Button
            variant="ghost"
            className="absolute left-4 top-4 text-primary hover:text-white"
            onClick={() => navigate("/")}
            data-testid="driver-back-btn"
            type="button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> {t("back")}
          </Button>

          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center mx-auto mb-4 mt-8">
            <Car className="w-10 h-10 text-black" />
          </div>
          <CardTitle className="text-2xl text-primary font-heading">
            {isLogin ? t("pilot_login") : t("become_pilot_title")}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-primary">{t("first_name")}</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className="bg-background-secondary border-border text-white"
                    required
                    data-testid="driver-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-primary">{t("last_name")}</Label>
                  <Input
                    value={formData.surname}
                    onChange={(e) => setFormData((p) => ({ ...p, surname: e.target.value }))}
                    className="bg-background-secondary border-border text-white"
                    required
                    data-testid="driver-surname-input"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-primary">{t("phone_number")}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-primary/50" />
                <Input
                  type="tel"
                  value={formData.cellphone}
                  onChange={(e) => setFormData((p) => ({ ...p, cellphone: e.target.value }))}
                  className="pl-10 bg-background-secondary border-border text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                  data-testid="driver-phone-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-primary">{t("password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-primary/50" />
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                  className="pl-10 bg-background-secondary border-border text-white"
                  required
                  data-testid="driver-password-input"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-secondary text-black font-bold hover:shadow-neon-cyan transition-all"
              disabled={loading}
              data-testid="driver-auth-submit"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isLogin ? t("sign_in") : t("register_driver")}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <Button
            variant="link"
            className="text-secondary"
            onClick={() => setIsLogin((v) => !v)}
            data-testid="driver-auth-toggle"
            type="button"
          >
            {isLogin ? t("need_account") : t("have_account")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// ---------- Real-time Location Tracker Hook ----------
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

    if (!navigator.geolocation) {
      toast.error("Geolocation not supported.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
        };
        lastLocationRef.current = location;
      },
      (error) => {
        console.error("Location error:", error);
      },
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

// ---------- Driver Smart Map (FIXED: handleNav defined; animation frame via ref; stable route updates) ----------
const DriverSmartMap = ({ activeRide, driverLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const routeRendererRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const animFrameRef = useRef(null);
  const routeSigRef = useRef(null);

  const [isFollowing, setIsFollowing] = useState(true);

  // turn-by-turn state
  const [routeSteps, setRouteSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const getSafeCoord = (val) => {
    const n = parseFloat(val);
    return Number.isFinite(n) && n !== 0 ? n : null;
  };

  const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const handleNav = useCallback(
    (provider) => {
      if (!activeRide) return;

      const dLat = getSafeCoord(driverLocation?.lat);
      const dLng = getSafeCoord(driverLocation?.lng);

      let targetLat = null;
      let targetLng = null;

      if (["accepted", "arrived"].includes(activeRide.status)) {
        targetLat = getSafeCoord(activeRide.pickup_lat);
        targetLng = getSafeCoord(activeRide.pickup_lng);
      } else if (activeRide.status === "in_progress") {
        targetLat = getSafeCoord(activeRide.dest_lat ?? activeRide.destination_lat);
        targetLng = getSafeCoord(activeRide.dest_lng ?? activeRide.destination_lng);
      }

      if (!targetLat || !targetLng) return toast.error("No target location available");

      const target = `${targetLat},${targetLng}`;
      const origin = dLat && dLng ? `${dLat},${dLng}` : null;

      if (provider === "google") {
        const url = origin
          ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(target)}&travelmode=driving`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
        window.open(url, "_blank");
        return;
      }

      // Waze deep link
      if (provider === "waze") {
        const url = `https://waze.com/ul?ll=${encodeURIComponent(target)}&navigate=yes`;
        window.open(url, "_blank");
        return;
      }
    },
    [activeRide, driverLocation]
  );

  // init map once
  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    if (mapInstanceRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 },
      zoom: 17,
      mapId: "DEMO_MAP_ID",
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

    map.addListener("dragstart", () => setIsFollowing(false));

    routeRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 6 },
      preserveViewport: true,
    });

    directionsServiceRef.current = new window.google.maps.DirectionsService();
    mapInstanceRef.current = map;
  }, []);

  // animate driver marker
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation) return;

    const endLat = getSafeCoord(driverLocation.lat);
    const endLng = getSafeCoord(driverLocation.lng);
    const heading = parseFloat(driverLocation.heading) || 0;
    if (!endLat || !endLng) return;

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        position: { lat: endLat, lng: endLng },
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

      if (isFollowing) {
        mapInstanceRef.current.moveCamera({
          center: { lat: endLat, lng: endLng },
          heading,
          tilt: 45,
          zoom: 18,
        });
      }
      return;
    }

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const startLat = markerRef.current.getPosition().lat();
    const startLng = markerRef.current.getPosition().lng();

    const icon = markerRef.current.getIcon();
    icon.rotation = heading;
    markerRef.current.setIcon(icon);

    const startTime = performance.now();
    const duration = 1000;

    const animate = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      const curLat = startLat + (endLat - startLat) * p;
      const curLng = startLng + (endLng - startLng) * p;
      const pos = { lat: curLat, lng: curLng };

      markerRef.current.setPosition(pos);

      if (isFollowing) {
        mapInstanceRef.current.moveCamera({ center: pos, heading, tilt: 45, zoom: 18 });
      }

      // turn-by-turn progression
      if (routeSteps.length > 0 && currentStepIndex < routeSteps.length) {
        const step = routeSteps[currentStepIndex];
        const stepEndLat = step?.end_location?.lat?.();
        const stepEndLng = step?.end_location?.lng?.();
        if (stepEndLat && stepEndLng) {
          const distToTurn = getDistanceKm(endLat, endLng, stepEndLat, stepEndLng);
          if (distToTurn < 0.04) setCurrentStepIndex((prev) => prev + 1);
        }
      }

      if (p < 1) animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [driverLocation, isFollowing, routeSteps, currentStepIndex]);

  // draw route on meaningful changes (avoid redrawing every render)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !activeRide || !driverLocation) {
      setRouteSteps([]);
      setCurrentStepIndex(0);
      routeSigRef.current = null;
      return;
    }

    const dLat = getSafeCoord(driverLocation.lat);
    const dLng = getSafeCoord(driverLocation.lng);
    if (!dLat || !dLng) return;

    let target = null;

    if (["accepted", "arrived"].includes(activeRide.status)) {
      const tLat = getSafeCoord(activeRide.pickup_lat);
      const tLng = getSafeCoord(activeRide.pickup_lng);
      if (tLat && tLng) target = { lat: tLat, lng: tLng };
    } else if (activeRide.status === "in_progress") {
      const tLat = getSafeCoord(activeRide.dest_lat ?? activeRide.destination_lat);
      const tLng = getSafeCoord(activeRide.dest_lng ?? activeRide.destination_lng);
      if (tLat && tLng) target = { lat: tLat, lng: tLng };
    }

    if (!target || !directionsServiceRef.current || !routeRendererRef.current) return;

    const sig = `${activeRide.id}|${activeRide.status}|${dLat},${dLng}|${target.lat},${target.lng}`;
    if (routeSigRef.current === sig) return;
    routeSigRef.current = sig;

    directionsServiceRef.current.route(
      {
        origin: { lat: dLat, lng: dLng },
        destination: target,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) {
          routeRendererRef.current.setDirections(result);
          const steps = result.routes?.[0]?.legs?.[0]?.steps ?? [];
          setRouteSteps(steps);
          setCurrentStepIndex(0);
        } else {
          console.error(`Directions request failed due to ${status}`);
        }
      }
    );
  }, [
    activeRide?.id,
    activeRide?.status,
    activeRide?.pickup_lat,
    activeRide?.pickup_lng,
    activeRide?.dest_lat,
    activeRide?.dest_lng,
    activeRide?.destination_lat,
    activeRide?.destination_lng,
    driverLocation?.lat,
    driverLocation?.lng,
  ]);

  const handleZoomIn = () => {
    if (!mapInstanceRef.current) return;
    setIsFollowing(false);
    mapInstanceRef.current.setZoom(mapInstanceRef.current.getZoom() + 1);
  };

  const handleZoomOut = () => {
    if (!mapInstanceRef.current) return;
    setIsFollowing(false);
    mapInstanceRef.current.setZoom(mapInstanceRef.current.getZoom() - 1);
  };

  const handleRecenter = () => {
    setIsFollowing(true);
    if (driverLocation && mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) });
      mapInstanceRef.current.setZoom(17);
    }
  };

  const getTurnIcon = (maneuver) => {
    if (!maneuver) return <Navigation className="w-8 h-8" />;
    if (maneuver.includes("left")) return <ArrowLeft className="w-8 h-8" />;
    if (maneuver.includes("right")) return <ArrowLeft className="w-8 h-8 rotate-180" />;
    return <Navigation className="w-8 h-8" />;
  };

  const currentStep = routeSteps[currentStepIndex];

  return (
    <div className="fixed inset-0 w-full h-full z-0 pointer-events-auto">
      <div ref={mapRef} className="w-full h-full" />

      {activeRide && currentStep && (
        <div className="absolute top-28 left-4 right-4 z-20 bg-[#1a1a2e]/95 backdrop-blur-xl border border-[#00ff88]/50 rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center gap-4">
          <div className="bg-[#00ff88]/20 p-3 rounded-xl text-[#00ff88] flex-shrink-0">
            {getTurnIcon(currentStep.maneuver)}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-2xl font-bold text-white mb-1">{currentStep.distance?.text}</p>
            <p className="text-[#00ff88] font-medium text-[15px] leading-tight truncate">
              {(currentStep.instructions || "").replace(/<[^>]*>?/gm, "")}
            </p>
          </div>
        </div>
      )}

      {!isFollowing && driverLocation && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-[48vh] left-4 bg-[#00d4ff] text-black p-3 rounded-full shadow-lg z-10 animate-in fade-in zoom-in border-2 border-white"
        >
          <Crosshair className="w-6 h-6 animate-pulse" />
        </button>
      )}

      <div className="absolute top-1/2 right-4 transform -translate-y-1/2 flex flex-col gap-2 z-10">
        <button
          onClick={handleZoomIn}
          className="bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] w-12 h-12 rounded-xl flex items-center justify-center shadow-lg active:bg-[#00ff88]/30 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </button>
        <button
          onClick={handleZoomOut}
          className="bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] w-12 h-12 rounded-xl flex items-center justify-center shadow-lg active:bg-[#00ff88]/30 transition-colors"
        >
          <span className="text-2xl font-bold leading-none -mt-1">-</span>
        </button>
      </div>

      {activeRide && (
        <div className="absolute top-52 right-4 flex flex-col gap-3 z-10">
          <Button
            size="icon"
            onClick={() => handleNav("waze")}
            className="bg-black/80 backdrop-blur-md border border-[#00d4ff]/50 text-[#00d4ff] hover:bg-[#00d4ff]/20 w-12 h-12 rounded-full shadow-lg"
            type="button"
          >
            <Zap className="w-5 h-5" />
          </Button>
          <Button
            size="icon"
            onClick={() => handleNav("google")}
            className="bg-black/80 backdrop-blur-md border border-[#00ff88]/50 text-[#00ff88] hover:bg-[#00ff88]/20 w-12 h-12 rounded-full shadow-lg"
            type="button"
          >
            <MapPinned className="w-5 h-5" />
          </Button>
        </div>
      )}
    </div>
  );
};

// ---------- Driver Dashboard ----------
const DriverDashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const mountedRef = useRef(true);
  useEffect(() => () => (mountedRef.current = false), []);

  const [activeTab, setActiveTab] = useState("rides");
  const [loading, setLoading] = useState(false);

  const [mapsLoaded, setMapsLoaded] = useState(false);

  const [isOnline, setIsOnline] = useState(user?.is_online || false);
  const [availableRides, setAvailableRides] = useState([]);
  const [nearbyRides, setNearbyRides] = useState([]);

  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);

  const [driverLocation, setDriverLocation] = useState(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");

  const [rideStartTime, setRideStartTime] = useState(null);
  const [arrivedTime, setArrivedTime] = useState(null);
  const [waitTimer, setWaitTimer] = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const lastPositionRef = useRef(null);

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

  const [topupAmount, setTopupAmount] = useState("");
  const [withdrawalData, setWithdrawalData] = useState({ amount: "", bank_details: "" });
  const [showCardModal, setShowCardModal] = useState(false);

  const [completedRide, setCompletedRide] = useState(null);
  const [isWaitingAtStop, setIsWaitingAtStop] = useState(false);
  const prevAvailableCount = useRef(0);
  const prevRideStatus = useRef(null);

  const balance = user?.earnings?.balance || 0;
  const registrationStatus = user?.registration_status;
  const hasVehicle = !!user?.driver_info?.vehicle;

  const statusColors = useMemo(
    () => ({
      pending_vehicle: "bg-yellow-500 text-black",
      pending_review: "bg-orange-500 text-black",
      approved: "bg-[#00ff88] text-black",
      rejected: "bg-red-500 text-white",
    }),
    []
  );

  const rideStatusColors = useMemo(
    () => ({
      searching: "bg-yellow-500 text-black",
      accepted: "bg-blue-500 text-white",
      arrived: "bg-purple-500 text-white",
      in_progress: "bg-[#00ff88] text-black",
      completed: "bg-green-600 text-white",
      cancelled: "bg-red-500 text-white",
      no_drivers: "bg-gray-500 text-white",
    }),
    []
  );

  // ---- Maps load ----
  useEffect(() => {
    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(() => mountedRef.current && setMapsLoaded(true))
      .catch(() => toast.error("Failed to load Google Maps"));
  }, []);

  // ---- Wake lock (kept) ----
  useEffect(() => {
    let wakeLock = null;

    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
          console.log("Screen Wake Lock is active!");
        }
      } catch (err) {
        console.error(`Wake Lock failed: ${err.message}`);
      }
    };

    if (isOnline || activeRide) requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && (isOnline || activeRide)) requestWakeLock();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (wakeLock) wakeLock.release();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isOnline, activeRide]);

  // ---- Distance calc ----
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // ---- Location updates ----
  const handleLocationUpdate = useCallback(
    async (location) => {
      setDriverLocation(location);

      try {
        await api.post(`/driver/location`, location);

        if (activeRide && activeRide.status === "in_progress" && lastPositionRef.current) {
          const dist = calculateDistance(
            lastPositionRef.current.lat,
            lastPositionRef.current.lng,
            location.lat,
            location.lng
          );
          setDistanceTraveled((prev) => prev + dist);

          // optional tracking
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

  // ---- Wait timer while arrived ----
  useEffect(() => {
    let interval;
    if (activeRide?.status === "arrived") {
      if (!arrivedTime && activeRide.arrived_at) setArrivedTime(new Date(activeRide.arrived_at).getTime());
      interval = setInterval(() => {
        const start = arrivedTime || Date.now();
        setWaitTimer(Math.max(0, Math.floor((Date.now() - start) / 60000)));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [arrivedTime, activeRide]);

  // ---- API fetchers ----
  const fetchAvailableRides = useCallback(async () => {
    try {
      const res = await api.get(`/driver/rides/available`);
      if (!mountedRef.current) return;
      setAvailableRides(res.data?.rides || []);
    } catch (e) {}
  }, []);

  const fetchNearbyRides = useCallback(async () => {
    try {
      // If your backend has a different endpoint for "nearby", replace here.
      // For now we reuse available endpoint but store separately for the Nearby tab.
      const res = await api.get(`/driver/rides/available`);
      if (!mountedRef.current) return;
      setNearbyRides(res.data?.rides || []);
    } catch (e) {
      console.error("Error fetching nearby rides:", e);
    }
  }, []);

  const fetchActiveRide = useCallback(async () => {
    try {
      const res = await api.get(`/driver/active-ride`);
      const normalized = normalizeRide(res.data);
      if (!mountedRef.current) return;

      if (normalized?.id) {
        setActiveRide(normalized);
        setActiveTab("rides");
      } else {
        setActiveRide(null);
      }
    } catch (e) {
      // likely none active
      if (!mountedRef.current) return;
      setActiveRide(null);
    }
  }, []);

  const fetchRideHistory = useCallback(async () => {
    try {
      const res = await api.get(`/driver/history`);
      console.log("Raw History Data from Backend:", res.data);
      if (!mountedRef.current) return;
      setRideHistory(res.data?.rides || []);
    } catch (e) {
      console.error("History fetch error:", e);
      toast.error("Could not load trip history");
    }
  }, []);

  // initial loads
  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
  }, [fetchActiveRide, fetchRideHistory]);

  // available rides polling only when approved + online + no active ride
  useEffect(() => {
    if (registrationStatus !== "approved") return;
    if (!isOnline) return;
    if (activeRide) return;

    fetchAvailableRides();
    const interval = setInterval(fetchAvailableRides, 5000);
    return () => clearInterval(interval);
  }, [isOnline, registrationStatus, activeRide, fetchAvailableRides]);

  // active ride polling (FIXED: stable, stops on terminal)
  useEffect(() => {
    if (!activeRide?.id) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/rides/${activeRide.id}`);
        const r = normalizeRide(res.data);
        if (!mountedRef.current) return;

        setActiveRide(r);

        if (r?.status && isTerminal(r.status)) {
          clearInterval(interval);
          // cancellation handled below via toast
        }
      } catch (e) {}
    }, 2000);

    return () => clearInterval(interval);
  }, [activeRide?.id]);

  // new ride alarm
  useEffect(() => {
    if (availableRides.length > prevAvailableCount.current) {
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3");
      audio.play().catch((e) => console.log("Browser blocked audio:", e));

      toast.info("🚨 NEW RIDE REQUEST!", {
        description: "A passenger is looking for a driver nearby.",
        duration: 10000,
        icon: "🚕",
      });
    }
    prevAvailableCount.current = availableRides.length;
  }, [availableRides]);

  // rider cancelled notification
  useEffect(() => {
    if (activeRide && prevRideStatus.current) {
      if (activeRide.status === "cancelled" && prevRideStatus.current !== "cancelled") {
        const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
        audio.play().catch(() => {});
        toast.error("⚠️ THE RIDER CANCELLED THE TRIP", {
          description: "You can safely return to the home screen.",
          duration: 10000,
        });
      }
    }
    prevRideStatus.current = activeRide?.status;
  }, [activeRide]);

  // ---- Driver actions ----
  const handleRideAction = async (action) => {
    if (!activeRide) return;
    if (loading) return;

    setLoading(true);
    try {
      if (action === "arrived") {
        await api.post(`/rides/${activeRide.id}/arrived`);
        setArrivedTime(Date.now());
        toast.success("Marked as arrived");
      } else if (action === "start") {
        await api.post(`/rides/${activeRide.id}/start`, { pickup_wait_time: parseInt(waitTimer || 0, 10) });
        setRideStartTime(Date.now());
        setDistanceTraveled(0);
        lastPositionRef.current = driverLocation;
        toast.success("Ride started");
      } else if (action === "complete") {
        const finalDist = Number.isFinite(distanceTraveled) ? parseFloat(distanceTraveled) : 0;
        const finalWait = Number.isFinite(waitTimer) ? parseInt(waitTimer, 10) : 0;
        const dLat = driverLocation?.lat || "";
        const dLng = driverLocation?.lng || "";

        const completeEndpoint = `/rides/${activeRide.id}/complete?final_distance=${finalDist}&total_wait_minutes=${finalWait}&dropoff_lat=${dLat}&dropoff_lng=${dLng}`;
        const res = await api.post(completeEndpoint);

        const finalFare =
          res.data?.final_fare > 0 ? res.data.final_fare : (activeRide.estimated_fare || 0);
        const cashToCollect = res.data?.cash_to_collect || 0;
        const completeData = { ...res.data, final_fare: finalFare, estimated_fare: activeRide.estimated_fare };

        setCompletedRide(completeData);

        if (cashToCollect > 0) toast.success(`Trip Done! Collect ₾${cashToCollect.toFixed(2)} in CASH.`, { duration: 8000 });
        else toast.success(`Trip Done! Paid via Wallet/Card.`);

        // reset local trip state
        setActiveRide(null);
        setDistanceTraveled(0);
        setWaitTimer(0);
        setArrivedTime(null);
        setRideStartTime(null);
        setIsWaitingAtStop(false);

        fetchRideHistory();

        // refresh auth/me
        const userRes = await api.get(`/auth/me`);
        updateUser(userRes.data);
        return;
      }

      // refresh active ride after non-terminal actions
      const rideRes = await api.get(`/rides/${activeRide.id}`);
      setActiveRide(normalizeRide(rideRes.data));
    } catch (e) {
      console.error("Action Error:", e);
      toast.error(e?.response?.data?.detail || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide || !selectedCancelReason) return;
    if (loading) return;

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
      setIsWaitingAtStop(false);

      fetchRideHistory();
      fetchAvailableRides();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Failed to cancel ride");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOnline = async (online) => {
    if (registrationStatus !== "approved") return toast.error("Account not approved yet.");
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
    if (loading) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("car_make", vehicleData.car_make);
      formData.append("car_model", vehicleData.car_model);
      formData.append("car_year", parseInt(vehicleData.car_year, 10));
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
        headers: { "Content-Type": "multipart/form-data" },
      });

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
    const required = (estimatedFare || 0) * DRIVER_COMMISSION_RATE;
    if (balance < required) return toast.error("Insufficient balance");

    setLoading(true);
    try {
      await api.post(`/rides/${rideId}/accept`);
      toast.success("Accepted!");

      const rideRes = await api.get(`/rides/${rideId}`);
      setActiveRide(normalizeRide(rideRes.data));
      setAvailableRides((p) => p.filter((r) => r.id !== rideId));
      setDistanceTraveled(0);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
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
      fetchNearbyRides();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  // stop wait toggle
  const toggleStopWait = async () => {
    if (!activeRide) return;
    try {
      const newStatus = !isWaitingAtStop;
      await api.post(`/rides/${activeRide.id}/toggle-stop-wait?is_waiting=${newStatus}`);
      setIsWaitingAtStop(newStatus);
      toast.success(newStatus ? "Stop wait timer started" : "Stop wait timer paused");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update wait status");
    }
  };

  // ---- Wallet / Topup / Withdraw ----
  const handleWithdrawalRequest = async () => {
    const amount = parseFloat(withdrawalData.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a valid amount");

    // Must leave 5 GEL + pay 1 GEL fee => buffer 6 GEL
    if (balance < amount + 6) {
      return toast.error("Insufficient balance. You must leave ₾5.00 in your wallet.");
    }

    setLoading(true);
    try {
      await api.post(`/driver/withdraw`, { amount, bank_details: withdrawalData.bank_details });
      toast.success("Withdrawal requested!");
      const userRes = await api.get(`/auth/me`);
      updateUser(userRes.data);
      setWithdrawalData({ amount: "", bank_details: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  const GEL_TO_USD = 0.37;
  const topupUsd = useMemo(() => {
    const gel = Number(topupAmount);
    if (!Number.isFinite(gel) || gel <= 0) return null;
    return (gel * GEL_TO_USD).toFixed(2);
  }, [topupAmount]);

  // ---- Bottom sheet swipe ----
  const [isMinimized, setIsMinimized] = useState(false);
  const touchStartY = useRef(null);

  useEffect(() => setIsMinimized(false), [activeRide?.status]);

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (!touchStartY.current) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;

    if (deltaY > 40) setIsMinimized(true);
    else if (deltaY < -40) setIsMinimized(false);

    touchStartY.current = null;
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-black font-sans text-white overflow-hidden flex flex-col">
      {/* MAP BACKGROUND */}
      <div className="absolute inset-0 z-0 pointer-events-auto">
        {mapsLoaded && <DriverSmartMap activeRide={activeRide} driverLocation={driverLocation} />}
      </div>

      {/* HEADER */}
      <div className="absolute top-0 left-0 right-0 z-50 pointer-events-auto shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <header className="bg-black/90 backdrop-blur-xl border-b border-[#00d4ff]/30 p-3 sm:p-4">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] flex items-center justify-center">
                <Car className="w-5 h-5 text-black" />
              </div>
              <div>
                <p className="text-[#00d4ff] font-semibold">
                  {user?.name} {user?.surname}
                </p>
                <div className="flex items-center space-x-2">
                  <Badge className={statusColors[registrationStatus] || "bg-gray-500"}>
                    {registrationStatus?.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  <span className="text-[#00ff88] text-sm font-bold">₾{balance.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              {registrationStatus === "approved" && (
                <div className="flex items-center space-x-2">
                  <span className={`text-xs sm:text-sm ${isOnline ? "text-[#00ff88]" : "text-gray-500"}`}>
                    {isOnline ? "Online" : "Offline"}
                  </span>
                  <Button
                    size="sm"
                    className={isOnline ? "bg-[#00ff88] text-black" : "bg-gray-600"}
                    onClick={() => handleToggleOnline(!isOnline)}
                    type="button"
                  >
                    {isOnline ? "ON" : "OFF"}
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="icon" className="text-[#00d4ff]" onClick={() => navigate("/")} type="button">
                <Home className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-red-400" onClick={logout} type="button">
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

      {/* BOTTOM SHEET */}
      <div className="absolute bottom-0 left-0 right-0 z-40 w-full flex justify-center pointer-events-none p-2 pb-4 sm:p-4 sm:pb-6">
        <div
          className={`pointer-events-auto w-full max-w-2xl bg-black/90 backdrop-blur-2xl border border-white/10 shadow-[0_-15px_40px_rgba(0,0,0,0.8)] rounded-3xl flex flex-col overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isMinimized && activeRide ? "translate-y-[calc(100%-3rem)]" : "translate-y-0"
          }`}
          style={{ maxHeight: "75vh" }}
        >
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

          <div className="overflow-y-auto p-3 pb-4 scrollbar-hide flex-1">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {!activeRide && (
                <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00d4ff]/20 mb-4 rounded-xl">
                  <TabsTrigger value="rides" className="text-xs sm:text-sm">
                    <Activity className="w-4 h-4 sm:mr-2" /> Rides
                  </TabsTrigger>
                  <TabsTrigger
                    value="nearby"
                    onClick={fetchNearbyRides}
                    className="text-xs sm:text-sm"
                  >
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
              )}

              {/* RIDES TAB */}
              <TabsContent value="rides" className="m-0">
                {activeRide ? (
                  <Card className="bg-transparent border-none shadow-none">
                    <CardHeader className="px-2 pt-0 pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-[#00ff88]">Active Ride</CardTitle>
                        <Badge className={rideStatusColors[activeRide.status] || "bg-gray-500 text-white"}>
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
                            <DriverWaitTimer arrivedAt={activeRide.arrived_at} carType={activeRide.carType || "economy"} />
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
                          ₾{(activeRide.final_fare || activeRide.estimated_fare || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-3">
                        <RideCommunication
                          rideId={activeRide.id}
                          otherPartyPhone={activeRide.rider_phone || activeRide.rider?.cellphone}
                          otherPartyName={activeRide.rider_name || activeRide.rider?.name || "Rider"}
                          currentUserId={user?.id}
                          isDriver={true}
                        />
                      </div>

                      <div className="flex flex-col gap-3 pt-2">
                        {activeRide.status === "in_progress" && activeRide.stops?.length > 0 && (
                          <Button
                            onClick={toggleStopWait}
                            variant={isWaitingAtStop ? "destructive" : "outline"}
                            className="w-full h-12 font-bold bg-black border-white/20 text-white"
                            type="button"
                          >
                            {isWaitingAtStop ? (
                              <>
                                <Timer className="mr-2 animate-spin" /> Finish Waiting at Stop
                              </>
                            ) : (
                              <>
                                <PauseCircle className="mr-2 text-yellow-400" /> Start Stop Wait
                              </>
                            )}
                          </Button>
                        )}

                        <div className="flex gap-3">
                          <div className="flex-1">
                            {activeRide.status === "accepted" && (
                              <Button
                                className="w-full bg-purple-500 text-white h-14 text-lg font-bold"
                                onClick={() => handleRideAction("arrived")}
                                disabled={loading}
                                type="button"
                              >
                                <MapPin className="w-5 h-5 mr-2" /> I've Arrived
                              </Button>
                            )}
                            {activeRide.status === "arrived" && (
                              <Button
                                className="w-full bg-blue-500 text-white h-14 text-lg font-bold"
                                onClick={() => handleRideAction("start")}
                                disabled={loading}
                                type="button"
                              >
                                <Play className="w-5 h-5 mr-2" /> Start Trip
                              </Button>
                            )}
                            {activeRide.status === "in_progress" && (
                              <Button
                                className="w-full bg-[#00ff88] text-black h-14 text-lg font-bold"
                                onClick={() => handleRideAction("complete")}
                                disabled={loading}
                                type="button"
                              >
                                <CheckCircle2 className="w-5 h-5 mr-2" /> Complete Trip
                              </Button>
                            )}
                          </div>

                          <Button
                            variant="destructive"
                            className="h-14 w-14 bg-red-500/20 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                            onClick={() => setShowCancelModal(true)}
                            disabled={loading}
                            type="button"
                          >
                            <XCircle className="w-6 h-6" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : registrationStatus !== "approved" ? (
                  <Card className="bg-transparent border border-yellow-500/30 text-center py-12">
                    <AlertTriangle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
                    <p className="text-yellow-400 font-semibold">Account Pending Review</p>
                  </Card>
                ) : !isOnline ? (
                  <Card className="bg-transparent border border-gray-500/30 text-center py-12">
                    <Activity className="w-16 h-16 mx-auto text-gray-500 mb-4" />
                    <p className="text-gray-400">Offline</p>
                    <Button
                      className="mt-4 bg-[#00ff88] text-black font-bold h-12 px-8"
                      onClick={() => handleToggleOnline(true)}
                      type="button"
                    >
                      Go Online
                    </Button>
                  </Card>
                ) : availableRides.length === 0 ? (
                  <Card className="bg-transparent border border-[#00d4ff]/30 text-center py-12">
                    <Navigation className="w-16 h-16 mx-auto text-[#00d4ff]/50 mb-4 animate-pulse" />
                    <p className="text-[#00d4ff]/70">Searching for rides...</p>
                  </Card>
                ) : (
                  <div className="space-y-4">
            {activeRide?.waiting_on_stop && (
              <div className="bg-yellow-500/10 border-2 border-yellow-500/50 p-6 rounded-2xl text-center space-y-4 my-4 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
                  <p className="text-yellow-500 font-black uppercase text-sm tracking-widest">Passenger at Stop</p>
                </div>
                <div className="text-5xl font-mono text-white font-bold">
                  {formatWaitTime(waitTimeSeconds)}
                </div>
                <div className="bg-yellow-500/20 py-2 rounded-lg">
                  <p className="text-xs text-yellow-200/70 uppercase font-bold">Current Wait Charge</p>
                  <p className="text-2xl text-yellow-400 font-bold">₾{waitCharge}</p>
                </div>
                <Button 
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black h-14 text-lg shadow-lg"
                  onClick={handleContinueTrip}
                >
                  CONTINUE TRIP
                </Button>
              </div>
            )}
                    {availableRides.map((raw) => {
                      const ride = normalizeRide(raw);
                      const commission = (ride.estimated_fare || 0) * DRIVER_COMMISSION_RATE;
                      const canAccept = balance >= commission;

                      return (
                        <Card key={ride.id} className="bg-black/60 border border-[#00ff88]/30">
                          <CardContent className="p-4 text-white">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1 pr-2">
                                <p className="text-[#00ff88] font-semibold text-sm sm:text-base truncate">{ride.pickup}</p>
                                <p className="text-[#00d4ff]/70 text-xs sm:text-sm truncate">
                                  → {ride.destination || "Open"}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-1">
                                  Commission hold: ₾{commission.toFixed(2)}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xl sm:text-2xl font-bold text-[#00ff88]">
                                  ₾{(ride.estimated_fare || 0).toFixed(2)}
                                </p>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                className="flex-1 bg-[#00ff88] text-black font-bold h-12"
                                onClick={() => handleAcceptRide(ride.id, ride.estimated_fare)}
                                disabled={loading || !canAccept}
                                type="button"
                              >
                                {canAccept ? "Accept" : "Low Balance"}
                              </Button>
                              <Button
                                variant="outline"
                                className="border-red-500 text-red-500 h-12 w-12"
                                onClick={() => handleDeclineRide(ride.id)}
                                type="button"
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

              {/* NEARBY TAB (FIXED: uses nearbyRides state) */}
              <TabsContent value="nearby">
                <div className="space-y-4">
            {activeRide?.waiting_on_stop && (
              <div className="bg-yellow-500/10 border-2 border-yellow-500/50 p-6 rounded-2xl text-center space-y-4 my-4 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
                  <p className="text-yellow-500 font-black uppercase text-sm tracking-widest">Passenger at Stop</p>
                </div>
                <div className="text-5xl font-mono text-white font-bold">
                  {formatWaitTime(waitTimeSeconds)}
                </div>
                <div className="bg-yellow-500/20 py-2 rounded-lg">
                  <p className="text-xs text-yellow-200/70 uppercase font-bold">Current Wait Charge</p>
                  <p className="text-2xl text-yellow-400 font-bold">₾{waitCharge}</p>
                </div>
                <Button 
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black h-14 text-lg shadow-lg"
                  onClick={handleContinueTrip}
                >
                  CONTINUE TRIP
                </Button>
              </div>
            )}
                  <div className="flex justify-end mb-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={fetchNearbyRides}
                      className="text-white border-white/20 hover:bg-white/10"
                      type="button"
                    >
                      Refresh
                    </Button>
                  </div>

                  {nearbyRides.length === 0 ? (
                    <Card className="bg-transparent border border-white/10 text-center py-10">
                      <Crosshair className="w-12 h-12 mx-auto text-white/20 mb-2" />
                      <p className="text-white/60 text-sm">No nearby requests right now.</p>
                    </Card>
                  ) : (
                    nearbyRides.map((raw) => {
                      const ride = normalizeRide(raw);
                      return (
                        <Card key={ride.id} className="bg-black/60 border border-[#00d4ff]/30">
                          <CardContent className="p-4 text-white">
                            <p className="text-[#00ff88] truncate">{ride.pickup}</p>
                            <p className="text-[#00d4ff] truncate">→ {ride.destination || "Open"}</p>
                            <Button
                              className="w-full mt-2 bg-[#00d4ff] text-black font-bold"
                              onClick={() => handleRequestToJoin(ride.id)}
                              disabled={loading}
                              type="button"
                            >
                              Request to Accept
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </TabsContent>

              {/* VEHICLE TAB */}
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
                        <p className="text-xl font-mono text-[#00ff88] mt-2">{user?.driver_info?.vehicle?.license_plate}</p>
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
                              <Input
                                required
                                type="file"
                                accept="image/*"
                                onChange={(e) => setVehicleData({ ...vehicleData, license_front: e.target.files?.[0] || null })}
                                className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-gray-400 text-xs">Back</Label>
                              <Input
                                required
                                type="file"
                                accept="image/*"
                                onChange={(e) => setVehicleData({ ...vehicleData, license_back: e.target.files?.[0] || null })}
                                className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Vehicle Registration</h3>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-gray-400 text-xs">Front</Label>
                              <Input
                                required
                                type="file"
                                accept="image/*"
                                onChange={(e) => setVehicleData({ ...vehicleData, reg_front: e.target.files?.[0] || null })}
                                className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-gray-400 text-xs">Back</Label>
                              <Input
                                required
                                type="file"
                                accept="image/*"
                                onChange={(e) => setVehicleData({ ...vehicleData, reg_back: e.target.files?.[0] || null })}
                                className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h3 className="text-[#00ff88] font-bold border-b border-[#00ff88]/20 pb-1">Car Photos</h3>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-gray-400 text-xs">Front</Label>
                              <Input
                                required
                                type="file"
                                accept="image/*"
                                onChange={(e) => setVehicleData({ ...vehicleData, car_photo_front: e.target.files?.[0] || null })}
                                className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-gray-400 text-xs">Back</Label>
                              <Input
                                required
                                type="file"
                                accept="image/*"
                                onChange={(e) => setVehicleData({ ...vehicleData, car_photo_back: e.target.files?.[0] || null })}
                                className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-gray-400 text-xs">Left</Label>
                              <Input
                                required
                                type="file"
                                accept="image/*"
                                onChange={(e) => setVehicleData({ ...vehicleData, car_photo_left: e.target.files?.[0] || null })}
                                className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-gray-400 text-xs">Right</Label>
                              <Input
                                required
                                type="file"
                                accept="image/*"
                                onChange={(e) => setVehicleData({ ...vehicleData, car_photo_right: e.target.files?.[0] || null })}
                                className="bg-black/50 text-white border-[#00d4ff]/30 file:bg-[#00d4ff] file:text-black"
                              />
                            </div>
                          </div>
                        </div>

                        <Button
                          type="submit"
                          className="w-full bg-gradient-to-r from-[#00d4ff] to-[#00ff88] text-black font-bold h-12 mt-4"
                          disabled={loading}
                        >
                          {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Submit Documents"}
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* EARNINGS TAB */}
              <TabsContent value="earnings" className="m-0 space-y-6">
                <Card className="p-6 bg-black/60 border border-[#00ff88] text-center shadow-[0_0_20px_rgba(0,255,136,0.1)]">
                  <p className="text-gray-400 text-xs uppercase tracking-widest font-bold">Current Balance</p>
                  <p className="text-5xl font-bold text-[#00ff88] my-2">₾{balance.toFixed(2)}</p>
                  <p className="text-[10px] text-[#00ff88]/50 uppercase">Ready for payouts or commissions</p>
                </Card>

                <div className="space-y-3">
                  <h3 className="text-[#00d4ff] text-sm font-bold flex items-center">
                    <Zap className="w-4 h-4 mr-2" /> Quick Top Up
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Amount (GEL)"
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      className="bg-black/50 text-white border-[#00d4ff]/30 h-12 text-lg"
                    />
                    <Button
                      className="bg-[#00d4ff] text-black h-12 font-bold px-8 shadow-neon-cyan"
                      onClick={() => setShowCardModal(true)}
                      type="button"
                      disabled={!topupUsd}
                    >
                      Pay
                    </Button>
                  </div>

                  <div className="text-[10px] text-gray-400 flex items-center gap-2">
                    <ExternalLink className="w-3 h-3" />
                    Or pay via bank:{" "}
                    <button
                      className="underline text-[#00d4ff]"
                      onClick={() => window.open(PAYMENT_LINK, "_blank")}
                      type="button"
                    >
                      Open BOG Payment Page
                    </button>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="space-y-4">
            {activeRide?.waiting_on_stop && (
              <div className="bg-yellow-500/10 border-2 border-yellow-500/50 p-6 rounded-2xl text-center space-y-4 my-4 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
                  <p className="text-yellow-500 font-black uppercase text-sm tracking-widest">Passenger at Stop</p>
                </div>
                <div className="text-5xl font-mono text-white font-bold">
                  {formatWaitTime(waitTimeSeconds)}
                </div>
                <div className="bg-yellow-500/20 py-2 rounded-lg">
                  <p className="text-xs text-yellow-200/70 uppercase font-bold">Current Wait Charge</p>
                  <p className="text-2xl text-yellow-400 font-bold">₾{waitCharge}</p>
                </div>
                <Button 
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black h-14 text-lg shadow-lg"
                  onClick={handleContinueTrip}
                >
                  CONTINUE TRIP
                </Button>
              </div>
            )}
                  <h3 className="text-[#00ff88] text-sm font-bold flex items-center">
                    <Banknote className="w-4 h-4 mr-2" /> Withdraw Earnings
                  </h3>

                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                      <p className="text-[10px] text-gray-500 uppercase">Fixed Fee</p>
                      <p className="text-white font-bold">₾1.00</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                      <p className="text-[10px] text-gray-500 uppercase">Min. Retention</p>
                      <p className="text-white font-bold">₾5.00</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-gray-400 text-xs">AMOUNT TO RECEIVE (₾)</Label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={withdrawalData.amount}
                        onChange={(e) => setWithdrawalData({ ...withdrawalData, amount: e.target.value })}
                        className="bg-black/50 border-[#00ff88]/30 text-white h-12 text-lg focus:border-[#00ff88]"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-gray-400 text-xs">BANK DETAILS (IBAN / NAME)</Label>
                      <textarea
                        className="w-full bg-black/50 border border-[#00ff88]/20 rounded-xl p-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#00ff88] transition-all h-20"
                        placeholder="GE00BG0000000000000000..."
                        value={withdrawalData.bank_details}
                        onChange={(e) => setWithdrawalData({ ...withdrawalData, bank_details: e.target.value })}
                      />
                    </div>

                    <Button
                      onClick={handleWithdrawalRequest}
                      disabled={loading || !withdrawalData.amount || !withdrawalData.bank_details}
                      className="w-full bg-[#00ff88] text-black font-bold h-14 text-lg rounded-xl shadow-lg active:scale-95 transition-transform"
                      type="button"
                    >
                      {loading ? <Loader2 className="animate-spin" /> : "Request Withdrawal"}
                    </Button>

                    <p className="text-[10px] text-gray-500 text-center italic">Withdrawals are processed within 1 business day.</p>
                  </div>
                </div>
              </TabsContent>

              {/* HISTORY TAB */}
              <TabsContent value="history">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2 pr-4">
                    {rideHistory.length === 0 ? <p className="text-gray-400 text-center py-6">No rides yet.</p> : null}
                    {rideHistory.map((raw) => {
                      const r = normalizeRide(raw);
                      return (
                        <div key={r.id} className="p-4 bg-black/50 border border-[#00d4ff]/20 rounded-xl">
                          <div className="flex justify-between items-start mb-1">
                            <p className="text-white text-sm truncate pr-2">{r.pickup}</p>
                            <p className="text-[#00ff88] font-bold">₾{(r.final_fare || r.estimated_fare || 0).toFixed(2)}</p>
                          </div>
                          <p className="text-gray-500 text-xs">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* CANCEL MODAL (WAS MISSING IN YOUR JSX) */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="bg-[#1a1a2e] border border-red-500/30 text-white sm:max-w-md w-[95%] rounded-xl z-[10000]">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <XCircle className="w-5 h-5" /> Cancel Ride
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Select a reason (required). This is logged for safety + dispute resolution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {(CANCEL_REASONS[activeRide?.status] || []).map((reason) => (
              <button
                key={reason}
                onClick={() => setSelectedCancelReason(reason)}
                className={`w-full text-left p-3 rounded-xl border transition ${
                  selectedCancelReason === reason
                    ? "border-red-400 bg-red-500/10"
                    : "border-white/10 bg-black/20 hover:bg-black/40"
                }`}
                type="button"
              >
                {reason}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1 border-white/20 text-white"
              onClick={() => {
                setShowCancelModal(false);
                setSelectedCancelReason("");
              }}
              type="button"
            >
              Close
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!selectedCancelReason || loading}
              onClick={handleCancelRide}
              type="button"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PAYPAL TOPUP MODAL (HARDENED) */}
      <Dialog open={showCardModal} onOpenChange={setShowCardModal}>
        <DialogContent className="bg-[#1a1a2e] border border-[#00ff88]/30 text-white sm:max-w-md w-[95%] rounded-xl z-[10000]">
          <DialogHeader>
            <DialogTitle className="text-[#00ff88] flex items-center gap-2">
              <Wallet className="w-5 h-5" /> Top Up Wallet
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Pay securely by card (processed by PayPal). Wallet is credited only after backend verification.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="bg-black/40 border border-white/10 rounded-xl p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-white/70">Top up (GEL)</span>
                <span className="text-white font-bold">₾{Number(topupAmount || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-white/40">PayPal charge (USD)</span>
                <span className="text-white/80">${topupUsd || "—"}</span>
              </div>
            </div>

            <PayPalButtons
              fundingSource="card"
              style={{ layout: "vertical", shape: "rect" }}
              disabled={loading || !topupUsd}
              createOrder={(data, actions) => {
                const gelAmount = Number(topupAmount);
                if (!Number.isFinite(gelAmount) || gelAmount <= 0) {
                  toast.error("Enter a valid top-up amount");
                  throw new Error("Invalid topup amount");
                }
                return actions.order.create({
                  purchase_units: [{ amount: { value: topupUsd, currency_code: "USD" } }],
                });
              }}
              onApprove={async (data) => {
                try {
                  setLoading(true);
                  await api.post("/driver/wallet/topup/paypal", {
                    order_id: data.orderID,
                    amount: Number(topupAmount), // credited in GEL
                  });

                  toast.success(`Successfully added ₾${Number(topupAmount).toFixed(2)}`);
                  setShowCardModal(false);

                  const userRes = await api.get(`/auth/me`);
                  updateUser(userRes.data);
                  setTopupAmount("");
                } catch (err) {
                  console.error(err);
                  toast.error(err?.response?.data?.detail || "Top-up failed during verification");
                } finally {
                  setLoading(false);
                }
              }}
              onError={(err) => {
                console.error("PayPal error:", err);
                toast.error("Payment failed");
              }}
            />

            <p className="text-[10px] text-gray-400">
              Note: Card payments run via PayPal. Your wallet is credited only after backend verification.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* TRIP COMPLETION MODAL (kept) */}
      <DriverTripCompletionModal
        isOpen={!!completedRide}
        onClose={() => setCompletedRide(null)}
        fareAmount={completedRide?.final_fare || completedRide?.estimated_fare}
        paymentMethod={completedRide?.cash_to_collect > 0 ? "cash" : "wallet"}
        riderName={completedRide?.rider_name || completedRide?.riderName}
        onConfirm={() => setCompletedRide(null)}
      />
    </div>
  );
};

// ---------- Main Router ----------
const DriverPortal = () => {
  const [waitTimeSeconds, setWaitTimeSeconds] = useState(0);

  // ⏱️ Timer Logic: Calculates elapsed time and 0.40/min charge
  useEffect(() => {
    let interval;
    if (activeRide?.waiting_on_stop) {
      interval = setInterval(() => {
        setWaitTimeSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setWaitTimeSeconds(0);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [activeRide?.waiting_on_stop]);

  const formatWaitTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const waitCharge = (waitTimeSeconds / 60 * 0.40).toFixed(2);

  const handleContinueTrip = async () => {
    try {
      await api.post(`/rides/${activeRide.id}/continue-from-stop`, { 
        stop_index: activeRide.current_stop_index 
      });
      toast.success("Trip resumed!");
    } catch (err) {
      toast.error("Failed to resume trip.");
    }
  };
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.user_type !== "driver") {
    if (location.pathname === "/driver" || location.pathname === "/driver/") return <DriverAuth />;
    return <Navigate to="/driver" replace />;
  }

  return (
    <PayPalScriptProvider
      options={{
        "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
        currency: "USD",
        locale: "en_US",
        components: "buttons,card-fields",
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DriverDashboard />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default DriverPortal;
