// Deux thèmes pour Pulse : le tableau noir (craie sur ardoise, par défaut) et le tableau blanc
// (marqueurs sur blanc). Retenu sur l'appareil.

export type ThemePulse = 'noir' | 'blanc';
const CLE = 'pulse-theme';

export function themePulse(): ThemePulse {
  try {
    return localStorage.getItem(CLE) === 'blanc' ? 'blanc' : 'noir';
  } catch {
    return 'noir';
  }
}

export function appliquerThemePulse(t: ThemePulse): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'blanc' ? '#EDF2F1' : '#13201E');
  try {
    localStorage.setItem(CLE, t);
  } catch {
    /* rien */
  }
}
