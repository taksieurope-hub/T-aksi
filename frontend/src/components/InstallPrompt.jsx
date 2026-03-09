import React, { useState, useEffect } from 'react';
import { Share, PlusSquare, X, Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';

const InstallPrompt = () => {
  const { t } = useLanguage();
  const [isReadyForInstall, setIsReadyForInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true); // Assume installed until proven otherwise
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // 1. Check if the app is ALREADY installed
    const isAppInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    setIsStandalone(isAppInstalled);

    if (isAppInstalled) return; // If already installed, do nothing!

    // 2. Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isAppleDevice);

    // 3. If iOS, show the prompt automatically after 2 seconds
    if (isAppleDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 2000);
      return () => clearTimeout(timer);
    }

    // 4. If Android/Chrome, wait for the native browser trigger
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault(); // Stop Chrome from showing the tiny default bar
      setDeferredPrompt(e); // Save the event so we can trigger it later
      setIsReadyForInstall(true);
      setShowPrompt(true); // Show our massive custom screen
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the native Android install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    // Clear the prompt so it can only be used once
    setDeferredPrompt(null);
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    // Optional: Save to localStorage here so you don't annoy them every single time
    // localStorage.setItem('hasSeenInstallPrompt', 'true');
  };

  // If installed, or told not to show, render nothing
  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-end sm:justify-center p-4 pb-12 sm:pb-4 animate-in fade-in duration-300">
      
      <div className="bg-[#1a1a2e] border border-[#00ff88]/50 rounded-3xl p-6 w-full max-w-sm shadow-[0_0_50px_rgba(0,255,136,0.2)] relative flex flex-col items-center text-center animate-in slide-in-from-bottom-10">
        
        {/* Dismiss Button */}
        <button 
          onClick={dismissPrompt}
          className="absolute top-4 right-4 text-gray-400 hover:text-white bg-black/50 rounded-full p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="w-20 h-20 bg-gradient-to-tr from-[#00ff88] to-[#00d4ff] rounded-2xl flex items-center justify-center mb-6 shadow-lg rotate-3">
          <Smartphone className="w-10 h-10 text-black -rotate-3" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">{t('install_app')}</h2>
        <p className="text-gray-400 text-sm mb-8 px-4">
          {t('install_app_desc')}
        </p>

        {/* ANDROID / CHROME BUTTON */}
        {!isIOS && isReadyForInstall && (
          <Button 
            onClick={handleInstallClick}
            className="w-full h-14 text-lg font-bold bg-[#00ff88] text-black hover:bg-[#00cc6a] rounded-xl mb-2"
          >
            <Download className="w-5 h-5 mr-2" /> {t('install_now')}
          </Button>
        )}

        {/* IOS / SAFARI INSTRUCTIONS */}
        {isIOS && (
          <div className="w-full bg-black/50 border border-gray-700 rounded-xl p-4 flex flex-col items-center">
            <p className="text-[#00ff88] font-bold mb-4">{t('how_to_install_ios')}</p>
            
            <div className="flex items-center text-sm text-white mb-4 w-full justify-center">
              <span className="bg-gray-800 rounded-full w-6 h-6 flex items-center justify-center mr-3 font-bold text-xs">1</span>
              {t('tap_to_rate')} <Share className="w-5 h-5 mx-2 text-blue-400" />
            </div>
            
            <div className="flex items-center text-sm text-white w-full justify-center">
              <span className="bg-gray-800 rounded-full w-6 h-6 flex items-center justify-center mr-3 font-bold text-xs">2</span>
              <PlusSquare className="w-5 h-5 mx-2 text-white" /> <strong>{t('add_to_home_screen')}</strong>
            </div>

            {/* Bouncing arrow pointing down to Safari's share menu */}
            <div className="mt-8 animate-bounce text-[#00ff88]">
              ↓
            </div>
          </div>
        )}

        <button onClick={dismissPrompt} className="mt-4 text-xs text-gray-500 underline">
          {t('continue_in_browser')}
        </button>

      </div>
    </div>
  );
};

export default InstallPrompt;