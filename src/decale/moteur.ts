// Décale : le moteur.
// Il part des heures libérées (collègues absents) et de ton horaire, et cherche les meilleures
// combinaisons de déplacements pour toi : commencer plus tard, finir plus tôt, combler une fourche,
// libérer un jour. Chaque déplacement vient de optionsPour, donc des mêmes règles et des mêmes
// contrôles que Be Happi et Power Apps (mêmes classes, prof libre, local…) ; le moteur ne fait
// que choisir et combiner, puis expliquer.
//
// Ce qu'un déplacement seul ne voit pas et qu'une combinaison voit : avancer tes deux dernières
// heures du vendredi te fait finir 2 h plus tôt, alors qu'avancer l'avant-dernière seule ne change
// rien. Le moteur évalue donc des plans entiers, jour par jour.

import type { Dataset, Deplacement } from '../data/types';
import { JOURS, MIDI, conge, deIso, dureeTxt, heureTxt, iso, jourSemaineIso, periode, plusJoursIso, prochainJourDeCours } from '../lib/calendar';
import { optionsPour, verifierDeplacement, type OptionDeplacement } from '../logic/deplacements';
import { absentA, classesDe, classesReservation, coursDuProf, coursSansProf, heuresDeLaClasse, memesClasses, nomAffiche, seCroisent } from '../logic/horaire';

export type Occasion = OptionDeplacement;

/** Ce qui compte pour le prof (réglé sur l'appareil). */
export interface Priorites {
  finTot: boolean;
  debutTard: boolean;
  fourches: boolean;
}
export const PRIORITES_DEFAUT: Priorites = { finTot: true, debutTard: true, fourches: true };

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const jourDe = (date: string): string => JOURS[jourSemaineIso(date)];
const liste = (xs: string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}` : xs[0] ?? '');
const lundiDe = (date: string): string => plusJoursIso(date, 1 - jourSemaineIso(date));

// ---------------------------------------------------------------------------------------------
// Le temps regardé
// ---------------------------------------------------------------------------------------------

/**
 * Les deux semaines regardées : celle du prochain jour de cours (aujourd'hui s'il y a cours) et la
 * suivante. Pendant un congé, on regarde donc directement la rentrée.
 */
export function semaines(aujourdhui: string): [string, string] {
  const depart = iso(prochainJourDeCours(deIso(aujourdhui), true));
  const lundi = lundiDe(depart);
  return [lundi, plusJoursIso(lundi, 7)];
}

/** Les jours de cours d'une semaine (lundi → vendredi, sans les congés). */
export function joursDeCours(lundi: string): string[] {
  return [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n)).filter((d) => !conge(deIso(d)));
}

/** Les jours de cours des deux semaines, à partir d'aujourd'hui. */
export function horizon(aujourdhui: string): string[] {
  const [s1, s2] = semaines(aujourdhui);
  return [...joursDeCours(s1), ...joursDeCours(s2)].filter((d) => d >= aujourdhui);
}

/** Toutes les occasions : chaque heure libérée où tu peux avancer un de tes cours. */
export function occasions(ds: Dataset, moi: string, jours: string[], aujourdhui: string, heurePassee: number): Occasion[] {
  const tout: Occasion[] = [];
  for (const date of jours)
    for (let h = 1; h <= 9; h++) {
      if (h === MIDI) continue;
      tout.push(...optionsPour(ds, moi, date, h, aujourdhui, heurePassee));
    }
  return tout;
}

// ---------------------------------------------------------------------------------------------
// Une journée, avant et après
// ---------------------------------------------------------------------------------------------

export interface Journee {
  heures: number[];
  /** Début du premier cours et fin du dernier, en minutes depuis minuit. */
  debut: number | null;
  fin: number | null;
  /** Heures vides entre deux cours (H5, le temps de midi, n'en est pas une). */
  fourches: number[];
}

export function journee(heures: Iterable<number>): Journee {
  const hs = [...new Set(heures)].sort((a, b) => a - b);
  if (!hs.length) return { heures: [], debut: null, fin: null, fourches: [] };
  const min = hs[0];
  const max = hs[hs.length - 1];
  const fourches: number[] = [];
  for (let h = min + 1; h < max; h++) if (!hs.includes(h) && h !== MIDI) fourches.push(h);
  return { heures: hs, debut: periode(min).dm, fin: periode(max).fm, fourches };
}

export interface EffetJour {
  date: string;
  avant: Journee;
  apres: Journee;
  /** Minutes : positif = tu commences plus tard. */
  matin: number;
  /** Minutes : positif = tu finis plus tôt. */
  soir: number;
  /** Tu n'as plus cours ce jour-là. */
  libre: boolean;
  /** Tu n'avais pas cours ce jour-là. */
  nouveau: boolean;
  /** Fourches où arrive un cours. */
  comblees: number[];
  /** Fourches qui apparaissent (un cours part du milieu de ta journée). */
  creees: number[];
}

export function effetJour(date: string, avant: Journee, apres: Journee): EffetJour {
  const libre = avant.heures.length > 0 && apres.heures.length === 0;
  const nouveau = avant.heures.length === 0 && apres.heures.length > 0;
  const deux = !libre && !nouveau && avant.debut !== null && apres.debut !== null;
  const premiere = apres.heures[0];
  const derniere = apres.heures[apres.heures.length - 1];
  return {
    date,
    avant,
    apres,
    matin: deux ? apres.debut! - avant.debut! : 0,
    soir: deux ? avant.fin! - apres.fin! : 0,
    libre,
    nouveau,
    // Comblée : un cours arrive dans la fourche, et elle reste au milieu de la journée (sinon c'est
    // déjà compté comme un début plus tard ou une fin plus tôt).
    comblees: avant.fourches.filter((h) => apres.heures.includes(h) && h > premiere && h < derniere),
    creees: apres.fourches.filter((h) => !avant.fourches.includes(h)),
  };
}

const duree = (j: Journee): number => (j.debut !== null && j.fin !== null ? j.fin - j.debut : 0);

/** Minutes gagnées (positives) et perdues (positives aussi) sur une journée. */
export function bilanMinutes(e: EffetJour): { gain: number; perte: number } {
  if (e.libre) return { gain: duree(e.avant), perte: 0 };
  if (e.nouveau) return { gain: 0, perte: duree(e.apres) };
  return {
    gain: Math.max(0, e.matin) + Math.max(0, e.soir),
    perte: Math.max(0, -e.matin) + Math.max(0, -e.soir),
  };
}

// ---------------------------------------------------------------------------------------------
// Les points : ce que vaut un plan pour toi, puis pour tes classes
// ---------------------------------------------------------------------------------------------

const POIDS = {
  /** Une minute gagnée qui compte pour toi, et une qui compte moins (priorité décochée). */
  minute: 1,
  minuteFaible: 0.35,
  /** Une minute perdue pèse plus lourd qu'une minute gagnée. */
  perte: 1.6,
  jourLibre: 240,
  jourNouveau: 420,
  fourche: 35,
  fourcheFaible: 8,
  /** Côté classes : finir plus tôt ou commencer plus tard, ou garder une étude ailleurs. */
  classeBord: 15,
  classeEtude: 8,
  /** L'étude de l'heure libérée est évitée. */
  trou: 10,
  /** Un cours de la semaine suivante : un peu moins naturel. */
  semaineSuivante: 10,
};

export function pointsJour(e: EffetJour, p: Priorites): number {
  if (e.libre) return POIDS.jourLibre + duree(e.avant) * 0.5;
  if (e.nouveau) return -(POIDS.jourNouveau + duree(e.apres));
  const wm = p.debutTard ? POIDS.minute : POIDS.minuteFaible;
  const ws = p.finTot ? POIDS.minute : POIDS.minuteFaible;
  const wf = p.fourches ? POIDS.fourche : POIDS.fourcheFaible;
  let s = 0;
  s += e.matin > 0 ? e.matin * wm : e.matin * POIDS.perte;
  s += e.soir > 0 ? e.soir * ws : e.soir * POIDS.perte;
  // Une fourche de moins, qu'un cours la comble ou que ta journée commence après elle.
  s += (e.avant.fourches.length - e.apres.fourches.length) * wf;
  return s;
}

export interface EffetClasse {
  classe: string;
  texte: string;
  signe: 'gain' | 'neutre' | 'perte';
}

/** Ce que le déplacement change pour ses classes, le jour où le cours part. */
export function effetClasses(ds: Dataset, o: Occasion): { points: number; effets: EffetClasse[] } {
  const effets: EffetClasse[] = [];
  let points = POIDS.trou - (o.semaineSuivante ? POIDS.semaineSuivante : 0);
  const jO = jourDe(o.dateO);
  const jC = jourDe(o.date);
  const article = (cl: string) => `la ${cl}`;
  for (const cl of o.classes) {
    const hs = heuresDeLaClasse(ds, cl, o.dateO);
    const reste = hs.filter((x) => x !== o.hO);
    const memeJour = o.dateO === o.date;
    // Le jour même, l'heure libérée compte dans sa journée.
    const apres = memeJour ? [...reste, o.h] : reste;
    let texte: string;
    let signe: EffetClasse['signe'];
    if (!apres.length) {
      texte = `${capital(article(cl))} n’a plus cours ${jO}`;
      signe = 'gain';
      points += POIDS.classeBord;
    } else if (Math.max(...apres) < Math.max(...hs)) {
      texte = `${capital(article(cl))} finit plus tôt ${jO}`;
      signe = 'gain';
      points += POIDS.classeBord;
    } else if (Math.min(...apres) > Math.min(...hs)) {
      texte = `${capital(article(cl))} commence plus tard ${jO}`;
      signe = 'gain';
      points += POIDS.classeBord;
    } else {
      texte = `${capital(article(cl))} a cours ${jC} H${o.h} au lieu de l’étude, mais aura étude ${jO} H${o.hO}`;
      signe = 'neutre';
      points -= POIDS.classeEtude;
    }
    effets.push({ classe: cl, texte, signe });
  }
  return { points, effets };
}

// ---------------------------------------------------------------------------------------------
// Les plans
// ---------------------------------------------------------------------------------------------

export interface Plan {
  cle: string;
  /** Les déplacements, dans l'ordre de l'heure libérée. */
  deplacements: Occasion[];
  score: number;
  /** La part du score qui vient de tes journées. */
  pointsProf: number;
  /** Les jours qui changent, dans l'ordre. */
  effets: EffetJour[];
  classes: EffetClasse[];
  gain: number;
  perte: number;
}

const cleOrigine = (o: Occasion) => `${o.dateO}|${o.hO}`;
const cleCible = (o: Occasion) => `${o.date}|${o.h}`;
const clePlan = (sel: Occasion[]) => sel.map((o) => o.cle).sort().join(' ');

/** Les heures de ton horaire, jour par jour (avec tes demandes en attente). */
export function mesHeures(ds: Dataset, moi: string): (date: string) => number[] {
  const cache = new Map<string, number[]>();
  return (date: string) => {
    let hs = cache.get(date);
    if (!hs) {
      hs = coursDuProf(ds, moi, date, true).map((c) => c.h);
      cache.set(date, hs);
    }
    return hs;
  };
}

interface Evaluateur {
  (sel: Occasion[]): { score: number; pointsProf: number; effets: EffetJour[] };
}

function evaluateur(heures: (d: string) => number[], p: Priorites, pointsClasses: Map<string, number>): Evaluateur {
  return (sel) => {
    const jours = new Map<string, Set<number>>();
    const de = (d: string) => {
      let s = jours.get(d);
      if (!s) {
        s = new Set(heures(d));
        jours.set(d, s);
      }
      return s;
    };
    for (const o of sel) {
      de(o.dateO).delete(o.hO);
      de(o.date).add(o.h);
    }
    const effets: EffetJour[] = [];
    let pointsProf = 0;
    for (const [d, s] of [...jours].sort(([a], [b]) => a.localeCompare(b))) {
      const e = effetJour(d, journee(heures(d)), journee(s));
      const change = e.libre || e.nouveau || e.matin !== 0 || e.soir !== 0 || e.comblees.length > 0 || e.creees.length > 0;
      if (!change) continue;
      effets.push(e);
      pointsProf += pointsJour(e, p);
    }
    let score = pointsProf;
    for (const o of sel) score += pointsClasses.get(o.cle) ?? 0;
    return { score, pointsProf, effets };
  };
}

/** Deux occasions peuvent-elles aller ensemble ? (Un cours ne part qu'une fois, une heure n'accueille qu'un cours.) */
const compatibles = (a: Occasion, b: Occasion): boolean => cleOrigine(a) !== cleOrigine(b) && cleCible(a) !== cleCible(b);

/** Ce que le prof y gagne, jour par jour : deux plans avec la même empreinte se valent pour lui. */
const empreinte = (effets: EffetJour[]): string =>
  effets.map((e) => `${e.date}:${e.libre ? 'L' : e.nouveau ? 'N' : `${e.matin}/${e.soir}/${e.comblees.join('.')}/${e.creees.join('.')}`}`).join(' ');

const LIMITE_EXACTE = 14;

/**
 * Les meilleurs plans (3 au plus), différents pour toi. Un plan n'allonge jamais ta semaine au
 * total : les points de tes journées doivent être positifs, sinon il n'est pas proposé.
 */
export function meilleursPlans(ds: Dataset, moi: string, occ: Occasion[], p: Priorites = PRIORITES_DEFAUT, max = 3): Plan[] {
  if (!occ.length) return [];
  const heures = mesHeures(ds, moi);
  const classes = new Map<string, { points: number; effets: EffetClasse[] }>();
  for (const o of occ) classes.set(o.cle, effetClasses(ds, o));
  const points = new Map([...classes].map(([k, v]) => [k, v.points]));
  const evaluer = evaluateur(heures, p, points);

  // Une occasion inutile seule peut servir en paire (la dernière heure part avec l'avant-dernière) :
  // on ne garde que celles qui rapportent seules, ou qui partagent un jour de départ avec une autre.
  const parJourDepart = new Map<string, number>();
  for (const o of occ) parJourDepart.set(o.dateO, (parJourDepart.get(o.dateO) ?? 0) + 1);
  const utiles = occ
    .map((o) => ({ o, seul: evaluer([o]).score }))
    .filter(({ o, seul }) => seul > 0 || (parJourDepart.get(o.dateO) ?? 0) > 1)
    .sort((a, b) => b.seul - a.seul)
    .map((x) => x.o);

  const trouves = new Map<string, { sel: Occasion[]; score: number; pointsProf: number; effets: EffetJour[] }>();
  const noter = (sel: Occasion[]) => {
    if (!sel.length) return;
    const k = clePlan(sel);
    if (trouves.has(k)) return;
    const r = evaluer(sel);
    // Un plan ne te fait jamais perdre au change (un jour libre compte plus que ses minutes), ne
    // t'ajoute jamais un jour de cours, et doit rapporter quelque chose.
    if (r.pointsProf < 0 || r.score <= 0) return;
    if (r.effets.some((e) => e.nouveau)) return;
    trouves.set(k, { sel: [...sel], ...r });
  };

  if (utiles.length <= LIMITE_EXACTE) {
    // Toutes les combinaisons compatibles (au plus 2^16, en pratique bien moins).
    const sel: Occasion[] = [];
    const parcourir = (i: number) => {
      if (i === utiles.length) {
        noter(sel);
        return;
      }
      const o = utiles[i];
      if (sel.every((x) => compatibles(x, o))) {
        sel.push(o);
        parcourir(i + 1);
        sel.pop();
      }
      parcourir(i + 1);
    };
    parcourir(0);
  } else {
    // Beaucoup d'occasions : on construit par paquets (seul, ou deux cours qui partent du même jour),
    // puis on cherche des variantes en écartant tour à tour chaque déplacement du meilleur plan.
    const glouton = (exclus: Set<string>): Occasion[] => {
      const pool = utiles.filter((o) => !exclus.has(o.cle));
      const paquets: Occasion[][] = pool.map((o) => [o]);
      for (let i = 0; i < pool.length; i++)
        for (let j = i + 1; j < pool.length; j++)
          if (pool[i].dateO === pool[j].dateO && compatibles(pool[i], pool[j])) paquets.push([pool[i], pool[j]]);
      const sel: Occasion[] = [];
      let actuel = 0;
      for (;;) {
        let mieux: Occasion[] | null = null;
        let gainMax = 0;
        for (const pq of paquets) {
          if (!pq.every((o) => sel.every((x) => compatibles(x, o)))) continue;
          const g = evaluer([...sel, ...pq]).score - actuel;
          if (g > gainMax + 1e-9) {
            gainMax = g;
            mieux = pq;
          }
        }
        if (!mieux) break;
        sel.push(...mieux);
        actuel += gainMax;
      }
      // Retirer ce qui ne sert plus.
      for (let i = sel.length - 1; i >= 0; i--) {
        const sans = sel.filter((_, j) => j !== i);
        if (evaluer(sans).score >= actuel) {
          sel.splice(i, 1);
          actuel = evaluer(sel).score;
        }
      }
      return sel;
    };
    const meilleur = glouton(new Set());
    noter(meilleur);
    for (const o of meilleur) noter(glouton(new Set([o.cle])));
    for (const o of utiles.slice(0, 12)) noter([o]);
  }

  // Les plus forts d'abord ; on écarte un plan contenu dans un meilleur, et un plan qui donne
  // exactement la même chose pour toi qu'un meilleur.
  const tries = [...trouves.values()].sort((a, b) => b.score - a.score || a.sel.length - b.sel.length);
  const gardes: typeof tries = [];
  const vues = new Set<string>();
  const contient = (grand: Occasion[], petit: Occasion[]) => petit.every((o) => grand.some((x) => x.cle === o.cle));
  for (const t of tries) {
    const e = empreinte(t.effets);
    if (vues.has(e)) continue;
    // Contenu dans un meilleur plan, ou un meilleur plan avec du négatif en plus : rien de neuf.
    if (gardes.some((g) => contient(g.sel, t.sel) || contient(t.sel, g.sel))) continue;
    vues.add(e);
    gardes.push(t);
    if (gardes.length >= max) break;
  }

  return gardes.map((t) => construirePlan(t.sel, t, classes));
}

function construirePlan(
  sel: Occasion[],
  r: { score: number; pointsProf: number; effets: EffetJour[] },
  classes: Map<string, { points: number; effets: EffetClasse[] }>,
): Plan {
  const deplacements = [...sel].sort((a, b) => a.date.localeCompare(b.date) || a.h - b.h);
  const tot = r.effets.map(bilanMinutes).reduce((a, b) => ({ gain: a.gain + b.gain, perte: a.perte + b.perte }), { gain: 0, perte: 0 });
  return {
    cle: clePlan(sel),
    deplacements,
    score: Math.round(r.score),
    pointsProf: Math.round(r.pointsProf),
    effets: r.effets,
    classes: deplacements.flatMap((o) => classes.get(o.cle)?.effets ?? []),
    gain: tot.gain,
    perte: tot.perte,
  };
}

/** Un plan fait main (déplacements retirés ou ajoutés par le prof) : mêmes effets, mêmes phrases. */
export function planDe(ds: Dataset, moi: string, sel: Occasion[], p: Priorites = PRIORITES_DEFAUT): Plan | null {
  if (!sel.length) return null;
  const classes = new Map(sel.map((o) => [o.cle, effetClasses(ds, o)]));
  const evaluer = evaluateur(mesHeures(ds, moi), p, new Map([...classes].map(([k, v]) => [k, v.points])));
  return construirePlan(sel, evaluer(sel), classes);
}

/** Les heures de cours d'un jour une fois le plan fait. */
export function heuresApres(heures: number[], date: string, sel: Occasion[]): number[] {
  const s = new Set(heures);
  for (const o of sel) {
    if (o.dateO === date) s.delete(o.hO);
    if (o.date === date) s.add(o.h);
  }
  return [...s].sort((a, b) => a - b);
}

/** Deux occasions vont-elles ensemble dans un plan ? */
export const vontEnsemble = (a: Occasion, b: Occasion): boolean => compatibles(a, b);

/** Le plan vu comme des déplacements à enregistrer (Power Apps : « En attente »). */
export const enDeplacements = (moi: string, plan: Plan): Deplacement[] =>
  plan.deplacements.map((o) => ({ absent: o.absent, date: o.date, hVide: o.h, classe: o.classe, prof: moi, hOrigine: o.hO, dateOrigine: o.dateO, statut: 'En attente' }));

/**
 * Juste avant d'envoyer : chaque déplacement passe encore les contrôles, les autres du plan étant
 * déjà comptés (ils seront en attente juste avant lui).
 */
export function verifierPlan(ds: Dataset, moi: string, plan: Plan, aujourdhui: string, heurePassee: number): string[] {
  const deps = enDeplacements(moi, plan);
  const problemes: string[] = [];
  deps.forEach((d, i) => {
    const autres = deps.filter((_, j) => j !== i);
    const v = verifierDeplacement({ ...ds, deplacements: [...ds.deplacements, ...autres] }, d, aujourdhui, heurePassee);
    if (!v.ok) problemes.push(`${capital(jourDe(d.dateOrigine))} H${d.hOrigine} → ${jourDe(d.date)} H${d.hVide} : ${v.controles.filter((c) => !c.ok).map((c) => c.detail ?? c.libelle).join(' ')}`);
  });
  return problemes;
}

// ---------------------------------------------------------------------------------------------
// Les phrases
// ---------------------------------------------------------------------------------------------

export interface Phrase {
  texte: string;
  signe: 'gain' | 'perte' | 'neutre';
}

export function phrasesJour(e: EffetJour): Phrase[] {
  const j = capital(jourDe(e.date));
  const t = (m: number | null) => (m === null ? '' : heureTxt(m));
  if (e.libre) return [{ texte: `${j}, tu n’as plus cours`, signe: 'gain' }];
  if (e.nouveau) return [{ texte: `${j}, tu viens en plus, de ${t(e.apres.debut)} à ${t(e.apres.fin)}`, signe: 'perte' }];
  const sortie: Phrase[] = [];
  if (e.matin !== 0 && e.soir !== 0) {
    const signe = e.matin > 0 && e.soir > 0 ? 'gain' : e.matin < 0 && e.soir < 0 ? 'perte' : 'neutre';
    sortie.push({ texte: `${j}, tu es là de ${t(e.apres.debut)} à ${t(e.apres.fin)} au lieu de ${t(e.avant.debut)} à ${t(e.avant.fin)}`, signe });
  } else if (e.matin > 0) sortie.push({ texte: `${j}, tu commences à ${t(e.apres.debut)} au lieu de ${t(e.avant.debut)}`, signe: 'gain' });
  else if (e.matin < 0) sortie.push({ texte: `${j}, tu commences plus tôt : ${t(e.apres.debut)} au lieu de ${t(e.avant.debut)}`, signe: 'perte' });
  else if (e.soir > 0) sortie.push({ texte: `${j}, tu finis à ${t(e.apres.fin)} au lieu de ${t(e.avant.fin)}`, signe: 'gain' });
  else if (e.soir < 0) sortie.push({ texte: `${j}, tu finis plus tard : ${t(e.apres.fin)} au lieu de ${t(e.avant.fin)}`, signe: 'perte' });
  const heures = (hs: number[]) => liste(hs.map((h) => periode(h).debut));
  if (e.comblees.length === 1) sortie.push({ texte: `${j}, ta fourche de ${heures(e.comblees)} est comblée`, signe: 'gain' });
  else if (e.comblees.length > 1) sortie.push({ texte: `${j}, tes fourches de ${heures(e.comblees)} sont comblées`, signe: 'gain' });
  if (e.creees.length === 1) sortie.push({ texte: `${j}, une fourche apparaît à ${heures(e.creees)}`, signe: 'perte' });
  else if (e.creees.length > 1) sortie.push({ texte: `${j}, des fourches apparaissent à ${heures(e.creees)}`, signe: 'perte' });
  return sortie;
}

/**
 * Ce que tes demandes (en attente ou validées) changent déjà à tes journées, par rapport à ton
 * horaire sans elles : pour le dire une fois le plan envoyé.
 */
export function bilanDemandes(ds: Dataset, moi: string, jours: string[]): EffetJour[] {
  const mes = ds.deplacements.filter((d) => d.prof === moi && d.statut !== 'Refusé' && (jours.includes(d.date) || jours.includes(d.dateOrigine)));
  if (!mes.length) return [];
  const sans: Dataset = { ...ds, deplacements: ds.deplacements.filter((d) => !mes.includes(d)) };
  const touches = [...new Set(mes.flatMap((d) => [d.date, d.dateOrigine]))].sort();
  return touches
    .map((date) => effetJour(date, journee(coursDuProf(sans, moi, date, true).map((c) => c.h)), journee(coursDuProf(ds, moi, date, true).map((c) => c.h))))
    .filter((e) => e.libre || e.nouveau || e.matin !== 0 || e.soir !== 0 || e.comblees.length > 0 || e.creees.length > 0);
}

/** La phrase d'accroche pour des effets déjà acquis (tes demandes). */
export function accrocheEffets(effets: EffetJour[]): string | null {
  const jours = effets
    .filter((e) => bilanMinutes(e).gain > 0)
    .sort((a, b) => bilanMinutes(b).gain - bilanMinutes(a).gain)
    .map((e) => phrasesJour(e)[0])
    .filter((p) => p && p.signe !== 'perte');
  if (!jours.length) return null;
  const [a, b] = jours;
  return b ? `${a.texte}, et ${b.texte.charAt(0).toLowerCase()}${b.texte.slice(1)}` : a.texte;
}

/**
 * Le titre d'un plan : ce qu'il change pour toi, en deux jours au plus (dans l'ordre de la
 * semaine), pour distinguer les plans d'un coup d'œil.
 */
export function titrePlan(plan: Plan): string {
  const forts = [...plan.effets]
    .filter((e) => e.libre || e.matin > 0 || e.soir > 0)
    .sort((a, b) => bilanMinutes(b).gain - bilanMinutes(a).gain)
    .slice(0, 2)
    .sort((a, b) => a.date.localeCompare(b.date));
  const t = (m: number | null) => (m === null ? '' : heureTxt(m));
  if (forts.length === 1) {
    const e = forts[0];
    const j = capital(jourDe(e.date));
    if (e.libre) return `${j} libre`;
    if (e.matin > 0 && e.soir > 0) return `${j} ${t(e.apres.debut)} – ${t(e.apres.fin)}`;
    if (e.soir > 0) return `${j}, fini à ${t(e.apres.fin)}`;
    return `${j}, début à ${t(e.apres.debut)}`;
  }
  if (forts.length === 2) {
    const court = (e: EffetJour, i: number) => {
      const j = jourDe(e.date).slice(0, 3) + '.';
      const jj = i === 0 ? capital(j) : j;
      if (e.libre) return `${jj} libre`;
      if (e.matin > 0 && e.soir > 0) return `${jj} ${t(e.apres.debut)}–${t(e.apres.fin)}`;
      if (e.soir > 0) return `${jj} fini ${t(e.apres.fin)}`;
      return `${jj} dès ${t(e.apres.debut)}`;
    };
    return forts.map(court).join(', ');
  }
  const fourche = plan.effets.find((e) => e.comblees.length > 0);
  if (fourche) return `${capital(jourDe(fourche.date))} sans fourche`;
  return 'Pour tes élèves';
}

/** Gain net du plan, en texte : « 1 h 55 ». */
export const gainTexte = (plan: Plan): string => dureeTxt(Math.max(0, plan.gain - plan.perte));

/**
 * La phrase d'accroche : les jours où tu gagnes du temps (deux au plus), le plus fort d'abord.
 * Les fourches comblées et les effets pour les classes sont dans le détail.
 */
export function accroche(plan: Plan): string {
  const jours = plan.effets
    .filter((e) => bilanMinutes(e).gain > 0)
    .sort((a, b) => bilanMinutes(b).gain - bilanMinutes(a).gain)
    .map((e) => phrasesJour(e)[0])
    .filter((p) => p && p.signe !== 'perte');
  if (!jours.length) {
    const fourche = plan.effets.flatMap(phrasesJour).find((p) => p.signe === 'gain');
    return fourche ? fourche.texte : 'Tes élèves y gagnent, toi sans rien perdre';
  }
  const [a, b] = jours;
  return b ? `${a.texte}, et ${b.texte.charAt(0).toLowerCase()}${b.texte.slice(1)}` : a.texte;
}

// ---------------------------------------------------------------------------------------------
// Les heures libérées de tes classes, et pourquoi tu peux (ou pas) les prendre
// ---------------------------------------------------------------------------------------------

export type EtatHeure = 'plan' | 'possible' | 'toi' | 'prise' | 'non';

export interface HeureLiberee {
  cle: string;
  date: string;
  h: number;
  classes: string[];
  classe: string;
  absent: string;
  matiere: string;
  local: string;
  etat: EtatHeure;
  /** Les déplacements possibles vers cette heure (les meilleurs d'abord). */
  options: Occasion[];
  /** Pourquoi pas (non), ou pourquoi pas dans ton plan (possible). */
  raison?: string;
  /** Qui l'a reprise (prise), et comment. */
  par?: string;
  statut?: string;
}

/** Toutes les classes que tu as à ton horaire. */
export const mesClasses = (ds: Dataset, moi: string): Set<string> => new Set(ds.cours.filter((c) => c.prof === moi).flatMap((c) => c.classes));

export function heuresLiberees(
  ds: Dataset,
  moi: string,
  jours: string[],
  aujourdhui: string,
  heurePassee: number,
  occ: Occasion[],
  plan: Plan | null,
): HeureLiberee[] {
  const miennes = mesClasses(ds, moi);
  const sortie: HeureLiberee[] = [];
  for (const date of jours) {
    const jour = jourSemaineIso(date);
    for (let h = 1; h <= 9; h++) {
      if (date === aujourdhui && h <= heurePassee) continue;
      for (const c of ds.cours) {
        if (c.jour !== jour || c.h !== h || c.prof === moi || !absentA(ds, c.prof, date, h)) continue;
        if (!c.classes.some((cl) => miennes.has(cl))) continue;
        const base: HeureLiberee = {
          cle: `${date}|${h}|${c.id}`,
          date,
          h,
          classes: c.classes,
          classe: c.classe,
          absent: c.prof,
          matiere: c.matiere,
          local: c.local,
          etat: 'non',
          options: [],
        };
        const reprise = ds.deplacements.find((d) => d.statut !== 'Refusé' && d.date === date && d.hVide === h && seCroisent(classesDe(d.classe), c.classes));
        if (reprise) {
          sortie.push({
            ...base,
            etat: reprise.prof === moi ? 'toi' : 'prise',
            par: nomAffiche(reprise.prof),
            statut: reprise.statut,
            raison:
              reprise.prof === moi
                ? `Ton cours de ${jourDe(reprise.dateOrigine)} H${reprise.hOrigine} vient ici (${reprise.statut === 'Validé' ? 'validé' : 'en attente'}).`
                : `${nomAffiche(reprise.prof)} y avance son cours (${reprise.statut === 'Validé' ? 'validé' : 'en attente'}).`,
          });
          continue;
        }
        const remediation = ds.reservations.find((r) => r.date === date && r.h === h && seCroisent(classesReservation(r), c.classes));
        if (remediation) {
          sortie.push({
            ...base,
            etat: remediation.prof === moi ? 'toi' : 'prise',
            par: nomAffiche(remediation.prof),
            raison: remediation.prof === moi ? 'Tu as réservé cette heure pour la classe.' : `${nomAffiche(remediation.prof)} prend la classe${remediation.note === 'remédiation' ? ' en remédiation' : ''}.`,
          });
          continue;
        }
        const options = occ.filter((o) => o.date === date && o.h === h && o.absent === c.prof && memesClasses(o.classes, c.classes));
        if (options.length) {
          const dansPlan = plan?.deplacements.some((o) => options.some((x) => x.cle === o.cle));
          sortie.push({ ...base, options, etat: dansPlan ? 'plan' : 'possible', raison: dansPlan ? undefined : pourquoiHorsPlan(ds, moi, options, plan) });
          continue;
        }
        sortie.push({ ...base, raison: pourquoiPas(ds, moi, c.classes, date, h, aujourdhui, heurePassee) });
      }
    }
  }
  return sortie;
}

/** Une heure possible mais pas dans le plan : dire ce qu'elle coûterait, ou ce qui la bloque. */
function pourquoiHorsPlan(ds: Dataset, moi: string, options: Occasion[], plan: Plan | null): string {
  const heures = mesHeures(ds, moi);
  const o = options[0];
  const e = evaluateurSimple(heures, o);
  const pertes = e.flatMap(phrasesJour).filter((p) => p.signe === 'perte');
  if (pertes.length) return `${pertes[0].texte}.`;
  if (plan?.deplacements.some((x) => x.dateO === o.dateO && x.hO === o.hO)) return `Ton cours de ${jourDe(o.dateO)} H${o.hO} sert déjà dans le plan.`;
  const gains = e.flatMap(phrasesJour).filter((p) => p.signe === 'gain');
  if (!gains.length) return 'Rien à y gagner pour toi : seulement pour la classe.';
  return 'Moins intéressant que le plan choisi.';
}

/** Ce qu'un déplacement seul change pour toi, en phrases. */
export function effetsSeul(ds: Dataset, moi: string, o: Occasion): Phrase[] {
  return evaluateurSimple(mesHeures(ds, moi), o).flatMap(phrasesJour);
}

function evaluateurSimple(heures: (d: string) => number[], o: Occasion): EffetJour[] {
  const jours = new Map<string, Set<number>>();
  const de = (d: string) => jours.get(d) ?? (jours.set(d, new Set(heures(d))), jours.get(d)!);
  de(o.dateO).delete(o.hO);
  de(o.date).add(o.h);
  return [...jours].map(([d, s]) => effetJour(d, journee(heures(d)), journee(s))).filter((e) => e.libre || e.nouveau || e.matin || e.soir || e.comblees.length || e.creees.length);
}

/** Pourquoi tu ne peux pas prendre cette heure libérée : la première règle qui bloque. */
export function pourquoiPas(ds: Dataset, moi: string, classes: string[], date: string, h: number, aujourdhui: string, heurePassee: number): string {
  if (h === MIDI) return 'H5, c’est le temps de midi : jamais une heure d’arrivée.';
  if (absentA(ds, moi, date, h)) return 'Tu es noté·e absent·e à cette heure.';
  const mien = coursDuProf(ds, moi, date, true).find((x) => x.h === h);
  if (mien) return `Tu as cours à cette heure (${mien.classe}).`;
  if (ds.reservations.some((r) => r.prof === moi && r.date === date && r.h === h)) return 'Tu as une réservation à cette heure.';
  const exacts = ds.cours.filter((x) => x.prof === moi && memesClasses(x.classes, classes));
  if (!exacts.length) {
    return classes.length > 1
      ? `L’heure libérée est pour ${liste(classes)} ensemble : tu n’as pas de cours avec exactement ces classes.`
      : `Tu as la ${classes[0]} avec d’autres classes, jamais seule : il faut exactement les mêmes classes.`;
  }
  // Les cours qui pourraient venir : cette semaine à partir de ce jour-là, sinon la semaine suivante.
  const lundi = lundiDe(date);
  const candidats = (jours: string[]) =>
    jours.flatMap((d) =>
      coursDuProf(ds, moi, d)
        .filter((c) => !c.deplace && memesClasses(c.classes, classes))
        .filter((c) => !(d === date && c.h === h))
        .filter((c) => !(d === aujourdhui && c.h <= heurePassee))
        .map((c) => ({ d, c })),
    );
  let cands = candidats([0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n)).filter((d) => d >= date));
  if (!cands.length) cands = candidats([0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n + 7)));
  const nom = classes.length > 1 ? liste(classes) : `la ${classes[0]}`;
  if (!cands.length) return `Plus de cours avec ${nom} d’ici vendredi, ni la semaine suivante.`;
  const libres = cands.filter(({ d, c }) => !ds.deplacements.some((x) => x.prof === moi && x.statut !== 'Refusé' && x.dateOrigine === d && x.hOrigine === c.h));
  if (!libres.length) {
    const { d, c } = cands[0];
    return `Ton cours de ${jourDe(d)} H${c.h} avec ${nom} est déjà proposé ailleurs.`;
  }
  const refus = ds.decisions.find((x) => x.statut === 'Refusé' && x.prof === moi && x.date === date && x.hVide === h);
  if (refus && libres.every(({ d, c }) => ds.decisions.some((x) => x.statut === 'Refusé' && x.prof === moi && x.dateOrigine === d && x.hOrigine === c.h && x.date === date && x.hVide === h)))
    return `Refusé par l’éducateur${refus.commentaire ? ` : « ${refus.commentaire} »` : '.'}`;
  // Une partie du groupe déjà reprise (remédiation, réservation) : il faudrait exactement les mêmes classes.
  const libere = ds.cours.find((x) => x.jour === jourSemaineIso(date) && x.h === h && memesClasses(x.classes, classes) && absentA(ds, x.prof, date, h));
  const restant = libere && coursSansProf(ds, date, h).find((x) => x.id === libere.id);
  if (libere && restant && restant.classes.length < libere.classes.length)
    return `Une partie du groupe est déjà reprise (reste ${liste(restant.classes)}) : il faut exactement les mêmes classes.`;
  // Les contrôles de Be Happi et Power Apps disent le reste.
  const absent = libere?.prof ?? '';
  for (const { d, c } of libres) {
    const v = verifierDeplacement(ds, { absent, date, hVide: h, classe: c.classe, prof: moi, hOrigine: c.h, dateOrigine: d, statut: 'En attente' }, aujourdhui, heurePassee);
    const bloque = v.controles.find((x) => !x.ok);
    if (bloque) return bloque.detail ?? bloque.libelle;
  }
  return 'Pas de déplacement possible vers cette heure.';
}

/** Combien de temps reste-t-il avant l'heure libérée, si c'est aujourd'hui ? (pour dire « vite »). */
export function urgence(date: string, h: number, aujourdhui: string, minutes: number): number | null {
  if (date !== aujourdhui) return null;
  const reste = periode(h).dm - minutes;
  return reste > 0 ? reste : null;
}

/** Une heure de l'horizon tombe-t-elle la semaine suivante ? */
export const semaineSuivanteDe = (date: string, aujourdhui: string): boolean => lundiDe(date) > lundiDe(iso(prochainJourDeCours(deIso(aujourdhui), true)));
