// « Où est ? » : où se trouve un prof, une classe ou un local à une heure donnée, et qui est libre.
// Tout est calculé depuis les listes (horaire, absences sans motif, déplacements validés, réservations).

import type { Changement, CoursEleve, Dataset } from '../data/types';
import { MIDI, conge, deIso, jourSemaineIso, periode } from '../lib/calendar';
import { absentA, classesDe, classesReservation, coursDuProf, nomAffiche } from './horaire';
import { etatLocal, type InfoLocal } from './occupation';
import { sansAccents } from '../data/champs';

export type StatutProf = 'cours' | 'absent' | 'fourche' | 'midi' | 'avant' | 'apres' | 'pas-cours' | 'conge';

export interface PositionProf {
  h: number;
  statut: StatutProf;
  classe?: string;
  local?: string;
  matiere?: string;
  /** Le cours vient d'un déplacement validé, ou c'est une remédiation. */
  note?: string;
  texte: string;
}

/** Où est ce prof à cette heure ? */
export function positionProf(ds: Dataset, prof: string, date: string, h: number): PositionProf {
  if (conge(deIso(date))) return { h, statut: 'conge', texte: 'Congé' };
  if (absentA(ds, prof, date, h)) return { h, statut: 'absent', texte: 'Absent·e' };
  const jour = coursDuProf(ds, prof, date);
  const c = jour.find((x) => x.h === h);
  if (c) {
    return {
      h, statut: 'cours', classe: c.classe, local: c.local, matiere: c.matiere,
      note: c.deplace ? 'cours déplacé' : undefined,
      texte: `${c.classe} · ${c.local || 'local ?'}`,
    };
  }
  const resa = ds.reservations.find((r) => r.prof === prof && r.date === date && r.h === h);
  if (resa) {
    const classe = classesReservation(resa).join(', ');
    return { h, statut: 'cours', classe, local: resa.local, note: resa.note === 'remédiation' ? 'remédiation' : 'local réservé', texte: `${classe || 'Réservation'} · ${resa.local}` };
  }
  const hs = jour.map((x) => x.h);
  if (!hs.length) return { h, statut: 'pas-cours', texte: 'Pas cours ce jour-là' };
  if (h === MIDI) return { h, statut: 'midi', texte: 'Temps de midi' };
  if (h < Math.min(...hs)) return { h, statut: 'avant', texte: `Pas de cours avant H${Math.min(...hs)}` };
  if (h > Math.max(...hs)) return { h, statut: 'apres', texte: `A fini à ${periode(Math.max(...hs)).fin}` };
  return { h, statut: 'fourche', texte: 'Libre (fourche)' };
}

export const journeeProf = (ds: Dataset, prof: string, date: string): PositionProf[] =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => positionProf(ds, prof, date, h));

export type StatutClasse = 'cours' | 'etude' | 'remediation' | 'libre' | 'conge';

export interface PositionClasse {
  h: number;
  statut: StatutClasse;
  matiere?: string;
  prof?: string;
  local?: string;
  /** Changement par rapport à l'horaire habituel. */
  note?: string;
  texte: string;
}

/** Où est cette classe à cette heure ? */
export function positionClasse(ds: Dataset, classe: string, date: string, h: number): PositionClasse {
  if (conge(deIso(date))) return { h, statut: 'conge', texte: 'Congé' };
  const jour = jourSemaineIso(date);
  // Un cours déplacé vers cette heure (validé).
  const arrive = ds.deplacements.find((d) => d.statut !== 'En attente' && d.date === date && d.hVide === h && classesDe(d.classe).includes(classe));
  if (arrive) {
    const c = coursDuProf(ds, arrive.prof, date).find((x) => x.h === h && x.deplace);
    return { h, statut: 'cours', matiere: c?.matiere, prof: arrive.prof, local: c?.local, note: 'cours déplacé ici', texte: `${c?.matiere || 'Cours'} · ${c?.local ?? ''}` };
  }
  const prevus = ds.cours.filter((c) => c.jour === jour && c.h === h && c.classes.includes(classe));
  for (const c of prevus) {
    const parti = ds.deplacements.some((d) => d.statut !== 'En attente' && d.prof === c.prof && d.dateOrigine === date && d.hOrigine === h);
    if (parti) return { h, statut: 'libre', matiere: c.matiere, note: 'cours déplacé ailleurs', texte: 'Heure libre (cours déplacé)' };
    if (absentA(ds, c.prof, date, h)) {
      const remed = ds.reservations.find((r) => r.date === date && r.h === h && r.note === 'remédiation' && classesReservation(r).includes(classe));
      if (remed) return { h, statut: 'remediation', matiere: c.matiere, prof: remed.prof, local: remed.local, note: 'remédiation', texte: `Remédiation · ${remed.local}` };
      const propose = ds.deplacements.find((d) => d.statut === 'En attente' && d.date === date && d.hVide === h && classesDe(d.classe).includes(classe));
      return {
        h, statut: 'etude', matiere: c.matiere, prof: c.prof, local: c.local,
        note: propose ? `proposition de ${nomAffiche(propose.prof)} à valider` : 'prof absent',
        texte: `Étude (${c.matiere || 'cours'} sans prof)`,
      };
    }
    const resa = ds.reservations.find((r) => r.date === date && r.h === h && r.prof === c.prof && r.note !== 'remédiation');
    const local = resa?.local ?? c.local;
    return { h, statut: 'cours', matiere: c.matiere, prof: c.prof, local, note: resa && resa.local !== c.local ? 'local changé' : undefined, texte: `${c.matiere || 'Cours'} · ${local}` };
  }
  return { h, statut: 'libre', texte: 'Pas cours' };
}

export const journeeClasse = (ds: Dataset, classe: string, date: string): PositionClasse[] =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => positionClasse(ds, classe, date, h));

export const journeeLocal = (ds: Dataset, code: string, date: string): InfoLocal[] =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => etatLocal(ds, '', code, date, h));

export interface Libre {
  prof: string;
  /** Sûr d'être à l'école : il a cours avant et après cette heure. */
  fourche: boolean;
  texte: string;
}

/** Les profs libres à cette heure (les plus sûrs d'abord : en fourche). */
export function profsLibres(ds: Dataset, date: string, h: number, sauf: string[] = []): Libre[] {
  const sortie: Libre[] = [];
  for (const prof of tousLesProfs(ds)) {
    if (sauf.includes(prof)) continue;
    const p = positionProf(ds, prof, date, h);
    if (p.statut === 'fourche') sortie.push({ prof, fourche: true, texte: 'en fourche' });
    else if (p.statut === 'avant' || p.statut === 'apres') sortie.push({ prof, fourche: false, texte: p.texte.toLowerCase() });
  }
  return sortie.sort((a, b) => Number(b.fourche) - Number(a.fourche) || a.prof.localeCompare(b.prof));
}

export const tousLesProfs = (ds: Dataset): string[] => [...new Set(ds.cours.map((c) => c.prof))].sort();

export const toutesLesClasses = (ds: Dataset): string[] =>
  [...new Set([...ds.cours.flatMap((c) => c.classes), ...ds.coursEleves.flatMap((c) => c.classes)])].filter(Boolean).sort(triClasse);

/** 1CA, 1CB, 2SA… 6TQB : le degré d'abord, puis le reste. */
export function triClasse(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true });
}

export type Trouve = { type: 'prof'; nom: string } | { type: 'classe'; nom: string } | { type: 'local'; nom: string };

/** Recherche tolérante : « lam » → LAMBERT, « 3tq » → 3TQA, 3TQB, « bf 110 » → BF110. */
export function rechercher(ds: Dataset, texte: string, max = 8): Trouve[] {
  const q = sansAccents(texte);
  if (!q) return [];
  const score = (nom: string): number => {
    const n = sansAccents(nom);
    if (n === q) return 3;
    if (n.startsWith(q)) return 2;
    return n.includes(q) ? 1 : 0;
  };
  const tous: (Trouve & { s: number })[] = [
    ...toutesLesClasses(ds).map((nom) => ({ type: 'classe' as const, nom, s: score(nom) })),
    ...tousLesProfs(ds).map((nom) => ({ type: 'prof' as const, nom, s: score(nom) })),
    ...ds.locaux.map((l) => ({ type: 'local' as const, nom: l.code, s: score(l.code) })),
  ];
  return tous
    .filter((t) => t.s > 0)
    .sort((a, b) => b.s - a.s || a.nom.length - b.nom.length || a.nom.localeCompare(b.nom))
    .slice(0, max)
    .map(({ type, nom }) => ({ type, nom }) as Trouve);
}

export interface HeureEleve {
  h: number;
  cours?: CoursEleve;
  changements: Changement[];
}

/** La journée d'une classe vue par les élèves : horaire sans nom de prof + changements publiés. */
export function journeeEleve(ds: Dataset, classe: string, date: string): HeureEleve[] {
  if (conge(deIso(date))) return [];
  const jour = jourSemaineIso(date);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => ({
    h,
    cours: ds.coursEleves.find((c) => c.jour === jour && c.h === h && c.classes.includes(classe)),
    changements: ds.changements.filter((c) => c.date === date && c.h === h && c.classe === classe),
  }));
}

/** Nom lisible : « LAMBERT » → « Lambert ». */
export const affiche = nomAffiche;
