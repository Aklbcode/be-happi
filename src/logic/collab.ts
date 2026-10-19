// « Collab » : trouver une heure commune à plusieurs collègues (réunion, co-intervention, conseil).
// Les groupes sont déduits de l'horaire (équipe d'une classe, profs d'une même matière) : rien à tenir à jour.

import type { Dataset } from '../data/types';
import { MIDI, deIso, estJourDeCours, iso, periode, plusJours } from '../lib/calendar';
import { absentA, coursDuProf, nomAffiche } from './horaire';
import { triClasse } from './ouest';

export interface Groupe {
  id: string;
  nom: string;
  type: 'classe' | 'matiere';
  profs: string[];
}

/** Les groupes utiles à ce prof : l'équipe de chacune de ses classes, les collègues de ses matières. */
export function groupes(ds: Dataset, moi: string): Groupe[] {
  const mesCours = ds.cours.filter((c) => c.prof === moi);
  const classes = [...new Set(mesCours.flatMap((c) => c.classes))].sort(triClasse);
  const matieres = [...new Set(mesCours.map((c) => c.matiere).filter(Boolean))].sort();
  const sortie: Groupe[] = [];
  for (const cl of classes) {
    const profs = [...new Set(ds.cours.filter((c) => c.classes.includes(cl)).map((c) => c.prof))].sort();
    if (profs.length >= 2) sortie.push({ id: `classe-${cl}`, nom: `Équipe de la ${cl}`, type: 'classe', profs });
  }
  for (const m of matieres) {
    const profs = [...new Set(ds.cours.filter((c) => c.matiere === m).map((c) => c.prof))].sort();
    if (profs.length >= 2) sortie.push({ id: `matiere-${m}`, nom: `Profs de ${m.toLowerCase()}`, type: 'matiere', profs });
  }
  return sortie;
}

export interface OptionsCollab {
  /** Nombre de collègues qui peuvent manquer (0 = tout le monde). */
  tolerance: number;
  /** Seulement quand chacun est déjà à l'école (heure entre son premier et son dernier cours). */
  aLEcole: boolean;
}

export interface Creneau {
  date: string;
  hDebut: number;
  hFin: number;
  presents: string[];
  manquants: string[];
  /** Tous présents entre deux cours (personne ne vient exprès). */
  dansLaJournee: boolean;
  score: number;
}

type Etat = 'libre' | 'libre-hors' | 'pris';

/** Libre (dans sa journée ou en dehors), ou pris (cours, réservation, absence) ? */
function etat(ds: Dataset, prof: string, date: string, h: number): Etat {
  if (absentA(ds, prof, date, h)) return 'pris';
  const jour = coursDuProf(ds, prof, date, true);
  if (jour.some((c) => c.h === h)) return 'pris';
  if (ds.reservations.some((r) => r.prof === prof && r.date === date && r.h === h)) return 'pris';
  const hs = jour.map((c) => c.h);
  return hs.length && h > Math.min(...hs) && h < Math.max(...hs) ? 'libre' : 'libre-hors';
}

/**
 * Les heures communes des prochains jours de cours (2 semaines par défaut), regroupées quand elles
 * se suivent. Le temps de midi (H5) est exclu ; les heures déjà commencées aujourd'hui aussi.
 */
export function creneauxCommuns(
  ds: Dataset,
  profs: string[],
  depuis: Date,
  heurePassee: number,
  o: OptionsCollab,
  jours = 10,
): Creneau[] {
  if (profs.length < 2) return [];
  const dates: string[] = [];
  for (let d = depuis, n = 0; dates.length < jours && n < 60; n++, d = plusJours(d, 1)) if (estJourDeCours(d)) dates.push(iso(d));
  const aujourdhui = iso(depuis);

  const unitaires: Creneau[] = [];
  for (const date of dates) {
    for (let h = 1; h <= 9; h++) {
      if (h === MIDI) continue;
      if (date === aujourdhui && h <= heurePassee) continue;
      const etats = profs.map((p) => [p, etat(ds, p, date, h)] as const);
      const ok = etats.filter(([, e]) => e === 'libre' || (e === 'libre-hors' && !o.aLEcole));
      const manquants = etats.filter(([, e]) => !(e === 'libre' || (e === 'libre-hors' && !o.aLEcole))).map(([p]) => p);
      if (manquants.length > o.tolerance || ok.length < 2) continue;
      const dansLaJournee = ok.every(([, e]) => e === 'libre');
      unitaires.push({ date, hDebut: h, hFin: h, presents: ok.map(([p]) => p), manquants, dansLaJournee, score: 0 });
    }
  }

  // Regrouper les heures qui se suivent avec les mêmes présents (H3 + H4 → « H3–H4 »).
  const groupes: Creneau[] = [];
  for (const c of unitaires) {
    const prec = groupes[groupes.length - 1];
    const suit = prec && prec.date === c.date && prec.hFin + 1 === c.hDebut && memes(prec.presents, c.presents);
    if (suit) {
      prec.hFin = c.hDebut;
      prec.dansLaJournee = prec.dansLaJournee && c.dansLaJournee;
    } else groupes.push({ ...c });
  }
  for (const g of groupes) {
    const jourIndex = dates.indexOf(g.date);
    // Le plus de monde, puis quand chacun est déjà à l'école, puis le plus tôt.
    g.score = g.presents.length * 100 + (g.dansLaJournee ? 30 : 0) - jourIndex * 3 - g.hDebut * 0.1;
  }
  return groupes.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.hDebut - b.hDebut);
}

const memes = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** « H3 – H4 · 10h25 – 12h05 » */
export function plage(c: Pick<Creneau, 'hDebut' | 'hFin'>): string {
  const h = c.hDebut === c.hFin ? `H${c.hDebut}` : `H${c.hDebut}–H${c.hFin}`;
  return `${h} · ${periode(c.hDebut).debut} – ${periode(c.hFin).fin}`;
}

/** Début et fin réels (pour une invitation Teams ou un agenda). */
export function bornes(c: Pick<Creneau, 'date' | 'hDebut' | 'hFin'>): { debut: Date; fin: Date } {
  const d = deIso(c.date);
  const a = periode(c.hDebut);
  const b = periode(c.hFin);
  return {
    debut: new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(a.dm / 60), a.dm % 60),
    fin: new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(b.fm / 60), b.fm % 60),
  };
}

export const noms = (profs: string[]): string => {
  const n = profs.map(nomAffiche);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}` : n[0] ?? '';
};
