// Moteur de Pulse : l'état de chaque local à une heure donnée, la « ligne de pouls » de la journée,
// les trajets (un prof, une classe), et ce qu'il faut savoir à une heure (le fil).
// Tout est calculé à partir du même jeu de données que Be Happi (démo, simulation ou SharePoint).

import type { Dataset, Local } from '../data/types';
import { BATIMENTS, type CodeBatiment } from '../data/batiments';
import { PERIODES, conge, deIso, jourSemaineIso } from '../lib/calendar';
import { absentA, classesReservation, coursDuProf, coursSansProf } from '../logic/horaire';
import { journeeEleve, localFerme, positionClasse, positionProf } from '../logic/ouest';

/** Ce que montre le plan. */
export type Lentille = 'locaux' | 'classes' | 'profs' | 'moi' | 'classe';

/**
 * L'état d'un local, en quatre couleurs de craie (plus l'ardoise) :
 * libre (bleu), étude = cours sans prof (jaune), fermé (rose), changement = réservé ou cours
 * déplacé (lilas) ; occupé reste discret ; « moi » est entouré.
 */
export type EtatCase = 'libre' | 'occupe' | 'etude' | 'ferme' | 'changement' | 'moi' | 'conge';

export interface CasePlan {
  code: string;
  etat: EtatCase;
  /** Qui est là (ou qui aurait dû y être, pour une étude). */
  classe?: string;
  prof?: string;
  matiere?: string;
  /** Une phrase complète, pour l'info-bulle et le panneau. */
  detail: string;
}

interface Occupant {
  source: 'reservation' | 'deplace' | 'cours';
  classe: string;
  prof: string;
  matiere?: string;
  note?: string;
  enAttente?: boolean;
}

/** Qui occupe ce local à cette heure (mêmes règles que l'écran Locaux de Be Happi). */
export function occupant(ds: Dataset, code: string, date: string, h: number): Occupant | null {
  const jour = jourSemaineIso(date);
  const res = ds.reservations.find((r) => r.local === code && r.date === date && r.h === h);
  if (res) return { source: 'reservation', classe: classesReservation(res).join(', ') || res.classe, prof: res.prof, note: res.note };

  for (const d of ds.deplacements.filter((x) => x.statut !== 'Refusé' && x.date === date && x.hVide === h)) {
    const ailleurs = ds.reservations.some((r) => r.prof === d.prof && r.date === date && r.h === h && r.note !== 'remédiation' && r.local !== code);
    if (ailleurs) continue;
    const libere = ds.cours.find((c) => c.prof === d.absent && c.jour === jour && c.h === h && c.local === code);
    if (libere) {
      const c = coursDuProf(ds, d.prof, date).find((x) => x.h === h && x.deplace);
      return { source: 'deplace', classe: d.classe, prof: d.prof, matiere: c?.matiere, enAttente: d.statut === 'En attente' };
    }
  }

  for (const c of ds.cours.filter((x) => x.local === code && x.jour === jour && x.h === h)) {
    const parti = ds.deplacements.some((d) => d.statut === 'Validé' && d.prof === c.prof && d.dateOrigine === date && d.hOrigine === h);
    if (parti || absentA(ds, c.prof, date, h)) continue;
    return { source: 'cours', classe: c.classe, prof: c.prof, matiere: c.matiere };
  }
  return null;
}

/** L'état d'un local à une heure (h de 1 à 9). */
export function etatLocalA(ds: Dataset, moi: string, code: string, date: string, h: number, vacants = coursSansProf(ds, date, h)): CasePlan {
  const cg = conge(deIso(date));
  if (cg || h < 1 || h > 9) return { code, etat: 'conge', detail: cg ? cg.nom : 'Pas de cours à cette heure' };
  if (localFerme(ds, code, date)) {
    const s = ds.signalements.find((x) => x.local === code && x.bloquant && !x.resolu);
    return { code, etat: 'ferme', detail: `Fermé : ${s ? sansLocal(s.titre, code) : 'problème signalé'}` };
  }
  const o = occupant(ds, code, date, h);
  if (o) {
    const remed = o.note === 'remédiation';
    const etat: EtatCase = o.prof === moi && moi ? 'moi' : o.source === 'cours' ? 'occupe' : 'changement';
    const detail =
      o.source === 'reservation'
        ? remed
          ? `Remédiation : ${o.classe} avec ${nomCourt(o.prof)}`
          : `Réservé par ${nomCourt(o.prof)}${o.classe && o.classe !== '—' ? ` pour ${o.classe}` : ''}`
        : o.source === 'deplace'
          ? `${o.classe} avec ${nomCourt(o.prof)}, cours déplacé${o.enAttente ? ' (à valider)' : ''}`
          : `${o.classe} avec ${nomCourt(o.prof)}${o.matiere ? `, ${o.matiere.toLowerCase()}` : ''}`;
    return { code, etat, classe: o.classe, prof: o.prof, matiere: o.matiere, detail };
  }
  const v = vacants.find((c) => c.local === code);
  if (v)
    return {
      code,
      etat: 'etude',
      classe: v.classe,
      prof: v.prof,
      matiere: v.matiere,
      detail: `${v.classe} sans prof${v.matiere ? ` (${v.matiere.toLowerCase()})` : ''} : la classe est à l’étude, le local est libre`,
    };
  return { code, etat: 'libre', detail: 'Libre' };
}

/** L'état de tous les locaux à une heure (h de 1 à 9). */
export function etatPlan(ds: Dataset, moi: string, date: string, h: number): Map<string, CasePlan> {
  const vacants = coursSansProf(ds, date, h);
  return new Map(ds.locaux.map((l) => [l.code, etatLocalA(ds, moi, l.code, date, h, vacants)]));
}

const sansLocal = (titre: string, code: string): string => titre.replace(new RegExp(`^\\s*${code}\\s*[·:–-]?\\s*`, 'i'), '').trim() || titre;

/** « LAMBERT » → « Lambert », « VAN DEN BOSCH » → « Van Den Bosch ». */
export const nomCourt = (nom: string): string =>
  nom
    .toLowerCase()
    .split(/([\s-])/)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join('');

/** Le code affiché dans une case : sans le bâtiment (« BF108 » → « 108 »). */
export function codeCourt(code: string): string {
  const m = /^(?:B[CFT]|PR)\s*(.+)$/i.exec(code);
  if (m) return m[1];
  if (/education physique/i.test(code)) return `Sport${/\d+$/.test(code) ? ` ${code.match(/\d+$/)![0]}` : ''}`;
  if (/atelier/i.test(code)) return 'Atelier';
  return code;
}

export interface BlocPlan {
  code: CodeBatiment;
  sigle: string;
  nom: string;
  etages: { etage: number; locaux: Local[] }[];
}

/** Les bâtiments dans l'ordre du terrain : PR (nord), BC (ouest), BF (milieu), BT (est), le reste. */
export function blocsPlan(locaux: Local[]): BlocPlan[] {
  const ordre: CodeBatiment[] = ['PR', 'C', 'F', 'T', 'Autres'];
  return ordre
    .map((code) => {
      const b = BATIMENTS.find((x) => x.code === code)!;
      const etages = b.etages
        .map((etage) => ({ etage, locaux: locaux.filter((l) => (l.batiment === code || (code === 'Autres' && !['T', 'F', 'C', 'PR'].includes(l.batiment))) && (code === 'Autres' || l.etage === etage)).sort((a, c) => a.code.localeCompare(c.code, 'fr', { numeric: true })) }))
        .filter((e) => e.locaux.length);
      return { code, sigle: b.sigle, nom: b.nom, etages };
    })
    .filter((b) => b.etages.length);
}

/** Une étape d'un trajet : où est quelqu'un (ou une classe) à l'heure h. */
export interface Etape {
  h: number;
  local: string;
  libelle: string;
  note?: string;
}

const H = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const trajetProf = (ds: Dataset, prof: string, date: string): Etape[] =>
  conge(deIso(date))
    ? []
    : H.map((h) => positionProf(ds, prof, date, h))
        .filter((p) => p.statut === 'cours' && !!p.local)
        .map((p) => ({ h: p.h, local: p.local!, libelle: p.classe ?? '', note: p.note }));

export const trajetClasse = (ds: Dataset, classe: string, date: string): Etape[] =>
  conge(deIso(date))
    ? []
    : H.map((h) => positionClasse(ds, classe, date, h))
        .filter((p) => (p.statut === 'cours' || p.statut === 'remediation') && !!p.local)
        .map((p) => ({ h: p.h, local: p.local!, libelle: p.matiere ?? '', note: p.note }));

/** Pour un élève : l'horaire de sa classe (sans nom de prof), et les changements publiés. */
export const trajetEleve = (ds: Dataset, classe: string, date: string): Etape[] =>
  journeeEleve(ds, classe, date)
    .filter((x) => !!x.cours?.local)
    .map((x) => ({ h: x.h, local: x.cours!.local, libelle: x.cours!.matiere, note: x.changements.length ? x.changements.map((c) => c.titre).join(' ; ') : undefined }));

/** Les profs absents à cette heure (personnel seulement). */
export const absentsA = (ds: Dataset, date: string, h: number): string[] =>
  [...new Set(ds.absences.filter((a) => a.date === date && h >= a.deH && h <= a.aH).map((a) => a.prof))].sort();

export interface PointPouls {
  h: number;
  /** Classes sans prof (à l'étude) : les pics de la ligne. */
  etudes: number;
  libres: number;
  absents: number;
}

/** La ligne de pouls d'une journée : une valeur par heure. */
export function pouls(ds: Dataset, date: string): PointPouls[] {
  if (conge(deIso(date))) return H.map((h) => ({ h, etudes: 0, libres: 0, absents: 0 }));
  return H.map((h) => {
    const plan = etatPlan(ds, '', date, h);
    let libres = 0;
    for (const c of plan.values()) if (c.etat === 'libre' || c.etat === 'etude') libres++;
    return { h, etudes: coursSansProf(ds, date, h).length, libres, absents: absentsA(ds, date, h).length };
  });
}

/** Ce qu'il faut savoir à une heure : le fil. */
export interface Fil {
  etudes: { classe: string; matiere: string; local: string; prof: string }[];
  absents: string[];
  fermes: { local: string; titre: string }[];
  libres: string[];
  arrivees: { classe: string; prof: string; local: string; enAttente: boolean }[];
}

export function filA(ds: Dataset, date: string, h: number, plan: Map<string, CasePlan>): Fil {
  const vides = [...plan.values()];
  return {
    etudes: coursSansProf(ds, date, h).map((c) => ({ classe: c.classe, matiere: c.matiere, local: c.local, prof: c.prof })),
    absents: absentsA(ds, date, h),
    fermes: vides.filter((c) => c.etat === 'ferme').map((c) => ({ local: c.code, titre: c.detail.replace(/^Fermé : /, '') })),
    libres: vides.filter((c) => c.etat === 'libre' || c.etat === 'etude').map((c) => c.code),
    arrivees: ds.deplacements
      .filter((d) => d.statut !== 'Refusé' && d.date === date && d.hVide === h)
      .map((d) => ({ classe: d.classe, prof: d.prof, local: vides.find((c) => c.prof === d.prof && c.etat !== 'occupe')?.code ?? '', enAttente: d.statut === 'En attente' })),
  };
}

/** Minute de la journée → l'heure de cours qu'on regarde (pendant une récré : la suivante). */
export function heureDe(minutes: number): number {
  for (const p of PERIODES) if (minutes < p.fm) return p.h;
  return 9;
}

/** Minute de la journée → ce qu'on dit de ce moment (« H4 », « Récré, H3 à 10h25 », « Fin des cours »). */
export function momentDe(minutes: number): { h: number; enCours: boolean; texte: string } {
  if (minutes < PERIODES[0].dm) return { h: 1, enCours: false, texte: `Avant les cours, H1 à ${PERIODES[0].debut}` };
  if (minutes >= PERIODES[8].fm) return { h: 9, enCours: false, texte: 'Fin des cours' };
  const p = PERIODES.find((x) => minutes < x.fm)!;
  if (minutes >= p.dm) return { h: p.h, enCours: true, texte: `H${p.h}` };
  return { h: p.h, enCours: false, texte: `Récré, H${p.h} à ${p.debut}` };
}
