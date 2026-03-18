path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# 1. Add BankDetailsPanel component before MorePanel
bank_panel = """
// =============================================================================
// BANK DETAILS PANEL
// =============================================================================
const BankDetailsPanel = ({ onSaved }) => {
  const { t } = useLanguage();
  const [bankType, setBankType] = React.useState("iban");
  const [bankAccount, setBankAccount] = React.useState("");
  const [saved, setSaved] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    api.get("/driver/bank-details").then(r => {
      if (r.data.bank_account) {
        setSaved(r.data);
        setBankType(r.data.bank_type || "iban");
        setBankAccount(r.data.bank_account);
      }
    }).catch(() => {});
  }, []);

  const bankLabels = { iban: "IBAN", bog: "Bank of Georgia", tbc: "TBC Bank" };
  const bankPlaceholders = {
    iban: "GE29NB0000000101904917",
    bog: "GE29BG0000000101904917",
    tbc: "GE29TB0000000101904917",
  };

  const save = async () => {
    if (bankAccount.trim().length < 5) return toast.error("Please enter valid bank details");
    setLoading(true);
    try {
      await api.post(`/driver/bank-details?bank_type=${bankType}&bank_account=${encodeURIComponent(bankAccount.trim().toUpperCase())}`);
      setSaved({ bank_type: bankType, bank_account: bankAccount.trim().toUpperCase() });
      toast.success("Bank details saved!");
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div style={{background:"rgba(255,215,0,0.05)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:16,padding:16,marginBottom:4}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <span style={{fontSize:22}}>🏦</span>
          <div>
            <div style={{color:"#ffd700",fontWeight:700,fontSize:14}}>Saved Bank Details</div>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>Saved once, auto-fills every withdrawal</div>
          </div>
        </div>
      </div>

      {saved?.bank_account && (
        <div style={{background:"rgba(0,255,136,0.06)",border:"1px solid rgba(0,255,136,0.25)",borderRadius:12,padding:14,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>✅</span>
          <div style={{flex:1}}>
            <div style={{color:"#00ff88",fontWeight:700,fontSize:13}}>Current saved account</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
              <span style={{background:"rgba(0,255,136,0.15)",borderRadius:6,padding:"2px 8px",color:"#00ff88",fontSize:11,fontWeight:700}}>{(saved.bank_type||"bank").toUpperCase()}</span>
              <span style={{color:"white",fontFamily:"monospace",fontSize:13,letterSpacing:1}}>{saved.bank_account}</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Transfer Method</label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:6}}>
          {Object.entries(bankLabels).map(([k, v]) => (
            <button key={k} onClick={() => setBankType(k)}
              style={{padding:"10px 4px",borderRadius:12,border:`1px solid ${bankType===k?"rgba(0,255,136,0.5)":"rgba(255,255,255,0.1)"}`,background:bankType===k?"rgba(0,255,136,0.1)":"transparent",color:bankType===k?"#00ff88":"rgba(255,255,255,0.4)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{bankLabels[bankType]} Number</label>
        <input
          value={bankAccount}
          onChange={e => setBankAccount(e.target.value.toUpperCase())}
          placeholder={bankPlaceholders[bankType]}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:12,padding:"12px 14px",color:"#ffffff",fontSize:14,fontFamily:"monospace",letterSpacing:1,outline:"none",caretColor:"#00ff88",boxSizing:"border-box"}}
        />
      </div>

      <button onClick={save} disabled={loading || bankAccount.trim().length < 5}
        style={{width:"100%",background:"linear-gradient(135deg,#00ff88,#00d4ff)",color:"#000",fontWeight:900,border:"none",borderRadius:12,padding:"14px",fontSize:15,cursor:"pointer",opacity:(loading||bankAccount.trim().length<5)?0.5:1}}>
        {loading ? "Saving..." : saved?.bank_account ? "Update Bank Details" : "Save Bank Details"}
      </button>

      <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:12}}>
        <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,lineHeight:1.6}}>
          Your bank details are stored securely and only used for withdrawal processing. 
          Once saved, they will auto-fill when you request a withdrawal.
        </div>
      </div>
    </div>
  );
};
"""

old_more = "const MorePanel = ("
if old_more in c:
    c = c.replace(old_more, bank_panel + "\nconst MorePanel = (")
    print("OK: BankDetailsPanel added")
else:
    print("MISS: MorePanel insert point")

# 2. Add bank_details menu item to MorePanel menuItems
old_menu = '    { id: "feedback",\n  label: t("feedback"),\n  icon: ThumbsUp,\n  desc: t("describe_issue"),\n  color: "text-[#00ff88]",\n  bg: "bg-[#00ff88]/10",\n  border: "border-[#00ff88]/20"\n},'
new_menu = '    { id: "feedback",\n  label: t("feedback"),\n  icon: ThumbsUp,\n  desc: t("describe_issue"),\n  color: "text-[#00ff88]",\n  bg: "bg-[#00ff88]/10",\n  border: "border-[#00ff88]/20"\n},\n    { id: "bank", label: "Bank Details", icon: Wallet, desc: "Save your IBAN for withdrawals", color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20" },'

if old_menu in c:
    c = c.replace(old_menu, new_menu)
    print("OK: bank menu item added")
else:
    print("MISS: menu item - trying alternative")
    # try single line version
    alt = '{ id: "feedback",\n  label: t("feedback"),\n  icon: ThumbsUp,'
    print("feedback entry found:", alt in c)

# 3. Add bank view handler in MorePanel
old_views = '    if (view === "feedback") return <div><BackButton onClick={back} /><React.Suspense fallback={null}><FeedbackPanel userType="driver" /></React.Suspense></div>;'
new_views = '    if (view === "feedback") return <div><BackButton onClick={back} /><React.Suspense fallback={null}><FeedbackPanel userType="driver" /></React.Suspense></div>;\n    if (view === "bank") return <div><BackButton onClick={back} /><BankDetailsPanel onSaved={back} /></div>;'

if old_views in c:
    c = c.replace(old_views, new_views)
    print("OK: bank view handler added")
else:
    print("MISS: view handler")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
