import type { Dataset } from '../data/types';
import { coursDuProf } from './horaire';
import { periode } from '../lib/calendar';

export type ChoixHeure = 'neutre' | 'preferer' | 'eviter' | 'indisponible';
export interface PreferencesDeplacements {
  premiere: ChoixHeure;
  derniere: ChoixHeure;
  compacter: boolean;
  jourLibre: boolean;
  echanges: boolean;
  stabilite: boolean;
}
export const PREFERENCES_DEFAUT: PreferencesDeplacements = {
  premiere: 'neutre', derniere: 'neutre', compacter: false,
  jourLibre: false, echanges: true, stabilite: false,
};

export function normaliserPreferences(valeur: unknown): PreferencesDeplacements {
  const p = valeur && typeof valeur === 'object' ? valeur as Record<string, unknown> : {};
  const heure = (v: unknown): ChoixHeure => ['neutre', 'preferer', 'eviter', 'indisponible'].includes(String(v)) ? v as ChoixHeure : 'neutre';
  return {
    premiere: heure(p.premiere), derniere: heure(p.derniere),
    compacter: p.compacter === true, jourLibre: p.jourLibre === true,
    echanges: typeof p.echanges === 'boolean' ? p.echanges : true,
    stabilite: p.stabilite === true,
  };
}

/** Compare les deux journées ensemble, en conservant les réservations du professeur. */
export function impactPersonnel(ds: Dataset, moi: string, dateO: string, hO: number, date: string, h: number) {
  const heures = (d: string) => [...new Set([
    ...coursDuProf(ds, moi, d, true).map((c) => c.h),
    ...ds.reservations.filter((r) => r.prof === moi && r.date === d).map((r) => r.h),
  ])];
  const duree = (hs: number[]) => hs.length ? periode(Math.max(...hs)).fm - periode(Math.min(...hs)).dm : 0;
  const fourches = (hs: number[]) => hs.length ?
    Array.from({ length: Math.max(...hs) - Math.min(...hs) }, (_, i) => i + Math.min(...hs))
      .filter((hh) => hh !== 5 && !hs.includes(hh)).length : 0;
  let gainNetMinutes = 0;
  let fourchesSupprimees = 0;
  let nouvelleVenue = false;
  for (const d of new Set([dateO, date])) {
    const avant = heures(d);
    // Une réservation au départ reste un engagement, même si le cours est déplacé.
    const reservationOrigine = ds.reservations.some((r) => r.prof === moi && r.date === d && r.h === hO);
    const apres = avant.filter((hh) => d !== dateO || hh !== hO || reservationOrigine);
    if (d === date) apres.push(h);
    gainNetMinutes += duree(avant) - duree(apres);
    fourchesSupprimees += fourches(avant) - fourches(apres);
    if (!avant.length && apres.length) nouvelleVenue = true;
  }
  return { gainNetMinutes, fourchesSupprimees, nouvelleVenue };
}

export function personnaliserDeplacement(
  ds: Dataset, moi: string, dateO: string, hO: number, date: string, h: number,
  preferences?: PreferencesDeplacements,
) {
  const p = normaliserPreferences(preferences);
  const impact = impactPersonnel(ds, moi, dateO, hO, date, h);
  const raisons: string[] = [];
  let autorise = true;
  let bonus = 0;
  const origineLiberee = !ds.reservations.some((r) => r.prof === moi && r.date === dateO && r.h === hO);
  for (const [heure, choix, nom] of [[1, p.premiere, 'première'], [9, p.derniere, 'dernière']] as const) {
    if (h === heure && choix === 'indisponible') autorise = false;
    if (choix === 'preferer') {
      if (h === heure) { bonus += 24; raisons.push(`Tu préfères donner cours en ${nom} heure.`); }
      if (hO === heure && origineLiberee) bonus -= 24;
    }
    if (choix === 'eviter' || choix === 'indisponible') {
      if (h === heure) { bonus -= 24; raisons.push(`Attention : tu préfères éviter la ${nom} heure.`); }
      if (hO === heure && origineLiberee) { bonus += 24; raisons.push(`Ce déplacement libère ta ${nom} heure au départ.`); }
    }
  }
  if (p.jourLibre && impact.nouvelleVenue) autorise = false;
  if (!p.echanges && impact.gainNetMinutes <= 0) autorise = false;
  if (p.compacter) {
    bonus += impact.fourchesSupprimees * 12;
    if (impact.fourchesSupprimees > 0) raisons.push('Ce déplacement réduit tes fourches.');
    if (impact.fourchesSupprimees < 0) raisons.push('Attention : ce déplacement crée davantage de fourches.');
  }
  if (p.stabilite) {
    bonus -= dateO === date ? 0 : 15;
    if (dateO === date) raisons.push('Le changement reste dans la même journée.');
  }
  if (impact.gainNetMinutes <= 0) raisons.push(impact.gainNetMinutes < 0
    ? 'Ton temps total de présence augmente : le gain au départ est compensé ailleurs.'
    : 'Échange sans réduction de ton temps total de présence.');
  return { ...impact, autorise, bonus, raisons };
}
