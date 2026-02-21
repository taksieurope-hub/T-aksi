// frontend/src/api.js
import axios from "axios";
import { API } from "./config.jsx";
import { auth } from "./lib/firebase";

// Make sure API never ends with a slash
const BASE = (API || "").replace(/\/+$/, "");

const api = axios.create({
  baseURL: BASE,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  if (auth && auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      // token invalid/expired
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // Optional: Force reload to login
      // window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

export default api;