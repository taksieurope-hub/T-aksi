path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '    # Translate messages not sent by this user if language is not English\n    if user_lang != "en" and len(messages) > 0:'
new = '    # Translate messages not sent by this user into the reader\'s language\n    if len(messages) > 0:'

if old in c:
    c = c.replace(old, new)
    print("OK: translation now works for all language combinations")
else:
    print("MISS - trying alternate")
    idx = c.find("Translate messages not sent by this user")
    if idx != -1:
        print(repr(c[idx-5:idx+100]))

open(path, "w", encoding="utf-8", newline="\n").write(c)
