import axios from 'axios';
import { auth } from './lib/firebase'; 

const api = axios.create({
  baseURL: 'https://t-aksi.onrender.com/api'
});

api.interceptors.request.use(async (config) => {
  try {
    await auth.authStateReady(); 
    const user = auth.currentUser;
    
    if (user) {
      const token = await user.getIdToken();
      // 👇 ADD THIS LINE to see if the token exists
      console.log("✅ TOKEN FOUND AND ATTACHED"); 
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      // 👇 ADD THIS LINE to see if it's missing
      console.log("❌ NO USER LOGGED IN - SENDING EMPTY REQUEST"); 
    }
  } catch (error) {
    console.error("Firebase token error:", error);
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;