path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

leaderboard_component = """
// Competition Leaderboard Component
const CompetitionLeaderboard = ({ driverId }) => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api.get("/competition/leaderboard").then(r => {
      setData(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{textAlign:"center",padding:"20px",color:"rgba(255,255,255,0.3)"}}>Loading...</div>;
  if (!data) return null;

  const prizes = [150, 120, 90, 60, 30];
  const medals = ["🥇","🥈","🥉","4️⃣","5️⃣"];
  const myEntry = data.leaderboard?.find(e => e.driver_id === driverId);
  const myRank = myEntry ? data.leaderboard.indexOf(myEntry) + 1 : null;

  if (!data.active) return (
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"20px",textAlign:"center"}}>
      <div style={{fontSize:32,marginBottom:8}}>🏁</div>
      <div style={{color:"rgba(255,255,255,0.6)",fontWeight:600}}>Competition Break Week</div>
      <div style={{color:"rgba(255,255,255,0.3)",fontSize:13,marginTop:4}}>Next competition starts next Monday</div>
    </div>
  );

  return (
    <div style={{background:"rgba(255,215,0,0.04)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:16,overflow:"hidden"}}>
      <div style={{background:"linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,140,0,0.1))",padding:"16px",borderBottom:"1px solid rgba(255,215,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:28}}>🏆</span>
          <div>
            <div style={{color:"#ffd700",fontWeight:900,fontSize:16}}>Weekly Competition</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>Most trips this week wins</div>
          </div>
          <div style={{marginLeft:"auto",textAlign:"right"}}>
            <div style={{color:"#ffd700",fontWeight:900,fontSize:13}}>1st: 150 GEL</div>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>2nd: 120 · 3rd: 90</div>
          </div>
        </div>
      </div>
      {myEntry && (
        <div style={{padding:"10px 16px",background:"rgba(0,255,136,0.08)",borderBottom:"1px solid rgba(0,255,136,0.15)",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>{myRank <= 5 ? medals[myRank-1] : `#${myRank}`}</span>
          <span style={{color:"#00ff88",fontWeight:700,fontSize:14}}>You — {myEntry.trips} trips</span>
          {myRank <= 5 && <span style={{marginLeft:"auto",color:"#ffd700",fontWeight:700}}>+{prizes[myRank-1]} GEL</span>}
        </div>
      )}
      <div style={{padding:"8px 0"}}>
        {data.leaderboard?.length === 0 && (
          <div style={{textAlign:"center",padding:"20px",color:"rgba(255,255,255,0.3)",fontSize:13}}>No trips yet this week. Be the first!</div>
        )}
        {data.leaderboard?.slice(0,10).map((entry, i) => (
          <div key={entry.driver_id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",background: entry.driver_id === driverId ? "rgba(0,255,136,0.06)" : "transparent",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <span style={{fontSize:20,width:28,textAlign:"center"}}>{i < 5 ? medals[i] : `${i+1}`}</span>
            <div style={{flex:1}}>
              <div style={{color: entry.driver_id === driverId ? "#00ff88" : "white",fontWeight:600,fontSize:14}}>{entry.name || "Driver"}</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{entry.trips} trips</div>
            </div>
            {i < 5 && <div style={{color:"#ffd700",fontWeight:700,fontSize:14}}>{prizes[i]} GEL</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
"""

# Insert before the main export/component
insert_at = "const DriverPortal = ("
if insert_at in c:
    c = c.replace(insert_at, leaderboard_component + "\n" + insert_at)
    print("OK: CompetitionLeaderboard component added")
else:
    print("MISS: could not find insert point")
    # Try alternative
    insert_at2 = "export default function DriverPortal"
    if insert_at2 in c:
        c = c.replace(insert_at2, leaderboard_component + "\nexport default function DriverPortal")
        print("OK: inserted before export default")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
