import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%'
};

// Default center (if no data)
const defaultCenter = { lat: 41.7151, lng: 44.8271 };

import { GOOGLE_MAPS_API_KEY } from '@/config'; // Adjust path if needed

const LiveTrackingMap = ({ pickup, destination, driverLocation, status }) => {
  // 1. Load the Google Maps API
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY, // ✅ Much cleaner!
    libraries: ['places'] 
  });

  const [map, setMap] = useState(null);
  const [directionsResponse, setDirectionsResponse] = useState(null);
  
  // Keep track of previous coordinates to prevent infinite re-renders
  const prevPickup = useRef(null);
  const prevDest = useRef(null);

  const onLoad = useCallback(function callback(map) {
    setMap(map);
  }, []);

  const onUnmount = useCallback(function callback(map) {
    setMap(null);
  }, []);

  // 2. 🔥 CALCULATE THE NAVIGATION LINE (ROUTE)
  // Inside your LiveTrackingMap.jsx useEffect:
useEffect(() => {
  if (isLoaded && pickup && destination) {
    const directionsService = new window.google.maps.DirectionsService();

    // 🚀 NEW: Convert your stops array into Google Waypoints
    const waypoints = (stops || []).map(stop => ({
      location: { lat: stop.lat, lng: stop.lng },
      stopover: true,
    }));

    directionsService.route(
      {
        origin: pickup,
        destination: destination,
        waypoints: waypoints, // 🚀 ADD THIS
        optimizeWaypoints: false, // Keep them in the order the driver added them
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK) {
          setDirectionsResponse(result);
        }
      }
    );
  }
}, [isLoaded, pickup, destination, stops]); // 🚀 Add 'stops' to dependency array

  if (!isLoaded) return <div className="w-full h-full bg-gray-900 animate-pulse" />;

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={driverLocation || pickup || defaultCenter}
      zoom={14}
      onLoad={onLoad}
      onUnmount={onUnmount}
      options={{
        disableDefaultUI: true, // Clean look
        zoomControl: false,
        styles: [ // Dark Mode Style
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
        ]
      }}
    >
      {/* 3. Render the Navigation Line */}
      {directionsResponse && (
        <DirectionsRenderer
          directions={directionsResponse}
          options={{
            suppressMarkers: true, // Hide default A/B markers so we can use custom ones
            polylineOptions: {
              strokeColor: "#00d4ff", // Neon Blue Line
              strokeOpacity: 0.8,
              strokeWeight: 5,
            },
          }}
        />
      )}

      {/* Pickup Marker */}
      {pickup && <Marker position={pickup} label="P" />}

      {/* Destination Marker */}
      {destination && <Marker position={destination} label="D" />}

      {/* 4. Live Driver Car Marker */}
      {driverLocation && (
        <Marker
          position={driverLocation}
          icon={{
            path: "M17.402,0H5.643C2.526,0,0,3.467,0,6.584v34.804c0,3.116,2.526,5.644,5.643,5.644h11.759c3.116,0,5.644-2.527,5.644-5.644 V6.584C23.044,3.467,20.518,0,17.402,0z M22.057,14.188v11.665l-2.729,0.351v-4.806L22.057,14.188z M20.625,10.773 c-1.016,3.9-2.219,8.51-2.219,8.51H4.638l-2.222-8.51C2.417,10.773,11.3,7.755,20.625,10.773z M3.748,21.713v4.492l-2.73-0.349 V14.502L3.748,21.713z M1.018,37.938V27.579l2.73,0.343v8.196L1.018,37.938z M2.575,40.882l2.218-3.336h13.771l2.219,3.336H2.575z M19.328,35.805v-7.872l2.729-0.355v10.048L19.328,35.805z",
            fillColor: "#00ff88", // Neon Green
            fillOpacity: 1,
            strokeWeight: 1,
            rotation: 0, // Calculate heading if you have it
            scale: 0.7,
            anchor: new window.google.maps.Point(10, 25),
          }}
        />
      )}
    </GoogleMap>
  );
};

export default LiveTrackingMap;