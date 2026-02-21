import axios from 'axios';
import { auth } from './lib/firebase'; 

const api = axios.create({
  // Clean, proper string formatting
  baseURL: import.meta.env.VITE_API_URL || 'https://t-aksi.onrender.com/api',
});

api.interceptors.request.use(async (config) => {
  try {
    await auth.authStateReady(); 
    const user = auth.currentUser;
    
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error("Firebase token error:", error);
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;