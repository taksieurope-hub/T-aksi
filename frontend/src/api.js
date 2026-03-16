import axios from 'axios';
import { tokenStorage } from './config'; // Make sure this path is correct for your app

// Your dynamic URL configuration - robust and perfectly handles the slashes
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

// REQUEST INTERCEPTOR - Stripped of the language header that caused the 404
api.interceptors.request.use(
  (config) => {
    // Auth Logic - Get token from where you usually store it
    const token = tokenStorage.getToken(); 
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// RESPONSE INTERCEPTOR
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isTripRoute = error.config.url?.includes('/trips/') || error.config.url?.includes('/messages') || error.config.url?.includes('/chat') || error.config.url?.includes('/ride_messages');
      if (!skipLogout) {
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;