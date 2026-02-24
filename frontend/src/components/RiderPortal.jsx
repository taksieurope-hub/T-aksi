// RiderPortal.jsx
// ✅ Production-hardened rewrite of your Rider Portal, keeping your existing logic
// ✅ Fixes critical bugs (rating flow, PayPal modal, polling storms, inconsistent backend field names)
// ✅ Adds “server-shape normalization” so rider UI works even if server.py returns different key styles
// ✅ Makes card + wallet flows clean and non-broken (PayPal modal was using undefined topupAmount + driver endpoints)

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import api from "@/api";
import { useLanguage } from "@/i18n/LanguageContext";
import LanguageSelector from "@/i18n/LanguageSelector";
import { RiderTripCompletionModal } from "@/components/TripCompletionModal";
import RatingModal from "@/components/RatingModal";
import RideCommunication from "./RideCommunication";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

import {
  Car,
  MapPin,
  History,
  Home,
  LogOut,
  User,
  Navigation,
  Rocket,
  ArrowLeft,
  Lock,
  Phone,
  Star,
  Loader2,
  X,
  Crosshair,
  MapPinned,
  Plus,
  TrendingUp,
  Timer,
  CreditCard,
  Target,
  Route as RouteLineIcon,
  Wallet,
} from "lucide-react";

/** =========================================================
 *  1) Pricing (kept exactly, with serviceFee on card)
 *  ========================================================= */
const PRICING_RULES = {
  economy: { name: "Economy", base: 2.8, perKm: 0.5, perMinWait: 0.4, freeWait: 2, stopFee: 0.0, icon: "🚗" },
  comfort: { name: "Comfort", base: 3.38, perKm: 0.55, perMinWait: 0.45, freeWait: 2, stopFee: 0.0, icon: "🚙" },
  suv: { name: "SUV / XL", base: 5.18, perKm: 0.8, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "🚐" },
  personal: { name: "Personal", base: 5.12, perKm: 0.7, perMinWait: 0.5, freeWait: 3, stopFee: 0.0, icon: "👤" },
  jumpstart: { name: "Jumpstart", base: 4.5, perKm: 0.0, perMinWait: 0.0, freeWait: 999, stopFee: 0.0, icon: "⚡" },
};

const calculateFare = (
  carType,
  distanceKm,
  waitMin = 0,
  stopWaitMin = 0,
  numStops = 0,
  surgeMultiplier = 1.0,
  paymentMethod = "cash"
) => {
  const rules = PRICING_RULES[carType] || PRICING_RULES.economy;

  let subtotal = rules.base;
  subtotal += distanceKm * rules.perKm;

  if (distanceKm > 7) subtotal += (distanceKm - 7) * 0.15;
  if (distanceKm > 30) subtotal += Math.ceil((distanceKm - 30) / 15) * 5;

  const billableWait = Math.max(0, waitMin - rules.freeWait);
  subtotal += billableWait * rules.perMinWait;
  subtotal += stopWaitMin * rules.perMinWait;

  subtotal += numStops * rules.stopFee;

  const surgeFee = subtotal * (surgeMultiplier - 1.0);
  const serviceFee = paymentMethod === "card" ? 2.0 : 0.0;

  const total = subtotal + surgeFee + serviceFee;

  return {
    base: rules.base,
    distance: Math.round(distanceKm * rules.perKm * 100) / 100,
    wait: Math.round((billableWait + stopWaitMin) * rules.perMinWait * 100) / 100,
    stops: numStops * rules.stopFee,
    subtotal: Math.round(subtotal * 100) / 100,
    surgeFee: Math.round(surgeFee * 100) / 100,
    serviceFee: serviceFee.toFixed(2),
    surgeMultiplier,
    total: Math.round(total * 100) / 100,
  };
};

/** =========================================================
 *  2) Helpers to match whatever server.py returns (snake/camel)
 *  ========================================================= */
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

// Normalize ride object so UI can rely on one shape
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

  const carType = pickAny(ride, ["carType", "car_type"], "economy");
  const paymentMethod = pickAny(ride, ["payment_method", "paymentMethod"], "cash");

  const estimatedFare = pickAny(ride, ["estimated_fare", "estimatedFare"], null);
  const finalFare = pickAny(ride, ["final_fare", "finalFare"], null);

  const arrivedAt = pickAny(ride, ["arrived_at", "arrivedAt"], null);

  const driverInfo = pickAny(ride, ["driver_info", "driverInfo"], null);
  const driverLocation = pickAny(ride, ["driver_location", "driverLocation"], null);

  const stops = Array.isArray(ride.stops) ? ride.stops : [];

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
    carType,
    payment_method: paymentMethod,
    estimated_fare: estimatedFare,
    final_fare: finalFare,
    arrived_at: arrivedAt,
    driver_info: driverInfo,
    driver_location: driverLocation,
    stops,
  };
};

const isTerminal = (status) => ["completed", "cancelled", "no_drivers"].includes(status);

/** =========================================================
 *  3) Google Maps loader (single script, safe)
 *  ========================================================= */
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

/** =========================================================
 *  4) Autocomplete hook (your mobile CSS kept)
 *  ========================================================= */
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {
  const cbRef = useRef(onPlaceSelect);
  useEffect(() => {
    cbRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      .pac-container { 
        z-index: 999999 !important;
        background-color: #ffffff !important; 
        border: 1px solid #e5e7eb !important; 
        border-radius: 0 0 12px 12px !important; 
        font-family: inherit !important; 
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2) !important; 
        position: absolute !important;
        padding-bottom: 8px !important;
      }
      .pac-item { 
        color: #374151 !important; 
        border-top: 1px solid #f3f4f6 !important; 
        padding: 12px 16px !important;
        cursor: pointer !important; 
        font-size: 14px !important;
      }
      .pac-item:hover, .pac-item:active { background-color: #f3f4f6 !important; }
      .pac-item-query { 
        color: #000000 !important; 
        font-weight: 800 !important; 
        font-size: 15px !important;
      }
      .pac-logo:after { display: none !important; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    let interval = null;
    interval = setInterval(() => {
      if (inputRef.current && window.google?.maps?.places) {
        clearInterval(interval);

        const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "ge" },
          fields: ["formatted_address", "geometry", "name"],
        });

        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (place?.geometry) {
            cbRef.current({
              address: place.formatted_address || place.name,
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            });
            inputRef.current?.blur();
          }
        });
      }
    }, 350);

    return () => interval && clearInterval(interval);
  }, [inputRef]);
};

/** =========================================================
 *  5) MapPicker (kept; cleaned markerRef unused)
 *  ========================================================= */
const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const [address, setAddress] = useState("Move map to select location...");
  const [isDragging, setIsDragging] = useState(false);
  const [locating, setLocating] = useState(false);
  const [center, setCenter] = useState({ lat: 41.7151, lng: 44.8271 });

  useEffect(() => {
    if (initialLocation?.lat) {
      setCenter({ lat: parseFloat(initialLocation.lat), lng: parseFloat(initialLocation.lng) });
    }
  }, [initialLocation]);

  useEffect(() => {
    if (!isOpen) mapInstanceRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !mapRef.current || !window.google) return;

    if (!mapInstanceRef.current) {
      const map = new window.google.maps.Map(mapRef.current, {
        center,
        zoom: 17,
        disableDefaultUI: true,
        clickableIcons: false,
        backgroundColor: "#1a1a2e",
        styles: [
          { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
        ],
      });

      map.addListener("idle", () => {
        setIsDragging(false);
        const c = map.getCenter();
        const lat = c.lat();
        const lng = c.lng();
        setCenter({ lat, lng });

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === "OK" && results?.[0]) setAddress(results[0].formatted_address);
          else setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        });
      });

      map.addListener("dragstart", () => setIsDragging(true));
      mapInstanceRef.current = map;
    }
  }, [isOpen]); // intentional

  const handleLocateMe = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude);
        const lng = parseFloat(position.coords.longitude);
        const pos = { lat, lng };
        mapInstanceRef.current?.panTo(pos);
        mapInstanceRef.current?.setZoom(17);
        setCenter(pos);
        setLocating(false);
      },
      () => {
        toast.error("Could not find location");
        setLocating(false);
      },
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
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="bg-black/50 text-white rounded-full pointer-events-auto backdrop-blur-md border border-[#00ff88]/30"
        >
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
            <MapPin
              className={`w-12 h-12 text-[#00ff88] drop-shadow-2xl transition-transform duration-200 ${
                isDragging ? "-translate-y-4" : ""
              }`}
              fill="black"
            />
            <div className="w-2 h-2 bg-black/50 rounded-full blur-[2px] mt-[-5px]" />
          </div>
        </div>

        <Button
          size="icon"
          className="absolute bottom-6 right-4 rounded-full w-12 h-12 bg-black/80 border border-[#00ff88]/50 text-[#00ff88] shadow-lg z-20"
          onClick={handleLocateMe}
          disabled={locating}
        >
          {locating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Crosshair className="w-6 h-6" />}
        </Button>
      </div>

      <div className="bg-[#1a1a2e] p-6 rounded-t-3xl border-t border-[#00ff88]/30 -mt-6 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
        <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
        <p className="text-[#00ff88] text-xs font-bold uppercase mb-1">Selected Location</p>
        <h3 className="text-white text-lg font-bold truncate mb-6">{isDragging ? "Locating..." : address}</h3>
        <Button
          className="w-full bg-[#00ff88] text-black font-bold h-14 text-lg rounded-xl"
          onClick={handleConfirm}
          disabled={isDragging}
        >
          {isDragging ? "Release to Select" : "Confirm Location"}
        </Button>
      </div>
    </div>
  );
};

/** =========================================================
 *  6) LiveTrackingMap (kept; stable routing + driver marker)
 *  ========================================================= */
const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const routeSignatureRef = useRef(null);
  const [isFollowing, setIsFollowing] = useState(true);

  const getSafeCoord = (val) => {
    const n = parseFloat(val);
    return Number.isFinite(n) && n !== 0 ? n : null;
  };

  useEffect(() => {
    if (!mapRef.current || !window.google) return;
    if (mapInstanceRef.current) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 },
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
      backgroundColor: "#1a1a2e",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
      ],
    });

    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 6 },
    });

    map.addListener("dragstart", () => setIsFollowing(false));
    map.addListener("zoom_changed", () => setIsFollowing(false));

    mapInstanceRef.current = map;
  }, []);

  const drawRoute = useCallback((origin, target, waypoints = []) => {
    const svc = new window.google.maps.DirectionsService();
    svc.route(
      { origin, destination: target, waypoints, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, apiStatus) => {
        if (apiStatus === "OK" && directionsRendererRef.current) {
          directionsRendererRef.current.setDirections(result);

          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(origin);
          bounds.extend(target);
          waypoints.forEach((w) => bounds.extend(w.location));
          mapInstanceRef.current.fitBounds(bounds);
          mapInstanceRef.current.panBy(0, 20);
        }
      }
    );
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;

    const pLat = getSafeCoord(pickup?.lat);
    const pLng = getSafeCoord(pickup?.lng);

    const destLat = getSafeCoord(destination?.lat);
    const destLng = getSafeCoord(destination?.lng);

    const dLat = getSafeCoord(driverLocation?.lat);
    const dLng = getSafeCoord(driverLocation?.lng);

    const waypoints = (stops || [])
      .filter((s) => s?.lat && s?.lng)
      .map((s) => ({ location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true }));

    const sig = `${pLat},${pLng}|${destLat},${destLng}|${waypoints.map((w) => w.location.lat).join(",")}|${status}`;
    if (routeSignatureRef.current === sig) return;

    // Booking preview
    if (status === "preview") {
      if (pLat && pLng && destLat && destLng) {
        drawRoute({ lat: pLat, lng: pLng }, { lat: destLat, lng: destLng }, waypoints);
        routeSignatureRef.current = sig;
      }
      return;
    }

    // Live routing (driver to pickup OR driver to destination)
    if (!dLat || !dLng) return;
    const origin = { lat: dLat, lng: dLng };

    let target = null;
    let activeWaypoints = [];

    if (["accepted", "searching", "arrived"].includes(status) && pLat && pLng) {
      target = { lat: pLat, lng: pLng };
      activeWaypoints = [];
    } else if (status === "in_progress" && destLat && destLng) {
      target = { lat: destLat, lng: destLng };
      activeWaypoints = waypoints;
    }

    if (target) {
      drawRoute(origin, target, activeWaypoints);
      routeSignatureRef.current = sig;
    }
  }, [pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, JSON.stringify(stops), status, driverLocation?.lat, driverLocation?.lng, drawRoute]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation?.lat) return;

    const endLat = parseFloat(driverLocation.lat);
    const endLng = parseFloat(driverLocation.lng);
    const heading = parseFloat(driverLocation.heading) || 0;
    const SPACESHIP_SVG = "M 0,-18 L 12,14 L 0,8 L -12,14 Z";

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: { lat: endLat, lng: endLng },
        map: mapInstanceRef.current,
        icon: {
          path: SPACESHIP_SVG,
          scale: 1.5,
          fillColor: "#00d4ff",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          rotation: heading,
          anchor: new window.google.maps.Point(0, 0),
        },
        zIndex: 1000,
      });

      if (isFollowing) {
        mapInstanceRef.current.moveCamera({ center: { lat: endLat, lng: endLng }, heading, tilt: 45, zoom: 18 });
      }
      return;
    }

    if (window.__riderAnimFrame) cancelAnimationFrame(window.__riderAnimFrame);

    const startLat = driverMarkerRef.current.getPosition().lat();
    const startLng = driverMarkerRef.current.getPosition().lng();

    const icon = driverMarkerRef.current.getIcon();
    icon.rotation = heading;
    driverMarkerRef.current.setIcon(icon);

    const startTime = performance.now();
    const duration = 1000;

    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const curLat = startLat + (endLat - startLat) * progress;
      const curLng = startLng + (endLng - startLng) * progress;
      const pos = { lat: curLat, lng: curLng };
      driverMarkerRef.current.setPosition(pos);

      if (isFollowing) {
        mapInstanceRef.current.moveCamera({ center: pos, heading, tilt: 45, zoom: 18 });
      }

      if (progress < 1) window.__riderAnimFrame = requestAnimationFrame(animate);
    };

    window.__riderAnimFrame = requestAnimationFrame(animate);
    return () => window.__riderAnimFrame && cancelAnimationFrame(window.__riderAnimFrame);
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
        <button
          onClick={handleRecenter}
          className="absolute bottom-4 right-4 bg-black/80 text-[#00d4ff] p-3 rounded-full border border-[#00d4ff] shadow-lg z-10 hover:bg-black"
        >
          <Crosshair className="w-6 h-6 animate-pulse" />
        </button>
      )}
    </div>
  );
};

/** =========================================================
 *  7) LocationInput
 *  ========================================================= */
const LocationInput = ({ value, onChange, placeholder, icon: Icon, iconColor, id, name }) => {
  const inputRef = useRef(null);
  const [showMapPicker, setShowMapPicker] = useState(false);

  useGoogleMapsAutocomplete(inputRef, (place) => onChange({ address: place.address, lat: place.lat, lng: place.lng }));

  return (
    <>
      <div className="relative flex items-center shadow-sm rounded-md">
        <Icon className={`absolute left-3 h-5 w-5 ${iconColor} z-10`} />
        <Input
          ref={inputRef}
          id={id}
          name={name}
          value={value?.address || ""}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          className="pl-10 pr-10 bg-white border-gray-300 text-black font-medium placeholder:text-gray-400 focus-visible:ring-[#00ff88]"
          placeholder={placeholder}
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 text-gray-500 hover:text-black hover:bg-gray-100 z-10"
          onClick={() => setShowMapPicker(true)}
          type="button"
        >
          <MapPinned className="w-5 h-5" />
        </Button>
      </div>

      <MapPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onLocationSelect={(loc) => onChange(loc)}
        title={placeholder}
        initialLocation={value}
      />
    </>
  );
};

/** =========================================================
 *  8) Auth (kept; minor hardening)
 *  ========================================================= */
const RiderAuth = () => {
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
      const endpoint = isLogin ? "/auth/login" : "/auth/register/rider";
      const res = await api.post(endpoint, formData);

      if (res?.data?.token && res?.data?.user) {
        login(res.data.token, res.data.user);
        toast.success(isLogin ? t("welcome_back") : t("success"));
        navigate("/rider/dashboard");
      } else {
        throw new Error("Invalid auth response");
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
      <Card className="w-full max-w-md glass-heavy">
        <CardHeader className="text-center relative">
          <div className="absolute right-4 top-4">
            <LanguageSelector variant="ghost" />
          </div>
          <Button variant="ghost" className="absolute left-4 top-4 text-secondary hover:text-white" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> {t("back")}
          </Button>

          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-secondary to-primary flex items-center justify-center mx-auto mb-4 mt-8">
            <Rocket className="w-10 h-10 text-black" />
          </div>

          <CardTitle className="text-2xl text-secondary font-heading">{isLogin ? t("welcome_back") : t("join_taksi")}</CardTitle>
          <CardDescription className="text-primary/70">{isLogin ? t("sign_in_book") : t("create_account")}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-secondary">{t("first_name")}</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className="bg-background-secondary border-border text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-secondary">{t("last_name")}</Label>
                  <Input
                    value={formData.surname}
                    onChange={(e) => setFormData((p) => ({ ...p, surname: e.target.value }))}
                    className="bg-background-secondary border-border text-white"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-secondary">{t("phone_number")}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-secondary/50" />
                <Input
                  type="tel"
                  value={formData.cellphone}
                  onChange={(e) => setFormData((p) => ({ ...p, cellphone: e.target.value }))}
                  className="pl-10 bg-background-secondary border-border text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-secondary">{t("password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-secondary/50" />
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                  className="pl-10 bg-background-secondary border-border text-white"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-gradient-to-r from-secondary to-primary text-black font-bold hover:shadow-neon-green" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isLogin ? t("sign_in") : t("sign_up")}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <Button variant="link" className="text-primary" onClick={() => setIsLogin((v) => !v)} type="button">
            {isLogin ? t("need_account") : t("have_account")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

/** =========================================================
 *  9) WaitTimer (kept)
 *  ========================================================= */
const WaitTimer = ({ arrivedAt, carType }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = arrivedAt ? new Date(arrivedAt).getTime() : Date.now();
    const i = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(i);
  }, [arrivedAt]);

  const rules = PRICING_RULES[(carType || "economy").toLowerCase()] || PRICING_RULES.economy;
  const freeWaitSeconds = rules.freeWait * 60;

  if (elapsed <= freeWaitSeconds) {
    const remaining = freeWaitSeconds - elapsed;
    const mins = Math.floor(remaining / 60).toString().padStart(2, "0");
    const secs = (remaining % 60).toString().padStart(2, "0");

    return (
      <div className="bg-purple-500/20 border border-purple-500 p-4 rounded-xl flex items-center justify-between">
        <div className="flex items-center text-purple-400">
          <Timer className="w-5 h-5 mr-2 animate-pulse" />
          <span className="font-medium">Driver Waiting</span>
        </div>
        <div className="text-right">
          <div className="text-purple-400 font-mono text-xl font-bold">
            {mins}:{secs}
          </div>
          <div className="text-purple-400/70 text-xs uppercase font-bold tracking-wider">Free Time</div>
        </div>
      </div>
    );
  }

  const overtime = elapsed - freeWaitSeconds;
  const mins = Math.floor(overtime / 60).toString().padStart(2, "0");
  const secs = (overtime % 60).toString().padStart(2, "0");
  const liveFee = ((overtime / 60) * rules.perMinWait).toFixed(2);

  return (
    <div className="bg-red-500/20 border border-red-500 p-4 rounded-xl flex items-center justify-between shadow-[0_0_15px_rgba(239,68,68,0.2)]">
      <div className="flex items-center text-red-400">
        <Timer className="w-5 h-5 mr-2 animate-pulse" />
        <span className="font-medium">Paid Wait Time</span>
      </div>
      <div className="text-right">
        <div className="text-red-400 font-mono text-xl font-bold">
          -{mins}:{secs}
        </div>
        <div className="text-red-400 font-bold text-sm">+₾{liveFee}</div>
      </div>
    </div>
  );
};

/** =========================================================
 *  10) RiderDashboard (rewritten to be stable + correct)
 *  ========================================================= */
const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const mountedRef = useRef(true);
  useEffect(() => () => (mountedRef.current = false), []);

  const notifiedArrived = useRef(false);
  const notifiedAccepted = useRef(false);

  const [activeTab, setActiveTab] = useState("book");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const [mapsLoaded, setMapsLoaded] = useState(false);

  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);

  const [pickup, setPickup] = useState({ address: "", lat: null, lng: null });
  const [destination, setDestination] = useState({ address: "", lat: null, lng: null });

  const [stops, setStops] = useState([]);
  const [carType, setCarType] = useState("economy");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const [routeInfo, setRouteInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);

  const [surgeInfo, setSurgeInfo] = useState(null);

  // ✅ Fixed completion/rating flow:
  // we keep completed ride in its own state; we DO NOT null it before RatingModal reads it
  const [completedRide, setCompletedRide] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // ✅ Card payment modal: now actually for ride payment (not driver topup + not using undefined topupAmount)
  const [showCardModal, setShowCardModal] = useState(false);
  const [pendingRidePayload, setPendingRidePayload] = useState(null); // rideData staged for after PayPal approve

  const statusColors = useMemo(
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

  /** ----------------------------
   * Google Maps load
   * ---------------------------- */
  useEffect(() => {
    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(() => mountedRef.current && setMapsLoaded(true))
      .catch(() => {
        toast.error("Failed to load Google Maps. Check API key/network.");
        console.error("Google Maps script failed");
      });
  }, []);

  /** ----------------------------
   * Fetchers (server-driven truth)
   * ---------------------------- */
  const fetchSurgeStatus = useCallback(async (lat, lng) => {
    try {
      const params = lat ? `?lat=${lat}&lng=${lng}` : "";
      const res = await api.get(`/surge/status${params}`);
      if (!mountedRef.current) return;
      setSurgeInfo(res.data);
    } catch (e) {
      console.error("Error fetching surge:", e);
    }
  }, []);

  const fetchRideHistory = useCallback(async () => {
    try {
      const res = await api.get(`/rider/history`);
      if (!mountedRef.current) return;
      setRideHistory(res.data?.rides || []);
    } catch (e) {
      console.error("Error fetching history:", e);
    }
  }, []);

  const fetchActiveRide = useCallback(async (knownRideId = null) => {
    try {
      let res;
      if (knownRideId) {
        res = await api.get(`/rides/${knownRideId}`);
      } else {
        res = await api.get(`/rider/active-ride`);
      }

      const normalized = normalizeRide(res.data);
      if (!mountedRef.current) return;
      setActiveRide(normalized || null);
      return normalized || null;
    } catch (e) {
      // If no active ride / 404, don't toast spam
      return null;
    }
  }, []);

  /** ----------------------------
   * Initial loads
   * ---------------------------- */
  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
    fetchSurgeStatus(pickup.lat, pickup.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pickup?.lat) fetchSurgeStatus(pickup.lat, pickup.lng);
  }, [pickup?.lat, pickup?.lng, fetchSurgeStatus]);

  /** ----------------------------
   * Route calculation (kept logic, stabilized)
   * ---------------------------- */
  const stopsSignature = useMemo(() => stops.map((s) => `${s.lat},${s.lng}`).join("|"), [stops]);
  const validStopsCount = useMemo(() => stops.filter((s) => s.lat && s.lng).length, [stops]);

  const calculateRoute = useCallback(() => {
    if (!window.google || !pickup.lat || !destination.lat) return;

    try {
      const directionsService = new window.google.maps.DirectionsService();
      const waypoints = stops
        .filter((s) => s.lat && s.lng)
        .map((s) => ({
          location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) },
          stopover: true,
        }));

      directionsService.route(
        {
          origin: { lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng) },
          destination: { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) },
          waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (res, status) => {
          if (status === "OK" && res?.routes?.[0]?.legs) {
            let d = 0,
              tt = 0;
            res.routes[0].legs.forEach((l) => {
              d += l.distance.value;
              tt += l.duration.value;
            });

            const newDist = Math.round(d / 100) / 10;
            const newDur = Math.round(tt / 60);

            setRouteInfo((prev) => {
              if (prev && prev.distance === newDist && prev.duration === newDur) return prev;
              return { distance: newDist, duration: newDur };
            });
          } else {
            console.warn("Route failed:", status);
          }
        }
      );
    } catch (err) {
      console.error("Route Error:", err);
    }
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, JSON.stringify(stops)]);

  useEffect(() => {
    if (mapsLoaded && pickup.lat && destination.lat) {
      const timer = setTimeout(calculateRoute, 450);
      return () => clearTimeout(timer);
    }
  }, [mapsLoaded, pickup.lat, pickup.lng, destination.lat, destination.lng, stopsSignature, calculateRoute]);

  useEffect(() => {
    if (!routeInfo) return;
    const surge = surgeInfo?.multiplier || 1.0;
    const fare = calculateFare(carType, routeInfo.distance, 0, 0, validStopsCount, surge, paymentMethod);
    setFareEstimate(fare);
  }, [routeInfo, carType, validStopsCount, surgeInfo, paymentMethod]);

  /** ----------------------------
   * Polling (FIXED: no 100ms storm)
   * - one poll loop, 2s while searching/accepted/arrived/in_progress
   * - stops automatically on terminal
   * ---------------------------- */
  const pollRef = useRef(null);

  const startPolling = useCallback(
    (rideId) => {
      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        const r = await fetchActiveRide(rideId);
        if (!r) return;

        // One-time toasts
        if (r.status === "arrived") {
          if (!notifiedArrived.current) {
            toast.success("YOUR DRIVER HAS ARRIVED!", {
              description: "Please meet your driver at the pickup location. The free wait timer has started.",
              duration: 10000,
              icon: "🚗",
            });
            notifiedArrived.current = true;
          }
        } else if (r.status === "searching") {
          notifiedArrived.current = false;
          notifiedAccepted.current = false;
        }

        if (r.status === "accepted" && r.driver_info) {
          if (!notifiedAccepted.current) {
            toast.success(`Driver ${r.driver_info.name} is coming!`);
            notifiedAccepted.current = true;
          }
        }

        if (isTerminal(r.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;

          if (r.status === "completed") {
            setCompletedRide({
              id: r.id,
              final_fare: r.final_fare || r.estimated_fare,
              payment_method: r.payment_method,
              driver_name: r.driver_info?.name || r.driver_name,
            });

            fetchRideHistory();

            setTimeout(() => {
              if (!mountedRef.current) return;
              setActiveRide(null);
              setActiveTab("book");
            }, 400);
          } else if (r.status === "no_drivers") {
            toast.error("No drivers available. Please try again.");
          }
        }
      }, 2000);
    },
    [fetchActiveRide, fetchRideHistory]
  );

  useEffect(() => {
    if (!activeRide?.id) return;
    if (activeRide && !isTerminal(activeRide.status)) startPolling(activeRide.id);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [activeRide?.id, activeRide?.status, startPolling]);

  /** ----------------------------
   * Stops management
   * ---------------------------- */
  const addStop = () => {
    if (stops.length >= 3) return toast.error("Maximum 3 stops allowed");
    setStops((p) => [...p, { address: "", lat: null, lng: null, order: p.length }]);
  };

  const updateStop = (index, data) => {
    setStops((p) => {
      const copy = [...p];
      copy[index] = { ...copy[index], ...data };
      return copy;
    });
  };

  const removeStop = (index) => setStops((p) => p.filter((_, i) => i !== index));

  /** ----------------------------
   * Geolocation (kept; stabilized)
   * ---------------------------- */
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by your browser. Enter address manually.");
      return;
    }

    setLocationLoading(true);

    const safetyTimer = setTimeout(() => {
      setLocationLoading(false);
      toast.error("Location request timed out. Try again or enter manually.");
    }, 15000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(safetyTimer);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (!window.google) {
          setLocationLoading(false);
          setPickup({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
          return;
        }

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          setLocationLoading(false);
          if (status === "OK" && results?.[0]) {
            setPickup({ address: results[0].formatted_address, lat, lng });
            toast.success("Location detected!");
          } else {
            setPickup({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
            toast.warning("Address lookup failed, using coordinates");
          }
        });
      },
      (error) => {
        clearTimeout(safetyTimer);
        setLocationLoading(false);
        let msg = "Could not get location.";
        if (error.code === 1) msg = "Location access denied. Enable in browser settings and try again.";
        else if (error.code === 2) msg = "Location unavailable. Check GPS/WiFi.";
        else if (error.code === 3) msg = "Request timed out. Try again.";
        toast.error(msg);
        console.error("Geolocation error:", error);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (mapsLoaded && !pickup.lat) getCurrentLocation();
  }, [mapsLoaded]); // intentional: run once when maps ready

  /** ----------------------------
   * Ride request (server authoritative)
   * - Card: open PayPal modal and stage ride payload
   * - Wallet: validate locally, server still enforces
   * - Cash: request immediately
   * ---------------------------- */
  const buildRidePayload = useCallback(() => {
    return {
      pickup: pickup.address,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      destination: destination.address || null,
      destinationLat: destination.lat,
      destinationLng: destination.lng,
      stops: stops
        .filter((s) => s.lat && s.lng)
        .map((s, i) => ({ address: s.address, lat: s.lat, lng: s.lng, order: i })),
      carType,
      paymentMethod,
      estimatedDistance: routeInfo?.distance || 5,
      estimatedDuration: routeInfo?.duration || 15,
      // helpful for server-side pricing validation if you do it
      clientFareEstimate: fareEstimate?.total || null,
      surgeMultiplier: surgeInfo?.multiplier || 1.0,
    };
  }, [pickup, destination, stops, carType, paymentMethod, routeInfo, fareEstimate, surgeInfo]);

  const requestRide = useCallback(
    async (extra = {}) => {
      const rideData = { ...buildRidePayload(), ...extra };

      const res = await api.post(`/rides/request`, rideData);
      const rideId = res.data?.ride_id || res.data?.id;

      toast.success("Ride requested! Searching for drivers...");

      setActiveRide(
        normalizeRide({
          id: rideId,
          status: "searching",
          estimated_fare: res.data?.estimated_fare,
          fare_breakdown: res.data?.fare_breakdown,
          pickup: rideData.pickup,
          destination: rideData.destination,
          pickupLat: rideData.pickupLat,
          pickupLng: rideData.pickupLng,
          destinationLat: rideData.destinationLat,
          destinationLng: rideData.destinationLng,
          stops: rideData.stops,
          carType: rideData.carType,
          payment_method: rideData.paymentMethod,
        })
      );

      setActiveTab("active");
      startPolling(rideId);
    },
    [buildRidePayload, startPolling]
  );

  const handleBookRide = async () => {
    if (!pickup.lat || !pickup.address) return toast.error("Please select a pickup address");

    // destination can be optional in your UI ("Open Trip"), but route requires it for estimate map
    // server should accept destination null if you support open trips.
    if (paymentMethod === "wallet" && (user?.wallet_balance || 0) <= 0) {
      return toast.error("Your wallet is empty.");
    }

    // Card -> PayPal modal (FIXED)
    if (paymentMethod === "card") {
      const payload = buildRidePayload();
      setPendingRidePayload(payload);
      setShowCardModal(true);
      return;
    }

    setLoading(true);
    try {
      await requestRide();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to request ride");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide?.id) return;
    try {
      await api.post(`/rides/${activeRide.id}/cancel`);
      toast.success("Ride cancelled");
      setActiveRide(null);
      setActiveTab("book");
    } catch {
      toast.error("Failed to cancel ride");
    }
  };

  const handleRetryRide = async () => {
    if (!activeRide?.id) return;
    try {
      await api.post(`/rides/${activeRide.id}/retry`);
      toast.success("Searching for drivers again...");
      setActiveRide((p) => ({ ...p, status: "searching", matching_status: "Retrying - Searching within 3km" }));
      startPolling(activeRide.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to retry ride");
    }
  };

  /** ----------------------------
   * PayPal flow (RIDER CARD PAYMENT)
   *
   * IMPORTANT:
   * - Your old modal was using "topupAmount" (undefined) and driver endpoints.
   * - This version creates a PayPal order for the *ride service fee / preauth* (or full estimate),
   *   then requests the ride with the order_id so server.py can verify/capture as you prefer.
   *
   * Server endpoints expected (adjust to your server.py):
   *   POST /paypal/create-order   { amount_usd, metadata? }
   *   POST /paypal/capture-order  { order_id }
   *
   * If your server already has different paths, just change these two URLs.
   * ---------------------------- */
  const GEL_TO_USD = 0.37;

  const payableGel = useMemo(() => {
    // You can choose: charge full estimate or only service fee.
    // If your server.py charges full estimated fare upfront, use fareEstimate.total.
    // If it charges only a card service fee, set to 2.00 here.
    const gel = fareEstimate?.total ? parseFloat(fareEstimate.total) : 2.0;
    return Number.isFinite(gel) ? gel : 2.0;
  }, [fareEstimate]);

  const payableUsd = useMemo(() => (payableGel * GEL_TO_USD).toFixed(2), [payableGel]);

  const carTypes = useMemo(
    () =>
      Object.entries(PRICING_RULES).map(([key, val]) => ({
        value: key,
        label: val.name,
        icon: val.icon,
        base: val.base,
      })),
    []
  );

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
              <p className="text-[#00ff88] font-semibold">
                {user?.name} {user?.surname}
              </p>
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
            <TabsTrigger value="book" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <Car className="w-4 h-4 mr-2" /> Book
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <Navigation className="w-4 h-4 mr-2" /> Active
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <History className="w-4 h-4 mr-2" /> History
            </TabsTrigger>
            <TabsTrigger value="profile" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black">
              <User className="w-4 h-4 mr-2" /> Profile
            </TabsTrigger>
          </TabsList>

          {/* BOOK */}
          <TabsContent value="book">
            <Card className="glass-heavy border-secondary/30">
              <CardHeader>
                <CardTitle className="text-secondary flex items-center font-heading">
                  <Rocket className="w-5 h-5 mr-2" /> {t("book_ride")}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {mapsLoaded && pickup.lat && destination.lat && (
                  <LiveTrackingMap pickup={pickup} destination={destination} stops={stops} status="preview" driverLocation={null} />
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-secondary">{t("pickup_location")}</Label>
                    <Button variant="ghost" size="sm" className="text-primary h-6" onClick={getCurrentLocation} disabled={locationLoading} type="button">
                      {locationLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Crosshair className="w-3 h-3 mr-1" />}{" "}
                      {t("use_my_location")}
                    </Button>
                  </div>
                  <LocationInput value={pickup} onChange={setPickup} placeholder={t("where_pickup")} icon={MapPin} iconColor="text-secondary" />
                </div>

                {stops.map((stop, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-yellow-400">
                        {t("stops")} {index + 1}
                      </Label>
                      <Button variant="ghost" size="sm" className="text-red-400 h-6" onClick={() => removeStop(index)} type="button">
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <LocationInput
                      value={stop}
                      onChange={(data) => updateStop(index, data)}
                      placeholder={t("stop_address")}
                      icon={MapPin}
                      iconColor="text-yellow-400"
                    />
                  </div>
                ))}

                {stops.length < 3 && (
                  <Button variant="outline" className="w-full border-dashed border-yellow-400/30 text-yellow-400" onClick={addStop} type="button">
                    <Plus className="w-4 h-4 mr-2" /> {t("add_stop_free")}
                  </Button>
                )}

                <div className="space-y-2">
                  <Label className="text-primary">{t("destination")}</Label>
                  <LocationInput value={destination} onChange={setDestination} placeholder={t("where_going")} icon={Navigation} iconColor="text-primary" />
                </div>

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

                {routeInfo && (
                  <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2 text-secondary">
                      <span className="flex items-center">
                        <RouteLineIcon className="w-4 h-4 mr-1" /> {t("route")}
                      </span>
                      <span className="font-bold">
                        {routeInfo.distance} {t("km")} • ~{routeInfo.duration} {t("min")}
                      </span>
                    </div>

                    {fareEstimate && (
                      <div className="flex flex-col">
                        <div className="flex justify-between text-lg text-secondary font-bold">
                          <span>{t("estimated_total")}</span>
                          <span>₾{fareEstimate.total.toFixed(2)}</span>
                        </div>
                        {paymentMethod === "card" && <p className="text-xs text-primary text-right mt-1">{t("card_fee_included")}</p>}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-secondary">{t("vehicle_class")}</Label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {carTypes.map((type) => {
                      const typeFare = routeInfo
                        ? calculateFare(type.value, routeInfo.distance, 0, 0, validStopsCount, surgeInfo?.multiplier || 1.0, paymentMethod).total
                        : type.base * (surgeInfo?.multiplier || 1.0);

                      return (
                        <button
                          key={type.value}
                          onClick={() => setCarType(type.value)}
                          className={`p-3 rounded-xl border-2 transition-all ${
                            carType === type.value ? "border-secondary bg-secondary/20 shadow-neon-green" : "border-secondary/20 bg-background-secondary"
                          }`}
                          type="button"
                        >
                          <div className="text-2xl mb-1">{type.icon}</div>
                          <div className="text-white font-medium text-xs">{type.label}</div>
                          <div className="text-secondary text-sm">₾{typeFare.toFixed(2)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-secondary">{t("payment")}</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={paymentMethod === "cash" ? "default" : "outline"}
                      onClick={() => setPaymentMethod("cash")}
                      className={paymentMethod === "cash" ? "bg-secondary text-black" : "border-secondary/30 text-white"}
                      type="button"
                    >
                      {t("cash")}
                    </Button>

                    <Button
                      variant={paymentMethod === "card" ? "default" : "outline"}
                      onClick={() => setPaymentMethod("card")}
                      className={paymentMethod === "card" ? "bg-secondary text-black" : "border-secondary/30 text-white"}
                      type="button"
                    >
                      {t("card")}
                    </Button>

                    <Button
                      variant={paymentMethod === "wallet" ? "default" : "outline"}
                      onClick={() => {
                        if ((user?.wallet_balance || 0) <= 0) return toast.error("Your wallet is empty.");
                        setPaymentMethod("wallet");
                      }}
                      className={
                        paymentMethod === "wallet"
                          ? "bg-secondary text-black font-bold shadow-neon-green"
                          : "border-secondary/30 text-secondary hover:bg-secondary/10"
                      }
                      type="button"
                    >
                      <Wallet className="w-4 h-4 mr-2" />
                      Wallet (₾{user?.wallet_balance?.toFixed(2) || "0.00"})
                    </Button>
                  </div>
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-secondary to-primary text-black font-bold h-14 text-lg hover:shadow-neon-green transition-all mt-2"
                  onClick={handleBookRide}
                  disabled={loading}
                  type="button"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Rocket className="w-5 h-5 mr-2" />}
                  {t("request_ride")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CARD PAYMENT MODAL (FIXED) */}
          <Dialog open={showCardModal} onOpenChange={setShowCardModal}>
            <DialogContent className="bg-[#1a1a2e] border border-[#00ff88]/30 text-white sm:max-w-md w-[95%]">
              <DialogHeader>
  <DialogTitle className="text-[#00ff88] flex items-center gap-2">
    <CreditCard className="w-5 h-5" /> Pay with Card
  </DialogTitle>
  <DialogDescription className="text-gray-400 text-xs">
    Complete your ride payment securely via PayPal.
  </DialogDescription>
</DialogHeader>

              <div className="mt-2 space-y-3">
                <p className="text-xs text-gray-400">
                  Secure payment via PayPal. Amount shown is based on your current estimate (₾{payableGel.toFixed(2)} ≈ ${payableUsd}).
                </p>

                <PayPalButtons
                  fundingSource="card"
                  style={{ layout: "vertical", shape: "rect" }}
                  createOrder={async () => {
                    // Server creates a PayPal order (USD).
                    const res = await api.post("/paypal/create-order", {
                      amount_usd: payableUsd,
                      // optional metadata: ride estimate (do NOT trust client in server; validate)
                      meta: {
                        rider_id: user?.id,
                        estimated_gel: payableGel,
                      },
                    });
                    return res.data?.id;
                  }}
                  onApprove={async (data) => {
                    try {
                      setLoading(true);

                      // Capture/verify on server (or authorize)
                      await api.post("/paypal/capture-order", { order_id: data.orderID });

                      // Now request the ride, attaching PayPal order id so server can link payment
                      const payload = pendingRidePayload || buildRidePayload();
                      await requestRide({ ...payload, paypal_order_id: data.orderID });

                      toast.success("Card payment authorized.");
                      setShowCardModal(false);
                      setPendingRidePayload(null);
                    } catch (err) {
                      console.error(err);
                      toast.error("Payment failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  onError={(err) => {
                    console.error("PayPal error:", err);
                    toast.error("Payment failed");
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>

          {/* ACTIVE */}
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
                  {mapsLoaded && activeRide && (
                    <div className="w-full rounded-xl overflow-hidden mb-4 border border-[#00ff88]/20 relative">
                      <LiveTrackingMap
                        status={activeRide.status}
                        driverLocation={activeRide.driver_location}
                        pickup={{ lat: activeRide.pickup_lat, lng: activeRide.pickup_lng }}
                        destination={
                          activeRide.dest_lat && activeRide.dest_lng ? { lat: activeRide.dest_lat, lng: activeRide.dest_lng } : null
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

                  <div className="space-y-3">
                    <div>
                      <p className="text-[#00ff88]/60 text-sm">Pickup</p>
                      <p>{activeRide.pickup}</p>
                    </div>

                    {activeRide.stops?.length > 0 && (
                      <div>
                        <p className="text-yellow-400/60 text-sm">Stops ({activeRide.stops.length})</p>
                        {activeRide.stops.map((s, i) => (
                          <p key={i} className="text-sm text-yellow-400">
                            • {s.address}
                          </p>
                        ))}
                      </div>
                    )}

                    <div>
                      <p className="text-[#00d4ff]/60 text-sm">Destination</p>
                      <p>{activeRide.destination || "Open Trip"}</p>
                    </div>
                  </div>

                  {activeRide.status === "searching" && (
                    <div className="bg-yellow-500/20 border border-yellow-500 p-4 rounded-xl space-y-2">
                      <div className="flex items-center">
                        <Loader2 className="w-5 h-5 animate-spin mr-3 text-yellow-400" />
                        <span className="text-yellow-400 font-medium">{activeRide.matching_status || "Searching for drivers..."}</span>
                      </div>
                      {activeRide.drivers_notified_count > 0 && (
                        <p className="text-yellow-400/70 text-sm pl-8">{activeRide.drivers_notified_count} drivers notified</p>
                      )}
                    </div>
                  )}

                  {activeRide.status === "no_drivers" && (
                    <div className="bg-gray-500/20 border border-gray-500 p-4 rounded-xl space-y-3">
                      <div className="flex items-center text-gray-300">
                        <Target className="w-5 h-5 mr-2" />
                        <span className="font-medium">No drivers available</span>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1 bg-[#00ff88] text-black font-bold" onClick={handleRetryRide} type="button">
                          <Rocket className="w-4 h-4 mr-2" /> Retry Search
                        </Button>
                        <Button
                          variant="outline"
                          className="border-gray-500 text-gray-300"
                          onClick={() => {
                            setActiveRide(null);
                            setActiveTab("book");
                          }}
                          type="button"
                        >
                          New Ride
                        </Button>
                      </div>
                    </div>
                  )}

                  {activeRide.driver_info && (
                    <div className="bg-black/60 rounded-xl p-5 border border-[#00ff88]/30 shadow-[0_0_20px_rgba(0,255,136,0.1)] space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                        <p className="text-[#00ff88] font-bold uppercase tracking-widest text-xs">Driver Assigned</p>
                        <Badge className="bg-blue-500/20 text-blue-400 border border-blue-500/50">
                          <Lock className="w-3 h-3 mr-1" /> Background Checked
                        </Badge>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center overflow-hidden border-2 border-[#00ff88]">
                          {activeRide.driver_info.profile_pic ? (
                            <img src={activeRide.driver_info.profile_pic} alt="Driver" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-8 h-8 text-black" />
                          )}
                        </div>

                        <div className="flex-1">
                          <p className="font-bold text-2xl text-white">{activeRide.driver_info.name}</p>
                          <div className="flex items-center text-sm text-gray-300 mt-1">
                            <Car className="w-4 h-4 mr-1 text-[#00d4ff]" />
                            <span>
                              {activeRide.driver_info.car_color || "Dark"} {activeRide.driver_info.car_make} {activeRide.driver_info.car_model}
                            </span>
                          </div>
                          <div className="inline-block mt-2 px-3 py-1 bg-[#00ff88]/10 border border-[#00ff88]/50 rounded-md">
                            <p className="text-[#00ff88] font-mono font-bold tracking-widest text-xl uppercase">
                              {activeRide.driver_info.license_plate}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-800">
                        <p className="text-gray-400 text-xs mb-2 flex items-center">
                          <User className="w-3 h-3 mr-1" /> Verified License Document
                        </p>

                        <div className="relative w-full h-32 bg-gray-900 rounded-lg overflow-hidden border border-gray-700 select-none pointer-events-none">
                          <img
                            src={activeRide.driver_info.license_photo || "/api/placeholder/400/200"}
                            alt="License"
                            className="w-full h-full object-cover opacity-50 blur-[2px]"
                          />
                          <div className="absolute top-2 left-2 w-16 h-20 border border-[#00ff88]/30 rounded" />
                          <div className="absolute bottom-0 left-0 right-0 h-[70%] backdrop-blur-2xl bg-black/80 flex flex-col items-center justify-center">
                            <div className="flex items-center text-red-500 font-bold mb-1">
                              <Lock className="w-4 h-4 mr-2" /> PII REDACTED
                            </div>
                            <span className="text-gray-400 text-[10px] font-mono tracking-widest text-center px-4">
                              SENSITIVE INFORMATION BLOCKED FOR DRIVER PRIVACY.
                              <br />
                              IDENTITY VERIFIED BY ADMIN.
                            </span>
                          </div>
                        </div>

                        <div className="mt-4">
                          <RideCommunication
                            rideId={activeRide.id}
                            otherPartyPhone={activeRide.driver_info.cellphone}
                            otherPartyName={activeRide.driver_info.name}
                            currentUserId={user?.id}
                            isDriver={false}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeRide.status === "arrived" && <WaitTimer arrivedAt={activeRide.arrived_at} carType={activeRide.carType || carType} />}

                  <div className="flex justify-between items-center bg-[#00ff88]/10 rounded-xl p-4">
                    <span className="text-[#00ff88]">Estimated Fare</span>
                    <span className="text-2xl font-bold text-[#00ff88]">
                      ₾{(activeRide.final_fare || activeRide.estimated_fare || 0).toFixed(2)}
                    </span>
                  </div>

                  {["searching", "accepted"].includes(activeRide.status) && (
                    <Button variant="destructive" className="w-full" onClick={handleCancelRide} type="button">
                      Cancel Ride
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-center py-12">
                <Navigation className="w-20 h-20 mx-auto text-[#00ff88]/30 mb-4" />
                <p className="text-[#00ff88]/60 text-lg">No active ride</p>
                <Button className="mt-6 bg-[#00ff88] text-black font-bold" onClick={() => setActiveTab("book")} type="button">
                  Book a Ride
                </Button>
              </Card>
            )}
          </TabsContent>

          {/* HISTORY */}
          <TabsContent value="history">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
              <CardHeader>
                <CardTitle className="text-[#00ff88]">Ride History</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {rideHistory.map((raw) => {
                      const ride = normalizeRide(raw);
                      return (
                        <div key={ride.id} className="bg-black/50 border border-[#00ff88]/10 rounded-xl p-4 space-y-2">
                          <div className="flex justify-between">
                            <Badge className={statusColors[ride.status]}>{ride.status?.replace(/_/g, " ").toUpperCase()}</Badge>
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
                            <span className="text-[#00ff88] font-bold">₾{(ride.final_fare || ride.estimated_fare || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PROFILE */}
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
                    <h3 className="text-2xl font-bold">
                      {user?.name} {user?.surname}
                    </h3>
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

      {/* COMPLETION MODAL (FIXED rating flow) */}
      <RiderTripCompletionModal
        isOpen={!!completedRide}
        onClose={() => setCompletedRide(null)}
        fareAmount={completedRide?.final_fare}
        paymentMethod={completedRide?.payment_method}
        driverName={completedRide?.driver_name}
        onRateDriver={() => setShowRatingModal(true)}
      />

      {/* RATING MODAL (rideId now valid) */}
      <RatingModal
        isOpen={showRatingModal}
        onClose={() => {
          setShowRatingModal(false);
          setCompletedRide(null);
        }}
        rideId={completedRide?.id}
        ratingType="driver"
        driverName={completedRide?.driver_name}
        onRatingComplete={() => {
          setShowRatingModal(false);
          setCompletedRide(null);
          toast.success(t("rating_submitted") || "Thanks for your feedback!");
        }}
      />
    </div>
  );
};

/** =========================================================
 *  11) Router (kept; PayPalScriptProvider stays at portal level)
 *  ========================================================= */
const RiderPortal = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.user_type !== "rider") {
    if (location.pathname === "/rider" || location.pathname === "/rider/") return <RiderAuth />;
    return <Navigate to="/rider" replace />;
  }

  return (
    <PayPalScriptProvider
      options={{
        "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
        currency: "USD",
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<RiderDashboard />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </PayPalScriptProvider>
  );
};

export default RiderPortal;