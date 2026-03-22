// T'aksi Service Worker - no ES module imports (plain SW script)
const CACHE_VERSION = "taksi-v4";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Navigation requests - always go to network so refresh works
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Same-origin assets - cache first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
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
