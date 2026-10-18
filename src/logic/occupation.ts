// État d'un local à une heure donnée.

import type { Dataset } from '../data/types';
import { jourSemaineIso } from '../lib/calendar';
import { absentA, nomAffiche } from './horaire';

export type EtatLocal = 'libre' | 'occupe' | 'moi' | 'indispo';

export interface InfoLocal {
  etat: EtatLocal;
  detail: string;
}

export function etatLocal(ds: Dataset, moi: string, code: string, date: string, h: number): InfoLocal {
  const sig = ds.signalements.find((s) => s.local === code && s.bloquant && s.depuis <= date);
  if (sig) return { etat: 'indispo', detail: `Indisponible · ${sig.titre.toLowerCase()}` };

  const jour = jourSemaineIso(date);
  const res = ds.reservations.find((r) => r.local === code && r.date === date && r.h === h);
  if (res) return { etat: res.prof === moi ? 'moi' : 'occupe', detail: res.prof === moi ? `Réservé par toi · ${res.classe}` : `Réservé · ${res.classe}` };

  // Cours qui arrivent par un déplacement : ils prennent le local de l'heure libérée.
  for (const d of ds.deplacements.filter((x) => x.statut !== 'Refusé' && x.date === date && x.hVide === h)) {
    const libere = ds.cours.find((c) => c.prof === d.absent && c.jour === jour && c.h === h && c.local === code);
    if (libere) return { etat: d.prof === moi ? 'moi' : 'occupe', detail: `${d.classe} · ${nomAffiche(d.prof)} (déplacé)` };
  }

  for (const c of ds.cours.filter((x) => x.local === code && x.jour === jour && x.h === h)) {
    const parti = ds.deplacements.some((d) => d.statut === 'Validé' && d.prof === c.prof && d.dateOrigine === date && d.hOrigine === h);
    if (parti || absentA(ds, c.prof, date, h)) continue;
    return { etat: c.prof === moi ? 'moi' : 'occupe', detail: c.prof === moi ? `Ton cours · ${c.classe}` : `${c.classe} · ${nomAffiche(c.prof)}` };
  }
  return { etat: 'libre', detail: 'Libre' };
}

/** Jusqu'à quelle heure le local reste libre à partir de h. */
export function libreJusque(ds: Dataset, moi: string, code: string, date: string, h: number): number {
  let fin = h;
  while (fin < 9 && etatLocal(ds, moi, code, date, fin + 1).etat === 'libre') fin++;
  return fin;
}
