/**
 * RiderMap.jsx — Bolt-quality map experience for the T'aksi rider portal.
 *
 * FEATURES:
 *  - Booking phase  : full-screen map, draggable pickup + drop pins, Places autocomplete search
 *  - Searching phase: animated pulsing ring, nearby driver dots on the map
 *  - Active ride    : live driver marker (car icon), route polyline, ETA banner, passenger destination pin
 *  - Zoom controls  : +/– buttons, "My location" re-centre
 *  - All map controls are floating glass-morphism pills — same visual language as DriverPortal
 *
 * USAGE (drop-in inside RiderPortal):
 *
 *   import RiderMap from "./RiderMap";
 *
 *   <RiderMap
 *     phase="booking"           // "booking" | "searching" | "active"
 *     pickupCoords={...}        // { lat, lng } | null
 *     dropoffCoords={...}       // { lat, lng } | null
 *     onPickupChange={fn}       // (coords, address) => void
 *     onDropoffChange={fn}      // (coords, address) => void
 *     activeRide={...}          // ride object from /api/rider/active-ride
 *     riderLocation={...}       // { lat, lng } — rider's own GPS
 *     nearbyDrivers={[...]}     // [{ lat, lng, id }] — shown during searching
 *   />
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair, Locate, Minus, Plus, Navigation2, Car,
  Clock, MapPin, X, Search, ChevronDown
} from "lucide-react";

// ─── Google Maps singleton loader (mirrors DriverPortal) ───────────────────────
let _mapsState = "idle";
const _mapsQ = [];

export const loadGoogleMaps = (apiKey) => {
  if (_mapsState === "loaded" && window.google?.maps) return Promise.resolve();
  if (_mapsState === "loaded") _mapsState = "idle";
  if (_mapsState === "loading") return new Promise((res, rej) => _mapsQ.push({ res, rej }));
  _mapsState = "loading";
  return new Promise((res, rej) => {
    _mapsQ.push({ res, rej });
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=__taksiRiderMapsReady`;
    s.async = true; s.defer = true;
    window.__taksiRiderMapsReady = () => {
      _mapsState = "loaded";
      _mapsQ.forEach(cb => cb.res());
      _mapsQ.length = 0;
      delete window.__taksiRiderMapsReady;
    };
    s.onerror = () => {
      _mapsState = "error";
      _mapsQ.forEach(cb => cb.rej(new Error("Maps failed")));
      _mapsQ.length = 0;
    };
    document.head.appendChild(s);
  });
};

// ─── Map visual theme — dark, matches DriverPortal ────────────────────────────
const MAP_STYLES = [
  { elementType: "geometry",               stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke",     stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill",       stylers: [{ color: "#8892a4" }] },
  { featureType: "administrative.locality",elementType: "labels.text.fill", stylers: [{ color: "#c9a96e" }] },
  { featureType: "poi",                    elementType: "labels",            stylers: [{ visibility: "off" }] },
  { featureType: "road",                   elementType: "geometry",          stylers: [{ color: "#2d3452" }] },
  { featureType: "road",                   elementType: "geometry.stroke",   stylers: [{ color: "#1a1f38" }] },
  { featureType: "road",                   elementType: "labels.text.fill",  stylers: [{ color: "#8892a4" }] },
  { featureType: "road.highway",           elementType: "geometry",          stylers: [{ color: "#3d4a6b" }] },
  { featureType: "road.highway",           elementType: "geometry.stroke",   stylers: [{ color: "#1a1f38" }] },
  { featureType: "road.highway",           elementType: "labels.text.fill",  stylers: [{ color: "#f3c96c" }] },
  { featureType: "transit",                stylers: [{ visibility: "off" }] },
  { featureType: "water",                  elementType: "geometry",          stylers: [{ color: "#0d1b2a" }] },
  { featureType: "water",                  elementType: "labels.text.fill",  stylers: [{ color: "#3d6b8a" }] },
];

// ─── SVG car icon for the driver marker ───────────────────────────────────────
const CAR_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <circle cx="18" cy="18" r="18" fill="#00ff88" opacity="0.15"/>
  <circle cx="18" cy="18" r="14" fill="#00ff88"/>
  <path d="M18 7 L22 16 L18 14 L14 16 Z" fill="#07070f"/>
</svg>`;

const CAR_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(CAR_ICON_SVG)}`;

// ─── SVG pickup pin ───────────────────────────────────────────────────────────
const PICKUP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14C28 7.4 22.6 2 16 2z" fill="#00ff88" stroke="#07070f" stroke-width="2"/>
  <circle cx="16" cy="14" r="5" fill="#07070f"/>
</svg>`;
const PICKUP_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PICKUP_SVG)}`;

// ─── SVG drop-off pin ─────────────────────────────────────────────────────────
const DROP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14C28 7.4 22.6 2 16 2z" fill="#f43f5e" stroke="#07070f" stroke-width="2"/>
  <circle cx="16" cy="14" r="5" fill="#07070f"/>
</svg>`;
const DROP_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(DROP_SVG)}`;

// ─── Haversine helper ─────────────────────────────────────────────────────────
const hvKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371, dL = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Glass button helper ──────────────────────────────────────────────────────
const GlassBtn = ({ onClick, children, className = "", title = "" }) => (
  <button
    onClick={onClick}
    title={title}
    className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform ${className}`}
    style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(10px)" }}
  >
    {children}
  </button>
);

// ─── Places autocomplete input ────────────────────────────────────────────────
const PlacesInput = ({ placeholder, value, onChange, onSelect, icon: Icon, iconColor = "#00ff88", inputRef }) => {
  const containerRef = useRef(null);
  const acRef = useRef(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!inputRef?.current || !window.google?.maps?.places) return;
    if (acRef.current) return;
    acRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "ge" },
      fields: ["geometry", "formatted_address", "name"],
    });
    acRef.current.addListener("place_changed", () => {
      const place = acRef.current.getPlace();
      if (!place.geometry?.location) return;
      onSelect({
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      }, place.formatted_address || place.name || "");
    });
  }, [onSelect]);

  return (
    <div ref={containerRef} className="relative flex items-center" style={{ flex: 1 }}>
      <Icon className="absolute left-3 w-4 h-4 shrink-0 z-10" style={{ color: iconColor }} />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        className="w-full pl-9 pr-3 py-3 text-sm text-white placeholder-white/35 rounded-xl outline-none border transition-all"
        style={{
          background: "rgba(255,255,255,0.06)",
          borderColor: focused ? "rgba(0,255,136,0.5)" : "rgba(255,255,255,0.1)",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
};

// ─── ETA Banner (shown during active ride) ────────────────────────────────────
const ETABanner = ({ activeRide, etaSeconds, driverLocation }) => {
  const statusConfig = {
    accepted:    { label: "Driver is on the way",   color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
    arrived:     { label: "Driver has arrived",      color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
    in_progress: { label: "Ride in progress",        color: "#00ff88", bg: "rgba(0,255,136,0.12)" },
  };
  const cfg = statusConfig[activeRide?.status] || {};

  const formatETA = (secs) => {
    if (!secs || secs <= 0) return null;
    if (secs < 60) return `${secs}s`;
    const m = Math.round(secs / 60);
    return `${m} min`;
  };

  const distToPickup = driverLocation && activeRide?.pickup_lat
    ? hvKm(driverLocation.lat, driverLocation.lng, activeRide.pickup_lat, activeRide.pickup_lng)
    : null;

  if (!activeRide || !cfg.label) return null;

  return (
    <div
      className="absolute top-16 left-3 right-3 z-30 rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}30`, backdropFilter: "blur(16px)" }}
    >
      <span className="w-2.5 h-2.5 rounded-full animate-pulse shrink-0" style={{ background: cfg.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
        {activeRide.driver_info?.name && (
          <p className="text-white/50 text-xs mt-0.5 truncate">
            {activeRide.driver_info.name}
            {activeRide.driver_info.license_plate ? ` · ${activeRide.driver_info.license_plate}` : ""}
          </p>
        )}
      </div>
      {activeRide.status === "accepted" && (distToPickup || etaSeconds) && (
        <div className="text-right shrink-0">
          {etaSeconds && <p className="font-bold text-sm" style={{ color: cfg.color }}>{formatETA(etaSeconds)}</p>}
          {distToPickup && <p className="text-white/40 text-xs">{distToPickup.toFixed(1)} km</p>}
        </div>
      )}
    </div>
  );
};

// ─── Main RiderMap component ──────────────────────────────────────────────────
const RiderMap = ({
  phase = "booking",           // "booking" | "searching" | "active"
  pickupCoords = null,         // { lat, lng }
  dropoffCoords = null,        // { lat, lng }
  onPickupChange = null,       // (coords, address) => void
  onDropoffChange = null,      // (coords, address) => void
  activeRide = null,           // ride object
  riderLocation = null,        // { lat, lng }
  nearbyDrivers = [],          // [{ lat, lng, id }]
  apiKey = "",                 // passed from parent; falls back to env
}) => {
  const resolvedKey = apiKey || (typeof import.meta !== "undefined"
    ? import.meta.env?.VITE_GOOGLE_MAPS_API_KEY
    : "") || "";

  const mapRef           = useRef(null);
  const mapInstanceRef   = useRef(null);
  const pickupMarkerRef  = useRef(null);
  const dropoffMarkerRef = useRef(null);
  const driverMarkerRef  = useRef(null);
  const driverDotRefs    = useRef({});
  const routeRendererRef = useRef(null);
  const dirServiceRef    = useRef(null);
  const riderDotRef      = useRef(null);
  const pulseCircleRef   = useRef(null);
  const pickupInputRef   = useRef(null);
  const dropoffInputRef  = useRef(null);

  const [mapsReady, setMapsReady] = useState(!!window.google?.maps);
  const [isFollowing, setIsFollowing] = useState(true);
  const [pickupText, setPickupText]   = useState("");
  const [dropoffText, setDropoffText] = useState("");
  const [etaSeconds, setEtaSeconds]   = useState(null);
  const [showSearch, setShowSearch]   = useState(true);

  // Load maps SDK
  useEffect(() => {
    if (window.google?.maps) { setMapsReady(true); return; }
    loadGoogleMaps(resolvedKey).then(() => setMapsReady(true)).catch(console.error);
  }, [resolvedKey]);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsReady || !mapRef.current || mapInstanceRef.current) return;

    const center = riderLocation || pickupCoords || { lat: 41.7151, lng: 44.8271 };
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 15,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      backgroundColor: "#0a0a18",
      styles: MAP_STYLES,
    });

    routeRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,         // We render our own pins
      preserveViewport: true,
      polylineOptions: {
        strokeColor: "#00ff88",
        strokeWeight: 5,
        strokeOpacity: 0.85,
      },
    });
    dirServiceRef.current = new window.google.maps.DirectionsService();
    mapInstanceRef.current = map;

    // Drag listener — when user pans away, unfollow
    map.addListener("dragstart", () => setIsFollowing(false));
  }, [mapsReady]);

  // ── Pickup marker (booking phase) ──────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    if (phase !== "booking" && phase !== "searching") {
      pickupMarkerRef.current?.setMap(null);
      return;
    }
    if (!pickupCoords) { pickupMarkerRef.current?.setMap(null); return; }

    if (!pickupMarkerRef.current) {
      pickupMarkerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        icon: { url: PICKUP_ICON_URL, scaledSize: new window.google.maps.Size(32, 44), anchor: new window.google.maps.Point(16, 44) },
        zIndex: 10,
        draggable: phase === "booking",
      });
      pickupMarkerRef.current.addListener("dragend", () => {
        const pos = pickupMarkerRef.current.getPosition();
        const coords = { lat: pos.lat(), lng: pos.lng() };
        geocodeCoords(coords).then(addr => onPickupChange?.(coords, addr));
      });
    }
    pickupMarkerRef.current.setPosition(pickupCoords);
    pickupMarkerRef.current.setMap(mapInstanceRef.current);
  }, [mapsReady, pickupCoords, phase]);

  // ── Drop-off marker (booking phase) ────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    if (phase !== "booking") { dropoffMarkerRef.current?.setMap(null); return; }
    if (!dropoffCoords) { dropoffMarkerRef.current?.setMap(null); return; }

    if (!dropoffMarkerRef.current) {
      dropoffMarkerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        icon: { url: DROP_ICON_URL, scaledSize: new window.google.maps.Size(32, 44), anchor: new window.google.maps.Point(16, 44) },
        zIndex: 10,
        draggable: true,
      });
      dropoffMarkerRef.current.addListener("dragend", () => {
        const pos = dropoffMarkerRef.current.getPosition();
        const coords = { lat: pos.lat(), lng: pos.lng() };
        geocodeCoords(coords).then(addr => onDropoffChange?.(coords, addr));
      });
    }
    dropoffMarkerRef.current.setPosition(dropoffCoords);
    dropoffMarkerRef.current.setMap(mapInstanceRef.current);
  }, [mapsReady, dropoffCoords, phase]);

  // ── Fit map to pickup + dropoff when both are set ──────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || phase !== "booking") return;
    if (pickupCoords && dropoffCoords) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend(pickupCoords);
      bounds.extend(dropoffCoords);
      mapInstanceRef.current.fitBounds(bounds, { top: 80, bottom: 260, left: 40, right: 40 });
    } else if (pickupCoords) {
      mapInstanceRef.current.panTo(pickupCoords);
      mapInstanceRef.current.setZoom(16);
    }
  }, [pickupCoords, dropoffCoords, phase]);

  // ── Route polyline for booking preview ────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !dirServiceRef.current) return;
    if (phase !== "booking" || !pickupCoords || !dropoffCoords) {
      routeRendererRef.current?.setDirections({ routes: [] });
      return;
    }
    dirServiceRef.current.route(
      {
        origin: pickupCoords,
        destination: dropoffCoords,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK") routeRendererRef.current?.setDirections(result);
      }
    );
  }, [pickupCoords, dropoffCoords, phase]);

  // ── Pulse ring animation during searching ─────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    if (phase !== "searching" || !pickupCoords) {
      pulseCircleRef.current?.setMap(null);
      pulseCircleRef.current = null;
      return;
    }
    let radius = 200;
    let growing = true;
    const pulse = () => {
      if (!pulseCircleRef.current || !mapInstanceRef.current) return;
      if (growing) { radius += 30; if (radius >= 800) growing = false; }
      else         { radius -= 30; if (radius <= 200) growing = true; }
      pulseCircleRef.current.setRadius(radius);
    };

    pulseCircleRef.current = new window.google.maps.Circle({
      map: mapInstanceRef.current,
      center: pickupCoords,
      radius: 200,
      fillColor: "#00ff88",
      fillOpacity: 0.06,
      strokeColor: "#00ff88",
      strokeOpacity: 0.4,
      strokeWeight: 2,
    });
    const interval = setInterval(pulse, 60);
    return () => { clearInterval(interval); pulseCircleRef.current?.setMap(null); pulseCircleRef.current = null; };
  }, [phase, pickupCoords, mapsReady]);

  // ── Nearby driver dots during searching ────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    if (phase !== "searching") {
      Object.values(driverDotRefs.current).forEach(m => m.setMap(null));
      driverDotRefs.current = {};
      return;
    }
    const current = new Set(Object.keys(driverDotRefs.current));
    nearbyDrivers.forEach(d => {
      if (driverDotRefs.current[d.id]) {
        driverDotRefs.current[d.id].setPosition({ lat: d.lat, lng: d.lng });
      } else {
        driverDotRefs.current[d.id] = new window.google.maps.Marker({
          map: mapInstanceRef.current,
          position: { lat: d.lat, lng: d.lng },
          icon: { url: CAR_ICON_URL, scaledSize: new window.google.maps.Size(32, 32), anchor: new window.google.maps.Point(16, 16) },
          zIndex: 5,
        });
      }
      current.delete(d.id);
    });
    current.forEach(id => { driverDotRefs.current[id]?.setMap(null); delete driverDotRefs.current[id]; });
  }, [nearbyDrivers, phase, mapsReady]);

  // ── Active ride: driver marker + route + ETA with SMOOTH ANIMATION ──────────
  const lastDriverPosRef = useRef(null);
  const driverAnimationRef = useRef(null);
  
  const animateDriverMarker = useCallback((targetLat, targetLng) => {
    if (!driverMarkerRef.current) return;
    
    const startPos = lastDriverPosRef.current || { lat: targetLat, lng: targetLng };
    const startTime = performance.now();
    const duration = 400;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const lat = startPos.lat + (targetLat - startPos.lat) * eased;
      const lng = startPos.lng + (targetLng - startPos.lng) * eased;
      
      driverMarkerRef.current.setPosition({ lat, lng });
      
      if (progress < 1) {
        driverAnimationRef.current = requestAnimationFrame(animate);
      } else {
        lastDriverPosRef.current = { lat: targetLat, lng: targetLng };
      }
    };
    
    if (driverAnimationRef.current) cancelAnimationFrame(driverAnimationRef.current);
    driverAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google) return;
    if (phase !== "active" || !activeRide) {
      driverMarkerRef.current?.setMap(null);
      routeRendererRef.current?.setDirections({ routes: [] });
      lastDriverPosRef.current = null;
      return;
    }

    const drvLoc = activeRide.driver_location;
    if (!drvLoc?.lat || !drvLoc?.lng) return;

    const dPos = { lat: parseFloat(drvLoc.lat), lng: parseFloat(drvLoc.lng) };

    // Driver car marker with smooth animation
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        icon: { url: CAR_ICON_URL, scaledSize: new window.google.maps.Size(40, 40), anchor: new window.google.maps.Point(20, 20) },
        zIndex: 20,
      });
      lastDriverPosRef.current = dPos;
      driverMarkerRef.current.setPosition(dPos);
    } else {
      // Smooth animation to new position
      animateDriverMarker(dPos.lat, dPos.lng);
    }
    driverMarkerRef.current.setMap(mapInstanceRef.current);

    // Show pickup pin during accepted/arrived
    if (["accepted", "arrived"].includes(activeRide.status) && activeRide.pickup_lat) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = new window.google.maps.Marker({
          map: mapInstanceRef.current,
          icon: { url: PICKUP_ICON_URL, scaledSize: new window.google.maps.Size(32, 44), anchor: new window.google.maps.Point(16, 44) },
          zIndex: 10,
        });
      }
      pickupMarkerRef.current.setPosition({ lat: activeRide.pickup_lat, lng: activeRide.pickup_lng });
      pickupMarkerRef.current.setMap(mapInstanceRef.current);
    }

    // Show destination pin during in_progress
    if (activeRide.status === "in_progress") {
      const dLat = activeRide.destination_lat || activeRide.dest_lat;
      const dLng = activeRide.destination_lng || activeRide.dest_lng;
      pickupMarkerRef.current?.setMap(null);
      if (dLat && dLng) {
        if (!dropoffMarkerRef.current) {
          dropoffMarkerRef.current = new window.google.maps.Marker({
            map: mapInstanceRef.current,
            icon: { url: DROP_ICON_URL, scaledSize: new window.google.maps.Size(32, 44), anchor: new window.google.maps.Point(16, 44) },
            zIndex: 10,
          });
        }
        dropoffMarkerRef.current.setPosition({ lat: dLat, lng: dLng });
        dropoffMarkerRef.current.setMap(mapInstanceRef.current);
      }
    }

    // Pan map to follow driver
    if (isFollowing) mapInstanceRef.current.panTo(dPos);

    // Draw route from driver to next target
    if (!dirServiceRef.current) return;
    let target = null;
    if (["accepted", "arrived"].includes(activeRide.status) && activeRide.pickup_lat) {
      target = { lat: parseFloat(activeRide.pickup_lat), lng: parseFloat(activeRide.pickup_lng) };
    } else if (activeRide.status === "in_progress") {
      const dlat = activeRide.destination_lat || activeRide.dest_lat;
      const dlng = activeRide.destination_lng || activeRide.dest_lng;
      if (dlat && dlng) target = { lat: parseFloat(dlat), lng: parseFloat(dlng) };
    }
    if (!target) return;

    dirServiceRef.current.route(
      { origin: dPos, destination: target, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (status === "OK") {
          routeRendererRef.current?.setDirections(result);
          const leg = result.routes[0]?.legs[0];
          if (leg?.duration?.value) setEtaSeconds(leg.duration.value);
        }
      }
    );
  }, [activeRide?.driver_location, activeRide?.status, phase, isFollowing, mapsReady, animateDriverMarker]);

  // ── Auto-fit map on ride accept ────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || phase !== "active" || !activeRide) return;
    const drvLoc = activeRide.driver_location;
    if (!drvLoc?.lat || !activeRide.pickup_lat) return;
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: parseFloat(drvLoc.lat), lng: parseFloat(drvLoc.lng) });
    bounds.extend({ lat: parseFloat(activeRide.pickup_lat), lng: parseFloat(activeRide.pickup_lng) });
    mapInstanceRef.current.fitBounds(bounds, { top: 100, bottom: 280, left: 60, right: 60 });
  }, [activeRide?.id, phase]);

  // ── Rider location dot ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google || !riderLocation) return;
    const pos = { lat: riderLocation.lat, lng: riderLocation.lng };
    if (!riderDotRef.current) {
      riderDotRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#60a5fa",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: 15,
      });
    }
    riderDotRef.current.setPosition(pos);
    if (phase === "booking" && isFollowing) {
      mapInstanceRef.current.panTo(pos);
    }
  }, [riderLocation, phase]);

  // ── Geocode helper ─────────────────────────────────────────────────────────
  const geocodeCoords = async (coords) => {
    if (!window.google) return "";
    const geocoder = new window.google.maps.Geocoder();
    return new Promise(resolve => {
      geocoder.geocode({ location: coords }, (results, status) => {
        resolve(status === "OK" ? (results[0]?.formatted_address || "") : "");
      });
    });
  };

  // ── "Locate me" button ─────────────────────────────────────────────────────
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation || !mapInstanceRef.current) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mapInstanceRef.current.panTo(coords);
      mapInstanceRef.current.setZoom(17);
      setIsFollowing(true);
      if (phase === "booking" && !pickupCoords) {
        geocodeCoords(coords).then(addr => {
          setPickupText(addr);
          onPickupChange?.(coords, addr);
        });
      }
    });
  }, [phase, pickupCoords, onPickupChange]);

  // ── Re-centre on driver ────────────────────────────────────────────────────
  const handleRecentre = useCallback(() => {
    setIsFollowing(true);
    const drvLoc = activeRide?.driver_location;
    if (drvLoc?.lat && mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: parseFloat(drvLoc.lat), lng: parseFloat(drvLoc.lng) });
    }
  }, [activeRide]);

  if (!mapsReady) {
    return (
      <div className="w-full h-full bg-[#0a0a18] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#00ff88]/40 border-t-[#00ff88] animate-spin" />
          <p className="text-white/30 text-xs">Loading map…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Map canvas */}
      <div ref={mapRef} className="w-full h-full" />

      {/* ETA banner — active ride only */}
      {phase === "active" && activeRide && (
        <ETABanner activeRide={activeRide} etaSeconds={etaSeconds} driverLocation={activeRide?.driver_location} />
      )}

      {/* Searching overlay label */}
      {phase === "searching" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl"
          style={{ background: "rgba(0,255,136,0.12)", border: "1px solid rgba(0,255,136,0.3)", backdropFilter: "blur(16px)" }}>
          <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse" />
          <span className="text-[#00ff88] text-sm font-semibold">Searching for drivers…</span>
        </div>
      )}

      {/* Booking search inputs */}
      {phase === "booking" && (
        <div className="absolute top-3 left-3 right-3 z-30">
          <div className="rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: "rgba(10,10,24,0.92)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)" }}>

            {/* Toggle collapse */}
            <button
              onClick={() => setShowSearch(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <span className="text-white/70 text-sm font-medium">
                {pickupText && dropoffText
                  ? `${pickupText.split(",")[0]} → ${dropoffText.split(",")[0]}`
                  : "Where are you going?"}
              </span>
              <ChevronDown
                className="w-4 h-4 text-white/40 transition-transform"
                style={{ transform: showSearch ? "rotate(180deg)" : "none" }}
              />
            </button>

            {showSearch && (
              <div className="px-3 pb-3 flex flex-col gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <PlacesInput
                  placeholder="Pickup location"
                  value={pickupText}
                  onChange={setPickupText}
                  onSelect={(coords, addr) => { setPickupText(addr); onPickupChange?.(coords, addr); }}
                  icon={MapPin}
                  iconColor="#00ff88"
                  inputRef={pickupInputRef}
                />
                {/* Divider dot */}
                <div className="flex items-center gap-2 px-1">
                  <div className="w-0.5 h-4 bg-white/10 ml-[13px]" />
                </div>
                <PlacesInput
                  placeholder="Drop-off location"
                  value={dropoffText}
                  onChange={setDropoffText}
                  onSelect={(coords, addr) => { setDropoffText(addr); onDropoffChange?.(coords, addr); }}
                  icon={MapPin}
                  iconColor="#f43f5e"
                  inputRef={dropoffInputRef}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Right-side controls */}
      <div className="absolute flex flex-col gap-2 z-20" style={{ right: 14, bottom: phase === "active" ? 220 : 160 }}>
        <GlassBtn onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 15) + 1)} title="Zoom in">
          <Plus className="w-5 h-5 text-gray-800" />
        </GlassBtn>
        <GlassBtn onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 15) - 1)} title="Zoom out">
          <Minus className="w-5 h-5 text-gray-800" />
        </GlassBtn>
        {phase === "booking" && (
          <GlassBtn onClick={handleLocateMe} title="My location">
            <Locate className="w-5 h-5 text-blue-600" />
          </GlassBtn>
        )}
        {phase === "active" && (
          <GlassBtn onClick={handleRecentre} title="Re-centre on driver">
            <Navigation2 className="w-5 h-5 text-gray-800" />
          </GlassBtn>
        )}
      </div>

      {/* Re-centre pill — shown when user has panned away during active ride */}
      {phase === "active" && !isFollowing && activeRide?.driver_location && (
        <button
          onClick={handleRecentre}
          className="absolute z-30 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl transition-all active:scale-95"
          style={{ bottom: 240, left: "50%", transform: "translateX(-50%)", background: "rgba(0,204,119,0.95)", backdropFilter: "blur(8px)" }}
        >
          <Crosshair className="w-4 h-4 text-white animate-pulse" />
          <span className="text-white text-sm font-bold">Re-centre</span>
        </button>
      )}
    </div>
  );
};

export default RiderMap;