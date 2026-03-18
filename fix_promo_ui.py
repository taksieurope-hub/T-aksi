path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add showPromo state after promoApplied state
old_state = 'const [promoApplied, setPromoApplied] = useState(false);'
new_state = 'const [promoApplied, setPromoApplied] = useState(false);\nconst [showPromo, setShowPromo] = useState(false);'
if old_state in c:
    c = c.replace(old_state, new_state)
    print("OK: showPromo state added")
else:
    print("MISS state")

old_ui = '''<div className="mt-6 mb-3 space-y-3">
  <div className={`relative flex items-center bg-white/5 border rounded-2xl transition-all duration-500 ${promoApplied ? 'border-[#00ff88]/50 bg-[#00ff88]/5 shadow-[0_0_20px_rgba(0,255,136,0.05)]' : 'border-white/10 focus-within:border-white/20'}`}>
    <div className="pl-4">
      <Gift className={`w-4 h-4 transition-colors ${promoApplied ? 'text-[#00ff88]' : 'text-white/20'}`} />
    </div>
    <input
      type="text"
      placeholder={t("have_promo_code")}
      value={promoCode}
      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
      className="flex-1 bg-transparent px-3 py-4 text-sm font-bold text-white outline-none placeholder:text-white/20 placeholder:font-normal uppercase tracking-wider"
    />
    {promoApplied && (
      <div className="pr-4 flex items-center gap-2 animate-in fade-in zoom-in duration-300">
        <span className="text-[10px] font-black text-[#00ff88] bg-[#00ff88]/10 px-2 py-1 rounded-lg border border-[#00ff88]/20">
          -15%
        </span>
        <CheckCircle2 className="w-5 h-5 text-[#00ff88]" />
      </div>
    )}
  </div>
  {/* Visual confirmation of savings */}
  {promoApplied && fareEstimate?.discount > 0 && (
    <div className="flex items-center justify-between px-2 animate-in slide-in-from-top-1">
       <p className="text-[#00ff88] text-[11px] font-bold flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" />
        {t("promo_discount")}: GEL {fareEstimate.discount.toFixed(2)}!
      </p>
      <p className="text-white/30 text-[10px] font-medium uppercase tracking-tighter">
        {t("uses_left")}
      </p>
    </div>'''

new_ui = '''<div className="mt-6 mb-3 space-y-3">
  {/* Coupon toggle button */}
  {!showPromo && !promoApplied && (
    <button onClick={() => setShowPromo(true)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,background:"rgba(255,215,0,0.05)",border:"1px dashed rgba(255,215,0,0.3)",borderRadius:14,padding:"10px 14px",cursor:"pointer",transition:"all 0.2s"}}>
      <span style={{fontSize:24}}>🎟️</span>
      <div style={{flex:1,textAlign:"left"}}>
        <div style={{color:"#ffd700",fontWeight:700,fontSize:13}}>Have a promo code?</div>
        <div style={{color:"rgba(255,255,255,0.35)",fontSize:11}}>Tap to enter your code</div>
      </div>
      <span style={{color:"rgba(255,215,0,0.5)",fontSize:18}}>›</span>
    </button>
  )}
  {/* Applied badge */}
  {promoApplied && (
    <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(0,255,136,0.08)",border:"1px solid rgba(0,255,136,0.3)",borderRadius:14,padding:"10px 14px"}}>
      <span style={{fontSize:22}}>✅</span>
      <div style={{flex:1}}>
        <div style={{color:"#00ff88",fontWeight:700,fontSize:13}}>Promo Applied!</div>
        <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>{promoCode} — 15% off</div>
      </div>
      <button onClick={() => { setPromoCode(""); setShowPromo(false); }} style={{color:"rgba(255,255,255,0.3)",fontSize:18,background:"none",border:"none",cursor:"pointer"}}>✕</button>
    </div>
  )}
  {/* Expandable input */}
  {showPromo && !promoApplied && (
    <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:14,padding:14}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:20}}>🎟️</span>
        <span style={{color:"#ffd700",fontWeight:700,fontSize:13}}>Enter Promo Code</span>
        <button onClick={() => setShowPromo(false)} style={{marginLeft:"auto",color:"rgba(255,255,255,0.3)",background:"none",border:"none",cursor:"pointer",fontSize:16}}>✕</button>
      </div>
      <div style={{display:"flex",gap:8}}>
        <input
          type="text"
          placeholder="e.g. BETA15"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          style={{flex:1,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"10px 14px",color:"#ffffff",fontSize:14,fontWeight:700,letterSpacing:2,outline:"none",caretColor:"#ffd700"}}
        />
        <button
          onClick={() => { if (promoCode.trim()) { setPromoApplied(promoCode.toUpperCase() === "BETA15"); setShowPromo(false); } }}
          style={{background:"linear-gradient(135deg,#ffd700,#ff8c00)",color:"#000",fontWeight:900,border:"none",borderRadius:10,padding:"10px 18px",cursor:"pointer",fontSize:13}}>
          Apply
        </button>
      </div>
    </div>
  )}
  {/* Visual confirmation of savings */}
  {promoApplied && fareEstimate?.discount > 0 && (
    <div className="flex items-center justify-between px-2 animate-in slide-in-from-top-1">
       <p className="text-[#00ff88] text-[11px] font-bold flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" />
        {t("promo_discount")}: GEL {fareEstimate.discount.toFixed(2)}!
      </p>
      <p className="text-white/30 text-[10px] font-medium uppercase tracking-tighter">
        {t("uses_left")}
      </p>
    </div>'''

if old_ui in c:
    c = c.replace(old_ui, new_ui)
    print("OK: promo UI replaced with collapsible coupon")
else:
    print("MISS: promo UI")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
