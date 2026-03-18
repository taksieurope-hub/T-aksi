path = 'backend/server.py'
c = open(path, 'r', encoding='utf-8').read()
changes = []

# Remove rider phone verification block
old = '''    if not x_phone_verified:
        raise HTTPException(403, "Phone number must be verified before registering.")
    token_data = decode_token(x_phone_verified)
    if not token_data or token_data.get("role") != "phone_verified":
        raise HTTPException(403, "Invalid or expired phone verification token.")
    if token_data.get("user_id") != phone_norm:
        raise HTTPException(403, "Phone token does not match the phone number being registered.")

    otp_doc = db.collection("otp_codes").document(phone_norm).get()
    if not otp_doc.exists or not otp_doc.to_dict().get("verified"):
        raise HTTPException(403, "Phone number has not been verified via OTP.")

    existing'''
new = '''    existing'''
if old in c:
    c = c.replace(old, new)
    changes.append('removed rider OTP check')

open(path, 'w', encoding='utf-8').write(c)
print('Applied:', changes)
