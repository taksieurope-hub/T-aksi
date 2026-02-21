import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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