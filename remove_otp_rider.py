path = 'frontend/src/components/RiderPortal.jsx'
c = open(path, 'r', encoding='utf-8').read()
changes = []

# 1. Remove phoneToken state
old = '  const [phoneToken, setPhoneToken] = useState(null);\n'
if old in c:
    c = c.replace(old, '')
    changes.append('removed phoneToken state')

# 2. Remove otpStep and otpCode states
old = '  const [otpStep, setOtpStep]       = useState("form");\n  const [otpCode, setOtpCode]       = useState("");\n'
if old in c:
    c = c.replace(old, '')
    changes.append('removed otp states')

# 3. Remove handleSendOtp and handleVerifyOtp functions
import re
c, n = re.subn(r'  const handleSendOtp = async \(\) => \{.*?\n  \};\n', '', c, flags=re.DOTALL)
if n: changes.append('removed handleSendOtp')
c, n = re.subn(r'  const handleVerifyOtp = async \(\) => \{.*?\n  \};\n', '', c, flags=re.DOTALL)
if n: changes.append('removed handleVerifyOtp')

# 4. Remove phone token check before register
old = '        if (!phoneToken) return toast.error("Please verify your phone number first");\n'
if old in c:
    c = c.replace(old, '')
    changes.append('removed phoneToken guard')

# 5. Remove X-Phone-Verified header
old = '          headers: { "X-Phone-Verified": phoneToken },\n'
if old in c:
    c = c.replace(old, '')
    changes.append('removed phone header')

# 6. Remove OTP UI blocks - verify button and otp input
old = '              {!isLogin && otpStep === "form" && (\n                <Button type="button" onClick={handleSendOtp} disabled={loading || !formData.cellphone}\n                  className="h-11 px-3 bg-white/10 text-white text-xs rounded-xl border border-white/10 hover:bg-white/15">\n                  Verify\n                </Button>\n              )}\n              {!isLogin && otpStep === "done" && (\n                <div className="h-11 px-3 flex items-center text-[#00ff88] text-xs font-bold">? Verified</div>\n              )}'
if old in c:
    c = c.replace(old, '')
    changes.append('removed verify button UI')

# 7. Remove OTP input section
c, n = re.subn(r'          \{!isLogin && otpStep === "otp" && \(.*?\n          \)\}', '', c, flags=re.DOTALL)
if n: changes.append('removed otp input UI')

# 8. Fix disabled on phone input - remove otpStep reference
old = '                  disabled={otpStep === "otp" || otpStep === "done"} />'
if old in c:
    c = c.replace(old, '                  />')
    changes.append('fixed phone input disabled')

# 9. Fix submit button - remove otpStep condition
old = '          <Button type="submit" disabled={loading || (!isLogin ? otpStep !== "done" : false)}'
if old in c:
    c = c.replace(old, '          <Button type="submit" disabled={loading}')
    changes.append('fixed submit button')

print('Applied:', changes)
open(path, 'w', encoding='utf-8', newline='\n').write(c)
print('Done!')
