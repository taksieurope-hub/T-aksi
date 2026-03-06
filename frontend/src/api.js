import axios from 'axios';

// 🛠️ FIX: Added '/api' back to the baseURL so it stops hitting 404
const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || 'https://t-aksi.onrender.com/api') + '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  // 1. Auth Logic (from your previous working code)
  const token = localStorage.getItem('taksi_token'); // Ensure this matches your token key
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // 🌍 2. The Language Sync
  const lang = localStorage.getItem('taksi_language') || 'ka';
  config.headers['Accept-Language'] = lang;
  
  return config;
});

export default api;