import { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";

// Safely handle environment variables in Vite to prevent crashes
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || ""; 
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const helloWorldApi = async () => {
    try {
      if (!API.startsWith('http')) return; // Prevent bad requests if env is missing
      const response = await axios.get(`${API}/`);
      console.log(response.data.message);
    } catch (e) {
      console.error(e, `errored out requesting / api`);
    }
  };

  useEffect(() => {
    helloWorldApi();
  }, []);

  return (
    <div 
      className="min-h-screen relative flex items-center justify-center bg-[#000000] bg-center bg-no-repeat bg-cover"
      style={{ backgroundImage: `url('/pwa-512x512.png')` }} 
    >
      <div className="absolute inset-0 bg-black/80 z-0"></div>

      <header className="relative z-10 flex flex-col items-center text-center p-6">
        <h1 className="text-5xl font-bold text-white mb-2">T'aksi</h1>
        <p className="mt-5 text-[#00ff88] text-lg font-medium">Building something incredible ~!</p>
        
        <div className="flex gap-4 mt-8">
          <a href="/rider" className="px-6 py-3 bg-[#00ff88] text-black font-bold rounded-xl hover:scale-105 transition-transform">
            Rider App
          </a>
          <a href="/driver" className="px-6 py-3 bg-white/10 text-white font-bold rounded-xl border border-white/20 hover:bg-white/20 transition-colors">
            Driver App
          </a>
        </div>
      </header>
    </div>
  );
};

function App() {
  return (
    <PayPalScriptProvider
      options={{
        "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "sb",
        currency: "USD",
        components: "buttons,card-fields",
        vault: true
      }}
    >
      <BrowserRouter>
        <Routes>
          {/* Fixed the routing bug here */}
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </PayPalScriptProvider>
  );
}

export default App;