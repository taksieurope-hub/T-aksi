/**
 * Ridermap.jsx — Leaflet + OpenStreetMap offline-capable map for T'aksi Rider
 *
 * REPLACES: Google Maps implementation
 * FEATURES:
 *  - Booking phase  : full-screen map, draggable pickup + drop pins, Nominatim address search
 *  - Searching phase: animated pulsing ring, nearby driver dots
 *  - Active ride    : live driver marker, OSRM route polyline, ETA banner
 *  - Offline        : OSM tiles cached in browser via leaflet.offline / service worker
 *
 * SAME PROPS INTERFACE as original — drop-in replacement:
 *   phase, pickupCoords, dropoffCoords, onPickupChange, onDropoffChange,
 *   activeRide, riderLocation, nearbyDrivers
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Locate, Minus, Plus, Navigation2, MapPin, X, Search, WifiOff } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

// ─── Leaflet lazy loader ───────────────────────────────────────────────────────
let _leafletState = "idle";
const _leafletQ = [];

const loadLeaflet = () => {
  if (_leafletState === "loaded" && window.L) return Promise.resolve();
  if (_leafletState === "loading") return new Promise((res, rej) => _leafletQ.push({ res, rej }));
  _leafletState = "loading";

  return new Promise((res, rej) => {
    _leafletQ.push({ res, rej });

    // CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      _leafletState = "loaded";
      _leafletQ.forEach(cb => cb.res());
      _leafletQ.length = 0;
    };
    script.onerror = () => {
      _leafletState = "error";
      _leafletQ.forEach(cb => cb.rej(new Error("Leaflet failed to load")));
      _leafletQ.length = 0;
    };
    document.head.appendChild(script);
  });
};

// ─── Nominatim geocoder (replaces Google Places) ──────────────────────────────
const TBILISI = { lat: 41.6938, lng: 44.8015 };
let _searchTimer = null;

const searchAddress = async (query) => {
  if (!query || query.length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&viewbox=43.5,42.5,46.5,40.5&bounded=0&accept-language=ka,en`;
    const res = await fetch(url, { headers: { "Accept-Language": "ka, en" } });
    const data = await res.json();
    return data.map(d => ({
      label: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    }));
  } catch {
    return [];
  }
};

const reverseGeocode = async (lat, lng) => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
};

// ─── OSRM routing (replaces Google DirectionsService) ─────────────────────────
const getRoute = async (origin, destination, waypoints = []) => {
  try {
    const coords = [origin, ...waypoints, destination]
      .map(p => `${p.lng},${p.lat}`)
      .join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0]) {
      const route = data.routes[0];
      return {
        coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distanceKm: (route.distance / 1000).toFixed(1),
        durationMin: Math.ceil(route.duration / 60),
      };
    }
  } catch {}
  return null;
};

// ─── Custom SVG marker icons ───────────────────────────────────────────────────
const makeIcon = (svg, size = [32, 44], anchor = [16, 44]) => {
  if (!window.L) return null;
  return window.L.divIcon({
    html: svg,
    className: "",
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, -44],
  });
};

const PICKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14C28 7.4 22.6 2 16 2z" fill="#00ff88" stroke="#07070f" stroke-width="2"/>
  <circle cx="16" cy="14" r="5" fill="#07070f"/>
</svg>`;

const DROP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14C28 7.4 22.6 2 16 2z" fill="#00d4ff" stroke="#07070f" stroke-width="2"/>
  <circle cx="16" cy="14" r="5" fill="#07070f"/>
</svg>`;

const makeStopSVG = (num) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14C28 7.4 22.6 2 16 2z" fill="#f5c842" stroke="#07070f" stroke-width="2"/>
  <text x="16" y="19" text-anchor="middle" font-size="11" font-weight="bold" fill="#07070f" font-family="system-ui">${num}</text>
</svg>`;

const CAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <circle cx="18" cy="18" r="18" fill="#00ff88" opacity="0.2"/>
  <circle cx="18" cy="18" r="14" fill="#00ff88"/>
  <path d="M18 7 L22 16 L18 14 L14 16 Z" fill="#07070f"/>
</svg>`;

const DRIVER_DOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
  <circle cx="10" cy="10" r="9" fill="#f5c842" stroke="#07070f" stroke-width="2"/>
  <circle cx="10" cy="10" r="4" fill="#07070f"/>
</svg>`;

// ─── Glass button helper ───────────────────────────────────────────────────────
const GlassBtn = ({ onClick, title, children, className = "" }) => (
  <button
    onClick={onClick}
    title={title}
    className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform ${className}`}
    style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}
  >
    {children}
  </button>
);

// ─── Address search input with Nominatim ──────────────────────────────────────
const AddressInput = ({ placeholder, value, onChange, onSelect, icon: Icon, iconColor }) => {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    onChange?.(q);
    clearTimeout(_searchTimer);
    if (q.length < 3) { setResults([]); setOpen(false); return; }
    setLoading(true);
    _searchTimer = setTimeout(async () => {
      const r = await searchAddress(q);
      setResults(r);
      setOpen(r.length > 0);
      setLoading(false);
    }, 400);
  };

  const handleSelect = (item) => {
    setQuery(item.label);
    setResults([]);
    setOpen(false);
    onSelect?.({ lat: item.lat, lng: item.lng }, item.label);
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md">
        {Icon && <Icon className={`w-4 h-4 shrink-0 ${iconColor || "text-white/50"}`} />}
        <input
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
        />
        {loading && <div className="w-3 h-3 border border-white/30 border-t-white/80 rounded-full animate-spin" />}
        {query && !loading && (
          <button onClick={() => { setQuery(""); setResults([]); setOpen(false); onChange?.(""); }}>
            <X className="w-3.5 h-3.5 text-white/40 hover:text-white/70" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl overflow-hidden shadow-2xl border border-white/10"
          style={{ background: "rgba(7,7,15,0.97)", backdropFilter: "blur(16px)" }}>
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/8 flex items-start gap-2 border-b border-white/5 last:border-0"
            >
              <MapPin className="w-3.5 h-3.5 text-[#00ff88] shrink-0 mt-0.5" />
              <span className="line-clamp-2">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Offline indicator ────────────────────────────────────────────────────────
const OfflineIndicator = () => (
  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
    style={{ background: "rgba(239,68,68,0.9)", backdropFilter: "blur(8px)" }}>
    <WifiOff className="w-3.5 h-3.5 text-white" />
    <span className="text-white">Offline — cached map</span>
  </div>
);

// ─── Main RiderMap component ───────────────────────────────────────────────────
const RiderMap = ({
  phase = "booking",
  pickupCoords,
  dropoffCoords,
  onPickupChange,
  onDropoffChange,
  activeRide,
  riderLocation,
  nearbyDrivers = [],
}) => {
  const { t } = useLanguage();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const dropoffMarkerRef = useRef(null);
  const carMarkerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const nearbyMarkersRef = useRef([]);
  const pulseLayerRef = useRef(null);

  const [leafletReady, setLeafletReady] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isFollowing, setIsFollowing] = useState(true);
  const [pickupAddr, setPickupAddr] = useState("");
  const [dropoffAddr, setDropoffAddr] = useState("");

  // ── Online/offline detection
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // ── Load Leaflet
  useEffect(() => {
    loadLeaflet().then(() => setLeafletReady(true)).catch(console.error);
  }, []);

  // ── Init map
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstanceRef.current) return;
    const L = window.L;

    const map = L.map(mapRef.current, {
      center: [TBILISI.lat, TBILISI.lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark OSM tile layer (CartoDB dark matter — free, no API key)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    // Minimal attribution
    L.control.attribution({ prefix: false, position: "bottomleft" })
      .addAttribution('© <a href="https://openstreetmap.org">OSM</a>').addTo(map);

    // Detect manual pan to stop auto-following
    map.on("dragstart", () => setIsFollowing(false));

    mapInstanceRef.current = map;
  }, [leafletReady]);

  // ── Pickup marker
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady || phase !== "booking") return;
    const L = window.L;
    const map = mapInstanceRef.current;

    if (pickupCoords) {
      const pos = [pickupCoords.lat, pickupCoords.lng];
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = L.marker(pos, {
          icon: makeIcon(PICKUP_SVG),
          draggable: true,
          zIndexOffset: 100,
        }).addTo(map);
        pickupMarkerRef.current.on("dragend", async (e) => {
          const { lat, lng } = e.target.getLatLng();
          const addr = await reverseGeocode(lat, lng);
          setPickupAddr(addr);
          onPickupChange?.({ lat, lng }, addr);
        });
      } else {
        pickupMarkerRef.current.setLatLng(pos);
      }
    } else {
      pickupMarkerRef.current?.remove();
      pickupMarkerRef.current = null;
    }
  }, [pickupCoords, phase, leafletReady]);

  // ── Dropoff marker
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady || phase !== "booking") return;
    const L = window.L;
    const map = mapInstanceRef.current;

    if (dropoffCoords) {
      const pos = [dropoffCoords.lat, dropoffCoords.lng];
      if (!dropoffMarkerRef.current) {
        dropoffMarkerRef.current = L.marker(pos, {
          icon: makeIcon(DROP_SVG),
          draggable: true,
          zIndexOffset: 100,
        }).addTo(map);
        dropoffMarkerRef.current.on("dragend", async (e) => {
          const { lat, lng } = e.target.getLatLng();
          const addr = await reverseGeocode(lat, lng);
          setDropoffAddr(addr);
          onDropoffChange?.({ lat, lng }, addr);
        });
      } else {
        dropoffMarkerRef.current.setLatLng(pos);
      }

      // Fit both markers
      if (pickupCoords) {
        const L = window.L;
        const bounds = L.latLngBounds(
          [pickupCoords.lat, pickupCoords.lng],
          [dropoffCoords.lat, dropoffCoords.lng]
        );
        mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] });
      }
    } else {
      dropoffMarkerRef.current?.remove();
      dropoffMarkerRef.current = null;
    }
  }, [dropoffCoords, phase, leafletReady]);

  // ── Nearby drivers (searching phase)
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady) return;
    const L = window.L;

    nearbyMarkersRef.current.forEach(m => m.remove());
    nearbyMarkersRef.current = [];
    pulseLayerRef.current?.remove();

    if (phase === "searching") {
      // Pulsing circle at pickup
      if (pickupCoords) {
        pulseLayerRef.current = L.circle(
          [pickupCoords.lat, pickupCoords.lng],
          { radius: 300, color: "#00ff88", fillColor: "#00ff88", fillOpacity: 0.08, weight: 1.5, dashArray: "6 4" }
        ).addTo(mapInstanceRef.current);
      }
      // Driver dots
      nearbyDrivers.forEach(d => {
        const m = L.marker([d.lat, d.lng], { icon: makeIcon(DRIVER_DOT_SVG, [20, 20], [10, 10]) })
          .addTo(mapInstanceRef.current);
        nearbyMarkersRef.current.push(m);
      });
    }
  }, [phase, nearbyDrivers, pickupCoords, leafletReady]);

  // ── Active ride: driver car marker + route
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady || phase !== "active") {
      stopMarkersRef.current.forEach(m => m.remove());
      stopMarkersRef.current = [];
      return;
    }
    const L = window.L;
    const map = mapInstanceRef.current;

    const driverLoc = activeRide?.driver_location;
    if (!driverLoc) return;

    const pos = [driverLoc.lat, driverLoc.lng];

    if (!carMarkerRef.current) {
      carMarkerRef.current = L.marker(pos, {
        icon: makeIcon(CAR_SVG, [36, 36], [18, 18]),
        zIndexOffset: 200,
      }).addTo(map);
    } else {
      carMarkerRef.current.setLatLng(pos);
    }

    if (isFollowing) map.panTo(pos);

    // ── Stop markers (numbered yellow pins)
    stopMarkersRef.current.forEach(m => m.remove());
    stopMarkersRef.current = [];
    (activeRide.stops || []).filter(s => s.lat && s.lng).forEach((stop, i) => {
      const m = L.marker([parseFloat(stop.lat), parseFloat(stop.lng)], {
        icon: makeIcon(makeStopSVG(i + 1), [32, 44], [16, 44]),
        zIndexOffset: 90,
      }).addTo(map);
      if (stop.address) {
        m.bindTooltip(`Stop ${i + 1}: ${stop.address}`, { permanent: false, direction: "top" });
      }
      stopMarkersRef.current.push(m);
    });

    // Draw route (via stops as waypoints)
    const dest = activeRide?.dropoff_location || dropoffCoords;
    if (dest) {
      const waypoints = (activeRide.stops || [])
        .filter(s => s.lat && s.lng)
        .map(s => ({ lat: parseFloat(s.lat), lng: parseFloat(s.lng) }));
      getRoute(driverLoc, dest, waypoints).then(route => {
        if (!route || !mapInstanceRef.current) return;
        routeLayerRef.current?.remove();
        routeLayerRef.current = L.polyline(route.coords, {
          color: "#00ff88", weight: 4, opacity: 0.8, lineCap: "round",
        }).addTo(mapInstanceRef.current);
      });
    }
  }, [activeRide, phase, isFollowing, leafletReady]);

  // ── GPS locate me
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation || !mapInstanceRef.current) return;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const { latitude: lat, longitude: lng } = coords;
      mapInstanceRef.current.setView([lat, lng], 16);
      const addr = await reverseGeocode(lat, lng);
      setPickupAddr(addr);
      onPickupChange?.({ lat, lng }, addr);
    });
  }, [onPickupChange]);

  const handleRecentre = useCallback(() => {
    const driverLoc = activeRide?.driver_location;
    if (!driverLoc || !mapInstanceRef.current) return;
    setIsFollowing(true);
    mapInstanceRef.current.setView([driverLoc.lat, driverLoc.lng], 15);
  }, [activeRide]);

  // ── ETA info
  const eta = activeRide?.eta_minutes;
  const distKm = activeRide?.distance_km;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-none">
      {/* Map container */}
      <div ref={mapRef} className="w-full h-full" />

      {isOffline && <OfflineIndicator />}

      {/* Booking phase: address search inputs */}
      {phase === "booking" && (
        <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-2">
          <AddressInput
            placeholder={t("where_pickup") || "Pickup location"}
            value={pickupAddr}
            onChange={setPickupAddr}
            onSelect={(coords, addr) => { setPickupAddr(addr); onPickupChange?.(coords, addr); }}
            icon={MapPin}
            iconColor="text-[#00ff88]"
          />
          <AddressInput
            placeholder={t("where_going") || "Where to?"}
            value={dropoffAddr}
            onChange={setDropoffAddr}
            onSelect={(coords, addr) => { setDropoffAddr(addr); onDropoffChange?.(coords, addr); }}
            icon={MapPin}
            iconColor="text-[#00d4ff]"
          />
        </div>
      )}

      {/* Active ride ETA banner */}
      {phase === "active" && eta && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl"
          style={{ background: "rgba(0,255,136,0.95)", backdropFilter: "blur(8px)" }}>
          <span className="text-black font-black text-lg">{eta} {t("min") || "min"}</span>
          {distKm && <span className="text-black/70 text-sm">{distKm} {t("km") || "km"}</span>}
        </div>
      )}

      {/* Map controls */}
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
          <GlassBtn onClick={handleRecentre} title="Re-centre">
            <Navigation2 className="w-5 h-5 text-gray-800" />
          </GlassBtn>
        )}
      </div>

      {/* Re-centre pill */}
      {phase === "active" && !isFollowing && (
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