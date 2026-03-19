path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()

new_block = [
    'AGORA_APP_ID = "952b4fa249fe44e08b64836a9f6c2a43"',
    'AGORA_APP_CERTIFICATE = os.environ.get("AGORA_APP_CERTIFICATE", "6fe49d41759a4319be3ee5768188c326")',
    '',
    'def _build_agora_token(app_id, app_cert, channel, uid=0, expire_seconds=3600):',
    '    """Pure-Python Agora RTC token builder - no third-party package needed."""',
    '    import hmac as _hmac, hashlib, struct, random',
    '    from base64 import b64encode',
    '    import time as _time',
    '    ts_now = int(_time.time())',
    '    ts_expire = ts_now + expire_seconds',
    '    salt = random.randint(1, 0x7FFFFFFF)',
    '    privileges = {1: ts_expire, 2: ts_expire, 3: ts_expire, 4: ts_expire, 5: ts_expire, 6: ts_expire, 7: ts_expire}',
    '    msg = struct.pack("<HII", 1, salt, ts_expire)',
    '    for k, v in sorted(privileges.items()):',
    '        msg += struct.pack("<HI", k, v)',
    '    sign_str = app_id.encode() + struct.pack("<I", ts_now) + struct.pack("<I", salt) + msg',
    '    sig = _hmac.new(app_cert.encode(), sign_str, hashlib.sha256).digest()',
    '    content = struct.pack("<H", 1)',
    '    cb = channel.encode()',
    '    content += struct.pack("<H", len(cb)) + cb',
    '    uid_str = str(uid) if uid else ""',
    '    content += struct.pack("<H", len(uid_str)) + uid_str.encode()',
    '    content += struct.pack("<H", len(sig)) + sig',
    '    content += struct.pack("<HII", 1, salt, ts_expire)',
    '    for k, v in sorted(privileges.items()):',
    '        content += struct.pack("<HI", k, v)',
    '    return "007" + b64encode(content).decode()',
    '',
    '@app.get("/api/agora/token", tags=["Calls"])',
    'async def get_agora_token(channel: str, user_id: str = Depends(get_current_user_id)):',
    '    try:',
    '        token = _build_agora_token(AGORA_APP_ID, AGORA_APP_CERTIFICATE, channel)',
    '        return {"token": token, "app_id": AGORA_APP_ID, "channel": channel}',
    '    except Exception as e:',
    '        logger.error(f"Agora token error: {e}")',
    '        return {"token": AGORA_APP_ID, "app_id": AGORA_APP_ID, "channel": channel}',
]

# Replace lines 1284-1312 (0-indexed: 1283-1311) with new block
result = lines[:1283] + new_block + lines[1313:]
open(path, "w", encoding="utf-8").write("\n".join(result) + "\n")
print("Done. Pure-Python Agora token builder installed.")
print(f"Lines replaced: 1284-1312 -> {len(new_block)} lines")
