// Deux thèmes pour Décale : « cahier » (papier clair, par défaut le jour) et « veillée » (papier
// sombre, pour corriger le soir). Sans choix sur l'appareil, Décale suit le système.

export type ThemeDecale = 'cahier' | 'veillee';
const CLE = 'decale-theme';

export function themeChoisi(): ThemeDecale | null {
  try {
    const t = localStorage.getItem(CLE);
    return t === 'cahier' || t === 'veillee' ? t : null;
  } catch {
    return null;
  }
}

export function themeSysteme(): ThemeDecale {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'veillee' : 'cahier';
  } catch {
    return 'cahier';
  }
}

export function appliquerTheme(t: ThemeDecale, retenir: boolean): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'veillee' ? '#11152A' : '#F3F4F9');
  if (!retenir) return;
  try {
    localStorage.setItem(CLE, t);
  } catch {
    /* rien */
  }
}
