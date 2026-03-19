path = "frontend/src/components/RideCommunication.jsx"
c = open(path, "r", encoding="utf-8-sig").read()
changes = []

# Fix 1: Update fetchMessages to handle translated_message
old = '      setMessages(newMsgs);'
new = ('      // Normalize sender_id to string for reliable comparison\n'
       '      const normalized = newMsgs.map(m => ({...m, sender_id: m.sender_id ? String(m.sender_id) : m.sender_id}));\n'
       '      setMessages(normalized);')
if old in c:
    c = c.replace(old, new)
    changes.append("OK: sender_id normalized to string")
else:
    changes.append("MISS: setMessages")

# Fix 2: Fix isMe check to always use string comparison
old2 = '                    const isMe = msg.sender_id && currentUserId ? String(msg.sender_id) === String(currentUserId) : (isDriver ? msg.sender_type === "driver" : msg.sender_type === "rider");'
new2 = '                    const isMe = msg.sender_id && currentUserId ? String(msg.sender_id) === String(currentUserId) : (isDriver ? msg.sender_type === "driver" || msg.sender_role === "driver" : msg.sender_type === "rider" || msg.sender_role === "rider");'
if old2 in c:
    c = c.replace(old2, new2)
    changes.append("OK: isMe check includes sender_role fallback")
else:
    changes.append("MISS: isMe check")

# Fix 3: Show translated message with toggle to see original
old3 = '                          {msg.message}'
new3 = ('                          {msg.translated_message ? (\n'
        '                            <>\n'
        '                              <span>{msg.translated_message}</span>\n'
        '                              <span style={{display:"block",fontSize:10,opacity:0.5,marginTop:3,fontStyle:"italic"}}>{msg.original_message}</span>\n'
        '                            </>\n'
        '                          ) : msg.message}')
if old3 in c:
    c = c.replace(old3, new3)
    changes.append("OK: translated message display added")
else:
    changes.append("MISS: message display")

# Write back with utf-8 (without BOM)
open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
