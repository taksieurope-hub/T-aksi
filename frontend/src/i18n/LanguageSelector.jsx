// src/i18n/LanguageSelector.jsx
import { useLanguage } from './LanguageContext';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";


const flagEmojis = {
  ka: '🇬🇪',
  en: '🇺🇸',
  ru: '🇷🇺',
  hi: '🇮🇳',
  zh: '🇨🇳',
  nl: '🇳🇱',
  fr: '🇫🇷',
  de: '🇩🇪',
  pl: '🇵🇱',
  af: '🇿🇦',
  zu: '🇿🇦',
  xh: '🇿🇦'
};

const LanguageSelector = ({ variant = "default" }) => {
  const { language, setLanguage, languages, t } = useLanguage();

  const flag = flagEmojis[language] || '🌍';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "default" ? (
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full p-0 border-[#00d4ff]/20 hover:bg-[#00d4ff]/10">
            <span className="text-lg">{flag}</span>
            <span className="sr-only">{t('select_language')}</span>
          </Button>
        ) : (
          <Button variant="ghost" className="flex items-center gap-2 text-[#00ff88] hover:text-[#00d4ff]">
            <Globe className="h-5 w-5" />
            {languages[language]}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-48 bg-[#07070f]/95 backdrop-blur-md border border-[#00d4ff]/20 rounded-xl shadow-2xl"
      >
        {Object.entries(languages).map(([code, name]) => (
          <DropdownMenuItem 
            key={code} 
            onClick={() => setLanguage(code)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium cursor-pointer 
              ${language === code ? 'bg-[#00d4ff]/20 text-[#00ff88]' 
                : 'text-white hover:bg-[#00d4ff]/10'
            }`}
          >
            <span className="mr-2">{flagEmojis[code]}</span>
            {name}
            {language === code && <span className="ml-auto">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSelector;