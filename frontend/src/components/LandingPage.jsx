import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Car, Users, Shield, Rocket, Zap, Globe } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext"; 
import LanguageSelector from "@/i18n/LanguageSelector";

// âŒ NO IMPORT HERE. The file is in public, so we don't import it.

const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const vehicleTypes = [
    { name: t('vehicle_economy'), icon: "ðŸš—", price: "â‚¾2.00", desc: t('vehicle_economy_desc') },
    { name: t('vehicle_comfort'), icon: "ðŸš™", price: "â‚¾2.50", desc: t('vehicle_comfort_desc') },
    { name: t('vehicle_xl'), icon: "ðŸš", price: "â‚¾3.90", desc: t('vehicle_xl_desc') },
    { name: t('vehicle_personal'), icon: "ðŸ‘¤", price: "â‚¾4.00", desc: t('vehicle_personal_desc') },
    { name: t('vehicle_jumpstart'), icon: "âš¡", price: "â‚¾4.50", desc: t('vehicle_jumpstart_desc') },
  ];

  const stats = [
    { value: "10K+", label: t('stat_rides') },
    { value: "500+", label: t('stat_pilots') },
    { value: "4.9", label: t('stat_rating') },
    { value: "2min", label: t('stat_wait') },
  ];

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#00ff88]/10 via-transparent to-black pointer-events-none" />
        
        <header className="relative z-10 flex items-center justify-between p-6 max-w-7xl mx-auto">
          <div className="flex items-center space-x-3">
            <div className="w-14 h-14 overflow-hidden rounded-full border-2 border-[#00ff88]/30">
              {/* âœ… CORRECT TAG FOR PUBLIC FOLDER */}
              <img 
  src="/logo.png" 
  alt="T'aksi Logo" 
  className="w-full h-full object-cover" 
/>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight leading-none">{t('app_name')}</span>
              <span className="text-[10px] text-[#00ff88] uppercase tracking-[0.2em] mt-1">{t('app_tagline')}</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <LanguageSelector variant="ghost" />
            <Button variant="ghost" className="text-[#00d4ff] hover:text-white" onClick={() => navigate("/admin")}>
              <Shield className="w-4 h-4 mr-2" /> {t('admin')}
            </Button>
          </div>
        </header>

        <main className="relative z-10 max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-7xl font-black mb-6">
              <span className="bg-gradient-to-r from-[#00ff88] to-[#00d4ff] bg-clip-text text-transparent">{t('hero_title')}</span>
              <br />
              <span className="text-white">{t('hero_subtitle')}</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">{t('hero_desc')}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold text-lg px-8 py-6" onClick={() => navigate("/rider")}>
                <Users className="w-5 h-5 mr-2" /> {t('book_ride')}
              </Button>
              <Button size="lg" variant="outline" className="border-[#00d4ff] text-[#00d4ff] font-bold text-lg px-8 py-6" onClick={() => navigate("/driver")}>
                <Car className="w-5 h-5 mr-2" /> {t('become_pilot')}
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-20">
            <Card className="bg-black/60 border border-[#00ff88]/20"><CardHeader><div className="w-14 h-14 rounded-xl bg-gradient-to-r from-[#00ff88]/20 to-transparent flex items-center justify-center mb-4"><Zap className="w-7 h-7 text-[#00ff88]" /></div><CardTitle className="text-[#00ff88]">{t('lightning_fast')}</CardTitle><CardDescription className="text-gray-400">{t('lightning_fast_desc')}</CardDescription></CardHeader></Card>
            <Card className="bg-black/60 border border-[#00d4ff]/20"><CardHeader><div className="w-14 h-14 rounded-xl bg-gradient-to-r from-[#00d4ff]/20 to-transparent flex items-center justify-center mb-4"><Globe className="w-7 h-7 text-[#00d4ff]" /></div><CardTitle className="text-[#00d4ff]">{t('fair_pricing')}</CardTitle><CardDescription className="text-gray-400">{t('fair_pricing_desc')}</CardDescription></CardHeader></Card>
            <Card className="bg-black/60 border border-purple-500/20"><CardHeader><div className="w-14 h-14 rounded-xl bg-gradient-to-r from-purple-500/20 to-transparent flex items-center justify-center mb-4"><Shield className="w-7 h-7 text-purple-400" /></div><CardTitle className="text-purple-400">{t('safe_secure')}</CardTitle><CardDescription className="text-gray-400">{t('safe_secure_desc')}</CardDescription></CardHeader></Card>
          </div>

          <div className="mt-20">
            <h2 className="text-3xl font-bold text-center mb-10">{t('choose_spacecraft')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {vehicleTypes.map((type) => (
                <Card key={type.name} className="bg-black/40 border border-white/10 hover:border-[#00ff88]/50 text-center p-4">
                  <div className="text-4xl mb-2">{type.icon}</div>
                  <div className="font-bold text-white">{type.name}</div>
                  <div className="text-[#00ff88] font-bold">{type.price}</div>
                  <div className="text-xs text-gray-500">{type.desc}</div>
                </Card>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
