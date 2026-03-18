c = open("frontend/src/components/DriverPortal.jsx", "r", encoding="utf-8").read()

if "useFirebasePhoneAuth" not in c:
    c = c.replace(
        'import React from "react";',
        'import { sendFirebaseOTP, verifyFirebaseOTP } from "@/hooks/useFirebasePhoneAuth";\nimport React from "react";'
    )

old_send = '''  const handleSendOtp = async () => {
    if (!form.cellphone) return toast.error("Enter your phone number first");
    setLoading(true);
    try {
      await api.post("/auth/otp/send", { cellphone: form.cellphone });
      toast.success("Verification code sent!");
      setOtpStep("otp");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send code");
    } finally { setLoading(false); }
  };'''

new_send = '''  const handleSendOtp = async () => {
    if (!form.cellphone) return toast.error("Enter your phone number first");
    setLoading(true);
    try {
      const phone = form.cellphone.startsWith("+") ? form.cellphone : "+995" + form.cellphone.replace(/^0/, "");
      const result = await sendFirebaseOTP(phone);
      if (!result.success) throw new Error(result.error);
      toast.success("Verification code sent!");
      setOtpStep("otp");
    } catch (err) {
      toast.error(err.message || "Failed to send code");
    } finally { setLoading(false); }
  };'''

old_verify = '''  const handleVerifyOtp = async () => {
    setLoading(true);
    try {
      const res = await api.post("/auth/otp/verify", { cellphone: form.cellphone, code: otpCode });
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
    print("Patched handleSendOtp in DriverPortal")
else:
    print("handleSendOtp pattern not found in DriverPortal")

if old_verify in c:
    c = c.replace(old_verify, new_verify)
    print("Patched handleVerifyOtp in DriverPortal")
else:
    print("handleVerifyOtp pattern not found in DriverPortal")

open("frontend/src/components/DriverPortal.jsx", "w", encoding="utf-8").write(c)
