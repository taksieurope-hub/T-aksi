path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '''  return (
    <div style={{background:"rgba(255,215,0,0.04)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:16,padding:20,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <span style={{fontSize:24}}>ðŸ†</span>
        <div>
          <div style={{color:"#ffd700",fontWeight:900,fontSize:16}}>Competition Payouts</div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>
            {status ? (status.active ? "Competition week is ACTIVE" : "Break week \xe2\x80\x94 ready to pay out last competition") : "Loading..."}
          </div>
        </div>
        <button onClick={runPayout} disabled={loading} style={{marginLeft:"auto",background:"linear-gradient(135deg,#ffd700,#ff8c00)",color:"#000",fontWeight:900,border:"none",borderRadius:10,padding:"10px 20px",cursor:"pointer",opacity:loading?0.6:1}}>
          {loading ? "Processing..." : "Run Payout"}
        </button>
      </div>'''

new = '''  // Compute schedule info
  const scheduleInfo = React.useMemo(() => {
    if (!status) return null;
    const weekStart = new Date(status.week_start);
    const weekEnd = new Date(status.week_end);
    const now = new Date();
    const msLeft = weekEnd - now;
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
    const nextCompStart = status.active ? weekEnd : weekStart;
    const nextPayoutDate = status.active ? weekEnd : now;
    const fmt = (d) => d.toLocaleDateString("en-GB", { weekday:"short", day:"numeric", month:"short" });
    return { weekStart, weekEnd, daysLeft, hoursLeft, nextCompStart, nextPayoutDate, fmt };
  }, [status]);

  return (
    <div style={{background:"rgba(255,215,0,0.04)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:16,padding:20,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <span style={{fontSize:24}}>&#x1F3C6;</span>
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
      {/* Schedule timeline */}
      {scheduleInfo && (
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:14,marginBottom:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {status?.active ? (<>
            <div style={{background:"rgba(0,255,136,0.08)",border:"1px solid rgba(0,255,136,0.2)",borderRadius:10,padding:10}}>
              <div style={{color:"#00ff88",fontSize:10,fontWeight:700,marginBottom:4}}>&#x1F7E2; COMPETITION ACTIVE</div>
              <div style={{color:"white",fontSize:13,fontWeight:700}}>Ends {scheduleInfo.fmt(scheduleInfo.weekEnd)}</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>{scheduleInfo.daysLeft > 1 ? `${scheduleInfo.daysLeft} days left` : `${scheduleInfo.hoursLeft} hours left`}</div>
            </div>
            <div style={{background:"rgba(255,140,0,0.08)",border:"1px solid rgba(255,140,0,0.2)",borderRadius:10,padding:10}}>
              <div style={{color:"#ff8c00",fontSize:10,fontWeight:700,marginBottom:4}}>&#x23F0; PAYOUT DUE</div>
              <div style={{color:"white",fontSize:13,fontWeight:700}}>{scheduleInfo.fmt(scheduleInfo.weekEnd)}</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>Run payout after competition ends</div>
            </div>
          </>) : (<>
            <div style={{background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:10,padding:10}}>
              <div style={{color:"#ffd700",fontSize:10,fontWeight:700,marginBottom:4}}>&#x23F8;&#xFE0F; BREAK WEEK</div>
              <div style={{color:"white",fontSize:13,fontWeight:700}}>Next comp: {scheduleInfo.fmt(scheduleInfo.weekEnd)}</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>Starts Monday 00:00</div>
            </div>
            <div style={{background:"rgba(255,60,60,0.08)",border:"1px solid rgba(255,60,60,0.2)",borderRadius:10,padding:10}}>
              <div style={{color:"#ff4444",fontSize:10,fontWeight:700,marginBottom:4}}>&#x1F4B8; PAY OUT NOW</div>
              <div style={{color:"white",fontSize:13,fontWeight:700}}>Last competition ended</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>Click Run Payout to pay winners</div>
            </div>
          </>)}
        </div>
      )}'''

if old in c:
    c = c.replace(old, new)
    print("OK: schedule timeline added")
else:
    print("MISS - trying without encoding...")
    # Try with literal broken chars
    idx = c.find("Competition Payouts")
    if idx > -1:
        print(f"Found Competition Payouts at char {idx}, line ~{c[:idx].count(chr(10))}")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
