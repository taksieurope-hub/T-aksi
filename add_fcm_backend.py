path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '@app.post("/api/auth/login", tags=["Auth"])'
new = '''@app.post("/api/auth/fcm-token", tags=["Auth"])
async def save_fcm_token(
    data: dict,
    user_id: Optional[str] = Depends(get_current_user_id)
):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    token = data.get("token")
    if not token:
        raise HTTPException(400, "Token required")
    db = get_db()
    db.collection("users").document(user_id).update({
        "fcm_token": token,
        "fcm_updated_at": firestore.SERVER_TIMESTAMP,
    })
    return {"message": "FCM token saved"}


@app.post("/api/auth/login", tags=["Auth"])'''

if '@app.post("/api/auth/fcm-token"' not in c:
    c = c.replace(old, new)
    print("OK: FCM token endpoint added")
else:
    print("SKIP: already exists")

open(path, "w", encoding="utf-8", newline="\n").write(c)
