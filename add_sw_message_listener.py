path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add service worker message listener after handleAcceptRide definition
old = "  const handleAcceptRide = async (rideId) => {"
new = """  // Listen for ACCEPT_RIDE message from service worker notification action
  React.useEffect(() => {
    const handleSWMessage = (event) => {
      if (event.data && event.data.type === "ACCEPT_RIDE" && event.data.ride_id) {
        handleAcceptRide(event.data.ride_id);
      }
    };
    navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", handleSWMessage);
    // Also handle URL param ?accept=rideId when opened from notification
    const params = new URLSearchParams(window.location.search);
    const acceptId = params.get("accept");
    if (acceptId) {
      setTimeout(() => handleAcceptRide(acceptId), 1500);
      window.history.replaceState({}, "", window.location.pathname);
    }
    return () => {
      navigator.serviceWorker && navigator.serviceWorker.removeEventListener("message", handleSWMessage);
    };
  }, []);

  const handleAcceptRide = async (rideId) => {"""

if old in c:
    c = c.replace(old, new)
    print("OK: SW message listener added")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
