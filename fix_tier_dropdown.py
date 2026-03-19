path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = ('                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-white"\n'
       '                                    onClick={() => { setDetailUserId(driver.id); setDetailUserType("driver"); }}>\n'
       '                                    <Eye className="w-3.5 h-3.5 mr-1" /> View\n'
       '                                  </Button>')

new = ('                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-white"\n'
       '                                    onClick={() => { setDetailUserId(driver.id); setDetailUserType("driver"); }}>\n'
       '                                    <Eye className="w-3.5 h-3.5 mr-1" /> View\n'
       '                                  </Button>\n'
       '                                  <select onChange={e => e.target.value && setDriverTier(driver.id, e.target.value)} defaultValue=""\n'
       '                                    className="h-7 text-xs bg-white/5 border border-white/10 rounded-lg px-1.5 text-white/60 cursor-pointer">\n'
       '                                    <option value="" disabled>Tier...</option>\n'
       '                                    {["economy","comfort","suv","jumpstart","personal"].map(t => (\n'
       '                                      <option key={t} value={t} style={{background:"#111"}}>\n'
       '                                        {t.charAt(0).toUpperCase()+t.slice(1)}\n'
       '                                      </option>\n'
       '                                    ))}\n'
       '                                  </select>')

if old in c:
    c = c.replace(old, new)
    print("OK: tier dropdown added to driver list")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
