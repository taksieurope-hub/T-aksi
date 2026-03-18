path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

bank_endpoints = '''
@app.post("/api/driver/bank-details", tags=["Driver"])
async def save_bank_details(
    bank_type: str = Query(...),
    bank_account: str = Query(...),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    if len(bank_account.strip()) < 5:
        raise HTTPException(400, "Invalid bank account details")
    db = get_db()
    db.collection("users").document(user_id).update({
        "saved_bank_type": bank_type.lower(),
        "saved_bank_account": bank_account.strip().upper(),
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "Bank details saved"}

@app.get("/api/driver/bank-details", tags=["Driver"])
async def get_bank_details(user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise HTTPException(404, "User not found")
    data = doc.to_dict()
    return {
        "bank_type": data.get("saved_bank_type", ""),
        "bank_account": data.get("saved_bank_account", ""),
    }
'''

marker = '\nif __name__ == "__main__":'
if marker in c:
    c = c.replace(marker, bank_endpoints + marker)
    print("OK: bank detail endpoints added")
else:
    c += bank_endpoints
    print("OK: appended")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
