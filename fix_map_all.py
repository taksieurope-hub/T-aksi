path = "frontend/src/components/RiderPortal.jsx"
c = open(path, encoding="utf-8").read()

BRIGHT_STYLES = """[
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#4a5568" }] },
        { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#00d4ff" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
        { featureType: "poi", elementType: "geometry", stylers: [{ color: "#1a2035" }] },
      ]"""

DARK_STYLES = """[
        { elementType: "geometry", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0d0d1a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#111827" }] },
      ]"""

count = c.count(DARK_STYLES.strip())
print(f"Found {count} instances of dark styles")
c = c.replace(DARK_STYLES.strip(), BRIGHT_STYLES.strip())

# Fix map picker to pan to user location AFTER map initializes
old_init = "  }, [isOpen]);\n\n  const handleLocateMe"
new_init = """  // Pan to user location when map opens if no initialLocation
  useEffect(() => {
    if (!isOpen || !mapInstanceRef.current) return;
    if (!initialLocation?.lat && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude, lng = pos.coords.longitude;
          mapInstanceRef.current.panTo({ lat, lng });
          mapInstanceRef.current.setZoom(17);
          setCenter({ lat, lng });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [isOpen, mapInstanceRef.current]);

  }, [isOpen]);

  const handleLocateMe"""

if old_init in c:
    c = c.replace(old_init, new_init)
    print("Fix applied: map pans to user location after init")
else:
    print("Pan fix FAILED - checking...")

open(path, "w", encoding="utf-8").write(c)
print("Done.")
