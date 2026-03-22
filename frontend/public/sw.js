const CACHE_VERSION = "taksi-v6";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // ALWAYS go to network - never serve from cache for any request
  // Cache is only used when network fails (offline)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch (e) { payload = { notification: { title: "T'aksi", body: event.data.text() } }; }
  const data = payload.data || {};
  const notif = payload.notification || {};
  const isRideRequest = data.type === "ride_request";
  event.waitUntil(
    self.registration.showNotification(notif.title || "T'aksi", {
      body: notif.body || "",
      icon: "/logo192.png",
      badge: "/logo192.png",
      data: data,
      requireInteraction: isRideRequest,
      vibrate: isRideRequest ? [500, 300, 500, 300, 800] : [200],
      actions: isRideRequest
        ? [{ action: "accept", title: "Accept" }, { action: "decline", title: "Decline" }]
        : [],
      tag: isRideRequest ? "ride-request" : "taksi-notification",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (event.action === "accept" && data.ride_id) {
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
        for (const client of list) {
          if (client.url.includes("/driver") && "focus" in client) {
            client.focus();
            client.postMessage({ type: "ACCEPT_RIDE", ride_id: data.ride_id });
            return;
          }
        }
        return clients.openWindow("/driver/dashboard?accept=" + data.ride_id);
      })
    );
  } else {
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
        for (const client of list) {
          if ("focus" in client) { client.focus(); return; }
        }
        return clients.openWindow("/");
      })
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
