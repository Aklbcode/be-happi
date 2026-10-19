import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DecaleApp } from './DecaleApp';
import { appliquerTheme, themeChoisi, themeSysteme } from './theme';
import './decale.css';

declare const __DEMO_FORCEE__: boolean;

// Le papier du bon thème dès le premier affichage.
appliquerTheme(themeChoisi() ?? themeSysteme(), false);

createRoot(document.getElementById('decale')!).render(
  <StrictMode>
    <DecaleApp />
  </StrictMode>,
);

// Hors ligne : le même service worker que Be Happi (il couvre toutes les pages du site).
if ('serviceWorker' in navigator && location.protocol === 'https:' && import.meta.env.PROD && !__DEMO_FORCEE__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {
      /* pas grave : Décale marche sans */
    });
  });
}
