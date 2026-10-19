// Tableau de bord de la direction : mêmes indicateurs que l'écran Direction de Power Apps
// (jours-prof d'absence, heures sans prof, heures récupérées, taux, par classe, par collègue,
// occupation des locaux sur 45 h), plus la remédiation et l'évolution semaine par semaine.

import type { Dataset } from '../data/types';
import { deIso, estJourDeCours, jourSemaineIso, plusJoursIso } from '../lib/calendar';
import { classesReservation } from './horaire';

export interface Semaine {
  lundi: string;
  sansProf: number;
  recuperees: number;
}

export interface StatsPeriode {
  du: string;
  au: string;
  joursProf: number;
  /** Heures de cours sans prof (un cours groupé compte une fois), comme Power Apps. */
  heures: number;
  parDeplacement: number;
  parRemediation: number;
  taux: number;
  parClasse: { classe: string; perdues: number; recuperees: number }[];
  parCollegue: { prof: string; deplacements: number; remediations: number }[];
  semaines: Semaine[];
  occupation: { local: string; heures: number; taux: number }[];
}

/** Les heures sans prof de la période, avec la façon dont elles ont été récupérées. */
export function heuresSansProf(ds: Dataset, du: string, au: string) {
  const sortie: { date: string; h: number; prof: string; classes: string[]; recup: 'deplacement' | 'remediation' | null }[] = [];
  for (const a of ds.absences) {
    if (a.date < du || a.date > au || !estJourDeCours(deIso(a.date))) continue;
    const jour = jourSemaineIso(a.date);
    for (const c of ds.cours.filter((x) => x.prof === a.prof && x.jour === jour && x.h >= a.deH && x.h <= a.aH)) {
      const dep = ds.deplacements.some((d) => d.statut !== 'En attente' && d.absent === a.prof && d.date === a.date && d.hVide === c.h);
      const rem = !dep && ds.reservations.some((r) => r.date === a.date && r.h === c.h && r.note === 'remédiation' && classesReservation(r).some((k) => c.classes.includes(k)));
      sortie.push({ date: a.date, h: c.h, prof: a.prof, classes: c.classes, recup: dep ? 'deplacement' : rem ? 'remediation' : null });
    }
  }
  return sortie;
}

export function statsPeriode(ds: Dataset, du: string, au: string): StatsPeriode {
  const heures = heuresSansProf(ds, du, au);
  const parDeplacement = heures.filter((x) => x.recup === 'deplacement').length;
  const parRemediation = heures.filter((x) => x.recup === 'remediation').length;

  const classes = new Map<string, { perdues: number; recuperees: number }>();
  for (const x of heures) {
    for (const k of x.classes) {
      const e = classes.get(k) ?? { perdues: 0, recuperees: 0 };
      e.perdues++;
      if (x.recup) e.recuperees++;
      classes.set(k, e);
    }
  }

  const collegues = new Map<string, { deplacements: number; remediations: number }>();
  for (const d of ds.deplacements.filter((x) => x.statut !== 'En attente' && x.date >= du && x.date <= au)) {
    const e = collegues.get(d.prof) ?? { deplacements: 0, remediations: 0 };
    e.deplacements++;
    collegues.set(d.prof, e);
  }
  for (const r of ds.reservations.filter((x) => x.note === 'remédiation' && x.date >= du && x.date <= au)) {
    const e = collegues.get(r.prof) ?? { deplacements: 0, remediations: 0 };
    e.remediations++;
    collegues.set(r.prof, e);
  }

  // Semaine par semaine (du lundi de « du » au lundi de « au »).
  const semaines: Semaine[] = [];
  for (let lundi = plusJoursIso(du, 1 - jourSemaineIso(du)); lundi <= au; lundi = plusJoursIso(lundi, 7)) {
    const fin = plusJoursIso(lundi, 4);
    const dans = heures.filter((x) => x.date >= lundi && x.date <= fin);
    const ouverte = [0, 1, 2, 3, 4].some((n) => estJourDeCours(deIso(plusJoursIso(lundi, n))));
    if (!ouverte) continue;
    semaines.push({ lundi, sansProf: dans.length, recuperees: dans.filter((x) => x.recup).length });
  }

  // Occupation des locaux sur 45 heures par semaine (horaire de base), sans sport ni ateliers.
  const occupation = ds.locaux
    .filter((l) => l.batiment !== 'Autres' && !/^Education|^Atelier/i.test(l.code))
    .map((l) => {
      const n = new Set(ds.cours.filter((c) => c.local === l.code).map((c) => c.jour * 10 + c.h)).size;
      return { local: l.code, heures: n, taux: n / 45 };
    })
    .sort((a, b) => b.taux - a.taux || a.local.localeCompare(b.local));

  return {
    du,
    au,
    joursProf: ds.absences.filter((a) => a.date >= du && a.date <= au && estJourDeCours(deIso(a.date))).length,
    heures: heures.length,
    parDeplacement,
    parRemediation,
    taux: heures.length ? (parDeplacement + parRemediation) / heures.length : 0,
    parClasse: [...classes.entries()]
      .map(([classe, e]) => ({ classe, ...e }))
      .sort((a, b) => b.perdues - b.recuperees - (a.perdues - a.recuperees) || b.perdues - a.perdues || a.classe.localeCompare(b.classe)),
    parCollegue: [...collegues.entries()]
      .map(([prof, e]) => ({ prof, ...e }))
      .sort((a, b) => b.deplacements + b.remediations - (a.deplacements + a.remediations) || a.prof.localeCompare(b.prof)),
    semaines,
    occupation,
  };
}

/** Signalements : combien sont ouverts, et en combien de jours ils sont résolus (médiane). */
export function statsSignalements(ds: Dataset, aujourdhui: string): { ouverts: number; bloquants: number; resolus: number; plusVieux?: { local: string; jours: number } } {
  const ouverts = ds.signalements.filter((s) => !s.resolu);
  const age = (s: { depuis: string }) => Math.round((deIso(aujourdhui).getTime() - deIso(s.depuis).getTime()) / 86400000);
  const vieux = [...ouverts].sort((a, b) => a.depuis.localeCompare(b.depuis))[0];
  return {
    ouverts: ouverts.length,
    bloquants: ouverts.filter((s) => s.bloquant).length,
    resolus: ds.signalements.length - ouverts.length,
    plusVieux: vieux ? { local: vieux.local, jours: age(vieux) } : undefined,
  };
}
