path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '''                    {pendingWithdrawals.map(wd => (
                      <div key={wd.id} className="bg-black/40 border border-white/8 rounded-xl p-4 flex justify-between items-center gap-4">
                        <div className="space-y-1 flex-1">
                          <p className="text-white font-semibold">{wd.driver_name || "Driver"}</p>
                          <p className="text-gray-500 text-sm">Bank: {wd.bank_details}</p>
                          {wd.fee > 0 && <p className="text-gray-600 text-xs">Fee: {fmt(wd.fee)} ? Total deducted: {fmt(wd.total_deducted)}</p>}
                          <p className="text-gray-700 text-xs">{timeAgo(wd.created_at || wd.requested_at)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-2xl font-bold text-pink-400">{fmt(wd.amount)}</p>
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => quickAction(`/admin/withdrawals/${wd.id}/approve`, `Withdrawal of ${fmt(wd.amount)} approved`)}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive"
                              onClick={() => quickAction(`/admin/withdrawals/${wd.id}/reject`, "Withdrawal rejected & refunded")}>
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}'''

new = '''                    {pendingWithdrawals.map(wd => {
                      const [payRef, setPayRef] = React.useState("");
                      const bankParts = (wd.bank_details || "").split("]");
                      const bankType = bankParts[0]?.replace("[","").trim() || "BANK";
                      const bankAccount = bankParts[1]?.trim() || wd.bank_details;
                      return (
                        <div key={wd.id} style={{background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,105,180,0.2)",borderRadius:14,padding:16,marginBottom:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                            <div style={{flex:1}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                                <span style={{color:"white",fontWeight:700,fontSize:15}}>{wd.driver_name || "Driver"}</span>
                                <span style={{background:"rgba(255,105,180,0.15)",border:"1px solid rgba(255,105,180,0.3)",borderRadius:6,padding:"2px 8px",color:"#ff69b4",fontSize:11,fontWeight:700}}>PENDING</span>
                              </div>
                              {/* Bank details box - prominent for manual transfer */}
                              <div style={{background:"rgba(255,215,0,0.05)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:10,padding:12,marginBottom:8}}>
                                <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,fontWeight:700,marginBottom:4}}>TRANSFER TO</div>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <span style={{background:"rgba(255,215,0,0.2)",borderRadius:6,padding:"2px 8px",color:"#ffd700",fontSize:12,fontWeight:700}}>{bankType}</span>
                                  <span style={{color:"white",fontFamily:"monospace",fontSize:14,fontWeight:700,letterSpacing:1}}>{bankAccount}</span>
                                  <button onClick={() => { navigator.clipboard.writeText(bankAccount); toast.success("Copied!"); }} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:6,padding:"2px 8px",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:11}}>Copy</button>
                                </div>
                              </div>
                              <div style={{color:"rgba(255,255,255,0.35)",fontSize:12}}>{timeAgo(wd.created_at || wd.requested_at)}</div>
                              {wd.fee > 0 && <div style={{color:"rgba(255,255,255,0.3)",fontSize:11}}>Fee: {fmt(wd.fee)} · Total deducted: {fmt(wd.total_deducted)}</div>}
                            </div>
                            <div style={{textAlign:"right",flexShrink:0}}>
                              <div style={{color:"#ff69b4",fontSize:26,fontWeight:900,fontFamily:"monospace"}}>{fmt(wd.amount)}</div>
                            </div>
                          </div>
                          {/* Payment reference + actions */}
                          <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center",flexWrap:"wrap"}}>
                            <input
                              value={payRef} onChange={e => setPayRef(e.target.value)}
                              placeholder="Payment reference (optional)"
                              style={{flex:1,minWidth:160,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"6px 10px",color:"white",fontSize:12,outline:"none"}}
                            />
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => quickAction(`/admin/withdrawals/${wd.id}/approve`, `Withdrawal of ${fmt(wd.amount)} approved — Ref: ${payRef||"N/A"}`)}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark as Paid
                            </Button>
                            <Button size="sm" variant="destructive"
                              onClick={() => quickAction(`/admin/withdrawals/${wd.id}/reject`, "Withdrawal rejected & refunded")}>
                              <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                            </Button>
                          </div>
                        </div>
                      );
                    })}'''

if old in c:
    c = c.replace(old, new)
    print("OK: withdrawal panel enhanced with bank details and payment reference")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
