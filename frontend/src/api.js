import axios from 'axios';

const api = axios.create({
  baseURL: 'https://t-aksi.onrender.com/api'
});

api.interceptors.request.use((config) => {
  // Grab the actual token your backend generated during login
  const token = localStorage.getItem('token'); 
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;