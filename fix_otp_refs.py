path = 'frontend/src/components/RiderPortal.jsx'
c = open(path, 'r', encoding='utf-8').read()

# Fix onChange - remove setOtpStep and setPhoneToken calls
old = 'onChange={e => { setFormData({ ...formData, cellphone: e.target.value }); setOtpStep("form"); setPhoneToken(null); }}'
new = 'onChange={e => setFormData({ ...formData, cellphone: e.target.value })}'
if old in c:
    c = c.replace(old, new)
    print('OK: fixed onChange')
else:
    print('MISS: onChange')

# Remove the leftover otpStep === form block (verify button remnant)
import re
c, n = re.subn(r'\s*\{!isLogin && otpStep === "form" && \(.*?\)\}', '', c, flags=re.DOTALL)
print('removed otpStep blocks: ' + str(n))

open(path, 'w', encoding='utf-8', newline='\n').write(c)
print('Done!')
