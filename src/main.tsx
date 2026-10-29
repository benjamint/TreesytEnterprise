import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import i18n from './i18n';
import { App } from './app/App';
import { useSessionStore } from './stores/sessionStore';
import { useMobileSessionStore } from './stores/mobileSessionStore';

// Start in the right language and theme before the stores finish hydrating.
const isMobile = window.location.pathname.startsWith('/m');
const lang = isMobile ? useMobileSessionStore.getState().language : useSessionStore.getState().language;
void i18n.changeLanguage(lang);
document.documentElement.classList.toggle('dark', useSessionStore.getState().theme === 'dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
