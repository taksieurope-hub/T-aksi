import axios from 'axios';

// 🛠️ HARD-FIX: Added /api to the URL so it finds the backend again.
const api = axios.create({
  baseURL: 'https://t-aksi.onrender.com/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  // 1. Auth Logic - Get token from where you usually store it
  const token = localStorage.getItem('taksi_token'); 
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // 🌍 2. The Language Sync - Tells the server to send Georgian/Russian/etc.
  const lang = localStorage.getItem('taksi_language') || 'ka';
  config.headers['Accept-Language'] = lang;
  
  return config;
}, (error) => Promise.reject(error));

export default api;