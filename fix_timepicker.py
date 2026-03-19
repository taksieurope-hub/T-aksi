path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '''// SCHEDULED RIDE MODAL ? UNCHANGED
// =============================================================================
const ScheduledRideModal = ({ isOpen, onClose, pickup, destination, carType }) => {
  const { t } = useLanguage();
  const [scheduledTime, setScheduledTime] = useState("");
  const [loading, setLoading]             = useState(false);

  const handleSchedule = async () => {
    if (!pickup?.lat || !destination?.lat) { toast.error("Set pickup and destination first"); return; }
    if (!scheduledTime) { toast.error("Select a date and time"); return; }
    setLoading(true);
    try {
      await api.post("/rides/schedule", {
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        destination_address: destination.address, destination_lat: destination.lat, destination_lng: destination.lng,
        scheduled_time: new Date(scheduledTime).toISOString(),
        car_type: carType, payment_method: "cash", stops: [],
      });
      toast.success("Ride scheduled!");
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to schedule"); } finally { setLoading(false); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-yellow-500/15 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-white text-lg font-bold">Schedule a Ride</h2>
            <p className="text-white/40 text-sm">Book your ride in advance</p>
          </div>
        </div>
        {pickup?.address && <p className="text-xs text-white/40 mb-1 truncate flex items-center gap-1"><MapPin className="w-3 h-3 text-[#00ff88]" />{pickup.address}</p>}
        {destination?.address && <p className="text-xs text-white/40 mb-4 truncate flex items-center gap-1"><Navigation className="w-3 h-3 text-[#00d4ff]" />{destination.address}</p>}
        <div className="mb-4">
          <label className="text-white/40 text-xs font-medium mb-1.5 block">Date & Time</label>
          <Input type="datetime-local" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
            min={new Date(Date.now() + 30 * 60000).toISOString().slice(0, 16)}
            className="bg-white/5 border-white/10 text-white h-12 rounded-xl" />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-white/10 text-white/40 rounded-xl h-12" onClick={onClose}>{t("cancel")}</Button>
          <Button className="flex-1 bg-yellow-500 text-black font-bold rounded-xl h-12" onClick={handleSchedule} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
            Schedule
          </Button>
        </div>
      </div>
    </div>
  );
};'''

new = '''// SCHEDULED RIDE MODAL — custom date/time picker (no datetime-local AM/PM bug)
// =============================================================================
const ScheduledRideModal = ({ isOpen, onClose, pickup, destination, carType }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  // Build date options: today + next 6 days
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });
  const fmt = (d) => d.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" });
  const [selDate, setSelDate] = useState(0);           // index into dateOptions
  const [hour, setHour]       = useState(12);          // 1-12
  const [minute, setMinute]   = useState(0);           // 0 or 30
  const [ampm, setAmpm]       = useState("AM");

  const getScheduledISO = () => {
    const base = new Date(dateOptions[selDate]);
    let h = hour % 12;
    if (ampm === "PM") h += 12;
    base.setHours(h, minute, 0, 0);
    return base.toISOString();
  };

  const isValid = () => {
    const chosen = new Date(dateOptions[selDate]);
    let h = hour % 12; if (ampm === "PM") h += 12;
    chosen.setHours(h, minute, 0, 0);
    return chosen.getTime() > Date.now() + 30 * 60000;
  };

  const handleSchedule = async () => {
    if (!pickup?.lat || !destination?.lat) { toast.error("Set pickup and destination first"); return; }
    if (!isValid()) { toast.error("Please choose a time at least 30 minutes from now"); return; }
    setLoading(true);
    try {
      await api.post("/rides/schedule", {
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        destination_address: destination.address, destination_lat: destination.lat, destination_lng: destination.lng,
        scheduled_time: getScheduledISO(),
        car_type: carType, payment_method: "cash", stops: [],
      });
      toast.success("Ride scheduled!");
      onClose();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to schedule"); } finally { setLoading(false); }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-yellow-500/15 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-white text-lg font-bold">Schedule a Ride</h2>
            <p className="text-white/40 text-sm">Book your ride in advance</p>
          </div>
        </div>
        {pickup?.address && <p className="text-xs text-white/40 mb-1 truncate flex items-center gap-1"><MapPin className="w-3 h-3 text-[#00ff88]" />{pickup.address}</p>}
        {destination?.address && <p className="text-xs text-white/40 mb-4 truncate flex items-center gap-1"><Navigation className="w-3 h-3 text-[#00d4ff]" />{destination.address}</p>}

        {/* Date row */}
        <label className="text-white/40 text-xs font-medium mb-2 block">Date</label>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {dateOptions.map((d, i) => (
            <button key={i} onClick={() => setSelDate(i)}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${selDate === i ? "bg-yellow-500 text-black border-yellow-500" : "bg-white/5 text-white/60 border-white/10"}`}>
              {fmt(d)}
            </button>
          ))}
        </div>

        {/* Time row */}
        <label className="text-white/40 text-xs font-medium mb-2 block">Time</label>
        <div className="flex gap-2 mb-5">
          {/* Hour */}
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="text-white/30 text-[10px] text-center pt-1.5">Hour</div>
            <select value={hour} onChange={e => setHour(Number(e.target.value))}
              className="w-full bg-transparent text-white text-center text-lg font-bold pb-2 pt-0.5 outline-none appearance-none cursor-pointer">
              {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h} className="bg-[#0d0d1a]">{String(h).padStart(2,"0")}</option>)}
            </select>
          </div>

          {/* Minute */}
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="text-white/30 text-[10px] text-center pt-1.5">Min</div>
            <select value={minute} onChange={e => setMinute(Number(e.target.value))}
              className="w-full bg-transparent text-white text-center text-lg font-bold pb-2 pt-0.5 outline-none appearance-none cursor-pointer">
              {[0,15,30,45].map(m => <option key={m} value={m} className="bg-[#0d0d1a]">{String(m).padStart(2,"0")}</option>)}
            </select>
          </div>

          {/* AM / PM — two separate tap targets, no ambiguity */}
          <div className="flex flex-col gap-1.5">
            {["AM","PM"].map(p => (
              <button key={p} onClick={() => setAmpm(p)}
                className={`w-14 h-[calc(50%-3px)] rounded-xl text-sm font-bold border transition-all ${ampm === p ? "bg-yellow-500 text-black border-yellow-500" : "bg-white/5 text-white/50 border-white/10"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-white/10 text-white/40 rounded-xl h-12" onClick={onClose}>{t("cancel")}</Button>
          <Button className="flex-1 bg-yellow-500 text-black font-bold rounded-xl h-12" onClick={handleSchedule} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calendar className="w-4 h-4 mr-2" />}
            Schedule
          </Button>
        </div>
      </div>
    </div>
  );
};'''

if old in c:
    c = c.replace(old, new)
    open(path, "w", encoding="utf-8").write(c)
    print("Done. Custom time picker applied.")
else:
    print("MATCH FAILED - old block not found exactly.")
