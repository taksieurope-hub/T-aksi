import { clientsClaim } from "workbox-core";

clientsClaim();
self.skipWaiting();

// Cache essential assets
self.__WB_MANIFEST;

// ===== PUSH NOTIFICATION HANDLER =====
self.addEventListener("push", function (event) {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch (e) { payload = { notification: { title: "New Ride", body: event.data.text() } }; }

  const data = payload.data || {};
  const notif = payload.notification || {};
  const isRideRequest = data.type === "ride_request";

  const options = {
    body: notif.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    data: data,
    requireInteraction: isRideRequest,
    silent: false,
    vibrate: isRideRequest ? [500, 300, 500, 300, 500, 300, 800] : [200],
    actions: isRideRequest
      ? [
          { action: "accept", title: "✅ Accept" },
          { action: "decline", title: "❌ Decline" },
        ]
      : [],
    tag: isRideRequest ? "ride-request" : "taksi-notification",
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(notif.title || "T'aksi", options)
  );
});

// ===== NOTIFICATION CLICK HANDLER =====
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === "accept" && data.ride_id) {
    event.waitUntil(
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(function (clientList) {
          for (let client of clientList) {
            if (client.url.includes("/driver") && "focus" in client) {
              client.focus();
              client.postMessage({ type: "ACCEPT_RIDE", ride_id: data.ride_id });
              return;
            }
          }
          return clients.openWindow("/driver/dashboard?accept=" + data.ride_id);
        })
    );
  } else if (event.action === "decline" && data.ride_id) {
    event.waitUntil(
      fetch("/api/rides/" + data.ride_id + "/decline", { method: "POST" })
    );
  } else {
    event.waitUntil(
      clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then(function (clientList) {
          for (let client of clientList) {
            if ("focus" in client) { client.focus(); return; }
          }
          return clients.openWindow("/driver/dashboard");
        })
    );
  }
});

// ===== MESSAGE HANDLER (accept from app) =====
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
