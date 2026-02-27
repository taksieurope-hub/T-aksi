import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Plus, TrendingUp, Timer, CreditCard, Target, Route as RouteIcon, Wallet,
  Share2, Calendar, Heart, AlertCircle, Gift, Copy, ChevronRight,
  Receipt, DollarSign, Bell, Bookmark, Send, ChevronDown, Map,
} from "lucide-react";

// =============================================================================
// PRICING RULES — Must match server.py exactly
// =============================================================================
const PRICING_RULES = {
  economy:   { name: "Economy",   base: 2.00, perKm: 0.50, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚗", desc: "Affordable" },
  comfort:   { name: "Comfort",   base: 2.50, perKm: 0.55, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚙", desc: "Extra space" },
  suv:       { name: "SUV / XL",  base: 3.90, perKm: 0.80, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚐", desc: "Up to 6" },
  personal:  { name: "Personal",  base: 4.00, perKm: 0.70, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "👤", desc: "Premium" },
  jumpstart: { name: "Jumpstart", base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, stopFee: 0.00, icon: "⚡", desc: "Flat rate" },
};

const calculateFare = (carType, distanceKm, waitMin = 0, stopWaitMin = 0, numStops = 0, surgeMultiplier = 1.0, paymentMethod = "cash") => {
  const rules = PRICING_RULES[carType] || PRICING_RULES.economy;
  let subtotal = rules.base;
  subtotal += distanceKm * rules.perKm;
  if (distanceKm > 7)  subtotal += (distanceKm - 7)  * 0.15;
  if (distanceKm > 30) subtotal += Math.ceil((distanceKm - 30) / 15) * 5;
  const billableWait = Math.max(0, waitMin - rules.freeWait);
  subtotal += billableWait * rules.perMinWait;
  subtotal += stopWaitMin * rules.perMinWait;
  subtotal += numStops * rules.stopFee;
  const surgeFee   = subtotal * (surgeMultiplier - 1.0);
  const serviceFee = paymentMethod === "card" ? 2.00 : 0.00;
  const total      = subtotal + surgeFee + serviceFee;
  return {
    base: rules.base,
    distance: Math.round(distanceKm * rules.perKm * 100) / 100,
    wait: Math.round((billableWait + stopWaitMin) * rules.perMinWait * 100) / 100,
    stops: numStops * rules.stopFee,
    subtotal: Math.round(subtotal * 100) / 100,
    surgeFee: Math.round(surgeFee * 100) / 100,
    serviceFee: parseFloat(serviceFee.toFixed(2)),
    surgeMultiplier,
    total: Math.round(total * 100) / 100,
  };
};

const sanitiseAddress = (str = "") => str.trim().slice(0, 300);

// =============================================================================
// GOOGLE MAPS LOADER — singleton, never double-loads
// =============================================================================
let mapsLoadState = "idle";
const mapsReadyCallbacks = [];

const loadGoogleMaps = (apiKey) => {
  // Already loaded and verified
  if (mapsLoadState === "loaded" && window.google?.maps) return Promise.resolve();
  // State says loaded but google isn't there (e.g. script was removed) — reset
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
// GOOGLE MAPS AUTOCOMPLETE HOOK — stable, attaches once
// =============================================================================
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect, mapsLoaded) => {
  const callbackRef = useRef(onPlaceSelect);
  const attachedRef = useRef(false);

  useEffect(() => { callbackRef.current = onPlaceSelect; }, [onPlaceSelect]);

  // Inject autocomplete CSS once globally
  useEffect(() => {
    if (document.getElementById("pac-styles")) return;
    const style = document.createElement("style");
    style.id = "pac-styles";
    style.innerHTML = `
      .pac-container { z-index:999999!important; background:#0d0d1a!important; border:1px solid rgba(0,255,136,0.3)!important;
        border-radius:0 0 12px 12px!important; font-family:inherit!important;
        box-shadow:0 10px 40px rgba(0,0,0,.6)!important; position:absolute!important; padding-bottom:8px!important; }
      .pac-item { color:#9ca3af!important; border-top:1px solid rgba(255,255,255,0.05)!important;
        padding:10px 14px!important; cursor:pointer!important; font-size:13px!important; }
      .pac-item:hover,.pac-item:active { background:rgba(0,255,136,0.08)!important; }
      .pac-item-query { color:#fff!important; font-weight:700!important; font-size:14px!important; }
      .pac-logo:after { display:none!important; }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!mapsLoaded || !inputRef.current || attachedRef.current) return;
    if (!window.google?.maps?.places) return;

    attachedRef.current = true;
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
    return () => { attachedRef.current = false; };
  }, [mapsLoaded]);
};

// =============================================================================
// MAP PICKER MODAL
// =============================================================================
const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation }) => {
  const mapRef          = useRef(null);
  const mapInstanceRef  = useRef(null);
  const [address, setAddress]       = useState("Move map to select location...");
  const [isDragging, setIsDragging] = useState(false);
  const [locating, setLocating]     = useState(false);
  const [center, setCenter]         = useState({ lat: 41.7151, lng: 44.8271 });

  useEffect(() => {
    if (initialLocation?.lat) setCenter({ lat: parseFloat(initialLocation.lat), lng: parseFloat(initialLocation.lng) });
  }, [initialLocation?.lat, initialLocation?.lng]);

  useEffect(() => { if (!isOpen) mapInstanceRef.current = null; }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !mapRef.current || !window.google || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center, zoom: 17, disableDefaultUI: true, clickableIcons: false, backgroundColor: "#0d0d1a",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#111827" }] },
      ],
    });
    mapInstanceRef.current = map;
    map.addListener("idle", () => {
      setIsDragging(false);
      const c = map.getCenter();
      const lat = c.lat(), lng = c.lng();
      setCenter({ lat, lng });
      new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
        setAddress(status === "OK" && results[0] ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
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

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 p-4 z-10 flex items-center justify-between pointer-events-none">
        <Button variant="ghost" size="icon" onClick={onClose}
          className="bg-black/60 text-white rounded-full pointer-events-auto backdrop-blur-md border border-white/10">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
          <p className="text-white font-semibold text-sm">{title || "Select Location"}</p>
        </div>
      </div>
      <div className="relative flex-1 w-full h-full">
        <div ref={mapRef} className="w-full h-full" />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center pb-10">
          <div className="relative flex flex-col items-center">
            <MapPin className={`w-10 h-10 text-[#00ff88] drop-shadow-2xl transition-transform duration-200 ${isDragging ? "-translate-y-3" : ""}`} fill="rgba(0,255,136,0.2)" />
            <div className="w-2 h-1 bg-black/40 rounded-full blur-[1px] mt-[-4px]" />
          </div>
        </div>
        <Button size="icon" onClick={handleLocateMe} disabled={locating}
          className="absolute bottom-6 right-4 rounded-full w-12 h-12 bg-black/80 border border-white/20 text-white shadow-lg z-20 hover:border-[#00ff88]/60">
          {locating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Crosshair className="w-5 h-5" />}
        </Button>
      </div>
      <div className="bg-[#0d0d1a] p-6 rounded-t-2xl border-t border-white/10 -mt-6 relative z-10">
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
        <p className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-1">Selected</p>
        <h3 className="text-white text-base font-semibold truncate mb-5">{isDragging ? "Drop to select..." : address}</h3>
        <Button className="w-full bg-[#00ff88] text-black font-bold h-13 text-base rounded-xl hover:bg-[#00e07a] transition-colors"
          onClick={() => { onLocationSelect({ address, lat: parseFloat(center.lat), lng: parseFloat(center.lng) }); onClose(); }}
          disabled={isDragging}>
          {isDragging ? "Release to Confirm" : "Confirm Location"}
        </Button>
      </div>
    </div>
  );
};

// =============================================================================
// LIVE TRACKING MAP
// =============================================================================
const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef                = useRef(null);
  const mapInstanceRef        = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef       = useRef(null);
  const routeDrawnForStatus   = useRef(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const getSafeCoord = (val) => { const n = parseFloat(val); return !isNaN(n) && n !== 0 ? n : null; };

  useEffect(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 }, zoom: 15,
      disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", backgroundColor: "#0d0d1a",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#111827" }] },
      ],
    });
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map, suppressMarkers: false,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5, strokeOpacity: 0.9 },
    });
    map.addListener("dragstart", () => setIsFollowing(false));
    mapInstanceRef.current = map;
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    const pLat = getSafeCoord(pickup?.lat), pLng = getSafeCoord(pickup?.lng);
    const dLat = getSafeCoord(destination?.lat), dLng = getSafeCoord(destination?.lng);
    const drLat = getSafeCoord(driverLocation?.lat), drLng = getSafeCoord(driverLocation?.lng);
    const waypoints = stops.filter(s => s.lat && s.lng).map(s => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));
    const sig = `${pLat},${pLng}|${dLat},${dLng}|${waypoints.map(w => w.location.lat).join(",")}|${status}`;
    if (routeDrawnForStatus.current === sig) return;

    if (status === "preview") {
      if (pLat && pLng && dLat && dLng) { drawRoute({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng }, waypoints); routeDrawnForStatus.current = sig; }
      return;
    }
    if (!drLat || !drLng) return;
    const origin = { lat: drLat, lng: drLng };
    if (["accepted", "searching", "arrived"].includes(status) && pLat) { drawRoute(origin, { lat: pLat, lng: pLng }, []); routeDrawnForStatus.current = sig; }
    else if (status === "in_progress" && dLat) { drawRoute(origin, { lat: dLat, lng: dLng }, waypoints); routeDrawnForStatus.current = sig; }
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
          mapInstanceRef.current.fitBounds(bounds, { top: 60, bottom: 60, left: 30, right: 30 });
        }
      }
    );
  };

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation?.lat) return;
    const pos = { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) };
    const ICON = {
      path: "M 0,-18 L 12,14 L 0,8 L -12,14 Z", scale: 1.4, fillColor: "#00d4ff", fillOpacity: 1,
      strokeColor: "#ffffff", strokeWeight: 2, rotation: parseFloat(driverLocation.heading) || 0,
      anchor: new window.google.maps.Point(0, 0),
    };
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({ position: pos, map: mapInstanceRef.current, icon: ICON, zIndex: 1000 });
    } else {
      driverMarkerRef.current.setPosition(pos);
      driverMarkerRef.current.setIcon({ ...driverMarkerRef.current.getIcon(), rotation: parseFloat(driverLocation.heading) || 0 });
    }
    if (isFollowing) mapInstanceRef.current.panTo(pos);
  }, [driverLocation, isFollowing]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-[#0d0d1a]">
      <div ref={mapRef} style={{ height: "48vh", minHeight: "320px", width: "100%" }} />
      {!isFollowing && driverLocation && (
        <button onClick={() => { setIsFollowing(true); if (driverLocation?.lat && mapInstanceRef.current) mapInstanceRef.current.panTo({ lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) }); }}
          className="absolute bottom-4 right-4 bg-black/80 text-[#00d4ff] p-2.5 rounded-full border border-[#00d4ff]/40 shadow-lg z-10 hover:bg-black transition-colors">
          <Crosshair className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

// =============================================================================
// LOCATION INPUT
// =============================================================================
const LocationInput = ({ value, onChange, placeholder, icon: Icon, iconColor, id, name, onSaveAsFavorite, mapsLoaded }) => {
  const inputRef = useRef(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  useGoogleMapsAutocomplete(inputRef, (place) => onChange({ address: place.address, lat: place.lat, lng: place.lng }), mapsLoaded);

  return (
    <>
      <div className="relative flex items-center">
        <Icon className={`absolute left-3 h-4 w-4 ${iconColor} z-10 pointer-events-none`} />
        <Input ref={inputRef} id={id} name={name}
          value={value?.address || ""}
          onChange={(e) => onChange({ ...value, address: sanitiseAddress(e.target.value) })}
          className="pl-9 pr-16 bg-[#111827] border-white/10 text-white placeholder:text-gray-600 focus-visible:ring-[#00ff88]/40 focus-visible:border-[#00ff88]/40 rounded-xl h-12 text-sm"
          placeholder={placeholder} autoComplete="off" />
        <div className="absolute right-1 flex items-center gap-0.5">
          {onSaveAsFavorite && value?.lat && (
            <Button variant="ghost" size="icon" className="text-pink-400/60 hover:text-pink-400 w-8 h-8 rounded-lg" onClick={onSaveAsFavorite}>
              <Heart className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="text-gray-600 hover:text-gray-400 w-8 h-8 rounded-lg" onClick={() => setShowMapPicker(true)}>
            <MapPinned className="w-3.5 h-3.5" />
          </Button>
        </div>
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
  const [isLogin, setIsLogin]   = useState(true);
  const [loading, setLoading]   = useState(false);
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
      } else { throw new Error("Invalid response"); }
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || t("error"));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#050508]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#00ff88]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#00d4ff]/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="absolute right-0 top-0"><LanguageSelector variant="ghost" /></div>
        <Button variant="ghost" className="text-gray-500 hover:text-white mb-6 pl-0" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>

        <div className="mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00ff88] to-[#00d4ff] flex items-center justify-center mb-4">
            <Rocket className="w-7 h-7 text-black" />
          </div>
          <h1 className="text-3xl font-bold text-white">{isLogin ? "Welcome back" : "Join T'aksi"}</h1>
          <p className="text-gray-500 mt-1 text-sm">{isLogin ? "Sign in to your rider account" : "Create your rider account"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs font-medium mb-1.5 block">{t("first_name")}</label>
                <Input id="rider-name" name="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white/5 border-white/10 text-white h-11 rounded-xl" required autoComplete="given-name" />
              </div>
              <div>
                <label className="text-gray-400 text-xs font-medium mb-1.5 block">{t("last_name")}</label>
                <Input id="rider-surname" name="surname" value={formData.surname} onChange={e => setFormData({ ...formData, surname: e.target.value })}
                  className="bg-white/5 border-white/10 text-white h-11 rounded-xl" required autoComplete="family-name" />
              </div>
            </div>
          )}
          <div>
            <label className="text-gray-400 text-xs font-medium mb-1.5 block">{t("phone_number")}</label>
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
              <Input id="rider-phone" name="cellphone" type="tel" value={formData.cellphone}
                onChange={e => setFormData({ ...formData, cellphone: e.target.value })}
                className="pl-9 bg-white/5 border-white/10 text-white h-11 rounded-xl"
                placeholder="+995 XXX XXX XXX" required autoComplete="tel" />
            </div>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-medium mb-1.5 block">{t("password")}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
              <Input id="rider-password" name="password" type="password" value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="pl-9 bg-white/5 border-white/10 text-white h-11 rounded-xl" required autoComplete="current-password" />
            </div>
          </div>
          <Button type="submit" disabled={loading}
            className="w-full bg-[#00ff88] text-black font-bold h-12 rounded-xl hover:bg-[#00e07a] transition-colors mt-4">
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {isLogin ? t("sign_in") : t("sign_up")}
          </Button>
        </form>
        <button className="w-full text-center text-gray-500 text-sm mt-5 hover:text-gray-300 transition-colors" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? t("need_account") : t("have_account")}
        </button>
      </div>
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

  const rules = PRICING_RULES[carType?.toLowerCase()] || PRICING_RULES.economy;
  const freeWaitSeconds = rules.freeWait * 60;

  if (elapsed <= freeWaitSeconds) {
    const remaining = freeWaitSeconds - elapsed;
    return (
      <div className="bg-violet-500/10 border border-violet-500/30 p-4 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2 text-violet-400">
          <Timer className="w-4 h-4 animate-pulse" />
          <span className="font-medium text-sm">Driver waiting — free time</span>
        </div>
        <div className="font-mono text-violet-300 font-bold text-xl">
          {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
        </div>
      </div>
    );
  }

  const overtime = elapsed - freeWaitSeconds;
  const liveFee  = ((overtime / 60) * rules.perMinWait).toFixed(2);
  return (
    <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex items-center justify-between">
      <div className="flex items-center gap-2 text-red-400">
        <Timer className="w-4 h-4 animate-pulse" />
        <span className="font-medium text-sm">Paid wait time</span>
      </div>
      <div className="text-right">
        <div className="font-mono text-red-300 font-bold text-xl">
          {String(Math.floor(overtime / 60)).padStart(2, "0")}:{String(overtime % 60).padStart(2, "0")}
        </div>
        <div className="text-red-400 text-xs font-semibold">+₾{liveFee}</div>
      </div>
    </div>
  );
};

// =============================================================================
// RECEIPT MODAL
// =============================================================================
const ReceiptModal = ({ isOpen, onClose, rideId }) => {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !rideId) return;
    setLoading(true);
    api.get(`/rides/${rideId}/receipt`)
      .then(res => setReceipt(res.data))
      .catch(() => toast.error("Failed to load receipt"))
      .finally(() => setLoading(false));
  }, [isOpen, rideId]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white text-lg font-bold flex items-center gap-2"><Receipt className="w-4 h-4 text-[#00ff88]" /> Trip Receipt</h2>
          <Button variant="ghost" size="icon" className="text-gray-500 w-8 h-8" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#00ff88]" /></div>
        ) : receipt ? (
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 space-y-2.5 border border-white/5">
              {[["Driver", receipt.driver_name], ["Car Type", receipt.car_type], ["Distance", `${receipt.distance_km?.toFixed(1)} km`], ["Payment", receipt.payment_method]].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-white font-medium capitalize">{v}</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5 rounded-xl p-4 space-y-2 border border-white/5">
              <p className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-3">Fare Breakdown</p>
              {Object.entries(receipt.fare_breakdown || {}).filter(([k]) => !["breakdown","surge_multiplier","base_total"].includes(k) && typeof receipt.fare_breakdown[k] === "number" && receipt.fare_breakdown[k] > 0).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-500 capitalize">{k.replace(/_/g, " ")}</span>
                  <span className="text-white">₾{parseFloat(v).toFixed(2)}</span>
                </div>
              ))}
              {receipt.tip > 0 && (
                <div className="flex justify-between text-sm pt-2 border-t border-white/5">
                  <span className="text-yellow-400">Tip</span><span className="text-yellow-400">₾{parseFloat(receipt.tip).toFixed(2)}</span>
                </div>
              )}
              <Separator className="bg-white/10 my-2" />
              <div className="flex justify-between font-bold text-base">
                <span className="text-[#00ff88]">Total</span><span className="text-[#00ff88]">₾{parseFloat(receipt.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// =============================================================================
// TIP MODAL
// =============================================================================
const TipModal = ({ isOpen, onClose, rideId, driverName, onTipped }) => {
  const [tipAmount, setTipAmount] = useState(null);
  const [custom, setCustom]       = useState("");
  const [loading, setLoading]     = useState(false);
  const TIPS = [1, 2, 3, 5];

  const handleTip = async () => {
    const amount = tipAmount || parseFloat(custom);
    if (!amount || amount <= 0) { toast.error("Please select a tip amount"); return; }
    setLoading(true);
    try {
      await api.post(`/rides/${rideId}/tip`, { amount });
      toast.success(`₾${amount.toFixed(2)} tip sent to ${driverName}! 🙏`);
      onTipped();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send tip");
    } finally { setLoading(false); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
        <h2 className="text-white text-lg font-bold text-center mb-1">Tip Your Driver</h2>
        <p className="text-gray-500 text-sm text-center mb-5">{driverName} did a great job!</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {TIPS.map(amt => (
            <button key={amt} onClick={() => { setTipAmount(amt); setCustom(""); }}
              className={`p-3 rounded-xl border-2 font-bold transition-all text-base ${tipAmount === amt ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]" : "border-white/10 text-white bg-white/5"}`}>
              ₾{amt}
            </button>
          ))}
        </div>
        <Input type="number" placeholder="Custom amount" value={custom}
          onChange={e => { setCustom(e.target.value); setTipAmount(null); }}
          className="bg-white/5 border-white/10 text-white text-center h-11 rounded-xl mb-4" />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-white/10 text-gray-400 rounded-xl h-11" onClick={onClose}>Skip</Button>
          <Button className="flex-1 bg-[#00ff88] text-black font-bold rounded-xl h-11" onClick={handleTip} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
            Send Tip
          </Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// SOS BUTTON
// =============================================================================
const SOSButton = ({ rideId, lat, lng }) => {
  const [loading, setLoading]     = useState(false);
  const [triggered, setTriggered] = useState(false);

  const handleSOS = async () => {
    if (!window.confirm("🚨 Trigger SOS? This will alert our safety team immediately.")) return;
    setLoading(true);
    try {
      await api.post("/sos", { ride_id: rideId, lat: lat || 0, lng: lng || 0, message: "Rider triggered SOS during trip" });
      setTriggered(true);
      toast.error("🚨 SOS Triggered! Help is on the way.", { duration: 10000 });
    } catch {
      toast.error("SOS failed — call emergency services directly");
    } finally { setLoading(false); }
  };

  return (
    <button onClick={handleSOS} disabled={loading || triggered}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${triggered ? "bg-red-900/30 border border-red-900/50 text-red-700" : "bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25"}`}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
      {triggered ? "SOS Sent" : "SOS"}
    </button>
  );
};

// =============================================================================
// SHARE TRIP MODAL
// =============================================================================
const ShareTripModal = ({ isOpen, onClose, rideId }) => {
  const [shareLink, setShareLink] = useState("");
  const [loading, setLoading]     = useState(false);
  const [phone, setPhone]         = useState("");
  const [email, setEmail]         = useState("");

  useEffect(() => {
    if (!isOpen || !rideId) return;
    setLoading(true);
    api.post(`/rides/${rideId}/share`, { recipient_phone: null, recipient_email: null })
      .then(res => setShareLink(res.data.share_link))
      .catch(() => setShareLink(`https://taksi.ge/track/${rideId}`))
      .finally(() => setLoading(false));
  }, [isOpen, rideId]);

  const handleShare = async () => {
    setLoading(true);
    try {
      await api.post(`/rides/${rideId}/share`, { recipient_phone: phone || null, recipient_email: email || null });
      toast.success("Trip shared!");
      onClose();
    } catch { toast.error("Failed to share"); } finally { setLoading(false); }
  };

  const copyLink = () => { navigator.clipboard?.writeText(shareLink); toast.success("Link copied!"); };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
        <h2 className="text-white text-lg font-bold mb-1 flex items-center gap-2"><Share2 className="w-4 h-4 text-[#00d4ff]" /> Share Trip</h2>
        <p className="text-gray-500 text-sm mb-5">Let someone track your ride in real-time</p>
        {shareLink && (
          <div className="bg-white/5 rounded-xl p-3 flex items-center gap-2 mb-4 border border-white/5">
            <p className="text-[#00d4ff] text-xs flex-1 truncate font-mono">{shareLink}</p>
            <Button variant="ghost" size="icon" className="text-[#00d4ff] w-7 h-7 shrink-0" onClick={copyLink}><Copy className="w-3.5 h-3.5" /></Button>
          </div>
        )}
        <div className="space-y-2 mb-4">
          <Input placeholder="Phone number (optional)" value={phone} onChange={e => setPhone(e.target.value)} className="bg-white/5 border-white/10 text-white h-11 rounded-xl" />
          <Input placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} className="bg-white/5 border-white/10 text-white h-11 rounded-xl" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-white/10 text-gray-400 rounded-xl h-11" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-[#00d4ff] text-black font-bold rounded-xl h-11" onClick={handleShare} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Share
          </Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// SCHEDULED RIDE MODAL
// =============================================================================
const ScheduledRideModal = ({ isOpen, onClose, pickup, destination, carType }) => {
  const [scheduledTime, setScheduledTime] = useState("");
  const [loading, setLoading]             = useState(false);

  const handleSchedule = async () => {
    if (!pickup?.lat || !destination?.lat) { toast.error("Set pickup and destination first"); return; }
    if (!scheduledTime) { toast.error("Select a date and time"); return; }
    setLoading(true);
    try {
      await api.post("/rides/schedule", {
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        destination_address: destination.address, destination_lat: destination.lat, destination_lng: destination.lng,
        scheduled_time: new Date(scheduledTime).toISOString(),
        car_type: carType, payment_method: "cash", stops: [],
      });
      toast.success("Ride scheduled!");
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to schedule"); } finally { setLoading(false); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
        <h2 className="text-white text-lg font-bold mb-1 flex items-center gap-2"><Calendar className="w-4 h-4 text-yellow-400" /> Schedule a Ride</h2>
        <p className="text-gray-500 text-sm mb-5">Book your ride in advance</p>
        {pickup?.address && <p className="text-xs text-gray-400 mb-1 truncate">📍 {pickup.address}</p>}
        {destination?.address && <p className="text-xs text-gray-400 mb-4 truncate">🏁 {destination.address}</p>}
        <div className="mb-4">
          <label className="text-gray-400 text-xs font-medium mb-1.5 block">Pick Date &amp; Time</label>
          <Input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
            min={new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16)}
            className="bg-white/5 border-white/10 text-white h-11 rounded-xl" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-white/10 text-gray-400 rounded-xl h-11" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-yellow-500 text-black font-bold rounded-xl h-11" onClick={handleSchedule} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
            Schedule
          </Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// WALLET TOP-UP MODAL
// FIX: NaN guard + minimum ₾1 before rendering PayPal buttons
// =============================================================================
const WalletTopUpModal = ({ isOpen, onClose, onSuccess }) => {
  const [amount, setAmount] = useState(20);
  const [custom, setCustom] = useState("");
  const AMOUNTS = [5, 10, 20, 50];

  if (!isOpen) return null;

  // Guard: parseFloat("") → NaN, so fall back to 0
  const finalAmount = custom ? (parseFloat(custom) || 0) : amount;
  const usdAmount   = (finalAmount * 0.37).toFixed(2);
  const canPay      = finalAmount >= 1;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
        <h2 className="text-white text-lg font-bold mb-1 flex items-center gap-2"><Wallet className="w-4 h-4 text-[#00ff88]" /> Top Up Wallet</h2>
        <p className="text-gray-500 text-sm mb-5">Add funds to your T'aksi wallet</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {AMOUNTS.map(a => (
            <button key={a} onClick={() => { setAmount(a); setCustom(""); }}
              className={`p-3 rounded-xl border-2 font-bold transition-all ${(!custom && amount === a) ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]" : "border-white/10 text-white bg-white/5"}`}>
              ₾{a}
            </button>
          ))}
        </div>
        <Input type="number" placeholder="Custom amount (₾)" value={custom} min="1" max="1000"
          onChange={e => setCustom(e.target.value)}
          className="bg-white/5 border-white/10 text-white text-center h-11 rounded-xl mb-4" />
        {canPay && (
          <p className="text-gray-500 text-xs text-center mb-4">
            ₾{finalAmount.toFixed(2)} GEL ≈ ${usdAmount} USD (PayPal)
          </p>
        )}
        {canPay ? (
          <PayPalButtons
            fundingSource="card"
            style={{ layout: "vertical", shape: "rect" }}
            createOrder={(data, actions) => actions.order.create({
              purchase_units: [{ amount: { value: usdAmount, currency_code: "USD" } }],
              application_context: { shipping_preference: "NO_SHIPPING" },
            })}
            onApprove={async (data, actions) => {
              await actions.order.capture();
              try {
                await api.post("/rider/wallet/topup", { amount: finalAmount, reference: data.orderID });
                toast.success(`₾${finalAmount.toFixed(2)} added to your wallet!`);
                onSuccess();
                onClose();
              } catch { toast.error("Payment captured but wallet not updated. Contact support."); }
            }}
            onError={(err) => { console.error("PayPal error:", err); toast.error("Payment failed"); }}
            onCancel={() => toast.info("Payment cancelled")}
          />
        ) : (
          <div className="bg-white/5 rounded-xl p-4 text-center mb-2">
            <p className="text-white/30 text-sm">Enter ₾1 or more to show payment options</p>
          </div>
        )}
        <Button variant="ghost" className="w-full text-gray-500 mt-2 rounded-xl" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
};

// =============================================================================
// FAVORITES PANEL
// =============================================================================
const FavoritesPanel = ({ onSelect }) => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/user/favorites")
      .then(res => setFavorites(res.data.favorites || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const deleteFav = async (id) => {
    await api.delete(`/user/favorites/${id}`);
    setFavorites(prev => prev.filter(f => f.id !== id));
    toast.success("Removed");
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>;
  if (!favorites.length) return <p className="text-gray-600 text-xs text-center py-4">No saved places yet. Tap ❤️ on a location to save it.</p>;

  return (
    <div className="space-y-1.5">
      {favorites.map(fav => (
        <div key={fav.id} className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl p-3 cursor-pointer hover:border-white/15 transition-all group">
          <span className="text-xl">{fav.icon || "📍"}</span>
          <div className="flex-1 min-w-0" onClick={() => onSelect(fav)}>
            <p className="text-white font-medium text-sm truncate">{fav.name}</p>
            <p className="text-gray-600 text-xs truncate">{fav.address}</p>
          </div>
          <Button variant="ghost" size="icon" className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 w-6 h-6" onClick={() => deleteFav(fav.id)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// SAVE FAVORITE DIALOG
// =============================================================================
const SaveFavoriteDialog = ({ location, onSave, onClose }) => {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📍");
  const ICONS = ["🏠", "🏢", "🏋️", "🛒", "🏫", "🍕", "🏥", "📍"];

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Enter a name"); return; }
    try {
      await api.post("/user/favorites", { name, address: location.address, lat: location.lat, lng: location.lng, icon });
      toast.success("Location saved!");
      onSave();
    } catch { toast.error("Failed to save"); }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-bold text-base mb-1">Save Location</h3>
        <p className="text-gray-500 text-xs mb-4 truncate">{location?.address}</p>
        <div className="flex gap-1.5 mb-4">
          {ICONS.map(ic => (
            <button key={ic} onClick={() => setIcon(ic)}
              className={`text-xl p-2 rounded-lg border-2 transition-all ${icon === ic ? "border-pink-500 bg-pink-500/15" : "border-white/10 bg-white/5"}`}>
              {ic}
            </button>
          ))}
        </div>
        <Input placeholder="Name (e.g. Home, Work)" value={name} onChange={e => setName(e.target.value)}
          className="bg-white/5 border-white/10 text-white mb-4 h-11 rounded-xl" />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-white/10 text-gray-400 rounded-xl h-10 text-sm" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-pink-500 text-white font-bold rounded-xl h-10 text-sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// REFERRAL PANEL
// =============================================================================
const ReferralPanel = () => {
  const [referral, setReferral]   = useState(null);
  const [codeInput, setCodeInput] = useState("");
  const [applying, setApplying]   = useState(false);

  useEffect(() => { api.get("/user/referral").then(res => setReferral(res.data)).catch(() => {}); }, []);

  const applyCode = async () => {
    if (!codeInput.trim()) return;
    setApplying(true);
    try {
      const res = await api.post("/user/referral/apply", { code: codeInput.toUpperCase() });
      toast.success(res.data.message);
      api.get("/user/referral").then(r => setReferral(r.data));
      setCodeInput("");
    } catch (err) { toast.error(err.response?.data?.detail || "Invalid code"); } finally { setApplying(false); }
  };

  const copyCode = () => { navigator.clipboard?.writeText(referral?.referral_code || ""); toast.success("Code copied!"); };

  return (
    <div className="space-y-4">
      {referral && (
        <>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-3">Your Code</p>
            <div className="flex items-center justify-between">
              <p className="text-[#00ff88] font-mono text-2xl font-bold tracking-widest">{referral.referral_code}</p>
              <Button variant="ghost" size="icon" className="text-[#00ff88] w-8 h-8" onClick={copyCode}><Copy className="w-4 h-4" /></Button>
            </div>
            <p className="text-gray-600 text-xs mt-2">Share to earn bonuses when friends join</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
              <p className="text-[#00ff88] text-xl font-bold">{referral.referrals_count || 0}</p>
              <p className="text-gray-500 text-xs mt-0.5">Friends Referred</p>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
              <p className="text-[#00ff88] text-xl font-bold">₾{(referral.bonus_earned || 0).toFixed(2)}</p>
              <p className="text-gray-500 text-xs mt-0.5">Bonus Earned</p>
            </div>
          </div>
        </>
      )}
      <div className="bg-white/5 border border-white/5 rounded-xl p-4">
        <p className="text-gray-400 text-sm font-medium mb-2.5">Have a referral code?</p>
        <div className="flex gap-2">
          <Input placeholder="Enter code" value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())}
            className="bg-white/5 border-white/10 text-white uppercase font-mono h-10 rounded-xl" maxLength={12} />
          <Button className="bg-[#00ff88] text-black font-bold h-10 px-4 rounded-xl shrink-0" onClick={applyCode} disabled={applying}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
          </Button>
        </div>
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

  const notifiedArrived  = useRef(false);
  const notifiedAccepted = useRef(false);

  const [activeTab,       setActiveTab]       = useState("book");
  const [loading,         setLoading]         = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [mapsLoaded,      setMapsLoaded]      = useState(() => !!window.google?.maps);

  const [activeRide,        setActiveRide]       = useState(null);
  const [rideHistory,       setRideHistory]      = useState([]);
  const [completedRideData, setCompletedRideData] = useState(null);
  const [showRatingModal,   setShowRatingModal]  = useState(null);
  const [scheduledRides,    setScheduledRides]   = useState([]);

  const [pickup,        setPickup]        = useState({ address: "", lat: null, lng: null });
  const [destination,   setDestination]   = useState({ address: "", lat: null, lng: null });
  const [stops,         setStops]         = useState([]);
  const [carType,       setCarType]       = useState("economy");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const [routeInfo,    setRouteInfo]    = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [surgeInfo,    setSurgeInfo]    = useState(null);

  const [showPayPal,    setShowPayPal]    = useState(false);
  const [showReceipt,   setShowReceipt]   = useState(null);
  const [showTip,       setShowTip]       = useState(null);
  const [showShare,     setShowShare]     = useState(false);
  const [showSchedule,  setShowSchedule]  = useState(false);
  const [showTopUp,     setShowTopUp]     = useState(false);
  const [showSaveFav,   setShowSaveFav]   = useState(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showReferral,  setShowReferral]  = useState(false);

  // ===========================================================================
  // Google Maps — load ONCE using the singleton loader
  // ===========================================================================
  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return; }
    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(() => setMapsLoaded(true))
      .catch(() => toast.error("Failed to load Google Maps"));
  }, []);

  // ===========================================================================
  // Init
  // ===========================================================================
  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
    fetchSurgeStatus();
    fetchScheduledRides();
    api.get("/user/language").catch(() => {});
  }, []);

  useEffect(() => {
    if (pickup.lat) fetchSurgeStatus();
  }, [pickup.lat, pickup.lng]); // eslint-disable-line

  useEffect(() => {
    if (mapsLoaded && !pickup.lat) getCurrentLocation();
  }, [mapsLoaded]); // eslint-disable-line

  // ===========================================================================
  // Poller
  // ===========================================================================
  useEffect(() => {
    if (!activeRide || ["completed", "cancelled", "no_drivers"].includes(activeRide.status)) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/rides/${activeRide.id}`);
        setActiveRide(res.data);
        handleRideStatusChange(res.data);
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [activeRide]);

  const handleRideStatusChange = (ride) => {
    if (ride.status === "arrived" && !notifiedArrived.current) {
      toast.success("Your driver has arrived!", { description: "Free wait timer started.", duration: 8000, icon: "🚗" });
      notifiedArrived.current = true;
    }
    if (ride.status === "accepted" && ride.driver_info && !notifiedAccepted.current) {
      toast.success(`${ride.driver_info.name} is on the way!`);
      notifiedAccepted.current = true;
    }
    if (ride.status === "searching") { notifiedArrived.current = false; notifiedAccepted.current = false; }
    if (ride.status === "completed") {
      setCompletedRideData({ id: ride.id, final_fare: ride.final_fare || ride.estimated_fare, payment_method: ride.payment_method || ride.paymentMethod, driver_name: ride.driver_info?.name || "Your Driver", driver_id: ride.driver_id });
      setActiveRide(null);
      setActiveTab("book");
      fetchRideHistory();
      if (refreshUser) refreshUser();
    }
    if (ride.status === "no_drivers") toast.error("No drivers available in your area.");
    if (ride.status === "cancelled") { setActiveRide(null); setActiveTab("book"); }
  };

  // ===========================================================================
  // API helpers
  // ===========================================================================
  const fetchSurgeStatus = async () => {
    try {
      const params = pickup.lat ? `?lat=${pickup.lat}&lng=${pickup.lng}` : "";
      const res = await api.get(`/surge/status${params}`);
      setSurgeInfo(res.data);
    } catch {}
  };
  const fetchActiveRide     = async () => { try { const res = await api.get("/rider/active-ride"); if (res.data) setActiveRide(res.data); } catch {} };
  const fetchRideHistory    = async () => { try { const res = await api.get("/rider/history"); setRideHistory(res.data.rides || []); } catch {} };
  const fetchScheduledRides = async () => { try { const res = await api.get("/rides/scheduled"); setScheduledRides(res.data.scheduled_rides || []); } catch {} };

  // ===========================================================================
  // Route calculator
  // ===========================================================================
  const stopsSignature  = useMemo(() => stops.map(s => `${s.lat},${s.lng}`).join("|"), [stops]);
  const validStopsCount = useMemo(() => stops.filter(s => s.lat && s.lng).length, [stops]);

  const calculateRoute = useCallback(() => {
    if (!window.google || !pickup.lat || !destination.lat) return;
    const waypoints = stops.filter(s => s.lat && s.lng).map(s => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));
    new window.google.maps.DirectionsService().route(
      { origin: { lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng) }, destination: { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) }, waypoints, travelMode: window.google.maps.TravelMode.DRIVING },
      (res, status) => {
        if (status === "OK" && res.routes[0]?.legs) {
          let d = 0, t = 0;
          res.routes[0].legs.forEach(l => { d += l.distance.value; t += l.duration.value; });
          setRouteInfo({ distance: Math.round(d / 100) / 10, duration: Math.round(t / 60) });
        }
      }
    );
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, stopsSignature]); // eslint-disable-line

  useEffect(() => {
    if (!mapsLoaded || !pickup.lat || !destination.lat) return;
    const timer = setTimeout(calculateRoute, 500);
    return () => clearTimeout(timer);
  }, [mapsLoaded, calculateRoute]);

  useEffect(() => {
    if (!routeInfo) return;
    setFareEstimate(calculateFare(carType, routeInfo.distance, 0, 0, validStopsCount, surgeInfo?.multiplier || 1.0, paymentMethod));
  }, [routeInfo, carType, validStopsCount, surgeInfo, paymentMethod]);

  // ===========================================================================
  // Location
  // ===========================================================================
  const getCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported."); return; }
    setLocationLoading(true);
    const safetyTimer = setTimeout(() => { setLocationLoading(false); }, 15000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(safetyTimer);
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (!window.google) { setLocationLoading(false); setPickup({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng }); return; }
        new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
          setLocationLoading(false);
          setPickup({ address: status === "OK" && results[0] ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
          if (status === "OK") toast.success("Location detected");
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

  // ===========================================================================
  // Stops
  // ===========================================================================
  const addStop    = () => stops.length < 3 ? setStops([...stops, { address: "", lat: null, lng: null, order: stops.length }]) : toast.error("Maximum 3 stops");
  const updateStop = (i, data) => setStops(prev => { const s = [...prev]; s[i] = { ...s[i], ...data }; return s; });
  const removeStop = (i) => setStops(stops.filter((_, idx) => idx !== i));

  // ===========================================================================
  // Booking
  // ===========================================================================
  const handleBookRide = () => {
    if (!pickup.lat || !pickup.address.trim()) { toast.error("Please select a pickup location"); return; }
    if (paymentMethod !== "cash" && !destination.lat) { toast.error("Set a destination for card or wallet payments"); return; }
    if (paymentMethod === "wallet") {
      const balance = user?.wallet_balance || 0;
      const estimate = fareEstimate?.total || 0;
      if (balance < estimate) { toast.error(`Insufficient balance (₾${balance.toFixed(2)})`); return; }
    }
    if (paymentMethod === "card") { setShowPayPal(true); return; }
    processRideRequest(null);
  };

  const processRideRequest = async (paypalOrderId = null) => {
    setLoading(true);
    try {
      const rideData = {
        pickup: sanitiseAddress(pickup.address), pickupLat: pickup.lat, pickupLng: pickup.lng,
        destination: destination.address ? sanitiseAddress(destination.address) : null,
        destinationLat: destination.lat || null, destinationLng: destination.lng || null,
        stops: stops.filter(s => s.lat).map((s, i) => ({ address: sanitiseAddress(s.address), lat: s.lat, lng: s.lng, order: i })),
        carType, paymentMethod,
        ...(paypalOrderId && { paymentOrderId: paypalOrderId }),
        estimatedDistance: routeInfo?.distance || 0,
        estimatedDuration: routeInfo?.duration || 0,
      };
      const res = await api.post("/rides/request", rideData);
      setActiveRide({
        id: res.data.ride_id, status: "searching",
        estimated_fare: res.data.estimated_fare, fare_breakdown: res.data.fare_breakdown,
        pickup: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        destination: destination.address || null, destination_lat: destination.lat || null, destination_lng: destination.lng || null,
        stops: rideData.stops, carType, paymentMethod, matching_status: "Searching within 3km",
      });
      toast.success("Searching for drivers...");
      setActiveTab("active");
      notifiedArrived.current = false; notifiedAccepted.current = false;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to request ride");
    } finally {
      setLoading(false);
      setShowPayPal(false);
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
    } catch { toast.error("Failed to cancel"); }
  };

  const handleRetryRide = async () => {
    if (!activeRide) return;
    try {
      await api.post(`/rides/${activeRide.id}/retry`);
      toast.success("Retrying search...");
      notifiedArrived.current = false; notifiedAccepted.current = false;
      setActiveRide(prev => ({ ...prev, status: "searching", matching_status: "Retrying..." }));
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to retry"); }
  };

  const cancelScheduledRide = async (rideId) => {
    try {
      await api.delete(`/rides/scheduled/${rideId}`);
      toast.success("Scheduled ride cancelled");
      fetchScheduledRides();
    } catch { toast.error("Failed to cancel"); }
  };

  // ===========================================================================
  // Helpers
  // ===========================================================================
  const carTypes = useMemo(() => Object.entries(PRICING_RULES).map(([key, val]) => ({ value: key, ...val })), []);

  const statusConfig = {
    searching:   { color: "bg-amber-500/20 text-amber-400 border-amber-500/30",       label: "Searching" },
    accepted:    { color: "bg-blue-500/20 text-blue-400 border-blue-500/30",           label: "Accepted" },
    arrived:     { color: "bg-violet-500/20 text-violet-400 border-violet-500/30",     label: "Arrived" },
    in_progress: { color: "bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/30",       label: "In Progress" },
    completed:   { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Completed" },
    cancelled:   { color: "bg-red-500/20 text-red-400 border-red-500/30",             label: "Cancelled" },
    no_drivers:  { color: "bg-gray-500/20 text-gray-400 border-gray-500/30",          label: "No Drivers" },
  };

  const rideCoord = (ride, field) => {
    const keys = { pickupLat: ["pickup_lat","pickupLat"], pickupLng: ["pickup_lng","pickupLng"], destLat: ["destination_lat","destinationLat","dest_lat"], destLng: ["destination_lng","destinationLng","dest_lng"] };
    for (const k of (keys[field] || [])) { if (ride[k] != null) return parseFloat(ride[k]); }
    return null;
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      {/* Background ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#00ff88]/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#00d4ff]/3 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative bg-[#050508]/80 backdrop-blur-xl border-b border-white/5 px-4 py-3 sticky top-0 z-50">
        <div className="container mx-auto max-w-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00ff88] to-[#00d4ff] flex items-center justify-center">
              <Rocket className="w-4 h-4 text-black" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-none">{user?.name} {user?.surname}</p>
              <button className="text-[#00ff88] text-xs mt-0.5 hover:text-[#00d4ff] transition-colors" onClick={() => setShowTopUp(true)}>
                ₾{user?.wallet_balance?.toFixed(2) || "0.00"} · Top Up
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white w-8 h-8" onClick={() => navigate("/")}>
              <Home className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white w-8 h-8" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-2xl relative">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tab Bar */}
          <TabsList className="grid grid-cols-4 bg-white/5 border border-white/10 rounded-2xl p-1 mb-5 h-auto">
            {[["book","Book",Car],["active","Active",Navigation],["history","History",History],["profile","Profile",User]].map(([val,label,Icon]) => (
              <TabsTrigger key={val} value={val}
                className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black data-[state=active]:font-bold data-[state=active]:shadow-none text-gray-500 rounded-xl py-2 transition-all">
                <Icon className="w-3.5 h-3.5 mr-1.5" />
                <span className="text-xs">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ================================================================ */}
          {/* BOOK TAB                                                          */}
          {/* ================================================================ */}
          <TabsContent value="book" className="space-y-3">

            {/* Quick action buttons */}
            <div className="flex gap-2">
              <button onClick={() => setShowFavorites(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${showFavorites ? "bg-pink-500/20 border-pink-500/40 text-pink-400" : "bg-white/5 border-white/10 text-gray-500 hover:border-white/20"}`}>
                <Heart className="w-3.5 h-3.5" /> Saved
              </button>
              <button onClick={() => setShowSchedule(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white/5 border-white/10 text-gray-500 text-xs font-medium hover:border-white/20 transition-all">
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </button>
              {scheduledRides.length > 0 && (
                <span className="ml-auto flex items-center gap-1 text-yellow-400 text-xs">
                  <Calendar className="w-3 h-3" /> {scheduledRides.length} scheduled
                </span>
              )}
            </div>

            {/* Saved locations */}
            {showFavorites && (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <p className="text-pink-400 text-xs font-semibold uppercase tracking-wider mb-3">Saved Places</p>
                <FavoritesPanel onSelect={(fav) => { setDestination({ address: fav.address, lat: fav.lat, lng: fav.lng }); setShowFavorites(false); toast.success(`${fav.name} set as destination`); }} />
              </div>
            )}

            {/* Location fields */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-3">
              {/* Pickup */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-gray-500 text-xs font-medium">Pickup</label>
                  <button className="flex items-center gap-1 text-[#00ff88] text-xs hover:text-[#00e07a] transition-colors" onClick={getCurrentLocation} disabled={locationLoading}>
                    {locationLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
                    My location
                  </button>
                </div>
                <LocationInput id="pickup-input" name="pickup" value={pickup} onChange={setPickup}
                  placeholder="Where should we pick you up?" icon={MapPin} iconColor="text-[#00ff88]"
                  onSaveAsFavorite={pickup.lat ? () => setShowSaveFav(pickup) : null} mapsLoaded={mapsLoaded} />
              </div>

              {/* Connector line */}
              {(stops.length > 0 || destination.address) && (
                <div className="flex items-center gap-2 pl-4">
                  <div className="w-px h-4 bg-white/10" />
                </div>
              )}

              {/* Stops */}
              {stops.map((stop, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-yellow-400/80 text-xs font-medium">Stop {idx + 1}</label>
                    <button className="text-gray-600 hover:text-red-400 transition-colors" onClick={() => removeStop(idx)}><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <LocationInput id={`stop-${idx}`} name={`stop_${idx}`} value={stop}
                    onChange={(data) => updateStop(idx, data)} placeholder="Stop address"
                    icon={MapPin} iconColor="text-yellow-400/80" mapsLoaded={mapsLoaded} />
                </div>
              ))}

              {/* Destination */}
              <div>
                <label className="text-gray-500 text-xs font-medium block mb-1.5">Destination</label>
                <LocationInput id="destination-input" name="destination" value={destination} onChange={setDestination}
                  placeholder="Where to?" icon={Navigation} iconColor="text-[#00d4ff]"
                  onSaveAsFavorite={destination.lat ? () => setShowSaveFav(destination) : null} mapsLoaded={mapsLoaded} />
              </div>

              {stops.length < 3 && (
                <button className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-600 hover:text-gray-400 border border-dashed border-white/10 rounded-xl hover:border-white/20 transition-all" onClick={addStop}>
                  <Plus className="w-3 h-3" /> Add stop (free)
                </button>
              )}
            </div>

            {/* Preview map */}
            {mapsLoaded && pickup.lat && destination.lat && (
              <LiveTrackingMap pickup={pickup} destination={destination} stops={stops} status="preview" driverLocation={null} />
            )}

            {/* Surge alert */}
            {surgeInfo?.is_surge && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-400" />
                  <div>
                    <p className="text-orange-400 font-semibold text-sm">High Demand</p>
                    <p className="text-orange-400/60 text-xs">{surgeInfo.surge_reason}</p>
                  </div>
                </div>
                <span className="text-orange-400 font-bold text-lg bg-orange-500/20 px-3 py-1 rounded-lg">×{surgeInfo.multiplier}</span>
              </div>
            )}

            {/* Route info */}
            {routeInfo && fareEstimate && (
              <div className="bg-white/3 border border-white/8 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <RouteIcon className="w-3.5 h-3.5" />
                  <span>{routeInfo.distance} km · {routeInfo.duration} min</span>
                </div>
                <div className="text-right">
                  <span className="text-[#00ff88] font-bold text-xl">₾{fareEstimate.total.toFixed(2)}</span>
                  {paymentMethod === "card" && <p className="text-gray-600 text-xs">incl. ₾2 card fee</p>}
                </div>
              </div>
            )}

            {/* Vehicle selector */}
            <div>
              <p className="text-gray-500 text-xs font-medium mb-2">Vehicle type</p>
              <div className="grid grid-cols-5 gap-1.5">
                {carTypes.map((type) => {
                  const est = routeInfo
                    ? calculateFare(type.value, routeInfo.distance, 0, 0, validStopsCount, surgeInfo?.multiplier || 1.0, paymentMethod).total
                    : type.base * (surgeInfo?.multiplier || 1.0);
                  return (
                    <button key={type.value} onClick={() => setCarType(type.value)}
                      className={`p-2.5 rounded-xl border-2 transition-all text-center ${carType === type.value ? "border-[#00ff88] bg-[#00ff88]/10" : "border-white/10 bg-white/3 hover:border-white/20"}`}>
                      <div className="text-xl mb-0.5">{type.icon}</div>
                      <div className={`text-xs font-medium leading-tight ${carType === type.value ? "text-[#00ff88]" : "text-gray-400"}`}>{type.name}</div>
                      <div className={`text-xs mt-0.5 ${carType === type.value ? "text-[#00ff88]/80" : "text-gray-600"}`}>₾{est.toFixed(2)}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment */}
            <div>
              <p className="text-gray-500 text-xs font-medium mb-2">Payment</p>
              <div className="flex gap-2">
                {[
                  { val: "cash",   label: "Cash" },
                  { val: "wallet", label: `Wallet ₾${user?.wallet_balance?.toFixed(2) || "0.00"}`, icon: Wallet },
                  { val: "card",   label: "Card", icon: CreditCard },
                ].map(({ val, label, icon: Icon }) => (
                  <button key={val} onClick={() => {
                    if (val === "wallet" && (user?.wallet_balance || 0) <= 0) { toast.error("Wallet empty"); setShowTopUp(true); return; }
                    setPaymentMethod(val); setShowPayPal(false);
                  }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${paymentMethod === val ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]" : "border-white/10 bg-white/3 text-gray-500 hover:border-white/20"}`}>
                    {Icon && <Icon className="w-3 h-3" />}{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Book button */}
            <Button
              className="w-full bg-[#00ff88] text-black font-bold h-14 text-base rounded-2xl hover:bg-[#00e07a] transition-colors shadow-[0_4px_24px_rgba(0,255,136,0.25)]"
              onClick={handleBookRide} disabled={loading} data-testid="request-ride-btn">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Rocket className="w-5 h-5 mr-2" />}
              Request Ride
            </Button>

            {/* PayPal inline — card payment
                FIX: fare fallback so PayPal renders even without a destination/routeInfo */}
            {showPayPal && paymentMethod === "card" && (() => {
              const amount = fareEstimate?.total ?? calculateFare(
                carType,
                routeInfo?.distance ?? 5,
                0, 0,
                validStopsCount,
                surgeInfo?.multiplier ?? 1.0,
                "card"
              ).total;
              const usd = (amount * 0.37).toFixed(2);
              return (
                <div className="bg-white/3 border border-white/10 rounded-2xl p-4">
                  <p className="text-center text-sm text-gray-400 mb-3">
                    Pay ₾{amount.toFixed(2)} (${usd} USD)
                  </p>
                  <PayPalButtons
                    fundingSource="card"
                    style={{ layout: "vertical", shape: "rect" }}
                    createOrder={(data, actions) => actions.order.create({
                      purchase_units: [{ amount: { value: usd, currency_code: "USD" } }],
                      application_context: { shipping_preference: "NO_SHIPPING" },
                    })}
                    onApprove={async (data, actions) => {
                      await actions.order.capture();
                      toast.success("Payment approved! Booking...");
                      await processRideRequest(data.orderID);
                    }}
                    onError={(err) => { console.error("PayPal error:", err); toast.error("Payment failed."); setShowPayPal(false); }}
                    onCancel={() => { toast.info("Payment cancelled."); setShowPayPal(false); }}
                  />
                  <button
                    className="w-full text-center text-gray-600 text-xs mt-3 hover:text-gray-400 transition-colors"
                    onClick={() => setShowPayPal(false)}>
                    Cancel
                  </button>
                </div>
              );
            })()}

            {/* Scheduled rides preview */}
            {scheduledRides.length > 0 && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-2xl p-4">
                <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Scheduled ({scheduledRides.length})
                </p>
                {scheduledRides.slice(0, 2).map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-yellow-500/10 last:border-0">
                    <div>
                      <p className="text-white text-sm truncate max-w-[220px]">{r.pickup_address}</p>
                      <p className="text-yellow-400/60 text-xs mt-0.5">{new Date(r.scheduled_time).toLocaleString()}</p>
                    </div>
                    <button className="text-red-400/70 hover:text-red-400 text-xs transition-colors" onClick={() => cancelScheduledRide(r.id)}>Cancel</button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ================================================================ */}
          {/* ACTIVE TAB                                                        */}
          {/* ================================================================ */}
          <TabsContent value="active">
            {activeRide ? (
              <div className="space-y-3">
                {/* Status bar */}
                <div className="flex items-center justify-between bg-white/3 border border-white/8 rounded-2xl px-4 py-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${(statusConfig[activeRide.status] || statusConfig.searching).color}`}>
                    {(statusConfig[activeRide.status] || statusConfig.searching).label}
                  </span>
                  <SOSButton rideId={activeRide.id} lat={rideCoord(activeRide, "pickupLat")} lng={rideCoord(activeRide, "pickupLng")} />
                </div>

                {/* Map */}
                {mapsLoaded && (
                  <div className="relative">
                    <LiveTrackingMap
                      status={activeRide.status}
                      driverLocation={activeRide.driver_location}
                      pickup={{ lat: rideCoord(activeRide, "pickupLat"), lng: rideCoord(activeRide, "pickupLng") }}
                      destination={rideCoord(activeRide, "destLat") ? { lat: rideCoord(activeRide, "destLat"), lng: rideCoord(activeRide, "destLng") } : null}
                      stops={activeRide.stops || []}
                    />
                    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 z-10">
                      <p className="text-xs text-white font-semibold animate-pulse">
                        ● {activeRide.status === "in_progress" ? "Live Trip" : "Driver Arriving"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Trip route */}
                <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-1 w-2 h-2 rounded-full bg-[#00ff88] shrink-0" />
                    <div>
                      <p className="text-gray-500 text-xs mb-0.5">Pickup</p>
                      <p className="text-white text-sm">{activeRide.pickup}</p>
                    </div>
                  </div>
                  {activeRide.stops?.map((s, i) => (
                    <div key={i} className="flex items-start gap-2.5 pl-0.5">
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 ml-0.5" />
                      <div>
                        <p className="text-yellow-400/60 text-xs mb-0.5">Stop {i + 1}</p>
                        <p className="text-gray-300 text-sm">{s.address}</p>
                      </div>
                    </div>
                  ))}
                  {activeRide.destination && (
                    <div className="flex items-start gap-2.5">
                      <div className="mt-1 w-2 h-2 rounded-full bg-[#00d4ff] shrink-0" />
                      <div>
                        <p className="text-gray-500 text-xs mb-0.5">Destination</p>
                        <p className="text-white text-sm">{activeRide.destination}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Searching indicator */}
                {activeRide.status === "searching" && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    </div>
                    <div>
                      <p className="text-amber-400 font-semibold text-sm">{activeRide.matching_status || "Finding you a driver..."}</p>
                      {activeRide.drivers_notified_count > 0 && <p className="text-amber-400/60 text-xs mt-0.5">{activeRide.drivers_notified_count} drivers notified</p>}
                    </div>
                  </div>
                )}

                {/* No drivers */}
                {activeRide.status === "no_drivers" && (
                  <div className="bg-gray-800/50 border border-white/10 p-4 rounded-xl space-y-3">
                    <p className="text-white font-semibold text-sm">No drivers available right now</p>
                    <div className="flex gap-2">
                      <Button className="flex-1 bg-[#00ff88] text-black font-bold rounded-xl h-11 text-sm" onClick={handleRetryRide}>
                        <Rocket className="w-4 h-4 mr-1.5" /> Retry
                      </Button>
                      <Button variant="outline" className="border-white/10 text-gray-400 rounded-xl h-11 text-sm px-4" onClick={() => { setActiveRide(null); setActiveTab("book"); }}>
                        New Ride
                      </Button>
                    </div>
                  </div>
                )}

                {/* Driver info */}
                {activeRide.driver_info && (
                  <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00ff88]/20 to-[#00d4ff]/20 border border-white/10 flex items-center justify-center shrink-0">
                        <User className="w-7 h-7 text-white/60" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-xl text-white">{activeRide.driver_info.name}</p>
                        <p className="text-gray-500 text-sm flex items-center gap-1 mt-0.5">
                          <Car className="w-3.5 h-3.5" />
                          {activeRide.driver_info.car_color} {activeRide.driver_info.car_make} {activeRide.driver_info.car_model}
                        </p>
                      </div>
                      <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 px-3 py-1.5 rounded-xl">
                        <p className="text-[#00ff88] font-mono font-bold tracking-wider text-base">{activeRide.driver_info.license_plate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 pt-1 border-t border-white/5">
                      <Lock className="w-3 h-3 text-[#00ff88]" />
                      <span>Background checked & verified</span>
                    </div>
                    <RideCommunication
                      rideId={activeRide.id}
                      otherPartyPhone={activeRide.driver_info.cellphone}
                      otherPartyName={activeRide.driver_info.name}
                      currentUserId={user?.id}
                      isDriver={false}
                    />
                  </div>
                )}

                {/* Wait timer */}
                {activeRide.status === "arrived" && (
                  <WaitTimer arrivedAt={activeRide.arrived_at} carType={activeRide.carType || activeRide.car_type} />
                )}

                {/* Share */}
                {["accepted","arrived","in_progress"].includes(activeRide.status) && (
                  <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 text-gray-500 text-sm hover:border-white/20 hover:text-gray-300 transition-all"
                    onClick={() => setShowShare(true)}>
                    <Share2 className="w-4 h-4" /> Share trip with someone
                  </button>
                )}

                {/* Fare */}
                <div className="bg-[#00ff88]/5 border border-[#00ff88]/20 rounded-xl px-4 py-3 flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Estimated fare</span>
                  <span className="text-[#00ff88] font-bold text-2xl">₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}</span>
                </div>

                {/* Cancel */}
                {["searching","accepted"].includes(activeRide.status) && (
                  <Button variant="outline" className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl h-11" onClick={handleCancelRide}>
                    Cancel Ride
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-4">
                  <Navigation className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-gray-500 mb-5">No active ride</p>
                <Button className="bg-[#00ff88] text-black font-bold rounded-xl px-6 h-11" onClick={() => setActiveTab("book")}>Book a Ride</Button>
              </div>
            )}
          </TabsContent>

          {/* ================================================================ */}
          {/* HISTORY TAB                                                       */}
          {/* ================================================================ */}
          <TabsContent value="history">
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-2">
                {rideHistory.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                      <History className="w-6 h-6 text-gray-600" />
                    </div>
                    <p className="text-gray-600">No rides yet</p>
                  </div>
                )}
                {rideHistory.map((ride) => {
                  const sc = statusConfig[ride.status] || statusConfig.cancelled;
                  return (
                    <div key={ride.id} className="bg-white/3 border border-white/8 rounded-2xl p-4">
                      <div className="flex justify-between items-start mb-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${sc.color}`}>{sc.label}</span>
                        <span className="text-gray-600 text-xs">{ride.created_at ? new Date(ride.created_at).toLocaleDateString() : "—"}</span>
                      </div>
                      <p className="text-gray-400 text-sm truncate">📍 {ride.pickup}</p>
                      <p className="text-gray-400 text-sm truncate mt-0.5">🏁 {ride.destination || "Open trip"}</p>
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                        <span className="text-gray-600 text-xs capitalize">{ride.carType || ride.car_type}</span>
                        <span className="text-[#00ff88] font-bold">₾{(ride.final_fare || ride.estimated_fare)?.toFixed(2) ?? "—"}</span>
                      </div>
                      {ride.status === "completed" && (
                        <div className="flex gap-1.5 mt-3 pt-3 border-t border-white/5">
                          <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-all"
                            onClick={() => setShowReceipt(ride.id)}>
                            <Receipt className="w-3 h-3" /> Receipt
                          </button>
                          {!ride.tip_amount && ride.driver_id && (
                            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-all"
                              onClick={() => setShowTip({ rideId: ride.id, driverName: ride.driver_info?.name || "Driver" })}>
                              <DollarSign className="w-3 h-3" /> Tip
                            </button>
                          )}
                          {!ride.rider_rating && (
                            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-all"
                              onClick={() => setShowRatingModal(ride.id)}>
                              <Star className="w-3 h-3" /> Rate
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ================================================================ */}
          {/* PROFILE TAB                                                       */}
          {/* ================================================================ */}
          <TabsContent value="profile">
            <div className="space-y-3">
              {/* User card */}
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00ff88]/20 to-[#00d4ff]/20 border border-white/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-white/50" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg">{user?.name} {user?.surname}</p>
                    <p className="text-gray-500 text-sm">{user?.cellphone}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-[#00ff88] text-xl font-bold">{user?.total_rides || 0}</p>
                    <p className="text-gray-600 text-xs mt-0.5">Total Rides</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center">
                    <p className="text-yellow-400 text-xl font-bold">{user?.rating?.toFixed(1) || "5.0"} ⭐</p>
                    <p className="text-gray-600 text-xs mt-0.5">Rating</p>
                  </div>
                </div>
              </div>

              {/* Wallet */}
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-[#00ff88]" />
                    <span className="text-white font-semibold text-sm">Wallet</span>
                  </div>
                  <span className="text-[#00ff88] font-bold text-2xl">₾{user?.wallet_balance?.toFixed(2) || "0.00"}</span>
                </div>
                <Button className="w-full bg-[#00ff88] text-black font-bold rounded-xl h-10 text-sm" onClick={() => setShowTopUp(true)}>
                  <Plus className="w-4 h-4 mr-1.5" /> Top Up
                </Button>
              </div>

              {/* Refer & Earn */}
              <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                <button className="w-full flex items-center justify-between px-4 py-3.5" onClick={() => setShowReferral(v => !v)}>
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-[#00d4ff]" />
                    <span className="text-white font-semibold text-sm">Refer & Earn</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showReferral ? "rotate-180" : ""}`} />
                </button>
                {showReferral && (
                  <div className="px-4 pb-4 border-t border-white/5 pt-4">
                    <ReferralPanel />
                  </div>
                )}
              </div>

              {/* Saved Places */}
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <p className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
                  <Heart className="w-4 h-4 text-pink-400" /> Saved Places
                </p>
                <FavoritesPanel onSelect={(fav) => { setDestination({ address: fav.address, lat: fav.lat, lng: fav.lng }); setActiveTab("book"); toast.success(`${fav.name} set as destination`); }} />
              </div>

              {/* Language */}
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <p className="text-white font-semibold text-sm mb-3">Language</p>
                <LanguageSelector variant="outline" onSelect={(lang) => api.post(`/user/language?lang=${lang}`).catch(() => {})} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* ================================================================ */}
      {/* MODALS                                                            */}
      {/* ================================================================ */}
      <RiderTripCompletionModal
        isOpen={!!completedRideData}
        onClose={() => setCompletedRideData(null)}
        fareAmount={completedRideData?.final_fare}
        paymentMethod={completedRideData?.payment_method}
        driverName={completedRideData?.driver_name}
        onRateDriver={() => {
          const rideId = completedRideData?.id;
          const driverName = completedRideData?.driver_name;
          setCompletedRideData(null);
          setShowRatingModal(rideId);
          if (driverName) setTimeout(() => setShowTip({ rideId, driverName }), 600);
        }}
      />
      <RatingModal isOpen={!!showRatingModal} onClose={() => setShowRatingModal(null)} rideId={showRatingModal} ratingType="driver"
        onRatingComplete={() => { setShowRatingModal(null); toast.success(t("rating_submitted") || "Thanks!"); fetchRideHistory(); }} />
      <ReceiptModal isOpen={!!showReceipt} onClose={() => setShowReceipt(null)} rideId={showReceipt} />
      <TipModal isOpen={!!showTip} onClose={() => setShowTip(null)} rideId={showTip?.rideId} driverName={showTip?.driverName}
        onTipped={() => { fetchRideHistory(); if (refreshUser) refreshUser(); }} />
      <ShareTripModal isOpen={showShare} onClose={() => setShowShare(false)} rideId={activeRide?.id} />
      <ScheduledRideModal isOpen={showSchedule} onClose={() => { setShowSchedule(false); fetchScheduledRides(); }}
        pickup={pickup} destination={destination} carType={carType} />
      <WalletTopUpModal isOpen={showTopUp} onClose={() => setShowTopUp(false)}
        onSuccess={() => { if (refreshUser) refreshUser(); fetchRideHistory(); }} />
      {showSaveFav && (
        <SaveFavoriteDialog location={showSaveFav} onSave={() => setShowSaveFav(null)} onClose={() => setShowSaveFav(null)} />
      )}
    </div>
  );
};

// =============================================================================
// PORTAL ROUTER
// FIX: client-id guard — fallback to "sb" (sandbox) prevents SDK crash if
//      VITE_PAYPAL_CLIENT_ID is momentarily undefined during hot-reload or
//      a misconfigured build. In production on Render, the real key is used.
// =============================================================================
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

if (!PAYPAL_CLIENT_ID) {
  console.error(
    "❌ VITE_PAYPAL_CLIENT_ID is not set. " +
    "Add it to your Render frontend service environment variables and redeploy."
  );
}

const RiderPortal = () => {
  const { user }   = useAuth();
  const location   = useLocation();

  if (!user || user.user_type !== "rider") {
    if (location.pathname === "/rider" || location.pathname === "/rider/") return <RiderAuth />;
    return <Navigate to="/rider" replace />;
  }

  return (
    <PayPalScriptProvider
      options={{
        "client-id": PAYPAL_CLIENT_ID || "sb",
        currency: "USD",
        intent: "capture",
      }}
    >
      <Routes>
        <Route path="/"         element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<RiderDashboard />} />
        <Route path="*"         element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default RiderPortal;