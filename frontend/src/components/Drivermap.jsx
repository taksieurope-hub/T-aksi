/**
 * DriverMap.jsx — Leaflet + OpenStreetMap for T'aksi Driver
 *
 * FIXES applied:
 *  1. HUD repositioned to bottom of map so it never overlaps the portal header
 *  2. Driver arrow rotates to actual GPS compass heading on every location update
 *  3. Auto-reroute: if driver drifts >80m off the polyline, OSRM is re-queried
 *     (throttled to once per 15s to avoid hammering the free API)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigation2, Minus, Plus, Crosshair, WifiOff, Timer, ChevronUp, ChevronDown, Compass } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

// ─── useCompassHeading ────────────────────────────────────────────────────────
// Fuses two heading sources for maximum accuracy:
//   1. DeviceOrientationEvent  — physical compass chip (great at low speed)
//   2. GPS position.coords.heading — true bearing (reliable above ~8 km/h)
// Returns a smoothly-interpolated heading in degrees and an iOS permission helper.
const useCompassHeading = (gpsHeading) => {
  const [heading, setHeading]       = useState(gpsHeading || 0);
  const [needsPermission, setNeeds] = useState(false);
  const [source, setSource]         = useState("gps");
  const smoothRef                   = useRef(gpsHeading || 0);
  const rafRef                      = useRef(null);

  // Shortest-path animated lerp so the map glides rather than snapping
  const smoothTo = useCallback((target) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const curr = smoothRef.current;
      const diff = ((target - curr + 540) % 360) - 180;  // −180…+180
      const next = (curr + diff * 0.12 + 360) % 360;
      smoothRef.current = next;
      setHeading(Math.round(next));
      if (Math.abs(diff) > 0.5) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // GPS bearing fallback (used when compass unavailable or moving fast)
  useEffect(() => {
    if (typeof gpsHeading === "number" && !isNaN(gpsHeading) && gpsHeading > 0) {
      if (source === "gps") smoothTo(gpsHeading);
    }
  }, [gpsHeading, source, smoothTo]);

  // Physical compass via DeviceOrientationEvent
  useEffect(() => {
    const handler = (e) => {
      // iOS: webkitCompassHeading is already magnetic-north-relative (0-360)
      // Android: e.alpha is counter-clockwise from browser frame — negate it
      let deg = null;
      if (typeof e.webkitCompassHeading === "number") {
        deg = e.webkitCompassHeading;
      } else if (typeof e.alpha === "number") {
        deg = (360 - e.alpha) % 360;
      }
      if (deg === null || isNaN(deg)) return;
      setSource("compass");
      smoothTo(deg);
    };

    // iOS 13+ requires explicit user permission before the event fires
    if (typeof DeviceOrientationEvent?.requestPermission === "function") {
      setNeeds(true);
    } else {
      window.addEventListener("deviceorientation", handler, true);
    }
    return () => {
      window.removeEventListener("deviceorientation", handler, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [smoothTo]);

  const requestPermission = useCallback(async () => {
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res === "granted") {
        setNeeds(false);
        const h = (e) => {
          const deg = typeof e.webkitCompassHeading === "number"
            ? e.webkitCompassHeading
            : (360 - e.alpha) % 360;
          setSource("compass");
          smoothTo(deg);
        };
        window.addEventListener("deviceorientation", h, true);
      }
    } catch {}
  }, [smoothTo]);

  return { heading, needsPermission, requestPermission, source };
};

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
  const R = 6371,
    dL = ((lat2 - lat1) * Math.PI) / 180,
    dl = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Minimum distance from point to any segment on the polyline (km) ──────────
// Used to decide if driver is "on route" or has gone off it.
const distToPolylineKm = (lat, lng, polyLatLngs) => {
  if (!polyLatLngs || polyLatLngs.length < 2) return Infinity;
  let minDist = Infinity;
  for (let i = 0; i < polyLatLngs.length - 1; i++) {
    // Approximate: just check distance to each vertex (fast enough for our use)
    const d = haversineKm(lat, lng, polyLatLngs[i][0], polyLatLngs[i][1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
};

// ─── SVG icons ────────────────────────────────────────────────────────────────
const makeLeafletIcon = (svg, size, anchor) => {
  if (!window.L) return null;
  return window.L.divIcon({ html: svg, className: "", iconSize: size, iconAnchor: anchor });
};

// FIX 2: heading baked directly into the SVG transform so the arrow always
// points the way the driver is actually travelling.
const driverIconSvg = (heading = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
  <g transform="rotate(${heading}, 26, 26)">
    <circle cx="26" cy="26" r="22" fill="#00ff88" opacity="0.18"/>
    <circle cx="26" cy="26" r="17" fill="#00ff88"/>
    <!-- Arrow points UP = 0° heading; rotates with actual bearing -->
    <path d="M26 10 L32 26 L26 22 L20 26 Z" fill="#07070f"/>
  </g>
</svg>`;

const PICKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14 22.6 2 16 2z" fill="#00ff88" stroke="#07070f" stroke-width="2"/>
  <circle cx="16" cy="14" r="5" fill="#07070f"/>
</svg>`;

const makeStopSVG = (num) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14 22.6 2 16 2z" fill="#f5c842" stroke="#07070f" stroke-width="2"/>
  <text x="16" y="19" text-anchor="middle" font-size="11" font-weight="bold" fill="#07070f" font-family="system-ui">${num}</text>
</svg>`;

const DEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
  <path d="M16 2C9.4 2 4 7.4 4 14c0 9 12 28 12 28S28 23 28 14 22.6 2 16 2z" fill="#ef4444" stroke="#07070f" stroke-width="2"/>
  <circle cx="16" cy="14" r="5" fill="#07070f"/>
</svg>`;

// ─── Glass button ──────────────────────────────────────────────────────────────
const GlassBtn = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
    style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)" }}
  >
    {children}
  </button>
);

// ─── Format ETA ───────────────────────────────────────────────────────────────
const fmtEta = (secs) => {
  if (!secs || secs <= 0) return null;
  const m = Math.floor(secs / 60),
    s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

// ─── Main DriverMap component ─────────────────────────────────────────────────
const DriverMap = ({ activeRide, driverLocation }) => {
  const { t } = useLanguage();
  const mapRef           = useRef(null);
  const mapInstanceRef   = useRef(null);
  const markerRef        = useRef(null);
  const pickupMarkerRef  = useRef(null);
  const destMarkerRef    = useRef(null);
  const stopMarkersRef   = useRef([]);
  const routeLayerRef    = useRef(null);
  const routeCoordsRef   = useRef([]);   // FIX 3: keep polyline coords for off-route check
  const lastRerouteRef   = useRef(0);    // FIX 3: throttle timestamp
  const prevRideKeyRef   = useRef(null);
  const etaIntervalRef   = useRef(null);
  const activeRideRef    = useRef(activeRide);

  const [leafletReady, setLeafletReady] = useState(false);
  const [isOffline, setIsOffline]       = useState(!navigator.onLine);
  const [isFollowing, setIsFollowing]   = useState(true);
  const [etaSeconds, setEtaSeconds]     = useState(null);
  const [routeSteps, setRouteSteps]     = useState([]);
  const [stepIdx, setStepIdx]           = useState(0);
  const [speed, setSpeed]               = useState(null);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [isRerouting, setIsRerouting]   = useState(false);
  const [headingMode, setHeadingMode]   = useState(false);

  // Fused GPS + physical compass heading (smooth lerp built into the hook)
  const gpsHeading = parseFloat(driverLocation?.heading) || 0;
  const { heading, needsPermission, requestPermission, source } = useCompassHeading(gpsHeading);

  // ── Rotate the map container so "up" always = direction of travel ──────────
  // We CSS-rotate the whole map div (tiles + polyline + markers move together).
  // The HUD, controls, and badges sit OUTSIDE mapRef so they stay upright.
  // This is the only way to get Waze-style rotation in Leaflet — it has no
  // native setHeading API.
  useEffect(() => {
    if (!mapRef.current) return;
    if (headingMode && isFollowing) {
      mapRef.current.style.transform       = `rotate(${-heading}deg)`;
      mapRef.current.style.transformOrigin = "center center";
      mapRef.current.style.transition      = "transform 0.35s ease-out";
    } else {
      mapRef.current.style.transform  = "rotate(0deg)";
      mapRef.current.style.transition = "transform 0.4s ease-out";
    }
  }, [heading, headingMode, isFollowing]);

  // Keep ride ref fresh so reroute callback doesn't capture stale state
  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);

  // ── Online/offline listener
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ── Load Leaflet + cleanup
  useEffect(() => {
    loadLeaflet().then(() => setLeafletReady(true)).catch(console.error);
    return () => {
      if (etaIntervalRef.current) clearInterval(etaIntervalRef.current);
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
      subdomains: "abcd",
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);
    L.control
      .attribution({ prefix: false, position: "bottomleft" })
      .addAttribution('© <a href="https://openstreetmap.org">OSM</a>')
      .addTo(map);
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
      if (remaining <= 0) {
        clearInterval(etaIntervalRef.current);
        setEtaSeconds(0);
      } else {
        setEtaSeconds(remaining);
      }
    }, 1000);
  }, []);

  // ── Helper: draw a new polyline from OSRM result
  const applyRoute = useCallback((route) => {
    if (!route || !mapInstanceRef.current) return;
    const L = window.L;
    routeLayerRef.current?.remove();
    routeLayerRef.current = L.polyline(route.coords, {
      color: "#00ff88",
      weight: 5,
      opacity: 0.88,
      lineCap: "round",
    }).addTo(mapInstanceRef.current);
    routeCoordsRef.current = route.coords;     // FIX 3: cache coords for off-route check
    setRouteSteps(route.steps);
    setStepIdx(0);
    startEtaCountdown(route.durationSecs);
  }, [startEtaCountdown]);

  // ── FIX 3: Off-route detector — called from driver location effect below
  const checkAndReroute = useCallback(async (lat, lng) => {
    const ride = activeRideRef.current;
    if (!ride) return;

    const now = Date.now();
    // Throttle: at most once per 15 seconds
    if (now - lastRerouteRef.current < 15000) return;
    // Only reroute during active navigation
    if (!["accepted", "arrived", "in_progress"].includes(ride.status)) return;
    // Only reroute if the route has already been drawn
    if (routeCoordsRef.current.length < 2) return;

    const distOffRoute = distToPolylineKm(lat, lng, routeCoordsRef.current);
    // Threshold: 80m off the drawn polyline triggers a recalc
    if (distOffRoute < 0.08) return;

    lastRerouteRef.current = now;
    setIsRerouting(true);

    let target = null;
    const waypoints = (ride.stops || [])
      .filter(s => s.lat && s.lng)
      .map(s => ({ lat: parseFloat(s.lat), lng: parseFloat(s.lng) }));

    if (["accepted", "arrived"].includes(ride.status)) {
      const pLat = parseFloat(ride.pickup_lat);
      const pLng = parseFloat(ride.pickup_lng);
      if (!isNaN(pLat)) target = { lat: pLat, lng: pLng };
    } else if (ride.status === "in_progress") {
      const dLat = parseFloat(ride.dest_lat || ride.destination_lat);
      const dLng = parseFloat(ride.dest_lng || ride.destination_lng);
      if (!isNaN(dLat)) target = { lat: dLat, lng: dLng };
    }

    if (!target) { setIsRerouting(false); return; }

    const route = await getRoute({ lat, lng }, target, waypoints);
    if (route) applyRoute(route);
    setIsRerouting(false);
  }, [applyRoute]);

  // ── FIX 2 + 3: Driver location → update marker heading + trigger reroute check
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady || !driverLocation) return;
    const L = window.L;
    const lat = parseFloat(driverLocation.lat);
    const lng = parseFloat(driverLocation.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    // FIX 2: Read heading from GPS coords — this is the real compass bearing.
    // speed from Geolocation API is in m/s, convert to km/h for display.
    const heading = parseFloat(driverLocation.heading) || 0;
    const speedKmh = driverLocation.speed != null ? driverLocation.speed * 3.6 : null;
    setSpeed(speedKmh);

    // Recreate the icon with the live heading baked in
    const icon = makeLeafletIcon(driverIconSvg(heading), [52, 52], [26, 26]);

    if (!markerRef.current) {
      markerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 200 }).addTo(mapInstanceRef.current);
    } else {
      markerRef.current.setLatLng([lat, lng]);
      // setIcon is lightweight — Leaflet just swaps the DOM element's innerHTML
      markerRef.current.setIcon(icon);
    }

    if (isFollowing) {
      mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom(), {
        animate: true,
        duration: 0.4,
      });
    }

    // Advance nav step when close to end of current step
    if (routeSteps.length > 0 && stepIdx < routeSteps.length) {
      const step = routeSteps[stepIdx];
      if (
        step.endLat &&
        step.endLng &&
        haversineKm(lat, lng, step.endLat, step.endLng) < 0.04
      ) {
        setStepIdx(p => Math.min(p + 1, routeSteps.length - 1));
      }
    }

    // FIX 3: Check if we've gone off the drawn route
    checkAndReroute(lat, lng);
  }, [driverLocation, isFollowing, leafletReady, routeSteps, stepIdx, checkAndReroute]);

  // ── Route + pins when ride changes (status or id)
  useEffect(() => {
    if (!mapInstanceRef.current || !leafletReady || !activeRide || !driverLocation) {
      routeLayerRef.current?.remove();
      routeLayerRef.current = null;
      routeCoordsRef.current = [];
      pickupMarkerRef.current?.remove();
      pickupMarkerRef.current = null;
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      setRouteSteps([]);
      setEtaSeconds(null);
      return;
    }

    const L = window.L;
    const dLat = parseFloat(driverLocation.lat);
    const dLng = parseFloat(driverLocation.lng);
    if (isNaN(dLat) || isNaN(dLng)) return;

    const rideKey = `${activeRide.id}-${activeRide.status}`;
    if (prevRideKeyRef.current === rideKey) return;
    prevRideKeyRef.current = rideKey;
    // Reset reroute throttle on fresh route so we recalc immediately if needed
    lastRerouteRef.current = 0;

    // Remove stale pins
    pickupMarkerRef.current?.remove(); pickupMarkerRef.current = null;
    destMarkerRef.current?.remove();   destMarkerRef.current   = null;

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

    // Stop markers (numbered yellow pins)
    stopMarkersRef.current.forEach(m => m.remove());
    stopMarkersRef.current = [];
    (activeRide.stops || [])
      .filter(s => s.lat && s.lng)
      .forEach((stop, i) => {
        const m = L.marker([parseFloat(stop.lat), parseFloat(stop.lng)], {
          icon: makeLeafletIcon(makeStopSVG(i + 1), [32, 44], [16, 44]),
          zIndexOffset: 90,
        }).addTo(mapInstanceRef.current);
        if (stop.address)
          m.bindTooltip(`Stop ${i + 1}: ${stop.address}`, { permanent: false, direction: "top" });
        stopMarkersRef.current.push(m);
      });

    if (!target) return;

    // Fit bounds driver → target
    const bounds = L.latLngBounds([[dLat, dLng], [target.lat, target.lng]]);
    mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80] });
    setTimeout(() => setIsFollowing(true), 3000);

    const waypoints = (activeRide.stops || [])
      .filter(s => s.lat && s.lng)
      .map(s => ({ lat: parseFloat(s.lat), lng: parseFloat(s.lng) }));

    getRoute({ lat: dLat, lng: dLng }, target, waypoints).then(applyRoute);
  }, [activeRide?.status, activeRide?.id, activeRide?.stops, leafletReady, applyRoute]);

  const handleRecentre = useCallback(() => {
    if (!driverLocation || !mapInstanceRef.current) return;
    const lat = parseFloat(driverLocation.lat);
    const lng = parseFloat(driverLocation.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setIsFollowing(true);
      mapInstanceRef.current.setView([lat, lng], 17, { animate: true });
    }
  }, [driverLocation]);

  const handleNav = (app) => {
    if (!activeRide) return;
    const isPickup = ["accepted", "arrived"].includes(activeRide.status);
    const lat = isPickup ? activeRide.pickup_lat : (activeRide.dest_lat || activeRide.destination_lat);
    const lng = isPickup ? activeRide.pickup_lng : (activeRide.dest_lng || activeRide.destination_lng);
    if (!lat || !lng) return;
    const url =
      app === "waze"
        ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const curStep  = routeSteps[stepIdx];
  const nextStep = routeSteps[stepIdx + 1];
  const etaLabel = ["accepted", "arrived"].includes(activeRide?.status)
    ? (t("to_pickup") || "to pickup")
    : (t("to_destination") || "to destination");

  return (
    <div className="fixed inset-0 w-full h-full z-0">
      <div ref={mapRef} className="w-full h-full" />

      {/* ── Offline badge ─────────────────────────────────────────────────── */}
      {isOffline && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ background: "rgba(239,68,68,0.9)", backdropFilter: "blur(8px)" }}
        >
          <WifiOff className="w-3.5 h-3.5 text-white" />
          <span className="text-white">Offline — cached map</span>
        </div>
      )}

      {/* ── Rerouting toast ───────────────────────────────────────────────── */}
      {isRerouting && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold"
          style={{ background: "rgba(0,180,255,0.92)", backdropFilter: "blur(8px)" }}
        >
          <Navigation2 className="w-3.5 h-3.5 text-white animate-spin" />
          <span className="text-white">Recalculating…</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          FIX 1: HUD is now anchored to the BOTTOM of the map, sitting just
          above the bottom sheet (z-40). This way it never overlaps the portal
          header which lives at the top of the screen.
          bottom-[72vh] aligns with where the bottom sheet starts.
      ──────────────────────────────────────────────────────────────────────── */}
      {activeRide && curStep && (
        <div
          className="absolute left-3 right-3 z-30 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            bottom: "calc(72vh + 12px)",          // sits just above the bottom sheet
            background: "rgba(7,7,15,0.93)",
            border: "1px solid rgba(0,255,136,0.18)",
            backdropFilter: "blur(16px)",
            pointerEvents: "auto",
          }}
        >
          {/* Primary step row */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3"
            onClick={() => setHudCollapsed(p => !p)}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,255,136,0.15)", border: "1.5px solid rgba(0,255,136,0.4)" }}
            >
              <Navigation2 className="w-6 h-6 text-[#00ff88]" />
            </div>

            <div className="flex-1 text-left min-w-0">
              <p className="text-white font-semibold text-sm leading-snug line-clamp-1">
                {curStep.instruction || "Continue"}
              </p>
              {curStep.distanceM > 0 && (
                <p className="text-white/50 text-xs mt-0.5">
                  {curStep.distanceM < 1000
                    ? `${curStep.distanceM} m`
                    : `${(curStep.distanceM / 1000).toFixed(1)} km`}
                </p>
              )}
            </div>

            {/* ETA pill */}
            {etaSeconds > 0 && (
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-full shrink-0"
                style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.25)" }}
              >
                <Timer className="w-3 h-3 text-[#00d4ff]" />
                <span className="text-[#00d4ff] text-xs font-mono font-bold">
                  {fmtEta(etaSeconds)}
                </span>
              </div>
            )}

            {hudCollapsed
              ? <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
              : <ChevronUp   className="w-4 h-4 text-white/30 shrink-0" />}
          </button>

          {/* Expanded: next step + speed */}
          {!hudCollapsed && (
            <div
              className="px-4 pb-3 pt-1 space-y-1"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              {nextStep && (
                <p className="text-white/40 text-xs">
                  <span className="text-white/25 uppercase tracking-wider mr-1">then</span>
                  {nextStep.instruction}
                  {nextStep.distanceM > 0 && (
                    <span className="ml-1 text-white/25">
                      — {nextStep.distanceM < 1000
                        ? `${nextStep.distanceM}m`
                        : `${(nextStep.distanceM / 1000).toFixed(1)}km`}
                    </span>
                  )}
                </p>
              )}
              {speed != null && (
                <p className="text-white/30 text-xs">
                  {Math.round(speed)} km/h
                  <span className="ml-2 text-white/20">{etaLabel}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Map controls (right edge, vertically centred) ─────────────────── */}
      <div className="absolute flex flex-col gap-2 z-20" style={{ right: 14, top: "38%" }}>
        <GlassBtn
          onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 16) + 1)}
          title="Zoom in"
        >
          <Plus className="w-5 h-5 text-gray-800" />
        </GlassBtn>
        <GlassBtn
          onClick={() => mapInstanceRef.current?.setZoom((mapInstanceRef.current.getZoom() || 16) - 1)}
          title="Zoom out"
        >
          <Minus className="w-5 h-5 text-gray-800" />
        </GlassBtn>
        <GlassBtn onClick={handleRecentre} title="Re-centre on driver">
          <Crosshair className={`w-5 h-5 ${isFollowing ? "text-emerald-600" : "text-blue-600"}`} />
        </GlassBtn>

        {/* ── Heading-up / North-up toggle ──────────────────────────────── */}
        <button
          title={headingMode ? "Switch to North-up" : "Switch to Heading-up"}
          onClick={() => {
            if (needsPermission) { requestPermission(); return; }
            setHeadingMode(p => !p);
            if (!headingMode) setIsFollowing(true); // snap back to follow on enable
          }}
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all relative overflow-hidden"
          style={{
            background: headingMode
              ? "rgba(0,255,136,0.92)"
              : "rgba(255,255,255,0.92)",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Inner compass needle rotates to show real North direction */}
          <Compass
            className="w-5 h-5 transition-transform duration-300"
            style={{
              color: headingMode ? "#07070f" : "#374151",
              transform: headingMode ? `rotate(${heading}deg)` : "rotate(0deg)",
            }}
          />
          {/* Small dot shows compass source: green = physical compass, blue = GPS */}
          <span
            className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full"
            style={{ background: source === "compass" ? "#00ff88" : "#00d4ff" }}
          />
        </button>
      </div>

      {/* ── iOS compass permission prompt ─────────────────────────────────── */}
      {needsPermission && headingMode === false && (
        <button
          onClick={requestPermission}
          className="absolute z-30 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl active:scale-95 transition-transform"
          style={{
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(7,7,15,0.93)",
            border: "1px solid rgba(0,255,136,0.3)",
            backdropFilter: "blur(12px)",
          }}
        >
          <Compass className="w-4 h-4 text-[#00ff88]" />
          <span className="text-white text-sm font-bold">Enable compass</span>
        </button>
      )}

      {/* ── Re-centre pill (appears when driver pans away) ────────────────── */}
      {!isFollowing && (
        <button
          onClick={handleRecentre}
          className="absolute z-30 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl active:scale-95 transition-transform"
          style={{
            bottom: "calc(72vh + 80px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,204,119,0.95)",
            backdropFilter: "blur(8px)",
          }}
        >
          <Crosshair className="w-4 h-4 text-white animate-pulse" />
          <span className="text-white text-sm font-bold">Re-centre</span>
        </button>
      )}

      {/* ── External nav deep-links ───────────────────────────────────────── */}
      {activeRide && (
        <div className="absolute z-20 flex gap-2" style={{ bottom: "calc(72vh + 14px)", left: 14 }}>
          <button
            onClick={() => handleNav("waze")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: "rgba(0,119,230,0.9)", backdropFilter: "blur(8px)" }}
          >
            Waze
          </button>
          <button
            onClick={() => handleNav("google")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white"
            style={{ background: "rgba(52,168,83,0.9)", backdropFilter: "blur(8px)" }}
          >
            G Maps
          </button>
        </div>
      )}
    </div>
  );
};

export default DriverMap;