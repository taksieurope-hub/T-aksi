import axios from 'axios';

// Dynamic URL configuration - uses environment variable or falls back to localhost
const getBaseUrl = () => {
  let url = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  url = url.replace(/\/+$/, ''); // Remove trailing slashes
  if (!url.endsWith('/api')) url += '/api';
  return url;
};

const api = axios.create({
  baseURL: getBaseUrl(),
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