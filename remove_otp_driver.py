path = 'frontend/src/components/DriverPortal.jsx'
c = open(path, 'r', encoding='utf-8').read()
changes = []
import re

# 1. Remove phoneToken state
old = '  const [phoneToken, setPhoneToken] = useState(null);\n'
if old in c:
    c = c.replace(old, '')
    changes.append('removed phoneToken state')

# 2. Remove otpStep and otpCode states
old = '  const [otpStep, setOtpStep]       = useState("form"); // "form" | "otp" | "done"\n  const [otpCode, setOtpCode]       = useState("");\n'
if old in c:
    c = c.replace(old, '')
    changes.append('removed otp states')

# 3. Remove handleSendOtp and handleVerifyOtp
c, n = re.subn(r'  const handleSendOtp = async \(\) => \{.*?\n  \};\n', '', c, flags=re.DOTALL)
if n: changes.append('removed handleSendOtp')
c, n = re.subn(r'  const handleVerifyOtp = async \(\) => \{.*?\n  \};\n', '', c, flags=re.DOTALL)
if n: changes.append('removed handleVerifyOtp')

# 4. Remove phone token guard
old = '        if (!phoneToken) return toast.error("Please verify your phone number first");\n'
if old in c:
    c = c.replace(old, '')
    changes.append('removed phoneToken guard')

# 5. Remove X-Phone-Verified header
old = '          headers: { "X-Phone-Verified": phoneToken },\n'
if old in c:
    c = c.replace(old, '')
    changes.append('removed phone header')

# 6. Remove OTP UI blocks
c, n = re.subn(r'\s*\{!isLogin && otpStep === "form" && \(\s*<Button[^}]+handleSendOtp[^}]+>\s*Verify\s*</Button>\s*\)\}\s*\{!isLogin && otpStep === "done" && \(.*?\)\}', '', c, flags=re.DOTALL)
if n: changes.append('removed verify button UI')

c, n = re.subn(r'\s*\{!isLogin && otpStep === "otp" && \(.*?\)\}', '', c, flags=re.DOTALL)
if n: changes.append('removed otp input UI')

# 7. Fix phone input disabled
old = '                  disabled={otpStep === "otp" || otpStep === "done"} />'
if old in c:
    c = c.replace(old, '                  />')
    changes.append('fixed phone input disabled')

# 8. Fix submit button
old = '          <Button type="submit" disabled={loading || (!isLogin ? otpStep !== "done" : false)}'
if old in c:
    c = c.replace(old, '          <Button type="submit" disabled={loading}')
    changes.append('fixed submit button')

print('Applied:', changes)
open(path, 'w', encoding='utf-8', newline='\n').write(c)
print('Done!')
