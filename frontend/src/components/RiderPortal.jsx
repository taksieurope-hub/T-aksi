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
  Car, MapPin, Star, History, Home, LogOut, User,
  Phone, Lock, ArrowLeft, Navigation, Wallet, Loader2, Rocket,
  Plus, X, Target, Crosshair, Zap, TrendingUp, MessageSquare, Send
} from "lucide-react";

/* ---------------------------------------------
   Pricing rules
---------------------------------------------- */
const PRICING_RULES = {
  economy:  { key: "vehicle_economy",  base: 2.00, perKm: 0.50, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚗", longDist: 7.0,  veryLong: 30.0 },
  comfort:  { key: "vehicle_comfort",  base: 2.50, perKm: 0.55, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚙", longDist: 7.0,  veryLong: 30.0 },
  suv:      { key: "vehicle_suv",      base: 3.90, perKm: 0.80, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "🚐", longDist: 7.0,  veryLong: 30.0 },
  personal: { key: "vehicle_personal", base: 4.00, perKm: 0.70, perMinWait: 0.50, freeWait: 2,   stopFee: 0.00, icon: "👤", longDist: 7.0,  veryLong: 30.0 },
  jumpstart:{ key: "vehicle_jumpstart",base: 4.50, perKm: 0.00, perMinWait: 0.50, freeWait: 999, stopFee: 0.00, icon: "⚡", longDist: 999.0,veryLong: 999.0 }
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
    total: Math.round(total * 100) / 100
  };
};

/* ---------------------------------------------
   Helpers
---------------------------------------------- */
const firstDefined = (...vals) => vals.find(v => v !== undefined && v !== null);
const toNum = (v) => { const n = typeof v === "string" ? parseFloat(v) : v; return Number.isFinite(n) ? n : null; };
const normalizeRide = (ride) => {
  if (!ride) return null;
  const pickupLat = toNum(firstDefined(ride.pickupLat, ride.pickup_lat, ride.pickup_latitude, ride.pickup?.lat));
  const pickupLng = toNum(firstDefined(ride.pickupLng, ride.pickup_lng, ride.pickup_longitude, ride.pickup?.lng));
  const destinationLat = toNum(firstDefined(ride.destinationLat, ride.destination_lat, ride.destination?.lat));
  const destinationLng = toNum(firstDefined(ride.destinationLng, ride.destination_lng, ride.destination?.lng));
  const driverLoc = ride.driver_location || ride.driverLocation || ride.driver_info?.location;
  const driverLat = toNum(firstDefined(driverLoc?.lat, driverLoc?.latitude, ride.driver_lat));
  const driverLng = toNum(firstDefined(driverLoc?.lng, driverLoc?.longitude, ride.driver_lng));
  return {
    ...ride,
    id: firstDefined(ride.id, ride.ride_id),
    pickupLat, pickupLng, destinationLat, destinationLng,
    driver_location: (driverLat && driverLng) ? { lat: driverLat, lng: driverLng } : null,
  };
};

/* ---------------------------------------------
   Google Maps Loader
---------------------------------------------- */
const useGoogleMapsLoader = () => {
  const [mapsLoaded, setMapsLoaded] = useState(!!window.google?.maps);
  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return; }
    if (!GOOGLE_MAPS_API_KEY) return;
    const existing = document.querySelector("script[data-google-maps='1']");
    if (existing) { existing.addEventListener("load", () => setMapsLoaded(true)); return; }
    const script = document.createElement("script");
    script.dataset.googleMaps = "1";
    script.src = \https://maps.googleapis.com/maps/api/js?key=\&libraries=places,geometry\;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);
  return mapsLoaded;
};

const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect, mapsLoaded) => {
  useEffect(() => {
    if (!mapsLoaded || !inputRef.current || !window.google?.maps?.places) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "ge" },
      fields: ["formatted_address", "geometry", "name"]
    });
    const stopEnter = (e) => { if (e.key === "Enter") e.preventDefault(); };
    inputRef.current.addEventListener("keydown", stopEnter);
    const listener = ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place?.geometry?.location) return;
      onPlaceSelect({
        address: place.formatted_address || place.name || "",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng()
      });
    });
    return () => {
      try {
        inputRef.current?.removeEventListener("keydown", stopEnter);
        window.google?.maps?.event?.removeListener(listener);
      } catch {}
    };
  }, [mapsLoaded, inputRef, onPlaceSelect]);
};

/* ---------------------------------------------
   FIXED MapPicker (Cancel Button + Fixed Height)
---------------------------------------------- */
const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation, mapsLoaded }) => {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [address, setAddress] = useState("");
  const [loadingGPS, setLoadingGPS] = useState(false);
  const { t } = useLanguage();

  const reverseGeocode = useCallback((lat, lng) => {
    if (!mapsLoaded || !window.google?.maps) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results?.[0]) setAddress(results[0].formatted_address);
    });
  }, [mapsLoaded]);

  const setPosition = useCallback((lat, lng) => {
    const pos = { lat, lng };
    setSelected(pos);
    markerRef.current?.setPosition(pos);
    mapRef.current?.setCenter(pos);
    reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  useEffect(() => {
    if (!isOpen || !mapsLoaded || !mapDivRef.current) return;
    
    // Initialize Map
    const defaultCenter = initialLocation?.lat ? initialLocation : { lat: 41.7151, lng: 44.8271 };
    
    const map = new window.google.maps.Map(mapDivRef.current, {
      center: defaultCenter,
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] }
      ]
    });
    mapRef.current = map;

    const marker = new window.google.maps.Marker({
      map,
      draggable: true,
      position: defaultCenter,
      animation: window.google.maps.Animation.DROP,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#00ff88",
        fillOpacity: 1,
        strokeColor: "white",
        strokeWeight: 2,
      }
    });
    markerRef.current = marker;

    map.addListener("click", (e) => setPosition(e.latLng.lat(), e.latLng.lng()));
    marker.addListener("dragend", () => {
      const p = marker.getPosition();
      setPosition(p.lat(), p.lng());
    });

    if (initialLocation?.lat) {
        setPosition(initialLocation.lat, initialLocation.lng);
    } else {
        // Try getting location immediately on open if no initial pos
        navigator.geolocation.getCurrentPosition(
            (p) => setPosition(p.coords.latitude, p.coords.longitude),
            () => console.log("Auto-locate failed"),
            { timeout: 5000 }
        );
    }

  }, [isOpen, mapsLoaded]);

  const getCurrentLocation = () => {
    setLoadingGPS(true);
    if (!navigator.geolocation) {
        toast.error("Geolocation not supported");
        setLoadingGPS(false);
        return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition(pos.coords.latitude, pos.coords.longitude);
        setLoadingGPS(false);
        toast.success("Location found!");
      },
      (err) => {
        console.error("GPS Error", err);
        toast.error(\Location failed: \\);
        setLoadingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const confirm = () => {
    if (!selected?.lat) { toast.error("Please tap the map to select a point"); return; }
    onLocationSelect({ address: address || "Pinned Location", lat: selected.lat, lng: selected.lng });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black border border-[#00ff88]/30 w-[95vw] h-[85vh] max-w-md p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-4 bg-black z-10 border-b border-gray-800">
          <DialogTitle className="text-[#00ff88] flex items-center justify-between">
             <span>{title || t("select_location")}</span>
             <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400"><X className="w-5 h-5"/></Button>
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-xs">Tap map or use GPS button</DialogDescription>
        </DialogHeader>

        {/* FORCED HEIGHT CONTAINER */}
        <div className="flex-1 w-full relative bg-gray-900" style={{ minHeight: "300px" }}>
           {!mapsLoaded && <div className="absolute inset-0 flex items-center justify-center text-gray-500">Loading Maps...</div>}
           <div ref={mapDivRef} className="w-full h-full" style={{ height: "100%", width: "100%" }} />
        </div>

        <div className="p-4 bg-black border-t border-gray-800 flex flex-col gap-3">
           <p className="text-white text-xs truncate bg-gray-900 p-2 rounded border border-gray-700">
             {address || "No address selected"}
           </p>
           <div className="flex gap-2">
             <Button variant="outline" className="flex-1 border-[#00d4ff] text-[#00d4ff]" onClick={getCurrentLocation} disabled={loadingGPS}>
               {loadingGPS ? <Loader2 className="w-4 h-4 animate-spin"/> : <Crosshair className="w-4 h-4 mr-2"/>} GPS
             </Button>
             <Button className="flex-1 bg-[#00ff88] text-black font-bold" onClick={confirm}>Confirm</Button>
           </div>
           <Button variant="ghost" className="w-full text-red-400 h-8 text-xs" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LocationInput = React.memo(({ value, onChange, placeholder, icon: Icon, iconColor, mapsLoaded }) => {
  const inputRef = useRef(null);
  const [showMap, setShowMap] = useState(false);
  const [text, setText] = useState(value?.address || "");

  useEffect(() => { setText(value?.address || ""); }, [value?.address]);
  useGoogleMapsAutocomplete(inputRef, (place) => { setText(place.address); onChange(place); }, mapsLoaded);

  return (
    <>
      <div className="relative flex items-center mb-2">
        <Icon className={\bsolute left-3 h-4 w-4 \ z-20\} />
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); onChange({ ...value, address: e.target.value }); }}
          className="pl-10 pr-10 bg-black/50 border-[#00ff88]/30 text-white relative z-10"
          placeholder={placeholder}
        />
        <Button
          type="button" variant="ghost" size="icon"
          className="absolute right-1 text-[#00d4ff] z-20 hover:bg-[#00d4ff]/10"
          onClick={() => setShowMap(true)}
        >
          <Target className="w-4 h-4" />
        </Button>
      </div>
      {showMap && (
        <MapPicker
          isOpen={showMap}
          onClose={() => setShowMap(false)}
          onLocationSelect={onChange}
          title={placeholder}
          initialLocation={value?.lat ? { lat: value.lat, lng: value.lng } : null}
          mapsLoaded={mapsLoaded}
        />
      )}
    </>
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
    const center = driverLocation || pickup || { lat: 41.7151, lng: 44.8271 };
    const map = new window.google.maps.Map(mapDivRef.current, {
      zoom: 14, center, disableDefaultUI: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] }
      ]
    });
    mapRef.current = map;
    rendererRef.current = new window.google.maps.DirectionsRenderer({
      map, suppressMarkers: false, polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5 }
    });
  }, [mapsLoaded]);

  useEffect(() => {
    if (!mapsLoaded || !window.google?.maps || !rendererRef.current) return;
    const start = driverLocation || pickup;
    const end = status === "in_progress" ? destination : pickup;
    if (!start?.lat || !end?.lat) return;

    const svc = new window.google.maps.DirectionsService();
    svc.route(
      { origin: start, destination: end, travelMode: window.google.maps.TravelMode.DRIVING },
      (res, stat) => {
        if (stat === "OK") {
          rendererRef.current.setDirections(res);
          setEta(res.routes[0].legs[0].duration?.text || null);
        }
      }
    );
  }, [mapsLoaded, pickup, destination, driverLocation, status]);

  return (
    <div className="relative w-full h-[320px] rounded-xl overflow-hidden border border-[#00ff88]/30 mt-4 mb-4">
      <div ref={mapDivRef} className="w-full h-full" />
      {eta && (
        <div className="absolute top-4 right-4 bg-black/80 border border-[#00ff88] px-4 py-2 rounded-lg backdrop-blur-md z-10">
          <p className="text-[#00ff88] font-bold text-xl">{eta}</p>
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------
   ChatInterface
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
      const res = await api.get(\/rides/\/chat\);
      setMessages(res.data?.messages || []);
      await api.post(\/rides/\/chat/read\);
    } catch {}
  }, [rideId]);

  useEffect(() => { fetchMessages(); const i = setInterval(fetchMessages, 3000); return () => clearInterval(i); }, [fetchMessages]);
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await api.post(\/rides/\/chat\, { message: newMessage });
      setNewMessage(""); fetchMessages();
    } catch { toast.error("Failed to send"); } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black">
        {messages.map((msg) => (
          <div key={msg.id} className={\lex \\}>
            <div className={\max-w-[80%] rounded-2xl p-3 \\}>
              <p className="text-sm">{msg.message}</p>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={sendMessage} className="p-4 border-t border-[#00ff88]/20 flex gap-2">
        <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={t("type_message")} className="bg-black text-white" />
        <Button type="submit" disabled={sending} className="bg-[#00ff88] text-black"><Send className="w-4 h-4" /></Button>
      </form>
    </div>
  );
};

/* ---------------------------------------------
   RiderDashboard
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
  const [pickup, setPickup] = useState({ address: "", lat: null, lng: null });
  const [destination, setDestination] = useState({ address: "", lat: null, lng: null });
  const [stops, setStops] = useState([]);
  const [carType, setCarType] = useState("economy");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [topupAmount, setTopupAmount] = useState("");
  const [routeInfo, setRouteInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [surgeInfo, setSurgeInfo] = useState(null);
  
  // Rating
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [completedRideInfo, setCompletedRideInfo] = useState(null);

  const pollRef = useRef(null);

  const calculateRoute = useCallback(() => {
    if (!mapsLoaded || !window.google?.maps || !pickup?.lat || !destination?.lat) return;
    const svc = new window.google.maps.DirectionsService();
    const waypoints = stops.filter(s => s.lat).map(s => ({ location: s, stopover: true }));
    svc.route(
      { origin: pickup, destination, waypoints, travelMode: window.google.maps.TravelMode.DRIVING },
      (res, stat) => {
        if (stat === "OK") {
          let dist = 0, dur = 0;
          res.routes[0].legs.forEach(l => { dist += l.distance.value; dur += l.duration.value; });
          setRouteInfo({ distance: Math.round(dist / 100) / 10, duration: Math.round(dur / 60) });
        }
      }
    );
  }, [mapsLoaded, pickup, destination, stops]);

  useEffect(() => { calculateRoute(); }, [calculateRoute]);

  useEffect(() => {
    if (routeInfo) {
      const surge = surgeInfo?.multiplier || 1.0;
      setFareEstimate(calculateFare(carType, routeInfo.distance, 0, 0, stops.length, surge));
    }
  }, [routeInfo, carType, surgeInfo, stops]);

  const pollRide = useCallback((id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(\/rides/\\);
        const r = normalizeRide(res.data);
        setActiveRide(r);
        if (["completed", "cancelled", "no_drivers"].includes(r.status)) {
          clearInterval(pollRef.current);
          if (r.status === "completed") { setCompletedRideInfo(r); setShowRatingModal(true); }
          else if (r.status === "no_drivers") { toast.error("No drivers found"); setActiveRide(null); }
          else { setActiveRide(null); }
        }
      } catch { clearInterval(pollRef.current); }
    }, 3000);
  }, []);

  const handleBook = async (paid = false, orderId = null) => {
    if (!pickup.lat) return toast.error("Select pickup");
    setLoading(true);
    try {
      const payload = {
        pickup: pickup.address, pickupLat: pickup.lat, pickupLng: pickup.lng,
        destination: destination?.address, destinationLat: destination?.lat, destinationLng: destination?.lng,
        stops, carType, paymentMethod, estimatedDistance: routeInfo?.distance || 5, estimatedDuration: routeInfo?.duration || 15,
        paymentOrderId: orderId
      };
      const res = await api.post("/rides/request", payload);
      toast.success("Searching...");
      setActiveRide({ ...payload, id: res.data.ride_id, status: "searching" });
      setActiveTab("active");
      pollRide(res.data.ride_id);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };

  const submitRating = async () => {
    if (!completedRideInfo?.id) return;
    try {
      await api.post(\/rides/\/rate-driver\, { rating, review });
      toast.success("Feedback sent"); setShowRatingModal(false);
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="min-h-screen bg-black">
      <style>{'.gm-style, div[aria-label="Map"] { height: 100% !important; }'}</style>
      <header className="bg-black/50 backdrop-blur border-b border-[#00ff88]/20 p-4 sticky top-0 z-50 flex justify-between">
         <div className="text-[#00ff88] font-bold">T'aksi Rider</div>
         <div className="text-white text-sm">Bal: ₾{user?.wallet_balance?.toFixed(2) || "0.00"}</div>
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 bg-gray-900 mb-4">
            <TabsTrigger value="book">Book Ride</TabsTrigger>
            <TabsTrigger value="active">Active Ride</TabsTrigger>
          </TabsList>

          <TabsContent value="book">
            <Card className="bg-black/60 border border-[#00ff88]/30">
              <CardContent className="space-y-4 pt-4">
                <LocationInput value={pickup} onChange={setPickup} placeholder="Pickup Location" icon={MapPin} iconColor="text-[#00ff88]" mapsLoaded={mapsLoaded} />
                <LocationInput value={destination} onChange={setDestination} placeholder="Destination" icon={Navigation} iconColor="text-[#00d4ff]" mapsLoaded={mapsLoaded} />
                
                {fareEstimate && (
                   <div className="bg-gray-900 p-3 rounded border border-gray-700 text-center">
                      <p className="text-gray-400 text-xs">{routeInfo?.distance} km • {routeInfo?.duration} min</p>
                      <p className="text-[#00ff88] text-xl font-bold">₾{fareEstimate.total.toFixed(2)}</p>
                   </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(PRICING_RULES).map(([k, v]) => (
                    <button key={k} onClick={() => setCarType(k)} className={\p-2 rounded border \\}>
                      <div className="text-xl">{v.icon}</div>
                      <div className="text-xs text-white capitalize">{k}</div>
                    </button>
                  ))}
                </div>

                {paymentMethod === "card" ? (
                   <div className="bg-white p-2 rounded">
                     <PayPalButtons style={{ layout: "vertical" }} 
                       createOrder={(d, a) => a.order.create({ purchase_units: [{ amount: { value: String(fareEstimate?.total || "5"), currency_code: "USD" } }] })}
                       onApprove={async (d, a) => { await a.order.capture(); handleBook(true, d.orderID); }}
                     />
                   </div>
                ) : (
                   <Button className="w-full bg-[#00ff88] text-black h-12 text-lg font-bold" onClick={() => handleBook(false)} disabled={loading || !pickup.lat}>
                     {loading ? <Loader2 className="animate-spin"/> : "Request Ride"}
                   </Button>
                )}
                
                <div className="flex gap-2 justify-center mt-2">
                   <Button variant="ghost" size="sm" onClick={() => setPaymentMethod("cash")} className={paymentMethod === "cash" ? "text-[#00ff88]" : "text-gray-500"}>Cash</Button>
                   <Button variant="ghost" size="sm" onClick={() => setPaymentMethod("card")} className={paymentMethod === "card" ? "text-[#00d4ff]" : "text-gray-500"}>Card</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active">
            {activeRide ? (
               <Card className="bg-black/60 border border-[#00d4ff]/30">
                 <CardContent className="pt-4">
                   <LiveTrackingMap mapsLoaded={mapsLoaded} pickup={{ lat: activeRide.pickupLat, lng: activeRide.pickupLng }} destination={{ lat: activeRide.destinationLat, lng: activeRide.destinationLng }} driverLocation={activeRide.driver_location} status={activeRide.status} />
                   <div className="flex justify-between items-center mt-4">
                      <Badge className="bg-blue-600 text-white">{activeRide.status}</Badge>
                      {activeRide.otp && <span className="text-[#00ff88] font-mono text-xl tracking-widest">{activeRide.otp}</span>}
                   </div>
                   {activeRide.driver_info && (
                      <div className="mt-4 bg-gray-900 p-3 rounded border border-gray-700 flex gap-3">
                         <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center"><User className="text-white"/></div>
                         <div>
                            <p className="text-white font-bold">{activeRide.driver_info.name}</p>
                            <p className="text-gray-400 text-sm">{activeRide.driver_info.car_make} • {activeRide.driver_info.license_plate}</p>
                         </div>
                      </div>
                   )}
                   {["searching", "accepted"].includes(activeRide.status) && (
                      <Button variant="ghost" className="w-full text-red-500 mt-4" onClick={async () => { await api.post(\/rides/\/cancel\); setActiveRide(null); }}>Cancel Ride</Button>
                   )}
                 </CardContent>
               </Card>
            ) : (
               <div className="text-center text-gray-500 mt-10">No active ride.</div>
            )}
          </TabsContent>
        </Tabs>

        {/* Rating Modal */}
        <Dialog open={showRatingModal} onOpenChange={setShowRatingModal}>
           <DialogContent className="bg-black border border-[#00ff88] text-white">
              <DialogTitle className="text-[#00ff88] text-center">Rate Driver</DialogTitle>
              <div className="flex justify-center gap-2 my-4">
                 {[1,2,3,4,5].map(s => <Star key={s} className={\w-8 h-8 cursor-pointer \\} onClick={() => setRating(s)}/>)}
              </div>
              <Input value={review} onChange={e => setReview(e.target.value)} placeholder="Comment..." className="bg-gray-900 border-gray-700 text-white"/>
              <Button onClick={submitRating} className="w-full bg-[#00ff88] text-black mt-4">Submit</Button>
           </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

const RiderAuth = () => { /* Simplified Auth for brevity, assumes already works or can be imported */ return <div>Auth Component Here</div> };

const RiderPortal = () => {
  const { user } = useAuth();
  if (!user || user.user_type !== "rider") return <Navigate to="/" replace />;
  return <RiderDashboard />;
};

export default RiderPortal;
