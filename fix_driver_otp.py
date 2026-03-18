path = 'frontend/src/components/DriverPortal.jsx'
c = open(path, 'r', encoding='utf-8').read()
import re

# Remove the broken leftover OTP block (from the comment to closing )}
old = '          {/* OTP confirmation step */}</Label>\n              <div className="flex gap-2">\n                <Input value={otpCode} onChange={e => setOtpCode(e.target.value)} maxLength={4}\n                  placeholder="0000"\n                  className="bg-white/5 border-white/10 text-white h-11 text-center text-lg tracking-widest flex-1" />\n                <Button type="button" onClick={handleVerifyOtp} disabled={loading || otpCode.length < 4}\n                  className="h-11 px-4 bg-[#00d4ff] text-black font-bold rounded-xl text-sm">\n                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("confirm")}\n                </Button>\n              </div>\n              <button type="button" onClick={handleSendOtp} className="text-white/30 text-xs hover:text-white/60">\n                {t("resend_code")}\n              </button>\n            </div>\n          )}'
if old in c:
    c = c.replace(old, '')
    print('OK: removed broken OTP block')
else:
    print('MISS - trying regex')
    c, n = re.subn(r"\s*\{/\* OTP confirmation step \*/\}.*?\)\}", '', c, flags=re.DOTALL)
    print('regex removed: ' + str(n))

open(path, 'w', encoding='utf-8', newline='\n').write(c)
print('Done!')
