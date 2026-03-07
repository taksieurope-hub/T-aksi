import { useEffect, useMemo, useState } from "react";
import "@/App.css";
import axios from "axios";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import { getTranslation, SUPPORTED_LANGUAGES } from "@/lib/i18n";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const { language, setLanguage, isRtl } = useLanguagePreference();
  const t = useMemo(() => getTranslation(language), [language]);
  const [backendMessage, setBackendMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const helloWorldApi = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.get(`${API}/`, {
        params: { lang: language },
        headers: {
          "Accept-Language": language,
        },
      });

      setBackendMessage(response.data.message);
    } catch (e) {
      console.error(e, `errored out requesting / api`);
      setErrorMessage(t.backendError);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    helloWorldApi();
  }, [language]);

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
  return <Home />;
}

export default App;


