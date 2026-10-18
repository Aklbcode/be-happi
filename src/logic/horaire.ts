// Horaire « réel » d'un jour : l'horaire de base, plus les déplacements validés.

import type { Cours, Dataset, Deplacement, Reservation } from '../data/types';
import { conge, deIso, jourSemaineIso } from '../lib/calendar';

/** Pas de cours les jours de congé ni les jours fériés. */
const enConge = (date: string): boolean => !!conge(deIso(date));

export interface CoursJour extends Cours {
  date: string;
  /** Ce cours est arrivé ici par un déplacement. */
  deplace?: { date: string; h: number; statut: string };
}

/** « 5GA, 5GD » → ["5GA", "5GD"]. Une ou plusieurs classes, séparées par des virgules. */
export const classesDe = (texte: string): string[] =>
  texte
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter((x) => x && x !== '—');

/** Classes d'une réservation : « 3TQA · remédiation » → ["3TQA"]. */
export const classesReservation = (r: Reservation): string[] => classesDe(r.classe.split(' · ')[0] ?? '');

export const seCroisent = (a: string[], b: string[]): boolean => a.some((x) => b.includes(x));

/** Même déplacement (même cours de départ, même heure libérée, même prof). */
export const memeDeplacement = (a: Deplacement, b: Deplacement): boolean =>
  (!!a.id && a.id === b.id) ||
  (a.prof === b.prof && a.date === b.date && a.hVide === b.hVide && a.dateOrigine === b.dateOrigine && a.hOrigine === b.hOrigine);

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
      // Si un autre local a été attribué à la validation, il est réservé au nom du prof.
      const reserve = ds.reservations.find((r) => r.prof === prof && r.date === date && r.h === d.hVide && r.note !== 'remédiation');
      return {
        id: `dep-${d.id ?? i}`,
        prof,
        jour,
        h: d.hVide,
        classes: classesDe(d.classe),
        classe: d.classe,
        local: reserve?.local ?? libere?.local ?? origine?.local ?? '',
        matiere: origine?.matiere ?? '',
        date,
        deplace: { date: d.dateOrigine, h: d.hOrigine, statut: d.statut },
      };
    });
  return [...base, ...entrants].sort((a, b) => a.h - b.h);
}

/** Heures où une classe a réellement cours ce jour-là (prof présent ou cours déplacé validé). */
export function heuresDeLaClasse(ds: Dataset, classe: string, date: string): number[] {
  if (enConge(date)) return [];
  const jour = jourSemaineIso(date);
  const valides = ds.deplacements.filter((d) => d.statut === 'Validé' && classesDe(d.classe).includes(classe));
  const hs = new Set<number>();
  ds.cours
    .filter((c) => c.jour === jour && c.classes.includes(classe))
    .forEach((c) => {
      const parti = ds.deplacements.some((d) => d.statut === 'Validé' && d.prof === c.prof && d.dateOrigine === date && d.hOrigine === c.h);
      if (!parti && !absentA(ds, c.prof, date, c.h)) hs.add(c.h);
    });
  valides.filter((d) => d.date === date).forEach((d) => hs.add(d.hVide));
  return [...hs].sort((a, b) => a - b);
}

/**
 * Cours sans prof à cette heure (classe à l'étude).
 * Les classes déjà récupérées (déplacement proposé ou validé, réservation pour la classe,
 * remédiation) sont retirées ; un cours dont toutes les classes sont récupérées disparaît.
 */
export function coursSansProf(ds: Dataset, date: string, h: number): Cours[] {
  if (enConge(date)) return [];
  const jour = jourSemaineIso(date);
  const recuperees = new Set<string>([
    ...ds.deplacements.filter((d) => d.statut !== 'Refusé' && d.date === date && d.hVide === h).flatMap((d) => classesDe(d.classe)),
    ...ds.reservations.filter((r) => r.date === date && r.h === h).flatMap(classesReservation),
  ]);
  const sortie: Cours[] = [];
  for (const c of ds.cours) {
    if (c.jour !== jour || c.h !== h || !absentA(ds, c.prof, date, h)) continue;
    const restantes = c.classes.filter((cl) => !recuperees.has(cl));
    if (!restantes.length) continue;
    sortie.push(restantes.length === c.classes.length ? c : { ...c, classes: restantes, classe: restantes.join(', ') });
  }
  return sortie;
}

/**
 * La classe est-elle déjà prise à cette heure ? (cours avec un prof présent, déplacement validé
 * ou proposé, réservation pour la classe). `sauf` : le déplacement qu'on est en train de vérifier.
 */
export function classeOccupee(ds: Dataset, classe: string, date: string, h: number, sauf?: Deplacement): boolean {
  if (heuresDeLaClasse(ds, classe, date).includes(h)) return true;
  const autreDeplacement = ds.deplacements.some(
    (d) => d.statut !== 'Refusé' && d.date === date && d.hVide === h && classesDe(d.classe).includes(classe) && !(sauf && memeDeplacement(d, sauf)),
  );
  if (autreDeplacement) return true;
  return ds.reservations.some((r) => r.date === date && r.h === h && classesReservation(r).includes(classe));
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
