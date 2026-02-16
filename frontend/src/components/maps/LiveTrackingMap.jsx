import React, { useEffect, useState, useRef } from 'react';
import { GoogleMap, DirectionsRenderer, Marker } from '@react-google-maps/api';

const containerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '12px'
};

const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  styles: [ /* Optional: Your Dark Mode Styles Here */ ]
};

const LiveTrackingMap = ({ status, driverLocation, pickup, destination, stops = [] }) => {
  const [directions, setDirections] = useState(null);
  const mapRef = useRef(null);

  // 1. ICONS (You can replace URLs with your own custom marker images)
  const icons = {
    car: {
      path: "M17.402,0H5.643C2.526,0,0,3.467,0,6.584v34.804c0,3.116,2.526,5.644,5.643,5.644h11.759c3.116,0,5.644-2.527,5.644-5.644 V6.584C23.044,3.467,20.518,0,17.402,0z M22.057,14.188v11.665l-2.729,0.351v-4.806L22.057,14.188z M20.625,10.773 c-1.016,3.9-2.219,8.51-2.219,8.51H4.638l-2.222-8.51C2.417,10.773,11.3,7.755,20.625,10.773z M3.748,21.713v4.492l-2.73-0.349 V14.502L3.748,21.713z M19.228,43.879H3.816c-1.018,0-1.843-0.825-1.843-1.843v-3.137c0-1.018,0.825-1.843,1.843-1.843 h15.412c1.018,0,1.843,0.825,1.843,1.843v3.137C21.071,43.053,20.246,43.879,19.228,43.879z M19.985,34.034H3.059v-6.369h16.926 V34.034z",
      fillColor: "#00ff88",
      fillOpacity: 1,
      anchor: { x: 10, y: 25 },
      strokeWeight: 0,
      scale: 0.7,
      rotation: 0 // You can calculate bearing for rotation if you want
    },
    pickup: {
      url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
    },
    dropoff: {
      url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
    }
  };

  // 2. CALCULATE ROUTE LOGIC
  useEffect(() => {
    if (!driverLocation || !window.google) return;

    const directionsService = new window.google.maps.DirectionsService();

    let origin = null;
    let dest = null;
    let waypoints = [];

    // --- SCENARIO A: Driver Accepted / On the way to Pickup ---
    if (['accepted', 'arrived'].includes(status)) {
      origin = { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) };
      dest = { lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng) };
    } 
    
    // --- SCENARIO B: Trip In Progress (Driver -> Stops -> Destination) ---
    else if (status === 'in_progress') {
      origin = { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) };
      
      // If we have destination data
      if (destination && destination.lat) {
        dest = { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) };
      }

      // Handle multiple stops (waypoints)
      if (stops && stops.length > 0) {
        waypoints = stops.map(stop => ({
          location: { lat: parseFloat(stop.lat), lng: parseFloat(stop.lng) },
          stopover: true
        }));
      }
    }

    // Only draw if we have valid points
    if (origin && dest) {
      directionsService.route(
        {
          origin: origin,
          destination: dest,
          waypoints: waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            setDirections(result);
          } else {
            console.error(`Route calculation failed: ${status}`);
          }
        }
      );
    }
  }, [driverLocation, status, pickup, destination, stops]);

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={driverLocation ? { lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) } : { lat: 41.7151, lng: 44.8271 }} // Default to Tbilisi if no location
      zoom={14}
      options={mapOptions}
      onLoad={map => mapRef.current = map}
    >
      {/* 1. DRAW THE LINE (ROUTE) */}
      {directions && (
        <DirectionsRenderer
          directions={directions}
          options={{
            suppressMarkers: true, // We draw our own custom markers
            polylineOptions: {
              strokeColor: status === 'in_progress' ? "#00d4ff" : "#00ff88", // Blue for trip, Green for pickup
              strokeWeight: 5,
            },
          }}
        />
      )}

      {/* 2. DRIVER MARKER (Always visible & moving) */}
      {driverLocation && (
        <Marker
          position={{ lat: parseFloat(driverLocation.lat), lng: parseFloat(driverLocation.lng) }}
          icon={icons.car}
          zIndex={2}
        />
      )}

      {/* 3. PICKUP MARKER (Only show if we haven't picked up yet) */}
      {['accepted', 'arrived', 'searching'].includes(status) && pickup && (
        <Marker
          position={{ lat: parseFloat(pickup.lat), lng: parseFloat(pickup.lng) }}
          icon={icons.pickup}
        />
      )}

      {/* 4. DESTINATION MARKER (Show when trip is in progress) */}
      {status === 'in_progress' && destination && (
        <Marker
          position={{ lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) }}
          icon={icons.dropoff}
        />
      )}

      {/* 5. STOP MARKERS (Show intermediate stops) */}
      {status === 'in_progress' && stops.map((stop, index) => (
        <Marker
          key={index}
          position={{ lat: parseFloat(stop.lat), lng: parseFloat(stop.lng) }}
          label={{ text: `${index + 1}`, color: "white" }}
        />
      ))}

    </GoogleMap>
  );
};

export default LiveTrackingMap;