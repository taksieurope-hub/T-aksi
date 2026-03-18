path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

vault_charge = '''
@app.post("/api/rider/charge-saved-card", tags=["Wallet"])
async def charge_saved_card(
    payload: dict = Body(...),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Charge a PayPal vaulted card directly — no frontend PayPal buttons needed."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    vault_id = payload.get("vault_id")
    amount_gel = float(payload.get("amount_gel", 0))
    description = payload.get("description", "T\'aksi ride payment")
    if not vault_id or amount_gel <= 0:
        raise HTTPException(400, "vault_id and amount_gel are required")
    amount_usd = round(amount_gel * 0.37, 2)
    if amount_usd < 0.01:
        raise HTTPException(400, "Amount too small to charge")
    token = await get_paypal_token()
    if not token:
        raise HTTPException(502, "PayPal unavailable")
    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Create order with saved payment source
        order_payload = {
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {"currency_code": "USD", "value": str(amount_usd)},
                "description": description,
            }],
            "payment_source": {
                "card": {
                    "vault_id": vault_id,
                }
            }
        }
        create_resp = await client.post(
            f"{PAYPAL_API_BASE}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=order_payload,
        )
        if create_resp.status_code not in (200, 201):
            logger.error(f"PayPal vault order create failed: {create_resp.text}")
            raise HTTPException(502, "Failed to create PayPal order")
        order_data = create_resp.json()
        order_id = order_data.get("id")
        if not order_id:
            raise HTTPException(502, "No order ID returned from PayPal")
        # Step 2: Capture the order
        capture_resp = await client.post(
            f"{PAYPAL_API_BASE}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={},
        )
        if capture_resp.status_code not in (200, 201):
            logger.error(f"PayPal vault capture failed: {capture_resp.text}")
            raise HTTPException(502, "Failed to capture PayPal payment")
        capture_data = capture_resp.json()
        capture_status = capture_data.get("status")
        if capture_status != "COMPLETED":
            raise HTTPException(402, f"Payment not completed: {capture_status}")
        return {
            "status": "success",
            "order_id": order_id,
            "amount_gel": amount_gel,
            "amount_usd": amount_usd,
        }

@app.get("/api/rider/saved-cards", tags=["Wallet"])
async def get_saved_cards(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        return {"saved_cards": []}
    cards = doc.to_dict().get("saved_cards", [])
    return {"saved_cards": cards}

@app.delete("/api/rider/saved-cards/{vault_id}", tags=["Wallet"])
async def delete_saved_card(vault_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "User not found")
    cards = doc.to_dict().get("saved_cards", [])
    updated = [c for c in cards if c.get("vault_id") != vault_id]
    db.collection("users").document(user_id).update({"saved_cards": updated})
    return {"message": "Card removed"}
'''

marker = '\nif __name__ == "__main__":'
if marker in c:
    c = c.replace(marker, vault_charge + marker)
    print("OK: vault charge endpoints added")
else:
    c += vault_charge
    print("OK: appended")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
