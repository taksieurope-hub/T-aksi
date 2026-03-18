import re
c = open("frontend/src/components/RiderPortal.jsx", "r", encoding="utf-8").read()

# Add import after first import line
if "useFirebasePhoneAuth" not in c:
    c = c.replace(
        'import React,',
        'import { sendFirebaseOTP, verifyFirebaseOTP } from "@/hooks/useFirebasePhoneAuth";\nimport React,'
    )

# Replace handleSendOtp
old_send = '''  const handleSendOtp = async () => {
    if (!formData.cellphone) return toast.error("Enter your phone number first");
    setLoading(true);
    try {
      await api.post("/auth/otp/send", { cellphone: formData.cellphone });
      toast.success("Verification code sent!");
      setOtpStep("otp");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send code");
    } finally { setLoading(false); }
  };'''

new_send = '''  const handleSendOtp = async () => {
    if (!formData.cellphone) return toast.error("Enter your phone number first");
    setLoading(true);
    try {
      const phone = formData.cellphone.startsWith("+") ? formData.cellphone : "+995" + formData.cellphone.replace(/^0/, "");
      const result = await sendFirebaseOTP(phone);
      if (!result.success) throw new Error(result.error);
      toast.success("Verification code sent!");
      setOtpStep("otp");
    } catch (err) {
      toast.error(err.message || "Failed to send code");
    } finally { setLoading(false); }
  };'''

# Replace handleVerifyOtp
old_verify = '''  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const res = await api.post("/auth/otp/verify", { cellphone: formData.cellphone, code: otpCode });
      setPhoneToken(res.data.phone_token);
      setOtpStep("done");
      toast.success("Phone verified ?");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Incorrect code");
    } finally { setLoading(false); }
  };'''

new_verify = '''  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const result = await verifyFirebaseOTP(otpCode);
      if (!result.success) throw new Error(result.error);
      const res = await api.post("/auth/firebase-phone/verify", { id_token: result.idToken });
      setPhoneToken(res.data.phone_token);
      setOtpStep("done");
      toast.success("Phone verified!");
    } catch (err) {
      toast.error(err.message || "Incorrect code");
    } finally { setLoading(false); }
  };'''

if old_send in c:
    c = c.replace(old_send, new_send)
    print("Patched handleSendOtp in RiderPortal")
else:
    print("handleSendOtp pattern not found in RiderPortal")

if old_verify in c:
    c = c.replace(old_verify, new_verify)
    print("Patched handleVerifyOtp in RiderPortal")
else:
    print("handleVerifyOtp pattern not found in RiderPortal")

open("frontend/src/components/RiderPortal.jsx", "w", encoding="utf-8").write(c)
