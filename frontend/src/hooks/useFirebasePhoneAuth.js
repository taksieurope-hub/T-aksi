import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB3wrgccG__NjjSvMJhCUThc_-Xmb-d5cI",
  authDomain: "t-aksi-eu.firebaseapp.com",
  projectId: "t-aksi-eu",
  storageBucket: "t-aksi-eu.firebasestorage.app",
  messagingSenderId: "104412332504",
  appId: "1:104412332504:web:c7250c1b64e84bfe22b2ad",
};

function getFirebaseAuth() {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  return getAuth(app);
}

let confirmationResult = null;

export async function sendFirebaseOTP(phoneNumber) {
  const auth = getFirebaseAuth();
  if (window.recaptchaVerifier) {
    try { window.recaptchaVerifier.clear(); } catch (_) {}
  }
  window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {},
  });
  try {
    confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function verifyFirebaseOTP(code) {
  if (!confirmationResult) return { success: false, error: 'No OTP session. Request a new code.' };
  try {
    const result = await confirmationResult.confirm(code);
    const idToken = await result.user.getIdToken();
    return { success: true, idToken };
  } catch (err) {
    return { success: false, error: 'Incorrect code. Please try again.' };
  }
}