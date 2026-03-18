path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add photo gallery after the vehicles section in the driver detail panel
old = '''              {userType === "driver" && data.driver_info?.vehicles?.length > 0 && (
                <div className="rounded-xl bg-white/5 p-4">
                  <p className="text-xs uppercase text-gray-500 tracking-widest mb-3">Vehicles</p>
                  {data.driver_info.vehicles.map((v, i) => (
                    <div key={i} className="border border-white/10 rounded-lg p-3 mb-2">
                      <p className="text-white font-semibold">{v.car_year} {v.car_make} {v.car_model}</p>
                      <p className="text-gray-400 text-sm">{v.car_color} ? {v.license_plate}</p>
                      <div className="flex gap-2 mt-1">
                        <StatusBadge status={v.status || "pending"} />
                        <span className="px-2 py-0.5 text-[11px] rounded border bg-purple-500/20 text-purple-400 border-purple-500/30 uppercase">{v.tier}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}'''

new = '''              {userType === "driver" && data.driver_info?.vehicles?.length > 0 && (
                <div className="rounded-xl bg-white/5 p-4">
                  <p className="text-xs uppercase text-gray-500 tracking-widest mb-3">Vehicles & Documents</p>
                  {data.driver_info.vehicles.map((v, i) => (
                    <div key={i} className="border border-white/10 rounded-lg p-3 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-white font-semibold">{v.car_year} {v.car_make} {v.car_model}</p>
                          <p className="text-gray-400 text-sm">{v.car_color} · {v.license_plate}</p>
                        </div>
                        <div className="flex gap-2">
                          <StatusBadge status={v.status || "pending"} />
                          <span className="px-2 py-0.5 text-[11px] rounded border bg-purple-500/20 text-purple-400 border-purple-500/30 uppercase">{v.tier}</span>
                        </div>
                      </div>
                      {v.documents && Object.keys(v.documents).some(k => v.documents[k]) && (
                        <div>
                          <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 mt-3">Car Photos</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {[["car_photo_front","Front"],["car_photo_back","Back"],["car_photo_left","Left"],["car_photo_right","Right"]].map(([key, label]) => (
                              v.documents[key] ? (
                                <a key={key} href={v.documents[key]} target="_blank" rel="noreferrer" className="block">
                                  <img src={v.documents[key]} alt={label} style={{width:"100%",height:90,objectFit:"cover",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)"}} />
                                  <p className="text-gray-500 text-[10px] text-center mt-1">{label}</p>
                                </a>
                              ) : (
                                <div key={key} style={{width:"100%",height:90,borderRadius:8,border:"1px dashed rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  <p className="text-gray-600 text-[10px]">{label} missing</p>
                                </div>
                              )
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">License & Registration</p>
                          <div className="grid grid-cols-2 gap-2">
                            {[["license_front","License Front"],["license_back","License Back"],["reg_front","Tech Cert Front"],["reg_back","Tech Cert Back"]].map(([key, label]) => (
                              v.documents[key] ? (
                                <a key={key} href={v.documents[key]} target="_blank" rel="noreferrer" className="block">
                                  <img src={v.documents[key]} alt={label} style={{width:"100%",height:90,objectFit:"cover",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)"}} />
                                  <p className="text-gray-500 text-[10px] text-center mt-1">{label}</p>
                                </a>
                              ) : (
                                <div key={key} style={{width:"100%",height:90,borderRadius:8,border:"1px dashed rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  <p className="text-gray-600 text-[10px]">{label} missing</p>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}'''

if old in c:
    c = c.replace(old, new)
    print("OK: photo gallery added to driver detail panel")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
