import axios from 'axios';
import { API, tokenStorage } from './config'; // or '@/config' if using absolute paths

/**
 * FIX 2.2: Axios instance updated to support both auth strategies:
 *
 * Cookie mode (default, production):
 * - withCredentials: true sends the httpOnly cookie automatically.
 * - No Authorization header set — the cookie IS the credential.
 * - JS never reads the token, so XSS cannot steal it.
 *
 * localStorage fallback (VITE_USE_LOCALSTORAGE_FALLBACK=true):
 * - Legacy behavior: reads token from localStorage, sets Bearer header.
 * - Use only temporarily while migrating the backend to send Set-Cookie.
 */
const api = axios.create({
  baseURL: API, // Dynamically switches between Render and Localhost
  
  // Sends the httpOnly session cookie on every request (cookie mode).
  // Has no effect in localStorage fallback mode.
  withCredentials: true,
});

// REQUEST INTERCEPTOR
api.interceptors.request.use(
  (config) => {
    // Legacy path: attach Bearer token from localStorage if fallback is active.
    const token = tokenStorage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Cookie mode: no header needed — browser attaches the cookie automatically.
    return config;
  },
  (error) => Promise.reject(error)
);

// RESPONSE INTERCEPTOR
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Check if the error is a 401
    if (error.response?.status === 401) {
      
      // OPTION A: Don't log out if we're in the middle of a trip update
      const isTripRoute = error.config.url.includes('/trips/');
      
      if (isTripRoute) {
        console.warn("401 on trip update - ignoring global logout to prevent state loss");
      } else {
        // Only boot them for other 401s (like unauthorized dashboard access)
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;