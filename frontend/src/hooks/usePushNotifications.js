// src/hooks/usePushNotifications.js
// Drop this in src/hooks/ and call it once inside RiderPortal and DriverPortal

import { useEffect, useRef } from 'react';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { initializeApp, getApps } from 'firebase/app';
import axios from 'axios';
import { toast } from 'sonner';

// ── Firebase config (same as config.jsx) ────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB3wrgccG__NjjSvMJhCUThc_-Xmb-d5cI",
  authDomain: "t-aksi-eu.firebaseapp.com",
  projectId: "t-aksi-eu",
  storageBucket: "t-aksi-eu.firebasestorage.app",
  messagingSenderId: "104412332504",
  appId: "1:104412332504:web:c7250c1b64e84bfe22b2ad",
};

// VITE_FIREBASE_VAPID_KEY must be set in your .env
// Get it from: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let messagingInstance = null;

function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * usePushNotifications
 *
 * @param {object} user         - The current user object from useAuth()
 * @param {function} onMessage  - Callback for foreground messages: (payload) => void
 *
 * Usage:
 *   usePushNotifications(user, (payload) => {
 *     if (payload.data?.type === 'ride_request') refetchRides();
 *   });
 */
export function usePushNotifications(user, onForegroundMessage) {
  const tokenSentRef = useRef(false);

  useEffect(() => {
    if (!user?.id || !VAPID_KEY) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    // Don't re-register if we already sent the token this session
    if (tokenSentRef.current) return;

    let unsubscribe = null;

    async function init() {
      try {
        // 1. Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // 2. Wait for service worker to be ready
        await navigator.serviceWorker.ready;

        // 3. Get FCM token
        const messaging = getMessagingInstance();
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });

        if (!token) return;

        // 4. Send token to backend (only if it's new)
        const storedToken = localStorage.getItem('fcm_token');
        if (token !== storedToken) {
          await axios.post('/api/users/fcm-token', { fcm_token: token });
          localStorage.setItem('fcm_token', token);
        }

        tokenSentRef.current = true;

        // 5. Handle foreground messages (app is open and focused)
        unsubscribe = onMessage(messaging, (payload) => {
          const { title, body } = payload.notification || {};
          const data = payload.data || {};

          // Show a toast for foreground messages
          showForegroundToast(title, body, data);

          // Call the portal-specific handler
          if (onForegroundMessage) onForegroundMessage(payload);
        });

      } catch (err) {
        // Silently fail — push notifications are enhancement, not critical
        console.warn('Push notification setup failed:', err.message);
      }
    }

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user?.id]);
}

function showForegroundToast(title, body, data) {
  const type = data?.type;

  if (type === 'ride_request') {
    toast(title || "New Ride Request", {
      description: body,
      duration: 15000,
      action: { label: 'View', onClick: () => {} },
    });
  } else if (type === 'ride_accepted') {
    toast.success(title || "Driver Found!", { description: body, duration: 8000 });
  } else if (type === 'driver_arrived') {
    toast.success(title || "Driver Arrived", { description: body, duration: 10000 });
  } else if (type === 'ride_completed') {
    toast.success(title || "Ride Complete", { description: body, duration: 6000 });
  } else if (type === 'withdrawal_approved') {
    toast.success(title || "Withdrawal Approved", { description: body, duration: 8000 });
  } else if (type === 'campaign_completed') {
    toast.success(title || "🎉 Bonus Earned!", { description: body, duration: 10000 });
  } else {
    toast(title || "T'aksi", { description: body, duration: 5000 });
  }
}