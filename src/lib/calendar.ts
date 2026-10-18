// Périodes de cours de l'IPES (H1 à H9) et calendrier scolaire FWB 2026-2027.

export interface Periode {
  h: number;
  debut: string;
  fin: string;
  dm: number; // début en minutes depuis minuit
  fm: number; // fin en minutes depuis minuit
}

export const PERIODES: Periode[] = [
  { h: 1, debut: '8h25', fin: '9h15', dm: 505, fm: 555 },
  { h: 2, debut: '9h20', fin: '10h10', dm: 560, fm: 610 },
  { h: 3, debut: '10h25', fin: '11h15', dm: 625, fm: 675 },
  { h: 4, debut: '11h15', fin: '12h05', dm: 675, fm: 725 },
  { h: 5, debut: '12h05', fin: '12h55', dm: 725, fm: 775 },
  { h: 6, debut: '12h55', fin: '13h45', dm: 775, fm: 825 },
  { h: 7, debut: '13h45', fin: '14h35', dm: 825, fm: 875 },
  { h: 8, debut: '14h45', fin: '15h35', dm: 885, fm: 935 },
  { h: 9, debut: '15h35', fin: '16h25', dm: 935, fm: 985 },
];

/** H5 = temps de midi (des cours peuvent s'y donner). */
export const MIDI = 5;
/** Récréations : après H2 et après H7. */
export const RECRES = [2, 7];

export const periode = (h: number): Periode => PERIODES[Math.min(Math.max(h, 1), 9) - 1];

export interface Conge {
  du: string;
  au: string;
  nom: string;
}

// Source : calendrier de l'enseignement obligatoire FWB 2026-2027 (à vérifier sur enseignement.be).
export const CONGES: Conge[] = [
  { du: '2026-10-19', au: '2026-10-30', nom: "Congé d'automne" },
  { du: '2026-11-02', au: '2026-11-02', nom: 'Fête des morts' },
  { du: '2026-11-11', au: '2026-11-11', nom: 'Armistice' },
  { du: '2026-12-21', au: '2027-01-01', nom: "Vacances d'hiver" },
  { du: '2027-02-22', au: '2027-03-05', nom: 'Congé de détente' },
  { du: '2027-03-29', au: '2027-03-29', nom: 'Lundi de Pâques' },
  { du: '2027-04-26', au: '2027-05-07', nom: 'Vacances de printemps' },
  { du: '2027-05-17', au: '2027-05-17', nom: 'Lundi de Pentecôte' },
  { du: '2027-07-03', au: '2027-08-29', nom: "Vacances d'été" },
];

export const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const JOURS_COURTS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${j}`;
}

export function deIso(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function aMidi(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

export function plusJours(d: Date, n: number): Date {
  const r = aMidi(d);
  r.setDate(r.getDate() + n);
  return r;
}

export const plusJoursIso = (s: string, n: number): string => iso(plusJours(deIso(s), n));

/** 1 = lundi … 7 = dimanche */
export function jourSemaine(d: Date): number {
  const w = d.getDay();
  return w === 0 ? 7 : w;
}

export const jourSemaineIso = (s: string): number => jourSemaine(deIso(s));

export function lundiDe(d: Date): Date {
  return plusJours(d, 1 - jourSemaine(d));
}

export function conge(d: Date): Conge | null {
  const s = iso(d);
  return CONGES.find((c) => s >= c.du && s <= c.au) ?? null;
}

export function estJourDeCours(d: Date): boolean {
  return jourSemaine(d) <= 5 && !conge(d);
}

export function prochainJourDeCours(d: Date, inclus = true): Date {
  let x = inclus ? aMidi(d) : plusJours(d, 1);
  for (let i = 0; i < 400; i++) {
    if (estJourDeCours(x)) return x;
    x = plusJours(x, 1);
  }
  return x;
}

export const minutesDe = (d: Date): number => d.getHours() * 60 + d.getMinutes();

export function heureTxt(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function dureeTxt(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/**
 * Où en est-on dans la journée ?
 * - h : la période en cours, ou la prochaine si on est dans une pause ;
 * - enCours : vrai si une période est en train de se donner ;
 * - 0 = avant H1, 10 = après H9.
 */
export function situation(min: number): { h: number; enCours: boolean } {
  if (min < PERIODES[0].dm) return { h: 0, enCours: false };
  for (const p of PERIODES) {
    if (min >= p.dm && min < p.fm) return { h: p.h, enCours: true };
    if (min < p.dm) return { h: p.h, enCours: false };
  }
  return { h: 10, enCours: false };
}

/** Dernière période entièrement terminée (0 si aucune). */
export function dernierePeriodeFinie(min: number): number {
  let h = 0;
  for (const p of PERIODES) if (min >= p.fm) h = p.h;
  return h;
}

export function dateLongue(d: Date): string {
  return `${JOURS[jourSemaine(d)]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

export function dateMoyenne(d: Date): string {
  return `${JOURS_COURTS[jourSemaine(d)].toLowerCase()}. ${d.getDate()} ${MOIS[d.getMonth()].slice(0, 4)}${MOIS[d.getMonth()].length > 4 ? '.' : ''}`;
}

export const dateCourte = (d: Date): string => `${d.getDate()}/${d.getMonth() + 1}`;
