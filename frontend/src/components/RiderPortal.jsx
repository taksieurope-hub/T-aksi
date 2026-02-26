import React, { useState, useEffect, useRef, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
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
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import RideCommunication from "./RideCommunication";
import {
  Car, MapPin, History, Home, LogOut, User, Navigation, Rocket, ArrowLeft,
  Lock, Phone, MessageSquare, Star, Clock, Shield, AlertTriangle, Loader2,
  Search, X, Crosshair, MapPinned, CheckCircle2, Zap, Activity,
  Plus, TrendingUp, Timer, CreditCard, Target, Route as RouteIcon, Wallet
} from "lucide-react";

// =============================================================================
// PRICING RULES — Must match server.py PRICING_RULES exactly
// =============================================================================
const PRICING_RULES = {
  economy:   { name: "Economy",   base: 2.00, perKm: 0.50, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚗" },
  comfort:   { name: "Comfort",   base: 2.50, perKm: 0.55, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚙" },
  suv:       { name: "SUV / XL",  base: 3.90, perKm: 0.80, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚐" },
  personal:  { name: "Personal",  base: 4.00, perKm: 0.70, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "👤" },
  jumpstart: { name: "Jumpstart", base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, stopFee: 0.00, icon: "⚡" },
};

// Mirrors server.py calculate_fare() exactly
const calculateFare = (carType, distanceKm, waitMin = 0, stopWaitMin = 0, numStops = 0, surgeMultiplier = 1.0, paymentMethod = "cash") => {
  const rules = PRICING_RULES[carType] || PRICING_RULES.economy;

  let subtotal = rules.base;
  subtotal += distanceKm * rules.perKm;

  // Long-distance tiers (mirrors server.py)
  if (distanceKm > 7)  subtotal += (distanceKm - 7)  * 0.15;
  if (distanceKm > 30) subtotal += Math.ceil((distanceKm - 30) / 15) * 5;

  // Wait fees
  const billableWait = Math.max(0, waitMin - rules.freeWait);
  subtotal += billableWait * rules.perMinWait;
  subtotal += stopWaitMin * rules.perMinWait;
  subtotal += numStops * rules.stopFee;

  const surgeFee   = subtotal * (surgeMultiplier - 1.0);
  const serviceFee = paymentMethod === "card" ? 2.00 : 0.00;
  const total      = subtotal + surgeFee + serviceFee;

  return {
    base:            rules.base,
    distance:        Math.round(distanceKm * rules.perKm * 100) / 100,
    wait:            Math.round((billableWait + stopWaitMin) * rules.perMinWait * 100) / 100,
    stops:           numStops * rules.stopFee,
    subtotal:        Math.round(subtotal      * 100) / 100,
    surgeFee:        Math.round(surgeFee      * 100) / 100,
    serviceFee:      parseFloat(serviceFee.toFixed(2)),
    surgeMultiplier,
    total:           Math.round(total         * 100) / 100,
  };
};

// Sanitise a free-text address before sending to API
const sanitiseAddress = (str = "") => str.trim().slice(0, 300);

// =============================================================================
// GOOGLE MAPS AUTOCOMPLETE HOOK
// =============================================================================
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {
  const callbackRef = useRef(onPlaceSelect);
  useEffect(() => { callbackRef.current = onPlaceSelect; }, [onPlaceSelect]);

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      .pac-container { z-index:999999!important; background:#ffffff!important; border:1px solid #e5e7eb!important;
        border-radius:0 0 12px 12px!important; font-family:inherit!important;
        box-shadow:0 10px 40px rgba(0,0,0,.2)!important; position:absolute!important; padding-bottom:8px!important; }
      .pac-item { color:#374151!important; border-top:1px solid #f3f4f6!important;
        padding:12px 16px!important; cursor:pointer!important; font-size:14px!important; }
      .pac-item:hover,.pac-item:active { background:#f3f4f6!important; }
      .pac-item-query { color:#000!important; font-weight:800!important; font-size:15px!important; }
      .pac-logo:after { display:none!important; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (inputRef.current && window.google?.maps?.places) {
        clearInterval(timer);
        const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "ge" },
          fields: ["formatted_address", "geometry", "name"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (place.geometry) {
            callbackRef.current({
              address: sanitiseAddress(place.formatted_address || place.name),
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            });
            if (inputRef.current) inputRef.current.blur();
          }
        });
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);
};

// =============================================================================
// MAP PICKER MODAL
// =============================================================================
const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation }) => {
  const mapRef          = useRef(null);
  const mapInstanceRef  = useRef(null);
  const [address, setAddress]     = useState("Move map to select location...");
  const [isDragging, setIsDragging] = useState(false);
  const [locating, setLocating]   = useState(false);
  const [center, setCenter]       = useState({ lat: 41.7151, lng: 44.8271 });

  useEffect(() => {
    if (initialLocation?.lat) {
      setCenter({ lat: parseFloat(initialLocation.lat), lng: parseFloat(initialLocation.lng) });
    }
  }, [initialLocation]);

  useEffect(() => {
    if (!isOpen) { mapInstanceRef.current = null; }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !mapRef.current || !window.google) return;
    if (mapInstanceRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center, zoom: 17, disableDefaultUI: true, clickableIcons: false,
      backgroundColor: "#1a1a2e",
      styles: [
        { elementType: "geometry",               stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke",     stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill",       stylers: [{ color: "#746855" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
      ],
    });
    mapInstanceRef.current = map;

    map.addListener("idle", () => {
      setIsDragging(false);
      const c = map.getCenter();
      const lat = c.lat(), lng = c.lng();
      setCenter({ lat, lng });
      new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
        setAddress(status === "OK" && results[0]
          ? results[0].formatted_address
          : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      });
    });
    map.addListener("dragstart", () => setIsDragging(true));
  }, [isOpen]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude), lng = parseFloat(pos.coords.longitude);
        if (mapInstanceRef.current) { mapInstanceRef.current.panTo({ lat, lng }); mapInstanceRef.current.setZoom(17); }
        setCenter({ lat, lng });
        setLocating(false);
      },
      () => { toast.error("Could not find location"); setLocating(false); },
      { enableHighAccuracy: true }
    );
  };

  const handleConfirm = () => {
    onLocationSelect({ address, lat: parseFloat(center.lat), lng: parseFloat(center.lng) });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 p-4 z-10 flex items-center justify-between pointer-events-none">
        <Button variant="ghost" size="icon" onClick={onClose}
          className="bg-black/50 text-white rounded-full pointer-events-auto backdrop-blur-md border border-[#00ff88]/30">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-[#00ff88]/30">
          <p className="text-[#00ff88] font-bold text-sm">{title || "Select Location"}</p>
        </div>
      </div>
      <div className="relative flex-1 w-full h-full">
        <div ref={mapRef} className="w-full h-full" />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center pb-10">
          <div className="relative flex flex-col items-center">
            <MapPin className={`w-12 h-12 text-[#00ff88] drop-shadow-2xl transition-transform duration-200 ${isDragging ? "-translate-y-4" : ""}`} fill="black" />
            <div className="w-2 h-2 bg-black/50 rounded-full blur-[2px] mt-[-5px]" />
          </div>
        </div>
        <Button size="icon" onClick={handleLocateMe} disabled={locating}
          className="absolute bottom-6 right-4 rounded-full w-12 h-12 bg-black/80 border border-[#00ff88]/50 text-[#00ff88] shadow-lg z-20">
          {locating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Crosshair className="w-6 h-6" />}
        </Button>
      </div>
      <div className="bg-[#1a1a2e] p-6 rounded-t-3xl border-t border-[#00ff88]/30 -mt-6 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
        <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
        <p className="text-[#00ff88] text-xs font-bold uppercase mb-1">Selected Location</p>
        <h3 className="text-white text-lg font-bold truncate mb-6">{isDragging ? "Locating..." : address}</h3>
        <Button className="w-full bg-[#00ff88] text-black font-bold h-14 text-lg rounded-xl"
          onClick={handleConfirm} disabled={isDragging}>
          {isDragging ? "Release to Select" : "Confirm Location"}
        </Button>
      </div>
    </div>
  );
};

// =============================================================================
// LIVE TRACKING MAP
// =============================================================================
const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef               = useRef(null);
  const mapInstanceRef       = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef      = useRef(null);
  const routeDrawnForStatus  = useRef(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const getSafeCoord = (val) => { const n = parseFloat(val); return !isNaN(n) && n !== 0 ? n : null; };

  // Init map
  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    if (mapInstanceRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 }, zoom: 15,
      disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy",
      backgroundColor: "#1a1a2e",
      styles: [
        { elementType: "geometry",               stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke",     stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill",       stylers: [{ color: "#746855" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
      ],
    });
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map, suppressMarkers: false,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 6 },
    });
    map.addListener("dragstart", () => setIsFollowing(false));
    map.addListener("zoom_changed", () => setIsFollowing(false));
    mapInstanceRef.current = map;
  }, []);

  // Route logic
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    const pLat = getSafeCoord(pickup?.lat),    pLng = getSafeCoord(pickup?.lng);
    const dLat = getSafeCoord(destination?.lat), dLng = getSafeCoord(destination?.lng);
    const drLat = getSafeCoord(driverLocation?.lat), drLng = getSafeCoord(driverLocation?.lng);

    const waypoints = stops
      .filter(s => s.lat && s.lng)
      .map(s => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));

    const sig = `${pLat},${pLng}|${dLat},${dLng}|${waypoints.map(w => w.location.lat).join(",")}|${status}`;
    if (routeDrawnForStatus.current === sig) return;

    if (status === "preview") {
      if (pLat && pLng && dLat && dLng) {
        drawRoute({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng }, waypoints);
        routeDrawnForStatus.current = sig;
      }
      return;
    }

    if (!drLat || !drLng) return;
    const origin = { lat: drLat, lng: drLng };

    if (["accepted", "searching", "arrived"].includes(status) && pLat) {
      drawRoute(origin, { lat: pLat, lng: pLng }, []);
      routeDrawnForStatus.current = sig;
    } else if (status === "in_progress" && dLat) {
      drawRoute(origin, { lat: dLat, lng: dLng }, waypoints);
      routeDrawnForStatus.current = sig;
    }
  }, [pickup?.lat, destination?.lat, JSON.stringify(stops), status, driverLocation?.lat]);

  const drawRoute = (origin, dest, waypoints = []) => {
    new window.google.maps.DirectionsService().route(
      { origin, destination: dest, waypoints, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, st) => {
        if (st === "OK" && directionsRendererRef.current) {
          directionsRendererRef.current.setDirections(result);
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(origin); bounds.extend(dest);
          waypoints.forEach(wp => bounds.extend(wp.location));
          mapInstanceRef.current.fitBounds(bounds);
          mapInstanceRef.current.panBy(0, 20);
        }
      }
    );
  };

  // Driver marker
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation?.lat) return;
    const pos = { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) };
    const ICON = {
      path: "M 0,-18 L 12,14 L 0,8 L -12,14 Z",
      scale: 1.5, fillColor: "#00d4ff", fillOpacity: 1,
      strokeColor: "#ffffff", strokeWeight: 2,
      rotation: parseFloat(driverLocation.heading) || 0,
      anchor: new window.google.maps.Point(0, 0),
    };

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({ position: pos, map: mapInstanceRef.current, icon: ICON, zIndex: 1000 });
    } else {
      driverMarkerRef.current.setPosition(pos);
      const icon = { ...driverMarkerRef.current.getIcon(), rotation: parseFloat(driverLocation.heading) || 0 };
      driverMarkerRef.current.setIcon(icon);
    }
    if (isFollowing) mapInstanceRef.current.panTo(pos);
  }, [driverLocation, isFollowing]);

  const handleRecenter = () => {
    setIsFollowing(true);
    if (driverLocation?.lat && mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) });
    }
  };

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-[#00ff88]/20 mb-4 bg-[#1a1a2e]">
      <div ref={mapRef} style={{ height: "50vh", minHeight: "450px", width: "100%" }} />
      {!isFollowing && driverLocation && (
        <button onClick={handleRecenter}
          className="absolute bottom-4 right-4 bg-black/80 text-[#00d4ff] p-3 rounded-full border border-[#00d4ff] shadow-lg z-10 hover:bg-black">
          <Crosshair className="w-6 h-6 animate-pulse" />
        </button>
      )}
    </div>
  );
};

// =============================================================================
// LOCATION INPUT
// =============================================================================
const LocationInput = ({ value, onChange, placeholder, icon: Icon, iconColor, id, name }) => {
  const inputRef = useRef(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  useGoogleMapsAutocomplete(inputRef, (place) => onChange({ address: place.address, lat: place.lat, lng: place.lng }));

  return (
    <>
      <div className="relative flex items-center shadow-sm rounded-md">
        <Icon className={`absolute left-3 h-5 w-5 ${iconColor} z-10`} />
        <Input
          ref={inputRef} id={id} name={name}
          value={value?.address || ""}
          onChange={(e) => onChange({ ...value, address: sanitiseAddress(e.target.value) })}
          className="pl-10 pr-10 bg-white border-gray-300 text-black font-medium placeholder:text-gray-400 focus-visible:ring-[#00ff88]"
          placeholder={placeholder}
        />
        <Button variant="ghost" size="icon"
          className="absolute right-1 text-gray-500 hover:text-black hover:bg-gray-100 z-10"
          onClick={() => setShowMapPicker(true)}>
          <MapPinned className="w-5 h-5" />
        </Button>
      </div>
      <MapPicker isOpen={showMapPicker} onClose={() => setShowMapPicker(false)}
        onLocationSelect={(loc) => onChange(loc)} title={placeholder} initialLocation={value} />
    </>
  );
};

// =============================================================================
// AUTH
// =============================================================================
const RiderAuth = () => {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const { t }     = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", surname: "", cellphone: "", password: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register/rider";
      const res = await api.post(endpoint, formData);
      if (res.data?.token && res.data?.user) {
        login(res.data.token, res.data.user);
        toast.success(isLogin ? t("welcome_back") : t("success"));
        navigate("/rider/dashboard");
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
          <Button variant="ghost" className="absolute left-4 top-4 text-secondary hover:text-white" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> {t("back")}
          </Button>
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-secondary to-primary flex items-center justify-center mx-auto mb-4 mt-8">
            <Rocket className="w-10 h-10 text-black" />
          </div>
          <CardTitle className="text-2xl text-secondary font-heading">
            {isLogin ? t("welcome_back") : t("join_taksi")}
          </CardTitle>
          <CardDescription className="text-primary/70">
            {isLogin ? t("sign_in_book") : t("create_account")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rider-name" className="text-secondary">{t("first_name")}</Label>
                  <Input id="rider-name" name="name" value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="bg-background-secondary border-border text-white" required autoComplete="given-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rider-surname" className="text-secondary">{t("last_name")}</Label>
                  <Input id="rider-surname" name="surname" value={formData.surname}
                    onChange={e => setFormData({ ...formData, surname: e.target.value })}
                    className="bg-background-secondary border-border text-white" required autoComplete="family-name" />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rider-phone" className="text-secondary">{t("phone_number")}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-secondary/50" />
                <Input id="rider-phone" name="cellphone" type="tel" value={formData.cellphone}
                  onChange={e => setFormData({ ...formData, cellphone: e.target.value })}
                  className="pl-10 bg-background-secondary border-border text-white"
                  placeholder="+995 XXX XXX XXX" required autoComplete="tel" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rider-password" className="text-secondary">{t("password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-secondary/50" />
                <Input id="rider-password" name="password" type="password" value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="pl-10 bg-background-secondary border-border text-white"
                  required autoComplete="current-password" />
              </div>
            </div>
            <Button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-secondary to-primary text-black font-bold hover:shadow-neon-green transition-all">
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {isLogin ? t("sign_in") : t("sign_up")}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="link" className="text-primary" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? t("need_account") : t("have_account")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// =============================================================================
// WAIT TIMER
// =============================================================================
const WaitTimer = ({ arrivedAt, carType }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = arrivedAt ? new Date(arrivedAt).getTime() : Date.now();
    if (isNaN(startTime)) return;
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
  }

  const overtime = elapsed - freeWaitSeconds;
  const mins    = String(Math.floor(overtime / 60)).padStart(2, "0");
  const secs    = String(overtime % 60).padStart(2, "0");
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
};

// =============================================================================
// RIDER DASHBOARD
// =============================================================================
const RiderDashboard = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate  = useNavigate();
  const { t }     = useLanguage();

  // ---- Notification guards (useRef so they never cause re-renders) ----
  const notifiedArrived  = useRef(false);
  const notifiedAccepted = useRef(false);

  // ---- UI state ----
  const [activeTab,       setActiveTab]       = useState("book");
  const [loading,         setLoading]         = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapsLoaded,      setMapsLoaded]      = useState(false);

  // ---- Ride state ----
  const [activeRide,       setActiveRide]       = useState(null);
  const [rideHistory,      setRideHistory]      = useState([]);
  const [completedRideData, setCompletedRideData] = useState(null);
  const [showRatingModal,  setShowRatingModal]  = useState(null); // stores rideId when open

  // ---- Booking inputs ----
  const [pickup,        setPickup]        = useState({ address: "", lat: null, lng: null });
  const [destination,   setDestination]   = useState({ address: "", lat: null, lng: null });
  const [stops,         setStops]         = useState([]);
  const [carType,       setCarType]       = useState("economy");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // ---- Route & fare ----
  const [routeInfo,    setRouteInfo]    = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [surgeInfo,    setSurgeInfo]    = useState(null);

  // ---- PayPal ----
  const [showPayPal,      setShowPayPal]      = useState(false);
  // Holds the PayPal orderId once payment is approved, before ride is submitted
  const [approvedOrderId, setApprovedOrderId] = useState(null);

  // ==========================================================================
  // Google Maps loader
  // ==========================================================================
  useEffect(() => {
    if (window.google) { setMapsLoaded(true); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;
    script.async = true;
    script.onload  = () => setMapsLoaded(true);
    script.onerror = () => toast.error("Failed to load Google Maps. Check API key.");
    document.head.appendChild(script);
  }, []);

  // ==========================================================================
  // On mount: fetch ride, history, surge
  // ==========================================================================
  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
    fetchSurgeStatus();
  }, []);

  // Re-fetch surge when pickup changes
  useEffect(() => { if (pickup.lat) fetchSurgeStatus(); }, [pickup.lat, pickup.lng]);

  // Auto-locate on maps load
  useEffect(() => { if (mapsLoaded && !pickup.lat) getCurrentLocation(); }, [mapsLoaded]);

  // ==========================================================================
  // Single poller — only when activeRide is live
  // BUG FIX: One interval instead of two (was: fetchActiveRide + pollRideStatus both polling)
  // ==========================================================================
  useEffect(() => {
    if (!activeRide || ["completed", "cancelled", "no_drivers"].includes(activeRide.status)) return;

    const interval = setInterval(async () => {
      try {
        // Always poll by ID for a stable, authoritative snapshot
        const res = await api.get(`/rides/${activeRide.id}`);
        const ride = res.data;
        setActiveRide(ride);
        handleRideStatusChange(ride);
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRide?.id, activeRide?.status]);

  // ==========================================================================
  // Status change handler (toasts + completion logic)
  // BUG FIX: notifiedArrived.current = True → true (was Python syntax)
  // ==========================================================================
  const handleRideStatusChange = (ride) => {
    if (ride.status === "arrived" && !notifiedArrived.current) {
      toast.success("Your driver has arrived!", {
        description: "Please meet your driver. The free wait timer has started.",
        duration: 10000, icon: "🚗",
      });
      notifiedArrived.current = true; // FIX: was `True` (Python), JS needs `true`
    }

    if (ride.status === "accepted" && ride.driver_info && !notifiedAccepted.current) {
      toast.success(`Driver ${ride.driver_info.name} is on the way!`);
      notifiedAccepted.current = true;
    }

    if (ride.status === "searching") {
      // Reset flags when a new/retried search begins
      notifiedArrived.current  = false;
      notifiedAccepted.current = false;
    }

    if (ride.status === "completed") {
      setCompletedRideData({
        id:             ride.id,
        final_fare:     ride.final_fare || ride.estimated_fare,
        payment_method: ride.payment_method || ride.paymentMethod,
        driver_name:    ride.driver_info?.name || ride.driver_name || "Your Driver",
      });
      setActiveRide(null);
      setActiveTab("book");
      fetchRideHistory();
      if (refreshUser) refreshUser(); // Refresh wallet balance in header
    }

    if (ride.status === "no_drivers") {
      toast.error("No drivers available in your area.");
    }

    if (ride.status === "cancelled") {
      setActiveRide(null);
      setActiveTab("book");
    }
  };

  // ==========================================================================
  // API helpers
  // ==========================================================================
  const fetchSurgeStatus = async () => {
    try {
      const params = pickup.lat ? `?lat=${pickup.lat}&lng=${pickup.lng}` : "";
      const res = await api.get(`/surge/status${params}`);
      setSurgeInfo(res.data);
    } catch (err) { console.error("Surge fetch error:", err); }
  };

  const fetchActiveRide = async () => {
    try {
      const res = await api.get("/rider/active-ride");
      if (res.data) setActiveRide(res.data);
    } catch (err) { console.error("Active ride fetch error:", err); }
  };

  const fetchRideHistory = async () => {
    try {
      const res = await api.get("/rider/history");
      setRideHistory(res.data.rides || []);
    } catch (err) { console.error("History fetch error:", err); }
  };

  // ==========================================================================
  // Route calculator
  // ==========================================================================
  const stopsSignature  = stops.map(s => `${s.lat},${s.lng}`).join("|");
  const validStopsCount = stops.filter(s => s.lat && s.lng).length;

  const calculateRoute = useCallback(() => {
    if (!window.google || !pickup.lat || !destination.lat) return;
    const waypoints = stops
      .filter(s => s.lat && s.lng)
      .map(s => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));

    new window.google.maps.DirectionsService().route(
      {
        origin:      { lat: parseFloat(pickup.lat),      lng: parseFloat(pickup.lng) },
        destination: { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) },
        waypoints, travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (res, status) => {
        if (status === "OK" && res.routes[0]?.legs) {
          let d = 0, t = 0;
          res.routes[0].legs.forEach(l => { d += l.distance.value; t += l.duration.value; });
          const newDist = Math.round(d / 100) / 10;
          const newDur  = Math.round(t / 60);
          setRouteInfo(prev =>
            prev?.distance === newDist && prev?.duration === newDur ? prev : { distance: newDist, duration: newDur }
          );
        }
      }
    );
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, stopsSignature]);

  useEffect(() => {
    if (!mapsLoaded || !pickup.lat || !destination.lat) return;
    const timer = setTimeout(calculateRoute, 500);
    return () => clearTimeout(timer);
  }, [mapsLoaded, pickup.lat, pickup.lng, destination.lat, destination.lng, stopsSignature, calculateRoute]);

  useEffect(() => {
    if (!routeInfo) return;
    const surge = surgeInfo?.multiplier || 1.0;
    setFareEstimate(calculateFare(carType, routeInfo.distance, 0, 0, validStopsCount, surge, paymentMethod));
  }, [routeInfo, carType, stopsSignature, surgeInfo, paymentMethod]);

  // ==========================================================================
  // Location helpers
  // ==========================================================================
  const getCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported."); return; }
    setLocationLoading(true);
    const safetyTimer = setTimeout(() => { setLocationLoading(false); toast.error("Location timed out."); }, 15000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(safetyTimer);
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (!window.google) {
          setLocationLoading(false);
          setPickup({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
          return;
        }
        new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
          setLocationLoading(false);
          setPickup({
            address: status === "OK" && results[0] ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            lat, lng,
          });
          if (status === "OK") toast.success("Location detected!");
          else toast.warning("Using coordinates (address lookup failed)");
        });
      },
      (err) => {
        clearTimeout(safetyTimer);
        setLocationLoading(false);
        const msgs = { 1: "Location access denied.", 2: "Location unavailable.", 3: "Request timed out." };
        toast.error(msgs[err.code] || "Could not get location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ==========================================================================
  // Stop management
  // ==========================================================================
  const addStop    = () => stops.length < 3 ? setStops([...stops, { address: "", lat: null, lng: null, order: stops.length }]) : toast.error("Maximum 3 stops");
  const updateStop = (i, data) => setStops(prev => { const s = [...prev]; s[i] = { ...s[i], ...data }; return s; });
  const removeStop = (i) => setStops(stops.filter((_, idx) => idx !== i));

  // ==========================================================================
  // Booking
  // ==========================================================================
  const handleBookRide = () => {
    if (!pickup.lat || !pickup.address.trim()) {
      toast.error("Please select a pickup location"); return;
    }
    // Require destination for card/wallet to prevent surprise charges
    if (paymentMethod !== "cash" && !destination.lat) {
      toast.error("Please set a destination for card or wallet payments"); return;
    }
    // Wallet balance pre-check
    if (paymentMethod === "wallet") {
      const balance = user?.wallet_balance || 0;
      const estimate = fareEstimate?.total || 0;
      if (balance < estimate) {
        toast.error(`Insufficient wallet balance (₾${balance.toFixed(2)}). Need ₾${estimate.toFixed(2)}.`);
        return;
      }
    }

    if (paymentMethod === "card") {
      setShowPayPal(true);
      return;
    }
    processRideRequest(null);
  };

  // BUG FIX: paymentOrderId is now correctly passed from PayPal approval
  const processRideRequest = async (paypalOrderId = null) => {
    setLoading(true);
    try {
      const rideData = {
        pickup:            sanitiseAddress(pickup.address),
        pickupLat:         pickup.lat,
        pickupLng:         pickup.lng,
        destination:       destination.address ? sanitiseAddress(destination.address) : null,
        destinationLat:    destination.lat   || null,
        destinationLng:    destination.lng   || null,
        stops:             stops.filter(s => s.lat).map((s, i) => ({
                             address: sanitiseAddress(s.address), lat: s.lat, lng: s.lng, order: i,
                           })),
        carType,
        paymentMethod,
        ...(paypalOrderId && { paymentOrderId: paypalOrderId }),
        estimatedDistance: routeInfo?.distance || 0,
        estimatedDuration: routeInfo?.duration || 0,
      };

      const res = await api.post("/rides/request", rideData);

      // BUG FIX: Seed active ride with full coordinate fields so LiveTrackingMap
      //          doesn't receive NaN on first render
      setActiveRide({
        id:             res.data.ride_id,
        status:         "searching",
        estimated_fare: res.data.estimated_fare,
        fare_breakdown: res.data.fare_breakdown,
        pickup:         pickup.address,
        pickup_lat:     pickup.lat,
        pickup_lng:     pickup.lng,
        destination:    destination.address || null,
        destination_lat: destination.lat   || null,
        destination_lng: destination.lng   || null,
        stops:           rideData.stops,
        carType,
        paymentMethod,
        matching_status: "Searching within 3km",
      });

      toast.success("Ride requested! Searching for drivers...");
      setActiveTab("active");
      // Reset notification guards for this new ride
      notifiedArrived.current  = false;
      notifiedAccepted.current = false;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request ride");
    } finally {
      setLoading(false);
      setShowPayPal(false);
      setApprovedOrderId(null);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide) return;
    try {
      await api.post(`/rides/${activeRide.id}/cancel`);
      toast.success("Ride cancelled");
      setActiveRide(null);
      setActiveTab("book");
      if (refreshUser) refreshUser();
    } catch (err) { toast.error("Failed to cancel ride"); }
  };

  const handleRetryRide = async () => {
    if (!activeRide) return;
    try {
      await api.post(`/rides/${activeRide.id}/retry`);
      toast.success("Searching for drivers again...");
      // Reset guards so notifications fire again on the retry
      notifiedArrived.current  = false;
      notifiedAccepted.current = false;
      setActiveRide(prev => ({ ...prev, status: "searching", matching_status: "Retrying - Searching within 3km" }));
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to retry"); }
  };

  // ==========================================================================
  // Helpers
  // ==========================================================================
  const carTypes = Object.entries(PRICING_RULES).map(([key, val]) => ({ value: key, ...val }));

  const statusColors = {
    searching: "bg-yellow-500 text-black",   accepted: "bg-blue-500 text-white",
    arrived:   "bg-purple-500 text-white",   in_progress: "bg-[#00ff88] text-black",
    completed: "bg-green-600 text-white",    cancelled:   "bg-red-500 text-white",
    no_drivers:"bg-gray-500 text-white",
  };

  // Safe coordinate extractor for active ride (handles all naming conventions from server)
  const rideCoord = (ride, field) => {
    const keys = {
      pickupLat:    ["pickup_lat",      "pickupLat"],
      pickupLng:    ["pickup_lng",      "pickupLng"],
      destLat:      ["destination_lat", "destinationLat", "dest_lat"],
      destLng:      ["destination_lng", "destinationLng", "dest_lng"],
    };
    for (const k of (keys[field] || [])) { if (ride[k] != null) return parseFloat(ride[k]); }
    return null;
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
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

      <main className="container mx-auto p-4 max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 bg-black/50 border border-[#00ff88]/20 mb-6">
            {[["book","Book",Car],["active","Active",Navigation],["history","History",History],["profile","Profile",User]]
              .map(([val,label,Icon]) => (
                <TabsTrigger key={val} value={val} className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
                  <Icon className="w-4 h-4 mr-2" /> {label}
                </TabsTrigger>
              ))}
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* BOOK TAB                                                          */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="book">
            <Card className="glass-heavy border-secondary/30">
              <CardHeader>
                <CardTitle className="text-secondary flex items-center font-heading">
                  <Rocket className="w-5 h-5 mr-2" /> {t("book_ride")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preview map — only when both coords are set */}
                {mapsLoaded && pickup.lat && destination.lat && (
                  <LiveTrackingMap pickup={pickup} destination={destination} stops={stops} status="preview" driverLocation={null} />
                )}

                {/* Pickup */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-secondary">{t("pickup_location")}</Label>
                    <Button variant="ghost" size="sm" className="text-primary h-6" onClick={getCurrentLocation} disabled={locationLoading}>
                      {locationLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Crosshair className="w-3 h-3 mr-1" />}
                      {t("use_my_location")}
                    </Button>
                  </div>
                  <LocationInput id="pickup-input" name="pickup" value={pickup} onChange={setPickup}
                    placeholder={t("where_pickup")} icon={MapPin} iconColor="text-secondary" />
                </div>

                {/* Stops */}
                {stops.map((stop, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-yellow-400">Stop {idx + 1}</Label>
                      <Button variant="ghost" size="sm" className="text-red-400 h-6" onClick={() => removeStop(idx)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <LocationInput id={`stop-${idx}`} name={`stop_${idx}`} value={stop}
                      onChange={(data) => updateStop(idx, data)} placeholder={t("stop_address")}
                      icon={MapPin} iconColor="text-yellow-400" />
                  </div>
                ))}
                {stops.length < 3 && (
                  <Button variant="outline" className="w-full border-dashed border-yellow-400/30 text-yellow-400" onClick={addStop}>
                    <Plus className="w-4 h-4 mr-2" /> {t("add_stop_free")}
                  </Button>
                )}

                {/* Destination */}
                <div className="space-y-2">
                  <Label className="text-primary">{t("destination")}</Label>
                  <LocationInput id="destination-input" name="destination" value={destination} onChange={setDestination}
                    placeholder={t("where_going")} icon={Navigation} iconColor="text-primary" />
                </div>

                {/* Surge banner */}
                {surgeInfo?.is_surge && (
                  <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <TrendingUp className="w-5 h-5 text-orange-400 mr-2" />
                        <div>
                          <p className="text-orange-400 font-bold">{t("surge_active")}</p>
                          <p className="text-orange-300/70 text-sm">{surgeInfo.surge_reason}</p>
                        </div>
                      </div>
                      <Badge className="bg-orange-500 text-black text-lg px-3 py-1">x{surgeInfo.multiplier}</Badge>
                    </div>
                  </div>
                )}

                {/* Route / fare summary */}
                {routeInfo && (
                  <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2 text-secondary">
                      <span className="flex items-center"><RouteIcon className="w-4 h-4 mr-1" /> Route</span>
                      <span className="font-bold">{routeInfo.distance} km • ~{routeInfo.duration} min</span>
                    </div>
                    {fareEstimate && (
                      <div className="flex flex-col">
                        <div className="flex justify-between text-lg text-secondary font-bold">
                          <span>{t("estimated_total")}</span>
                          <span>₾{fareEstimate.total.toFixed(2)}</span>
                        </div>
                        {paymentMethod === "card" && (
                          <p className="text-xs text-primary text-right mt-1">{t("card_fee_included")} (+₾2.00)</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Vehicle selector */}
                <div className="space-y-2">
                  <Label className="text-secondary">{t("vehicle_class")}</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {carTypes.map((type) => {
                      const est = routeInfo
                        ? calculateFare(type.value, routeInfo.distance, 0, 0, validStopsCount, surgeInfo?.multiplier || 1.0, paymentMethod).total
                        : type.base * (surgeInfo?.multiplier || 1.0);
                      return (
                        <button key={type.value} onClick={() => setCarType(type.value)}
                          className={`p-3 rounded-xl border-2 transition-all ${carType === type.value ? "border-secondary bg-secondary/20 shadow-neon-green" : "border-secondary/20 bg-background-secondary"}`}>
                          <div className="text-2xl mb-1">{type.icon}</div>
                          <div className="text-white font-medium text-xs">{type.name}</div>
                          <div className="text-secondary text-sm">₾{est.toFixed(2)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment selector */}
                <div className="space-y-2">
                  <Label className="text-secondary">{t("payment")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {[["cash", "Cash", null], ["wallet", `Wallet (₾${user?.wallet_balance?.toFixed(2) || "0.00"})`, Wallet]].map(([val, label, Icon]) => (
                      <Button key={val} variant={paymentMethod === val ? "default" : "outline"}
                        onClick={() => {
                          if (val === "wallet" && (user?.wallet_balance || 0) <= 0) {
                            toast.error("Your wallet is empty."); return;
                          }
                          setPaymentMethod(val);
                          setShowPayPal(false);
                        }}
                        className={paymentMethod === val ? "bg-secondary text-black font-bold shadow-neon-green" : "border-secondary/30 text-secondary hover:bg-secondary/10"}>
                        {Icon && <Icon className="w-4 h-4 mr-2" />}{label}
                      </Button>
                    ))}
                    {/* Card triggers PayPal inline */}
                    <Button variant={paymentMethod === "card" ? "default" : "outline"}
                      onClick={() => { setPaymentMethod("card"); setShowPayPal(false); }}
                      className={paymentMethod === "card" ? "bg-secondary text-black font-bold" : "border-secondary/30 text-secondary hover:bg-secondary/10"}>
                      <CreditCard className="w-4 h-4 mr-2" /> Card
                    </Button>
                  </div>
                </div>

                {/* Book button */}
                <Button
                  className="w-full bg-gradient-to-r from-secondary to-primary text-black font-bold h-14 text-lg hover:shadow-neon-green transition-all mt-2"
                  onClick={handleBookRide} disabled={loading} data-testid="request-ride-btn">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Rocket className="w-5 h-5 mr-2" />}
                  {t("request_ride")}
                </Button>

                {/* ---------------------------------------------------------------- */}
                {/* PAYPAL — inside Book tab, below the Book button                  */}
                {/* BUG FIX: was rendered outside any TabsContent, now properly scoped */}
                {/* ---------------------------------------------------------------- */}
                {showPayPal && paymentMethod === "card" && fareEstimate && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-4">
                    <p className="text-[#00ff88] text-sm text-center mb-3 font-semibold">
                      Complete payment: ₾{fareEstimate.total.toFixed(2)} (${(fareEstimate.total * 0.37).toFixed(2)} USD)
                    </p>
                    <PayPalButtons
                      fundingSource="card"
                      style={{ layout: "vertical", shape: "rect" }}
                      createOrder={(data, actions) =>
                        actions.order.create({
                          purchase_units: [{
                            amount: {
                              // BUG FIX: null-guard on fareEstimate before accessing .total
                              value: (fareEstimate.total * 0.37).toFixed(2),
                              currency_code: "USD",
                            },
                          }],
                          application_context: { shipping_preference: "NO_SHIPPING" },
                        })
                      }
                      onApprove={async (data, actions) => {
                        await actions.order.capture();
                        toast.success("Payment approved! Booking ride...");
                        // BUG FIX: pass the real PayPal orderId to the ride request
                        await processRideRequest(data.orderID);
                      }}
                      onError={(err) => {
                        console.error("PayPal error:", err);
                        toast.error("Payment failed. Please try again.");
                        setShowPayPal(false);
                      }}
                      onCancel={() => { toast.info("Payment cancelled."); setShowPayPal(false); }}
                    />
                  </div>
                )}

              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* ACTIVE TAB                                                        */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="active">
            {activeRide ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-[#00d4ff]">Active Ride</CardTitle>
                    <Badge className={statusColors[activeRide.status]}>
                      {activeRide.status?.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-white">

                  {/* Live tracking map */}
                  {mapsLoaded && (
                    <div className="w-full rounded-xl overflow-hidden mb-4 border border-[#00ff88]/20 relative">
                      <LiveTrackingMap
                        status={activeRide.status}
                        driverLocation={activeRide.driver_location}
                        pickup={{
                          lat: rideCoord(activeRide, "pickupLat"),
                          lng: rideCoord(activeRide, "pickupLng"),
                        }}
                        destination={
                          rideCoord(activeRide, "destLat")
                            ? { lat: rideCoord(activeRide, "destLat"), lng: rideCoord(activeRide, "destLng") }
                            : null
                        }
                        stops={activeRide.stops || []}
                      />
                      <div className="absolute top-2 left-2 bg-black/80 backdrop-blur px-3 py-1 rounded-full border border-white/10 z-10">
                        <p className="text-xs text-white font-bold uppercase animate-pulse">
                          {activeRide.status === "in_progress" ? "● Live Trip" : "● Driver Arriving"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Trip details */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-[#00ff88]/60 text-sm">Pickup</p>
                      <p>{activeRide.pickup}</p>
                    </div>
                    {activeRide.stops?.length > 0 && (
                      <div>
                        <p className="text-yellow-400/60 text-sm">Stops ({activeRide.stops.length})</p>
                        {activeRide.stops.map((s, i) => <p key={i} className="text-sm text-yellow-400">• {s.address}</p>)}
                      </div>
                    )}
                    <div>
                      <p className="text-[#00d4ff]/60 text-sm">Destination</p>
                      <p>{activeRide.destination || "Open Trip"}</p>
                    </div>
                  </div>

                  {/* Searching */}
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

                  {/* No drivers */}
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
                        <Button variant="outline" className="border-gray-500 text-gray-300"
                          onClick={() => { setActiveRide(null); setActiveTab("book"); }}>
                          New Ride
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Driver info card */}
                  {activeRide.driver_info && (
                    <div className="bg-black/60 rounded-xl p-5 border border-[#00ff88]/30 shadow-[0_0_20px_rgba(0,255,136,0.1)] space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                        <p className="text-[#00ff88] font-bold uppercase tracking-widest text-xs">Driver Assigned</p>
                        <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/50">
                          <Lock className="w-3 h-3 mr-1" /> Background Checked
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center border-2 border-[#00ff88]">
                          <User className="w-8 h-8 text-black" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-2xl text-white">{activeRide.driver_info.name}</p>
                          <div className="flex items-center text-sm text-gray-300 mt-1">
                            <Car className="w-4 h-4 mr-1 text-[#00d4ff]" />
                            <span>{activeRide.driver_info.car_color} {activeRide.driver_info.car_make} {activeRide.driver_info.car_model}</span>
                          </div>
                          <div className="inline-block mt-2 px-3 py-1 bg-[#00ff88]/10 border border-[#00ff88]/50 rounded-md">
                            <p className="text-[#00ff88] font-mono font-bold tracking-widest text-xl uppercase">
                              {activeRide.driver_info.license_plate}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-gray-800">
                        <RideCommunication
                          rideId={activeRide.id}
                          otherPartyPhone={activeRide.driver_info.cellphone}
                          otherPartyName={activeRide.driver_info.name}
                          currentUserId={user?.id}
                          isDriver={false}
                        />
                      </div>
                    </div>
                  )}

                  {/* Wait timer */}
                  {activeRide.status === "arrived" && (
                    <WaitTimer arrivedAt={activeRide.arrived_at} carType={activeRide.carType || activeRide.car_type} />
                  )}

                  {/* Fare display */}
                  <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4">
                    <span className="text-[#00ff88]">Estimated Fare</span>
                    <span className="text-2xl font-bold text-[#00ff88]">
                      ₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}
                    </span>
                  </div>

                  {/* Cancel */}
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

          {/* ---------------------------------------------------------------- */}
          {/* HISTORY TAB                                                       */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="history">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
              <CardHeader>
                <CardTitle className="text-[#00ff88]">Ride History</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {rideHistory.length === 0 && (
                      <p className="text-center text-gray-500 py-8">No rides yet</p>
                    )}
                    {rideHistory.map((ride) => (
                      <div key={ride.id} className="bg-black/50 border border-[#00ff88]/10 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between">
                          <Badge className={statusColors[ride.status] || "bg-gray-500 text-white"}>
                            {ride.status?.replace(/_/g, " ").toUpperCase()}
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
                          <span className="text-gray-400 capitalize">{ride.carType || ride.car_type}</span>
                          <span className="text-[#00ff88] font-bold">
                            ₾{(ride.final_fare || ride.estimated_fare)?.toFixed(2) ?? "—"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          {/* PROFILE TAB                                                       */}
          {/* ---------------------------------------------------------------- */}
          <TabsContent value="profile">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
              <CardHeader><CardTitle className="text-[#00ff88]">Profile</CardTitle></CardHeader>
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

      {/* ------------------------------------------------------------------ */}
      {/* TRIP COMPLETION MODAL                                               */}
      {/* BUG FIX: rideId preserved separately so it survives completedRideData=null */}
      {/* ------------------------------------------------------------------ */}
      <RiderTripCompletionModal
        isOpen={!!completedRideData}
        onClose={() => setCompletedRideData(null)}
        fareAmount={completedRideData?.final_fare}
        paymentMethod={completedRideData?.payment_method}
        driverName={completedRideData?.driver_name}
        onRateDriver={() => {
          // BUG FIX: capture rideId BEFORE clearing completedRideData
          const rideId = completedRideData?.id;
          setCompletedRideData(null);
          setShowRatingModal(rideId); // store the id, not just a boolean
        }}
      />

      {/* Rating Modal */}
      {/* BUG FIX: showRatingModal now holds the rideId string, so it's always available */}
      <RatingModal
        isOpen={!!showRatingModal}
        onClose={() => setShowRatingModal(null)}
        rideId={showRatingModal}
        ratingType="driver"
        onRatingComplete={() => {
          setShowRatingModal(null);
          toast.success(t("rating_submitted") || "Thanks for your feedback!");
          fetchRideHistory();
        }}
      />
    </div>
  );
};

// =============================================================================
// PORTAL ROUTER
// =============================================================================
const RiderPortal = () => {
  const { user }   = useAuth();
  const location   = useLocation();

  if (!user || user.user_type !== "rider") {
    if (location.pathname === "/rider" || location.pathname === "/rider/") return <RiderAuth />;
    return <Navigate to="/rider" replace />;
  }

  return (
    <PayPalScriptProvider options={{
      "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
      currency: "USD",
    }}>
      <Routes>
        <Route path="/"         element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<RiderDashboard />} />
        <Route path="*"         element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default RiderPortal;