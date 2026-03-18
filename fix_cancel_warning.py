path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '''    if (!activeRide) return;
    try {
      await api.post(`/rides/${activeRide.id}/cancel`);
      toast.success("Ride cancelled");
      setActiveRide(null);
      setActiveTab("book");
      if (refreshUser) refreshUser();
    } catch { toast.error("Failed to cancel"); }
  };'''

new = '''    if (!activeRide) return;
    // Warn about cancellation fee if driver has arrived
    if (activeRide.status === "arrived") {
      const confirmed = window.confirm("⚠️ The driver has already arrived. A GEL 3.00 no-show fee will be charged to your wallet. Cancel anyway?");
      if (!confirmed) return;
    }
    try {
      const res = await api.post(`/rides/${activeRide.id}/cancel`);
      if (res.data?.cancellation_fee > 0) {
        toast.error(`Ride cancelled. GEL ${res.data.cancellation_fee.toFixed(2)} no-show fee charged.`);
      } else {
        toast.success("Ride cancelled");
      }
      setActiveRide(null);
      setActiveTab("book");
      if (refreshUser) refreshUser();
    } catch { toast.error("Failed to cancel"); }
  };'''

if old in c:
    c = c.replace(old, new)
    print("OK: cancel handler updated with fee warning")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
