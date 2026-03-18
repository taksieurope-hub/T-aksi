path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=safe_data,
            token=token,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(sound="default", default_vibrate_timings=True),
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(aps=messaging.Aps(sound="default", badge=1)),
            ),
        )'''

new = '''        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=safe_data,
            token=token,
            android=messaging.AndroidConfig(
                priority="high",
                ttl=60,
                notification=messaging.AndroidNotification(
                    sound="ride_alert",
                    default_vibrate_timings=False,
                    vibrate_timings=[0.5, 0.3, 0.5, 0.3, 0.5],
                    priority=messaging.AndroidNotificationPriority.MAX,
                    visibility=messaging.AndroidNotificationVisibility.PUBLIC,
                    notification_count=1,
                    sticky=True,
                    local_only=False,
                ),
            ),
            apns=messaging.APNSConfig(
                headers={"apns-priority": "10", "apns-push-type": "alert"},
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound=messaging.CriticalSound(name="ride_alert.wav", critical=1, volume=1.0),
                        badge=1,
                        content_available=True,
                    )
                ),
            ),
        )'''

if old in c:
    c = c.replace(old, new)
    print("OK: push upgraded to maximum priority")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Done!")
