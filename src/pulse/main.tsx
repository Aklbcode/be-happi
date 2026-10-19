import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PulseApp } from './PulseApp';
import './pulse.css';

declare const __DEMO_FORCEE__: boolean;

createRoot(document.getElementById('pulse')!).render(
  <StrictMode>
    <PulseApp />
  </StrictMode>,
);

// Hors ligne : le même service worker que Be Happi (il couvre les deux pages).
if ('serviceWorker' in navigator && location.protocol === 'https:' && import.meta.env.PROD && !__DEMO_FORCEE__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {
      /* pas grave : Pulse marche sans */
    });
  });
}
