path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

old = '@app.post("/api/support/message", tags=["Support"])'
new = '''@app.post("/api/support/chat", tags=["Support"])
async def ai_support_chat(req: dict, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    db = get_db()

    user_doc = db.collection("users").document(user_id).get()
    user_data = user_doc.to_dict() if user_doc.exists else {}
    user_name = f"{user_data.get('name', '')} {user_data.get('surname', '')}".strip()
    user_type = user_data.get("user_type", "rider")

    message = req.get("message", "")
    history = req.get("history", [])

    system_prompt = f"""You are T\'aksi Support AI, a helpful assistant for T\'aksi - a ride-hailing app in Georgia (the country).

User: {user_name} ({user_type})

T\'aksi facts:
- Ride types: Economy, Comfort, SUV/XL, Jumpstart (electric), Personal (luxury)
- Payment: Cash, Wallet, Card, Corporate account
- Drivers get 77% of fare, T\'aksi takes 23% commission
- Drivers need a signup bonus to cover commission on cash rides
- Corporate accounts need admin approval (up to 24 hours)
- Riders get 15% off their first 2 rides
- Promo code BETA15 gives 15% off
- Support email: taksigeorgia@gmail.com
- Available in Georgia, prices in GEL

You can answer ANY question, not just about T\'aksi. Be friendly and helpful.

If the user has a specific account issue, payment problem, or complaint that requires human action, end your response with exactly: [CREATE_TICKET]

Do not create a ticket for general questions, how-to questions, or things you can resolve yourself."""

    messages = []
    for h in history[-10:]:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=system_prompt,
            messages=messages
        )
        reply = response.content[0].text

        should_create_ticket = "[CREATE_TICKET]" in reply
        clean_reply = reply.replace("[CREATE_TICKET]", "").strip()

        ticket_id = None
        if should_create_ticket:
            ticket_ref = db.collection("support_tickets").document()
            full_history = history + [
                {"role": "user", "content": message},
                {"role": "assistant", "content": clean_reply}
            ]
            ticket_ref.set({
                "id": ticket_ref.id,
                "user_id": user_id,
                "user_name": user_name,
                "user_phone": user_data.get("cellphone_norm") or user_data.get("cellphone", ""),
                "user_type": user_type,
                "message": message,
                "status": "open",
                "source": "ai_chat",
                "chat_history": full_history,
                "created_at": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
            })
            ticket_id = ticket_ref.id

        return {
            "reply": clean_reply,
            "ticket_created": should_create_ticket,
            "ticket_id": ticket_id
        }

    except Exception as e:
        logger.error(f"AI support error: {e}")
        raise HTTPException(500, "AI support temporarily unavailable")


@app.post("/api/support/message", tags=["Support"])'''

if '/api/support/chat' not in c:
    c = c.replace(old, new)
    changes.append("OK: AI support chat endpoint added")
else:
    changes.append("SKIP: already exists")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
