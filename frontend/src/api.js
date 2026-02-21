import axios from 'axios';
import { auth } from './lib/firebase'; // Make sure this path points to your new firebase.js file

const api = axios.create({
  // Ensure this points to your Render backend URL, not localhost
  baseURL: import.meta.env.VITE_API_URL || 'https://t-aksi.onrender.com'
});

api.interceptors.request.use(async (config) => {
  try {
    // 1. Force Axios to wait until Firebase knows who is logged in
    await auth.authStateReady(); 
    
    // 2. Get the user
    const user = auth.currentUser;
    
    if (user) {
      // 3. Grab the secure token and attach it to the headers
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