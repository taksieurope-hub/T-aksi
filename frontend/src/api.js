import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  // Pulls the current language from storage and tells the server
  const lang = localStorage.getItem('taksi_language') || 'ka';
  config.headers['Accept-Language'] = lang;
  return config;
});

export default api;