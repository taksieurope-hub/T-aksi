// RiderPortal.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";
import { useLanguage } from "@/i18n/LanguageContext";
import api from "@/api";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

import {
  Car,
  MapPin,
  Star,
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
  Target,
  Crosshair,
  Send,
} from "lucide-react";

/* =========================================================
   IMPORTANT NOTES (matches server.py)
   - api client should have baseURL ending with /api
     so api.get("/rider/active-ride") => GET /api/rider/active-ride
   - Auth:
     POST /auth/login {cellphone, password}
     POST /auth/register/rider {name, surname, cellphone, password, email?}
   - Ride:
     POST /rides/request uses aliases:
       pickupLat, pickupLng, destinationLat, destinationLng,
       carType, paymentMethod, paymentOrderId, estimatedDistance, estimatedDuration, stops[]
========================================================= */

/* ---------------------------------------------
   UI CSS fixes (maps + nicer address bars)
---------------------------------------------- */
const globalCss = `
  .gm-style,
  div[aria-label="Map"] {
    min-height: 100% !important;
    height: 100% !important;
    width: 100% !important;
    border-radius: 0.75rem;
  }
`;

/* ---------------------------------------------
   Pricing (UI only – server is source of truth)
---------------------------------------------- */
const PRICING_RULES = {
  economy: { key: "vehicle_economy", base: 2.0, perKm: 0.5, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "🚗", longDist: 7.0, veryLong: 30.0 },
  comfort: { key: "vehicle_comfort", base: 2.5, perKm: 0.55, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "🚙", longDist: 7.0, veryLong: 30.0 },
  suv: { key: "vehicle_suv", base: 3.9, perKm: 0.8, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "🚐", longDist: 7.0, veryLong: 30.0 },
  personal: { key: "vehicle_personal", base: 4.0, perKm: 0.7, perMinWait: 0.5, freeWait: 2, stopFee: 0.0, icon: "👤", longDist: 7.0, veryLong: 30.0 },
  jumpstart: { key: "vehicle_jumpstart", base: 4.5, perKm: 0.0, perMinWait: 0.5, freeWait: 999, stopFee: 0.0, icon: "⚡", longDist: 999.0, veryLong: 999.0 },
};

const calculateFare = (carType, distanceKm, waitMin = 0, stopWaitMin = 0, numStops = 0, surgeMultiplier = 1.0) => {
  const rules = PRICING_RULES[carType] || PRICING_RULES.economy;
  let subtotal = rules.base;

  subtotal += distanceKm * rules.perKm;

  if (distanceKm > rules.longDist) subtotal += (distanceKm - rules.longDist) * 0.15;
  if (distanceKm > rules.veryLong) subtotal += Math.ceil((distanceKm - rules.veryLong) / 15) * 5;

  const billableWait = Math.max(0, waitMin - rules.freeWait);
  const totalWait = billableWait + stopWaitMin;
  subtotal += totalWait * rules.perMinWait;

  subtotal += numStops * rules.stopFee;

  const surgeFee = subtotal * (surgeMultiplier - 1.0);
  const total = subtotal + surgeFee;

  return {
    base: rules.base,
    distance: Math.round(distanceKm * rules.perKm * 100) / 100,
    wait: Math.round(totalWait * rules.perMinWait * 100) / 100,
    stops: numStops * rules.stopFee,
    subtotal: Math.round(subtotal * 100) / 100,
    surgeFee: Math.round(surgeFee * 100) / 100,
    surgeMultiplier,
    total: Math.round(total * 100) / 100,
  };
};

/* ---------------------------------------------
   Helpers: normalize backend field names
---------------------------------------------- */
const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null);

const toNum = (v) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
};

const normalizeRide = (ride) => {
  if (!ride) return null;

  const pickupLat = toNum(firstDefined(ride.pickupLat, ride.pickup_lat, ride.pickup_latitude, ride.pickup?.lat));
  const pickupLng = toNum(firstDefined(ride.pickupLng, ride.pickup_lng, ride.pickup_longitude, ride.pickup?.lng));
  const destinationLat = toNum(firstDefined(ride.destinationLat, ride.destination_lat, ride.destination?.lat));
  const destinationLng = toNum(firstDefined(ride.destinationLng, ride.destination_lng, ride.destination?.lng));

  const driverLoc =
    ride.driver_location ||
    ride.driverLocation ||
    ride.driver_info?.location ||
    ride.driver_info?.driver_location ||
    ride.driverInfo?.location;

  const driverLat = toNum(firstDefined(driverLoc?.lat, driverLoc?.latitude, ride.driver_lat, ride.driverLat));
  const driverLng = toNum(firstDefined(driverLoc?.lng, driverLoc?.longitude, ride.driver_lng, ride.driverLng));

  return {
    ...ride,
    id: firstDefined(ride.id, ride.ride_id),
    pickupLat,
    pickupLng,
    destinationLat,
    destinationLng,
    driver_location:
      driverLat !== null && driverLng !== null ? { lat: driverLat, lng: driverLng } : (ride.driver_location || null),
  };
};

/* ---------------------------------------------
   Google Maps loader (stable)
---------------------------------------------- */
const useGoogleMapsLoader = () => {
  const [mapsLoaded, setMapsLoaded] = useState(!!window.google?.maps);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;

    if (window.google?.maps) {
      setMapsLoaded(true);
      return;
    }

    const existing = document.querySelector("script[data-google-maps='1']");
    if (existing) {
      existing.addEventListener("load", () => setMapsLoaded(true));
      return;
    }

    const script = document.createElement("script");
    script.setAttribute("data-google-maps", "1");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsLoaded(true);
    script.onerror = () => toast.error("Google Maps failed to load (check API key / billing / domain restrictions).");
    document.head.appendChild(script);
  }, []);

  return mapsLoaded;
};

/* ---------------------------------------------
   MapPicker (prevents grey map: forces resize + min height)
---------------------------------------------- */
const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation, mapsLoaded }) => {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const resizeObsRef = useRef(null);

  const [selected, setSelected] = useState(null);
  const [address, setAddress] = useState("");
  const [loadingGPS, setLoadingGPS] = useState(false);
  const { t } = useLanguage();

  const cleanup = useCallback(() => {
    try {
      resizeObsRef.current?.disconnect?.();
      resizeObsRef.current = null;

      if (markerRef.current && window.google?.maps?.event) window.google.maps.event.clearInstanceListeners(markerRef.current);
      if (mapRef.current && window.google?.maps?.event) window.google.maps.event.clearInstanceListeners(mapRef.current);
    } catch {}
    markerRef.current = null;
    mapRef.current = null;
  }, []);

  const reverseGeocode = useCallback(
    (lat, lng) => {
      if (!mapsLoaded || !window.google?.maps) return;
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === "OK" && results?.[0]) setAddress(results[0].formatted_address);
      });
    },
    [mapsLoaded]
  );

  const setPosition = useCallback(
    (lat, lng) => {
      const pos = { lat, lng };
      setSelected(pos);
      if (markerRef.current) markerRef.current.setPosition(pos);
      if (mapRef.current) mapRef.current.setCenter(pos);
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (!mapsLoaded || !window.google?.maps || !mapDivRef.current) return;

    const init = () => {
      cleanup();

      const defaultCenter =
        initialLocation?.lat ? { lat: initialLocation.lat, lng: initialLocation.lng } : { lat: 41.7151, lng: 44.8271 };

      const map = new window.google.maps.Map(mapDivRef.current, {
        center: defaultCenter,
        zoom: 14,
        gestureHandling: "greedy",
        zoomControl: true,
        clickableIcons: false,
      });

      mapRef.current = map;

      const marker = new window.google.maps.Marker({
        map,
        draggable: true,
        position: defaultCenter,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#00ff88",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });

      markerRef.current = marker;

      map.addListener("click", (e) => setPosition(e.latLng.lat(), e.latLng.lng()));
      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        if (pos) setPosition(pos.lat(), pos.lng());
      });

      setSelected(defaultCenter);
      reverseGeocode(defaultCenter.lat, defaultCenter.lng);

      try {
        resizeObsRef.current = new ResizeObserver(() => {
          try {
            window.google.maps.event.trigger(map, "resize");
            const p = marker.getPosition();
            if (p) map.setCenter(p);
          } catch {}
        });
        resizeObsRef.current.observe(mapDivRef.current);
      } catch {}

      setTimeout(() => {
        try {
          window.google.maps.event.trigger(map, "resize");
          map.setCenter(defaultCenter);
        } catch {}
      }, 350);
    };

    const timer = setTimeout(init, 150);
    return () => clearTimeout(timer);
  }, [isOpen, mapsLoaded, initialLocation, cleanup, reverseGeocode, setPosition]);

  useEffect(() => {
    if (!isOpen) cleanup();
  }, [isOpen, cleanup]);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported on this device/browser");

    // Geolocation requires https (or localhost)
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return toast.error("GPS requires HTTPS (or localhost).");
    }

    setLoadingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPosition(lat, lng);
        mapRef.current?.setZoom(16);
        setLoadingGPS(false);
      },
      (err) => {
        const msg =
          err?.code === 1
            ? "Location permission denied"
            : err?.code === 2
            ? "Location unavailable (GPS off / no signal)"
            : err?.code === 3
            ? "Location request timed out"
            : "Could not get your location";
        toast.error(msg);
        setLoadingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const confirm = () => {
    if (!selected?.lat || !selected?.lng) return toast.error("Please select a location on the map");
    onLocationSelect({ address: address || "Selected Location", lat: selected.lat, lng: selected.lng });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black border border-[#00ff88]/30 w-[95vw] max-w-md h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 bg-black/80 z-20 w-full border-b border-[#00ff88]/20 flex-none flex flex-row items-center justify-between">
          <div className="flex flex-col">
            <DialogTitle className="text-[#00ff88] flex items-center">
              <MapPin className="w-5 h-5 mr-2" /> {title || t("select_location")}
            </DialogTitle>
            <DialogDescription className="text-gray-500 text-xs">Tap map or drag pin to select.</DialogDescription>
          </div>

          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:text-red-500 -mr-2" type="button">
            <X className="w-6 h-6" />
          </Button>
        </DialogHeader>

        <div className="flex-1 w-full relative min-h-[360px] bg-[#1a1a2e]">
          {!mapsLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Loading map…</div>
          ) : null}
          <div ref={mapDivRef} className="w-full h-full" />
        </div>

        <div className="w-full p-4 bg-black border-t border-[#00ff88]/30 flex flex-col gap-3 flex-none z-20">
          {address && (
            <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl p-3">
              <p className="text-[#00ff88] text-xs font-bold uppercase">Selected Address</p>
              <p className="text-white text-sm truncate">{address}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-[#00d4ff]/30 text-[#00d4ff] flex-1"
              onClick={getCurrentLocation}
              disabled={loadingGPS}
              type="button"
            >
              {loadingGPS ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crosshair className="w-4 h-4 mr-2" />}
              {t("gps_btn")}
            </Button>

            <Button className="flex-1 bg-[#00ff88] text-black font-bold" onClick={confirm} disabled={!selected?.lat} type="button">
              {t("confirm_location")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ---------------------------------------------
   LocationInput (NEW: clean “not-shit” bar + standard Autocomplete)
---------------------------------------------- */
const LocationInput = React.memo(({ value, onChange, placeholder, icon: Icon, iconColor, mapsLoaded }) => {
  const [showMapPicker, setShowMapPicker] = useState(false);
  const inputRef = useRef(null);
  const autoRef = useRef(null);

  const syncInputValue = useCallback((text) => {
    if (inputRef.current) inputRef.current.value = text || "";
  }, []);

  // keep input synced when parent changes (e.g. map picker)
  useEffect(() => {
    syncInputValue(value?.address || "");
  }, [value?.address, syncInputValue]);

  useEffect(() => {
    if (!mapsLoaded || !window.google?.maps || !inputRef.current) return;

    // avoid double init
    if (autoRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry", "name"],
      // optional restriction:
      // componentRestrictions: { country: "ge" },
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const addr = place?.formatted_address || place?.name || inputRef.current?.value || "";
      const lat = place?.geometry?.location?.lat?.();
      const lng = place?.geometry?.location?.lng?.();

      if (lat && lng) {
        onChange({ address: addr, lat, lng });
      } else {
        // fallback if user typed something weird
        onChange({ address: addr, lat: null, lng: null });
      }
    });

    autoRef.current = ac;
  }, [mapsLoaded, onChange]);

  const manualGeocode = async () => {
    const text = inputRef.current?.value?.trim();
    if (!text) return;

    if (!mapsLoaded || !window.google?.maps) {
      onChange({ address: text, lat: null, lng: null });
      return;
    }

    try {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: text }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          const r = results[0];
          const lat = r.geometry.location.lat();
          const lng = r.geometry.location.lng();
          const addr = r.formatted_address;
          syncInputValue(addr);
          onChange({ address: addr, lat, lng });
        } else {
          toast.error("Address not found. Try selecting from the dropdown.");
          onChange({ address: text, lat: null, lng: null });
        }
      });
    } catch {
      toast.error("Could not search address");
    }
  };

  const handleGPS = () => {
    if (!navigator.geolocation) return toast.error("GPS not supported");

    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return toast.error("GPS requires HTTPS (or localhost).");
    }

    toast.info("Locating…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (!mapsLoaded || !window.google?.maps) {
          const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          syncInputValue(fallback);
          onChange({ address: fallback, lat, lng });
          return;
        }

        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          const addr = status === "OK" && results?.[0] ? results[0].formatted_address : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          syncInputValue(addr);
          onChange({ address: addr, lat, lng });
          toast.success("Location found");
        });
      },
      () => toast.error("Could not get location"),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  return (
    <div className="relative">
      {/* nice input */}
      <div className="relative">
        <div className="absolute left-3 top-3.5 z-20 pointer-events-none">
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>

        <Input
          ref={inputRef}
          placeholder={placeholder}
          className="
            bg-[#0b0b12]/80 text-white
            border border-[#00ff88]/30
            rounded-xl h-12
            pl-11 pr-20
            focus-visible:ring-0 focus-visible:ring-offset-0
            focus:border-[#00ff88]
          "
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              manualGeocode();
            }
          }}
          onBlur={() => {
            // keep address text even if not selected
            const text = inputRef.current?.value?.trim();
            if (text && text !== (value?.address || "")) onChange({ address: text, lat: value?.lat || null, lng: value?.lng || null });
          }}
        />

        {/* right buttons */}
        <div className="absolute right-2 top-2 z-20 flex gap-1 bg-black/50 rounded-lg p-0.5 border border-white/10">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#00ff88] hover:bg-[#00ff88]/20 rounded"
            onClick={handleGPS}
            title="Current Location"
          >
            <Crosshair className="w-4 h-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#00d4ff] hover:bg-[#00d4ff]/20 rounded"
            onClick={() => setShowMapPicker(true)}
            title="Pick on Map"
          >
            <Target className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <MapPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onLocationSelect={(loc) => {
          syncInputValue(loc.address);
          onChange(loc);
        }}
        title={placeholder}
        initialLocation={value?.lat ? { lat: value.lat, lng: value.lng } : null}
        mapsLoaded={mapsLoaded}
      />
    </div>
  );
});

/* ---------------------------------------------
   LiveTrackingMap
---------------------------------------------- */
const LiveTrackingMap = ({ mapsLoaded, pickup, destination, driverLocation, status }) => {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const rendererRef = useRef(null);
  const [eta, setEta] = useState(null);

  useEffect(() => {
    if (!mapsLoaded || !window.google?.maps || !mapDivRef.current) return;

    const center = driverLocation?.lat ? driverLocation : pickup?.lat ? pickup : { lat: 41.7151, lng: 44.8271 };

    const map = new window.google.maps.Map(mapDivRef.current, {
      zoom: 14,
      center,
      disableDefaultUI: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
      ],
    });

    mapRef.current = map;

    rendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5 },
    });

    setTimeout(() => {
      try {
        window.google.maps.event.trigger(map, "resize");
        map.setCenter(center);
      } catch {}
    }, 60);
  }, [mapsLoaded]);

  useEffect(() => {
    if (!mapsLoaded || !window.google?.maps || !rendererRef.current) return;

    const start = driverLocation?.lat ? driverLocation : pickup?.lat ? pickup : null;
    const end = status === "in_progress" ? (destination?.lat ? destination : null) : pickup?.lat ? pickup : null;

    if (!start?.lat || !start?.lng || !end?.lat || !end?.lng) return;

    const svc = new window.google.maps.DirectionsService();
    svc.route(
      {
        origin: new window.google.maps.LatLng(start.lat, start.lng),
        destination: new window.google.maps.LatLng(end.lat, end.lng),
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (res, stat) => {
        if (stat === "OK" && res?.routes?.[0]?.legs?.[0]) {
          rendererRef.current.setDirections(res);
          setEta(res.routes[0].legs[0].duration?.text || null);
        }
      }
    );
  }, [mapsLoaded, pickup, destination, driverLocation, status]);

  return (
    <div className="relative w-full h-[320px] rounded-xl overflow-hidden border border-[#00ff88]/30 mt-4 mb-4">
      <style>{globalCss}</style>
      <div ref={mapDivRef} className="w-full h-full" />
      {eta && (
        <div className="absolute top-4 right-4 bg-black/80 border border-[#00ff88] px-4 py-2 rounded-lg backdrop-blur-md z-10 shadow-[0_0_15px_rgba(0,255,136,0.3)]">
          <p className="text-[#00ff88] font-bold text-xl">{eta}</p>
          <p className="text-[10px] text-white uppercase tracking-wider">Estimated Arrival</p>
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------
   ChatInterface (server: /rides/{id}/chat)
---------------------------------------------- */
const ChatInterface = ({ rideId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const { user } = useAuth();
  const { t } = useLanguage();

  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.get(`/rides/${rideId}/chat`);
      setMessages(res.data?.messages || []);
      await api.post(`/rides/${rideId}/chat/read`);
    } catch {}
  }, [rideId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await api.post(`/rides/${rideId}/chat`, { message: newMessage });
      setNewMessage("");
      fetchMessages();
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black">
        {messages.length === 0 && <p className="text-gray-500 text-center mt-10">{t("no_messages")}</p>}
        {messages.map((msg) => (
          <div key={msg.id || `${msg.sender_id}-${msg.timestamp || msg.created_at}`} className={`flex ${msg.sender_id === user.id ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl p-3 ${msg.sender_id === user.id ? "bg-[#00ff88] text-black" : "bg-[#1a1a2e] text-white"}`}>
              <p className="text-sm">{msg.message}</p>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={sendMessage} className="p-4 border-t border-[#00ff88]/20 flex gap-2">
        <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={t("type_message")} className="bg-black text-white" />
        <Button type="submit" disabled={sending} className="bg-[#00ff88] text-black">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
};

/* ---------------------------------------------
   RiderAuth (FIX: separate login/register payloads)
---------------------------------------------- */
const RiderAuth = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const [loginData, setLoginData] = useState({ cellphone: "", password: "" });
  const [registerData, setRegisterData] = useState({ name: "", surname: "", cellphone: "", password: "", email: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const res = await api.post("/auth/login", loginData);
        if (res.data?.token && res.data?.user) {
          login(res.data.token, res.data.user);
          toast.success(t("login_welcome"));
          navigate("/rider/dashboard");
        } else {
          toast.error("Invalid response from server");
        }
      } else {
        const payload = {
          name: registerData.name,
          surname: registerData.surname,
          cellphone: registerData.cellphone,
          password: registerData.password,
          email: registerData.email || undefined,
        };
        const res = await api.post("/auth/register/rider", payload);
        if (res.data?.token && res.data?.user) {
          login(res.data.token, res.data.user);
          toast.success("Account created!");
          navigate("/rider/dashboard");
        } else {
          toast.error("Invalid response from server");
        }
      }
    } catch (error) {
      const msg = error?.response?.data?.detail || error?.response?.data || "Authentication failed";
      toast.error(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <Card className="w-full max-w-md bg-black/70 backdrop-blur-xl border border-[#00ff88]/30 relative">
        <CardHeader className="text-center">
          <Button variant="ghost" className="absolute left-4 top-4 text-[#00ff88] hover:text-white" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> {t("back_btn")}
          </Button>

          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-10 h-10 text-black" />
          </div>

          <CardTitle className="text-2xl text-[#00ff88]">{isLogin ? t("login_welcome") : t("join_taksi")}</CardTitle>
          <CardDescription className="text-[#00d4ff]/70">{isLogin ? t("login_subtitle") : t("join_subtitle")}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#00ff88]">{t("first_name")}</Label>
                    <Input
                      value={registerData.name}
                      onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                      className="bg-black/50 border-[#00ff88]/30 text-white"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#00ff88]">{t("last_name")}</Label>
                    <Input
                      value={registerData.surname}
                      onChange={(e) => setRegisterData({ ...registerData, surname: e.target.value })}
                      className="bg-black/50 border-[#00ff88]/30 text-white"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[#00ff88]">Email (optional)</Label>
                  <Input
                    value={registerData.email}
                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    className="bg-black/50 border-[#00ff88]/30 text-white"
                    placeholder="you@email.com"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label className="text-[#00ff88]">{t("phone_number")}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />
                <Input
                  type="tel"
                  value={isLogin ? loginData.cellphone : registerData.cellphone}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isLogin) setLoginData({ ...loginData, cellphone: v });
                    else setRegisterData({ ...registerData, cellphone: v });
                  }}
                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[#00ff88]">{t("password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />
                <Input
                  type="password"
                  value={isLogin ? loginData.password : registerData.password}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isLogin) setLoginData({ ...loginData, password: v });
                    else setRegisterData({ ...registerData, password: v });
                  }}
                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isLogin ? t("sign_in_btn") : t("create_account_btn")}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <Button variant="link" className="text-[#00d4ff]" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? t("need_account") : t("have_account")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

/* ---------------------------------------------
   RiderDashboard (aligned to server.py)
---------------------------------------------- */
const RiderDashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const mapsLoaded = useGoogleMapsLoader();

  const [activeTab, setActiveTab] = useState("book");
  const [loading, setLoading] = useState(false);

  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [waitTime, setWaitTime] = useState(0);

  const pollRef = useRef(null);

  const [pickup, setPickup] = useState({ address: "", lat: null, lng: null });
  const [destination, setDestination] = useState({ address: "", lat: null, lng: null });
  const [stops, setStops] = useState([]);
  const [carType, setCarType] = useState("economy");
  const [paymentMethod, setPaymentMethod] = useState("cash"); // server expects "cash" or "card"
  const [topupAmount, setTopupAmount] = useState("");

  const [routeInfo, setRouteInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [surgeInfo, setSurgeInfo] = useState(null);

  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [completedRideInfo, setCompletedRideInfo] = useState(null);

  // stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Wait timer (arrived)
  useEffect(() => {
    let interval;
    if (activeRide?.status === "arrived" && activeRide?.arrived_at) {
      const arrivalTime = new Date(activeRide.arrived_at).getTime();
      interval = setInterval(() => {
        const diffMinutes = Math.floor((Date.now() - arrivalTime) / 60000);
        setWaitTime(diffMinutes > 0 ? diffMinutes : 0);
      }, 1000);
    } else {
      setWaitTime(0);
    }
    return () => clearInterval(interval);
  }, [activeRide]);

  const fetchSurgeStatus = useCallback(async (lat, lng) => {
    try {
      const params = lat && lng ? `?lat=${lat}&lng=${lng}` : "";
      const res = await api.get(`/surge/status${params}`);
      setSurgeInfo(res.data);
    } catch {}
  }, []);

  const calculateRoute = useCallback(async () => {
    if (!mapsLoaded || !window.google?.maps) return;
    if (!pickup?.lat || !pickup?.lng || !destination?.lat || !destination?.lng) return;

    const directionsService = new window.google.maps.DirectionsService();
    const waypoints = stops
      .filter((s) => s?.lat && s?.lng)
      .map((s) => ({ location: new window.google.maps.LatLng(s.lat, s.lng), stopover: true }));

    directionsService.route(
      {
        origin: new window.google.maps.LatLng(pickup.lat, pickup.lng),
        destination: new window.google.maps.LatLng(destination.lat, destination.lng),
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === "OK" && result?.routes?.[0]?.legs) {
          let totalDistance = 0;
          let totalDuration = 0;
          result.routes[0].legs.forEach((leg) => {
            totalDistance += leg.distance.value;
            totalDuration += leg.duration.value;
          });
          setRouteInfo({
            distance: Math.round(totalDistance / 100) / 10, // km
            duration: Math.round(totalDuration / 60), // min
          });
        }
      }
    );
  }, [mapsLoaded, pickup, destination, stops]);

  const fetchActiveRide = useCallback(async () => {
    try {
      const res = await api.get("/rider/active-ride");
      const ride = normalizeRide(res.data);
      if (ride?.id) {
        setActiveRide(ride);
        setActiveTab("active");
        pollRideStatus(ride.id);
      }
    } catch {}
  }, []);

  const fetchRideHistory = useCallback(async () => {
    try {
      const res = await api.get("/rider/history");
      setRideHistory(res.data?.rides || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
    fetchSurgeStatus();
  }, [fetchActiveRide, fetchRideHistory, fetchSurgeStatus]);

  useEffect(() => {
    if (pickup?.lat && pickup?.lng) fetchSurgeStatus(pickup.lat, pickup.lng);
  }, [pickup?.lat, pickup?.lng, fetchSurgeStatus]);

  useEffect(() => {
    if (mapsLoaded && pickup?.lat && destination?.lat) calculateRoute();
  }, [mapsLoaded, pickup, destination, stops, calculateRoute]);

  useEffect(() => {
    if (!routeInfo) return;
    const surge = surgeInfo?.multiplier || 1.0;
    const fare = calculateFare(carType, routeInfo.distance, waitTime, 0, stops.length, surge);
    setFareEstimate(fare);
  }, [routeInfo, carType, stops.length, surgeInfo, waitTime]);

  const addStop = () => {
    if (stops.length >= 3) return toast.error("Maximum 3 stops allowed");
    setStops([...stops, { address: "", lat: null, lng: null, order: stops.length }]);
  };

  const updateStop = (index, data) => {
    const next = [...stops];
    next[index] = { ...next[index], ...data, order: index };
    setStops(next);
  };

  const removeStop = (index) => setStops(stops.filter((_, i) => i !== index));

  const pollRideStatus = (rideId) => {
    if (!rideId) return;
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/rides/${rideId}`);
        const ride = normalizeRide(res.data);
        setActiveRide(ride);

        if (["completed", "cancelled", "no_drivers"].includes(ride.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;

          if (ride.status === "completed") {
            setCompletedRideInfo(ride);
            setShowRatingModal(true);
            fetchRideHistory();
          } else if (ride.status === "no_drivers") {
            toast.error("No drivers available. You can retry.");
            setActiveRide(ride);
          } else {
            toast.info(t("ride_cancelled"));
            setActiveRide(null);
          }
        }
      } catch (error) {
        if (error?.response?.status === 404 && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 3000);
  };

  const handleBookRide = async ({ paymentOrderId = null } = {}) => {
    if (!pickup?.lat || !pickup?.lng || !pickup?.address) return toast.error("Please select pickup location");

    setLoading(true);
    try {
      const rideData = {
        pickup: pickup.address,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        destination: destination?.address || null,
        destinationLat: destination?.lat || null,
        destinationLng: destination?.lng || null,
        stops: stops.filter((s) => s?.lat && s?.lng).map((s, i) => ({ address: s.address, lat: s.lat, lng: s.lng, order: i })),
        carType,
        paymentMethod, // alias in server is paymentMethod
        paymentOrderId: paymentOrderId || null, // alias in server is paymentOrderId
        estimatedDistance: routeInfo?.distance || 5,
        estimatedDuration: routeInfo?.duration || 15,
      };

      const res = await api.post("/rides/request", rideData);

      toast.success(t("searching_driver"));

      const tempRide = normalizeRide({
        id: res.data?.ride_id,
        status: "searching",
        estimated_fare: res.data?.estimated_fare,
        fare_breakdown: res.data?.fare_breakdown,
        pickup: rideData.pickup,
        destination: rideData.destination,
        pickupLat: rideData.pickupLat,
        pickupLng: rideData.pickupLng,
        destinationLat: rideData.destinationLat,
        destinationLng: rideData.destinationLng,
      });

      setActiveRide(tempRide);
      setActiveTab("active");
      pollRideStatus(res.data?.ride_id);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to request ride");
    } finally {
      setLoading(false);
    }
  };

  const handleWalletTopUp = async (details) => {
    const amount = parseFloat(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    try {
      await api.post("/rider/wallet/topup", { amount, reference: details.orderID });
      updateUser({ ...user, wallet_balance: (user.wallet_balance || 0) + amount });
      toast.success(`Success! ₾${amount} added to wallet.`);
      setTopupAmount("");
    } catch {
      toast.error("Top up failed");
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide?.id) return;
    try {
      await api.post(`/rides/${activeRide.id}/cancel`);
      if (pollRef.current) clearInterval(pollRef.current);
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
      toast.success("Searching again...");
      setActiveRide((prev) =>
        normalizeRide({
          ...(prev || {}),
          id: prev?.id,
          status: "searching",
          matching_status: "Retrying - Searching within 3km",
        })
      );
      pollRideStatus(activeRide.id);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to retry ride");
    }
  };

  const submitRating = async () => {
    if (!completedRideInfo?.id) return;
    if (!rating) return toast.error("Please select a rating");
    try {
      await api.post(`/rides/${completedRideInfo.id}/rate-rider`, { rating, review });
      toast.success(t("submit_feedback"));
      setShowRatingModal(false);
      setRating(0);
      setReview("");
    } catch {
      toast.error("Failed to submit rating");
    }
  };

  const carTypes = useMemo(
    () =>
      Object.entries(PRICING_RULES).map(([key, val]) => ({
        value: key,
        label: t(val.key),
        icon: val.icon,
        base: val.base,
      })),
    [t]
  );

  const statusColors = {
    searching: "bg-yellow-500 text-black",
    accepted: "bg-blue-500 text-white",
    arrived: "bg-purple-500 text-white",
    in_progress: "bg-[#00ff88] text-black",
    completed: "bg-green-600 text-white",
    cancelled: "bg-red-500 text-white",
    no_drivers: "bg-gray-500 text-white",
  };

  const rideForUI = normalizeRide(activeRide);

  const pickupPoint = rideForUI?.pickupLat ? { lat: rideForUI.pickupLat, lng: rideForUI.pickupLng } : null;
  const destinationPoint = rideForUI?.destinationLat ? { lat: rideForUI.destinationLat, lng: rideForUI.destinationLng } : null;
  const driverPoint = rideForUI?.driver_location?.lat ? rideForUI.driver_location : null;

  // PayPal currency (configurable)
  const PAYPAL_CURRENCY = import.meta.env.VITE_PAYPAL_CURRENCY || "USD";
  const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || "test";

  return (
    <div className="min-h-screen bg-black">
      <style>{globalCss}</style>

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
              <p className="text-[#00d4ff]/60 text-sm">Balance: ₾{user?.wallet_balance?.toFixed?.(2) || "0.00"}</p>
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
        <PayPalScriptProvider options={{ "client-id": PAYPAL_CLIENT_ID, currency: PAYPAL_CURRENCY }}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00ff88]/20 mb-6">
              <TabsTrigger value="book" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
                <Car className="w-4 h-4 sm:mr-2" /> {t("tab_book")}
              </TabsTrigger>
              <TabsTrigger value="active" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
                <Navigation className="w-4 h-4 sm:mr-2" /> {t("tab_ride")}
              </TabsTrigger>
              <TabsTrigger value="wallet" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
                <Wallet className="w-4 h-4 sm:mr-2" /> {t("tab_pay")}
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
                <History className="w-4 h-4 sm:mr-2" /> {t("tab_hist")}
              </TabsTrigger>
              <TabsTrigger value="profile" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm">
                <User className="w-4 h-4 sm:mr-2" /> {t("tab_prof")}
              </TabsTrigger>
            </TabsList>

            {/* BOOK */}
            <TabsContent value="book">
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
                <CardHeader>
                  <CardTitle className="text-[#00ff88] flex items-center">
                    <Rocket className="w-5 h-5 mr-2" /> {t("book_your_ride")}
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[#00ff88]">{t("pickup_label")}</Label>
                    <LocationInput value={pickup} onChange={setPickup} placeholder={t("current_location")} icon={MapPin} iconColor="text-[#00ff88]" mapsLoaded={mapsLoaded} />
                  </div>

                  {stops.map((stop, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-yellow-400">
                          {t("stop_label")} {index + 1}
                        </Label>
                        <Button variant="ghost" size="sm" className="text-red-400 h-6" onClick={() => removeStop(index)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <LocationInput
                        value={stop}
                        onChange={(data) => updateStop(index, data)}
                        placeholder={`${t("stop_label")} ${index + 1}`}
                        icon={MapPin}
                        iconColor="text-yellow-400"
                        mapsLoaded={mapsLoaded}
                      />
                    </div>
                  ))}

                  {stops.length < 3 && (
                    <Button variant="outline" className="w-full border-dashed border-yellow-400/30 text-yellow-400" onClick={addStop}>
                      <Plus className="w-4 h-4 mr-2" /> {t("add_stop")}
                    </Button>
                  )}

                  <div className="space-y-2">
                    <Label className="text-[#00d4ff]">{t("destination_label")}</Label>
                    <LocationInput value={destination} onChange={setDestination} placeholder={t("where_to")} icon={Navigation} iconColor="text-[#00d4ff]" mapsLoaded={mapsLoaded} />
                  </div>

                  {Boolean((surgeInfo?.multiplier || 1) > 1 || surgeInfo?.is_surge) && (
                    <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-400 font-bold">Surge Pricing Active</p>
                          <p className="text-orange-300/70 text-sm">{surgeInfo?.surge_reason || "High demand / traffic"}</p>
                        </div>
                        <Badge className="bg-orange-500 text-black text-lg px-3 py-1">x{surgeInfo?.multiplier || 1.0}</Badge>
                      </div>
                    </div>
                  )}

                  {routeInfo && fareEstimate && (
                    <div className="bg-[#1a1a2e] border border-[#00ff88]/30 rounded-xl overflow-hidden">
                      <div className="bg-[#00ff88]/10 p-3 flex justify-between items-center border-b border-[#00ff88]/10">
                        <span className="text-[#00ff88] text-sm font-bold flex items-center">
                          <TrendingUp className="w-4 h-4 mr-2" /> {t("fare_breakdown")}
                        </span>
                        <span className="text-white text-xs opacity-70">
                          {routeInfo.distance}km • {routeInfo.duration}min
                        </span>
                      </div>

                      <div className="p-4 space-y-2 text-sm">
                        <div className="flex justify-between text-gray-400">
                          <span>{t("base_fare")}</span>
                          <span>₾{fareEstimate.base.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>
                            {t("mileage")} ({routeInfo.distance}km)
                          </span>
                          <span>₾{fareEstimate.distance.toFixed(2)}</span>
                        </div>

                        {fareEstimate.surgeFee > 0 && (
                          <div className="flex justify-between text-orange-400 font-bold bg-orange-500/10 p-1 rounded">
                            <span className="flex items-center">
                              <Zap className="w-3 h-3 mr-1" /> {t("traffic_surge")}
                            </span>
                            <span>+₾{fareEstimate.surgeFee.toFixed(2)}</span>
                          </div>
                        )}

                        <div className="my-2 border-t border-gray-700" />

                        <div className="flex justify-between items-center">
                          <span className="text-white font-bold">{t("total_estimate")}</span>
                          <span className="text-[#00ff88] text-xl font-bold">₾{fareEstimate.total.toFixed(2)}</span>
                        </div>

                        {PAYPAL_CURRENCY !== "GEL" && paymentMethod === "card" && (
                          <p className="text-[11px] text-gray-400 mt-2">
                            PayPal currency is set to <b>{PAYPAL_CURRENCY}</b>. If you want GEL, set <code>VITE_PAYPAL_CURRENCY=GEL</code> (only if PayPal supports it on your account).
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    {carTypes.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setCarType(type.value)}
                        className={`p-2 rounded-xl border transition-all flex flex-col items-center ${
                          carType === type.value ? "border-[#00ff88] bg-[#00ff88]/20" : "border-gray-700 bg-black"
                        }`}
                        type="button"
                      >
                        <span className="text-xl">{type.icon}</span>
                        <span className="text-white text-xs mt-1">{type.label}</span>
                        <span className="text-[#00ff88] text-xs font-bold mt-1">
                          {routeInfo
                            ? `₾${calculateFare(type.value, routeInfo.distance, 0, 0, 0, surgeInfo?.multiplier || 1.0).total.toFixed(0)}`
                            : `₾${type.base}`}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={paymentMethod === "cash" ? "default" : "outline"}
                      onClick={() => setPaymentMethod("cash")}
                      className={`w-1/2 ${paymentMethod === "cash" ? "bg-[#00ff88] text-black" : "border-[#00ff88]/30 text-white"}`}
                      type="button"
                    >
                      💵 {t("cash")}
                    </Button>
                    <Button
                      variant={paymentMethod === "card" ? "default" : "outline"}
                      onClick={() => setPaymentMethod("card")}
                      className={`w-1/2 ${paymentMethod === "card" ? "bg-[#00d4ff] text-black" : "border-[#00d4ff]/30 text-white"}`}
                      type="button"
                    >
                      💳 {t("paypal")}
                    </Button>
                  </div>

                  {paymentMethod === "card" ? (
                    <div className="mt-4 p-2 bg-white rounded-xl">
                      <PayPalButtons
                        style={{ layout: "vertical", shape: "rect" }}
                        disabled={!fareEstimate || !pickup?.lat}
                        forceReRender={[fareEstimate?.total, PAYPAL_CURRENCY]}
                        createOrder={async (data, actions) =>
                          actions.order.create({
                            purchase_units: [{ amount: { value: String(fareEstimate?.total || 0), currency_code: PAYPAL_CURRENCY } }],
                          })
                        }
                        onApprove={async (data, actions) => {
                          await actions.order.capture();
                          await handleBookRide({ paymentOrderId: data.orderID });
                        }}
                      />
                    </div>
                  ) : (
                    <Button
                      className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold text-lg py-6 mt-4 shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all"
                      onClick={() => handleBookRide({ paymentOrderId: null })}
                      disabled={loading || !pickup?.lat}
                      type="button"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : t("request_ride_btn")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ACTIVE */}
            <TabsContent value="active">
              {rideForUI?.id ? (
                <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30 overflow-hidden">
                  {["accepted", "arrived", "in_progress"].includes(rideForUI.status) && (
                    <LiveTrackingMap mapsLoaded={mapsLoaded} pickup={pickupPoint} destination={destinationPoint} driverLocation={driverPoint} status={rideForUI.status} />
                  )}

                  <CardContent className="space-y-4 pt-4">
                    <div className="flex justify-between items-center mb-2">
                      <Badge className={`${statusColors[rideForUI.status]} text-sm px-3 py-1`}>{String(rideForUI.status || "").replace(/_/g, " ").toUpperCase()}</Badge>
                      <div className="text-right">
                        <p className="text-gray-400 text-xs">{t("otp_code")}</p>
                        <p className="text-[#00ff88] font-mono font-bold text-lg tracking-widest">{rideForUI.otp || "----"}</p>
                      </div>
                    </div>

                    {rideForUI.status === "searching" && (
                      <div className="bg-yellow-500/20 border border-yellow-500 p-4 rounded-xl space-y-2">
                        <div className="flex items-center">
                          <Loader2 className="w-5 h-5 animate-spin mr-3 text-yellow-400" />
                          <span className="text-yellow-400 font-medium">{rideForUI.matching_status || "Searching for drivers..."}</span>
                        </div>

                        {Number(rideForUI.drivers_notified_count) > 0 && (
                          <p className="text-yellow-400/70 text-sm pl-8">{rideForUI.drivers_notified_count} drivers notified</p>
                        )}
                      </div>
                    )}

                    {rideForUI.status === "no_drivers" && (
                      <div className="bg-gray-500/20 border border-gray-500 p-4 rounded-xl space-y-3">
                        <div className="flex items-center text-gray-300">
                          <Target className="w-5 h-5 mr-2" />
                          <span className="font-medium">No drivers available</span>
                        </div>

                        <p className="text-gray-400 text-sm">All nearby drivers are busy. You can retry now or book a new ride.</p>

                        <div className="flex gap-2">
                          <Button className="flex-1 bg-[#00ff88] text-black font-bold" onClick={handleRetryRide} type="button">
                            Retry Search
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

                    {rideForUI.driver_info && (
                      <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#00d4ff]/20 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 bg-[#00d4ff]/10 rounded-bl-xl text-[#00d4ff] text-xs font-bold">
                          {rideForUI.driver_info.car_make} {rideForUI.driver_info.car_model}
                        </div>

                        <div className="flex items-center gap-4 mt-2">
                          <div className="w-16 h-16 rounded-full bg-gray-700 border-2 border-[#00ff88] flex items-center justify-center overflow-hidden">
                            <User className="w-8 h-8 text-gray-400" />
                          </div>

                          <div className="flex-1">
                            <h3 className="text-white font-bold text-lg">{rideForUI.driver_info.name}</h3>
                            <div className="flex items-center text-yellow-400 text-sm">
                              <Star size={14} fill="currentColor" className="mr-1" /> {Number(rideForUI.driver_info.rating || 5.0).toFixed(1)}
                            </div>
                            <div className="mt-2 bg-white text-black font-mono font-bold px-3 py-1 rounded inline-block border-l-4 border-blue-600">
                              {rideForUI.driver_info.license_plate}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button size="icon" className="rounded-full bg-[#00ff88] text-black hover:bg-[#00ff88]/80" type="button">
                              <Phone size={18} />
                            </Button>

                            <Sheet>
                              <SheetTrigger asChild>
                                <Button size="icon" className="rounded-full bg-[#00d4ff] text-black hover:bg-[#00d4ff]/80 relative" type="button">
                                  <MessageSquare size={18} />
                                </Button>
                              </SheetTrigger>
                              <SheetContent side="bottom" className="h-[80vh] bg-black border-t border-[#00ff88]/30">
                                <ChatInterface rideId={rideForUI.id} />
                              </SheetContent>
                            </Sheet>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4 px-2 relative">
                      <div className="absolute left-[19px] top-3 bottom-8 w-0.5 bg-gray-700" />
                      <div className="flex gap-3 relative z-10">
                        <div className="w-4 h-4 rounded-full bg-[#00ff88] mt-1 shadow-[0_0_10px_#00ff88]" />
                        <div>
                          <p className="text-xs text-gray-500">{t("pickup_label")}</p>
                          <p className="text-white text-sm">{rideForUI.pickup}</p>
                        </div>
                      </div>
                      <div className="flex gap-3 relative z-10">
                        <div className="w-4 h-4 rounded-full bg-[#00d4ff] mt-1 shadow-[0_0_10px_#00d4ff]" />
                        <div>
                          <p className="text-xs text-gray-500">{t("destination_label")}</p>
                          <p className="text-white text-sm">{rideForUI.destination || t("where_to")}</p>
                        </div>
                      </div>
                    </div>

                    {["searching", "accepted"].includes(rideForUI.status) && (
                      <Button variant="ghost" className="w-full text-red-500 hover:text-red-400 hover:bg-red-500/10 mt-4" onClick={handleCancelRide} type="button">
                        {t("cancel_ride")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-center py-12">
                  <Navigation className="w-20 h-20 mx-auto text-[#00ff88]/30 mb-4" />
                  <p className="text-[#00ff88]/60 text-lg">No active ride</p>
                  <Button className="mt-6 bg-[#00ff88] text-black font-bold" onClick={() => setActiveTab("book")} type="button">
                    {t("book_your_ride")}
                  </Button>
                </Card>
              )}
            </TabsContent>

            {/* WALLET */}
            <TabsContent value="wallet">
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30">
                <CardHeader>
                  <CardTitle className="text-[#00ff88]">{t("wallet_title")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center p-6 bg-[#00ff88]/10 rounded-xl border border-[#00ff88]/20">
                    <p className="text-sm text-gray-400 uppercase">{t("balance_label")}</p>
                    <p className="text-4xl font-bold text-[#00ff88]">₾{user?.wallet_balance?.toFixed?.(2) || "0.00"}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("add_money")}</Label>
                    <Input
                      type="number"
                      placeholder={t("enter_amount")}
                      value={topupAmount}
                      onChange={(e) => setTopupAmount(e.target.value)}
                      className="bg-black/50 border-[#00d4ff]/30 text-white"
                    />
                  </div>

                  {topupAmount && parseFloat(topupAmount) > 0 && (
                    <div className="bg-white p-2 rounded-lg">
                      <PayPalButtons
                        style={{ layout: "vertical", shape: "rect" }}
                        createOrder={(data, actions) =>
                          actions.order.create({
                            purchase_units: [{ amount: { value: String(topupAmount), currency_code: PAYPAL_CURRENCY } }],
                          })
                        }
                        onApprove={async (data, actions) => {
                          await actions.order.capture();
                          handleWalletTopUp(data);
                        }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* HISTORY */}
            <TabsContent value="history">
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
                <CardHeader>
                  <CardTitle className="text-[#00ff88]">{t("ride_history")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {rideHistory.length === 0 && <div className="text-center text-gray-500 py-8">{t("no_rides")}</div>}
                      {rideHistory.map((r) => (
                        <div key={r.id} className="bg-black/50 border border-[#00ff88]/10 rounded-xl p-4 space-y-2">
                          <div className="flex justify-between">
                            <Badge className={statusColors[r.status] || "bg-gray-500 text-white"}>{String(r.status || "").replace(/_/g, " ").toUpperCase()}</Badge>
                            <span className="text-gray-400 text-sm">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "N/A"}</span>
                          </div>
                          <div>
                            <p className="text-sm text-[#00ff88]/60">From: {r.pickup}</p>
                            <p className="text-sm text-[#00d4ff]/60">To: {r.destination || "Open"}</p>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 capitalize">{r.carType || r.car_type}</span>
                            <span className="text-[#00ff88] font-bold">₾{Number(r.final_fare || r.estimated_fare || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* PROFILE */}
            <TabsContent value="profile">
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
                <CardHeader>
                  <CardTitle className="text-[#00ff88]">{t("profile_title")}</CardTitle>
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
                      <p className="text-[#00ff88]/60 text-sm">{t("total_rides")}</p>
                    </div>
                    <div className="bg-black/50 border border-[#00ff88]/20 rounded-xl p-4 text-center">
                      <Star className="w-8 h-8 mx-auto text-yellow-400 mb-2" />
                      <p className="text-2xl font-bold">{Number(user?.rating || 5.0).toFixed(1)}</p>
                      <p className="text-[#00ff88]/60 text-sm">{t("rating_label")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* RATING MODAL */}
          <Dialog open={showRatingModal} onOpenChange={setShowRatingModal}>
            <DialogContent className="bg-[#1a1a2e] border border-[#00ff88]/20 text-white">
              <DialogHeader>
                <DialogTitle className="text-[#00ff88]">{t("rate_driver")}</DialogTitle>
              </DialogHeader>
              <DialogDescription className="text-gray-400">How was your ride with {completedRideInfo?.driver_info?.name}?</DialogDescription>

              <div className="flex justify-center space-x-2 my-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Button key={s} variant="ghost" onClick={() => setRating(s)} className={`p-1 hover:bg-transparent ${s <= rating ? "text-yellow-400" : "text-gray-600"}`} type="button">
                    <Star className={`w-8 h-8 ${s <= rating ? "fill-current" : ""}`} />
                  </Button>
                ))}
              </div>

              <textarea
                placeholder="Comments..."
                value={review}
                onChange={(e) => setReview(e.target.value)}
                className="w-full bg-black/50 text-white p-2 rounded border border-gray-700 min-h-[80px]"
              />

              <Button onClick={submitRating} className="w-full bg-[#00ff88] text-black mt-4 font-bold" type="button">
                {t("submit_feedback")}
              </Button>
            </DialogContent>
          </Dialog>
        </PayPalScriptProvider>
      </main>
    </div>
  );
};

/* ---------------------------------------------
   Main Router
---------------------------------------------- */
const RiderPortal = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.user_type !== "rider") {
    if (location.pathname === "/rider" || location.pathname === "/rider/") return <RiderAuth />;
    return <Navigate to="/rider" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/rider/dashboard" replace />} />
      <Route path="/dashboard" element={<RiderDashboard />} />
      <Route path="*" element={<Navigate to="/rider/dashboard" replace />} />
    </Routes>
  );
};

export default RiderPortal;
