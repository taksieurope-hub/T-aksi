path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Find a good place to add competition payout section - after drivers section or in overview
payout_ui = """
// Competition Payout Panel
const CompetitionPayoutPanel = () => {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [history, setHistory] = React.useState([]);
  const [status, setStatus] = React.useState(null);

  React.useEffect(() => {
    api.get("/competition/status").then(r => setStatus(r.data)).catch(() => {});
    api.get("/admin/competition/payout-history").then(r => setHistory(r.data.payouts || [])).catch(() => {});
  }, []);

  const runPayout = async () => {
    if (!window.confirm("Pay out prizes to top 5 drivers for the last competition week?")) return;
    setLoading(true);
    try {
      const r = await api.post("/admin/competition/payout");
      setResult(r.data);
      toast.success("Payout complete!");
      const h = await api.get("/admin/competition/payout-history");
      setHistory(h.data.payouts || []);
    } catch(e) {
      toast.error(e.response?.data?.detail || "Payout failed");
    }
    setLoading(false);
  };

  return (
    <div style={{background:"rgba(255,215,0,0.04)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:16,padding:20,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <span style={{fontSize:24}}>🏆</span>
        <div>
          <div style={{color:"#ffd700",fontWeight:900,fontSize:16}}>Competition Payouts</div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>
            {status ? (status.active ? "Competition week is ACTIVE" : "Break week — ready to pay out last competition") : "Loading..."}
          </div>
        </div>
        <button onClick={runPayout} disabled={loading} style={{marginLeft:"auto",background:"linear-gradient(135deg,#ffd700,#ff8c00)",color:"#000",fontWeight:900,border:"none",borderRadius:10,padding:"10px 20px",cursor:"pointer",opacity:loading?0.6:1}}>
          {loading ? "Processing..." : "Run Payout"}
        </button>
      </div>
      {result && (
        <div style={{background:"rgba(0,255,136,0.08)",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{color:"#00ff88",fontWeight:700,marginBottom:8}}>Last Payout Results:</div>
          {result.results?.map(r => (
            <div key={r.rank} style={{display:"flex",justifyContent:"space-between",color:"white",fontSize:13,padding:"4px 0"}}>
              <span>#{r.rank} {r.name} — {r.trips} trips</span>
              <span style={{color:"#ffd700",fontWeight:700}}>+{r.prize} GEL</span>
            </div>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginBottom:6}}>PAYOUT HISTORY</div>
          {history.slice(0,5).map(h => (
            <div key={h.week_key} style={{color:"rgba(255,255,255,0.5)",fontSize:12,padding:"3px 0"}}>
              Week of {h.week_key} — {h.results?.length || 0} drivers paid
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
"""

insert_at = "const AdminPortal = ("
if insert_at in c:
    c = c.replace(insert_at, payout_ui + "\n" + insert_at)
    print("OK: CompetitionPayoutPanel added")
else:
    insert_at2 = "export default function AdminPortal"
    if insert_at2 in c:
        c = c.replace(insert_at2, payout_ui + "\nexport default function AdminPortal")
        print("OK: inserted before export default")
    else:
        print("MISS: could not find insert point")

# Now add it to the drivers tab or overview in the admin portal
# Find where drivers section starts
old_section = 'activeTab === "drivers" && ('
new_section = 'activeTab === "drivers" && (<><CompetitionPayoutPanel />'
if old_section in c:
    # Also need to close the fragment - find the closing of the drivers tab
    c = c.replace(old_section, new_section)
    print("OK: panel added to drivers tab")
else:
    print("MISS: drivers tab - check manually")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
