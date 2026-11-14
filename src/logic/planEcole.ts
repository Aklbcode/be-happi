// Le plan de l'école : à partir des absences, le meilleur ensemble de déplacements pour TOUTE l'école.
//
// Chaque prof voit déjà, dans son horaire, les déplacements qui l'arrangent. Mais chacun choisit
// pour soi, et le premier arrivé prend l'heure libérée. Ici, on regarde toutes les heures libérées
// et tous les profs en même temps, et on cherche l'ensemble de déplacements qui vaut le plus :
//   - une heure libérée n'accueille qu'un cours, un cours ne part qu'une fois, un prof et une classe
//     ne sont qu'à un endroit à la fois ;
//   - chaque déplacement vient de optionsPour : les mêmes règles et les mêmes contrôles que l'horaire
//     du prof et que Power Apps (mêmes classes, prof libre, jamais H5, local…) ;
//   - aucun prof n'y perd : pas de jour de cours en plus, pas de journée plus longue, pas de fourche
//     en plus ;
//   - ce qui compte : le temps gagné par les profs, et les heures d'étude évitées pour de bon.
//     La journée d'une classe va de son premier à son dernier cours réellement donné. Si le prof de
//     sa première ou de sa dernière heure est absent, la classe est licenciée (elle arrive plus tard,
//     elle part plus tôt) : ce n'est pas une étude. Une heure sans cours au milieu de la journée,
//     elle, est une étude. Un cours qui part du milieu y laisse une heure libre : l'étude n'a fait
//     que changer de place. Et le plan n'ajoute d'étude à aucune classe.
//
// Le moteur ne décide rien : il prépare ce que l'éducateur ou le secrétariat peut proposer aux profs.
// Chaque prof propose ensuite lui-même dans son horaire, et l'éducateur valide, comme toujours.

import type { Dataset, Deplacement } from '../data/types';
import { JOURS, JOURS_COURTS, MIDI, deIso, dureeTxt, heureTxt, jourSemaineIso, periode } from '../lib/calendar';
import { optionsPour, verifierDeplacement, type OptionDeplacement } from './deplacements';
import { absentA, coursSansProf, estRemediation, heuresDeLaClasse, nomAffiche } from './horaire';
import { PRIORITES_DEFAUT } from './priorites';
import { bilanMinutes, dominos, effetJour, journee, mesHeures, phrasesJour, pointsJour, type Domino, type EffetJour, type Phrase } from '../decale/moteur';

// ---------------------------------------------------------------------------------------------
// Ce que vaut un plan (1 point ≈ 1 minute gagnée par un prof)
// ---------------------------------------------------------------------------------------------

export const POIDS_PLAN = {
  /** Une heure d'étude (ou une heure libre au milieu de la journée) en moins pour une classe. */
  etude: 45,
  /** Une heure de présence en moins pour une classe (elle finit plus tôt ou commence plus tard). */
  presence: 10,
  /** Un cours qui aurait été perdu (son prof est absent ce jour-là) et qui est donné quand même. */
  sauve: 50,
  /** Un cours de la semaine suivante : un peu moins naturel. */
  semaineSuivante: 10,
  /** Le local de l'heure libérée n'est pas disponible : un autre est proposé. */
  localChange: 2,
};

/** Au-delà, on ne garde que les meilleurs déplacements d'un prof (la recherche reste rapide). */
const MAX_PAR_PROF = 10;
/** Nombre de combinaisons essayées par groupe de profs liés, avant de s'arrêter au meilleur trouvé. */
const BUDGET = 20000;

// ---------------------------------------------------------------------------------------------
// Ce que le moteur renvoie
// ---------------------------------------------------------------------------------------------

export interface EffetClassePlan {
  classe: string;
  texte: string;
  /** gain : une étude évitée pour de bon ; neutre : l'étude change seulement de place. */
  signe: 'gain' | 'neutre';
}

export interface MouvementPlan {
  cle: string;
  prof: string;
  /** Le déplacement, tel que le prof le verrait dans son horaire. */
  option: OptionDeplacement;
  local: string;
  localChange: boolean;
  /** Le prof est noté absent le jour d'où part le cours : ce cours serait perdu sans le déplacement. */
  sauve: boolean;
  classes: EffetClassePlan[];
  /** Un collègue peut combler l'heure laissée dans la journée de la classe (à régler à la main). */
  domino?: Domino;
}

export interface PlanProf {
  prof: string;
  email?: string;
  mouvements: MouvementPlan[];
  /** Ce que le plan change à ses journées. */
  phrases: Phrase[];
  /** Minutes gagnées (nettes). */
  gain: number;
}

export interface HeureSansSolution {
  date: string;
  h: number;
  classe: string;
  absent: string;
  /** Au milieu de la journée de la classe : une étude. Sinon (première ou dernière heure) : la classe est licenciée. */
  etude: boolean;
}

export interface PlanEcole {
  jours: string[];
  profs: PlanProf[];
  /** Tous les déplacements, dans l'ordre des heures libérées. */
  mouvements: MouvementPlan[];
  bilan: {
    /** Heures de classe sans prof sur ces jours (à venir, hors temps de midi, pas encore reprises) : études et licenciements. */
    sansProf: number;
    /** Celles que le plan reprend. */
    reprises: number;
    /** Parmi elles : sans heure libre ailleurs en échange (la classe finit plus tôt, commence plus tard…). */
    sansEchange: number;
    /** Heures d'étude en moins pour les classes, tout compté (jamais négatif, pour aucune classe). */
    etudes: number;
    /** Minutes gagnées par les profs, au total. */
    minutesProfs: number;
    /** Heures que les dominos pourraient encore éviter. */
    dominos: number;
  };
  /** Les heures de classe qui restent sans prof après le plan. */
  restent: HeureSansSolution[];
  /** La valeur du plan (1 point ≈ 1 minute gagnée par un prof) : pour comparer deux plans. */
  points: number;
  /** Nombre de déplacements possibles examinés. */
  examines: number;
  /** Déplacements écartés à la dernière vérification (ils ne passaient plus avec le reste du plan). */
  ecartes: number;
  /** La recherche est allée au bout (sinon : le meilleur plan trouvé dans le temps imparti). */
  exact: boolean;
}

// ---------------------------------------------------------------------------------------------
// Les déplacements possibles, pour toute l'école
// ---------------------------------------------------------------------------------------------

interface Candidat {
  cle: string;
  prof: string;
  o: OptionDeplacement;
  origine: string;
  cible: string;
  /** Une classe à une heure : deux déplacements ne peuvent pas se la partager. */
  ressources: string[];
  /** Tout ce qu'un déplacement occupe : ses classes à l'heure d'arrivée, le cours du prof, l'heure du prof. */
  verrous: string[];
  sauve: boolean;
}

const cleClasses = (classes: string[]): string => [...classes].sort().join('|');

/** Les heures libérées qui peuvent accueillir un cours (groupe complet, heure à venir, pas H5). */
function heuresAPrendre(ds: Dataset, jours: string[], aujourdhui: string, heurePassee: number) {
  const sortie: { date: string; h: number; absent: string; classes: string[]; complet: boolean }[] = [];
  for (const date of jours) {
    if (date < aujourdhui) continue;
    for (let h = 1; h <= 9; h++) {
      if (h === MIDI || (date === aujourdhui && h <= heurePassee)) continue;
      for (const c of coursSansProf(ds, date, h)) {
        const entier = ds.cours.find((x) => x.id === c.id);
        sortie.push({ date, h, absent: c.prof, classes: c.classes, complet: !!entier && entier.classes.length === c.classes.length });
      }
    }
  }
  return sortie;
}

function candidats(ds: Dataset, jours: string[], aujourdhui: string, heurePassee: number, exclus: Set<string>): Candidat[] {
  // Qui a un cours avec exactement ces classes ?
  const profsDe = new Map<string, Set<string>>();
  for (const c of ds.cours) {
    if (estRemediation(c)) continue;
    const k = cleClasses(c.classes);
    let s = profsDe.get(k);
    if (!s) profsDe.set(k, (s = new Set()));
    s.add(c.prof);
  }
  const vus = new Set<string>();
  const parNom = new Map<string, Candidat[]>();
  for (const libre of heuresAPrendre(ds, jours, aujourdhui, heurePassee)) {
    if (!libre.complet) continue;
    for (const prof of profsDe.get(cleClasses(libre.classes)) ?? []) {
      if (prof === libre.absent) continue;
      const appel = `${prof}|${libre.date}|${libre.h}`;
      if (vus.has(appel)) continue;
      vus.add(appel);
      for (const o of optionsPour(ds, prof, libre.date, libre.h, aujourdhui, heurePassee, PRIORITES_DEFAUT)) {
        const cle = `${prof}|${o.cle}`;
        if (exclus.has(cle)) continue;
        const ressources = o.classes.map((cl) => `${o.date}|${o.h}|${cl}`);
        const cand: Candidat = {
          cle,
          prof,
          o,
          origine: `${o.dateO}|${o.hO}`,
          cible: `${o.date}|${o.h}`,
          ressources,
          verrous: [...ressources, `${prof}>${o.dateO}|${o.hO}`, `${prof}<${o.date}|${o.h}`],
          sauve: absentA(ds, prof, o.dateO, o.hO),
        };
        let liste = parNom.get(prof);
        if (!liste) parNom.set(prof, (liste = []));
        liste.push(cand);
      }
    }
  }
  return [...parNom.values()].flat();
}

// ---------------------------------------------------------------------------------------------
// Ce qu'un ensemble de déplacements change : pour un prof, pour les classes
// ---------------------------------------------------------------------------------------------

interface Outils {
  ds: Dataset;
  heuresProf: Map<string, (date: string) => number[]>;
  heuresClasse: Map<string, number[]>;
  /** Résultats déjà calculés (les mêmes combinaisons reviennent des milliers de fois). */
  memoProf: Map<string, number | null>;
  memoJour: Map<string, { points: number; etudes: number }>;
}

const heuresDuProf = (t: Outils, prof: string) => {
  let f = t.heuresProf.get(prof);
  if (!f) t.heuresProf.set(prof, (f = mesHeures(t.ds, prof)));
  return f;
};

const heuresDeClasse = (t: Outils, classe: string, date: string): number[] => {
  const k = `${classe}|${date}`;
  let hs = t.heuresClasse.get(k);
  if (!hs) t.heuresClasse.set(k, (hs = heuresDeLaClasse(t.ds, classe, date)));
  return hs;
};

/** Les journées d'un prof qui changent avec ces déplacements (les siens). */
function effetsProf(t: Outils, prof: string, sel: Candidat[]): EffetJour[] {
  const heures = heuresDuProf(t, prof);
  const jours = new Map<string, Set<number>>();
  const de = (d: string) => {
    let s = jours.get(d);
    if (!s) jours.set(d, (s = new Set(heures(d))));
    return s;
  };
  for (const c of sel) {
    de(c.o.dateO).delete(c.o.hO);
    de(c.o.date).add(c.o.h);
  }
  const effets: EffetJour[] = [];
  for (const [d, s] of [...jours].sort(([a], [b]) => a.localeCompare(b))) {
    const e = effetJour(d, journee(heures(d)), journee(s));
    if (e.libre || e.nouveau || e.matin !== 0 || e.soir !== 0 || e.comblees.length > 0 || e.creees.length > 0) effets.push(e);
  }
  return effets;
}

/**
 * Aucun prof n'y perd, jour par jour : pas de jour de cours en plus, pas de journée plus longue,
 * aucune fourche qui apparaît, et une journée décalée (finir plus tard pour commencer plus tard) n'est
 * gardée que si elle raccourcit nettement. (Plus strict que Décale, où le prof choisit lui-même et
 * peut perdre un jour pour gagner l'autre : ici, c'est l'école qui vient vers lui.)
 */
const acceptable = (effets: EffetJour[]): boolean =>
  effets.every((e) => !e.nouveau && e.creees.length === 0 && e.matin + e.soir >= 0 && pointsJour(e, PRIORITES_DEFAUT) >= 0);

/** Ce que ces déplacements valent pour le prof, ou null s'il y perd quelque chose. */
function pointsProf(t: Outils, prof: string, siens: Candidat[]): number | null {
  if (!siens.length) return 0;
  const k = `${prof}§${siens.map((c) => c.cle).sort().join('§')}`;
  let v = t.memoProf.get(k);
  if (v === undefined) {
    const effets = effetsProf(t, prof, siens);
    v = acceptable(effets) ? effets.reduce((s, e) => s + pointsJour(e, PRIORITES_DEFAUT), 0) : null;
    t.memoProf.set(k, v);
  }
  return v;
}

const etendue = (hs: number[]): number => (hs.length ? Math.max(...hs) - Math.min(...hs) + 1 : 0);

/** Les journées de classe qu'un déplacement touche : « classe|jour » (départ et arrivée). */
const joursTouches = (c: Candidat): string[] => {
  const ks: string[] = [];
  for (const cl of c.o.classes) {
    ks.push(`${cl}|${c.o.dateO}`);
    if (c.o.date !== c.o.dateO) ks.push(`${cl}|${c.o.date}`);
  }
  return ks;
};

interface JourneeClasse {
  /** Les heures de cours réellement données (la classe est à l'école du premier au dernier). */
  avant: number[];
  apres: number[];
}

/** La journée d'une classe une fois ces déplacements faits (ceux qui la touchent, tous profs confondus). */
function journeeClasse(t: Outils, k: string, touchant: Candidat[]): JourneeClasse {
  const i = k.indexOf('|');
  const classe = k.slice(0, i);
  const date = k.slice(i + 1);
  const avant = heuresDeClasse(t, classe, date);
  const apres = new Set(avant);
  // Un cours « sauvé » n'était déjà plus dans la journée de la classe (son prof est absent) : rien ne part.
  for (const c of touchant) if (c.o.dateO === date && !c.sauve) apres.delete(c.o.hO);
  for (const c of touchant) if (c.o.date === date) apres.add(c.o.h);
  return { avant, apres: [...apres].sort((a, b) => a - b) };
}

/** Les heures d'étude d'une journée de classe : les heures sans cours entre son premier et son dernier cours. */
const etudesDe = (heures: number[]): number => journee(heures).fourches.length;

/** Ce que vaut la journée d'une classe (études évitées, journée plus courte), et les études évitées. */
function bilanJourClasse(t: Outils, k: string, touchant: Candidat[]): { points: number; etudes: number } {
  if (!touchant.length) return { points: 0, etudes: 0 };
  const cle = `${k}§${touchant.map((c) => c.cle).sort().join('§')}`;
  let v = t.memoJour.get(cle);
  if (v === undefined) {
    const j = journeeClasse(t, k, touchant);
    const etudes = etudesDe(j.avant) - etudesDe(j.apres);
    v = { points: POIDS_PLAN.etude * etudes + POIDS_PLAN.presence * (etendue(j.avant) - etendue(j.apres)), etudes };
    t.memoJour.set(cle, v);
  }
  return v;
}

/** Ce qu'un déplacement vaut par lui-même, quel que soit le reste du plan. */
const constante = (c: Candidat): number =>
  (c.sauve ? POIDS_PLAN.sauve * c.o.classes.length : 0) - (c.o.semaineSuivante ? POIDS_PLAN.semaineSuivante : 0) - (c.o.localChange ? POIDS_PLAN.localChange : 0);

const parProf = (sel: Candidat[]): Map<string, Candidat[]> => {
  const m = new Map<string, Candidat[]>();
  for (const c of sel) {
    const l = m.get(c.prof);
    if (l) l.push(c);
    else m.set(c.prof, [c]);
  }
  return m;
};

/**
 * Un plan en cours de construction : on y ajoute et on en retire des déplacements, et on sait à
 * chaque fois ce que ça change à sa valeur sans tout recalculer (seuls le prof et les journées de
 * classe concernés sont réévalués). Deux garde-fous : aucun prof n'y perd, et aucune classe ne se
 * retrouve avec plus d'heures d'étude qu'avant.
 */
class Etat {
  private t: Outils;
  private profs = new Map<string, Candidat[]>();
  private jours = new Map<string, Candidat[]>();
  private verrous = new Map<string, Candidat>();
  /** Heures d'étude évitées, classe par classe. */
  private etudes = new Map<string, number>();
  total = 0;

  /** Au départ : les déplacements d'un même prof entrent ensemble (ils peuvent ne valoir qu'à plusieurs). */
  constructor(t: Outils, depart: Candidat[] = []) {
    this.t = t;
    for (const siens of parProf(depart).values()) if (this.delta(siens, []) !== null) this.changer(siens, []);
  }

  get mouvements(): Candidat[] {
    return [...this.profs.values()].flat();
  }

  /** Heures d'étude évitées par le plan, toutes classes confondues. */
  get etudesEvitees(): number {
    let n = 0;
    for (const v of this.etudes.values()) n += v;
    return n;
  }

  duProf(prof: string): Candidat[] {
    return this.profs.get(prof) ?? [];
  }

  /** Les déplacements du plan qui ne vont pas avec celui-ci (même classe à la même heure, même cours, même heure du prof). */
  genes(c: Candidat): Candidat[] {
    const g: Candidat[] = [];
    for (const v of c.verrous) {
      const x = this.verrous.get(v);
      if (x && !g.includes(x)) g.push(x);
    }
    return g;
  }

  contient(c: Candidat): boolean {
    return this.verrous.get(c.verrous[0]) === c;
  }

  /** Les déplacements qui touchent cette journée de classe. */
  duJour(k: string): Candidat[] {
    return this.jours.get(k) ?? [];
  }

  /** Ce que changerait le plan (ajouts, retraits), classe par classe et en points ; null si un prof ou une classe y perdait. */
  private essai(plus: Candidat[], moins: Candidat[]): { points: number; etudes: Map<string, number> } | null {
    let d = 0;
    const profs = new Set([...plus, ...moins].map((c) => c.prof));
    for (const p of profs) {
      const avant = this.duProf(p);
      const apres = [...avant.filter((x) => !moins.includes(x)), ...plus.filter((x) => x.prof === p)];
      const v = pointsProf(this.t, p, apres);
      if (v === null) return null;
      d += v - (pointsProf(this.t, p, avant) ?? 0);
    }
    const etudes = new Map<string, number>();
    const jours = new Set([...plus, ...moins].flatMap(joursTouches));
    for (const k of jours) {
      const avant = this.duJour(k);
      const apres = [...avant.filter((x) => !moins.includes(x)), ...plus.filter((x) => joursTouches(x).includes(k))];
      const a = bilanJourClasse(this.t, k, avant);
      const b = bilanJourClasse(this.t, k, apres);
      d += b.points - a.points;
      const classe = k.slice(0, k.indexOf('|'));
      etudes.set(classe, (etudes.get(classe) ?? 0) + b.etudes - a.etudes);
    }
    // Le plan n'ajoute d'étude à aucune classe.
    for (const [classe, n] of etudes) if ((this.etudes.get(classe) ?? 0) + n < 0) return null;
    for (const c of plus) d += constante(c);
    for (const c of moins) d -= constante(c);
    return { points: d, etudes };
  }

  /** Ce que vaudrait le changement (ajouts, retraits) ; null si un prof ou une classe y perdait. */
  delta(plus: Candidat[], moins: Candidat[]): number | null {
    return this.essai(plus, moins)?.points ?? null;
  }

  /** À n'appeler que si delta() n'a pas répondu null. */
  changer(plus: Candidat[], moins: Candidat[]): void {
    const e = this.essai(plus, moins);
    if (!e) return;
    this.total += e.points;
    for (const [classe, n] of e.etudes) this.etudes.set(classe, (this.etudes.get(classe) ?? 0) + n);
    for (const c of moins) {
      this.profs.set(c.prof, this.duProf(c.prof).filter((x) => x !== c));
      for (const k of joursTouches(c)) this.jours.set(k, this.duJour(k).filter((x) => x !== c));
      for (const v of c.verrous) this.verrous.delete(v);
    }
    for (const c of plus) {
      this.profs.set(c.prof, [...this.duProf(c.prof), c]);
      for (const k of joursTouches(c)) this.jours.set(k, [...this.duJour(k), c]);
      for (const v of c.verrous) this.verrous.set(v, c);
    }
  }
}

/** Deux déplacements ne vont pas ensemble : même classe à la même heure, ou même prof (même cours, même heure). */
const enConflit = (a: Candidat, b: Candidat): boolean =>
  (a.prof === b.prof && (a.origine === b.origine || a.cible === b.cible)) || a.ressources.some((r) => b.ressources.includes(r));

// ---------------------------------------------------------------------------------------------
// La recherche
// ---------------------------------------------------------------------------------------------

interface Lot {
  prof: string;
  cands: Candidat[];
  valeur: number;
  ressources: string[];
}

/** Les lots d'un prof : chaque combinaison de ses déplacements qui lui convient, ne coûte d'étude à aucune classe, et rapporte. */
function lotsDuProf(t: Outils, prof: string, siens: Candidat[]): Lot[] {
  const vide = new Etat(t);
  // Trop de possibilités : on garde les meilleures, vues une à une.
  let liste = siens;
  if (liste.length > MAX_PAR_PROF) {
    const note = new Map(liste.map((c) => [c.cle, vide.delta([c], []) ?? (pointsProf(t, prof, [c]) ?? -50) - 50]));
    liste = [...liste].sort((a, b) => note.get(b.cle)! - note.get(a.cle)! || a.cle.localeCompare(b.cle)).slice(0, MAX_PAR_PROF);
  }
  const lots: Lot[] = [];
  const sel: Candidat[] = [];
  const parcourir = (i: number) => {
    if (i === liste.length) {
      if (!sel.length) return;
      const v = vide.delta(sel, []);
      if (v !== null && v > 0.5) lots.push({ prof, cands: [...sel], valeur: v, ressources: sel.flatMap((c) => c.ressources) });
      return;
    }
    const c = liste[i];
    if (sel.every((x) => !enConflit(x, c))) {
      sel.push(c);
      parcourir(i + 1);
      sel.pop();
    }
    parcourir(i + 1);
  };
  parcourir(0);
  lots.sort((a, b) => b.valeur - a.valeur || a.cands.length - b.cands.length || a.cands.map((c) => c.cle).join(' ').localeCompare(b.cands.map((c) => c.cle).join(' ')));
  // Un lot qui prend au moins autant de place qu'un meilleur ne sert à rien.
  const gardes: Lot[] = [];
  for (const l of lots) if (!gardes.some((g) => g.ressources.every((r) => l.ressources.includes(r)))) gardes.push(l);
  return gardes;
}

/**
 * Le meilleur choix d'un lot par prof (ou aucun), sans qu'une classe soit prise deux fois à la même
 * heure. Les profs qui ne se disputent rien sont traités à part ; pour les autres, toutes les
 * combinaisons sont essayées, en coupant celles qui ne peuvent plus battre la meilleure.
 */
function choisirLots(lotsParProf: Map<string, Lot[]>, budget: number): { choisis: Lot[]; exact: boolean } {
  const profs = [...lotsParProf.keys()].filter((p) => lotsParProf.get(p)!.length > 0).sort();
  // Groupes de profs liés par une même heure libérée.
  const parent = new Map(profs.map((p) => [p, p]));
  const racine = (p: string): string => {
    let r = p;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(p, r);
    return r;
  };
  const premier = new Map<string, string>();
  for (const p of profs)
    for (const l of lotsParProf.get(p)!)
      for (const r of l.ressources) {
        const q = premier.get(r);
        if (q === undefined) premier.set(r, p);
        else parent.set(racine(p), racine(q));
      }
  const groupes = new Map<string, string[]>();
  for (const p of profs) {
    const r = racine(p);
    const g = groupes.get(r);
    if (g) g.push(p);
    else groupes.set(r, [p]);
  }

  const choisis: Lot[] = [];
  let exact = true;
  for (const groupe of groupes.values()) {
    const ordre = [...groupe].sort((a, b) => lotsParProf.get(b)![0].valeur - lotsParProf.get(a)![0].valeur || a.localeCompare(b));
    const prises = new Set<string>();
    const libre = (l: Lot) => l.ressources.every((r) => !prises.has(r));
    let meilleur: Lot[] = [];
    let meilleurTotal = 0;
    let essais = 0;
    const courant: Lot[] = [];
    const borne = (i: number): number => {
      let s = 0;
      for (let j = i; j < ordre.length; j++) {
        const l = lotsParProf.get(ordre[j])!.find(libre);
        if (l) s += l.valeur;
      }
      return s;
    };
    const chercher = (i: number, total: number) => {
      if (total > meilleurTotal + 1e-9) {
        meilleurTotal = total;
        meilleur = [...courant];
      }
      if (i === ordre.length || essais > budget) return;
      if (total + borne(i) <= meilleurTotal + 1e-9) return;
      essais++;
      for (const l of lotsParProf.get(ordre[i])!) {
        if (!libre(l)) continue;
        l.ressources.forEach((r) => prises.add(r));
        courant.push(l);
        chercher(i + 1, total + l.valeur);
        courant.pop();
        l.ressources.forEach((r) => prises.delete(r));
      }
      chercher(i + 1, total);
    };
    chercher(0, 0);
    if (essais > budget) exact = false;
    choisis.push(...meilleur);
  }
  return { choisis, exact };
}

/**
 * Le plan trouvé, regardé cette fois en entier : deux déplacements de profs différents peuvent
 * valoir plus ensemble (les deux dernières heures d'une classe partent : elle finit deux heures plus
 * tôt). On essaie d'ajouter ou d'échanger un déplacement tant que le plan s'améliore, puis on retire
 * ce qui ne rapporte rien.
 */
function ameliorer(t: Outils, depart: Candidat[], tous: Candidat[]): Etat {
  const etat = new Etat(t, depart);
  for (let tour = 0; tour < 200; tour++) {
    let mieux: { plus: Candidat; moins: Candidat[]; gain: number } | null = null;
    for (const c of tous) {
      if (etat.contient(c)) continue;
      const genes = etat.genes(c);
      if (genes.length > 2) continue;
      const gain = etat.delta([c], genes);
      if (gain !== null && gain > (mieux?.gain ?? 1e-6)) mieux = { plus: c, moins: genes, gain };
    }
    if (!mieux) break;
    etat.changer([mieux.plus], mieux.moins);
  }
  // Retirer ce qui ne rapporte rien (ni au prof, ni aux classes), les moins utiles d'abord.
  for (;;) {
    let pire: { c: Candidat; gain: number } | null = null;
    for (const c of etat.mouvements) {
      const gain = etat.delta([], [c]);
      if (gain !== null && gain >= -1e-6 && (!pire || gain > pire.gain)) pire = { c, gain };
    }
    if (!pire) break;
    etat.changer([], [pire.c]);
  }
  return etat;
}

const enDeplacement = (c: Candidat): Deplacement => ({
  absent: c.o.absent,
  date: c.o.date,
  hVide: c.o.h,
  classe: c.o.classe,
  prof: c.prof,
  hOrigine: c.o.hO,
  dateOrigine: c.o.dateO,
  statut: 'En attente',
});

// ---------------------------------------------------------------------------------------------
// Le plan
// ---------------------------------------------------------------------------------------------

const liste = (xs: string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}` : xs[0] ?? '');

/**
 * Le plan de l'école pour ces jours (les heures libérées de ces jours-là ; les cours qui viennent les
 * combler peuvent partir de plus tard dans la semaine, comme dans l'horaire du prof).
 */
export function planEcole(ds: Dataset, jours: string[], aujourdhui: string, heurePassee: number, reglages: { budget?: number } = {}): PlanEcole {
  const t: Outils = { ds, heuresProf: new Map(), heuresClasse: new Map(), memoProf: new Map(), memoJour: new Map() };
  const libres = heuresAPrendre(ds, jours, aujourdhui, heurePassee);
  const sansProf = libres.reduce((s, l) => s + l.classes.length, 0);

  // Chercher, puis revérifier chaque déplacement avec tous les autres du plan déjà comptés (comme
  // s'ils étaient proposés juste avant lui). Ce qui ne passe plus est écarté, et on recommence.
  const exclus = new Set<string>();
  let sel: Candidat[] = [];
  let etat = new Etat(t);
  let locaux = new Map<string, { local: string; change: boolean }>();
  let examines = 0;
  let exact = true;
  for (let passe = 0; passe < 4; passe++) {
    const tous = candidats(ds, jours, aujourdhui, heurePassee, exclus);
    examines = Math.max(examines, tous.length + exclus.size);
    const lots = new Map<string, Lot[]>();
    for (const [prof, siens] of parProf(tous)) lots.set(prof, lotsDuProf(t, prof, siens));
    const choix = choisirLots(lots, reglages.budget ?? BUDGET);
    exact = choix.exact;
    // Deux points de départ (le choix par lots, et rien du tout) : on garde le meilleur plan.
    const a = ameliorer(t, choix.choisis.flatMap((l) => l.cands), tous);
    const b = ameliorer(t, [], tous);
    etat = b.total > a.total + 1e-6 ? b : a;
    sel = etat.mouvements;

    const deps = sel.map(enDeplacement);
    locaux = new Map();
    const refuses: string[] = [];
    sel.forEach((c, i) => {
      const v = verifierDeplacement({ ...ds, deplacements: [...ds.deplacements, ...deps.filter((_, j) => j !== i)] }, deps[i], aujourdhui, heurePassee);
      if (v.ok) locaux.set(c.cle, { local: v.local, change: v.localChange });
      else refuses.push(c.cle);
    });
    if (!refuses.length) break;
    refuses.forEach((k) => exclus.add(k));
    // Dernière passe : on garde le plan sans ce qui ne passe pas.
    if (passe === 3) {
      etat = new Etat(t, sel.filter((c) => !refuses.includes(c.cle)));
      sel = etat.mouvements;
    }
  }

  // Ce que ça change pour les classes, déplacement par déplacement, dans le plan entier.
  const dsPlan: Dataset = { ...ds, deplacements: [...ds.deplacements, ...sel.map(enDeplacement)] };
  const dominosPris = new Set<string>();
  let sansEchange = 0;
  const mouvements: MouvementPlan[] = sel.map((c) => {
    const o = c.o;
    const jO = JOURS[jourSemaineIso(o.dateO)];
    let trou = false;
    const classes: EffetClassePlan[] = o.classes.map((cl) => {
      const k = `${cl}|${o.dateO}`;
      const { avant, apres } = journeeClasse(t, k, etat.duJour(k));
      if (c.sauve) {
        sansEchange++;
        return { classe: cl, texte: `Le cours de la ${cl} est sauvé : ${nomAffiche(c.prof)} est noté·e absent·e ${jO}`, signe: 'gain' };
      }
      if (!apres.length) {
        sansEchange++;
        return { classe: cl, texte: `La ${cl} n’a plus cours ${jO}`, signe: 'gain' };
      }
      const fin = apres[apres.length - 1];
      const debut = apres[0];
      if (o.hO > fin) {
        sansEchange++;
        return { classe: cl, texte: `La ${cl} finit à ${periode(fin).fin} ${jO} au lieu de ${periode(avant[avant.length - 1]).fin}`, signe: 'gain' };
      }
      if (o.hO < debut) {
        sansEchange++;
        return { classe: cl, texte: `La ${cl} commence à ${periode(debut).debut} ${jO} au lieu de ${periode(avant[0]).debut}`, signe: 'gain' };
      }
      if (o.hO === MIDI) {
        sansEchange++;
        return { classe: cl, texte: `La ${cl} retrouve son temps de midi ${jO}`, signe: 'gain' };
      }
      if (apres.includes(o.hO)) {
        // Un autre cours du plan arrive dans l'heure qui se libère.
        sansEchange++;
        return { classe: cl, texte: `L’heure de ${jO} H${o.hO} est reprise dans le même plan`, signe: 'gain' };
      }
      trou = true;
      return { classe: cl, texte: `La ${cl} aura une heure libre ${jO} en H${o.hO} à la place`, signe: 'neutre' };
    });
    // À l'arrivée : si l'heure libérée était la première ou la dernière de la classe, elle aurait été licenciée.
    for (const cl of o.classes) {
      const reel = heuresDeClasse(t, cl, o.date);
      if (!reel.length || o.h < Math.min(...reel) || o.h > Math.max(...reel))
        classes.push({ classe: cl, texte: `La ${cl} a cours ${JOURS[jourSemaineIso(o.date)]} en H${o.h} au lieu d’être licenciée`, signe: 'neutre' });
    }
    // Une étude reste dans la journée de la classe : un collègue peut-il la combler (domino) ?
    let domino: Domino | undefined;
    if (trou) {
      domino = dominos(dsPlan, c.prof, [{ classe: o.classe, classes: o.classes, dateO: o.dateO, hO: o.hO }], aujourdhui, heurePassee).find(
        (d) => !dominosPris.has(`${d.prof}|${d.date}|${d.hCollegue}`) && !dominosPris.has(`${d.prof}|${d.date}|${d.h}`),
      );
      if (domino) {
        dominosPris.add(`${domino.prof}|${domino.date}|${domino.hCollegue}`);
        dominosPris.add(`${domino.prof}|${domino.date}|${domino.h}`);
      }
    }
    const l = locaux.get(c.cle);
    return { cle: c.cle, prof: c.prof, option: o, local: l?.local ?? o.local, localChange: l?.change ?? o.localChange, sauve: c.sauve, classes, domino };
  });
  mouvements.sort((a, b) => a.option.date.localeCompare(b.option.date) || a.option.h - b.option.h || a.prof.localeCompare(b.prof));

  const profs: PlanProf[] = [...parProf(sel)].map(([prof, siens]) => {
    const effets = effetsProf(t, prof, siens);
    const tot = effets.map(bilanMinutes).reduce((a, b) => ({ gain: a.gain + b.gain, perte: a.perte + b.perte }), { gain: 0, perte: 0 });
    return {
      prof,
      email: ds.profs.find((p) => p.nom === prof)?.email,
      mouvements: mouvements.filter((m) => m.prof === prof),
      phrases: effets.flatMap(phrasesJour),
      gain: Math.max(0, tot.gain - tot.perte),
    };
  });
  const premier = (p: PlanProf) => `${p.mouvements[0].option.date}|${p.mouvements[0].option.h}`;
  profs.sort((a, b) => premier(a).localeCompare(premier(b)) || a.prof.localeCompare(b.prof));

  const prises = new Set(sel.flatMap((c) => c.ressources));
  const restent: HeureSansSolution[] = libres
    .flatMap((l) => l.classes.map((classe) => ({ date: l.date, h: l.h, classe, absent: l.absent })))
    .filter((x) => !prises.has(`${x.date}|${x.h}|${x.classe}`))
    .map((x) => {
      const k = `${x.classe}|${x.date}`;
      const { apres } = journeeClasse(t, k, etat.duJour(k));
      return { ...x, etude: apres.length > 0 && x.h > apres[0] && x.h < apres[apres.length - 1] };
    });

  return {
    jours,
    profs,
    mouvements,
    bilan: {
      sansProf,
      reprises: sel.reduce((s, c) => s + c.o.classes.length, 0),
      sansEchange,
      etudes: etat.etudesEvitees,
      minutesProfs: profs.reduce((s, p) => s + p.gain, 0),
      dominos: mouvements.filter((m) => m.domino).length,
    },
    restent,
    points: Math.round(etat.total),
    examines,
    ecartes: exclus.size,
    exact,
  };
}

// ---------------------------------------------------------------------------------------------
// Les phrases
// ---------------------------------------------------------------------------------------------

const jourCourt = (date: string): string => `${JOURS_COURTS[jourSemaineIso(date)].toLowerCase()}. ${deIso(date).getDate()}`;

/** « jeu. 19 H8 → mar. 17 H3 » */
export const trajetPlan = (m: MouvementPlan): string => `${jourCourt(m.option.dateO)} H${m.option.hO} → ${jourCourt(m.option.date)} H${m.option.h}`;

/** Le temps gagné par un prof, en texte : « 1 h 55 ». */
export const gainProf = (p: PlanProf): string => dureeTxt(p.gain);

/**
 * Le message Teams prêt pour un prof : ce qu'on lui propose, ce qu'il y gagne, et quoi faire.
 * C'est lui qui propose dans son horaire ; l'éducateur valide ensuite.
 */
export function messagePlan(p: PlanProf, aujourdhui: string): string {
  const jour = (date: string) => (date === aujourdhui ? 'aujourd’hui' : `${JOURS[jourSemaineIso(date)]} ${deIso(date).getDate()}`);
  const lignes = p.mouvements.map((m) => {
    const o = m.option;
    return `${nomAffiche(o.absent)} est absent·e ${jour(o.date)} en H${o.h} (${periode(o.h).debut}) avec ${o.classes.length > 1 ? `les ${liste(o.classes)}` : `la ${o.classes[0]}`} : tu pourrais y avancer ton cours de ${jour(o.dateO)} H${o.hO}${m.local ? ` (local ${m.local})` : ''}.`;
  });
  const gains = p.phrases.filter((x) => x.signe === 'gain').map((x) => x.texte);
  const pourClasses = p.mouvements.flatMap((m) => m.classes.filter((c) => c.signe === 'gain').map((c) => c.texte));
  const interet = gains.length ? ` ${gains.join('. ')}.` : pourClasses.length ? ` ${pourClasses[0]}.` : '';
  return `Bonjour, ${lignes.join(' ')}${interet} Si ça te convient, propose-le dans IPES App (Horaire, touche l’heure libérée) et je valide. Merci !`;
}

/** Le plan en texte simple (à copier : mail, note). */
export function textePlan(plan: PlanEcole): string {
  const lignes = plan.profs.flatMap((p) => [
    `${nomAffiche(p.prof)}${p.gain ? ` (gagne ${gainProf(p)})` : ''}`,
    ...p.mouvements.map((m) => `  ${trajetPlan(m)} · ${m.option.classe}${m.local ? ` · ${m.local}` : ''} · à la place de ${nomAffiche(m.option.absent)}`),
  ]);
  return lignes.join('\n');
}

/** L'heure d'une période, pour l'écran : « 10h25 ». */
export const debutDe = (h: number): string => heureTxt(periode(h).dm);

/** Pour les tests : les déplacements possibles et la valeur d'un ensemble donné (null si un prof y perd ou s'il y a conflit). */
export function essaisPlan(ds: Dataset, jours: string[], aujourdhui: string, heurePassee: number) {
  const t: Outils = { ds, heuresProf: new Map(), heuresClasse: new Map(), memoProf: new Map(), memoJour: new Map() };
  const tous = candidats(ds, jours, aujourdhui, heurePassee, new Set());
  const valeur = (cles: string[]): number | null => {
    const sel = tous.filter((c) => cles.includes(c.cle));
    for (let i = 0; i < sel.length; i++) for (let j = i + 1; j < sel.length; j++) if (enConflit(sel[i], sel[j])) return null;
    return new Etat(t).delta(sel, []);
  };
  return { cles: tous.map((c) => c.cle), valeur };
}
