import { createContext, useContext } from "react";

export const BACKEND_URL = import.meta.env.PROD 
  ? "https://t-aksi.onrender.com" 
  : "http://localhost:8000";

// FIX: Removed the invalid ${} syntax. Now it is standard string concatenation.
export const API = BACKEND_URL + "/api";
export const GOOGLE_MAPS_API_KEY = "AIzaSyC2gkANH8GJOZNDdibTCKNEOWiuf580bxA"; 

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
