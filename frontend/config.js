import { createContext, useContext } from "react";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ==========================================
// 1. API & APP CONTEXT
// ==========================================
export const API = import.meta.env.VITE_API_URL || "https://t-aksi.onrender.com/api";
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// ==========================================
// 2. FIREBASE INITIALIZATION
// ==========================================
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

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);