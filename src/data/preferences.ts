import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { normaliserPreferences, type PreferencesDeplacements } from '../logic/preferences';

const EVENEMENT = 'behappi-preferences';
const memoire = new Map<string, string>();
export function clePreferences(identite: string, mode: string) {
  return `behappi-preferences-v1:${mode}:${encodeURIComponent(identite.trim().toLowerCase())}`;
}
export function lirePreferencesStockees(cle: string): string {
  if (memoire.has(cle)) return memoire.get(cle)!;
  try { return localStorage.getItem(cle) ?? ''; } catch { return ''; }
}
export function preferencesEffectives(texte: string, semaine: string): PreferencesDeplacements {
  try {
    const document = JSON.parse(texte);
    return normaliserPreferences(document.temporaire?.semaine === semaine
      ? document.temporaire.choix : document.habituel);
  } catch { return normaliserPreferences(null); }
}
export function enregistrerPreferences(cle: string, choix: PreferencesDeplacements, semaine?: string) {
  let document: Record<string, unknown> = {};
  try { const lu = JSON.parse(lirePreferencesStockees(cle)); if (lu && typeof lu === 'object') document = lu; } catch { /* premier choix */ }
  const donnees = JSON.stringify(semaine
    ? { ...document, temporaire: { semaine, choix: normaliserPreferences(choix) } }
    : { habituel: normaliserPreferences(choix) });
  memoire.set(cle, donnees);
  let persistant = true;
  try { localStorage.setItem(cle, donnees); } catch { persistant = false; }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT));
  return persistant;
}
function souscrire(rappel: () => void) {
  const stockage = (e: StorageEvent) => { if (e.key?.startsWith('behappi-preferences-v1:') || e.key === null) { memoire.clear(); rappel(); } };
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener('storage', stockage);
  return () => { window.removeEventListener(EVENEMENT, rappel); window.removeEventListener('storage', stockage); };
}
export function usePreferences(identite: string, mode: string, semaine: string) {
  const cle = clePreferences(identite, mode);
  const lire = useCallback(() => lirePreferencesStockees(cle), [cle]);
  const texte = useSyncExternalStore(souscrire, lire, () => '');
  return useMemo(() => ({
    choix: preferencesEffectives(texte, semaine),
    temporaire: (() => { try { return JSON.parse(texte).temporaire?.semaine === semaine; } catch { return false; } })(),
    enregistrer: (p: PreferencesDeplacements, temporaire: boolean) => enregistrerPreferences(cle, p, temporaire ? semaine : undefined),
  }), [cle, texte, semaine]);
}
