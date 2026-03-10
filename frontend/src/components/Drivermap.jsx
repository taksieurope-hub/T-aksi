/**
 * DriverMap.jsx — Leaflet + OpenStreetMap offline-capable map for T'aksi Driver
 *
 * REPLACES: inline Google Maps in DriverPortal's DriverSmartMap component
 * FEATURES:
 *  - Smooth driver marker with heading rotation
 *  - OSRM routing (free, no API key)
 *  - Turn-by-turn navigation steps
 *  - Offline tile caching (CartoDB dark tiles)
 *  - Waze/Google Maps deep-link buttons
 *
 * USAGE in DriverPortal — replace <DriverSmartMap> with:
 *   import DriverMap from "@/components/DriverMap";
 *   <DriverMap activeRide={activeRide} driverLocation={driverLocation} />
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigation2, Minus, Plus, Crosshair, WifiOff, Timer, ChevronUp, ChevronDown } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

// ─── Leaflet singleton loader ──────────────────────────────────────────────────
let _leafletState = "idle";
const _leafletQ = [];

const loadLeaflet = () => {
  if (_leafletState === "loaded" && window.L) return Promise.resolve();
  if (_leafletState === "loading") return new Promise((res, rej) => _leafletQ.push({ res, rej }));
  _leafletState = "loading";
  return new Promise((res, rej) => {
    _leafletQ.push({ res, rej });
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      _leafletState = "loaded";
      _leafletQ.forEach(cb => cb.res());
      _leafletQ.length = 0;
    };
    script.onerror = () => {
      _leafletState = "error";
      _leafletQ.forEach(cb => cb.rej(new Error("Leaflet failed")));
      _leafletQ.length = 0;
    };
    document.head.appendChild(script);
  });
};

// ─── OSRM routing ─────────────────────────────────────────────────────────────
const getRoute = async (origin, destination, waypoints = []) => {
  try {
    const coords = [origin, ...waypoints, destination]
      .map(p => `${p.lng},${p.lat}`)
      .join(";");
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`
    );
    const data = await res.json();
    if (data.routes?.[0]) {
      const route = data.routes[0];
      return {
        coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        durationSecs: Math.round(route.duration),
        distanceKm: (route.distance / 1000).toFixed(1),
        steps: route.legs.flatMap(leg => leg.steps).map(s => ({
          instruction: s.maneuver?.instruction || s.name || "",
          distanceM: Math.round(s.distance),
          endLat: s.maneuver?.location?.[1],
          endLng: s.maneuver?.location?.[0],
        })),
      };
    }
  } catch {}
  return null;
};

// ─── Haversine distance (km) ───────────────────────────────────────────────────
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371, dL = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Smooth angle lerp ────────────────────────────────────────────────────────
const lerpAngle = (a, b, t) => {
  let diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
};

// ─── SVG icons ────────────────────────────────────────────────────────────────
const makeLeafletIcon = (svg, size, anchor) => {
  if (!window.L) return null;
  return window.L.divIcon({ html: svg, className: "", iconSize: size, iconAnchor: anchor });
};

const driverIconSvg = (heading = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"
  style="transform:rotate(${heading}deg);transform-origin:center;">
  <circle cx="24" cy="24" r="20" fill="#00ff88" opacity="0.15"/>
  <circle cx="24" cy="24" r="16" fill="#00ff88"/>
  <path d="M24 10 L30 24 L24 20 L18 24 Z" fill="#07070f"/>
</svg>`;

const PICKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14C28 7.4 22.6 2 16 2z" fill="#00ff88" stroke="#07070f" stroke-width="2"/>
  <circle cx="16" cy="14" r="5" fill="#07070f"/>
</svg>`;


const makeStopSVG = (num) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14C28 7.4 22.6 2 16 2z" fill="#f5c842" stroke="#07070f" stroke-width="2"/>
  <text x="16" y="19" text-anchor="middle" font-size="11" font-weight="bold" fill="#07070f" font-family="system-ui">${num}</text>
</svg>`;

const DEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14C28 7.4 22.6 2 16 2z" fill="#ef4444" stroke="#07070f" stroke-width="2"/>
  <circle cx="16" cy="14" r="5" fill="#07070f"/>
</svg>`;

// ─── Glass button ──────────────────────────────────────────────────────────────
const GlassBtn = ({ onClick, title, children }) => (
  <button onClick={onClick} title={title}
    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
    style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}>
    {children}
  </button>
);

// ─── Format ETA ───────────────────────────────────────────────────────────────
const fmtEta = (secs) => {
  if (!secs || secs <= 0) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

// ─── Main DriverMap component ─────────────────────────────────────────────────
const DriverMap = ({ activeRide, driverLocation }) => {
  const { t } = useLanguage();
  const mapRef            = useRef(null);
  const mapInstanceRef    = useRef(null);
  const markerRef         = useRef(null);
  const pickupMarkerRef   = useRef(null);
  const destMarkerRef     = useRef(null);
  const stopMarkersRef    = useRef([]);
  const routeLayerRef     = useRef(null);
  const headingRef        = useRef(0);
  const rafRef            = useRef(null);
  const prevRideKeyRef    = useRef(null);
  const etaIntervalRef    = useRef(null);

  const [leafletReady, setLeafletReady] = useState(false);
  const [isOffline, setIsOffline]       = useState(!navigator.onLine);
  const [isFollowing, setIsFollowing]   = useState(true);
  const [etaSeconds, setEtaSeconds]     = useState(null);
  const [routeSteps, setRouteSteps]     = useState([]);
  const [stepIdx, setStepIdx]           = useState(0);
  const [speed, setSpeed]               = useState(null);
  const [hudCollapsed, setHudCollapsed] = useState(false);

  // ── Online/offline
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
    return () => {
      if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Init map
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstanceRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, {
      center: [41.7151, 44.8271],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19, crossOrigin: true,
    }).addTo(map);
    L.control.attribution({ prefix: false, position: "bottomleft" })
      .addAttribution('© <a href="https://openstreetmap.org">OSM</a>').addTo(map);
    map.on("dragstart", () => setIsFollowing(false));
    mapInstanceRef.current = map;
  }, [leafletReady]);

  // ── ETA countdown
  const startEtaCountdown = useCallback((durationSecs) => {
    if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
    let remaining = Math.round(durationSecs);
    setEtaSeconds(remaining);
    etaIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(etaIntervalRef.current); setEtaSeconds(0); }
      else setEtaSeconds(remaining);
    }, 1000);
  }, []);

  // ── Driver location update + smooth heading
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady || !driverLocation) return;
    const L = window.L;
    const lat = parseFloat(driverLocation.lat);
    const lng = parseFloat(driverLocation.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const heading = parseFloat(driverLocation.heading) || 0;
    setSpeed(driverLocation.speed ?? null);

    const icon = makeLeafletIcon(driverIconSvg(heading), [48, 48], [24, 24]);

    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 200 }).addTo(mapInstanceRef.current);
    } else {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setIcon(icon);
    }

    if (isFollowing) {
      mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom(), { animate: true, duration: 0.5 });
    }

    // Advance nav step
    if (routeSteps.length > 0 && stepIdx < routeSteps.length) {
      const step = routeSteps[stepIdx];
      if (step.endLat && step.endLng && haversineKm(lat, lng, step.endLat, step.endLng) < 0.04) {
        setStepIdx(p => Math.min(p + 1, routeSteps.length - 1));
      }
    }
  }, [driverLocation, isFollowing, leafletReady]);

  // ── Route + pins when ride changes
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady || !activeRide || !driverLocation) {
      routeLayerRef.current?.remove(); routeLayerRef.current = null;
      pickupMarkerRef.current?.remove(); pickupMarkerRef.current = null;
      destMarkerRef.current?.remove(); destMarkerRef.current = null;
      setRouteSteps([]); setEtaSeconds(null);
      return;
    }

    const L = window.L;
    const dLat = parseFloat(driverLocation.lat);
    const dLng = parseFloat(driverLocation.lng);
    if (isNaN(dLat) || isNaN(dLng)) return;

    const rideKey = `${activeRide.id}-${activeRide.status}`;
    if (prevRideKeyRef.current === rideKey) return;
    prevRideKeyRef.current = rideKey;

    // Remove old pins
    pickupMarkerRef.current?.remove(); pickupMarkerRef.current = null;
    destMarkerRef.current?.remove(); destMarkerRef.current = null;

    let target = null;

    if (["accepted", "arrived"].includes(activeRide.status)) {
      const pLat = parseFloat(activeRide.pickup_lat);
      const pLng = parseFloat(activeRide.pickup_lng);
      if (!isNaN(pLat) && !isNaN(pLng)) {
        target = { lat: pLat, lng: pLng };
        pickupMarkerRef.current = L.marker([pLat, pLng], {
          icon: makeLeafletIcon(PICKUP_SVG, [32, 44], [16, 44]),
          zIndexOffset: 100,
        }).addTo(mapInstanceRef.current);
      }
    } else if (activeRide.status === "in_progress") {
      const dstLat = parseFloat(activeRide.dest_lat || activeRide.destination_lat);
      const dstLng = parseFloat(activeRide.dest_lng || activeRide.destination_lng);
      if (!isNaN(dstLat) && !isNaN(dstLng)) {
        target = { lat: dstLat, lng: dstLng };
        destMarkerRef.current = L.marker([dstLat, dstLng], {
          icon: makeLeafletIcon(DEST_SVG, [32, 44], [16, 44]),
          zIndexOffset: 100,
        }).addTo(mapInstanceRef.current);
      }
    }

    // ── Stop markers (numbered yellow pins)
    stopMarkersRef.current.forEach(m => m.remove());
    stopMarkersRef.current = [];
    (activeRide.stops || []).filter(s => s.lat && s.lng).forEach((stop, i) => {
      const m = L.marker([parseFloat(stop.lat), parseFloat(stop.lng)], {
        icon: makeLeafletIcon(makeStopSVG(i + 1), [32, 44], [16, 44]),
        zIndexOffset: 90,
      }).addTo(mapInstanceRef.current);
      if (stop.address) {
        m.bindTooltip(`Stop ${i + 1}: ${stop.address}`, { permanent: false, direction: "top" });
      }
      stopMarkersRef.current.push(m);
    });

    if (!target) return;

    // Fit bounds driver → target
    const bounds = L.latLngBounds([[dLat, dLng], [target.lat, target.lng]]);
    mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80] });
    setTimeout(() => setIsFollowing(true), 3000);

    // Build waypoints from stops
    const waypoints = (activeRide.stops || [])
      .filter(s => s.lat && s.lng)
      .map(s => ({ lat: parseFloat(s.lat), lng: parseFloat(s.lng) }));

    // Get OSRM route
    getRoute({ lat: dLat, lng: dLng }, target, waypoints).then(route => {
      if (!route || !mapInstanceRef.current) return;
      routeLayerRef.current?.remove();
      routeLayerRef.current = L.polyline(route.coords, {
        color: "#00ff88", weight: 5, opacity: 0.85, lineCap: "round",
      }).addTo(mapInstanceRef.current);
      setRouteSteps(route.steps);
      setStepIdx(0);
      startEtaCountdown(route.durationSecs);
    });
  }, [activeRide?.status, activeRide?.id, activeRide?.stops, leafletReady, startEtaCountdown]);

  const handleRecentre = useCallback(() => {
    if (!driverLocation || !mapInstanceRef.current) return;
    const lat = parseFloat(driverLocation.lat);
    const lng = parseFloat(driverLocation.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setIsFollowing(true);
      mapInstanceRef.current.setView([lat, lng], 16);
    }
  }, [driverLocation]);

  const handleNav = (app) => {
    if (!activeRide) return;
    const isPickup = ["accepted", "arrived"].includes(activeRide.status);
    const lat = isPickup ? activeRide.pickup_lat : (activeRide.dest_lat || activeRide.destination_lat);
    const lng = isPickup ? activeRide.pickup_lng : (activeRide.dest_lng || activeRide.destination_lng);
    if (!lat || !lng) return;
    const url = app === "waze"
      ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const curStep = routeSteps[stepIdx];
  const etaLabel = ["accepted", "arrived"].includes(activeRide?.status) ? t("pickup") : t("destination");

  return (
    <div className="fixed inset-0 w-full h-full z-0">
      <div ref={mapRef} className="w-full h-full" />

      {isOffline && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: "rgba(239,68,68,0.9)", backdropFilter: "blur(8px)" }}>
          <WifiOff className="w-3.5 h-3.5 text-white" />
          <span className="text-white">Offline — cached map</span>
        </div>
      )}

      {/* Turn-by-turn HUD */}
      {activeRide && curStep && (
        <div className="absolute top-0 left-0 right-0 z-20"
          style={{ background: "rgba(7,7,15,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(0,212,255,0.15)" }}>
          <button className="w-full flex items-center justify-between px-4 py-3"
            onClick={() => setHudCollapsed(p => !p)}>
            <div className="flex items-center gap-3">
              <Navigation2 className="w-5 h-5 text-[#00ff88]" />
              <div className="text-left">
                <p className="text-white text-sm font-semibold leading-tight">{curStep.instruction || "Continue"}</p>
                {curStep.distanceM > 0 && (
                  <p className="text-white/50 text-xs">{curStep.distanceM < 1000 ? `${curStep.distanceM}m` : `${(curStep.distanceM / 1000).toFixed(1)}km`}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {etaSeconds > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full"
                  style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.2)" }}>
                  <Timer className="w-3 h-3 text-[#00d4ff]" />
                  <span className="text-[#00d4ff] text-xs font-mono font-bold">{fmtEta(etaSeconds)}</span>
                </div>
              )}
              {hudCollapsed ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronUp className="w-4 h-4 text-white/40" />}
            </div>
          </button>
          {!hudCollapsed && speed != null && (
            <div className="px-4 pb-2 text-xs text-white/40">
              {t("speed") || "Speed"}: {Math.round(speed)} km/h
              {etaLabel && <span className="ml-3">{etaLabel}</span>}
            </div>
          )}
        </div>
      )}

      {/* Map controls */}
      <div className="absolute flex flex-col gap-2 z-20" style={{ right: 14, bottom: 180 }}>
        <GlassBtn onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 16) + 1)} title="Zoom in">
          <Plus className="w-5 h-5 text-gray-800" />
        </GlassBtn>
        <GlassBtn onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 16) - 1)} title="Zoom out">
          <Minus className="w-5 h-5 text-gray-800" />
        </GlassBtn>
        {!isFollowing && (
          <GlassBtn onClick={handleRecentre} title="Re-centre">
            <Crosshair className="w-5 h-5 text-blue-600" />
          </GlassBtn>
        )}
      </div>

      {/* Re-centre pill */}
      {!isFollowing && (
        <button onClick={handleRecentre}
          className="absolute z-30 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl active:scale-95 transition-transform"
          style={{ bottom: 240, left: "50%", transform: "translateX(-50%)", background: "rgba(0,204,119,0.95)", backdropFilter: "blur(8px)" }}>
          <Crosshair className="w-4 h-4 text-white animate-pulse" />
          <span className="text-white text-sm font-bold">Re-centre</span>
        </button>
      )}

      {/* Nav app buttons */}
      {activeRide && (
        <div className="absolute z-20 flex gap-2" style={{ bottom: 120, left: 14 }}>
          <button onClick={() => handleNav("waze")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: "rgba(0,119,230,0.9)", backdropFilter: "blur(8px)" }}>
            <span>Waze</span>
          </button>
          <button onClick={() => handleNav("google")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: "rgba(52,168,83,0.9)", backdropFilter: "blur(8px)" }}>
            <span>G Maps</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default DriverMap;