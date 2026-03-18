path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# 1. Add period label header and Clear Test Data button to FinancialsPanel
old_header = '''      {/* Period selector */}
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {periods.map(([v,l]) => (
          <button key={v} onClick={() => setPeriod(v)} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${period===v?"#a855f7":"rgba(255,255,255,0.1)"}`,background:period===v?"rgba(168,85,247,0.2)":"transparent",color:period===v?"#a855f7":"rgba(255,255,255,0.5)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            {l}
          </button>
        ))}
        <button onClick={() => { const csv = generateCSV(data); downloadCSV(csv, `taksi-financials-${period}.csv`); }} style={{marginLeft:"auto",padding:"8px 16px",borderRadius:10,border:"1px solid rgba(0,212,255,0.3)",background:"rgba(0,212,255,0.1)",color:"#00d4ff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          Export CSV
        </button>
      </div>'''

new_header = '''      {/* Period label */}
      <div style={{marginBottom:16}}>
        <div style={{color:"white",fontSize:22,fontWeight:900}}>{data.period_label}</div>
        <div style={{color:"rgba(255,255,255,0.35)",fontSize:12,marginTop:2}}>
          {data.date_from} — {data.date_to}
        </div>
      </div>

      {/* Period selector */}
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {periods.map(([v,l]) => (
          <button key={v} onClick={() => setPeriod(v)} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${period===v?"#a855f7":"rgba(255,255,255,0.1)"}`,background:period===v?"rgba(168,85,247,0.2)":"transparent",color:period===v?"#a855f7":"rgba(255,255,255,0.5)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            {l}
          </button>
        ))}
        <button onClick={() => { const csv = generateCSV(data); downloadCSV(csv, `taksi-financials-${period}.csv`); }} style={{marginLeft:"auto",padding:"8px 16px",borderRadius:10,border:"1px solid rgba(0,212,255,0.3)",background:"rgba(0,212,255,0.1)",color:"#00d4ff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          Export CSV
        </button>
        <button onClick={async () => {
          const pwd = window.prompt("Enter admin password to clear ALL test ride data:");
          if (!pwd) return;
          if (!window.confirm("This will permanently delete ALL rides from the database. Are you sure?")) return;
          try {
            const r = await api.post("/admin/clear-test-data", { password: pwd });
            toast.success(r.data.message);
            setPeriod(p => p);
          } catch(e) {
            toast.error(e.response?.data?.detail || "Failed to clear data");
          }
        }} style={{padding:"8px 16px",borderRadius:10,border:"1px solid rgba(255,60,60,0.3)",background:"rgba(255,60,60,0.08)",color:"#ff4444",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          🗑️ Clear Test Data
        </button>
      </div>'''

if old_header in c:
    c = c.replace(old_header, new_header)
    print("OK: period label and clear button added")
else:
    print("MISS: header block")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
