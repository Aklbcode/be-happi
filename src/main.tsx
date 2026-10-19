import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

declare const __DEMO_FORCEE__: boolean;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Hors ligne : seulement pour la version en ligne (https), pas pour la démo en un seul fichier.
if ('serviceWorker' in navigator && location.protocol === 'https:' && import.meta.env.PROD && !__DEMO_FORCEE__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* pas grave : l'app marche sans */
    });
  });
}
