path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
import re

# Fix onChange
old = 'onChange={e => { setForm({ ...form, cellphone: e.target.value }); setOtpStep("form"); setPhoneToken(null); }}'
new = 'onChange={e => setForm({ ...form, cellphone: e.target.value })}'
if old in c:
    c = c.replace(old, new)
    print("OK: fixed onChange")
else:
    print("MISS: onChange")

# Fix disabled attr on phone input
old = 'required disabled={otpStep === "otp" || otpStep === "done"} />'
new = 'required />'
if old in c:
    c = c.replace(old, new)
    print("OK: fixed disabled")
else:
    print("MISS: disabled")

# Remove all otpStep blocks
c, n = re.subn(r'\s*\{!isLogin && otpStep === "[^"]*" && \(.*?\)\}', "", c, flags=re.DOTALL)
print("removed otpStep blocks: " + str(n))

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
