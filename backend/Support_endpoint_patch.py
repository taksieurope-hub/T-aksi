# ============================================================
# PASTE THIS over the existing @app.post("/api/support/message")
# endpoint in server.py (replaces lines from that decorator
# down to the closing `return {...}`)
# ============================================================

@app.post("/api/support/message", tags=["Support"])
async def send_support_message(msg: TicketReplyRequest, user_id: str = Depends(get_current_user_id)):
    db = get_db()

    # ── Continuing an existing ticket ──────────────────────────────────────────
    if msg.ticket_id:
        ticket_ref = db.collection("support_tickets").document(msg.ticket_id)
        ticket_snap = ticket_ref.get()
        if not ticket_snap.exists:
            raise HTTPException(404, "Ticket not found")

        ticket_data = ticket_snap.to_dict()
        chat_history = ticket_data.get("chat_history", [])

        # Build user context
        user_doc = db.collection("users").document(user_id).get()
        user_context = {}
        if user_doc.exists:
            ud = user_doc.to_dict()
            user_context = {
                "name": ud.get("name", "Unknown"),
                "phone": ud.get("cellphone", ""),
                "ride_count": ud.get("total_rides", 0),
                "user_type": ud.get("user_type", "rider"),
            }

        result = await process_support_message(msg.message, user_context, chat_history)

        new_user_msg = {"role": "user", "content": msg.message, "timestamp": now_iso()}
        new_ai_msg = {
            "role": "assistant",
            "content": result["ai_response"],
            "escalated": result["needs_escalation"],
            "timestamp": now_iso(),
        }

        update_payload = {
            "chat_history": firestore.ArrayUnion([new_user_msg, new_ai_msg]),
            "updated_at": firestore.SERVER_TIMESTAMP,
        }

        # If this follow-up message also triggers escalation, bump priority
        if result["needs_escalation"]:
            update_payload["status"] = "escalated"
            update_payload["priority"] = result["priority"]
            if result.get("admin_tag"):
                update_payload["admin_tag"] = result["admin_tag"]
            if result.get("escalation_reason"):
                update_payload["escalation_reason"] = result["escalation_reason"]

        ticket_ref.update(update_payload)

        return {
            "ticket_id": msg.ticket_id,
            "response": result["ai_response"],
            "status": "escalated" if result["needs_escalation"] else "in_progress",
            "escalated": result["needs_escalation"],
            "priority": result["priority"],
        }

    # ── New ticket ──────────────────────────────────────────────────────────────
    user_doc = db.collection("users").document(user_id).get()
    user_context = {}
    if user_doc.exists:
        ud = user_doc.to_dict()
        user_context = {
            "name": ud.get("name", "Unknown"),
            "phone": ud.get("cellphone", ""),
            "ride_count": ud.get("total_rides", 0),
            "user_type": ud.get("user_type", "rider"),
        }

    result = await process_support_message(msg.message, user_context)

    status = "escalated" if result["needs_escalation"] else "ai_handled"
    
    chat_history = [
        {"role": "user", "content": msg.message, "timestamp": now_iso()},
        {
            "role": "assistant",
            "content": result["ai_response"],
            "escalated": result["needs_escalation"],
            "timestamp": now_iso(),
        },
    ]

    ticket_data = {
        "user_id": user_id,
        "user_name": user_context.get("name", "Unknown"),
        "user_phone": user_context.get("phone", ""),
        "user_type": user_context.get("user_type", "rider"),
        "message": msg.message,
        "ai_response": result["ai_response"],
        "admin_response": None,
        "chat_history": chat_history,
        "status": status,
        "priority": result["priority"],
        "category": result["category"],
        # Admin portal metadata
        "admin_tag": result.get("admin_tag"),           # e.g. "🚨 SAFETY"
        "escalation_reason": result.get("escalation_reason"),
        "matched_keywords": result.get("matched_keywords", []),
        "needs_human": result["needs_escalation"],
        "ai_handled": not result["needs_escalation"],
        "admin_notes": None,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    ticket_ref = db.collection("support_tickets").add(ticket_data)

    return {
        "ticket_id": ticket_ref[1].id,
        "response": result["ai_response"],
        "status": status,
        "escalated": result["needs_escalation"],
        "priority": result["priority"],
        "category": result["category"],
    }