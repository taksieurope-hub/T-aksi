// firebase-messaging-sw.js
// Place this file in your /public folder

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB3wrgccG__NjjSvMJhCUThc_-Xmb-d5cI",
  authDomain: "t-aksi-eu.firebaseapp.com",
  projectId: "t-aksi-eu",
  storageBucket: "t-aksi-eu.firebasestorage.app",
  messagingSenderId: "104412332504",
  appId: "1:104412332504:web:c7250c1b64e84bfe22b2ad",
});

const messaging = firebase.messaging();

// Handle background messages (when app is not in focus)
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon, data } = payload.notification || {};
  const notifData = payload.data || {};

  const notificationTitle = title || "T'aksi";
  const notificationOptions = {
    body: body || '',
    icon: icon || '/logo.png',
    badge: '/logo.png',
    tag: notifData.ride_id || 'taksi-notification',   // collapses duplicate notifications
    renotify: true,
    vibrate: [200, 100, 200],
    data: notifData,
    actions: getActions(notifData.type),
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Tap on notification — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  if (data.type === 'ride_request')    url = '/driver';
  if (data.type === 'ride_accepted')   url = '/rider';
  if (data.type === 'driver_arrived')  url = '/rider';
  if (data.type === 'ride_completed')  url = '/rider';
  if (data.type === 'support_reply')   url = data.user_type === 'driver' ? '/driver' : '/rider';
  if (data.type === 'withdrawal_approved') url = '/driver';
  if (data.type === 'campaign_completed')  url = '/driver';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', data });
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

function getActions(type) {
  if (type === 'ride_request') {
    return [
      { action: 'accept', title: '✅ Accept' },
      { action: 'decline', title: '❌ Decline' },
    ];
  }
  return [];
}