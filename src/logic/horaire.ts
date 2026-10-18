// Horaire « réel » d'un jour : l'horaire de base, plus les déplacements validés.

import type { Cours, Dataset, Deplacement } from '../data/types';
import { conge, deIso, jourSemaineIso } from '../lib/calendar';

/** Pas de cours les jours de congé ni les jours fériés. */
const enConge = (date: string): boolean => !!conge(deIso(date));

export interface CoursJour extends Cours {
  date: string;
  /** Ce cours est arrivé ici par un déplacement. */
  deplace?: { date: string; h: number; statut: string };
}

export const absentA = (ds: Dataset, prof: string, date: string, h: number): boolean =>
  ds.absences.some((a) => a.prof === prof && a.date === date && h >= a.deH && h <= a.aH);

export const estAbsentLeJour = (ds: Dataset, prof: string, date: string): boolean =>
  ds.absences.some((a) => a.prof === prof && a.date === date);

const actif = (d: Deplacement, avecAttente: boolean) =>
  d.statut === 'Validé' || (avecAttente && d.statut !== 'Refusé');

/** Cours d'un prof pour une date, déplacements appliqués. */
export function coursDuProf(ds: Dataset, prof: string, date: string, avecAttente = false): CoursJour[] {
  if (enConge(date)) return [];
  const jour = jourSemaineIso(date);
  const deps = ds.deplacements.filter((d) => d.prof === prof && actif(d, avecAttente));
  const base: CoursJour[] = ds.cours
    .filter((c) => c.prof === prof && c.jour === jour)
    .filter((c) => !deps.some((d) => d.dateOrigine === date && d.hOrigine === c.h))
    .map((c) => ({ ...c, date }));
  const entrants: CoursJour[] = deps
    .filter((d) => d.date === date)
    .map((d, i) => {
      const origine = ds.cours.find((c) => c.prof === prof && c.jour === jourSemaineIso(d.dateOrigine) && c.h === d.hOrigine);
      const libere = ds.cours.find((c) => c.prof === d.absent && c.jour === jour && c.h === d.hVide);
      return {
        id: `dep-${d.id ?? i}`,
        prof,
        jour,
        h: d.hVide,
        classes: [d.classe],
        classe: d.classe,
        local: libere?.local ?? origine?.local ?? '',
        matiere: origine?.matiere ?? '',
        date,
        deplace: { date: d.dateOrigine, h: d.hOrigine, statut: d.statut },
      };
    });
  return [...base, ...entrants].sort((a, b) => a.h - b.h);
}

/** Heures où une classe a réellement cours ce jour-là (prof présent ou cours déplacé). */
export function heuresDeLaClasse(ds: Dataset, classe: string, date: string): number[] {
  if (enConge(date)) return [];
  const jour = jourSemaineIso(date);
  const valides = ds.deplacements.filter((d) => d.statut === 'Validé' && d.classe === classe);
  const hs = new Set<number>();
  ds.cours
    .filter((c) => c.jour === jour && c.classes.includes(classe))
    .forEach((c) => {
      const parti = valides.some((d) => d.prof === c.prof && d.dateOrigine === date && d.hOrigine === c.h);
      if (!parti && !absentA(ds, c.prof, date, c.h)) hs.add(c.h);
    });
  valides.filter((d) => d.date === date).forEach((d) => hs.add(d.hVide));
  return [...hs].sort((a, b) => a - b);
}

/** Cours sans prof à cette heure (classe à l'étude), pas encore récupérés. */
export function coursSansProf(ds: Dataset, date: string, h: number): Cours[] {
  if (enConge(date)) return [];
  const jour = jourSemaineIso(date);
  return ds.cours.filter(
    (c) =>
      c.jour === jour &&
      c.h === h &&
      absentA(ds, c.prof, date, h) &&
      !ds.deplacements.some((d) => d.statut !== 'Refusé' && d.date === date && d.hVide === h && c.classes.includes(d.classe)) &&
      !ds.reservations.some((r) => r.date === date && r.h === h && r.note === 'remédiation' && c.classes.includes(r.classe)),
  );
}

export const niveau = (classe: string): number => {
  const n = parseInt(classe.charAt(0), 10);
  return Number.isNaN(n) ? 3 : n;
};

/** Règle de l'école : un prof du DI ne prend pas de classe du DS ; un prof du DS peut prendre le DI. */
export function peutPrendre(ds: Dataset, moi: string, classe: string): boolean {
  const mesNiveaux = ds.cours.filter((c) => c.prof === moi).flatMap((c) => c.classes.map(niveau));
  const enseigneDS = mesNiveaux.some((n) => n >= 3);
  return enseigneDS || niveau(classe) <= 2;
}

export const nomAffiche = (nom: string): string =>
  nom
    .toLowerCase()
    .split(/([ -])/)
    .map((p) => (p === ' ' || p === '-' ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
