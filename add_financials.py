path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

financials_code = '''
@app.get("/api/admin/financials", tags=["Admin"])
async def get_financials(
    period: str = Query(default="month"),  # week, month, quarter, year, all
    admin_id: str = Depends(get_admin_user)
):
    from datetime import datetime, timezone, timedelta
    db = get_db()
    now = datetime.now(timezone.utc)

    # Determine date range
    if period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "quarter":
        quarter_start_month = ((now.month - 1) // 3) * 3 + 1
        start = now.replace(month=quarter_start_month, day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start = None

    # Fetch completed rides
    rides_query = db.collection("rides").where("status", "==", "completed")
    if start:
        rides_query = rides_query.where("created_at", ">=", start)
    rides = list(rides_query.stream())

    total_rides = len(rides)
    gross_revenue = 0.0       # total fares paid by riders
    platform_commission = 0.0  # our cut
    driver_earnings = 0.0     # driver share
    card_fees = 0.0           # service fees from card payments
    cash_rides = 0
    card_rides = 0
    wallet_rides = 0
    surge_revenue = 0.0
    daily_breakdown = {}
    driver_breakdown = {}

    for r in rides:
        data = r.to_dict()
        fare = data.get("final_fare") or data.get("estimated_fare") or 0
        commission_rate = data.get("commission_rate", 0.23)
        service_fee = data.get("service_fee", 0) or 0
        surge_mult = data.get("surge_multiplier", 1.0) or 1.0
        payment = data.get("payment_method", "cash")
        driver_id = data.get("driver_id", "")
        created_at = data.get("created_at")

        commissionable = float(fare) - float(service_fee)
        commission = round(commissionable * commission_rate, 2)
        driver_share = round(commissionable - commission, 2)

        gross_revenue += float(fare)
        platform_commission += commission
        driver_earnings += driver_share
        card_fees += float(service_fee)

        if payment == "cash": cash_rides += 1
        elif payment == "card": card_rides += 1
        elif payment == "wallet": wallet_rides += 1

        if surge_mult > 1.0:
            surge_revenue += commission

        # Daily breakdown
        if created_at:
            try:
                if hasattr(created_at, "strftime"):
                    day_key = created_at.strftime("%Y-%m-%d")
                else:
                    day_key = str(created_at)[:10]
                if day_key not in daily_breakdown:
                    daily_breakdown[day_key] = {"date": day_key, "rides": 0, "gross": 0.0, "commission": 0.0, "driver_earnings": 0.0}
                daily_breakdown[day_key]["rides"] += 1
                daily_breakdown[day_key]["gross"] += float(fare)
                daily_breakdown[day_key]["commission"] += commission
                daily_breakdown[day_key]["driver_earnings"] += driver_share
            except: pass

        # Per-driver breakdown
        if driver_id:
            if driver_id not in driver_breakdown:
                driver_breakdown[driver_id] = {"driver_id": driver_id, "rides": 0, "gross": 0.0, "commission": 0.0, "driver_earnings": 0.0}
            driver_breakdown[driver_id]["rides"] += 1
            driver_breakdown[driver_id]["gross"] += float(fare)
            driver_breakdown[driver_id]["commission"] += commission
            driver_breakdown[driver_id]["driver_earnings"] += driver_share

    # Enrich driver names
    driver_ids = list(driver_breakdown.keys())
    for did in driver_ids:
        try:
            doc = db.collection("users").document(did).get()
            if doc.exists:
                d = doc.to_dict()
                driver_breakdown[did]["name"] = f"{d.get('name','')} {d.get('surname','')}".strip()
                driver_breakdown[did]["phone"] = d.get("cellphone", "")
        except: pass

    # Georgia tax brackets 2024 (individual income tax is flat 20%, VAT 18% on turnover > 100k GEL)
    # For a company: income tax 15%, dividend tax 5%
    annual_projection = platform_commission * (365 / max((now - start).days if start else 365, 1))
    if annual_projection < 500:
        tax_bracket = "0% - Below minimum threshold"
        est_tax_rate = 0.0
    elif annual_projection < 100000:
        tax_bracket = "20% - Individual income tax (Georgia)"
        est_tax_rate = 0.20
    else:
        tax_bracket = "15% corporate + 18% VAT - Large business threshold"
        est_tax_rate = 0.20

    estimated_tax = round(platform_commission * est_tax_rate, 2)
    net_after_tax = round(platform_commission - estimated_tax, 2)

    # Wallet top-ups (money in from riders)
    topups = list(db.collection("driver_topup_requests").where("status", "==", "approved").stream())
    total_topups = sum(float(t.to_dict().get("amount", 0)) for t in topups)

    # Withdrawals paid out
    withdrawals = list(db.collection("driver_withdrawals").where("status", "==", "approved").stream())
    total_withdrawals = sum(float(w.to_dict().get("amount", 0)) for w in withdrawals)

    return {
        "period": period,
        "summary": {
            "total_rides": total_rides,
            "gross_revenue": round(gross_revenue, 2),
            "platform_commission": round(platform_commission, 2),
            "driver_earnings": round(driver_earnings, 2),
            "card_service_fees": round(card_fees, 2),
            "surge_revenue": round(surge_revenue, 2),
            "cash_rides": cash_rides,
            "card_rides": card_rides,
            "wallet_rides": wallet_rides,
            "total_topups": round(total_topups, 2),
            "total_withdrawals": round(total_withdrawals, 2),
            "net_platform_revenue": round(platform_commission + card_fees, 2),
        },
        "tax": {
            "annual_projection": round(annual_projection, 2),
            "bracket": tax_bracket,
            "rate": est_tax_rate,
            "estimated_tax": estimated_tax,
            "net_after_tax": net_after_tax,
        },
        "daily_breakdown": sorted(daily_breakdown.values(), key=lambda x: x["date"]),
        "driver_breakdown": sorted(driver_breakdown.values(), key=lambda x: x["commission"], reverse=True),
    }
'''

# Append before __main__ or at end
if '\nif __name__ == "__main__":' in c:
    c = c.replace('\nif __name__ == "__main__":', financials_code + '\nif __name__ == "__main__":')
    print("OK: financials endpoint added")
else:
    c += financials_code
    print("OK: appended")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
