path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''AGORA_APP_ID = "952b4fa249fe44e08b64836a9f6c2a43"
AGORA_APP_CERTIFICATE = os.environ.get("AGORA_APP_CERTIFICATE", "6fe49d41759a4319be3ee5768188c326")

@app.get("/api/agora/token", tags=["Calls"])
async def get_agora_token(channel: str, user_id: str = Depends(get_current_user_id)):
    if not AGORA_APP_CERTIFICATE:
        return {"token": AGORA_APP_ID, "app_id": AGORA_APP_ID, "channel": channel}
    try:
        from agora_token_builder import RtcTokenBuilder, Role_Publisher
        expire = int(time.time()) + 3600
        token = RtcTokenBuilder.buildTokenWithUid(
            AGORA_APP_ID, AGORA_APP_CERTIFICATE, channel, 0, Role_Publisher, expire
        )
        return {"token": token, "app_id": AGORA_APP_ID, "channel": channel}
    except ImportError:
        try:
            from agora_token import RtcTokenBuilder
            expire = int(time.time()) + 3600
            token = RtcTokenBuilder.build_token_with_uid(
                AGORA_APP_ID, AGORA_APP_CERTIFICATE, channel, 0, 1, expire, expire
            )
            return {"token": token, "app_id": AGORA_APP_ID, "channel": channel}
        except ImportError as e2:
            logger.error(f"Agora token error: {e2}")
            return {"token": AGORA_APP_ID, "app_id": AGORA_APP_ID, "channel": channel}
    except Exception as e:
        logger.error(f"Agora token error: {e}")
        return {"token": AGORA_APP_ID, "app_id": AGORA_APP_ID, "channel": channel}'''

new = '''AGORA_APP_ID = "952b4fa249fe44e08b64836a9f6c2a43"
AGORA_APP_CERTIFICATE = os.environ.get("AGORA_APP_CERTIFICATE", "6fe49d41759a4319be3ee5768188c326")

def _build_agora_token(app_id: str, app_cert: str, channel: str, uid: int = 0, expire_seconds: int = 3600) -> str:
    """Pure-Python Agora RTC token builder (no third-party package needed)."""
    import hmac, hashlib, struct, random
    from base64 import b64encode

    ROLE_PUBLISHER = 1
    ts_now = int(time.time())
    ts_expire = ts_now + expire_seconds
    salt = random.randint(1, 0x7FFFFFFF)

    # Pack the privilege message
    privileges = {1: ts_expire, 2: ts_expire, 3: ts_expire, 4: ts_expire, 5: ts_expire, 6: ts_expire, 7: ts_expire}
    msg = struct.pack("<HII", ROLE_PUBLISHER, salt, ts_expire)
    for k, v in sorted(privileges.items()):
        msg += struct.pack("<HI", k, v)

    # Build signing string
    sign_str = app_id.encode() + struct.pack("<I", ts_now) + struct.pack("<I", salt) + msg
    # HMAC-SHA256
    sig = hmac.new(app_cert.encode(), sign_str, hashlib.sha256).digest()

    # Pack final content
    content = struct.pack("<H", 1)  # version
    channel_bytes = channel.encode()
    content += struct.pack("<H", len(channel_bytes)) + channel_bytes
    uid_str = str(uid) if uid else ""
    content += struct.pack("<H", len(uid_str)) + uid_str.encode()
    content += struct.pack("<H", len(sig)) + sig
    content += struct.pack("<HII", ROLE_PUBLISHER, salt, ts_expire)
    for k, v in sorted(privileges.items()):
        content += struct.pack("<HI", k, v)

    return "007" + b64encode(content).decode()

@app.get("/api/agora/token", tags=["Calls"])
async def get_agora_token(channel: str, user_id: str = Depends(get_current_user_id)):
    try:
        token = _build_agora_token(AGORA_APP_ID, AGORA_APP_CERTIFICATE, channel)
        return {"token": token, "app_id": AGORA_APP_ID, "channel": channel}
    except Exception as e:
        logger.error(f"Agora token error: {e}")
        return {"token": AGORA_APP_ID, "app_id": AGORA_APP_ID, "channel": channel}'''

if old in c:
    open(path, "w", encoding="utf-8").write(c.replace(old, new))
    print("Done. Pure-Python Agora token builder installed.")
else:
    print("MATCH FAILED")
