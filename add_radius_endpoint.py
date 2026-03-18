path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

endpoint = '''

@app.post("/api/driver/preferred-radius", tags=["Driver"])
async def set_preferred_radius(
    radius: float = Query(..., ge=1.0, le=25.0),
    user_id: Optional[str] = Depends(get_current_user_id)
):
    """Driver sets their preferred search radius in km."""
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()
    db.collection("users").document(user_id).update({"preferred_radius": radius})
    return {"message": "Preferred radius updated", "radius": radius}
'''

c += endpoint
open(path, "w", encoding="utf-8").write(c)
print("Done!")
