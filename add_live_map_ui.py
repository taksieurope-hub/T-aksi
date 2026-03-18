path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# 1. Add livemap tab to tab list
old_tabs = '                { value: "financials",  icon: BarChart3,      label: "Financials" },'
new_tabs = '                { value: "financials",  icon: BarChart3,      label: "Financials" },\n                { value: "livemap",     icon: MapPin,         label: "Live Map" },'

if old_tabs in c:
    c = c.replace(old_tabs, new_tabs)
    print("OK: livemap tab added")
else:
    print("MISS: tabs")

# 2. Add LiveMapPanel component before ROUTER section
live_map_component = """
// =============================================================================
// LIVE MAP PANEL
// =============================================================================
const LiveMapPanel = () => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(null);
  const mapRef = React.useRef(null);
  const mapInstanceRef = React.useRef(null);
  const markersRef = React.useRef([]);
  const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  const fetchData = () => {
    api.get("/admin/live-map").then(r => {
      setData(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  React.useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (!data || !mapRef.current) return;
    const initMap = () => {
      if (!window.google) return;
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: 41.7151, lng: 44.8271 }, // Tbilisi
          zoom: 12,
          styles: [
            { elementType: "geometry", stylers: [{ color: "#0a0a18" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
            { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
          ],
        });
      }
      // Clear old markers
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      const map = mapInstanceRef.current;
      // Add driver markers
      data.drivers?.forEach(driver => {
        const isActive = !!driver.active_ride;
        const marker = new window.google.maps.Marker({
          position: { lat: driver.lat, lng: driver.lng },
          map,
          title: driver.name,
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: isActive ? "#00ff88" : "#00d4ff",
            fillOpacity: 1,
            strokeColor: "#000",
            strokeWeight: 1,
            rotation: driver.heading || 0,
          },
        });
        marker.addListener("click", () => setSelected(driver));
        markersRef.current.push(marker);
      });
      // Add searching ride markers
      data.searching_rides?.forEach(ride => {
        if (!ride.pickup_lat || !ride.pickup_lng) return;
        const marker = new window.google.maps.Marker({
          position: { lat: ride.pickup_lat, lng: ride.pickup_lng },
          map,
          title: `Searching: ${ride.rider_name}`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#ffd700",
            fillOpacity: 0.9,
            strokeColor: "#000",
            strokeWeight: 1,
          },
        });
        marker.addListener("click", () => setSelected({ ...ride, _type: "searching" }));
        markersRef.current.push(marker);
      });
    };
    if (window.google) {
      initMap();
    } else {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
      script.onload = initMap;
      document.head.appendChild(script);
    }
  }, [data]);

  const statusColor = { searching: "#ffd700", accepted: "#00d4ff", arrived: "#a855f7", in_progress: "#00ff88" };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Stats bar */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {[
          ["🟢 Online Drivers", data?.total_online ?? "—", "#00d4ff"],
          ["🚗 Active Rides", data?.total_active_rides ?? "—", "#00ff88"],
          ["🔍 Searching", data?.searching_rides?.length ?? "—", "#ffd700"],
        ].map(([label, val, color]) => (
          <div key={label} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"12px 14px",textAlign:"center"}}>
            <div style={{color,fontSize:22,fontWeight:900}}>{val}</div>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginTop:2}}>{label}</div>
          </div>
        ))}
      </div>

      {/* Map */}
      <div style={{position:"relative",borderRadius:16,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)"}}>
        <div ref={mapRef} style={{width:"100%",height:400}} />
        {loading && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(7,7,15,0.8)",color:"rgba(255,255,255,0.4)"}}>Loading map...</div>}
        <button onClick={fetchData} style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,0.7)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"6px 12px",color:"white",fontSize:12,cursor:"pointer"}}>
          🔄 Refresh
        </button>
        <div style={{position:"absolute",bottom:10,left:10,display:"flex",gap:8,flexWrap:"wrap"}}>
          {[["🟦 Online (no ride)","#00d4ff"],["🟢 On a ride","#00ff88"],["🟡 Searching","#ffd700"]].map(([label,color])=>(
            <div key={label} style={{background:"rgba(0,0,0,0.7)",borderRadius:6,padding:"4px 8px",color:"rgba(255,255,255,0.7)",fontSize:11}}>{label}</div>
          ))}
        </div>
      </div>

      {/* Selected driver/ride info */}
      {selected && (
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:16,position:"relative"}}>
          <button onClick={() => setSelected(null)} style={{position:"absolute",top:10,right:10,background:"none",border:"none",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontSize:16}}>✕</button>
          {selected._type === "searching" ? (
            <div>
              <div style={{color:"#ffd700",fontWeight:700,marginBottom:8}}>🔍 Searching for Driver</div>
              <div style={{color:"white",fontSize:13}}>{selected.rider_name}</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{selected.pickup_address}</div>
              <div style={{color:"#ffd700",fontSize:13,fontWeight:700,marginTop:4}}>GEL {(selected.fare||0).toFixed(2)}</div>
            </div>
          ) : (
            <div>
              <div style={{color:"#00d4ff",fontWeight:700,marginBottom:8}}>🚗 {selected.name}</div>
              <div style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>📞 {selected.phone}</div>
              <div style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>⭐ {selected.rating?.toFixed(1)}</div>
              {selected.active_ride && (
                <div style={{marginTop:8,background:"rgba(0,255,136,0.08)",borderRadius:8,padding:10}}>
                  <div style={{color:statusColor[selected.active_ride.status]||"white",fontWeight:700,fontSize:12,textTransform:"uppercase",marginBottom:4}}>{selected.active_ride.status}</div>
                  <div style={{color:"white",fontSize:13}}>{selected.active_ride.rider_name}</div>
                  <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>{selected.active_ride.pickup_address}</div>
                  <div style={{color:"#00ff88",fontSize:13,fontWeight:700,marginTop:4}}>GEL {(selected.active_ride.fare||0).toFixed(2)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Driver list */}
      {data?.drivers?.length > 0 && (
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.4)",fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Online Drivers</div>
          {data.drivers.map(d => (
            <div key={d.driver_id} onClick={() => setSelected(d)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",background:selected?.driver_id===d.driver_id?"rgba(0,212,255,0.05)":"transparent"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:d.active_ride?"#00ff88":"#00d4ff",flexShrink:0}} />
              <div style={{flex:1}}>
                <div style={{color:"white",fontSize:13,fontWeight:600}}>{d.name}</div>
                <div style={{color:"rgba(255,255,255,0.35)",fontSize:11}}>{d.active_ride ? `On ride — ${d.active_ride.status}` : "Available"}</div>
              </div>
              <div style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>⭐ {d.rating?.toFixed(1)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
"""

insert_at = "// =============================================================================\n// ROUTER"
if insert_at in c:
    c = c.replace(insert_at, live_map_component + "\n" + insert_at)
    print("OK: LiveMapPanel component added")
else:
    insert_at2 = "// Competition Payout Panel"
    if insert_at2 in c:
        c = c.replace(insert_at2, live_map_component + "\n" + insert_at2)
        print("OK: inserted before Competition Payout Panel")
    else:
        print("MISS")

# 3. Add livemap tab content
old_fin_tab = '          <TabsContent value="financials">\n            <FinancialsPanel />\n          </TabsContent>'
new_fin_tab = '          <TabsContent value="financials">\n            <FinancialsPanel />\n          </TabsContent>\n          <TabsContent value="livemap">\n            <LiveMapPanel />\n          </TabsContent>'

if old_fin_tab in c:
    c = c.replace(old_fin_tab, new_fin_tab)
    print("OK: livemap tab content added")
else:
    print("MISS: tab content")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
