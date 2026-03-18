path = "frontend/src/i18n/translations.js"
c = open(path, "r", encoding="utf-8").read()
keys = ["account_pending", "pending_review", "wallet_empty", "commission_breakdown", "bank_details", "save_iban", "total_earned", "paid_commission", "withdrawn", "support", "get_help", "describe_problem", "fill", "withdraw", "commission_paid", "top_up", "overview", "under_review", "notify_approved", "balance"]
for k in keys:
    found = (k + ":") in c
    print(k + ": " + ("OK" if found else "MISSING"))
