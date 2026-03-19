path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Add translation to chat GET endpoint
old = '@app.get("/api/rides/{ride_id}/chat", tags=["Rides"])\nasync def get_chat_messages(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):\n    if not user_id:\n        return {"messages": []}\n    db = get_db()\n    try:\n        docs = list(\n            db.collection("ride_messages")\n            .where("ride_id", "==", ride_id)\n            .order_by("timestamp")\n            .stream()\n        )\n    except Exception:\n        docs = list(db.collection("ride_messages").where("ride_id", "==", ride_id).stream())\n    return {"messages": [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]}'

new = '''@app.get("/api/rides/{ride_id}/chat", tags=["Rides"])
async def get_chat_messages(ride_id: str, user_id: Optional[str] = Depends(get_current_user_id)):
    if not user_id:
        return {"messages": []}
    db = get_db()
    try:
        docs = list(
            db.collection("ride_messages")
            .where("ride_id", "==", ride_id)
            .order_by("timestamp")
            .stream()
        )
    except Exception:
        docs = list(db.collection("ride_messages").where("ride_id", "==", ride_id).stream())

    messages = [serialize_firestore_data({**d.to_dict(), "id": d.id}) for d in docs]

    # Get user language preference for translation
    user_doc = db.collection("users").document(user_id).get()
    user_lang = (user_doc.to_dict() or {}).get("language", "en") if user_doc.exists else "en"

    LANG_NAMES = {
        "ka": "Georgian", "en": "English", "ru": "Russian",
        "hi": "Hindi", "zh": "Chinese", "nl": "Dutch",
        "fr": "French", "de": "German", "pl": "Polish",
        "af": "Afrikaans", "zu": "Zulu", "xh": "Xhosa"
    }
    target_lang = LANG_NAMES.get(user_lang, "English")

    # Translate messages not sent by this user if language is not English
    if user_lang != "en" and len(messages) > 0:
        try:
            client = anthropic.Anthropic()
            msgs_to_translate = [m for m in messages if m.get("sender_id") != user_id and m.get("message")]
            if msgs_to_translate:
                texts = [m["message"] for m in msgs_to_translate]
                combined = "\\n---\\n".join(texts)
                resp = client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=1000,
                    messages=[{
                        "role": "user",
                        "content": f"Translate each message to {target_lang}. Keep the same order, separated by ---. Only return translations, nothing else:\\n\\n{combined}"
                    }]
                )
                translations = resp.content[0].text.strip().split("\\n---\\n")
                for i, m in enumerate(msgs_to_translate):
                    if i < len(translations):
                        m["translated_message"] = translations[i].strip()
                        m["original_message"] = m["message"]
        except Exception as e:
            logger.warning(f"Translation failed: {e}")

    return {"messages": messages, "user_language": user_lang}'''

if old in c:
    c = c.replace(old, new)
    changes.append("OK: translation added to chat endpoint")
else:
    changes.append("MISS: chat get endpoint")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
