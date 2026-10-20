// Suivi des propositions : ce que voit le prof (ses demandes et leurs décisions) et ce que voit
// l'éducateur (le bilan du jour, les propositions à valider, le journal des décisions).

import type { Dataset, Decision, Deplacement } from '../data/types';
import { JOURS_COURTS, deIso, jourSemaineIso, plusJoursIso } from '../lib/calendar';
import { classesDe, classesReservation, nomAffiche } from './horaire';

/** « jeu. 12 H1 → lun. 9 H7 » */
export function trajet(x: { dateOrigine: string; hOrigine: number; date: string; hVide: number }): string {
  const j = (d: string) => `${JOURS_COURTS[jourSemaineIso(d)].toLowerCase()}. ${deIso(d).getDate()}`;
  return `${j(x.dateOrigine)} H${x.hOrigine} → ${j(x.date)} H${x.hVide}`;
}

/** « ven. 16h10 » à partir d'une date ISO avec heure. */
export function moment(isoDateHeure: string | undefined): string {
  if (!isoDateHeure) return '';
  const d = new Date(isoDateHeure);
  if (Number.isNaN(d.getTime())) return '';
  const jour = d.getDay() === 0 ? 7 : d.getDay();
  return `${JOURS_COURTS[jour].toLowerCase()}. ${d.getDate()}/${d.getMonth() + 1} · ${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface LigneSuivi {
  statut: 'En attente' | 'Validé' | 'Refusé';
  classe: string;
  trajet: string;
  absent: string;
  commentaire?: string;
  par?: string;
  quand?: string;
  local?: string;
}

const memeTrajet = (a: Decision, d: Deplacement) =>
  a.prof === d.prof && a.date === d.date && a.hVide === d.hVide && a.dateOrigine === d.dateOrigine && a.hOrigine === d.hOrigine;

/**
 * Les propositions d'un prof : en attente, validées (cours à venir), refusées récemment (7 jours),
 * avec le commentaire de l'éducateur quand le journal le garde.
 */
export function suiviDuProf(ds: Dataset, moi: string, aujourdhui: string): LigneSuivi[] {
  const lignes: LigneSuivi[] = [];
  const mes = ds.deplacements.filter((d) => d.prof === moi);
  for (const d of mes.filter((x) => x.statut === 'En attente' && x.date >= aujourdhui)) {
    lignes.push({ statut: 'En attente', classe: d.classe, trajet: trajet(d), absent: d.absent, quand: d.creeLe });
  }
  for (const d of mes.filter((x) => x.statut !== 'En attente' && x.date >= aujourdhui)) {
    const dec = ds.decisions.find((x) => x.statut === 'Validé' && memeTrajet(x, d));
    lignes.push({ statut: 'Validé', classe: d.classe, trajet: trajet(d), absent: d.absent, commentaire: dec?.commentaire || undefined, par: dec?.par ?? d.modifiePar, quand: dec?.le ?? d.modifieLe, local: dec?.local });
  }
  const depuis = plusJoursIso(aujourdhui, -7);
  for (const dec of ds.decisions.filter((x) => x.statut === 'Refusé' && x.prof === moi && (x.le.slice(0, 10) >= depuis || x.date >= aujourdhui))) {
    lignes.push({ statut: 'Refusé', classe: dec.classe, trajet: trajet(dec), absent: dec.absent, commentaire: dec.commentaire || undefined, par: dec.par, quand: dec.le });
  }
  const ordre = { 'En attente': 0, Refusé: 1, Validé: 2 } as const;
  return lignes.sort((a, b) => ordre[a.statut] - ordre[b.statut] || (b.quand ?? '').localeCompare(a.quand ?? ''));
}

/** Le journal des décisions (le plus récent d'abord). Sans liste « Decisions », on reconstitue les validations. */
export function journal(ds: Dataset, aujourdhui: string, max = 12): Decision[] {
  if (ds.decisions.length || ds.journal) return [...ds.decisions].sort((a, b) => b.le.localeCompare(a.le)).slice(0, max);
  const depuis = plusJoursIso(aujourdhui, -14);
  return ds.deplacements
    .filter((d) => d.statut !== 'En attente' && (d.date >= depuis || (d.modifieLe ?? '') >= depuis))
    .map((d) => ({
      statut: 'Validé' as const,
      commentaire: '',
      classe: d.classe,
      prof: d.prof,
      absent: d.absent,
      date: d.date,
      hVide: d.hVide,
      dateOrigine: d.dateOrigine,
      hOrigine: d.hOrigine,
      par: d.modifiePar ?? '',
      le: d.modifieLe ?? `${d.date}T00:00:00`,
    }))
    .sort((a, b) => b.le.localeCompare(a.le))
    .slice(0, max);
}

export interface HeureSansProf {
  h: number;
  classe: string;
  absent: string;
  recuperee: boolean;
  /** Récupérée seulement par une proposition encore à valider. */
  enAttente: boolean;
}

/** Bilan du jour pour l'éducateur : qui est absent, quelles heures sont sans prof, lesquelles sont récupérées. */
export function bilanDuJour(ds: Dataset, date: string): { absents: string[]; heures: HeureSansProf[]; aLEtude: number; recuperees: number } {
  const jour = jourSemaineIso(date);
  const absents = [...new Set(ds.absences.filter((a) => a.date === date).map((a) => a.prof))].sort();
  const heures: HeureSansProf[] = [];
  for (const c of ds.cours) {
    if (c.jour !== jour) continue;
    const abs = ds.absences.find((a) => a.prof === c.prof && a.date === date && c.h >= a.deH && c.h <= a.aH);
    if (!abs) continue;
    for (const cl of c.classes) {
      const deps = ds.deplacements.filter((d) => d.statut !== 'Refusé' && d.date === date && d.hVide === c.h && classesDe(d.classe).includes(cl));
      const parReservation = ds.reservations.some((r) => r.date === date && r.h === c.h && classesReservation(r).includes(cl));
      const confirme = parReservation || deps.some((d) => d.statut !== 'En attente');
      heures.push({ h: c.h, classe: cl, absent: c.prof, recuperee: confirme || deps.length > 0, enAttente: !confirme && deps.length > 0 });
    }
  }
  heures.sort((a, b) => a.h - b.h || a.classe.localeCompare(b.classe));
  const recuperees = heures.filter((x) => x.recuperee).length;
  return { absents, heures, aLEtude: heures.length - recuperees, recuperees };
}

/** Qui prévenir après une décision (ce qui est automatique et ce qui reste à faire). */
export function aPrevenir(d: { prof: string; absent: string; classe: string }, statut: Decision['statut']): { qui: string; comment: string; auto: boolean }[] {
  const classes = classesDe(d.classe);
  if (statut === 'Refusé') {
    return [{ qui: nomAffiche(d.prof), comment: 'voit le refus et ton motif dans La Tour.', auto: true }];
  }
  return [
    { qui: nomAffiche(d.prof), comment: 'voit la validation dans La Tour ; son horaire est à jour.', auto: true },
    { qui: `Élèves de ${classes.join(', ')}`, comment: 'à prévenir avec « Publier pour les élèves » (La Tour ou Power Apps).', auto: false },
    { qui: `${nomAffiche(d.absent)} et les collègues concernés`, comment: 'sont prévenus par le message Teams prêt ci-dessous : il suffit de l’envoyer.', auto: false },
  ];
}

/** « 1 heure récupérée, 2 à valider, 7 à l'étude » : les propositions en attente ne comptent pas comme récupérées. */
export function resumeHeures(heures: HeureSansProf[], avecEtude = true): string {
  if (!heures.length) return 'aucune heure sans prof';
  const ok = heures.filter((x) => x.recuperee && !x.enAttente).length;
  const attente = heures.filter((x) => x.enAttente).length;
  const etude = heures.filter((x) => !x.recuperee).length;
  const morceaux = [`${ok} heure${ok > 1 ? 's' : ''} récupérée${ok > 1 ? 's' : ''}`];
  if (attente) morceaux.push(`${attente} à valider`);
  if (avecEtude) morceaux.push(`${etude} à l'étude`);
  return morceaux.join(', ');
}
