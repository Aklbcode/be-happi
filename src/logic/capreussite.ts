// Cap Réussite : des remédiations pendant les heures d'étude.
// - Un élève à l'étude se dit disponible dans une matière ;
// - un prof en fourche qui donne cette matière le prend (ou prend la classe entière) dans un local libre ;
// - l'app propose aussi les élèves en échec dans la matière (export des bulletins, personnel seulement) ;
// - chaque séance prise remplit la feuille de prestations du prof, visible par la direction.

import type { Dataset, Resultat, SeanceCR } from '../data/types';
import { MIDI, deIso, estJourDeCours, iso, periode, plusJours } from '../lib/calendar';
import { sansAccents } from '../data/champs';
import { coursDuProf, coursSansProf, nomAffiche, peutPrendre } from './horaire';
import { heureLibre } from './deplacements';
import { positionProf } from './ouest';

/** Durée d'une séance (une période de cours). */
export const MINUTES_SEANCE = 50;

/** Famille d'une matière, pour rapprocher « Sciences » et « Sciences de base », « Maths » et « Mathématiques »… */
export function famille(matiere: string): string {
  const m = sansAccents(matiere);
  if (!m) return '';
  if (m.includes('scien')) return 'sciences';
  if (m.startsWith('math')) return 'maths';
  if (m.startsWith('fran')) return 'francais';
  if (m.startsWith('neer')) return 'neerlandais';
  if (m.startsWith('angl')) return 'anglais';
  if (m.startsWith('hist')) return 'histoire';
  if (m.startsWith('geo')) return 'geographie';
  return m;
}

/** Les matières que donne ce prof (telles qu'écrites dans l'horaire). */
export const matieresDe = (ds: Dataset, prof: string): string[] =>
  [...new Set(ds.cours.filter((c) => c.prof === prof && c.matiere).map((c) => c.matiere))].sort();

const famillesDe = (ds: Dataset, prof: string): Set<string> => new Set(matieresDe(ds, prof).map(famille));

/** Les matières d'une classe (horaire des élèves), pour qu'un élève choisisse. */
export const matieresClasse = (ds: Dataset, classe: string): string[] =>
  [...new Set(ds.coursEleves.filter((c) => c.classes.includes(classe) && c.matiere).map((c) => c.matiere))].sort((a, b) => a.localeCompare(b));

/**
 * Heures d'étude d'une classe un jour donné. Le personnel les calcule (absences, sans les classes
 * déjà reprises) ; un élève ne connaît que ce qui est publié (« Publier pour les élèves »).
 */
export function heuresEtude(ds: Dataset, classe: string, date: string, publieSeulement = false): number[] {
  if (publieSeulement || !ds.cours.length) {
    return [...new Set(ds.changements.filter((c) => c.date === date && c.classe === classe && /tude/i.test(c.type)).map((c) => c.h))].sort((a, b) => a - b);
  }
  const hs: number[] = [];
  for (let h = 1; h <= 9; h++) if (coursSansProf(ds, date, h).some((c) => c.classes.includes(classe))) hs.push(h);
  return hs;
}

/** Les prochains jours de cours (aujourd'hui compris). */
export function prochainsJours(aujourdhui: string, n: number): string[] {
  const sortie: string[] = [];
  let d = deIso(aujourdhui);
  for (let i = 0; i < 30 && sortie.length < n; i++, d = plusJours(d, 1)) if (estJourDeCours(d)) sortie.push(iso(d));
  return sortie;
}

const aVenir = (date: string, h: number, aujourdhui: string, heurePassee: number): boolean =>
  date > aujourdhui || (date === aujourdhui && h > heurePassee);

const memeCreneau = (a: { date: string; h: number }, b: { date: string; h: number }) => a.date === b.date && a.h === b.h;

/** Prénom et initiale, d'après l'adresse (« lea.dupont@… » → « Léa D. »). */
export function nomEleve(prenom: string, email?: string): string {
  const morceaux = (email ?? '').split('@')[0].split(/[._-]/).filter(Boolean);
  const initiale = morceaux.length > 1 ? `${morceaux[morceaux.length - 1].charAt(0).toUpperCase()}.` : '';
  return `${prenom || morceaux[0] || 'Élève'} ${initiale}`.trim();
}

// ——— Côté élève ———

export interface HeureEtudeEleve {
  date: string;
  h: number;
  /** Ma ligne pour cette heure (disponible ou prise), s'il y en a une. */
  moi?: SeanceCR;
}

/** Les heures d'étude à venir de ma classe, avec ce que j'ai déjà demandé. */
export function etudesEleve(ds: Dataset, classe: string, mail: string, aujourdhui: string, heurePassee: number, publieSeulement = true): HeureEtudeEleve[] {
  if (!classe) return [];
  const m = mail.toLowerCase();
  const mes = (ds.capReussite ?? []).filter((x) => (x.eleveMail ?? '').toLowerCase() === m && x.statut !== 'Annulée');
  const sortie: HeureEtudeEleve[] = [];
  for (const date of prochainsJours(aujourdhui, 5)) {
    for (const h of heuresEtude(ds, classe, date, publieSeulement)) {
      if (h === MIDI || !aVenir(date, h, aujourdhui, heurePassee)) continue;
      sortie.push({ date, h, moi: mes.find((x) => memeCreneau(x, { date, h })) });
    }
  }
  return sortie;
}

/** Mes demandes (les plus récentes d'abord), annulées comprises pour l'historique. */
export const demandesEleve = (ds: Dataset, mail: string): SeanceCR[] =>
  (ds.capReussite ?? [])
    .filter((x) => (x.eleveMail ?? '').toLowerCase() === mail.toLowerCase())
    .sort((a, b) => b.date.localeCompare(a.date) || b.h - a.h);

// ——— Côté prof ———

export interface EchecPropose {
  resultat: Resultat;
  /** Mot d'explication (sans note). */
  texte: string;
}

export interface ClasseEtude {
  classe: string;
  matiere: string;
  /** Je donne cours à cette classe. */
  mienne: boolean;
}

export interface Occasion {
  date: string;
  h: number;
  /** En fourche : j'ai cours avant et après, je suis à l'école. */
  fourche: boolean;
  /** Élèves qui se sont dits disponibles dans une de mes matières. */
  demandes: SeanceCR[];
  /** Élèves en échec dans une de mes matières, dont la classe est à l'étude. */
  echecs: EchecPropose[];
  /** Classes entières à l'étude. */
  classes: ClasseEtude[];
}

/**
 * Mes heures libres (en fourche) des prochains jours où quelqu'un peut profiter d'une remédiation.
 * Pas le temps de midi, pas une heure passée.
 */
export function occasionsProf(ds: Dataset, moi: string, aujourdhui: string, heurePassee: number, jours = 5): Occasion[] {
  const fam = famillesDe(ds, moi);
  const mesClasses = new Set(ds.cours.filter((c) => c.prof === moi).flatMap((c) => c.classes));
  const cr = ds.capReussite ?? [];
  const sortie: Occasion[] = [];
  for (const date of prochainsJours(aujourdhui, jours)) {
    if (!coursDuProf(ds, moi, date, true).length) continue;
    for (let h = 1; h <= 9; h++) {
      if (h === MIDI || !aVenir(date, h, aujourdhui, heurePassee) || !heureLibre(ds, moi, date, h)) continue;
      const pos = positionProf(ds, moi, date, h);
      if (pos.statut !== 'fourche') continue;
      const etude = coursSansProf(ds, date, h).filter((c) => c.classes.some((k) => peutPrendre(ds, moi, k)));
      const aLEtude = new Set(etude.flatMap((c) => c.classes));
      const ici = cr.filter((x) => memeCreneau(x, { date, h }) && x.statut !== 'Annulée');
      const demandes = ici.filter((x) => x.statut === 'Disponible' && fam.has(famille(x.matiere)) && peutPrendre(ds, moi, x.classe));
      const dejaLa = new Set(ici.map((x) => (x.eleveMail || `${x.eleve}|${x.classe}`).toLowerCase()));
      const echecs: EchecPropose[] = (ds.resultats ?? [])
        .filter((r) => r.echec && fam.has(famille(r.matiere)) && aLEtude.has(r.classe))
        .filter((r) => !dejaLa.has((r.eleveMail || `${r.eleve}|${r.classe}`).toLowerCase()))
        .map((r) => ({ resultat: r, texte: `En difficulté en ${r.matiere.toLowerCase()}${r.periode ? ` (${r.periode})` : ''}, à l'étude à cette heure.` }));
      const classes: ClasseEtude[] = etude
        .flatMap((c) => c.classes.map((k) => ({ classe: k, matiere: c.matiere, mienne: mesClasses.has(k) })))
        .sort((a, b) => Number(b.mienne) - Number(a.mienne) || a.classe.localeCompare(b.classe));
      if (demandes.length || echecs.length || classes.length) sortie.push({ date, h, fourche: true, demandes, echecs, classes });
    }
  }
  return sortie;
}

/** Ce qui compte le plus : des élèves qui demandent, puis des élèves en échec, puis une classe. */
export const poidsOccasion = (o: Occasion): number => o.demandes.length * 3 + o.echecs.length * 2 + (o.classes.some((c) => c.mienne) ? 1 : 0);

// ——— Feuille de prestations ———

export interface Seance {
  cle: string;
  prof: string;
  date: string;
  h: number;
  local: string;
  matiere: string;
  /** Classe(s) concernée(s). */
  classes: string[];
  /** Élèves pris individuellement (vide pour une classe entière). */
  eleves: { nom: string; classe: string; mail?: string; origine: SeanceCR['origine'] }[];
  classeEntiere: boolean;
  /** D'où vient la séance : demande d'élève, élève en échec, choix du prof, ou une ancienne réservation. */
  origines: SeanceCR['origine'][];
  faite: boolean;
  minutes: number;
  /** Les lignes CapReussite de la séance (pour l'annuler). */
  lignes: SeanceCR[];
}

/** Toutes les séances prises (Cap Réussite et remédiations réservées depuis l'accueil), par prof et par heure. */
export function seances(ds: Dataset, aujourdhui: string, heureFinie: number): Seance[] {
  const map = new Map<string, Seance>();
  const nouvelle = (prof: string, date: string, h: number, local: string, matiere: string): Seance => ({
    cle: `${prof}|${date}|${h}`, prof, date, h, local, matiere, classes: [], eleves: [], classeEntiere: false, origines: [],
    faite: date < aujourdhui || (date === aujourdhui && h <= heureFinie), minutes: MINUTES_SEANCE, lignes: [],
  });
  for (const x of ds.capReussite ?? []) {
    if (x.statut !== 'Prise' || !x.prof) continue;
    const cle = `${x.prof}|${x.date}|${x.h}`;
    const s = map.get(cle) ?? nouvelle(x.prof, x.date, x.h, x.local ?? '', x.matiere);
    if (!s.local && x.local) s.local = x.local;
    if (!s.classes.includes(x.classe)) s.classes.push(x.classe);
    if (x.eleve) s.eleves.push({ nom: x.eleve, classe: x.classe, mail: x.eleveMail, origine: x.origine });
    else s.classeEntiere = true;
    if (!s.origines.includes(x.origine)) s.origines.push(x.origine);
    s.lignes.push(x);
    map.set(cle, s);
  }
  // Remédiations réservées sans passer par Cap Réussite (« Prendre la classe » de l'accueil).
  for (const r of ds.reservations) {
    if (r.note !== 'remédiation' && !/remédiation/i.test(r.classe)) continue;
    const cle = `${r.prof}|${r.date}|${r.h}`;
    if (map.has(cle)) continue;
    const classe = r.classe.split(' · ')[0];
    const matiere = ds.cours.find((c) => c.prof === r.prof && c.matiere)?.matiere ?? '';
    const s = nouvelle(r.prof, r.date, r.h, r.local, matiere);
    s.classes.push(classe);
    s.classeEntiere = true;
    map.set(cle, s);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.h - b.h || a.prof.localeCompare(b.prof));
}

export const seancesDuProf = (ds: Dataset, prof: string, aujourdhui: string, heureFinie: number): Seance[] =>
  seances(ds, aujourdhui, heureFinie).filter((s) => s.prof === prof);

/** « 2026-10 » → « octobre 2026 ». */
export function nomMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
}

export interface TotalProf {
  prof: string;
  faites: number;
  prevues: number;
  minutes: number;
  eleves: number;
}

/** Totaux d'un mois par prof (séances données, prévues, minutes, élèves aidés). */
export function totauxMois(liste: Seance[], mois: string): TotalProf[] {
  const map = new Map<string, TotalProf>();
  for (const s of liste.filter((x) => x.date.startsWith(mois))) {
    const t = map.get(s.prof) ?? { prof: s.prof, faites: 0, prevues: 0, minutes: 0, eleves: 0 };
    if (s.faite) {
      t.faites++;
      t.minutes += s.minutes;
    } else t.prevues++;
    t.eleves += s.eleves.length;
    map.set(s.prof, t);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes || a.prof.localeCompare(b.prof));
}

/** Les mois où il y a des séances, du plus récent au plus ancien (le mois en cours toujours présent). */
export function moisDisponibles(liste: Seance[], aujourdhui: string): string[] {
  return [...new Set([aujourdhui.slice(0, 7), ...liste.map((s) => s.date.slice(0, 7))])].sort().reverse();
}

const champCsv = (v: string | number): string => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Feuille de prestations au format CSV (Excel, séparateur « ; »). Le nombre d'élèves, jamais leurs
 * noms ni leurs résultats : la feuille sert à compter les heures données.
 */
export function feuilleCsv(liste: Seance[]): string {
  const entete = ['Date', 'Heure', 'Début', 'Fin', 'Prof', 'Matière', 'Classe(s)', 'Élèves', 'Local', 'Origine', 'Minutes', 'État'];
  const lignes = liste.map((s) => [
    s.date, `H${s.h}`, periode(s.h).debut, periode(s.h).fin, nomAffiche(s.prof), s.matiere, s.classes.join(', '),
    s.classeEntiere ? 'classe entière' : s.eleves.length, s.local, s.origines.length ? s.origines.join(', ') : 'Réservation', s.minutes,
    s.faite ? 'donnée' : 'prévue',
  ]);
  return '﻿' + [entete, ...lignes].map((l) => l.map(champCsv).join(';')).join('\r\n');
}

/** Texte de réservation : une classe entière la marque reprise ; des élèves seuls, non (la classe reste à l'étude). */
export function texteReservation(classeEntiere: boolean, classes: string[], nbEleves: number): string {
  if (classeEntiere) return `${classes.join(', ')} · remédiation`;
  return `Cap Réussite · remédiation ${classes.join(', ')} (${nbEleves} élève${nbEleves > 1 ? 's' : ''})`;
}
