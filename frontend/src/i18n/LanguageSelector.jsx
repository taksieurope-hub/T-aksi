import { useLanguage } from './LanguageContext';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LanguageSelector = ({ variant = "default" }) => {
  const { language, setLanguage, languages, t } = useLanguage();

  const flagEmojis = {
    ka: "🇬🇪",
    en: "🇬🇧",
    ru: "🇷🇺",
    hi: "🇮🇳",
    zh: "🇨🇳",
    nl: "🇳🇱",
    fr: "🇫🇷",
    de: "🇩🇪",
    pl: "🇵🇱",
    af: "🇿🇦",
    zu: "🇿🇦",
    xh: "🇿🇦"
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={variant === "ghost" ? "ghost" : "outline"} 
          size="sm"
          className={variant === "ghost" 
            ? "text-[#00d4ff] hover:text-white hover:bg-[#00d4ff]/20" 
            : "border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10"
          }
        >
          <Globe className="w-4 h-4 mr-2" />
          <span className="mr-1">{flagEmojis[language]}</span>
          <span className="hidden sm:inline">{languages[language]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="bg-black/95 border border-[#00d4ff]/30 backdrop-blur-xl"
        align="end"
      >
        {Object.entries(languages).map(([code, name]) => (
          <DropdownMenuItem
            key={code}
            onClick={() => setLanguage(code)}
            className={`cursor-pointer ${
              language === code 
                ? 'bg-[#00d4ff]/20 text-[#00ff88]' 
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
