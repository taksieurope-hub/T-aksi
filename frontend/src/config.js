import { createContext, useContext } from "react";

// 1. Define Constants
export const API = import.meta.env.VITE_API_URL || "https://t-aksi.onrender.com/api";
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// 2. Create Context
export const AuthContext = createContext(null);

// 3. Export Hook
export const useAuth = () => useContext(AuthContext);