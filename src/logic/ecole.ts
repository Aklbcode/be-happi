// « À l'école aujourd'hui » : les dates importantes, les sorties et voyages, et les profs absents
// quand ils sont plusieurs. Jamais de motif d'absence.

import type { Dataset, DateEcole } from '../data/types';
import { plusJoursIso } from '../lib/calendar';

export interface Sortie {
  titre: string;
  classes: string[];
  au: string;
}

export interface AlEcole {
  aujourdhui: DateEcole[];
  bientot: DateEcole[];
  sorties: Sortie[];
  absents: string[];
}

/** Les « Stage » sont dans l'horaire (heures libérées) ; une sortie porte son propre nom (« Rotterdam »). */
const estSortie = (titre: string | undefined): boolean => !!titre && !/^stages?$/i.test(titre.trim());

export function aLEcole(ds: Dataset, date: string, jours = 14): AlEcole {
  const agenda = ds.agenda ?? [];
  const aujourdhui = agenda.filter((e) => e.du <= date && date <= e.au);
  const fin = plusJoursIso(date, jours);
  const bientot = agenda.filter((e) => e.du > date && e.du <= fin).slice(0, 3);

  const parTitre = new Map<string, Sortie>();
  for (const s of ds.stages ?? []) {
    if (!estSortie(s.titre) || s.du > date || date > s.au) continue;
    const t = s.titre!.trim();
    const x = parTitre.get(t) ?? { titre: t, classes: [], au: s.au };
    if (!x.classes.includes(s.classe)) x.classes.push(s.classe);
    parTitre.set(t, x);
  }
  const sorties = [...parTitre.values()].map((s) => ({ ...s, classes: s.classes.sort() }));

  const absents = [...new Set(ds.absences.filter((a) => a.date === date).map((a) => a.prof))].sort();
  return { aujourdhui, bientot, sorties, absents: absents.length >= 2 ? absents : [] };
}
