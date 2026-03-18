path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

# ================================================================
# 1. ADD CORPORATE ENDPOINTS AT END OF FILE
# ================================================================
corporate_code = '''

# ==============================================================================
# CORPORATE ACCOUNTS
# ==============================================================================

class CorporateSignup(BaseModel):
    company_name: str
    contact_name: str
    contact_email: str
    contact_phone: str
    password: str
    tax_id: Optional[str] = None

class CorporateLogin(BaseModel):
    contact_email: str
    password: str

class AddEmployeeRequest(BaseModel):
    phone: str

class CorporateTopUp(BaseModel):
    amount: float

@app.post("/api/corporate/register", tags=["Corporate"])
async def corporate_register(data: CorporateSignup, response: Response):
    """Company self-registers - starts as pending_review until T\'aksi admin approves."""
    db = get_db()
    existing = list(db.collection("corporate_accounts")
        .where("contact_email", "==", data.contact_email).limit(1).stream())
    if existing:
        raise HTTPException(400, "An account with this email already exists.")

    corp_ref = db.collection("corporate_accounts").document()
    corp_data = {
        "id": corp_ref.id,
        "company_name": data.company_name,
        "contact_name": data.contact_name,
        "contact_email": data.contact_email,
        "contact_phone": data.contact_phone,
        "tax_id": data.tax_id or "",
        "password_hash": hash_password(data.password),
        "wallet_balance": 0.0,
        "status": "pending_review",
        "employees": [],
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    corp_ref.set(corp_data)

    token = create_token(corp_ref.id, "corporate")
    response.set_cookie("auth_token", token, httponly=True, samesite="none", secure=True, max_age=86400*30)
    safe = {k: v for k, v in corp_data.items() if k != "password_hash"}
    safe["id"] = corp_ref.id
    return {"token": token, "corporate": safe}


@app.post("/api/corporate/login", tags=["Corporate"])
async def corporate_login(data: CorporateLogin, response: Response):
    db = get_db()
    docs = list(db.collection("corporate_accounts")
        .where("contact_email", "==", data.contact_email).limit(1).stream())
    if not docs:
        raise HTTPException(401, "Invalid email or password.")
    corp = docs[0].to_dict()
    corp["id"] = docs[0].id
    if not verify_password(data.password, corp.get("password_hash", "")):
        raise HTTPException(401, "Invalid email or password.")

    token = create_token(corp["id"], "corporate")
    response.set_cookie("auth_token", token, httponly=True, samesite="none", secure=True, max_age=86400*30)
    safe = {k: v for k, v in corp.items() if k != "password_hash"}
    return {"token": token, "corporate": safe}


@app.get("/api/corporate/me", tags=["Corporate"])
async def corporate_me(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("corporate_accounts").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "Corporate account not found")
    corp = doc.to_dict()
    corp["id"] = doc.id
    return {k: v for k, v in corp.items() if k != "password_hash"}


@app.post("/api/corporate/employees/add", tags=["Corporate"])
async def add_employee(data: AddEmployeeRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    """Company admin adds an employee by phone number."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()

    corp_doc = db.collection("corporate_accounts").document(user_id).get()
    if not corp_doc.exists:
        raise HTTPException(404, "Corporate account not found")
    corp_data = corp_doc.to_dict()
    if corp_data.get("status") != "approved":
        raise HTTPException(403, "Your corporate account is not yet approved.")

    phone_norm = normalize_phone(data.phone)
    rider_docs = list(db.collection("users")
        .where("cellphone_norm", "==", phone_norm)
        .where("user_type", "==", "rider")
        .limit(1).stream())
    if not rider_docs:
        raise HTTPException(404, "No rider account found with that phone number. They must register first.")

    rider = rider_docs[0]
    rider_id = rider.id
    employees = corp_data.get("employees", [])
    if any(e["rider_id"] == rider_id for e in employees):
        raise HTTPException(400, "This person is already in your account.")

    rider_data = rider.to_dict()
    employee_entry = {
        "rider_id": rider_id,
        "name": rider_data.get("name", "") + " " + rider_data.get("surname", ""),
        "phone": data.phone,
        "added_at": now_iso(),
    }
    db.collection("corporate_accounts").document(user_id).update({
        "employees": firestore.ArrayUnion([employee_entry])
    })
    # Tag the rider so they see the Business payment option
    db.collection("users").document(rider_id).update({
        "corporate_account_id": user_id,
        "corporate_company_name": corp_data.get("company_name", ""),
    })
    return {"message": "Employee added", "employee": employee_entry}


@app.post("/api/corporate/employees/remove", tags=["Corporate"])
async def remove_employee(data: AddEmployeeRequest, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    corp_doc = db.collection("corporate_accounts").document(user_id).get()
    if not corp_doc.exists:
        raise HTTPException(404, "Corporate account not found")

    phone_norm = normalize_phone(data.phone)
    corp_data = corp_doc.to_dict()
    employees = corp_data.get("employees", [])
    to_remove = next((e for e in employees if normalize_phone(e["phone"]) == phone_norm), None)
    if not to_remove:
        raise HTTPException(404, "Employee not found")

    db.collection("corporate_accounts").document(user_id).update({
        "employees": firestore.ArrayRemove([to_remove])
    })
    # Remove the corporate tag from their rider profile
    try:
        db.collection("users").document(to_remove["rider_id"]).update({
            "corporate_account_id": firestore.DELETE_FIELD,
            "corporate_company_name": firestore.DELETE_FIELD,
        })
    except Exception:
        pass
    return {"message": "Employee removed"}


@app.post("/api/corporate/topup", tags=["Corporate"])
async def corporate_topup(data: CorporateTopUp, user_id: Optional[str] = Depends(get_current_user_id)):
    """Top up the corporate wallet (admin-initiated for now, PayPal integration later)."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    db = get_db()
    corp_doc = db.collection("corporate_accounts").document(user_id).get()
    if not corp_doc.exists:
        raise HTTPException(404, "Corporate account not found")
    db.collection("corporate_accounts").document(user_id).update({
        "wallet_balance": firestore.Increment(data.amount),
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": f"Topped up GEL {data.amount:.2f}"}


@app.get("/api/corporate/rides", tags=["Corporate"])
async def corporate_rides(
    limit: int = Query(50, le=200),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Get all rides charged to this corporate account."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    rides = db.collection("rides")\
        .where("payment_method", "==", "corporate")\
        .where("corporate_account_id", "==", user_id)\
        .order_by("created_at", direction=firestore.Query.DESCENDING)\
        .limit(limit).stream()
    result = []
    for r in rides:
        d = r.to_dict()
        d["id"] = r.id
        result.append(serialize_firestore_data(d))
    return {"rides": result, "total": len(result)}


# Admin endpoints for corporate management
@app.get("/api/admin/corporate", tags=["Admin"])
async def admin_list_corporate(admin_id: str = Depends(get_admin_user)):
    db = get_db()
    docs = db.collection("corporate_accounts").stream()
    result = []
    for d in docs:
        corp = d.to_dict()
        corp["id"] = d.id
        corp.pop("password_hash", None)
        result.append(serialize_firestore_data(corp))
    return {"accounts": result}


@app.post("/api/admin/corporate/{corp_id}/approve", tags=["Admin"])
async def admin_approve_corporate(corp_id: str, admin_id: str = Depends(get_admin_user)):
    db = get_db()
    db.collection("corporate_accounts").document(corp_id).update({
        "status": "approved",
        "approved_at": firestore.SERVER_TIMESTAMP,
        "approved_by": admin_id,
    })
    return {"message": "Corporate account approved"}


@app.post("/api/admin/corporate/{corp_id}/reject", tags=["Admin"])
async def admin_reject_corporate(corp_id: str, reason: str = Query(""), admin_id: str = Depends(get_admin_user)):
    db = get_db()
    db.collection("corporate_accounts").document(corp_id).update({
        "status": "rejected",
        "rejection_reason": reason,
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Corporate account rejected"}


@app.post("/api/admin/corporate/{corp_id}/topup", tags=["Admin"])
async def admin_topup_corporate(corp_id: str, data: CorporateTopUp, admin_id: str = Depends(get_admin_user)):
    """Admin manually tops up a corporate wallet (e.g. after bank transfer)."""
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    db = get_db()
    db.collection("corporate_accounts").document(corp_id).update({
        "wallet_balance": firestore.Increment(data.amount),
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": f"Added GEL {data.amount:.2f} to corporate wallet"}
'''

c += corporate_code
changes.append("added all corporate endpoints")

# ================================================================
# 2. WIRE CORPORATE PAYMENT INTO RIDE COMPLETION
# ================================================================
old = '''    if is_wallet:
        wallet_used = min(wallet_balance, total_with_fee)
        cash_to_collect = total_with_fee - wallet_used
        payment_status = "paid_fully_via_wallet" if cash_to_collect == 0 else "split_cash_required"
        if wallet_used > 0 and rider_ref:
            try:
                rider_ref.update({"wallet_balance": firestore.Increment(-float(wallet_used))})
            except Exception:
                pass
    elif is_card:
        cash_to_collect = 0.0
        payment_status = "paid_via_card"
    else:
        cash_to_collect = total_with_fee
        payment_status = "cash_collected"'''

new = '''    is_corporate = "corporate" in safe_payment_method

    if is_corporate:
        # Charge the corporate wallet
        corp_id = ride_data.get("corporate_account_id")
        corp_balance = 0.0
        if corp_id:
            try:
                corp_doc = db.collection("corporate_accounts").document(corp_id).get()
                if corp_doc.exists:
                    corp_balance = float(corp_doc.to_dict().get("wallet_balance", 0.0))
            except Exception:
                pass
        if corp_balance >= total_with_fee:
            db.collection("corporate_accounts").document(corp_id).update({
                "wallet_balance": firestore.Increment(-float(total_with_fee))
            })
            cash_to_collect = 0.0
            payment_status = "paid_via_corporate"
        else:
            # Corporate wallet insufficient - fall back to cash
            cash_to_collect = total_with_fee
            payment_status = "corporate_insufficient_funds"
    elif is_wallet:
        wallet_used = min(wallet_balance, total_with_fee)
        cash_to_collect = total_with_fee - wallet_used
        payment_status = "paid_fully_via_wallet" if cash_to_collect == 0 else "split_cash_required"
        if wallet_used > 0 and rider_ref:
            try:
                rider_ref.update({"wallet_balance": firestore.Increment(-float(wallet_used))})
            except Exception:
                pass
    elif is_card:
        cash_to_collect = 0.0
        payment_status = "paid_via_card"
    else:
        cash_to_collect = total_with_fee
        payment_status = "cash_collected"'''

if old in c:
    c = c.replace(old, new)
    changes.append("wired corporate payment into ride completion")
else:
    changes.append("MISS: ride completion payment block")

open(path, "w", encoding="utf-8").write(c)
print("Applied:", changes)
