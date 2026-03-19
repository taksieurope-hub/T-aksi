# Add FCM messaging to firebase.js
path = "frontend/src/lib/firebase.js"
c = open(path, "r", encoding="utf-8").read()

old = 'import { initializeApp } from "firebase/app";\nimport { getAuth } from "firebase/auth";\nimport { getFirestore } from "firebase/firestore";'
new = 'import { initializeApp } from "firebase/app";\nimport { getAuth } from "firebase/auth";\nimport { getFirestore } from "firebase/firestore";\nimport { getMessaging, getToken, onMessage } from "firebase/messaging";'

if old in c:
    c = c.replace(old, new)
    print("OK: messaging import added")
else:
    print("MISS: imports")

old2 = 'export const auth = getAuth(app);\nexport const db = getFirestore(app);'
new2 = ('export const auth = getAuth(app);\n'
        'export const db = getFirestore(app);\n'
        'export const messaging = getMessaging(app);\n'
        '\n'
        'export const VAPID_KEY = "BHmfgkpDYPYuaDetgLuyeCqLuw6ih1-HxIF99kpWOYb7h_RblUH13RuebbWzXO94vJqBXCf8XcEY92o9ZFZQum0";\n'
        '\n'
        'export const registerFCMToken = async (apiInstance) => {\n'
        '  try {\n'
        '    const permission = await Notification.requestPermission();\n'
        '    if (permission !== "granted") {\n'
        '      console.log("Notification permission denied");\n'
        '      return null;\n'
        '    }\n'
        '    const token = await getToken(messaging, { vapidKey: VAPID_KEY });\n'
        '    if (token) {\n'
        '      await apiInstance.post("/auth/fcm-token", { token });\n'
        '      console.log("FCM token registered:", token.slice(0, 20) + "...");\n'
        '      return token;\n'
        '    }\n'
        '  } catch (err) {\n'
        '    console.error("FCM registration failed:", err);\n'
        '  }\n'
        '  return null;\n'
        '};\n'
        '\n'
        'export const onForegroundMessage = (callback) => {\n'
        '  return onMessage(messaging, callback);\n'
        '};\n')

if old2 in c:
    c = c.replace(old2, new2)
    print("OK: FCM exports added")
else:
    print("MISS: exports")

open(path, "w", encoding="utf-8", newline="\n").write(c)
