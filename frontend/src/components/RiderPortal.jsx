import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import api from "@/api";
import { useLanguage } from "@/i18n/LanguageContext";
import LanguageSelector from "@/i18n/LanguageSelector";
import { RiderTripCompletionModal } from "@/components/TripCompletionModal";
import RatingModal from "@/components/RatingModal";
import { toast } from "sonner"; 
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import RideCommunication from "./RideCommunication";

import {
  Car, MapPin, History, Home, LogOut, User, Navigation, Rocket, ArrowLeft,
  Lock, Phone, MessageSquare, Star, Clock, Shield, AlertTriangle, Loader2,
  Search, X, Crosshair, MapPinned, CheckCircle2, Zap, Activity,
  Plus, TrendingUp, Timer, CreditCard, Target, Route as RouteIcon, Wallet,
  Share2, Calendar, Heart, AlertCircle, Gift, Copy, ChevronRight,
  Receipt, DollarSign, Bell, Bookmark, Send, ChevronDown, ChevronUp, Map,
  ArrowRight, MoreHorizontal, Sparkles
} from "lucide-react";

// This fixes the 'lazy is not defined' error
const SupportChatWidget = lazy(() => import('./ChatWidget'));

// =============================================================================
// PRICING RULES — Must match server.py exactly
// =============================================================================
const PRICING_RULES = {
  economy:   { name: "Economy",   base: 2.00, perKm: 0.50, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚗", desc: "Affordable everyday rides" },
  comfort:   { name: "Comfort",   base: 2.50, perKm: 0.55, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚙", desc: "Extra space & comfort" },
  suv:       { name: "SUV / XL",  base: 3.90, perKm: 0.80, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚐", desc: "Up to 6 passengers" },
  personal:  { name: "Personal",  base: 4.00, perKm: 0.70, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "👤", desc: "Premium personal driver" },
  jumpstart: { name: "Jumpstart", base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, stopFee: 0.00, icon: "⚡", desc: "Flat rate battery jump" },
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

// trim() only called on submit, NOT on every keystroke — otherwise spacebar is swallowed
const sanitiseAddress = (str = "") => str.slice(0, 300);
const sanitiseAddressForSubmit = (str = "") => str.trim().slice(0, 300);

// =============================================================================
// GOOGLE MAPS LOADER — singleton, never double-loads
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
// GOOGLE MAPS AUTOCOMPLETE HOOK — UNCHANGED
// =============================================================================
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect, mapsLoaded) => {
  const callbackRef = useRef(onPlaceSelect);
  const attachedRef = useRef(false);
  useEffect(() => { callbackRef.current = onPlaceSelect; }, [onPlaceSelect]);
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
// MAP PICKER MODAL — UNCHANGED
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
    let geocodeTimer;
    map.addListener("idle", () => {
      setIsDragging(false);
      const c = map.getCenter();
      const lat = c.lat(), lng = c.lng();
      setCenter({ lat, lng });
      clearTimeout(geocodeTimer);
      geocodeTimer = setTimeout(() => {
        new window.google.maps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
          setAddress(status === "OK" && results[0] ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        });
      }, 100);
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
// LIVE TRACKING MAP — UPGRADED
// - ETA countdown pill (live ticking)
// - Pickup pin (green) + Destination pin (red) as SVG markers
// - Auto-fit bounds when ride is accepted (driver + pickup)
// - Re-centre button when user pans away
// - Driver marker with heading rotation
// =============================================================================
const LiveTrackingMap = ({ pickup, destination, stops = [], driverLocation, status }) => {
  const mapRef                = useRef(null);
  const mapInstanceRef        = useRef(null);
  const directionsRendererRef = useRef(null);
  const driverMarkerRef       = useRef(null);
  const pickupMarkerRef       = useRef(null);
  const destMarkerRef         = useRef(null);
  const routeDrawnForStatus   = useRef(null);
  const prevRideIdRef         = useRef(null);
  const etaDurationRef        = useRef(null);   // seconds from Directions API
  const etaIntervalRef        = useRef(null);   // countdown interval
  const [isFollowing, setIsFollowing] = useState(true);
  const [etaSeconds, setEtaSeconds]   = useState(null);

  const getSafeCoord = (val) => { const n = parseFloat(val); return !isNaN(n) && n !== 0 ? n : null; };

  // SVG marker helpers
  const makePickupIcon = () => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#00ff88"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>`)}`,
    scaledSize: new window.google.maps.Size(28, 37),
    anchor: new window.google.maps.Point(14, 37),
  });

  const makeDestIcon = () => ({
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42"><path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z" fill="#ff4444"/><circle cx="16" cy="16" r="6" fill="#07070f"/></svg>`)}`,
    scaledSize: new window.google.maps.Size(28, 37),
    anchor: new window.google.maps.Point(14, 37),
  });

  const makeDriverIcon = (heading = 0) => ({
    path: "M 0,-18 L 12,14 L 0,8 L -12,14 Z",
    scale: 1.4,
    fillColor: "#00d4ff",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    rotation: heading,
    anchor: new window.google.maps.Point(0, 0),
  });

  // Format seconds as "Xm Ys"
  const fmtEta = (secs) => {
    if (secs == null || secs <= 0) return null;
    const m = Math.floor(secs / 60), s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Init map once
  useEffect(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat: 41.7151, lng: 44.8271 }, zoom: 15,
      disableDefaultUI: true, zoomControl: false, gestureHandling: "greedy", backgroundColor: "#0d0d1a",
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
      map, suppressMarkers: true,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5, strokeOpacity: 0.9 },
    });
    map.addListener("dragstart", () => setIsFollowing(false));
    mapInstanceRef.current = map;
  }, []);

  // Draw/update route based on status
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    const pLat = getSafeCoord(pickup?.lat), pLng = getSafeCoord(pickup?.lng);
    const dLat = getSafeCoord(destination?.lat), dLng = getSafeCoord(destination?.lng);
    const drLat = getSafeCoord(driverLocation?.lat), drLng = getSafeCoord(driverLocation?.lng);
    const waypoints = stops.filter(s => s.lat && s.lng).map(s => ({
      location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) }, stopover: true,
    }));
    const sig = `${drLat},${drLng}|${pLat},${pLng}|${dLat},${dLng}|${status}`;
    if (routeDrawnForStatus.current === sig) return;

    // Preview mode (booking screen): show route pickup → destination, no driver
    if (status === "preview") {
      if (pLat && pLng && dLat && dLng) {
        drawRoute({ lat: pLat, lng: pLng }, { lat: dLat, lng: dLng }, waypoints, false);
        updateStaticPin(pickupMarkerRef, { lat: pLat, lng: pLng }, makePickupIcon());
        updateStaticPin(destMarkerRef, { lat: dLat, lng: dLng }, makeDestIcon());
        routeDrawnForStatus.current = sig;
      }
      return;
    }

    if (!drLat || !drLng) return;
    const origin = { lat: drLat, lng: drLng };

    if (["accepted", "searching", "arrived"].includes(status) && pLat) {
      drawRoute(origin, { lat: pLat, lng: pLng }, [], true);
      updateStaticPin(pickupMarkerRef, { lat: pLat, lng: pLng }, makePickupIcon());
      removePin(destMarkerRef);
      routeDrawnForStatus.current = sig;
    } else if (status === "in_progress" && dLat) {
      drawRoute(origin, { lat: dLat, lng: dLng }, waypoints, true);
      removePin(pickupMarkerRef);
      updateStaticPin(destMarkerRef, { lat: dLat, lng: dLng }, makeDestIcon());
      routeDrawnForStatus.current = sig;
    }
  }, [pickup?.lat, destination?.lat, JSON.stringify(stops), status, driverLocation?.lat]);

  // Auto-fit when ride is first accepted — show driver + pickup
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    if (status !== "accepted") return;
    const drLat = getSafeCoord(driverLocation?.lat), drLng = getSafeCoord(driverLocation?.lng);
    const pLat  = getSafeCoord(pickup?.lat),         pLng  = getSafeCoord(pickup?.lng);
    if (!drLat || !pLat) return;

    // Only do this once per new ride (driver arrives = new fit)
    const rideKey = `${drLat},${pLat}`;
    if (prevRideIdRef.current === rideKey) return;
    prevRideIdRef.current = rideKey;

    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: drLat, lng: drLng });
    bounds.extend({ lat: pLat,  lng: pLng  });
    mapInstanceRef.current.fitBounds(bounds, { top: 80, bottom: 200, left: 50, right: 50 });

    // After 3s resume following driver
    setTimeout(() => setIsFollowing(true), 3000);
  }, [status, driverLocation?.lat, pickup?.lat]);

  // ETA countdown — starts fresh whenever a new Directions result comes in
  useEffect(() => {
    return () => { if (etaIntervalRef.current) clearInterval(etaIntervalRef.current); };
  }, []);

  const startEtaCountdown = (durationSeconds) => {
    if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
    let remaining = durationSeconds;
    setEtaSeconds(remaining);
    etaIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(etaIntervalRef.current); setEtaSeconds(0); }
      else setEtaSeconds(remaining);
    }, 1000);
  };

  const drawRoute = (origin, dest, waypoints = [], withEta = false) => {
    new window.google.maps.DirectionsService().route(
      { origin, destination: dest, waypoints, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, st) => {
        if (st === "OK" && directionsRendererRef.current) {
          directionsRendererRef.current.setDirections(result);
          const leg = result.routes[0]?.legs[0];
          if (withEta && leg?.duration?.value) startEtaCountdown(leg.duration.value);
          const bounds = new window.google.maps.LatLngBounds();
          bounds.extend(origin); bounds.extend(dest);
          waypoints.forEach(wp => bounds.extend(wp.location));
          if (status === "preview") {
            mapInstanceRef.current.fitBounds(bounds, { top: 60, bottom: 60, left: 30, right: 30 });
          }
        }
      }
    );
  };

  const updateStaticPin = (ref, position, icon) => {
    if (!mapInstanceRef.current) return;
    if (!ref.current) {
      ref.current = new window.google.maps.Marker({ position, map: mapInstanceRef.current, icon, zIndex: 900 });
    } else {
      ref.current.setPosition(position);
      ref.current.setIcon(icon);
    }
  };

  const removePin = (ref) => {
    if (ref.current) { ref.current.setMap(null); ref.current = null; }
  };

  // Driver marker — follows live location
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !driverLocation?.lat) return;
    const pos     = { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) };
    const heading = parseFloat(driverLocation.heading) || 0;
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: pos, map: mapInstanceRef.current,
        icon: makeDriverIcon(heading), zIndex: 1000,
      });
    } else {
      driverMarkerRef.current.setPosition(pos);
      driverMarkerRef.current.setIcon(makeDriverIcon(heading));
    }
    if (isFollowing) mapInstanceRef.current.panTo(pos);
  }, [driverLocation, isFollowing]);

  const etaLabel = status === "in_progress" ? "ETA to destination" : "ETA to pickup";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ background: "#0d0d1a" }}>
      <div ref={mapRef} style={{ height: "46vh", minHeight: "300px", width: "100%" }} />

      {/* ETA pill */}
      {etaSeconds != null && etaSeconds > 0 && status !== "preview" && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-[#07070f]/90 backdrop-blur-sm px-4 py-2 rounded-full border border-[#00d4ff]/30 flex items-center gap-2 shadow-xl">
            <Timer className="w-3.5 h-3.5 text-[#00d4ff]" />
            <span className="text-[#00d4ff] font-bold text-sm font-mono">{fmtEta(etaSeconds)}</span>
            <span className="text-white/30 text-xs">{etaLabel}</span>
          </div>
        </div>
      )}

      {/* Re-centre button */}
      {!isFollowing && driverLocation && (
        <button
          onClick={() => {
            setIsFollowing(true);
            if (driverLocation?.lat && mapInstanceRef.current)
              mapInstanceRef.current.panTo({ lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) });
          }}
          className="absolute bottom-4 right-4 bg-[#07070f]/90 text-[#00d4ff] p-2.5 rounded-full border border-[#00d4ff]/40 shadow-xl z-10 backdrop-blur-sm transition-all active:scale-95"
        >
          <Crosshair className="w-5 h-5" />
        </button>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 z-10">
        <button
          onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 15) + 1)}
          className="w-9 h-9 bg-[#07070f]/90 text-white rounded-xl border border-white/15 flex items-center justify-center text-lg font-bold hover:border-white/30 active:scale-95 backdrop-blur-sm">
          +
        </button>
        <button
          onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 15) - 1)}
          className="w-9 h-9 bg-[#07070f]/90 text-white rounded-xl border border-white/15 flex items-center justify-center text-lg font-bold hover:border-white/30 active:scale-95 backdrop-blur-sm">
          −
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// LOCATION INPUT — UNCHANGED
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
          className="pl-9 pr-16 bg-white/5 border-white/8 text-white placeholder:text-white/25 focus-visible:ring-[#00ff88]/30 focus-visible:border-[#00ff88]/40 rounded-xl h-12 text-sm"
          placeholder={placeholder} autoComplete="off" />
        <div className="absolute right-1 flex items-center gap-0.5">
          {onSaveAsFavorite && value?.lat && (
            <Button variant="ghost" size="icon" className="text-pink-400/50 hover:text-pink-400 w-8 h-8 rounded-lg" onClick={onSaveAsFavorite}>
              <Heart className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="text-white/30 hover:text-white/60 w-8 h-8 rounded-lg" onClick={() => setShowMapPicker(true)}>
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

  const [otpStep, setOtpStep]       = useState("form");
  const [otpCode, setOtpCode]       = useState("");
  const [phoneToken, setPhoneToken] = useState(null);

  const handleSendOtp = async () => {
    if (!formData.cellphone) return toast.error("Enter your phone number first");
    setLoading(true);
    try {
      await api.post("/auth/otp/send", { cellphone: formData.cellphone });
      toast.success("Verification code sent!");
      setOtpStep("otp");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send code");
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const res = await api.post("/auth/otp/verify", { cellphone: formData.cellphone, code: otpCode });
      setPhoneToken(res.data.phone_token);
      setOtpStep("done");
      toast.success("Phone verified ✓");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Incorrect code");
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const res = await api.post("/auth/login", formData);
        if (res.data?.token && res.data?.user) {
          login(res.data.token, res.data.user);
          toast.success(t("welcome_back"));
          navigate("/rider/dashboard");
        }
      } else {
        if (!phoneToken) return toast.error("Please verify your phone number first");
        const res = await api.post("/auth/register/rider", formData, {
          headers: { "X-Phone-Verified": phoneToken },
        });
        if (res.data?.token && res.data?.user) {
          login(res.data.token, res.data.user);
          toast.success(t("success"));
          navigate("/rider/dashboard");
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || t("error"));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#07070f" }}>
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-[#00ff88]/4 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-[#00d4ff]/4 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-sm relative">
        <div className="absolute right-0 top-0"><LanguageSelector variant="ghost" /></div>
        <button className="flex items-center gap-1.5 text-white/40 hover:text-white text-sm mb-8 transition-colors" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00ff88] to-[#00d4ff] flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(0,255,136,0.25)]">
            <Rocket className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-3xl font-bold text-white">{isLogin ? "Welcome back" : "Join T'aksi"}</h1>
          <p className="text-white/40 mt-1 text-sm">{isLogin ? "Sign in to your rider account" : "Create your rider account"}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <div className="grid grid-cols-2 gap-3">
              {[["name","First name","given-name"],["surname","Last name","family-name"]].map(([k,l,ac]) => (
                <div key={k}>
                  <label className="text-white/40 text-xs font-medium mb-1.5 block">{l}</label>
                  <Input id={`rider-${k}`} name={k} value={formData[k]} onChange={e => setFormData({ ...formData, [k]: e.target.value })}
                    className="bg-white/5 border-white/10 text-white h-11 rounded-xl" required autoComplete={ac} />
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="text-white/40 text-xs font-medium mb-1.5 block">{t("phone_number")}</label>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-3.5 h-4 w-4 text-white/30" />
                <Input id="rider-phone" name="cellphone" type="tel" value={formData.cellphone}
                  onChange={e => { setFormData({ ...formData, cellphone: e.target.value }); setOtpStep("form"); setPhoneToken(null); }}
                  className="pl-9 bg-white/5 border-white/10 text-white h-11 rounded-xl"
                  placeholder="+995 XXX XXX XXX" required autoComplete="tel"
                  disabled={otpStep === "otp" || otpStep === "done"} />
              </div>
              {!isLogin && otpStep === "form" && (
                <Button type="button" onClick={handleSendOtp} disabled={loading || !formData.cellphone}
                  className="h-11 px-3 bg-white/10 text-white text-xs rounded-xl border border-white/10 hover:bg-white/15">
                  Verify
                </Button>
              )}
              {!isLogin && otpStep === "done" && (
                <div className="h-11 px-3 flex items-center text-[#00ff88] text-xs font-bold">✓ Verified</div>
              )}
            </div>
          </div>

          {!isLogin && otpStep === "otp" && (
            <div>
              <label className="text-white/40 text-xs font-medium mb-1.5 block">Enter 4-digit code</label>
              <div className="flex gap-2">
                <Input value={otpCode} onChange={e => setOtpCode(e.target.value)} maxLength={4}
                  placeholder="0000" className="bg-white/5 border-white/10 text-white h-11 rounded-xl text-center text-lg tracking-widest flex-1" />
                <Button type="button" onClick={handleVerifyOtp} disabled={loading || otpCode.length < 4}
                  className="h-11 px-4 bg-[#00d4ff] text-black font-bold rounded-xl text-sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                </Button>
              </div>
              <button type="button" onClick={handleSendOtp} className="text-white/30 text-xs mt-1 hover:text-white/60">
                Resend code
              </button>
            </div>
          )}

          <div>
            <label className="text-white/40 text-xs font-medium mb-1.5 block">{t("password")}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-white/30" />
              <Input id="rider-password" name="password" type="password" value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                className="pl-9 bg-white/5 border-white/10 text-white h-11 rounded-xl" required autoComplete="current-password" />
            </div>
          </div>
          <Button type="submit" disabled={loading || (!isLogin ? otpStep !== "done" : false)}
            className="w-full bg-[#00ff88] text-black font-bold h-12 rounded-xl hover:bg-[#00e07a] transition-colors mt-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {isLogin ? t("sign_in") : t("sign_up")}
          </Button>
        </form>
        <button className="w-full text-center text-white/30 text-sm mt-5 hover:text-white/60 transition-colors" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? t("need_account") : t("have_account")}
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// WAIT TIMER — UNCHANGED
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
      <div className="bg-violet-500/10 border border-violet-500/25 p-4 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Timer className="w-4 h-4 text-violet-400 animate-pulse" />
          </div>
          <div>
            <p className="text-violet-300 font-semibold text-sm">Driver waiting</p>
            <p className="text-violet-400/60 text-xs">Free wait time</p>
          </div>
        </div>
        <div className="font-mono text-violet-300 font-bold text-2xl">
          {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
        </div>
      </div>
    );
  }

  const overtime = elapsed - freeWaitSeconds;
  const liveFee  = ((overtime / 60) * rules.perMinWait).toFixed(2);
  return (
    <div className="bg-red-500/10 border border-red-500/25 p-4 rounded-2xl flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
          <Timer className="w-4 h-4 text-red-400 animate-pulse" />
        </div>
        <div>
          <p className="text-red-300 font-semibold text-sm">Paid wait time</p>
          <p className="text-red-400/60 text-xs">Charged per minute</p>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-red-300 font-bold text-2xl">
          {String(Math.floor(overtime / 60)).padStart(2, "0")}:{String(overtime % 60).padStart(2, "0")}
        </div>
        <div className="text-red-400 text-xs font-semibold">+₾{liveFee}</div>
      </div>
    </div>
  );
};

// =============================================================================
// RECEIPT MODAL — UNCHANGED
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
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white text-lg font-bold flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#00ff88]" /> Trip Receipt
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/50 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#00ff88]" /></div>
        ) : receipt ? (
          <div className="space-y-3">
            <div className="bg-white/5 rounded-2xl p-4 space-y-3 border border-white/5">
              {[["Driver", receipt.driver_name], ["Car Type", receipt.car_type], ["Distance", `${receipt.distance_km?.toFixed(1)} km`], ["Payment", receipt.payment_method]].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-white/40">{k}</span>
                  <span className="text-white font-medium capitalize">{v}</span>
                </div>
              ))}
            </div>
            <div className="bg-white/5 rounded-2xl p-4 space-y-2.5 border border-white/5">
              <p className="text-white/30 text-xs uppercase tracking-widest font-bold mb-3">Fare Breakdown</p>
              {Object.entries(receipt.fare_breakdown || {}).filter(([k]) => !["breakdown","surge_multiplier","base_total"].includes(k) && typeof receipt.fare_breakdown[k] === "number" && receipt.fare_breakdown[k] > 0).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-white/40 capitalize">{k.replace(/_/g, " ")}</span>
                  <span className="text-white">₾{parseFloat(v).toFixed(2)}</span>
                </div>
              ))}
              {receipt.tip > 0 && (
                <div className="flex justify-between text-sm pt-2 border-t border-white/8">
                  <span className="text-yellow-400/80 flex items-center gap-1"><Star className="w-3 h-3" /> Tip</span>
                  <span className="text-yellow-400">₾{parseFloat(receipt.tip).toFixed(2)}</span>
                </div>
              )}
              <div className="h-px bg-white/10 my-1" />
              <div className="flex justify-between font-bold text-base pt-1">
                <span className="text-white">Total</span>
                <span className="text-[#00ff88]">₾{parseFloat(receipt.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const TipModal = ({ isOpen, onClose, rideId, driverName, onTipped }) => {
  const [tipAmount, setTipAmount] = useState(null);
  const [custom, setCustom]       = useState("");
  const TIPS = [1, 2, 3, 5];

  useEffect(() => { 
    if (isOpen) { setTipAmount(null); setCustom(""); } 
  }, [isOpen]);

  if (!isOpen) return null;

  const finalAmount = custom ? parseFloat(custom) : tipAmount;
  const isValidTip = finalAmount && finalAmount > 0;
  const usdAmount = isValidTip ? (finalAmount * 0.37).toFixed(2) : "0.00";

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center mx-auto mb-3">
            <Star className="w-7 h-7 text-yellow-400" />
          </div>
          <h2 className="text-white text-xl font-bold">Tip Your Driver</h2>
          <p className="text-white/40 text-sm mt-1">{driverName} deserves recognition!</p>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {TIPS.map(amt => (
            <button key={amt} onClick={() => { setTipAmount(amt); setCustom(""); }}
              className={`py-4 rounded-2xl border-2 font-bold text-base transition-all active:scale-95 ${tipAmount === amt && !custom ? "border-[#00ff88] bg-[#00ff88]/12 text-[#00ff88]" : "border-white/10 text-white bg-white/4 hover:border-white/25"}`}>
              ₾{amt}
            </button>
          ))}
        </div>
        <Input type="number" placeholder="Custom amount (₾)" value={custom}
          onChange={e => { setCustom(e.target.value); setTipAmount(null); }}
          className="bg-white/5 border-white/10 text-white text-center h-12 rounded-xl mb-4 placeholder:text-white/25" />
        {isValidTip && <p className="text-white/30 text-xs text-center mb-4">₾{finalAmount.toFixed(2)} GEL ≈ ${usdAmount} USD</p>}
        {isValidTip ? (
          <div className="mb-4">
            <PayPalButtons
              fundingSource="card"
              style={{ layout: "vertical", shape: "rect" }}
              createOrder={(data, actions) => {
                const safeTip = Number(usdAmount || 0);
                if (isNaN(safeTip) || safeTip <= 0) { toast.error("Invalid tip amount."); return null; }
                return actions.order.create({
                  purchase_units: [{ amount: { value: safeTip.toFixed(2), currency_code: "USD" }, description: `Tip for ride ${rideId}` }],
                  application_context: { shipping_preference: "NO_SHIPPING" },
                });
              }}
              onApprove={async (data, actions) => {
                const orderDetails = await actions.order.capture();
                try {
                  const paymentSource = orderDetails.payment_source?.card;
                  const vaultId = paymentSource?.attributes?.vault?.id || null;
                  await api.post(`/rides/${rideId}/tip`, { 
                    amount: finalAmount, tip_amount: finalAmount, reference_id: data.orderID,
                    vault_id: vaultId, card_last4: paymentSource?.last_digits || null, card_brand: paymentSource?.brand || null
                  });
                  toast.success(`₾${finalAmount.toFixed(2)} tip sent! 🙏`);
                  if (vaultId) toast.success("Card saved! 💳");
                  onTipped?.();
                  onClose();
                } catch { toast.error("Payment went through but failed to update. Contact support."); }
              }}
              onError={() => toast.error("Card payment failed.")}
              onCancel={() => toast.info("Tip cancelled.")}
            />
          </div>
        ) : (
          <div className="bg-white/4 rounded-xl p-4 text-center mb-4 border border-white/5">
            <p className="text-white/25 text-sm flex items-center justify-center gap-2">
              <DollarSign className="w-4 h-4" /> Select an amount to pay securely
            </p>
          </div>
        )}
        <Button variant="ghost" className="w-full border border-white/10 text-white/40 rounded-xl h-12 text-sm hover:bg-white/5" onClick={onClose}>
          Maybe Later
        </Button>
      </div>
    </div>
  );
};

// =============================================================================
// SOS BUTTON — UNCHANGED
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
    } catch { toast.error("SOS failed — call emergency services directly"); }
    finally { setLoading(false); }
  };

  return (
    <button onClick={handleSOS} disabled={loading || triggered}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${triggered ? "bg-red-900/30 border border-red-900/50 text-red-700" : "bg-red-500/15 border border-red-500/35 text-red-400 hover:bg-red-500/25"}`}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
      {triggered ? "SOS Sent" : "SOS"}
    </button>
  );
};

// =============================================================================
// SHARE TRIP MODAL — UNCHANGED
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
  const nativeShare = () => navigator.share?.({ title: "Track my T'aksi ride", url: shareLink });

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-[#00d4ff]/15 border border-[#00d4ff]/25 flex items-center justify-center mx-auto mb-3">
            <Share2 className="w-7 h-7 text-[#00d4ff]" />
          </div>
          <h2 className="text-white text-xl font-bold">Share Your Trip</h2>
          <p className="text-white/40 text-sm mt-1">Let friends & family track you in real-time</p>
        </div>
        {shareLink && (
          <div className="bg-white/5 rounded-2xl p-3 flex items-center gap-3 mb-4 border border-white/8">
            <p className="text-[#00d4ff] text-xs flex-1 truncate font-mono">{shareLink}</p>
            <button onClick={copyLink} className="p-1.5 rounded-lg bg-[#00d4ff]/15 text-[#00d4ff] hover:bg-[#00d4ff]/25 transition-colors">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {navigator.share && shareLink && (
          <Button className="w-full bg-[#00d4ff]/15 border border-[#00d4ff]/30 text-[#00d4ff] font-bold rounded-xl h-12 mb-3 hover:bg-[#00d4ff]/25" onClick={nativeShare}>
            <Share2 className="w-4 h-4 mr-2" /> Share via Phone
          </Button>
        )}
        <div className="space-y-2 mb-4">
          <Input placeholder="Send to phone number (optional)" value={phone} onChange={e => setPhone(e.target.value)}
            className="bg-white/5 border-white/10 text-white h-11 rounded-xl placeholder:text-white/25" />
          <Input placeholder="Send to email (optional)" value={email} onChange={e => setEmail(e.target.value)}
            className="bg-white/5 border-white/10 text-white h-11 rounded-xl placeholder:text-white/25" />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-white/10 text-white/40 rounded-xl h-11" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-[#00d4ff] text-black font-bold rounded-xl h-11" onClick={handleShare} disabled={loading || (!phone && !email)}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Send Link
          </Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// SCHEDULED RIDE MODAL — UNCHANGED
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
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-yellow-500/15 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-white text-lg font-bold">Schedule a Ride</h2>
            <p className="text-white/40 text-sm">Book your ride in advance</p>
          </div>
        </div>
        {pickup?.address && <p className="text-xs text-white/40 mb-1 truncate flex items-center gap-1"><MapPin className="w-3 h-3 text-[#00ff88]" />{pickup.address}</p>}
        {destination?.address && <p className="text-xs text-white/40 mb-4 truncate flex items-center gap-1"><Navigation className="w-3 h-3 text-[#00d4ff]" />{destination.address}</p>}
        <div className="mb-4">
          <label className="text-white/40 text-xs font-medium mb-1.5 block">Date & Time</label>
          <Input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
            min={new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16)}
            className="bg-white/5 border-white/10 text-white h-12 rounded-xl" />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-white/10 text-white/40 rounded-xl h-12" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-yellow-500 text-black font-bold rounded-xl h-12" onClick={handleSchedule} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
            Schedule
          </Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// WALLET TOP-UP MODAL — UNCHANGED
// =============================================================================
const WalletTopUpModal = ({ isOpen, onClose, onSuccess }) => {
  const [amount, setAmount] = useState(20);
  const [custom, setCustom] = useState("");
  const AMOUNTS = [5, 10, 20, 50];

  if (!isOpen) return null;
  const finalAmount = custom ? (parseFloat(custom) || 0) : amount;
  const usdAmount   = (finalAmount * 0.37).toFixed(2);
  const canPay      = finalAmount >= 1;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-[#00ff88]/15 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-[#00ff88]" />
          </div>
          <div>
            <h2 className="text-white text-lg font-bold">Top Up Wallet</h2>
            <p className="text-white/40 text-sm">Add funds to your T'aksi wallet</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {AMOUNTS.map(a => (
            <button key={a} onClick={() => { setAmount(a); setCustom(""); }}
              className={`py-3.5 rounded-xl border-2 font-bold transition-all active:scale-95 ${(!custom && amount === a) ? "border-[#00ff88] bg-[#00ff88]/12 text-[#00ff88]" : "border-white/10 text-white bg-white/4 hover:border-white/25"}`}>
              ₾{a}
            </button>
          ))}
        </div>
        <Input type="number" placeholder="Custom amount (₾)" value={custom} min="1" max="1000"
          onChange={e => setCustom(e.target.value)}
          className="bg-white/5 border-white/10 text-white text-center h-11 rounded-xl mb-4 placeholder:text-white/25" />
        {canPay && <p className="text-white/30 text-xs text-center mb-4">₾{finalAmount.toFixed(2)} GEL ≈ ${usdAmount} USD</p>}
        {canPay ? (
          <PayPalButtons
            fundingSource="card"
            style={{ layout: "vertical", shape: "rect" }}
            createOrder={(data, actions) => {
              if (isNaN(usdAmount) || Number(usdAmount) <= 0) { toast.error("Amount must be greater than 0."); return null; }
              return actions.order.create({
                purchase_units: [{ amount: { value: usdAmount, currency_code: "USD" } }],
                payment_source: { card: { attributes: { vault: { store_in_vault: "ON_SUCCESS" } } } },
                application_context: { shipping_preference: "NO_SHIPPING" },
              });
            }}
            onApprove={async (data, actions) => {
              try {
                const orderDetails = await actions.order.capture();
                const paymentSource = orderDetails.payment_source?.card;
                const vaultId = paymentSource?.attributes?.vault?.id || null;
                await api.post("/rider/wallet/topup", { 
                  amount: finalAmount, reference: data.orderID,
                  vault_id: vaultId, card_last4: paymentSource?.last_digits || null, card_brand: paymentSource?.brand || null
                });
                toast.success(`₾${finalAmount.toFixed(2)} added to your wallet!`);
                if (vaultId) toast.success("Card saved! 💳");
                onSuccess();
                onClose();
              } catch { toast.error("Payment captured but wallet not updated. Contact support."); }
            }}
            onError={() => toast.error("Payment failed")}
            onCancel={() => toast.info("Payment cancelled")}
          />
        ) : (
          <div className="bg-white/4 rounded-xl p-4 text-center mb-2">
            <p className="text-white/25 text-sm">Enter ₾1 or more to show payment</p>
          </div>
        )}
        <Button variant="ghost" className="w-full text-white/30 mt-2 rounded-xl" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
};

// =============================================================================
// FAVORITES PANEL — UNCHANGED
// =============================================================================
const FavoritesPanel = ({ onSelect }) => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/user/favorites").then(res => setFavorites(res.data.favorites || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const deleteFav = async (id) => {
    await api.delete(`/user/favorites/${id}`);
    setFavorites(prev => prev.filter(f => f.id !== id));
    toast.success("Removed");
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-white/30" /></div>;
  if (!favorites.length) return (
    <div className="text-center py-6">
      <Heart className="w-8 h-8 text-white/15 mx-auto mb-2" />
      <p className="text-white/30 text-sm">No saved places yet</p>
      <p className="text-white/20 text-xs mt-1">Tap ❤️ on a location to save it</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {favorites.map(fav => (
        <div key={fav.id} className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-xl p-3 cursor-pointer hover:border-white/15 transition-all group">
          <span className="text-2xl w-8 shrink-0">{fav.icon || "📍"}</span>
          <div className="flex-1 min-w-0" onClick={() => onSelect(fav)}>
            <p className="text-white font-semibold text-sm truncate">{fav.name}</p>
            <p className="text-white/35 text-xs truncate mt-0.5">{fav.address}</p>
          </div>
          <button className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-all" onClick={() => deleteFav(fav.id)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// SAVE FAVORITE DIALOG — UNCHANGED
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
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-bold text-base mb-1">Save Location</h3>
        <p className="text-white/35 text-xs mb-4 truncate">{location?.address}</p>
        <div className="flex gap-1.5 mb-4">
          {ICONS.map(ic => (
            <button key={ic} onClick={() => setIcon(ic)}
              className={`text-xl p-2 rounded-xl border-2 transition-all ${icon === ic ? "border-pink-500 bg-pink-500/15" : "border-white/10 bg-white/4 hover:border-white/20"}`}>
              {ic}
            </button>
          ))}
        </div>
        <Input placeholder="Name (e.g. Home, Work)" value={name} onChange={e => setName(e.target.value)}
          className="bg-white/5 border-white/10 text-white mb-4 h-11 rounded-xl placeholder:text-white/25" />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 border-white/10 text-white/40 rounded-xl h-10 text-sm" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 bg-pink-500 text-white font-bold rounded-xl h-10 text-sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// REFERRAL PANEL — UNCHANGED
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
          <div className="bg-gradient-to-br from-[#00ff88]/10 to-[#00d4ff]/10 border border-[#00ff88]/20 rounded-2xl p-4">
            <p className="text-white/35 text-xs uppercase tracking-widest font-bold mb-3">Your Code</p>
            <div className="flex items-center justify-between">
              <p className="text-[#00ff88] font-mono text-3xl font-bold tracking-widest">{referral.referral_code}</p>
              <button onClick={copyCode} className="p-2.5 rounded-xl bg-[#00ff88]/15 border border-[#00ff88]/25 text-[#00ff88] hover:bg-[#00ff88]/25 transition-colors">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-white/30 text-xs mt-2">Share to earn bonuses when friends join</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/4 border border-white/8 rounded-xl p-3.5 text-center">
              <p className="text-[#00ff88] text-2xl font-bold">{referral.referrals_count || 0}</p>
              <p className="text-white/35 text-xs mt-0.5">Friends Referred</p>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-xl p-3.5 text-center">
              <p className="text-[#00ff88] text-2xl font-bold">₾{(referral.bonus_earned || 0).toFixed(2)}</p>
              <p className="text-white/35 text-xs mt-0.5">Bonus Earned</p>
            </div>
          </div>
        </>
      )}
      <div className="bg-white/4 border border-white/8 rounded-xl p-4">
        <p className="text-white/60 text-sm font-medium mb-2.5">Have a referral code?</p>
        <div className="flex gap-2">
          <Input placeholder="Enter code" value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())}
            className="bg-white/5 border-white/10 text-white uppercase font-mono h-10 rounded-xl placeholder:text-white/20" maxLength={12} />
          <Button className="bg-[#00ff88] text-black font-bold h-10 px-4 rounded-xl shrink-0" onClick={applyCode} disabled={applying}>
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// RIDE HISTORY ITEM — UNCHANGED
// =============================================================================
const RideHistoryItem = ({ ride, onTip, onReceipt, onRate, statusConfig }) => {
  const [expanded, setExpanded] = useState(false);
  const sc = statusConfig[ride.status] || statusConfig.cancelled;

  return (
    <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
      <button className="w-full p-4 text-left" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${sc.color}`}>{sc.label}</span>
              <span className="text-white/25 text-xs">{ride.created_at ? new Date(ride.created_at).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }) : "—"}</span>
            </div>
            <p className="text-white text-sm font-medium truncate">{ride.pickup}</p>
            {ride.destination && <p className="text-white/40 text-xs truncate mt-0.5 flex items-center gap-1"><ArrowRight className="w-3 h-3 shrink-0" />{ride.destination}</p>}
          </div>
          <div className="text-right shrink-0 flex flex-col items-end gap-2">
            <span className="text-[#00ff88] font-bold text-lg font-mono">₾{(ride.final_fare || ride.estimated_fare)?.toFixed(2) ?? "—"}</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-white/25" /> : <ChevronDown className="w-4 h-4 text-white/25" />}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-white/6 space-y-3">
          <div className="grid grid-cols-2 gap-2 pt-3">
            {[
              ["Car Type", ride.carType || ride.car_type || "—"],
              ["Payment", ride.payment_method || ride.paymentMethod || "Cash"],
              ride.driver_info?.name ? ["Driver", ride.driver_info.name] : null,
              ride.distance_km ? ["Distance", `${parseFloat(ride.distance_km).toFixed(1)} km`] : null,
            ].filter(Boolean).map(([k, v]) => (
              <div key={k} className="bg-white/4 rounded-xl p-2.5">
                <p className="text-white/35 text-[10px] uppercase tracking-wider">{k}</p>
                <p className="text-white text-sm font-medium mt-0.5 capitalize">{v}</p>
              </div>
            ))}
          </div>
          <div className="bg-white/4 rounded-xl p-3 space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-[#00ff88] mt-1.5 shrink-0" />
              <p className="text-white/60 text-xs">{ride.pickup}</p>
            </div>
            {ride.stops?.map((s, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                <p className="text-white/50 text-xs">{s.address}</p>
              </div>
            ))}
            {ride.destination && (
              <div className="flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-[#00d4ff] mt-1.5 shrink-0" />
                <p className="text-white/60 text-xs">{ride.destination}</p>
              </div>
            )}
          </div>
          {ride.status === "completed" && (
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-xs font-medium transition-all border border-white/8 hover:border-white/15"
                onClick={() => onReceipt(ride.id)}>
                <Receipt className="w-3.5 h-3.5" /> Receipt
              </button>
              {!ride.tip_amount && ride.driver_id && (
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-xs font-medium transition-all border border-yellow-500/20 hover:border-yellow-500/35"
                  onClick={() => onTip({ rideId: ride.id, driverName: ride.driver_info?.name || "Driver" })}>
                  <Star className="w-3.5 h-3.5" /> Tip Driver
                </button>
              )}
              {!ride.rider_rating && (
                <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#00ff88]/8 hover:bg-[#00ff88]/15 text-[#00ff88]/80 text-xs font-medium transition-all border border-[#00ff88]/20 hover:border-[#00ff88]/35"
                  onClick={() => onRate(ride.id)}>
                  <Star className="w-3.5 h-3.5" /> Rate
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// RIDER DASHBOARD — UNCHANGED logic, uses upgraded LiveTrackingMap above
// =============================================================================
const RiderDashboard = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate  = useNavigate();
  const { t }     = useLanguage();

  const [showSaveCard, setShowSaveCard] = useState(false);

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

  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return; }
    loadGoogleMaps(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
      .then(() => setMapsLoaded(true))
      .catch(() => toast.error("Failed to load Google Maps"));
  }, []);

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

  const addStop    = () => stops.length < 3 ? setStops([...stops, { address: "", lat: null, lng: null, order: stops.length }]) : toast.error("Maximum 3 stops");
  const updateStop = (i, data) => setStops(prev => { const s = [...prev]; s[i] = { ...s[i], ...data }; return s; });
  const removeStop = (i) => setStops(stops.filter((_, idx) => idx !== i));

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

  const processRideRequest = async (paypalOrderId = null, vaultId = null, cardLast4 = null, cardBrand = null) => {
    setLoading(true);
    try {
      const rideData = {
        pickup: sanitiseAddressForSubmit(pickup.address), pickupLat: pickup.lat, pickupLng: pickup.lng,
        destination: destination.address ? sanitiseAddressForSubmit(destination.address) : null,
        destinationLat: destination.lat || null, destinationLng: destination.lng || null,
        stops: stops.filter(s => s.lat).map((s, i) => ({ address: sanitiseAddressForSubmit(s.address), lat: s.lat, lng: s.lng, order: i })),
        carType, paymentMethod,
        ...(paypalOrderId && { paymentOrderId: paypalOrderId }),
        ...(vaultId && { vault_id: vaultId, card_last4: cardLast4, card_brand: cardBrand }),
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

  const carTypes = useMemo(() => Object.entries(PRICING_RULES).map(([key, val]) => ({ value: key, ...val })), []);

  const statusConfig = {
    searching:   { color: "bg-amber-500/20 text-amber-400 border-amber-500/30",       label: "Searching" },
    accepted:    { color: "bg-blue-500/20 text-blue-400 border-blue-500/30",           label: "Accepted" },
    arrived:     { color: "bg-violet-500/20 text-violet-400 border-violet-500/30",     label: "Arrived" },
    in_progress: { color: "bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/30",        label: "In Progress" },
    completed:   { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",  label: "Completed" },
    cancelled:   { color: "bg-red-500/20 text-red-400 border-red-500/30",              label: "Cancelled" },
    no_drivers:  { color: "bg-white/10 text-white/40 border-white/15",                 label: "No Drivers" },
  };

  const rideCoord = (ride, field) => {
    const keys = { pickupLat: ["pickup_lat","pickupLat"], pickupLng: ["pickup_lng","pickupLng"], destLat: ["destination_lat","destinationLat","dest_lat"], destLng: ["destination_lng","destinationLng","dest_lng"] };
    for (const k of (keys[field] || [])) { if (ride[k] != null) return parseFloat(ride[k]); }
    return null;
  };

  const tabs = [
    { id: "book",    label: "Book",    Icon: Rocket  },
    { id: "active",  label: "Active",  Icon: Navigation },
    { id: "history", label: "History", Icon: History },
    { id: "profile", label: "Profile", Icon: User    },
  ];

  return (
    <div className="min-h-screen text-white" style={{ background: "#07070f" }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-60 -right-60 w-[600px] h-[600px] bg-[#00ff88]/3 rounded-full blur-3xl" />
        <div className="absolute -bottom-60 -left-60 w-[600px] h-[600px] bg-[#00d4ff]/3 rounded-full blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/6" style={{ background: "rgba(7,7,15,0.92)", backdropFilter: "blur(24px)" }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#00ff88] to-[#00d4ff] flex items-center justify-center shadow-[0_0_20px_rgba(0,255,136,0.2)]">
              <Rocket className="w-5 h-5 text-black" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-none">{user?.name} {user?.surname}</p>
              <button className="flex items-center gap-1 text-[#00ff88] text-xs mt-0.5 hover:text-[#00d4ff] transition-colors" onClick={() => setShowTopUp(true)}>
                <Wallet className="w-2.5 h-2.5" />
                ₾{user?.wallet_balance?.toFixed(2) || "0.00"}
                <span className="text-white/25">·</span>
                <span className="text-white/40">Top Up</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeRide && ["accepted","arrived","in_progress"].includes(activeRide.status) && (
              <button onClick={() => setActiveTab("active")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00ff88]/15 border border-[#00ff88]/30 text-[#00ff88] text-xs font-bold mr-1 animate-pulse">
                <Activity className="w-3 h-3" /> Live
              </button>
            )}
            <button className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white hover:bg-white/8 transition-all" onClick={() => navigate("/")}>
              <Home className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-28 pt-4 relative">

        {/* ================================================================ */}
        {/* BOOK TAB                                                          */}
        {/* ================================================================ */}
        {activeTab === "book" && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button onClick={() => setShowFavorites(v => !v)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${showFavorites ? "bg-pink-500/20 border-pink-500/35 text-pink-400" : "bg-white/4 border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                <Heart className="w-3.5 h-3.5" /> Saved Places
              </button>
              <button onClick={() => setShowSchedule(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border bg-white/4 border-white/10 text-white/40 text-xs font-semibold hover:border-white/20 hover:text-white/60 whitespace-nowrap transition-all shrink-0">
                <Calendar className="w-3.5 h-3.5" /> Schedule
              </button>
              {scheduledRides.length > 0 && (
                <div className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-semibold shrink-0">
                  <Calendar className="w-3 h-3" /> {scheduledRides.length} scheduled
                </div>
              )}
            </div>

            {showFavorites && (
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <p className="text-pink-400/80 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5" /> Saved Places
                </p>
                <FavoritesPanel onSelect={(fav) => { setDestination({ address: fav.address, lat: fav.lat, lng: fav.lng }); setShowFavorites(false); toast.success(`${fav.name} set as destination`); }} />
              </div>
            )}

            <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
              <div className="p-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-white/40 text-xs font-semibold uppercase tracking-wider">Pickup</label>
                    <button className="flex items-center gap-1 text-[#00ff88] text-xs font-medium hover:text-[#00d4ff] transition-colors disabled:opacity-50"
                      onClick={getCurrentLocation} disabled={locationLoading}>
                      {locationLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crosshair className="w-3 h-3" />}
                      My location
                    </button>
                  </div>
                  <LocationInput id="pickup-input" name="pickup" value={pickup} onChange={setPickup}
                    placeholder="Where should we pick you up?" icon={MapPin} iconColor="text-[#00ff88]"
                    onSaveAsFavorite={pickup.lat ? () => setShowSaveFav(pickup) : null} mapsLoaded={mapsLoaded} />
                </div>

                {stops.map((stop, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-yellow-400/70 text-xs font-semibold uppercase tracking-wider">Stop {idx + 1}</label>
                      <button className="text-white/25 hover:text-red-400 transition-colors" onClick={() => removeStop(idx)}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <LocationInput id={`stop-${idx}`} name={`stop_${idx}`} value={stop}
                      onChange={(data) => updateStop(idx, data)} placeholder="Stop address"
                      icon={MapPin} iconColor="text-yellow-400/70" mapsLoaded={mapsLoaded} />
                  </div>
                ))}

                <div>
                  <label className="text-white/40 text-xs font-semibold uppercase tracking-wider block mb-2">Destination</label>
                  <LocationInput id="destination-input" name="destination" value={destination} onChange={setDestination}
                    placeholder="Where to?" icon={Navigation} iconColor="text-[#00d4ff]"
                    onSaveAsFavorite={destination.lat ? () => setShowSaveFav(destination) : null} mapsLoaded={mapsLoaded} />
                </div>

                {stops.length < 3 && (
                  <button className="w-full flex items-center justify-center gap-2 py-2 text-xs text-white/25 hover:text-white/50 border border-dashed border-white/10 rounded-xl hover:border-white/20 transition-all" onClick={addStop}>
                    <Plus className="w-3 h-3" /> Add stop (free)
                  </button>
                )}
              </div>

              {mapsLoaded && pickup.lat && destination.lat && (
                <div className="border-t border-white/6">
                  <LiveTrackingMap pickup={pickup} destination={destination} stops={stops} status="preview" driverLocation={null} />
                </div>
              )}
            </div>

            {surgeInfo?.is_surge && (
              <div className="bg-orange-500/10 border border-orange-500/25 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-orange-300 font-semibold text-sm">High Demand</p>
                    <p className="text-orange-400/60 text-xs">{surgeInfo.surge_reason}</p>
                  </div>
                </div>
                <span className="text-orange-300 font-bold text-xl bg-orange-500/20 px-3 py-1 rounded-xl">×{surgeInfo.multiplier}</span>
              </div>
            )}

            {routeInfo && fareEstimate && (
              <div className="bg-white/3 border border-white/8 rounded-2xl px-4 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white/40 text-sm">
                  <RouteIcon className="w-4 h-4" />
                  <span>{routeInfo.distance} km · {routeInfo.duration} min</span>
                </div>
                <div className="text-right">
                  <span className="text-[#00ff88] font-bold text-2xl">₾{fareEstimate.total.toFixed(2)}</span>
                  {paymentMethod === "card" && <p className="text-white/25 text-xs mt-0.5">incl. ₾2 card fee</p>}
                </div>
              </div>
            )}

            <div>
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Choose vehicle</p>
              <div className="grid grid-cols-5 gap-1.5">
                {carTypes.map((type) => {
                  const est = routeInfo
                    ? calculateFare(type.value, routeInfo.distance, 0, 0, validStopsCount, surgeInfo?.multiplier || 1.0, paymentMethod).total
                    : type.base * (surgeInfo?.multiplier || 1.0);
                  const active = carType === type.value;
                  return (
                    <button key={type.value} onClick={() => setCarType(type.value)}
                      className={`p-2.5 rounded-xl border-2 transition-all text-center active:scale-95 ${active ? "border-[#00ff88] bg-[#00ff88]/10 shadow-[0_0_12px_rgba(0,255,136,0.15)]" : "border-white/8 bg-white/3 hover:border-white/20"}`}>
                      <div className="text-xl mb-0.5">{type.icon}</div>
                      <div className={`text-[10px] font-semibold leading-tight ${active ? "text-[#00ff88]" : "text-white/50"}`}>{type.name}</div>
                      <div className={`text-[10px] mt-0.5 font-mono ${active ? "text-[#00ff88]/70" : "text-white/30"}`}>₾{est.toFixed(2)}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">Payment method</p>
              <div className="flex gap-2">
                {[
                  { val: "cash",   label: "Cash",   Icon: null },
                  { val: "wallet", label: `₾${user?.wallet_balance?.toFixed(2) || "0.00"}`, subLabel: "Wallet", Icon: Wallet },
                  { val: "card",   label: "Card",   Icon: CreditCard },
                ].map(({ val, label, subLabel, Icon }) => (
                  <button key={val}
                    onClick={() => {
                      if (val === "wallet" && (user?.wallet_balance || 0) <= 0) { toast.error("Wallet empty"); setShowTopUp(true); return; }
                      setPaymentMethod(val); setShowPayPal(false);
                    }}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${paymentMethod === val ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]" : "border-white/8 bg-white/3 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                    {Icon && <Icon className="w-4 h-4 mb-0.5" />}
                    <span>{label}</span>
                    {subLabel && <span className="text-[10px] opacity-60">{subLabel}</span>}
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full bg-[#00ff88] text-black font-bold h-14 text-base rounded-2xl hover:bg-[#00e07a] transition-all shadow-[0_4px_30px_rgba(0,255,136,0.3)] active:scale-[0.98]"
              onClick={handleBookRide} disabled={loading} data-testid="request-ride-btn">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Rocket className="w-5 h-5 mr-2" />}
              {loading ? "Finding your ride..." : "Request Ride"}
            </Button>

            {showPayPal && paymentMethod === "card" && (() => {
              const amount = fareEstimate?.total ?? calculateFare(carType, routeInfo?.distance ?? 5, 0, 0, validStopsCount, surgeInfo?.multiplier ?? 1.0, "card").total;
              const usd = (amount * 0.37).toFixed(2);
              return (
                <div className="bg-white/3 border border-white/10 rounded-2xl p-4">
                  <p className="text-center text-sm text-white/40 mb-3">Pay ₾{amount.toFixed(2)} (${usd} USD)</p>
                  <PayPalButtons
                    fundingSource="card"
                    style={{ layout: "vertical", shape: "rect" }}
                    createOrder={(data, actions) => {
                      if (isNaN(usd) || Number(usd) <= 0) { toast.error("Cannot process a $0.00 ride."); setShowPayPal(false); return null; }
                      return actions.order.create({
                        purchase_units: [{ amount: { value: usd, currency_code: "USD" } }],
                        application_context: { shipping_preference: "NO_SHIPPING" },
                      });
                    }}
                    onApprove={async (data, actions) => {
                      try {
                        const orderDetails = await actions.order.capture();
                        const paymentSource = orderDetails.payment_source?.card;
                        const vaultId = paymentSource?.attributes?.vault?.id || null;
                        const last4 = paymentSource?.last_digits || null;
                        const brand = paymentSource?.brand || null;
                        toast.success("Payment approved! Booking...");
                        if (vaultId) toast.success("Card saved for future rides! 💳");
                        await processRideRequest(data.orderID, vaultId, last4, brand);
                      } catch { toast.error("Payment failed during capture."); setShowPayPal(false); }
                    }}
                    onError={(err) => { console.error("PayPal error:", err); toast.error("Payment failed."); setShowPayPal(false); }}
                    onCancel={() => { toast.info("Payment cancelled."); setShowPayPal(false); }}
                  />
                  <button className="w-full text-center text-white/25 text-xs mt-3 hover:text-white/50 transition-colors" onClick={() => setShowPayPal(false)}>Cancel</button>
                </div>
              );
            })()}

            {scheduledRides.length > 0 && (
              <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-2xl p-4">
                <p className="text-yellow-400/80 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" /> Scheduled Rides
                </p>
                {scheduledRides.slice(0, 2).map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-yellow-500/8 last:border-0">
                    <div>
                      <p className="text-white text-sm font-medium truncate max-w-[220px]">{r.pickup_address}</p>
                      <p className="text-yellow-400/50 text-xs mt-0.5">{new Date(r.scheduled_time).toLocaleString()}</p>
                    </div>
                    <button className="text-red-400/60 hover:text-red-400 text-xs transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10" onClick={() => cancelScheduledRide(r.id)}>
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* ACTIVE TAB                                                        */}
        {/* ================================================================ */}
        {activeTab === "active" && (
          <div>
            {activeRide ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white/3 border border-white/8 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full animate-pulse ${activeRide.status === "in_progress" ? "bg-[#00ff88]" : activeRide.status === "arrived" ? "bg-violet-400" : activeRide.status === "accepted" ? "bg-blue-400" : "bg-amber-400"}`} />
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${(statusConfig[activeRide.status] || statusConfig.searching).color}`}>
                      {(statusConfig[activeRide.status] || statusConfig.searching).label}
                    </span>
                  </div>
                  <SOSButton rideId={activeRide.id} lat={rideCoord(activeRide, "pickupLat")} lng={rideCoord(activeRide, "pickupLng")} />
                </div>

                {mapsLoaded && (
                  <div className="relative rounded-2xl overflow-hidden border border-white/8">
                    <LiveTrackingMap
                      status={activeRide.status}
                      driverLocation={activeRide.driver_location}
                      pickup={{ lat: rideCoord(activeRide, "pickupLat"), lng: rideCoord(activeRide, "pickupLng") }}
                      destination={rideCoord(activeRide, "destLat") ? { lat: rideCoord(activeRide, "destLat"), lng: rideCoord(activeRide, "destLng") } : null}
                      stops={activeRide.stops || []}
                    />
                    <div className="absolute top-3 left-3 z-10">
                      <div className="bg-[#07070f]/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
                        <p className="text-xs text-white font-semibold">
                          {activeRide.status === "in_progress" ? "Live Trip" : "Driver Arriving"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeRide.status === "searching" && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
                    </div>
                    <div>
                      <p className="text-amber-300 font-semibold text-sm">{activeRide.matching_status || "Finding you a driver..."}</p>
                      {activeRide.drivers_notified_count > 0 && <p className="text-amber-400/50 text-xs mt-0.5">{activeRide.drivers_notified_count} drivers notified</p>}
                    </div>
                  </div>
                )}

                {activeRide.status === "no_drivers" && (
                  <div className="bg-white/4 border border-white/10 p-4 rounded-2xl">
                    <p className="text-white font-semibold text-sm mb-3">No drivers available right now</p>
                    <div className="flex gap-2">
                      <Button className="flex-1 bg-[#00ff88] text-black font-bold rounded-xl h-11 text-sm" onClick={handleRetryRide}>
                        <Rocket className="w-4 h-4 mr-1.5" /> Retry
                      </Button>
                      <Button variant="outline" className="border-white/10 text-white/40 rounded-xl h-11 text-sm px-4" onClick={() => { setActiveRide(null); setActiveTab("book"); }}>
                        New Ride
                      </Button>
                    </div>
                  </div>
                )}

                <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-0.5 pt-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00ff88]" />
                      <div className="w-px h-full min-h-[16px] bg-white/10" />
                    </div>
                    <div className="flex-1 pb-3 border-b border-white/6">
                      <p className="text-white/35 text-[10px] uppercase tracking-wider mb-0.5">Pickup</p>
                      <p className="text-white text-sm">{activeRide.pickup}</p>
                    </div>
                  </div>
                  {activeRide.stops?.map((s, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-0.5 pt-1">
                        <div className="w-2 h-2 rounded-full bg-yellow-400" />
                        <div className="w-px h-full min-h-[16px] bg-white/10" />
                      </div>
                      <div className="flex-1 pb-3 border-b border-white/6">
                        <p className="text-yellow-400/50 text-[10px] uppercase tracking-wider mb-0.5">Stop {i + 1}</p>
                        <p className="text-white/70 text-sm">{s.address}</p>
                      </div>
                    </div>
                  ))}
                  {activeRide.destination && (
                    <div className="flex items-start gap-3">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00d4ff] mt-1" />
                      <div>
                        <p className="text-white/35 text-[10px] uppercase tracking-wider mb-0.5">Destination</p>
                        <p className="text-white text-sm">{activeRide.destination}</p>
                      </div>
                    </div>
                  )}
                </div>

                {activeRide.driver_info && (
                  <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00ff88]/15 to-[#00d4ff]/15 border border-white/10 flex items-center justify-center shrink-0">
                        <User className="w-7 h-7 text-white/50" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xl text-white truncate">{activeRide.driver_info.name}</p>
                        <p className="text-white/40 text-sm flex items-center gap-1.5 mt-0.5 truncate">
                          <Car className="w-3.5 h-3.5 shrink-0" />
                          {activeRide.driver_info.car_color} {activeRide.driver_info.car_make} {activeRide.driver_info.car_model}
                        </p>
                      </div>
                      <div className="bg-[#00ff88]/10 border border-[#00ff88]/25 px-3 py-2 rounded-xl shrink-0">
                        <p className="text-[#00ff88] font-mono font-bold tracking-wider text-sm">{activeRide.driver_info.license_plate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/30 pt-1 border-t border-white/6">
                      <Shield className="w-3 h-3 text-[#00ff88]/60" />
                      <span>Background checked & verified</span>
                    </div>
                    <RideCommunication
                      rideId={activeRide.id}
                      otherPartyPhone={activeRide.driver_info.cellphone}
                      otherPartyName={activeRide.driver_info.name}
                      currentUserId={user?.id}
                      isDriver={false}
                    />
                    {activeRide.status === "in_progress" && (
                      <button onClick={() => setShowTip({ rideId: activeRide.id, driverName: activeRide.driver_info?.name || "Driver" })}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm font-semibold hover:bg-yellow-500/20 transition-all">
                        <Star className="w-4 h-4" /> Tip Driver
                      </button>
                    )}
                  </div>
                )}

                {activeRide.status === "arrived" && (
                  <WaitTimer arrivedAt={activeRide.arrived_at} carType={activeRide.carType || activeRide.car_type} />
                )}

                {["accepted","arrived","in_progress"].includes(activeRide.status) && (
                  <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/8 text-white/35 text-sm hover:border-white/20 hover:text-white/60 transition-all"
                    onClick={() => setShowShare(true)}>
                    <Share2 className="w-4 h-4" /> Share trip with someone
                  </button>
                )}

                <div className="bg-[#00ff88]/5 border border-[#00ff88]/15 rounded-2xl px-4 py-3.5 flex justify-between items-center">
                  <span className="text-white/40 text-sm">Estimated fare</span>
                  <span className="text-[#00ff88] font-bold text-2xl font-mono">₾{(activeRide.final_fare || activeRide.estimated_fare)?.toFixed(2)}</span>
                </div>

                {["searching","accepted"].includes(activeRide.status) && (
                  <Button variant="outline" className="w-full border-red-500/25 text-red-400/80 hover:bg-red-500/10 hover:border-red-500/40 rounded-xl h-12" onClick={handleCancelRide}>
                    Cancel Ride
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-20 h-20 rounded-3xl bg-white/4 border border-white/8 flex items-center justify-center mb-4">
                  <Navigation className="w-9 h-9 text-white/20" />
                </div>
                <p className="text-white/30 text-base mb-1">No active ride</p>
                <p className="text-white/15 text-sm mb-6">Your ride will appear here once booked</p>
                <Button className="bg-[#00ff88] text-black font-bold rounded-xl px-8 h-12" onClick={() => setActiveTab("book")}>
                  Book a Ride
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* HISTORY TAB                                                       */}
        {/* ================================================================ */}
        {activeTab === "history" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">Trip History</h2>
              <span className="text-white/25 text-sm">{rideHistory.length} rides</span>
            </div>
            {rideHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24">
                <div className="w-20 h-20 rounded-3xl bg-white/4 border border-white/8 flex items-center justify-center mb-4">
                  <History className="w-9 h-9 text-white/20" />
                </div>
                <p className="text-white/30 text-base mb-1">No rides yet</p>
                <p className="text-white/15 text-sm mb-6">Your completed trips will show here</p>
                <Button className="bg-[#00ff88] text-black font-bold rounded-xl px-8 h-12" onClick={() => setActiveTab("book")}>
                  Book Your First Ride
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {rideHistory.map((ride) => (
                  <RideHistoryItem key={ride.id} ride={ride} statusConfig={statusConfig}
                    onTip={(data) => setShowTip(data)} onReceipt={(id) => setShowReceipt(id)} onRate={(id) => setShowRatingModal(id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* PROFILE TAB                                                       */}
        {/* ================================================================ */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00ff88]/20 to-[#00d4ff]/20 border border-white/10 flex items-center justify-center shrink-0">
                  <User className="w-7 h-7 text-white/50" />
                </div>
                <div>
                  <p className="text-white font-bold text-xl">{user?.name} {user?.surname}</p>
                  <p className="text-white/40 text-sm mt-0.5">{user?.cellphone}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                  <p className="text-[#00ff88] text-xl font-bold font-mono">{user?.total_rides || 0}</p>
                  <p className="text-white/30 text-xs mt-0.5">Rides</p>
                </div>
                <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                  <p className="text-yellow-400 text-xl font-bold">{user?.rating?.toFixed(1) || "5.0"}</p>
                  <p className="text-white/30 text-xs mt-0.5">Rating ⭐</p>
                </div>
                <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                  <p className="text-[#00d4ff] text-xl font-bold font-mono">₾{user?.wallet_balance?.toFixed(2) || "0.00"}</p>
                  <p className="text-white/30 text-xs mt-0.5">Wallet</p>
                </div>
              </div>
            </div>

            <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#00ff88]/15 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-[#00ff88]" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">T'aksi Wallet</p>
                    <p className="text-white/30 text-xs">Pay faster with wallet</p>
                  </div>
                </div>
                <span className="text-[#00ff88] font-bold text-2xl font-mono">₾{user?.wallet_balance?.toFixed(2) || "0.00"}</span>
              </div>
              <Button className="w-full bg-[#00ff88] text-black font-bold rounded-xl h-11 text-sm" onClick={() => setShowTopUp(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Add Funds
              </Button>
            </div>

            <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
              <p className="text-white font-semibold text-sm flex items-center gap-2 mb-4">
                <Heart className="w-4 h-4 text-pink-400" /> Saved Places
              </p>
              <FavoritesPanel onSelect={(fav) => { setDestination({ address: fav.address, lat: fav.lat, lng: fav.lng }); setActiveTab("book"); toast.success(`${fav.name} set as destination`); }} />
            </div>

            <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
              <button className="w-full flex items-center justify-between px-4 py-4" onClick={() => setShowReferral(v => !v)}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#00d4ff]/15 flex items-center justify-center">
                    <Gift className="w-4 h-4 text-[#00d4ff]" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Refer & Earn</p>
                    <p className="text-white/30 text-xs">Share your code, get bonuses</p>
                  </div>
                </div>
                {showReferral ? <ChevronUp className="w-4 h-4 text-white/25" /> : <ChevronDown className="w-4 h-4 text-white/25" />}
              </button>
              {showReferral && (
                <div className="px-4 pb-4 border-t border-white/6 pt-4">
                  <ReferralPanel />
                </div>
              )}
            </div>

            <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
              <p className="text-white font-semibold text-sm mb-3">Language</p>
              <LanguageSelector variant="outline" onSelect={(lang) => api.post(`/user/language?lang=${lang}`).catch(() => {})} />
            </div>

            <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-red-500/20 text-red-400/70 text-sm font-medium hover:bg-red-500/10 hover:border-red-500/35 hover:text-red-400 transition-all">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        )}
      </main>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/6" style={{ background: "rgba(7,7,15,0.96)", backdropFilter: "blur(24px)" }}>
        <div className="max-w-2xl mx-auto px-4 flex">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            const hasNotif = id === "active" && activeRide && ["searching","accepted","arrived","in_progress"].includes(activeRide.status);
            return (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition-all ${active ? "text-[#00ff88]" : "text-white/25 hover:text-white/50"}`}>
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-all ${active ? "scale-110" : ""}`} />
                  {hasNotif && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#00ff88] border border-[#07070f]" />}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
                {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full bg-[#00ff88]" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* MODALS */}
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
// =============================================================================
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;
if (!PAYPAL_CLIENT_ID) {
  console.error("❌ VITE_PAYPAL_CLIENT_ID is not set.");
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
        vault: true // 👈 Swapped capture for vault
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