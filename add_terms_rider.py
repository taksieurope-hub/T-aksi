path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add showTerms state to RiderAuth
old_state = "  const [isLogin, setIsLogin] = useState(true);"
new_state = "  const [isLogin, setIsLogin] = useState(true);\n  const [showTerms, setShowTerms] = useState(false);\n  const [termsAccepted, setTermsAccepted] = useState(false);"

if old_state in c:
    c = c.replace(old_state, new_state)
    print("OK: terms state added")
else:
    print("MISS: state")

# Block registration if terms not accepted
old_register = '        const res = await api.post("/auth/register/rider", formData, {'
new_register = '''        if (!termsAccepted) { toast.error("Please accept the Terms & Conditions to continue"); return; }
        const res = await api.post("/auth/register/rider", formData, {'''

if old_register in c:
    c = c.replace(old_register, new_register)
    print("OK: terms guard added")
else:
    print("MISS: guard")

# Add checkbox + modal before the submit button in signup form
old_submit = '            {!isLogin && otpStep === "form" && ('
new_submit = '''            {showTerms && <TermsAndConditions onClose={() => setShowTerms(false)} />}
            {!isLogin && otpStep === "form" && ('''

if old_submit in c:
    c = c.replace(old_submit, new_submit)
    print("OK: modal render added")
else:
    print("MISS: modal render")

# Add the checkbox UI just before the submit button
old_btn = '              {!isLogin && otpStep === "otp" && ('
new_btn = '''              {!isLogin && otpStep === "form" && (
                <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0"}}>
                  <input type="checkbox" id="terms-cb" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}
                    style={{marginTop:2,accentColor:"#00ff88",width:16,height:16,flexShrink:0,cursor:"pointer"}} />
                  <label htmlFor="terms-cb" style={{color:"rgba(255,255,255,0.5)",fontSize:12,lineHeight:1.5,cursor:"pointer"}}>
                    I have read and agree to the{" "}
                    <button type="button" onClick={() => setShowTerms(true)}
                      style={{color:"#00ff88",background:"none",border:"none",padding:0,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
                      Terms & Conditions and Privacy Policy
                    </button>
                  </label>
                </div>
              )}
              {!isLogin && otpStep === "otp" && ('''

if old_btn in c:
    c = c.replace(old_btn, new_btn)
    print("OK: checkbox UI added")
else:
    print("MISS: checkbox")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
