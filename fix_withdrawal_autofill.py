path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Replace the WithdrawalPanel useEffect to also load saved bank details
old = '''  useEffect(() => {
    api.get("/driver/withdrawals/history").then(r => setHistory(r.data.withdrawals || [])).catch(() => {});
  }, []);'''

new = '''  useEffect(() => {
    api.get("/driver/withdrawals/history").then(r => setHistory(r.data.withdrawals || [])).catch(() => {});
    // Auto-fill saved bank details
    api.get("/driver/bank-details").then(r => {
      if (r.data.bank_account) {
        setBankType(r.data.bank_type || "iban");
        setBankDetails(r.data.bank_account);
      }
    }).catch(() => {});
  }, []);'''

if old in c:
    c = c.replace(old, new)
    print("OK: WithdrawalPanel auto-fills saved bank details")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
