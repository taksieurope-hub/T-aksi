import { createContext, useContext } from "react";
export const API = import.meta.env.VITE_API_URL || "https://t-aksi.onrender.com/api";
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
