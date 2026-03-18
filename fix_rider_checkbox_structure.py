path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Replace the broken fragment with the complete correct block
old = '''          {showTerms && <TermsAndConditions onClose={() => setShowTerms(false)} />}
                style={{marginTop:2,accentColor:"#00ff88",width:16,height:16,flexShrink:0,cursor:"pointer"}} />
              <label htmlFor="terms-cb" style={{color:"rgba(255,255,255,0.5)",fontSize:12,lineHeight:1.5,cursor:"pointer"}}>
                I have read and agree to the{" "}
                <button type="button" onClick={() => setShowTerms(true)}
                  style={{color:"#00ff88",background:"none",border:"none",padding:0,fontSize:12,cursor:"pointer",textDecoration:"underline"}}>
                  Terms & Conditions and Privacy Policy
                </button>
              </label>
            </div>
          )}'''

new = '''          {showTerms && <TermsAndConditions onClose={() => setShowTerms(false)} />}
          {!isLogin && (
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
          )}'''

if old in c:
    c = c.replace(old, new)
    print("OK: fixed checkbox structure")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
