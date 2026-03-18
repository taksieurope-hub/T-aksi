path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

fin_component = """
// =============================================================================
// FINANCIALS PANEL
// =============================================================================
const FinancialsPanel = () => {
  const [period, setPeriod] = React.useState("month");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    api.get(`/admin/financials?period=${period}`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  const fmt = (v) => `GEL ${(v||0).toFixed(2)}`;
  const pct = (v, t) => t > 0 ? ((v/t)*100).toFixed(1)+"%" : "0%";

  const periods = [["week","This Week"],["month","This Month"],["quarter","This Quarter"],["year","This Year"],["all","All Time"]];

  if (loading) return <div style={{textAlign:"center",padding:40,color:"rgba(255,255,255,0.3)"}}>Loading financials...</div>;
  if (!data) return <div style={{textAlign:"center",padding:40,color:"red"}}>Failed to load</div>;

  const s = data.summary;
  const tax = data.tax;

  return (
    <div style={{padding:"0 0 40px"}}>
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
      </div>

      {/* Key metrics */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20}}>
        {[
          ["Total Rides", s.total_rides, "#ffffff", null],
          ["Gross Revenue", fmt(s.gross_revenue), "#00d4ff", null],
          ["Platform Commission", fmt(s.platform_commission), "#a855f7", pct(s.platform_commission, s.gross_revenue)],
          ["Driver Earnings", fmt(s.driver_earnings), "#00ff88", pct(s.driver_earnings, s.gross_revenue)],
          ["Card Service Fees", fmt(s.card_service_fees), "#ffd700", null],
          ["Net Platform Revenue", fmt(s.net_platform_revenue), "#ff8c00", null],
          ["Total Topups", fmt(s.total_topups), "#00d4ff", null],
          ["Total Withdrawals", fmt(s.total_withdrawals), "#ff4444", null],
        ].map(([label, value, color, sub]) => (
          <div key={label} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:14}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{label}</div>
            <div style={{color,fontSize:20,fontWeight:900,fontFamily:"monospace"}}>{value}</div>
            {sub && <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginTop:2}}>{sub} of gross</div>}
          </div>
        ))}
      </div>

      {/* Payment method breakdown */}
      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:12}}>Payment Method Breakdown</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[["Cash",s.cash_rides,"#00ff88"],["Card",s.card_rides,"#00d4ff"],["Wallet",s.wallet_rides,"#ffd700"]].map(([label,count,color])=>(
            <div key={label} style={{textAlign:"center",padding:10,background:"rgba(255,255,255,0.03)",borderRadius:10}}>
              <div style={{color,fontSize:24,fontWeight:900}}>{count}</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{label} rides</div>
              <div style={{color:"rgba(255,255,255,0.25)",fontSize:11}}>{pct(count, s.total_rides)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tax section */}
      <div style={{background:"rgba(255,60,60,0.04)",border:"1px solid rgba(255,60,60,0.2)",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{color:"#ff4444",fontSize:13,fontWeight:900,marginBottom:12}}>Georgian Tax Estimate</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginBottom:4}}>ANNUAL PROJECTION</div>
            <div style={{color:"white",fontSize:18,fontWeight:900,fontFamily:"monospace"}}>{fmt(tax.annual_projection)}</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginBottom:4}}>TAX BRACKET</div>
            <div style={{color:"#ff8c00",fontSize:12,fontWeight:700}}>{tax.bracket}</div>
          </div>
          <div style={{background:"rgba(255,60,60,0.08)",borderRadius:10,padding:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginBottom:4}}>ESTIMATED TAX DUE</div>
            <div style={{color:"#ff4444",fontSize:18,fontWeight:900,fontFamily:"monospace"}}>{fmt(tax.estimated_tax)}</div>
          </div>
          <div style={{background:"rgba(0,255,136,0.08)",borderRadius:10,padding:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginBottom:4}}>NET AFTER TAX</div>
            <div style={{color:"#00ff88",fontSize:18,fontWeight:900,fontFamily:"monospace"}}>{fmt(tax.net_after_tax)}</div>
          </div>
        </div>
        <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:8}}>
          Georgia flat income tax 20% (individual) · Corporate 15% + VAT 18% above 100k GEL · Consult your accountant for exact figures
        </div>
      </div>

      {/* Driver breakdown table */}
      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:12}}>Driver Earnings Breakdown</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
                {["Driver","Phone","Rides","Gross Fare","Commission (our cut)","Driver Earnings"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:"left",color:"rgba(255,255,255,0.35)",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.driver_breakdown?.map((d,i) => (
                <tr key={d.driver_id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                  <td style={{padding:"8px 10px",color:"white",fontWeight:600}}>{d.name || "Unknown"}</td>
                  <td style={{padding:"8px 10px",color:"rgba(255,255,255,0.4)",fontSize:12}}>{d.phone||"-"}</td>
                  <td style={{padding:"8px 10px",color:"#00d4ff",fontWeight:700}}>{d.rides}</td>
                  <td style={{padding:"8px 10px",color:"white",fontFamily:"monospace"}}>{fmt(d.gross)}</td>
                  <td style={{padding:"8px 10px",color:"#a855f7",fontFamily:"monospace",fontWeight:700}}>{fmt(d.commission)}</td>
                  <td style={{padding:"8px 10px",color:"#00ff88",fontFamily:"monospace"}}>{fmt(d.driver_earnings)}</td>
                </tr>
              ))}
              {data.driver_breakdown?.length === 0 && (
                <tr><td colSpan={6} style={{textAlign:"center",padding:20,color:"rgba(255,255,255,0.2)"}}>No data for this period</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{borderTop:"2px solid rgba(255,255,255,0.15)"}}>
                <td colSpan={2} style={{padding:"10px",color:"rgba(255,255,255,0.5)",fontWeight:700}}>TOTALS</td>
                <td style={{padding:"10px",color:"#00d4ff",fontWeight:900}}>{s.total_rides}</td>
                <td style={{padding:"10px",color:"white",fontFamily:"monospace",fontWeight:900}}>{fmt(s.gross_revenue)}</td>
                <td style={{padding:"10px",color:"#a855f7",fontFamily:"monospace",fontWeight:900}}>{fmt(s.platform_commission)}</td>
                <td style={{padding:"10px",color:"#00ff88",fontFamily:"monospace",fontWeight:900}}>{fmt(s.driver_earnings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Daily breakdown */}
      {data.daily_breakdown?.length > 0 && (
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:16}}>
          <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:12}}>Daily Transaction Log</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
                  {["Date","Rides","Gross Revenue","Commission","Driver Earnings"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",textAlign:"left",color:"rgba(255,255,255,0.35)",fontWeight:700,fontSize:11}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.daily_breakdown].reverse().map((d,i) => (
                  <tr key={d.date} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                    <td style={{padding:"8px 10px",color:"rgba(255,255,255,0.7)",fontFamily:"monospace"}}>{d.date}</td>
                    <td style={{padding:"8px 10px",color:"#00d4ff",fontWeight:700}}>{d.rides}</td>
                    <td style={{padding:"8px 10px",color:"white",fontFamily:"monospace"}}>{fmt(d.gross)}</td>
                    <td style={{padding:"8px 10px",color:"#a855f7",fontFamily:"monospace"}}>{fmt(d.commission)}</td>
                    <td style={{padding:"8px 10px",color:"#00ff88",fontFamily:"monospace"}}>{fmt(d.driver_earnings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const generateCSV = (data) => {
  const s = data.summary;
  const tax = data.tax;
  let csv = "T'aksi Financial Report\\n";
  csv += `Period,${data.period}\\n`;
  csv += `Generated,${new Date().toISOString()}\\n\\n`;
  csv += "SUMMARY\\n";
  csv += `Total Rides,${s.total_rides}\\n`;
  csv += `Gross Revenue,${s.gross_revenue}\\n`;
  csv += `Platform Commission,${s.platform_commission}\\n`;
  csv += `Driver Earnings,${s.driver_earnings}\\n`;
  csv += `Card Service Fees,${s.card_service_fees}\\n`;
  csv += `Net Platform Revenue,${s.net_platform_revenue}\\n`;
  csv += `Total Driver Topups,${s.total_topups}\\n`;
  csv += `Total Withdrawals,${s.total_withdrawals}\\n\\n`;
  csv += "TAX ESTIMATE\\n";
  csv += `Annual Projection,${tax.annual_projection}\\n`;
  csv += `Tax Bracket,${tax.bracket}\\n`;
  csv += `Estimated Tax,${tax.estimated_tax}\\n`;
  csv += `Net After Tax,${tax.net_after_tax}\\n\\n`;
  csv += "DRIVER BREAKDOWN\\n";
  csv += "Driver,Phone,Rides,Gross Fare,Commission,Driver Earnings\\n";
  data.driver_breakdown?.forEach(d => {
    csv += `${d.name||"Unknown"},${d.phone||""},${d.rides},${d.gross.toFixed(2)},${d.commission.toFixed(2)},${d.driver_earnings.toFixed(2)}\\n`;
  });
  csv += "\\nDAILY LOG\\n";
  csv += "Date,Rides,Gross,Commission,Driver Earnings\\n";
  data.daily_breakdown?.forEach(d => {
    csv += `${d.date},${d.rides},${d.gross.toFixed(2)},${d.commission.toFixed(2)},${d.driver_earnings.toFixed(2)}\\n`;
  });
  return csv;
};

const downloadCSV = (csv, filename) => {
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};
"""

# Insert before the AdminPortal component
insert_at = "// =============================================================================\n// ROUTER"
if insert_at in c:
    c = c.replace(insert_at, fin_component + "\n" + insert_at)
    print("OK: FinancialsPanel component added")
else:
    print("MISS - trying alternative...")
    insert_at2 = "// Competition Payout Panel"
    if insert_at2 in c:
        c = c.replace(insert_at2, fin_component + "\n" + insert_at2)
        print("OK: inserted before Competition Payout Panel")
    else:
        print("MISS both")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
