import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, Users, Shield, Rocket, Zap, Globe } from "lucide-react";
import { useLanguage } from "@/App";
import LanguageSelector from "@/i18n/LanguageSelector";

const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  // FIX: Define data arrays INSIDE the component so they can use 't()'
  const vehicleTypes = [
    { name: t('vehicle_economy'), icon: "🚗", price: "₾2.00", desc: t('vehicle_economy_desc') },
    { name: t('vehicle_comfort'), icon: "🚙", price: "₾2.50", desc: t('vehicle_comfort_desc') },
    { name: t('vehicle_xl'), icon: "🚐", price: "₾3.90", desc: t('vehicle_xl_desc') },
    { name: t('vehicle_personal'), icon: "👤", price: "₾4.00", desc: t('vehicle_personal_desc') },
    { name: t('vehicle_jumpstart'), icon: "⚡", price: "₾4.50", desc: t('vehicle_jumpstart_desc') },
  ];

  const stats = [
    { value: "10K+", label: t('stat_rides') },
    { value: "500+", label: t('stat_pilots') },
    { value: "4.9", label: t('stat_rating') },
    { value: "2min", label: t('stat_wait') },
  ];

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Hero Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#00ff88]/10 via-transparent to-black pointer-events-none" />
        
        {/* Header */}
        <header className="relative z-10 flex items-center justify-between p-6 max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <div className="w-14 h-14 overflow-hidden rounded-full border-2 border-[#00ff88]/30">
              <img 
                src="/logo.png" 
                alt="T'aksi Logo" 
                className="w-full h-full object-cover"
                onError={(e) => e.target.src = "https://via.placeholder.com/150?text=TAKSI"} 
              />
            </div>
            
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight leading-none">{t('app_name')}</span>
              <span className="text-[10px] text-[#00ff88] uppercase tracking-[0.2em] mt-1">{t('app_tagline')}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <LanguageSelector variant="ghost" />
            <Button 
              variant="ghost" 
              className="text-[#00d4ff] hover:text-white hover:bg-[#00d4ff]/20"
              onClick={() => navigate("/admin")}
            >
              <Shield className="w-4 h-4 mr-2" />
              {t('admin')}
            </Button>
          </div>
        </header>

        {/* Hero Content */}
        <main className="relative z-10 max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-7xl font-black mb-6">
              <span className="bg-gradient-to-r from-[#00ff88] to-[#00d4ff] bg-clip-text text-transparent">
                {t('hero_title')}
              </span>
              <br />
              <span className="text-white">{t('hero_subtitle')}</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
              {t('hero_desc')}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg"
                className="bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold text-lg px-8 py-6 hover:opacity-90 transition-all hover:scale-105"
                onClick={() => navigate("/rider")}
              >
                <Users className="w-5 h-5 mr-2" />
                {t('book_ride')}
              </Button>
              <Button 
                size="lg"
                variant="outline"
                className="border-[#00d4ff] text-[#00d4ff] hover:bg-[#00d4ff]/20 font-bold text-lg px-8 py-6"
                onClick={() => navigate("/driver")}
              >
                <Car className="w-5 h-5 mr-2" />
                {t('become_pilot')}
              </Button>
            </div>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 mt-20">
            <Card className="bg-black/60 backdrop-blur-xl border border-[#00ff88]/20 hover:border-[#00ff88]/50 transition-all group">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-[#00ff88]/20 to-transparent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Zap className="w-7 h-7 text-[#00ff88]" />
                </div>
                <CardTitle className="text-[#00ff88]">{t('lightning_fast')}</CardTitle>
                <CardDescription className="text-gray-400">
                  {t('lightning_fast_desc')}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-black/60 backdrop-blur-xl border border-[#00d4ff]/20 hover:border-[#00d4ff]/50 transition-all group">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-[#00d4ff]/20 to-transparent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Globe className="w-7 h-7 text-[#00d4ff]" />
                </div>
                <CardTitle className="text-[#00d4ff]">{t('fair_pricing')}</CardTitle>
                <CardDescription className="text-gray-400">
                  {t('fair_pricing_desc')}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-black/60 backdrop-blur-xl border border-purple-500/20 hover:border-purple-500/50 transition-all group">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-purple-500/20 to-transparent flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Shield className="w-7 h-7 text-purple-400" />
                </div>
                <CardTitle className="text-purple-400">{t('safe_secure')}</CardTitle>
                <CardDescription className="text-gray-400">
                  {t('safe_secure_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 py-10 border-t border-b border-[#00ff88]/10">
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center">
                 {/* Color logic kept simple for brevity, adjust classes as needed */}
                <div className={`text-4xl font-black ${idx === 0 ? 'text-[#00ff88]' : idx === 1 ? 'text-[#00d4ff]' : idx === 2 ? 'text-purple-400' : 'text-yellow-400'}`}>
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Vehicle Types */}
          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center mb-10">{t('choose_spacecraft')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {vehicleTypes.map((type) => (
                <Card key={type.name} className="bg-black/40 border border-white/10 hover:border-[#00ff88]/50 transition-all text-center p-4 cursor-pointer">
                  <div className="text-4xl mb-2">{type.icon}</div>
                  <div className="font-bold text-white">{type.name}</div>
                  <div className="text-[#00ff88] font-bold">{type.price}</div>
                  <div className="text-xs text-gray-500">{type.desc}</div>
                </Card>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/10 py-10 mt-20">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center">
                <Rocket className="w-5 h-5 text-black" />
              </div>
              <span className="text-xl font-black">T'aksi Galactic</span>
            </div>
            <p className="text-gray-500 text-sm">
              © 2025 T'aksi. {t('rights_reserved')}
            </p>
            <div className="flex justify-center space-x-6 mt-4 text-sm text-gray-600">
              <a href="#" className="hover:text-[#00ff88]">{t('terms')}</a>
              <a href="#" className="hover:text-[#00ff88]">{t('privacy')}</a>
              <a href="#" className="hover:text-[#00ff88]">{t('refunds')}</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;