import React, { useState, useEffect, useRef, useCallback } from "react";

import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";



// 🔥 FIX: Import from @/config and @/api

import { useAuth, GOOGLE_MAPS_API_KEY } from "@/config";

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

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

import { LiveTrackingMap } from "@/components/maps/LiveTrackingMap"; // Import the new LiveTrackingMap component

import {

  Car, MapPin, History, Home, LogOut, User, Navigation, Rocket,

  Plus, X, Target, Timer, Crosshair, Zap, TrendingUp, MapPinned,

  Loader2, CreditCard, CheckCircle2, Phone, Lock, ArrowLeft, Wallet,

  Route as RouteIcon, Edit, Activity, Clock, Star

} from "lucide-react";



// Pricing Rules (Updated to your specific base prices)

const PRICING_RULES = {

  economy: { name: 'Economy', base: 2.80, perKm: 0.50, perMinWait: 0.40, freeWait: 2, stopFee: 0.00, icon: "🚗" },

  comfort: { name: 'Comfort', base: 3.38, perKm: 0.55, perMinWait: 0.45, freeWait: 2, stopFee: 0.00, icon: "🚙" },

  suv: { name: 'SUV / XL', base: 5.18, perKm: 0.80, perMinWait: 0.50, freeWait: 2, stopFee: 0.00, icon: "🚐" },

  personal: { name: 'Personal', base: 5.12, perKm: 0.70, perMinWait: 0.50, freeWait: 3, stopFee: 0.00, icon: "👤" },

  jumpstart: { name: 'Jumpstart', base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, stopFee: 0.00, icon: "⚡" }

};



// 🔥 UPDATED: Adds +2.00 GEL if paymentMethod is 'card'

const calculateFare = (carType, distanceKm, waitMin = 0, stopWaitMin = 0, numStops = 0, surgeMultiplier = 1.0, paymentMethod = 'cash') => {

  const rules = PRICING_RULES[carType] || PRICING_RULES.economy;

  let subtotal = rules.base;

  subtotal += distanceKm * rules.perKm;



  // Long distance logic

  if (distanceKm > 7) {

    subtotal += (distanceKm - 7) * 0.15;

  }

  if (distanceKm > 30) {

    subtotal += Math.ceil((distanceKm - 30) / 15) * 5;

  }



  // Wait fees

  const billableWait = Math.max(0, waitMin - rules.freeWait);

  subtotal += billableWait * rules.perMinWait;

  subtotal += stopWaitMin * rules.perMinWait;



  // Stop fees (Now 0.00)

  subtotal += numStops * rules.stopFee;



  // Surge

  const surgeFee = subtotal * (surgeMultiplier - 1.0);



  // 🔥 SERVICE FEE LOGIC

  const serviceFee = paymentMethod === 'card' ? 2.00 : 0.00;



  // Calculate Total

  const total = subtotal + surgeFee + serviceFee;



  return {

    base: rules.base,

    distance: Math.round(distanceKm * rules.perKm * 100) / 100,

    wait: Math.round((billableWait + stopWaitMin) * rules.perMinWait * 100) / 100,

    stops: numStops * rules.stopFee,

    subtotal: Math.round(subtotal * 100) / 100,

    surgeFee: Math.round(surgeFee * 100) / 100,

    serviceFee: serviceFee.toFixed(2), // Added to return object

    surgeMultiplier,

    total: Math.round(total * 100) / 100

  };

};



// Google Maps Autocomplete (LIGHT THEME DROPDOWN)

const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {

  const callbackRef = useRef(onPlaceSelect);

  useEffect(() => { callbackRef.current = onPlaceSelect; }, [onPlaceSelect]);



  useEffect(() => {

    const style = document.createElement('style');

    style.innerHTML = `

      .pac-container { z-index: 10500 !important; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; font-family: inherit; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }

      .pac-item { color: #374151; border-top: 1px solid #f3f4f6; padding: 10px; cursor: pointer; }

      .pac-item:hover { background-color: #f3f4f6; }

      .pac-item-query { color: #000000; font-weight: bold; }

    `;

    document.head.appendChild(style);

    return () => document.head.removeChild(style);

  }, []);



  // Initialize Autocomplete (With Safety Timer)

  useEffect(() => {

    const timer = setInterval(() => {

      if (inputRef.current && window.google && window.google.maps && window.google.maps.places) {

        clearInterval(timer);

        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {

          componentRestrictions: { country: 'ge' },

          fields: ['formatted_address', 'geometry', 'name']

        });

        autocomplete.addListener('place_changed', () => {

          const place = autocomplete.getPlace();

          if (place.geometry) {

            callbackRef.current({

              address: place.formatted_address || place.name,

              lat: place.geometry.location.lat(),

              lng: place.geometry.location.lng()

            });

          }

        });

      }

    }, 500);

    return () => clearInterval(timer);

  }, []);

};



// 🔥 FIXED: Map Picker (Solves Black Screen on Re-open)

const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation }) => {

  const mapRef = useRef(null);

  const mapInstanceRef = useRef(null); // Holds the Google Map instance

  const markerRef = useRef(null);      // Holds the red pin

  const [address, setAddress] = useState("Move map to select location...");

  const [isDragging, setIsDragging] = useState(false);

  const [locating, setLocating] = useState(false);



  // Safe center initialization

  const [center, setCenter] = useState({ lat: 41.7151, lng: 44.8271 });



  // Update center when initialLocation changes

  useEffect(() => {

      if (initialLocation && initialLocation.lat) {

          setCenter({

              lat: parseFloat(initialLocation.lat),

              lng: parseFloat(initialLocation.lng)

          });

      }

  }, [initialLocation]);



  // 🔥 CRITICAL FIX: Reset map instance when modal closes

  useEffect(() => {

    if (!isOpen) {

        mapInstanceRef.current = null; // Kill the old map instance so a new one is made next time

    }

  }, [isOpen]);



  // Initialize Map

  useEffect(() => {

    if (!isOpen || !mapRef.current || !window.google) return;



    // Only create a new map if one doesn't exist

    if (!mapInstanceRef.current) {

        const map = new window.google.maps.Map(mapRef.current, {

            center: center,

            zoom: 17,

            disableDefaultUI: true,

            clickableIcons: false,

            backgroundColor: '#1a1a2e',

            styles: [

                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },

                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },

                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },

                { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },

            ]

        });

        mapInstanceRef.current = map;



        // Add Listeners

        map.addListener("idle", () => {

            setIsDragging(false);

            const newCenter = map.getCenter();

            const lat = newCenter.lat();

            const lng = newCenter.lng();

            setCenter({ lat, lng });



            const geocoder = new window.google.maps.Geocoder();

            geocoder.geocode({ location: { lat, lng } }, (results, status) => {

                if (status === 'OK' && results[0]) setAddress(results[0].formatted_address);

                else setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);

            });

        });



        map.addListener("dragstart", () => setIsDragging(true));

    }

  }, [isOpen]); // Only run when isOpen changes



  const handleLocateMe = () => {

    if (!navigator.geolocation) return toast.error("Geolocation not supported");

    setLocating(true);

    navigator.geolocation.getCurrentPosition((position) => {

        const lat = parseFloat(position.coords.latitude);

        const lng = parseFloat(position.coords.longitude);

        if (mapInstanceRef.current) {

            const pos = { lat, lng };

            mapInstanceRef.current.panTo(pos);

            mapInstanceRef.current.setZoom(17);

            setCenter(pos);

        }

        setLocating(false);

    }, () => { toast.error("Could not find location"); setLocating(false); }, { enableHighAccuracy: true });

  };



  const handleConfirm = () => {

    onLocationSelect({

        address: address,

        lat: parseFloat(center.lat),

        lng: parseFloat(center.lng)

    });

    onClose();

  };



  if (!isOpen) return null;



  return (

    <div className="fixed inset-0 z-[9999] bg-black flex flex-col">

        <div className="absolute top-0 left-0 right-0 p-4 z-10 flex items-center justify-between pointer-events-none">

            <Button variant="ghost" size="icon" onClick={onClose} className="bg-black/50 text-white rounded-full pointer-events-auto backdrop-blur-md border border-[#00ff88]/30"><ArrowLeft className="w-6 h-6" /></Button>

            <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-[#00ff88]/30"><p className="text-[#00ff88] font-bold text-sm">{title || "Select Location"}</p></div>

        </div>

        <div className="relative flex-1 w-full h-full">

            <div ref={mapRef} className="w-full h-full" />

            <div className="absolute inset-0 pointer-events-none flex items-center justify-center pb-10">

                <div className="relative flex flex-col items-center">

                    <MapPin className={`w-12 h-12 text-[#00ff88] drop-shadow-2xl transition-transform duration-200 ${isDragging ? '-translate-y-4' : ''}`} fill="black" />

                    <div className="w-2 h-2 bg-black/50 rounded-full blur-[2px] mt-[-5px]" />

                </div>

            </div>

            <Button size="icon" className="absolute bottom-6 right-4 rounded-full w-12 h-12 bg-black/80 border border-[#00ff88]/50 text-[#00ff88] shadow-lg z-20" onClick={handleLocateMe} disabled={locating}>

                {locating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Crosshair className="w-6 h-6" />}

            </Button>

        </div>

        <div className="bg-[#1a1a2e] p-6 rounded-t-3xl border-t border-[#00ff88]/30 -mt-6 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">

            <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-4" />

            <p className="text-[#00ff88] text-xs font-bold uppercase mb-1">Selected Location</p>

            <h3 className="text-white text-lg font-bold truncate mb-6">{isDragging ? "Locating..." : address}</h3>

            <Button className="w-full bg-[#00ff88] text-black font-bold h-14 text-lg rounded-xl" onClick={handleConfirm} disabled={isDragging}>{isDragging ? "Release to Select" : "Confirm Location"}</Button>

        </div>

    </div>

  );

};





// --- 3. LIVE MAP COMPONENT (Upgraded: Auto-Follow + Re-Center) ---

  const mapRef = useRef(null);

  const mapInstanceRef = useRef(null);

  const directionsRendererRef = useRef(null);

  const driverMarkerRef = useRef(null);

  

  // State to track if we should lock camera on driver

  const [isFollowing, setIsFollowing] = useState(true);



  const getSafeCoord = (val) => { const num = parseFloat(val); return !isNaN(num) && num !== 0 ? num : null; };



  // 1. Initialize Map

  useEffect(() => {

    if (!mapRef.current || !window.google) return;

    

    if (!mapInstanceRef.current) {

      const map = new window.google.maps.Map(mapRef.current, {

        center: { lat: 41.7151, lng: 44.8271 },

        zoom: 15,

        disableDefaultUI: true,

        backgroundColor: '#1a1a2e',

        styles: [

          { elementType: "geometry", stylers: [{ color: "#242f3e" }] },

          { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },

          { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },

          { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] }

        ]

      });



      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({

        map: map,

        suppressMarkers: false,

        polylineOptions: { strokeColor: "#00ff88", strokeWeight: 6 }

      });



      // Detect manual interaction to pause "Auto-Follow"

      map.addListener("dragstart", () => setIsFollowing(false));



      mapInstanceRef.current = map;

    }

  }, []);



  // 2. Routing Logic

  useEffect(() => {

    if (!mapInstanceRef.current || !window.google) return;



    const pLat = getSafeCoord(pickup?.lat);

    const pLng = getSafeCoord(pickup?.lng);

    const destLat = getSafeCoord(destination?.lat);

    const destLng = getSafeCoord(destination?.lng);

    const dLat = getSafeCoord(driverLocation?.lat);

    const dLng = getSafeCoord(driverLocation?.lng);



    // Format stops for Google Maps API

    const waypoints = stops

      .filter(s => s.lat && s.lng)

      .map(s => ({

        location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) },

        stopover: true

      }));



    // MODE A: Preview (Booking)

    if (status === 'preview') {

       if (pLat && pLng && destLat && destLng) {

           calculateAndDrawRoute({ lat: pLat, lng: pLng }, { lat: destLat, lng: destLng }, waypoints);

       }

       return; 

    }



    // MODE B: Live Ride (Driver Active)

    if (!dLat || !dLng) return; // Wait for driver location



    // 🔥 THIS WAS MISSING - DEFINING ORIGIN & TARGET

    const origin = { lat: dLat, lng: dLng };

    let target = null;



    if (['accepted', 'searching', 'arrived'].includes(status) && pLat) {

        target = { lat: pLat, lng: pLng }; // Driver -> Pickup

    } else if (status === 'in_progress' && destLat) {

        target = { lat: destLat, lng: destLng }; // Driver -> Destination

    }



    // Now safe to use

    if (origin && target) { 

        calculateAndDrawRoute(origin, target, []); // Ignore waypoints for driver->pickup leg

    }



  }, [pickup?.lat, destination?.lat, stops.length, status, driverLocation?.lat]); 



  const calculateAndDrawRoute = (origin, target, waypoints = []) => {

    const directionsService = new window.google.maps.DirectionsService();

    directionsService.route({

        origin: origin,

        destination: target,

        waypoints: waypoints,

        travelMode: window.google.maps.TravelMode.DRIVING

    }, (result, status) => {

        if (status === 'OK' && directionsRendererRef.current) {

            directionsRendererRef.current.setDirections(result);

            

            // Only fit bounds if we are in preview mode or just starting

            if (status === 'preview' || !driverLocation) {

                const bounds = new window.google.maps.LatLngBounds();

                bounds.extend(origin);

                bounds.extend(target);

                waypoints.forEach(wp => bounds.extend(wp.location));

                mapInstanceRef.current.fitBounds(bounds);

            }

        }

    });

  };



  // 3. Driver Marker & Camera Follow Logic

  useEffect(() => {

    if (!mapInstanceRef.current || !window.google || !driverLocation?.lat) return;

    

    const pos = { 

        lat: parseFloat(driverLocation.lat), 

        lng: parseFloat(driverLocation.lng) 

    };



    // Update or Create Marker

    if (!driverMarkerRef.current) {

      driverMarkerRef.current = new window.google.maps.Marker({

        position: pos,

        map: mapInstanceRef.current,

        icon: {

          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,

          scale: 6, fillColor: "#00d4ff", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2,

          rotation: parseFloat(driverLocation.heading) || 0

        },

        zIndex: 1000

      });

    } else {

      driverMarkerRef.current.setPosition(pos);

      const icon = driverMarkerRef.current.getIcon();

      icon.rotation = parseFloat(driverLocation.heading) || 0;

      driverMarkerRef.current.setIcon(icon);

    }



    // Auto-Follow Logic

    if (isFollowing) {

        mapInstanceRef.current.panTo(pos);

    }



  }, [driverLocation, isFollowing]);



  const handleRecenter = () => {

      setIsFollowing(true);

      if (driverLocation?.lat && mapInstanceRef.current) {

          mapInstanceRef.current.panTo({

              lat: parseFloat(driverLocation.lat),

              lng: parseFloat(driverLocation.lng)

          });

          mapInstanceRef.current.setZoom(16);

      }

  };





// LocationInput (LIGHT THEME BOXES)

const LocationInput = ({ value, onChange, placeholder, icon: Icon, iconColor, id, name }) => {

  const inputRef = useRef(null);

  const [showMapPicker, setShowMapPicker] = useState(false);



  // Uses the hook we defined earlier

  useGoogleMapsAutocomplete(inputRef, (place) => {

    onChange({ address: place.address, lat: place.lat, lng: place.lng });

  });



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

        >

            <MapPinned className="w-5 h-5" />

        </Button>

      </div>

      

      {/* Re-uses the MapPicker component */}

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



// Auth Component

const RiderAuth = () => {

  const { login } = useAuth();

  const navigate = useNavigate();

  const [isLogin, setIsLogin] = useState(true);

  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({

    name: "", surname: "", cellphone: "", password: ""

  });



  const handleSubmit = async (e) => {

    e.preventDefault();

    setLoading(true);



    try {

      const endpoint = isLogin ? "/auth/login" : "/auth/register/rider";

      const res = await api.post(endpoint, formData);



      if (res.data && res.data.token && res.data.user) {

        login(res.data.token, res.data.user);

        toast.success(isLogin ? "Welcome back!" : "Account created!");

        navigate("/rider/dashboard");

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

      <Card className="w-full max-w-md bg-black/70 backdrop-blur-xl border border-[#00ff88]/30">

        <CardHeader className="text-center">

          <Button

            variant="ghost"

            className="absolute left-4 top-4 text-[#00ff88] hover:text-white"

            onClick={() => navigate("/")}

          >

            <ArrowLeft className="w-4 h-4 mr-2" /> Back

          </Button>

          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center mx-auto mb-4">

            <Rocket className="w-10 h-10 text-black" />

          </div>

          <CardTitle className="text-2xl text-[#00ff88]">

            {isLogin ? "Welcome Back" : "Join T'aksi"}

          </CardTitle>

          <CardDescription className="text-[#00d4ff]/70">

            {isLogin ? "Sign in to book rides" : "Create your account"}

          </CardDescription>

        </CardHeader>

        <CardContent>

          <form onSubmit={handleSubmit} className="space-y-4">

            {!isLogin && (

              <div className="grid grid-cols-2 gap-4">

                <div className="space-y-2">

                  <Label htmlFor="rider-name" className="text-[#00ff88]">First Name</Label>

                  <Input

                    id="rider-name"

                    name="name"

                    value={formData.name}

                    onChange={e => setFormData({...formData, name: e.target.value})}

                    className="bg-black/50 border-[#00ff88]/30 text-white"

                    required

                    autoComplete="given-name"

                  />

                </div>

                <div className="space-y-2">

                  <Label htmlFor="rider-surname" className="text-[#00ff88]">Last Name</Label>

                  <Input

                    id="rider-surname"

                    name="surname"

                    value={formData.surname}

                    onChange={e => setFormData({...formData, surname: e.target.value})}

                    className="bg-black/50 border-[#00ff88]/30 text-white"

                    required

                    autoComplete="family-name"

                  />

                </div>

              </div>

            )}

            <div className="space-y-2">

              <Label htmlFor="rider-phone" className="text-[#00ff88]">Phone Number</Label>

              <div className="relative">

                <Phone className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />

                <Input

                  id="rider-phone"

                  name="cellphone"

                  type="tel"

                  value={formData.cellphone}

                  onChange={e => setFormData({...formData, cellphone: e.target.value})}

                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"

                  placeholder="+995 XXX XXX XXX"

                  required

                  autoComplete="tel"

                />

              </div>

            </div>

            <div className="space-y-2">

              <Label htmlFor="rider-password" className="text-[#00ff88]">Password</Label>

              <div className="relative">

                <Lock className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />

                <Input

                  id="rider-password"

                  name="password"

                  type="password"

                  value={formData.password}

                  onChange={e => setFormData({...formData, password: e.target.value})}

                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"

                  required

                  autoComplete="current-password"

                />

              </div>

            </div>

            <Button

              type="submit"

              className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold"

              disabled={loading}

            >

              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}

              {isLogin ? "Sign In" : "Create Account"}

            </Button>

          </form>

        </CardContent>

        <CardFooter className="justify-center">

          <Button variant="link" className="text-[#00d4ff]" onClick={() => setIsLogin(!isLogin)}>

            {isLogin ? "Need an account? Register" : "Have an account? Sign In"}

          </Button>

        </CardFooter>

      </Card>

    </div>

  );

};



// Dashboard Component

const RiderDashboard = () => {

  const { user, logout } = useAuth();

  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("book");

  const [loading, setLoading] = useState(false);

  const [locationLoading, setLocationLoading] = useState(false);

  const [mapsLoaded, setMapsLoaded] = useState(false);

  const [activeRide, setActiveRide] = useState(null);

  const [rideHistory, setRideHistory] = useState([]);

  const [showEditModal, setShowEditModal] = useState(false);

  const [showPayPal, setShowPayPal] = useState(false);



  // --- CARD PAYMENT STATE ---

  const [showCardModal, setShowCardModal] = useState(false);

  const [cardDetails, setCardDetails] = useState({ number: "", expiry: "", cvv: "" });



  // Handle formatted input

  const handleCardInput = (field, value) => {

    let formatted = value;



    if (field === "number") {

      // Allow only numbers, max 16 digits

      formatted = value.replace(/\D/g, "").slice(0, 16);

    } else if (field === "expiry") {

      // Format as MM/YY

      formatted = value.replace(/\D/g, "").slice(0, 4);

      if (formatted.length >= 3) formatted = `${formatted.slice(0, 2)}/${formatted.slice(2)}`;

    } else if (field === "cvv") {

      // Max 3 digits

      formatted = value.replace(/\D/g, "").slice(0, 3);

    }



    setCardDetails({ ...cardDetails, [field]: formatted });

  };



  // Process the Card Payment

  const handleCardPayment = async (e) => {

    e.preventDefault();

    if (cardDetails.number.length < 16 || cardDetails.expiry.length < 5 || cardDetails.cvv.length < 3) {

        return toast.error("Please complete card details");

    }



    setLoading(true);

    // Simulate API processing time

    setTimeout(() => {

        setLoading(false);

        setShowCardModal(false);

        toast.success("Payment Method Verified");

        processRideRequest(); // Proceed to book the ride

    }, 1500);

  };



  // Booking state

  const [pickup, setPickup] = useState({ address: "", lat: null, lng: null });

  const [destination, setDestination] = useState({ address: "", lat: null, lng: null });

  const [stops, setStops] = useState([]);

  const [carType, setCarType] = useState("economy");

  const [paymentMethod, setPaymentMethod] = useState("cash");



  // Route info

  const [routeInfo, setRouteInfo] = useState(null);

  const [fareEstimate, setFareEstimate] = useState(null);



  // Surge pricing

  const [surgeInfo, setSurgeInfo] = useState(null);



  // Exchange rate GEL to USD (approx)

  const GEL_TO_USD = 0.37;



  // Load Google Maps

  useEffect(() => {

    if (window.google) {

      setMapsLoaded(true);

      return;

    }



    const script = document.createElement('script');

    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;

    script.async = true;

    script.onload = () => setMapsLoaded(true);

    script.onerror = () => {

      toast.error("Failed to load Google Maps. Check API key/network.");

      console.error("Google Maps script failed");

    };

    document.head.appendChild(script);

  }, []);



  useEffect(() => {

    fetchActiveRide();

    fetchRideHistory();

    fetchSurgeStatus();

  }, []);



  useEffect(() => {

    if (pickup.lat) {

      fetchSurgeStatus();

    }

  }, [pickup.lat, pickup.lng]);



 // 🔥 FIXED: Route Calculator (Prevents Infinite Loop Crash)

  const calculateRoute = useCallback(() => {

    if (!window.google || !pickup.lat || !destination.lat) return;



    try {

      const directionsService = new window.google.maps.DirectionsService();



      // Ensure stops are valid numbers

      const waypoints = stops

        .filter(s => s.lat && s.lng)

        .map(s => ({

          location: { lat: parseFloat(s.lat), lng: parseFloat(s.lng) },

          stopover: true

        }));



      directionsService.route({

        origin: { lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng) },

        destination: { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) },

        waypoints: waypoints,

        travelMode: window.google.maps.TravelMode.DRIVING

      }, (res, status) => {

        if (status === 'OK' && res.routes[0] && res.routes[0].legs) {

          let d = 0, t = 0;

          res.routes[0].legs.forEach(l => {

            d += l.distance.value;

            t += l.duration.value;

          });



          const newDist = Math.round(d / 100) / 10;

          const newDur = Math.round(t / 60);



          // 🔥 CRITICAL FIX: Loop Stopper

          // Only update state if the values are ACTUALLY different.

          setRouteInfo(prev => {

            if (prev && prev.distance === newDist && prev.duration === newDur) return prev;

            return { distance: newDist, duration: newDur };

          });

        } else {

          console.warn("Route failed:", status);

        }

      });

    } catch (err) {

      console.error("Route Error:", err);

    }

  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, stops]);



  // 🔥 TRIGGER: Only run when NUMBERS change (Debounced)

  useEffect(() => {

    if (mapsLoaded && pickup.lat && destination.lat) {

      const timer = setTimeout(() => {

        calculateRoute();

      }, 500);

      return () => clearTimeout(timer);

    }

  }, [mapsLoaded, pickup.lat, pickup.lng, destination.lat, destination.lng, stops.length, calculateRoute]);



  // 🔥 FIX: Added 'paymentMethod' to dependency array so price updates instantly

  useEffect(() => {

    if (routeInfo) {

      const surge = surgeInfo?.multiplier || 1.0;

      const fare = calculateFare(carType, routeInfo.distance, 0, 0, stops.length, surge, paymentMethod);

      setFareEstimate(fare);

    }

  }, [routeInfo, carType, stops.length, surgeInfo, paymentMethod]);



  // 🔥 POLL FOR ACTIVE RIDE

  useEffect(() => {

    let interval;

    if (activeRide && !["completed", "cancelled", "no_drivers"].includes(activeRide.status)) {

      interval = setInterval(fetchActiveRide, 3000);

    }

    return () => clearInterval(interval);

  }, [activeRide?.status]);



  const fetchSurgeStatus = async () => {

    try {

      const params = pickup.lat ? `?lat=${pickup.lat}&lng=${pickup.lng}` : '';

      const res = await api.get(`/surge/status${params}`);

      setSurgeInfo(res.data);

    } catch (error) {

      console.error("Error fetching surge:", error);

    }

  };



  const fetchActiveRide = async () => {

    try {

      const res = await api.get(`/rider/active-ride`);

      if (res.data) {

        setActiveRide(res.data);

        if (activeTab === "book" && activeTab !== "active") setActiveTab("active");

      }

    } catch (error) {

      if (error.response?.status !== 404) console.error("Error fetching active ride:", error);

    }

  };



  const fetchRideHistory = async () => {

    try {

      const res = await api.get(`/rider/history`);

      setRideHistory(res.data.rides || []);

    } catch (error) {

      console.error("Error fetching history:", error);

    }

  };



  const addStop = () => {

    if (stops.length < 3) {

      setStops([...stops, { address: "", lat: null, lng: null, order: stops.length }]);

    } else {

      toast.error("Maximum 3 stops allowed");

    }

  };



  const updateStop = (index, data) => {

    const newStops = [...stops];

    newStops[index] = { ...newStops[index], ...data };

    setStops(newStops);

  };



  const removeStop = (index) => {

    setStops(stops.filter((_, i) => i !== index));

  };



  const handleBookRide = async () => {

    if (!pickup.lat || !pickup.address) {

      toast.error("Please select a pickup address");

      return;

    }



    // Trigger the real PayPal integration

    if (paymentMethod === "card") {

      setShowPayPal(true);

      return;

    }



    // Otherwise, book immediately (Cash)

    await processRideRequest();

  };



  const processRideRequest = async () => {

    setLoading(true);

    try {

      const rideData = {

        pickup: pickup.address,

        pickupLat: pickup.lat,

        pickupLng: pickup.lng,

        destination: destination.address || null,

        destinationLat: destination.lat,

        destinationLng: destination.lng,

        stops: stops.filter(s => s.lat).map((s, i) => ({

          address: s.address,

          lat: s.lat,

          lng: s.lng,

          order: i

        })),

        carType,

        paymentMethod,

        estimatedDistance: routeInfo?.distance || null,
        estimatedDistance: routeInfo?.distance,
        estimatedDuration: routeInfo?.duration,
        estimatedPrice: fareEstimate?.total,
        currency: "GEL"
      };

      const res = await api.post("/rider/request", rideData);
      
      if (res.data) {
        toast.success("Ride requested successfully!");
        setActiveRide(res.data);
        setActiveTab("active");
        
        // Reset Booking Form
        setDestination({ address: "", lat: null, lng: null });
        setStops([]);
        setShowPayPal(false); // Close modal if open
      }
    } catch (error) {
      const msg = error.response?.data?.detail || "Failed to book ride";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- PayPal Handler ---
  const handlePayPalApprove = async (data, actions) => {
    try {
      const details = await actions.order.capture();
      toast.success(`Payment successful! Transaction ID: ${details.id}`);
      // Proceed to book ride with transaction reference
      await processRideRequest(); 
    } catch (err) {
      toast.error("Payment failed. Please try again.");
    }
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-black/80 backdrop-blur-md border-b border-[#00ff88]/20 p-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#00ff88] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(0,255,136,0.3)]">
            <Rocket className="w-6 h-6 text-black" />
          </div>
          <span className="text-xl font-bold tracking-tighter text-white">T'aksi</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-bold text-[#00ff88]">{user?.name} {user?.surname}</span>
            <span className="text-xs text-gray-400">{user?.cellphone}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="hover:bg-red-500/10 hover:text-red-500">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          
          <TabsList className="grid w-full grid-cols-3 bg-[#1a1a2e] mb-6 rounded-xl p-1 border border-white/5">
            <TabsTrigger value="book" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black font-bold rounded-lg transition-all">
              <Car className="w-4 h-4 mr-2" /> Book Ride
            </TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-[#00d4ff] data-[state=active]:text-black font-bold rounded-lg transition-all relative">
              <Activity className="w-4 h-4 mr-2" /> Active Ride
              {activeRide && !['completed','cancelled'].includes(activeRide.status) && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:text-black font-bold rounded-lg transition-all">
              <History className="w-4 h-4 mr-2" /> History
            </TabsTrigger>
          </TabsList>

          {/* TAB: BOOK RIDE */}
          <TabsContent value="book" className="flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              
              {/* Left Column: Inputs & Options */}
              <div className="lg:col-span-1 space-y-6">
                
                {/* Location Inputs */}
                <Card className="bg-[#1a1a2e] border-white/10 shadow-2xl">
                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-1">
                      <Label className="text-[#00ff88] text-xs uppercase font-bold">Pick Up</Label>
                      <LocationInput 
                        id="pickup" 
                        value={pickup} 
                        onChange={setPickup} 
                        placeholder="Current Location" 
                        icon={MapPin} 
                        iconColor="text-[#00ff88]" 
                      />
                    </div>

                    {/* Stops */}
                    {stops.map((stop, index) => (
                      <div key={index} className="space-y-1 relative">
                        <Label className="text-yellow-400 text-xs uppercase font-bold flex justify-between">
                          Stop #{index + 1}
                          <span className="cursor-pointer text-red-400 hover:underline" onClick={() => removeStop(index)}>Remove</span>
                        </Label>
                        <LocationInput 
                          value={stop} 
                          onChange={(val) => updateStop(index, val)} 
                          placeholder="Add a stop..." 
                          icon={MapPinned} 
                          iconColor="text-yellow-400" 
                        />
                      </div>
                    ))}

                    <div className="space-y-1">
                      <Label className="text-[#00d4ff] text-xs uppercase font-bold flex justify-between items-center">
                        Destination
                        {stops.length < 3 && (
                          <span onClick={addStop} className="cursor-pointer flex items-center gap-1 text-gray-400 hover:text-white transition-colors">
                            <Plus className="w-3 h-3" /> Add Stop
                          </span>
                        )}
                      </Label>
                      <LocationInput 
                        id="destination" 
                        value={destination} 
                        onChange={setDestination} 
                        placeholder="Where to?" 
                        icon={Navigation} 
                        iconColor="text-[#00d4ff]" 
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Car Selection */}
                <Card className="bg-[#1a1a2e] border-white/10">
                  <CardHeader className="pb-2">
                     <CardTitle className="text-sm font-bold text-gray-400 uppercase">Select Service</CardTitle>
                  </CardHeader>
                  <CardContent className="p-2 grid grid-cols-2 gap-2">
                    {Object.entries(PRICING_RULES).map(([key, rule]) => (
                      <button
                        key={key}
                        onClick={() => setCarType(key)}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-200 ${
                          carType === key 
                            ? "bg-[#00ff88]/10 border-[#00ff88] shadow-[0_0_15px_rgba(0,255,136,0.2)]" 
                            : "bg-black/40 border-transparent hover:bg-white/5"
                        }`}
                      >
                        <span className="text-3xl mb-1">{rule.icon}</span>
                        <span className={`text-xs font-bold ${carType === key ? "text-[#00ff88]" : "text-gray-400"}`}>{rule.name}</span>
                        {fareEstimate && (
                           <span className="text-white font-bold text-sm mt-1">
                             ₾{calculateFare(key, routeInfo.distance, 0, 0, stops.length, surgeInfo?.multiplier || 1, paymentMethod).total.toFixed(2)}
                           </span>
                        )}
                      </button>
                    ))}
                  </CardContent>
                </Card>

                {/* Payment & Book Button */}
                <Card className="bg-[#1a1a2e] border-white/10">
                  <CardContent className="p-4 space-y-4">
                    {/* Payment Toggle */}
                    <div className="flex bg-black p-1 rounded-lg border border-white/10">
                       <button 
                         onClick={() => setPaymentMethod('cash')}
                         className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-bold text-sm transition-all ${paymentMethod === 'cash' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
                       >
                         <Wallet className="w-4 h-4" /> Cash
                       </button>
                       <button 
                         onClick={() => setPaymentMethod('card')}
                         className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-bold text-sm transition-all ${paymentMethod === 'card' ? 'bg-[#00d4ff] text-black' : 'text-gray-400 hover:text-white'}`}
                       >
                         <CreditCard className="w-4 h-4" /> Card (+2.00₾)
                       </button>
                    </div>

                    {/* Breakdown */}
                    {fareEstimate && (
                      <div className="space-y-1 text-xs text-gray-400 border-t border-white/10 pt-2">
                        <div className="flex justify-between"><span>Distance ({routeInfo.distance} km)</span><span>₾{fareEstimate.distance.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>Base Fare</span><span>₾{fareEstimate.base.toFixed(2)}</span></div>
                        {parseFloat(fareEstimate.serviceFee) > 0 && (
                          <div className="flex justify-between text-[#00d4ff]"><span>Card Service Fee</span><span>₾{fareEstimate.serviceFee}</span></div>
                        )}
                         {fareEstimate.surgeMultiplier > 1 && (
                          <div className="flex justify-between text-yellow-400"><span>Surge ({fareEstimate.surgeMultiplier}x)</span><span>₾{fareEstimate.surgeFee.toFixed(2)}</span></div>
                        )}
                      </div>
                    )}

                    <Button 
                      className="w-full h-14 text-lg font-bold bg-[#00ff88] hover:bg-[#00cc6a] text-black rounded-xl shadow-[0_0_20px_rgba(0,255,136,0.4)] transition-all transform hover:scale-[1.02]"
                      onClick={handleBookRide}
                      disabled={loading || !routeInfo}
                    >
                      {loading ? <Loader2 className="animate-spin" /> : (
                        <div className="flex items-center justify-between w-full px-4">
                          <span>Confirm Ride</span>
                          {fareEstimate && <span>₾{fareEstimate.total.toFixed(2)}</span>}
                        </div>
                      )}
                    </Button>
                  </CardContent>
                </Card>

              </div>

              {/* Right Column: Map Preview */}
              <div className="lg:col-span-2 relative min-h-[400px] bg-[#1a1a2e] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                 <div ref={mapRef} className="w-full h-full absolute inset-0" />
                 
                 {/* Map Overlay Info */}
                 {routeInfo && (
                   <div className="absolute top-4 left-4 right-4 flex justify-center z-10 pointer-events-none">
                      <div className="bg-black/70 backdrop-blur-md px-6 py-3 rounded-full border border-[#00ff88]/30 flex gap-6 shadow-xl">
                        <div className="flex items-center gap-2">
                           <Clock className="w-5 h-5 text-[#00ff88]" />
                           <div>
                             <p className="text-white font-bold leading-none">{routeInfo.duration} min</p>
                             <p className="text-[10px] text-gray-400 uppercase">Duration</p>
                           </div>
                        </div>
                        <div className="w-px bg-white/20" />
                        <div className="flex items-center gap-2">
                           <RouteIcon className="w-5 h-5 text-[#00d4ff]" />
                           <div>
                             <p className="text-white font-bold leading-none">{routeInfo.distance} km</p>
                             <p className="text-[10px] text-gray-400 uppercase">Distance</p>
                           </div>
                        </div>
                      </div>
                   </div>
                 )}
              </div>

            </div>
          </TabsContent>

          {/* TAB: ACTIVE RIDE */}
          <TabsContent value="active" className="h-full flex flex-col">
             {!activeRide ? (
               <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
                 <Car className="w-16 h-16 opacity-20" />
                 <p>No active ride found.</p>
                 <Button variant="outline" onClick={() => setActiveTab('book')}>Book a Ride</Button>
               </div>
             ) : (
               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full flex-1">
                 {/* Live Status Card */}
                 <div className="lg:col-span-1 space-y-4">
                    <Card className="bg-[#1a1a2e] border-[#00ff88]/30 border-l-4">
                       <CardHeader>
                          <Badge className="w-fit mb-2 bg-[#00ff88] text-black hover:bg-[#00ff88] uppercase">{activeRide.status.replace('_', ' ')}</Badge>
                          <CardTitle className="text-white">Trip in Progress</CardTitle>
                          <CardDescription className="text-gray-400">ID: #{activeRide.id}</CardDescription>
                       </CardHeader>
                       <CardContent className="space-y-4">
                          <div className="space-y-4 relative">
                            {/* Timeline Visual */}
                            <div className="absolute left-1.5 top-2 bottom-6 w-0.5 bg-gray-700" />
                            
                            <div className="relative pl-8">
                               <div className="absolute left-0 top-1 w-3.5 h-3.5 rounded-full bg-[#00ff88] ring-4 ring-black" />
                               <p className="text-xs text-gray-400">Pick Up</p>
                               <p className="text-sm text-white font-medium">{activeRide.pickup}</p>
                            </div>
                            <div className="relative pl-8">
                               <div className="absolute left-0 top-1 w-3.5 h-3.5 rounded-full bg-[#00d4ff] ring-4 ring-black" />
                               <p className="text-xs text-gray-400">Destination</p>
                               <p className="text-sm text-white font-medium">{activeRide.destination}</p>
                            </div>
                          </div>

                          {activeRide.driver && (
                            <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex items-center gap-4 mt-4">
                               <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                                  <User className="w-6 h-6 text-white" />
                               </div>
                               <div>
                                  <p className="font-bold text-[#00ff88]">{activeRide.driver.name}</p>
                                  <p className="text-xs text-white">{activeRide.driver.carModel} • {activeRide.driver.plate}</p>
                                  <div className="flex items-center gap-1 mt-1">
                                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                    <span className="text-xs text-gray-300">4.9</span>
                                  </div>
                               </div>
                            </div>
                          )}
                       </CardContent>
                       <CardFooter>
                          {activeRide.driver && (
                             <Button variant="outline" className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10">
                               Emergency Cancel
                             </Button>
                          )}
                          {!activeRide.driver && (
                             <div className="w-full flex items-center justify-center gap-2 text-yellow-400 animate-pulse">
                               <Loader2 className="animate-spin w-4 h-4" /> Searching for nearby drivers...
                             </div>
                          )}
                       </CardFooter>
                    </Card>
                 </div>

                 {/* Live Map */}
                 <div className="lg:col-span-2 relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl min-h-[500px]">
                    {/* Reuse map container, LiveTrackingMap logic handles the rendering */}
                    <div ref={mapRef} className="w-full h-full bg-[#1a1a2e]" />
                    
                    {/* Recenter Button */}
                    <Button 
                      onClick={handleRecenter} 
                      className="absolute bottom-4 right-4 rounded-full w-12 h-12 bg-black border border-[#00ff88] text-[#00ff88]"
                    >
                       <Crosshair className="w-6 h-6" />
                    </Button>
                 </div>
               </div>
             )}
          </TabsContent>

          {/* TAB: HISTORY */}
          <TabsContent value="history">
            <ScrollArea className="h-[600px] pr-4">
               <div className="space-y-4">
                  {rideHistory.length === 0 ? (
                    <div className="text-center text-gray-500 py-10">No ride history found.</div>
                  ) : (
                    rideHistory.map(ride => (
                       <Card key={ride.id} className="bg-[#1a1a2e] border-white/5 hover:border-[#00ff88]/30 transition-all">
                          <CardHeader className="flex flex-row items-center justify-between pb-2">
                             <div className="flex items-center gap-2">
                                <div className="p-2 bg-white/5 rounded-lg"><History className="w-4 h-4 text-gray-400" /></div>
                                <div>
                                  <CardTitle className="text-base text-white">{new Date(ride.created_at).toLocaleDateString()}</CardTitle>
                                  <CardDescription className="text-xs">{new Date(ride.created_at).toLocaleTimeString()}</CardDescription>
                                </div>
                             </div>
                             <Badge variant={ride.status === 'completed' ? 'default' : 'destructive'} className={ride.status === 'completed' ? 'bg-[#00ff88] text-black' : ''}>
                               {ride.status}
                             </Badge>
                          </CardHeader>
                          <CardContent className="text-sm space-y-2 pb-3">
                             <div className="flex gap-2 items-center">
                               <div className="w-2 h-2 rounded-full bg-[#00ff88]" />
                               <span className="truncate text-gray-300">{ride.pickup}</span>
                             </div>
                             <div className="flex gap-2 items-center">
                               <div className="w-2 h-2 rounded-full bg-[#00d4ff]" />
                               <span className="truncate text-gray-300">{ride.destination}</span>
                             </div>
                          </CardContent>
                          <CardFooter className="pt-0 flex justify-between items-center border-t border-white/5 mt-2 pt-3">
                             <span className="font-bold text-white">₾{ride.price}</span>
                             <span className="text-xs text-gray-500 uppercase font-bold">{ride.car_type}</span>
                          </CardFooter>
                       </Card>
                    ))
                  )}
               </div>
            </ScrollArea>
          </TabsContent>

        </Tabs>
      </main>

      {/* PAYPAL MODAL */}
      <Dialog open={showPayPal} onOpenChange={setShowPayPal}>
        <DialogContent className="bg-[#1a1a2e] border-[#00ff88]/30 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-[#00d4ff]">Secure Payment</DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-white rounded-xl mt-4">
             {fareEstimate && (
               <PayPalScriptProvider options={{ "client-id": "test", currency: "USD" }}>
                  <PayPalButtons 
                    style={{ layout: "vertical", shape: "rect" }}
                    createOrder={(data, actions) => {
                        return actions.order.create({
                            purchase_units: [{
                                amount: {
                                    // Converting GEL to USD approx for PayPal sandbox
                                    value: (fareEstimate.total * GEL_TO_USD).toFixed(2) 
                                }
                            }]
                        });
                    }}
                    onApprove={handlePayPalApprove}
                    onError={(err) => {
                       console.error(err);
                       toast.error("PayPal Error");
                    }}
                  />
               </PayPalScriptProvider>
             )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

// --- Main App Router ---
const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth" />} />
      <Route path="/auth" element={<RiderAuth />} />
      <Route 
        path="/rider/dashboard" 
        element={
          <ProtectedRoute>
             <RiderDashboard />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
};

// Simple Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
   const { user, loading } = useAuth();
   if (loading) return <div className="h-screen w-full bg-black flex items-center justify-center"><Loader2 className="animate-spin text-[#00ff88]" /></div>;
   return user ? children : <Navigate to="/auth" />;
};

export default App;