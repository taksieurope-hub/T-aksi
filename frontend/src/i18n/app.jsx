import { Routes, Route } from 'react-router-dom';
import { useLanguage } from './i18n/LanguageContext';
// Import your components here...

const App = () => {
  const { _renderKey } = useLanguage();

  return (
    <div className="app-container" key={_renderKey}>
      <Routes>
        {/* PASTE ALL YOUR ROUTES HERE. 
            Everything inside these routes will now 
            auto-flip when the language changes. 
        */}
        <Route path="/" element={<h1 className="p-10 text-center">T'aksi Galactic</h1>} />
      </Routes>
    </div>
  );
};

export default App;