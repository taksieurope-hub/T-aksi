import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// PASTE YOUR CONFIG FROM GOOGLE FIREBASE CONSOLE HERE
const firebaseConfig = {
  apiKey: "AIzaSyB3wrgccG__NjjSvMJhCUThc_-Xmb-d5cI",
  authDomain: "t-aksi-eu.firebaseapp.com",
  projectId: "t-aksi-eu",
  storageBucket: "t-aksi-eu.firebasestorage.app",
  messagingSenderId: "104412332504",
  appId: "1:104412332504:web:c7250c1b64e84bfe22b2ad",
  measurementId: "G-LFPQL2X6CK"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

export const VAPID_KEY = "BHmfgkpDYPYuaDetgLuyeCqLuw6ih1-HxIF99kpWOYb7h_RblUH13RuebbWzXO94vJqBXCf8XcEY92o9ZFZQum0";

export const registerFCMToken = async (apiInstance) => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await apiInstance.post("/auth/fcm-token", { token });
      console.log("FCM token registered:", token.slice(0, 20) + "...");
      return token;
    }
  } catch (err) {
    console.error("FCM registration failed:", err);
  }
  return null;
};

export const onForegroundMessage = (callback) => {
  return onMessage(messaging, callback);
};
