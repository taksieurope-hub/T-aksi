import { useEffect, useMemo, useState } from "react";
import "@/App.css";
import axios from "axios";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import { getTranslation, SUPPORTED_LANGUAGES } from "@/lib/i18n";

// 🚀 THE FIX: We removed the environment variables! 
// Since frontend and backend are on the exact same server, we just use a relative path.
const API = "https://your-real-python-backend-url.onrender.com/api";

const Home = () => {
  const { language, setLanguage, isRtl } = useLanguagePreference();
  const t = useMemo(() => getTranslation(language), [language]);
  const [backendMessage, setBackendMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true; // Prevents glitches if users switch languages quickly

    const fetchHelloWorld = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await axios.get(`${API}/`, {
          params: { lang: language },
          headers: {
            "Accept-Language": language,
          },
        });

        if (isMounted) {
          setBackendMessage(response.data.message);
        }
      } catch (e) {
        console.error(e, `errored out requesting /api`);
        if (isMounted) {
          setErrorMessage(t.backendError);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchHelloWorld();

    return () => {
      isMounted = false;
    };
  }, [language, t.backendError]);

  return (
    <main className={`app-shell ${isRtl ? "rtl" : ""}`} data-testid="home-page">
      <header className="App-header" data-testid="app-header">
        <div className="language-controls" data-testid="language-controls">
          <label htmlFor="language-select" data-testid="language-select-label">
            {t.languageLabel}
          </label>

          <select
            id="language-select"
            className="language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            data-testid="language-selector"
          >
            {SUPPORTED_LANGUAGES.map((languageOption) => (
              <option
                key={languageOption.code}
                value={languageOption.code}
                data-testid={`language-option-${languageOption.code}`}
              >
                {languageOption.label}
              </option>
            ))}
          </select>
        </div>

        <a
          className="App-link"
          href="https://emergent.sh"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="emergent-home-link"
        >
          <img
            src="https://avatars.githubusercontent.com/in/1201222?s=120&u=2686cf91179bbafbc7a71bfbc43004cf9ae1acea&v=4"
            alt="Emergent"
            className="hero-logo"
            data-testid="hero-logo"
          />
        </a>

        <h1 className="headline" data-testid="headline-text">
          {t.headline}
        </h1>

        <p className="description" data-testid="description-text">
          {t.description}
        </p>

        <section className="backend-status" data-testid="backend-status-section">
          <h2 data-testid="backend-status-title">{t.backendStatusLabel}</h2>

          {isLoading ? (
            <p data-testid="backend-message-loading">{t.loading}</p>
          ) : null}

          {!isLoading && errorMessage ? (
            <p className="error-text" data-testid="backend-message-error">
              {errorMessage}
            </p>
          ) : null}

          {!isLoading && !errorMessage ? (
            <p data-testid="backend-message-text">{backendMessage}</p>
          ) : null}
        </section>
      </header>
    </main>
  );
};

function App() {
  // 🛡️ THE CACHE BUSTER 🛡️
  // This listens for the exact errors that cause the "Black Screen of Death"
  useEffect(() => {
    const handleGlobalError = (event) => {
      const errorMsg = event.message || "";
      if (
        errorMsg.includes("Failed to fetch dynamically imported module") || 
        errorMsg.includes("Importing a module script failed") ||
        errorMsg.includes("ChunkLoadError")
      ) {
        console.warn("Old cache detected. Forcing a silent hard reload...");
        // This forces the user's phone to instantly wipe the old cache and reload
        window.location.reload(true); 
      }
    };

    window.addEventListener('error', handleGlobalError);
    return () => window.removeEventListener('error', handleGlobalError);
  }, []);

  return <Home />;
}

export default App;