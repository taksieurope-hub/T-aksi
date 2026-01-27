import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth, API, GOOGLE_MAPS_API_KEY, useLanguage } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import {
  Car, MapPin, Clock, Star, History, Home, LogOut, User, Phone, Lock, ArrowLeft, Navigation, Wallet, Loader2, Rocket,
  Plus, X, Target, Crosshair, Zap, TrendingUp, MessageSquare, Send, Bookmark, Calendar, AlertTriangle, 
  Edit2, Trash2, Briefcase, MapPinned, FileText, Info
} from "lucide-react";

// ============================================
// CONSTANTS & UTILITIES
// ============================================
const GEORGIA_EMERGENCY = "112";
const GEL_TO_USD = 0.37;

const mapStyles = `
  .gm-style, div[aria-label="Map"] {
    min-height: 100% !important;
    height: 100% !important;
    width: 100% !important;
    border-radius: 0.5rem;
  }
`;

const PRICING_RULES = {
  economy: { key: 'vehicle_economy', base: 2.00, perKm: 0.50, perMinWait: 0.40, freeWait: 2, stopFee: 1.00, icon: "🚗" },
  comfort: { key: 'vehicle_comfort', base: 2.50, perKm: 0.55, perMinWait: 0.40, freeWait: 2, stopFee: 1.00, icon: "🚙" },
  suv: { key: 'vehicle_suv', base: 3.90, perKm: 0.80, perMinWait: 0.40, freeWait: 2, stopFee: 1.00, icon: "🚐" },
  personal: { key: 'vehicle_personal', base: 4.00, perKm: 0.70, perMinWait: 0.40, freeWait: 2, stopFee: 1.00, icon: "👤" },
  jumpstart: { key: 'vehicle_jumpstart', base: 4.50, perKm: 0.00, perMinWait: 0.00, freeWait: 999, stopFee: 0.00, icon: "⚡" }
};

const calculateFare = (carType, distanceKm, waitMin = 0, stopWaitMin = 0, numStops = 0, surgeMultiplier = 1.0) => {
  const rules = PRICING_RULES[carType] || PRICING_RULES.economy;
  let subtotal = rules.base;
  subtotal += distanceKm * rules.perKm;
  if (distanceKm > 7) subtotal += (distanceKm - 7) * 0.15;
  if (distanceKm > 30) subtotal += Math.ceil((distanceKm - 30) / 15) * 5;
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

// ============================================
// SAVED PLACES MANAGER
// ============================================
const SavedPlacesManager = ({ onSelectPlace }) => {
  const { t } = useLanguage();
  const [savedPlaces, setSavedPlaces] = useState(() => {
    const stored = localStorage.getItem("taksi_saved_places");
    return stored ? JSON.parse(stored) : [];
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPlace, setEditingPlace] = useState(null);
  const [newPlace, setNewPlace] = useState({ name: "", address: "", lat: null, lng: null, icon: "home" });

  useEffect(() => {
    localStorage.setItem("taksi_saved_places", JSON.stringify(savedPlaces));
  }, [savedPlaces]);

  const addOrUpdatePlace = () => {
    if (!newPlace.name || !newPlace.address) {
      toast.error("Please fill all fields");
      return;
    }
    if (editingPlace) {
      setSavedPlaces(savedPlaces.map(p => p.id === editingPlace.id ? { ...newPlace, id: editingPlace.id } : p));
      toast.success("Place updated!");
    } else {
      setSavedPlaces([...savedPlaces, { ...newPlace, id: Date.now() }]);
      toast.success("Place saved!");
    }
    setShowAddDialog(false);
    setEditingPlace(null);
    setNewPlace({ name: "", address: "", lat: null, lng: null, icon: "home" });
  };

  const deletePlace = (id) => {
    setSavedPlaces(savedPlaces.filter(p => p.id !== id));
    toast.success("Place deleted");
  };

  const iconMap = { home: Home, work: Briefcase, other: MapPinned };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-[#00ff88] flex items-center"><Bookmark className="w-4 h-4 mr-2" /> Saved Places</Label>
        <Button size="sm" variant="outline" className="border-[#00ff88]/30 text-[#00ff88]" onClick={() => setShowAddDialog(true)}>
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {savedPlaces.map(place => {
          const Icon = iconMap[place.icon] || MapPin;
          return (
            <Card key={place.id} className="bg-[#1a1a2e] border-[#00ff88]/20 cursor-pointer hover:border-[#00ff88] transition-all"
              onClick={() => onSelectPlace(place)}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <Icon className="w-4 h-4 text-[#00ff88]" />
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); setEditingPlace(place); setNewPlace(place); setShowAddDialog(true); }}>
                      <Edit2 className="w-3 h-3 text-blue-400" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); deletePlace(place.id); }}>
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </Button>
                  </div>
                </div>
                <p className="text-white font-bold text-sm">{place.name}</p>
                <p className="text-gray-400 text-xs truncate">{place.address}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-[#1a1a2e] border-[#00ff88]/30">
          <DialogHeader>
            <DialogTitle className="text-[#00ff88]">{editingPlace ? "Edit Place" : "Add Saved Place"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={newPlace.name} onChange={e => setNewPlace({...newPlace, name: e.target.value})} placeholder="Home, Work, etc." className="bg-black text-white" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={newPlace.address} onChange={e => setNewPlace({...newPlace, address: e.target.value})} placeholder="123 Main St, Tbilisi" className="bg-black text-white" />
            </div>
            <div>
              <Label>Icon</Label>
              <div className="flex gap-2">
                {["home", "work", "other"].map(icon => (
                  <Button key={icon} variant={newPlace.icon === icon ? "default" : "outline"} 
                    className={newPlace.icon === icon ? "bg-[#00ff88] text-black" : ""}
                    onClick={() => setNewPlace({...newPlace, icon})}>
                    {icon === "home" && <Home className="w-4 h-4" />}
                    {icon === "work" && <Briefcase className="w-4 h-4" />}
                    {icon === "other" && <MapPinned className="w-4 h-4" />}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={addOrUpdatePlace} className="bg-[#00ff88] text-black">
              {editingPlace ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ============================================
// RIDE SCHEDULING
// ============================================
const RideScheduler = ({ scheduledTime, onScheduleChange }) => {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(!!scheduledTime);
  
  const minDateTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);
    return now.toISOString().slice(0, 16);
  }, []);

  const maxDateTime = useMemo(() => {
    const max = new Date();
    max.setDate(max.getDate() + 7);
    return max.toISOString().slice(0, 16);
  }, []);

  return (
    <Card className="bg-[#00ff88]/5 border-[#00ff88]/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#00ff88]" />
            <span className="text-white font-semibold">Schedule Ride</span>
          </div>
          <Button size="sm" variant={enabled ? "default" : "outline"} 
            className={enabled ? "bg-[#00ff88] text-black" : ""}
            onClick={() => { setEnabled(!enabled); if (!enabled) onScheduleChange(null); }}>
            {enabled ? "Enabled" : "Disabled"}
          </Button>
        </div>
        {enabled && (
          <Input type="datetime-local" min={minDateTime} max={maxDateTime}
            value={scheduledTime || ""} onChange={e => onScheduleChange(e.target.value)}
            className="bg-black text-white border-[#00ff88]/30" />
        )}
      </CardContent>
    </Card>
  );
};

// ============================================
// ENHANCED LIVE TRACKING MAP
// ============================================
const LiveTrackingMap = ({ pickup, destination, driverLocation, status }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const [eta, setEta] = useState(null);
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    if (!window.google || !mapRef.current || mapInstanceRef.current) return;
    
    const initialCenter = driverLocation || pickup || { lat: 41.7151, lng: 44.8271 };
    
    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 15,
      center: initialCenter,
      disableDefaultUI: true,
      zoomControl: true,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a4a" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#00d4ff" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#000033" }] }
      ]
    });

    mapInstanceRef.current = map;

    if (driverLocation) {
      driverMarkerRef.current = new window.google.maps.Marker({
        position: driverLocation,
        map,
        icon: {
          path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#00ff88",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          rotation: 0
        },
        title: "Driver"
      });
    }

    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#00ff88", strokeWeight: 5 }
    });

    return () => {
      if (mapInstanceRef.current) {
        window.google.maps.event.clearInstanceListeners(mapInstanceRef.current);
      }
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setMap(null);
      }
    };
  }, []);

  useEffect(() => {
    if (!driverMarkerRef.current || !driverLocation?.lat) return;
    
    const newPos = new window.google.maps.LatLng(driverLocation.lat, driverLocation.lng);
    driverMarkerRef.current.setPosition(newPos);
    
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo(newPos);
    }
  }, [driverLocation]);

  useEffect(() => {
    if (!window.google || !directionsRendererRef.current || !pickup?.lat) return;

    const start = driverLocation?.lat ? driverLocation : pickup;
    const end = (status === 'in_progress' && destination?.lat) ? destination : pickup;

    if (!end?.lat) return;

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route({
      origin: new window.google.maps.LatLng(start.lat, start.lng),
      destination: new window.google.maps.LatLng(end.lat, end.lng),
      travelMode: window.google.maps.TravelMode.DRIVING
    }, (result, status) => {
      if (status === 'OK' && result.routes[0]?.legs[0]) {
        directionsRendererRef.current.setDirections(result);
        setEta(result.routes[0].legs[0].duration.text);
        setDistance(result.routes[0].legs[0].distance.text);
      }
    });
  }, [driverLocation, pickup, destination, status]);

  return (
    <div className="relative w-full h-[350px] rounded-xl overflow-hidden border border-[#00ff88]/30">
      <div ref={mapRef} className="w-full h-full" />
      {eta && (
        <div className="absolute top-4 right-4 bg-black/90 border border-[#00ff88] px-4 py-3 rounded-lg backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <Navigation className="w-5 h-5 text-[#00ff88] animate-pulse" />
            <div>
              <p className="text-[#00ff88] font-bold text-lg">{eta}</p>
              <p className="text-white text-xs">{distance}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// DETAILED RIDE HISTORY MODAL
// ============================================
const RideDetailsModal = ({ ride, isOpen, onClose }) => {
  const { t } = useLanguage();
  if (!ride) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a2e] border-[#00ff88]/30 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#00ff88] flex items-center">
            <FileText className="w-5 h-5 mr-2" /> Ride Receipt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-black/50 p-4 rounded-xl">
            <div className="flex justify-between items-center mb-3">
              <Badge className="bg-green-500">COMPLETED</Badge>
              <span className="text-gray-400 text-sm">{new Date(ride.created_at).toLocaleString()}</span>
            </div>

            <Separator className="my-3 bg-gray-700" />

            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#00ff88] mt-1" />
                <div>
                  <p className="text-gray-400">Pickup</p>
                  <p className="text-white">{ride.pickup}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Navigation className="w-4 h-4 text-[#00d4ff] mt-1" />
                <div>
                  <p className="text-gray-400">Destination</p>
                  <p className="text-white">{ride.destination}</p>
                </div>
              </div>
            </div>

            <Separator className="my-3 bg-gray-700" />

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Vehicle Type</span>
                <span className="text-white capitalize">{ride.carType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Distance</span>
                <span className="text-white">{ride.estimatedDistance} km</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Duration</span>
                <span className="text-white">{ride.estimatedDuration} min</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Payment</span>
                <span className="text-white capitalize">{ride.paymentMethod}</span>
              </div>
              <Separator className="my-2 bg-gray-700" />
              <div className="flex justify-between font-bold">
                <span className="text-white">Total Fare</span>
                <span className="text-[#00ff88] text-lg">₾{(ride.final_fare || ride.estimated_fare)?.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {ride.driver_info && (
            <div className="bg-black/50 p-3 rounded-xl">
              <p className="text-gray-400 text-xs mb-2">Driver</p>
              <div className="flex items-center gap-3">
                <User className="w-8 h-8 text-[#00ff88]" />
                <div>
                  <p className="text-white font-semibold">{ride.driver_info.name}</p>
                  <p className="text-gray-400 text-sm">{ride.driver_info.license_plate}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================
// CHAT INTERFACE
// ============================================
const ChatInterface = ({ rideId, driverName }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const { user } = useAuth();
  const { t } = useLanguage();

  const fetchMessages = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/rides/${rideId}/chat`);
      setMessages(res.data.messages || []);
      await axios.post(`${API}/rides/${rideId}/chat/read`);
    } catch (error) { console.error("Chat error:", error); }
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
      await axios.post(`${API}/rides/${rideId}/chat`, { message: newMessage });
      setNewMessage("");
      fetchMessages();
    } catch (error) { toast.error("Failed to send"); }
    finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black">
        {messages.length === 0 && <p className="text-gray-500 text-center mt-10">No messages yet</p>}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender_id === user.id ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl p-3 ${msg.sender_id === user.id ? "bg-[#00ff88] text-black" : "bg-[#1a1a2e] text-white"}`}>
              <p className="text-sm">{msg.message}</p>
              <p className="text-xs opacity-60 mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={sendMessage} className="p-4 border-t border-[#00ff88]/20 flex gap-2">
        <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type message..." className="bg-black text-white" />
        <Button type="submit" disabled={sending} className="bg-[#00ff88] text-black"><Send className="w-4 h-4" /></Button>
      </form>
    </div>
  );
};

// ============================================
// MAP PICKER & LOCATION INPUT
// ============================================
const useGoogleMapsAutocomplete = (inputRef, onPlaceSelect) => {
  useEffect(() => {
    if (!inputRef.current || !window.google) return;
    
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'ge' },
      fields: ['formatted_address', 'geometry', 'name']
    });

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        if(inputRef.current) inputRef.current.value = place.formatted_address || place.name;
        onPlaceSelect({
          address: place.formatted_address || place.name,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        });
      }
    });

    return () => window.google.maps.event.removeListener(listener);
  }, [inputRef, onPlaceSelect]);
};

const MapPicker = ({ isOpen, onClose, onLocationSelect, title, initialLocation }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  
  useEffect(() => {
    if (!isOpen || !mapRef.current || !window.google) return;

    const defaultCenter = initialLocation || { lat: 41.7151, lng: 44.8271 };

    const map = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter, zoom: 14,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a4a" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#000033" }] }
      ],
      disableDefaultUI: true, zoomControl: true
    });

    mapInstanceRef.current = map;

    const marker = new window.google.maps.Marker({
      map, draggable: true, position: defaultCenter,
      icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 12, fillColor: "#00ff88", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 }
    });

    markerRef.current = marker;

    const updateLocation = (latLng) => {
      const lat = latLng.lat(); 
      const lng = latLng.lng();
      marker.setPosition(latLng); 
      setSelectedLocation({ lat, lng });
      reverseGeocode(lat, lng);
    };

    map.addListener('click', (e) => updateLocation(e.latLng));
    marker.addListener('dragend', () => updateLocation(marker.getPosition()));

    if (initialLocation) { 
      marker.setPosition(initialLocation); 
      setSelectedLocation(initialLocation); 
      reverseGeocode(initialLocation.lat, initialLocation.lng); 
    }

    return () => {
      if (mapInstanceRef.current) window.google.maps.event.clearInstanceListeners(mapInstanceRef.current);
      if (markerRef.current) markerRef.current.setMap(null);
    };
  }, [isOpen, initialLocation]);
  
  const reverseGeocode = async (lat, lng) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results[0]) setAddress(results[0].formatted_address);
    });
  };
  
    const getCurrentLocation = () => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (mapInstanceRef.current) { mapInstanceRef.current.setCenter(pos); mapInstanceRef.current.setZoom(16); }
        if (markerRef.current) markerRef.current.setPosition(pos);
        setSelectedLocation(pos); reverseGeocode(pos.lat, pos.lng); setLoading(false);
      },
      () => { toast.error("Could not get location"); setLoading(false); },
      { enableHighAccuracy: true }
    );
  };
  
  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationSelect({
        address: address || "Selected Location",
        lat: selectedLocation.lat,
        lng: selectedLocation.lng
      });
      onClose();
    } else {
      toast.error("Please select a location on the map");
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black border border-[#00ff88]/30 w-[95vw] max-w-md h-[90vh] flex flex-col p-0 gap-0">
        <style>{mapStyles}</style>
        <DialogHeader className="p-4 bg-black/80 z-10 w-full border-b border-[#00ff88]/20 flex-none">
          <DialogTitle className="text-[#00ff88] flex items-center">
            <MapPin className="w-5 h-5 mr-2" /> {title || t('select_location')}
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-xs">
              Drag map to pin location.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 w-full min-h-[300px] relative">
          <div ref={mapRef} className="w-full h-full" />
        </div>
        
        <div className="w-full p-4 bg-black border-t border-[#00ff88]/30 flex flex-col gap-3 flex-none">
            {address && (
            <div className="bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-xl p-3">
                <p className="text-[#00ff88] text-xs font-bold uppercase">Selected Address:</p>
                <p className="text-white text-sm truncate">{address}</p>
            </div>
            )}
            
            <div className="flex gap-2">
            <Button
                variant="outline"
                className="border-[#00d4ff]/30 text-[#00d4ff] flex-1"
                onClick={getCurrentLocation}
                disabled={loading}
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crosshair className="w-4 h-4 mr-2" />}
                {t('gps_btn')}
            </Button>
            <Button 
                className="flex-1 bg-[#00ff88] text-black font-bold"
                onClick={handleConfirm}
                disabled={!selectedLocation}
            >
                {t('confirm_location')}
            </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const LocationInput = ({ value, onChange, onMapSelect, placeholder, icon: Icon, iconColor }) => {
  const inputRef = useRef(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  
  useGoogleMapsAutocomplete(inputRef, (place) => {
    onChange({ address: place.address, lat: place.lat, lng: place.lng });
  });

  useEffect(() => {
      if(inputRef.current && value?.address && inputRef.current.value !== value.address) {
          inputRef.current.value = value.address;
      }
  }, [value]);
  
  return (
    <>
      <div className="relative flex items-center">
        <Icon className={`absolute left-3 h-4 w-4 ${iconColor}`} />
        <Input
          ref={inputRef}
          defaultValue={value?.address || ""}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          className="pl-10 pr-10 bg-black/50 border-[#00ff88]/30 text-white"
          placeholder={placeholder}
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 text-[#00d4ff] hover:bg-[#00d4ff]/20"
          onClick={() => setShowMapPicker(true)}
        >
          <Target className="w-4 h-4" />
        </Button>
      </div>
      
      <MapPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onLocationSelect={(loc) => onChange(loc)}
        title={placeholder}
        initialLocation={value?.lat ? { lat: value.lat, lng: value.lng } : null}
      />
    </>
  );
};

// ============================================
// AUTH COMPONENT
// ============================================
const RiderAuth = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    name: "", surname: "", cellphone: "", password: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/register/rider";
      const res = await axios.post(`${API}${endpoint}`, formData);
      
      if (res.data && res.data.token && res.data.user) {
        login(res.data.token, res.data.user);
        toast.success(isLogin ? t('login_welcome') : "Account created!");
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
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('back_btn')}
          </Button>
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-10 h-10 text-black" />
          </div>
          <CardTitle className="text-2xl text-[#00ff88]">
            {isLogin ? t('login_welcome') : t('join_taksi')}
          </CardTitle>
          <CardDescription className="text-[#00d4ff]/70">
            {isLogin ? t('login_subtitle') : t('join_subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#00ff88]">{t('first_name')}</Label>
                  <Input
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="bg-black/50 border-[#00ff88]/30 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#00ff88]">{t('last_name')}</Label>
                  <Input
                    value={formData.surname}
                    onChange={e => setFormData({...formData, surname: e.target.value})}
                    className="bg-black/50 border-[#00ff88]/30 text-white"
                    required
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-[#00ff88]">{t('phone_number')}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />
                <Input
                  type="tel"
                  value={formData.cellphone}
                  onChange={e => setFormData({...formData, cellphone: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
                  placeholder="+995 XXX XXX XXX"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[#00ff88]">{t('password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-[#00ff88]/50" />
                <Input
                  type="password"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="pl-10 bg-black/50 border-[#00ff88]/30 text-white"
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isLogin ? t('sign_in_btn') : t('create_account_btn')}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="link" className="text-[#00d4ff]" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? t('need_account') : t('have_account')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

// ============================================
// RIDER DASHBOARD
// ============================================
const RiderDashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("book");
  const [loading, setLoading] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [waitTime, setWaitTime] = useState(0);
  const [selectedHistoryRide, setSelectedHistoryRide] = useState(null);

  const pollRef = useRef(null);
  
  // Booking state
  const [pickup, setPickup] = useState({ address: "", lat: null, lng: null });
  const [destination, setDestination] = useState({ address: "", lat: null, lng: null });
  const [stops, setStops] = useState([]);
  const [carType, setCarType] = useState("economy");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [scheduledTime, setScheduledTime] = useState(null);
  
  const [topupAmount, setTopupAmount] = useState("");
  const [routeInfo, setRouteInfo] = useState(null);
  const [fareEstimate, setFareEstimate] = useState(null);
  const [surgeInfo, setSurgeInfo] = useState(null);

  // Rating State
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [completedRideInfo, setCompletedRideInfo] = useState(null);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Load Maps
  useEffect(() => {
    if (window.google) {
      setMapsLoaded(true);
      return;
    }
    if (!GOOGLE_MAPS_API_KEY) return;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;
    script.async = true;
    script.onload = () => setMapsLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
      let interval;
      if (activeRide?.status === 'arrived' && activeRide.arrived_at) {
          const arrivalTime = new Date(activeRide.arrived_at).getTime();
          interval = setInterval(() => {
              const now = Date.now();
              const diffMinutes = Math.floor((now - arrivalTime) / 60000);
              setWaitTime(diffMinutes > 0 ? diffMinutes : 0);
          }, 1000);
      } else {
          setWaitTime(0);
      }
      return () => clearInterval(interval);
  }, [activeRide]);

  useEffect(() => {
    fetchActiveRide();
    fetchRideHistory();
    fetchSurgeStatus();
  }, []);
  
  useEffect(() => {
    if (pickup.lat) fetchSurgeStatus();
  }, [pickup.lat, pickup.lng]);

  useEffect(() => {
    if (mapsLoaded && pickup.lat && destination.lat) calculateRoute();
  }, [pickup, destination, stops, mapsLoaded]);

  useEffect(() => {
    if (routeInfo) {
      const surge = surgeInfo?.multiplier || 1.0;
      const fare = calculateFare(carType, routeInfo.distance, waitTime, 0, stops.length, surge);
      setFareEstimate(fare);
    }
  }, [routeInfo, carType, stops.length, surgeInfo, waitTime]);
  
  const fetchSurgeStatus = async () => {
    try {
      const params = pickup.lat ? `?lat=${pickup.lat}&lng=${pickup.lng}` : '';
      const res = await axios.get(`${API}/surge/status${params}`);
      setSurgeInfo(res.data);
    } catch (error) { console.error("Error fetching surge:", error); }
  };

  const calculateRoute = async () => {
    if (!window.google || !pickup.lat || !destination.lat) return;
    const directionsService = new window.google.maps.DirectionsService();
    const waypoints = stops.filter(s => s.lat && s.lng).map(s => ({ location: new window.google.maps.LatLng(s.lat, s.lng), stopover: true }));
    
    directionsService.route(
      { origin: new window.google.maps.LatLng(pickup.lat, pickup.lng), destination: new window.google.maps.LatLng(destination.lat, destination.lng), waypoints, travelMode: window.google.maps.TravelMode.DRIVING, optimizeWaypoints: false },
      (result, status) => {
        if (status === 'OK') {
          let totalDistance = 0; let totalDuration = 0;
          result.routes[0].legs.forEach(leg => { totalDistance += leg.distance.value; totalDuration += leg.duration.value; });
          setRouteInfo({ distance: Math.round(totalDistance / 100) / 10, duration: Math.round(totalDuration / 60) });
        }
      }
    );
  };

  const fetchActiveRide = async () => {
    try {
      const res = await axios.get(`${API}/rider/active-ride`);
      if (res.data) { setActiveRide(res.data); setActiveTab("active"); pollRideStatus(res.data.id); }
    } catch (error) { console.error("Error fetching active ride:", error); }
  };

  const fetchRideHistory = async () => {
    try { const res = await axios.get(`${API}/rider/history`); setRideHistory(res.data.rides || []); } catch (error) { console.error("Error fetching history:", error); }
  };

  const addStop = () => { if (stops.length < 3) { setStops([...stops, { address: "", lat: null, lng: null, order: stops.length }]); } else { toast.error("Maximum 3 stops allowed"); } };
  const updateStop = (index, data) => { const newStops = [...stops]; newStops[index] = { ...newStops[index], ...data }; setStops(newStops); };
  const removeStop = (index) => { setStops(stops.filter((_, i) => i !== index)); };

  const handleBookRide = async (paid = false) => {
    if (!pickup.lat || !pickup.address) { toast.error("Please select pickup location"); return; }
    setLoading(true);
    try {
      const rideData = {
        pickup: pickup.address, pickupLat: pickup.lat, pickupLng: pickup.lng,
        destination: destination.address || null, destinationLat: destination.lat, destinationLng: destination.lng,
        stops: stops.filter(s => s.lat).map((s, i) => ({ address: s.address, lat: s.lat, lng: s.lng, order: i })),
        carType, paymentMethod, estimatedDistance: routeInfo?.distance || 5, estimatedDuration: routeInfo?.duration || 15, paid,
        scheduledTime: scheduledTime || null
      };
      const res = await axios.post(`${API}/rides/request`, rideData);
      toast.success(scheduledTime ? "Ride scheduled successfully!" : t('searching_driver'));
      setActiveRide({ id: res.data.ride_id, status: "searching", estimated_fare: res.data.estimated_fare, fare_breakdown: res.data.fare_breakdown });
      setActiveTab("active");
      pollRideStatus(res.data.ride_id);
    } catch (error) { toast.error(error.response?.data?.detail || "Failed to request ride"); } finally { setLoading(false); }
  };

  const handleWalletTopUp = async (details) => {
      const amount = parseFloat(topupAmount);
      try {
          await axios.post(`${API}/rider/wallet/topup`, { amount, reference: details.orderID });
          updateUser({ ...user, wallet_balance: (user.wallet_balance || 0) + amount });
          toast.success(`Success! ₾${amount} added to wallet.`);
          setTopupAmount("");
      } catch (e) { toast.error("Top up failed"); }
  };

  const pollRideStatus = async (rideId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API}/rides/${rideId}`);
        setActiveRide(res.data);
        
        if (["completed", "cancelled", "no_drivers"].includes(res.data.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          
          if (res.data.status === "completed") {
            setCompletedRideInfo(res.data); 
            setShowRatingModal(true);
            fetchRideHistory();
          } else if (res.data.status === "no_drivers") {
            toast.error("No drivers available. Please try again.");
            setActiveRide(null); 
          } else if (res.data.status === "cancelled") {
            toast.info(t('ride_cancelled'));
            setActiveRide(null);
          }
        }
      } catch (error) {
        if (error.response?.status === 404) clearInterval(pollRef.current);
      }
    }, 5000);
  };

  const handleCancelRide = async () => {
    if (!activeRide) return;
    try { await axios.post(`${API}/rides/${activeRide.id}/cancel`); if (pollRef.current) clearInterval(pollRef.current); toast.success("Ride cancelled"); setActiveRide(null); setActiveTab("book"); } catch (error) { toast.error("Failed to cancel ride"); }
  };

  const submitRating = async () => {
    try {
      await axios.post(`${API}/rides/${completedRideInfo.id}/rate-rider`, { rating, review });
      toast.success(t('submit_feedback'));
      setShowRatingModal(false);
      setRating(0);
      setReview("");
    } catch (error) {
      toast.error("Failed to submit rating");
    }
  };

  const triggerSOS = () => {
    window.location.href = `tel:${GEORGIA_EMERGENCY}`;
    toast.error("Connecting to Georgia Emergency Services (112)");
  };

  const carTypes = Object.entries(PRICING_RULES).map(([key, val]) => ({
    value: key,
    label: t(val.key),
    icon: val.icon,
    base: val.base
  }));

  const statusColors = {
    searching: "bg-yellow-500 text-black",
    accepted: "bg-blue-500 text-white",
    arrived: "bg-purple-500 text-white",
    in_progress: "bg-[#00ff88] text-black",
    completed: "bg-green-600 text-white",
    cancelled: "bg-red-500 text-white",
    no_drivers: "bg-gray-500 text-white"
  };

  return (
    <div className="min-h-screen bg-black">
      <style>{mapStyles}</style>
      
      {/* Header with SOS */}
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
            <Button variant="destructive" size="sm" onClick={triggerSOS} className="animate-pulse">
              <AlertTriangle className="w-4 h-4 mr-1" /> SOS 112
            </Button>
            <Button variant="ghost" size="icon" className="text-[#00ff88]" onClick={() => navigate("/")}>
              <Home className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-[#00ff88]" onClick={logout}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-2xl pb-24">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 bg-black/50 border border-[#00ff88]/20 mb-6">
            <TabsTrigger value="book" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm"><Car className="w-4 h-4 sm:mr-2" /> Book</TabsTrigger>
            <TabsTrigger value="active" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm"><Navigation className="w-4 h-4 sm:mr-2" /> Ride</TabsTrigger>
            <TabsTrigger value="wallet" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm"><Wallet className="w-4 h-4 sm:mr-2" /> Wallet</TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm"><History className="w-4 h-4 sm:mr-2" /> History</TabsTrigger>
            <TabsTrigger value="profile" className="data-[state=active]:bg-[#00ff88] data-[state=active]:text-black text-xs sm:text-sm"><User className="w-4 h-4 sm:mr-2" /> Profile</TabsTrigger>
          </TabsList>

          {/* BOOK TAB */}
          <TabsContent value="book">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/30">
              <CardHeader>
                <CardTitle className="text-[#00ff88] flex items-center">
                  <Rocket className="w-5 h-5 mr-2" /> Book Your Ride
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                
                {/* Saved Places */}
                <SavedPlacesManager onSelectPlace={(place) => setDestination(place)} />

                {/* Ride Scheduler */}
                <RideScheduler scheduledTime={scheduledTime} onScheduleChange={setScheduledTime} />
                
                {/* Pickup */}
                <div className="space-y-2">
                    <Label className="text-[#00ff88]">Pickup Location</Label>
                    <LocationInput value={pickup} onChange={setPickup} placeholder="Current location" icon={MapPin} iconColor="text-[#00ff88]" />
                </div>

                {/* Stops */}
                {stops.map((stop, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-yellow-400">Stop {index + 1}</Label>
                      <Button variant="ghost" size="sm" className="text-red-400 h-6" onClick={() => removeStop(index)}><X className="w-3 h-3" /></Button>
                    </div>
                    <LocationInput value={stop} onChange={(data) => updateStop(index, data)} placeholder={`Stop ${index + 1}`} icon={MapPin} iconColor="text-yellow-400" />
                  </div>
                ))}
                {stops.length < 3 && (
                    <Button variant="outline" className="w-full border-dashed border-yellow-400/30 text-yellow-400" onClick={addStop}>
                      <Plus className="w-4 h-4 mr-2" /> Add Stop (+₾{PRICING_RULES[carType]?.stopFee.toFixed(2)})
                    </Button>
                )}

                {/* Destination */}
                <div className="space-y-2">
                    <Label className="text-[#00d4ff]">Destination</Label>
                    <LocationInput value={destination} onChange={setDestination} placeholder="Where to?" icon={Navigation} iconColor="text-[#00d4ff]" />
                </div>

                {/* Fare Breakdown */}
                {routeInfo && fareEstimate && (
                  <div className="bg-[#1a1a2e] border border-[#00ff88]/30 rounded-xl overflow-hidden">
                    <div className="bg-[#00ff88]/10 p-3 flex justify-between items-center border-b border-[#00ff88]/10">
                        <span className="text-[#00ff88] text-sm font-bold flex items-center">
                          <TrendingUp className="w-4 h-4 mr-2" /> Fare Breakdown
                        </span>
                        <span className="text-white text-xs opacity-70">
                          {routeInfo.distance}km • {routeInfo.duration}min
                        </span>
                    </div>
                    
                    <div className="p-4 space-y-2 text-sm">
                        <div className="flex justify-between text-gray-400">
                          <span>Base Fare</span>
                          <span>₾{fareEstimate.base.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Mileage ({routeInfo.distance}km)</span>
                          <span>₾{fareEstimate.distance.toFixed(2)}</span>
                        </div>


                        
                        {fareEstimate.surgeFee > 0 && (
                          <div className="flex justify-between text-orange-400 font-bold bg-orange-500/10 p-1 rounded">
                             <span className="flex items-center"><Zap className="w-3 h-3 mr-1" /> {t('traffic_surge')}</span>
                             <span>+₾{fareEstimate.surgeFee.toFixed(2)}</span>
                          </div>
                        )}

                        <div className="my-2 border-t border-gray-700"></div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-white font-bold">{t('total_estimate')}</span>
                          <span className="text-[#00ff88] text-xl font-bold">₾{fareEstimate.total.toFixed(2)}</span>
                        </div>
                    </div>
                  </div>
                )}

                {/* Car Types */}
                <div className="grid grid-cols-3 gap-2">
                    {carTypes.map((type) => (
                        <button
                            key={type.value}
                            onClick={() => setCarType(type.value)}
                            className={`p-2 rounded-xl border transition-all flex flex-col items-center ${
                                carType === type.value ? "border-[#00ff88] bg-[#00ff88]/20" : "border-gray-700 bg-black"
                            }`}
                        >
                            <span className="text-xl">{type.icon}</span>
                            <span className="text-white text-xs mt-1">{type.label}</span>
                            <span className="text-[#00ff88] text-xs font-bold mt-1">
                                {routeInfo ? `₾${calculateFare(type.value, routeInfo.distance, 0, 0, 0, surgeInfo?.multiplier).total.toFixed(0)}` : `₾${type.base}`}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Payment */}
                <div className="flex gap-2">
                    <Button variant={paymentMethod === "cash" ? "default" : "outline"} onClick={() => setPaymentMethod("cash")} className={`w-1/2 ${paymentMethod === "cash" ? "bg-[#00ff88] text-black" : "border-[#00ff88]/30 text-white"}`}>💵 {t('cash')}</Button>
                    <Button variant={paymentMethod === "card" ? "default" : "outline"} onClick={() => setPaymentMethod("card")} className={`w-1/2 ${paymentMethod === "card" ? "bg-[#00d4ff] text-black" : "border-[#00d4ff]/30 text-white"}`}>💳 {t('paypal')}</Button>
                </div>

                {paymentMethod === 'card' ? (
                   <div className="mt-4 p-2 bg-white rounded-xl">
                      <PayPalButtons 
                         style={{ layout: "vertical", shape: "rect", borderRadius: 10 }}
                         disabled={!fareEstimate || !pickup.lat}
                         forceReRender={[fareEstimate?.total]}
                         createOrder={async (data, actions) => actions.order.create({ purchase_units: [{ amount: { value: fareEstimate.total, currency_code: "USD" } }] })}
                         onApprove={async (data, actions) => { await actions.order.capture(); handleBookRide(true); }}
                      />
                   </div>
                ) : (
                    <Button
                       className="w-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold text-lg py-6 mt-4 shadow-[0_0_20px_rgba(0,255,136,0.3)] hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all"
                       onClick={() => handleBookRide(false)}
                       disabled={loading || !pickup.lat}
                    >
                       {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : t('request_ride_btn')}
                    </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* --- ACTIVE TAB --- */}
          <TabsContent value="active">
            {activeRide ? (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30 overflow-hidden">
                {['accepted', 'arrived', 'in_progress'].includes(activeRide.status) && (
                    <LiveTrackingMap 
                        pickup={{ lat: parseFloat(activeRide.pickupLat), lng: parseFloat(activeRide.pickupLng) }}
                        destination={{ lat: parseFloat(activeRide.destinationLat || 0), lng: parseFloat(activeRide.destinationLng || 0) }}
                        driverLocation={{ 
                            lat: activeRide.driver_info?.lat || parseFloat(activeRide.pickupLat) + 0.005, 
                            lng: activeRide.driver_info?.lng || parseFloat(activeRide.pickupLng) + 0.005 
                        }}
                        status={activeRide.status}
                    />
                )}
                
                <CardContent className="space-y-4 pt-4">
                  <div className="flex justify-between items-center mb-2">
                      <Badge className={`${statusColors[activeRide.status]} text-sm px-3 py-1`}>
                         {activeRide.status?.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                      <div className="text-right">
                         <p className="text-gray-400 text-xs">{t('otp_code')}</p>
                         <p className="text-[#00ff88] font-mono font-bold text-lg tracking-widest">{activeRide.otp || "----"}</p>
                      </div>
                   </div>

                   {activeRide.driver_info && (
                     <div className="bg-[#1a1a2e] rounded-xl p-4 border border-[#00d4ff]/20 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 bg-[#00d4ff]/10 rounded-bl-xl text-[#00d4ff] text-xs font-bold">
                           {activeRide.driver_info.car_make} {activeRide.driver_info.car_model}
                        </div>
                        
                        <div className="flex items-center gap-4 mt-2">
                           <div className="w-16 h-16 rounded-full bg-gray-700 border-2 border-[#00ff88] flex items-center justify-center overflow-hidden">
                              <User className="w-8 h-8 text-gray-400" />
                           </div>
                           
                           <div className="flex-1">
                              <h3 className="text-white font-bold text-lg">{activeRide.driver_info.name}</h3>
                              <div className="flex items-center text-yellow-400 text-sm">
                                 <Star size={14} fill="currentColor" className="mr-1"/> 4.9 • <span className="text-gray-400 ml-1">1,240 rides</span>
                              </div>
                              <div className="mt-2 bg-white text-black font-mono font-bold px-3 py-1 rounded inline-block border-l-4 border-blue-600">
                                 {activeRide.driver_info.license_plate}
                              </div>
                           </div>
                           
                           <div className="flex flex-col gap-2">
                              <Button size="icon" className="rounded-full bg-[#00ff88] text-black hover:bg-[#00ff88]/80">
                                 <Phone size={18} />
                              </Button>
                              
                              <Sheet>
                                 <SheetTrigger asChild>
                                   <Button size="icon" className="rounded-full bg-[#00d4ff] text-black hover:bg-[#00d4ff]/80 relative">
                                     <MessageSquare size={18} />
                                     {activeRide.unread_messages > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-red-500 w-3 h-3 rounded-full border-2 border-black"></span>
                                     )}
                                   </Button>
                                 </SheetTrigger>
                                 <SheetContent side="bottom" className="h-[80vh] bg-black border-t border-[#00ff88]/30">
                                     <ChatInterface rideId={activeRide.id} driverName={activeRide.driver_info.name} />
                                 </SheetContent>
                              </Sheet>
                           </div>
                        </div>
                     </div>
                   )}

                   <div className="space-y-4 px-2 relative">
                      <div className="absolute left-[19px] top-3 bottom-8 w-0.5 bg-gray-700"></div>
                      <div className="flex gap-3 relative z-10">
                         <div className="w-4 h-4 rounded-full bg-[#00ff88] mt-1 shadow-[0_0_10px_#00ff88]"></div>
                         <div><p className="text-xs text-gray-500">{t('pickup_label')}</p><p className="text-white text-sm">{activeRide.pickup}</p></div>
                      </div>
                      <div className="flex gap-3 relative z-10">
                         <div className="w-4 h-4 rounded-full bg-[#00d4ff] mt-1 shadow-[0_0_10px_#00d4ff]"></div>
                         <div><p className="text-xs text-gray-500">{t('destination_label')}</p><p className="text-white text-sm">{activeRide.destination || t('where_to')}</p></div>
                      </div>
                   </div>

                   {["searching", "accepted"].includes(activeRide.status) && (
                      <Button variant="ghost" className="w-full text-red-500 hover:text-red-400 hover:bg-red-500/10 mt-4" onClick={handleCancelRide}>{t('cancel_ride')}</Button>
                   )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-center py-12">
                <Navigation className="w-20 h-20 mx-auto text-[#00ff88]/30 mb-4" />
                <p className="text-[#00ff88]/60 text-lg">No active ride</p>
                <Button className="mt-6 bg-[#00ff88] text-black font-bold" onClick={() => setActiveTab("book")}>{t('book_your_ride')}</Button>
              </Card>
            )}
          </TabsContent>

          {/* --- WALLET TAB --- */}
          <TabsContent value="wallet">
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/30">
                <CardHeader><CardTitle className="text-[#00ff88]">{t('wallet_title')}</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="text-center p-6 bg-[#00ff88]/10 rounded-xl border border-[#00ff88]/20">
                      <p className="text-sm text-gray-400 uppercase">{t('balance_label')}</p>
                      <p className="text-4xl font-bold text-[#00ff88]">₾{user?.wallet_balance?.toFixed(2) || "0.00"}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>{t('add_money')}</Label>
                        <Input type="number" placeholder={t('enter_amount')} value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} className="bg-black/50 border-[#00d4ff]/30 text-white" />
                    </div>
                    {topupAmount && parseFloat(topupAmount) > 0 && (
                        <div className="bg-white p-2 rounded-lg">
                           <PayPalButtons style={{ layout: "vertical", shape: "rect" }} createOrder={(data, actions) => actions.order.create({ purchase_units: [{ amount: { value: topupAmount, currency_code: "USD" } }] })} onApprove={async (data, actions) => { await actions.order.capture(); handleWalletTopUp(data); }} />
                        </div>
                    )}
                </CardContent>
              </Card>
          </TabsContent>

          {/* --- HISTORY TAB --- */}
          <TabsContent value="history">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
              <CardHeader><CardTitle className="text-[#00ff88]">{t('ride_history')}</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {rideHistory.length === 0 && <div className="text-center text-gray-500 py-8">{t('no_rides')}</div>}
                    {rideHistory.map(ride => (
                      <div key={ride.id} className="bg-black/50 border border-[#00ff88]/10 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between">
                          <Badge className={statusColors[ride.status]}>{ride.status?.replace(/_/g, ' ').toUpperCase()}</Badge>
                          <span className="text-gray-400 text-sm">{ride.created_at ? new Date(ride.created_at).toLocaleDateString() : "N/A"}</span>
                        </div>
                        <div>
                          <p className="text-sm text-[#00ff88]/60">From: {ride.pickup}</p>
                          <p className="text-sm text-[#00d4ff]/60">To: {ride.destination || "Open"}</p>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 capitalize">{ride.carType}</span>
                          <span className="text-[#00ff88] font-bold">₾{(ride.final_fare || ride.estimated_fare)?.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

           {/* --- PROFILE TAB --- */}
           <TabsContent value="profile">
              <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 text-white">
                <CardHeader><CardTitle className="text-[#00ff88]">{t('profile_title')}</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center"><User className="w-10 h-10 text-black" /></div>
                    <div><h3 className="text-2xl font-bold">{user?.name} {user?.surname}</h3><p className="text-[#00d4ff]">{user?.cellphone}</p></div>
                  </div>
                  <Separator className="bg-[#00ff88]/20" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/50 border border-[#00ff88]/20 rounded-xl p-4 text-center">
                      <Car className="w-8 h-8 mx-auto text-[#00d4ff] mb-2" /><p className="text-2xl font-bold">{user?.total_rides || 0}</p><p className="text-[#00ff88]/60 text-sm">{t('total_rides')}</p>
                    </div>
                    <div className="bg-black/50 border border-[#00ff88]/20 rounded-xl p-4 text-center">
                      <Star className="w-8 h-8 mx-auto text-yellow-400 mb-2" /><p className="text-2xl font-bold">{user?.rating?.toFixed(1) || "5.0"}</p><p className="text-[#00ff88]/60 text-sm">{t('rating_label')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
          </TabsContent>

        </Tabs>

        {/* RATING MODAL */}
        <Dialog open={showRatingModal} onOpenChange={setShowRatingModal}>
           <DialogContent className="bg-[#1a1a2e] border border-[#00ff88]/20 text-white">
              <DialogHeader><DialogTitle className="text-[#00ff88]">{t('rate_driver')}</DialogTitle></DialogHeader>
              <DialogDescription className="text-gray-400">How was your ride with {completedRideInfo?.driver_info?.name}?</DialogDescription>
              <div className="flex justify-center space-x-2 my-4">
                 {[1,2,3,4,5].map(s => (
                    <Button key={s} variant="ghost" onClick={() => setRating(s)} className={`p-1 hover:bg-transparent ${s <= rating ? "text-yellow-400" : "text-gray-600"}`}>
                        <Star className={`w-8 h-8 ${s <= rating ? "fill-current" : ""}`} />
                    </Button>
                 ))}
              </div>
              <textarea 
                  placeholder="Comments..." 
                  value={review} 
                  onChange={e => setReview(e.target.value)} 
                  className="w-full bg-black/50 text-white p-2 rounded border border-gray-700 min-h-[80px]" 
              />
              <Button onClick={submitRating} className="w-full bg-[#00ff88] text-black mt-4 font-bold">{t('submit_feedback')}</Button>
           </DialogContent>
        </Dialog>

      </main>
    </div>
  );
};

// Main Router
const RiderPortal = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user || user.user_type !== "rider") {
    if (location.pathname === "/rider" || location.pathname === "/rider/") {
      return <RiderAuth />;
    }
    return <Navigate to="/rider" replace />;
  }

  return (
    <PayPalScriptProvider options={{ "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "test", currency: "USD" }}>
        <Routes>
        <Route path="/" element={<Navigate to="/rider/dashboard" replace />} />
        <Route path="/dashboard" element={<RiderDashboard />} />
        <Route path="*" element={<Navigate to="/rider/dashboard" replace />} />
        </Routes>
    </PayPalScriptProvider>
  );
};

export default RiderPortal;