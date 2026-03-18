path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# 1. Add savedCards state after paymentMethod state
old_state = '  const [paymentMethod, setPaymentMethod] = useState("cash");'
new_state = '  const [paymentMethod, setPaymentMethod] = useState("cash");\n  const [savedCards, setSavedCards] = useState([]);\n  const [selectedVaultId, setSelectedVaultId] = useState(null);'

if old_state in c:
    c = c.replace(old_state, new_state)
    print("OK: savedCards state added")
else:
    print("MISS: state")

# 2. Load saved cards on mount - find the useEffect that loads user data
old_load = '  useEffect(() => {\n    api.get("/driver/withdrawals/history")'
# that's driver - find rider equivalent
# Look for the profile tab useEffect or a good place
old_load2 = '  const { user, logout, refreshUser } = useAuth();'
new_load2 = '  const { user, logout, refreshUser } = useAuth();\n\n  useEffect(() => {\n    api.get("/rider/saved-cards").then(r => setSavedCards(r.data.saved_cards || [])).catch(() => {});\n  }, [user?.id]);'

if old_load2 in c:
    c = c.replace(old_load2, new_load2)
    print("OK: saved cards loader added")
else:
    print("MISS: loader")

# 3. Replace the payment method selector to include saved cards
old_payment = '''              <div className="flex gap-2">
                {[
                  { val: "cash",   label: t("cash"),   Icon: null },
                  { val: "wallet", label: `?${user?.wallet_balance?.toFixed(2) || "0.00"}`, subLabel: t("wallet"), Icon: Wallet },
                  { val: "card",   label: t("card"),   Icon: CreditCard },
                ].map(({ val, label, subLabel, Icon }) => (
                  <button key={val}
                    onClick={() => {
                      if (val === "wallet" && (user?.wallet_balance || 0) <= 0) { toast.error(t("wallet_empty")); setShowTopUp(true); return; }
                      setPaymentMethod(val); setShowPayPal(false);
                    }}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${paymentMethod === val ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]" : "border-white/8 bg-white/3 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                    {Icon && <Icon className="w-4 h-4 mb-0.5" />}
                    <span>{label}</span>
                    {subLabel && <span className="text-[10px] opacity-60">{subLabel}</span>}
                  </button>
                ))}
              </div>'''

new_payment = '''              <div className="flex gap-2">
                {[
                  { val: "cash",   label: t("cash"),   Icon: null },
                  { val: "wallet", label: `GEL ${user?.wallet_balance?.toFixed(2) || "0.00"}`, subLabel: t("wallet"), Icon: Wallet },
                  { val: "card",   label: t("card"),   Icon: CreditCard },
                ].map(({ val, label, subLabel, Icon }) => (
                  <button key={val}
                    onClick={() => {
                      if (val === "wallet" && (user?.wallet_balance || 0) <= 0) { toast.error(t("wallet_empty")); setShowTopUp(true); return; }
                      setPaymentMethod(val); setShowPayPal(false); setSelectedVaultId(null);
                    }}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${paymentMethod === val && !selectedVaultId ? "border-[#00ff88] bg-[#00ff88]/10 text-[#00ff88]" : "border-white/8 bg-white/3 text-white/40 hover:border-white/20 hover:text-white/60"}`}>
                    {Icon && <Icon className="w-4 h-4 mb-0.5" />}
                    <span>{label}</span>
                    {subLabel && <span className="text-[10px] opacity-60">{subLabel}</span>}
                  </button>
                ))}
              </div>
              {/* Saved cards */}
              {savedCards.length > 0 && (
                <div style={{marginTop:10}}>
                  <p style={{color:"rgba(255,255,255,0.35)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Saved Cards</p>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {savedCards.map(card => (
                      <button key={card.vault_id} onClick={() => { setSelectedVaultId(card.vault_id); setPaymentMethod("card"); setShowPayPal(false); }}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,border:`1px solid ${selectedVaultId===card.vault_id?"rgba(0,212,255,0.5)":"rgba(255,255,255,0.1)"}`,background:selectedVaultId===card.vault_id?"rgba(0,212,255,0.08)":"rgba(255,255,255,0.02)",cursor:"pointer",transition:"all 0.2s"}}>
                        <CreditCard style={{width:18,height:18,color:selectedVaultId===card.vault_id?"#00d4ff":"rgba(255,255,255,0.4)"}} />
                        <div style={{flex:1,textAlign:"left"}}>
                          <span style={{color:selectedVaultId===card.vault_id?"#00d4ff":"white",fontWeight:700,fontSize:13}}>
                            {card.brand || "Card"} •••• {card.last4 || "****"}
                          </span>
                        </div>
                        {selectedVaultId===card.vault_id && <span style={{color:"#00d4ff",fontSize:11,fontWeight:700}}>✓ Selected</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}'''

if old_payment in c:
    c = c.replace(old_payment, new_payment)
    print("OK: saved cards added to payment selector")
else:
    print("MISS: payment selector")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
