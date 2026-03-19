path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = ('                "content": f"Translate each message to {target_lang}. Keep the same order, separated by ---. Only return translations, nothing else:\\n\\n{combined}"')
new = ('                "content": f"Translate each message to {target_lang}. If a message is already in {target_lang}, return it unchanged. Keep the same order, separated by ---. Only return the translated/unchanged messages, nothing else:\\n\\n{combined}"')

if old in c:
    c = c.replace(old, new)
    print("OK: translation handles already-correct language")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
