// Happi, l'assistant de La Tour. Pas d'IA en ligne : il comprend les questions courantes de l'école
// (où est…, local libre…, créneau commun…, qui peut aider…, mon prochain cours…) et répond avec les
// mêmes données que l'app, en proposant des actions (message Teams, réservation, écran à ouvrir).
// Il ne décide jamais à la place de quelqu'un, et ne donne aucune info sur le personnel aux élèves.

import type { Dataset, Profil } from '../data/types';
import { sansAccents } from '../data/champs';
import { JOURS, MIDI, PERIODES, conge, dateLongue, deIso, estJourDeCours, iso, jourSemaine, jourSemaineIso, lundiDe, minutesDe, periode, plusJours, prochainJourDeCours, situation } from '../lib/calendar';
import { coursDuProf, coursSansProf, nomAffiche, peutPrendre } from './horaire';
import { etatLocal, libreJusque } from './occupation';
import { positionClasse, positionProf, profsLibres, tousLesProfs, toutesLesClasses, journeeEleve } from './ouest';
import { creneauxCommuns, groupes, noms, plage, bornes, type Groupe } from './collab';
import { opportunitesSemaine } from './deplacements';
import type { Priorites } from './priorites';
import { dispoMateriel } from './materiel';
import { etatPublication } from './publication';
import { statsPeriode } from './stats';

export interface Contexte {
  ds: Dataset;
  /** Nom du prof connecté (vide pour un élève ou un membre du personnel sans horaire). */
  moi: string;
  profil: Profil;
  maintenant: Date;
  heurePassee: number;
  /** Classe choisie par l'élève. */
  classeEleve?: string;
  /** Ce qui compte pour le prof dans un déplacement. */
  priorites?: Priorites;
}

export type Ton = 'indigo' | 'orange' | 'rose' | 'gris';

export type Action =
  | { type: 'lien'; libelle: string; href: string }
  | { type: 'teams-chat'; libelle: string; emails: string[]; noms: string[]; message: string; sujet?: string }
  | { type: 'teams-reunion'; libelle: string; sujet: string; debut: string; fin: string; emails: string[]; noms: string[]; contenu?: string }
  | { type: 'reserver-local'; libelle: string; local: string; date: string; h: number; classe: string }
  | { type: 'reserver-materiel'; libelle: string; rack: string; date: string; h: number; classe: string }
  | { type: 'signaler'; libelle: string; local: string; texte: string; urgent: boolean }
  | { type: 'question'; libelle: string; texte: string };

export interface Ligne {
  titre: string;
  sous?: string;
  ton?: Ton;
  action?: Action;
}

export type Bloc =
  | { type: 'lignes'; titre?: string; lignes: Ligne[] }
  | { type: 'journee'; titre: string; heures: { h: number; texte: string; ton: Ton; actuel: boolean }[] }
  | { type: 'puces'; titre?: string; puces: { texte: string; action?: Action }[] };

export type Intention =
  | 'ou-est' | 'locaux' | 'collab' | 'aide' | 'etude' | 'absents' | 'deplacer' | 'horaire'
  | 'materiel' | 'signaler' | 'publication' | 'stats' | 'signalements' | 'bonjour' | 'merci' | 'inconnu' | 'refus';

export interface Reponse {
  intention: Intention;
  texte: string;
  blocs: Bloc[];
  actions: Action[];
  suggestions: string[];
}

// ---------------------------------------------------------------------------------------------
// Lecture de la question
// ---------------------------------------------------------------------------------------------

/** Minuscules, sans accents ni ponctuation : « Où est la 3TQA ? » → « ou est la 3tqa ». */
export const normaliser = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

/** Noms de famille qui sont aussi des mots courants : il faut une majuscule pour les reconnaître. */
const NOMS_MOTS = new Set(['petit', 'blanc', 'noir', 'grand', 'brun', 'roux', 'fort', 'bon', 'leroy', 'simon', 'martin', 'salle', 'local']);

const MATIERES_SYNONYMES: [RegExp, string][] = [
  [/\b(math|maths|mathematique|mathematiques)\b/, 'mathematique'],
  [/\b(geo|geographie)\b/, 'geographie'],
  [/\b(neerl|neerlandais|nl|neerlandaise)\b/, 'neerlandais'],
  [/\b(gym|sport|education physique|ep)\b/, 'education physique'],
  [/\b(francais)\b/, 'francais'],
  [/\b(histoire|histo)\b/, 'histoire'],
  [/\b(anglais|english)\b/, 'anglais'],
  [/\b(sciences|science|sc|bio|biologie|chimie|physique)\b/, 'sciences'],
  [/\b(religion|morale|cpc)\b/, 'religion'],
];

export interface Analyse {
  texte: string;
  classes: string[];
  profs: string[];
  locaux: string[];
  date: string;
  dateDite: boolean;
  h?: number;
  /** L'heure a été dite (« H4 », « à 10h25 », « maintenant ») : sinon h vaut l'heure en cours. */
  hDite: boolean;
  maintenant: boolean;
  semaineProchaine: boolean;
  equip: { vp: boolean; tbi: boolean; tv: boolean; labo: boolean; info: boolean };
  rack?: string;
  matieres: string[];
  groupe?: Groupe;
  moiAussi: boolean;
}

const RE_JOURS: [RegExp, number][] = [
  [/\blundi\b/, 1],
  [/\bmardi\b/, 2],
  [/\bmercredi\b/, 3],
  [/\bjeudi\b/, 4],
  [/\bvendredi\b/, 5],
];

/** Le jour de cours à utiliser par défaut : aujourd'hui, ou le prochain jour de cours. */
export function jourParDefaut(maintenant: Date): string {
  const sit = situation(minutesDe(maintenant));
  if (estJourDeCours(maintenant) && sit.h <= 9) return iso(maintenant);
  return iso(prochainJourDeCours(maintenant, false));
}

/** L'heure « maintenant » : celle qui se donne, ou la suivante pendant une pause. */
export function heureCourante(maintenant: Date): number | undefined {
  const sit = situation(minutesDe(maintenant));
  if (!estJourDeCours(maintenant) || sit.h === 0 || sit.h > 9) return undefined;
  return sit.h;
}

export function analyser(question: string, cx: Contexte): Analyse {
  const { ds } = cx;
  const t = normaliser(question);
  const mots = ` ${t} `;

  // Classes : « 3TQA », « 3 tqa », ou un début commun (« les 3TQ »).
  const toutes = toutesLesClasses(ds);
  const parCle = new Map(toutes.map((c) => [sansAccents(c), c]));
  const classes = new Set<string>();
  for (const m of t.matchAll(/\b([1-7])\s?([a-z]{1,5})\b/g)) {
    const cle = `${m[1]}${m[2]}`;
    const exacte = parCle.get(cle);
    if (exacte) classes.add(exacte);
    else if (cle.length >= 2) {
      const debut = toutes.filter((c) => sansAccents(c).startsWith(cle));
      if (debut.length && debut.length <= 8) debut.forEach((c) => classes.add(c));
    }
  }
  if (/\bma classe\b/.test(t) && cx.classeEleve) classes.add(cx.classeEleve);

  // Profs : le nom entier, comme dans l'horaire (sans « (néerl.) »).
  const profs: string[] = [];
  const brut = question;
  for (const p of tousLesProfs(ds)) {
    const n = normaliser(p.includes(' (') ? p.slice(0, p.indexOf(' (')) : p);
    if (!n || n.length < 3) continue;
    if (!mots.includes(` ${n} `)) continue;
    if (NOMS_MOTS.has(n)) {
      // « Petit » doit être écrit avec une majuscule pour désigner le collègue.
      const re = new RegExp(`(^|[^\\p{L}])${n.charAt(0).toUpperCase()}${n.slice(1)}`, 'u');
      const reMaj = new RegExp(`(^|[^\\p{L}])${n.toUpperCase()}`, 'u');
      if (!re.test(sansAccentsGarderCasse(brut)) && !reMaj.test(sansAccentsGarderCasse(brut))) continue;
    }
    if (p !== cx.moi || /\b(moi meme|mon propre)\b/.test(t)) profs.push(p);
  }

  // Locaux : « BF110 », « bf 110 », « BF005A ».
  const codes = new Set(ds.locaux.map((l) => l.code));
  const locaux: string[] = [];
  for (const m of t.matchAll(/\b(bt|bf|bc|pr)\s?(\d{3})\s?([ab])?\b/g)) {
    const avec = `${m[1]}${m[2]}${m[3] ?? ''}`.toUpperCase();
    const sans = `${m[1]}${m[2]}`.toUpperCase();
    if (codes.has(avec)) locaux.push(avec);
    else if (codes.has(sans)) locaux.push(sans);
  }
  if (/\b(salle de sport|gymnase|salle de gym)\b/.test(t)) locaux.push('Education Physique');

  // Jour.
  let date = jourParDefaut(cx.maintenant);
  let dateDite = false;
  const semaineProchaine = /\bsemaine prochaine\b/.test(t);
  const auj = iso(cx.maintenant);
  if (/\bapres demain\b/.test(t)) {
    date = iso(plusJours(cx.maintenant, 2));
    dateDite = true;
  } else if (/\bdemain\b/.test(t)) {
    date = iso(plusJours(cx.maintenant, 1));
    dateDite = true;
  } else if (/\baujourd hui\b|\bce jour\b/.test(t)) {
    date = auj;
    dateDite = true;
  } else {
    for (const [re, n] of RE_JOURS) {
      if (!re.test(t)) continue;
      const lundi = lundiDe(cx.maintenant);
      const prochain = new RegExp(`${re.source}\\s+prochain`).test(t) || semaineProchaine;
      let d = plusJours(lundi, n - 1 + (prochain ? 7 : 0));
      if (!prochain && iso(d) < auj) d = plusJours(d, 7);
      date = iso(d);
      dateDite = true;
      break;
    }
    const dm = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (dm) {
      const j = Number(dm[1]);
      const mois = Number(dm[2]) - 1;
      if (j >= 1 && j <= 31 && mois >= 0 && mois <= 11) {
        let y = cx.maintenant.getFullYear();
        const m0 = cx.maintenant.getMonth();
        if (mois < 7 && m0 >= 7) y++;
        else if (mois >= 7 && m0 < 7) y--;
        date = iso(new Date(y, mois, j, 12));
        dateDite = true;
      }
    }
    if (!dateDite && semaineProchaine) {
      date = iso(prochainJourDeCours(plusJours(lundiDe(cx.maintenant), 7), true));
      dateDite = true;
    }
  }

  // Heure.
  let h: number | undefined;
  let maintenant = false;
  const hp = t.match(/\bh\s?([1-9])\b/) ?? t.match(/\b([1-9])\s?(?:e|eme|ere|er|re)\s+heure\b/);
  if (hp) h = Number(hp[1]);
  else {
    const horloge = t.match(/\b(\d{1,2})\s?h\s?(\d{2})?\b/);
    if (horloge) {
      const hh = Number(horloge[1]);
      const mm = Number(horloge[2] ?? 0);
      if (hh >= 8 && hh <= 16) {
        const min = hh * 60 + mm;
        const p = PERIODES.find((x) => min >= x.dm && min < x.fm) ?? PERIODES.find((x) => x.dm >= min);
        h = p?.h;
      } else if (hh >= 1 && hh <= 9 && !horloge[2]) h = hh;
    }
  }
  if (h === undefined && /\b(maintenant|en ce moment|tout de suite|la maintenant|actuellement|now)\b/.test(t)) maintenant = true;
  if (h === undefined && /\b(midi|temps de midi)\b/.test(t)) h = MIDI;
  const hDite = h !== undefined || maintenant;
  // Sans heure dite, « aujourd'hui » veut dire maintenant.
  if (h === undefined && (maintenant || (!dateDite && date === auj))) {
    const hc = heureCourante(cx.maintenant);
    if (hc !== undefined && date === auj) {
      h = hc;
      maintenant = true;
    }
  }

  const equip = {
    vp: /\b(projecteur|videoprojecteur|vp|beamer|projo)\b/.test(t) && !/\bmobile\b/.test(t),
    tbi: /\b(tbi|tableau interactif|tableau numerique)\b/.test(t),
    tv: /\b(tv|tele|television|ecran)\b/.test(t),
    labo: /\b(labo|laboratoire)\b/.test(t),
    info: /\b(salle info|informatique|salle d informatique|ordis|ordinateurs)\b/.test(t) && !/\bportable/.test(t),
  };

  let rack: string | undefined;
  if (/\btablettes?\b/.test(t)) rack = /\b(rack )?b\b|tablettes b\b/.test(t) ? 'Rack tablettes B' : 'Rack tablettes A';
  else if (/\b(pc portables?|ordinateurs portables?|portables|laptops?)\b/.test(t)) rack = 'Rack PC portables';
  else if (/\b(projecteur|videoprojecteur|beamer|projo) mobile\b/.test(t)) rack = 'Vidéoprojecteur mobile';
  else if (/\brallonges?\b/.test(t)) rack = 'Rallonge électrique';
  else if (/\b(hdmi|cables?)\b/.test(t)) rack = 'Câble HDMI';

  // Matières (« maths », « néerlandais »…), d'après celles de l'horaire.
  const toutesMatieres = [...new Set([...ds.cours.map((c) => c.matiere), ...ds.coursEleves.map((c) => c.matiere)].filter(Boolean))];
  const matieres = new Set<string>();
  for (const [re, cible] of MATIERES_SYNONYMES) {
    if (!re.test(t)) continue;
    toutesMatieres.filter((m) => normaliser(m).startsWith(cible)).forEach((m) => matieres.add(m));
  }
  for (const m of toutesMatieres) {
    const premier = normaliser(m).split(' ')[0];
    if (premier.length >= 4 && mots.includes(` ${premier} `)) matieres.add(m);
  }

  // Groupes : « l'équipe de la 3TQA », « les profs de sciences ».
  let groupe: Groupe | undefined;
  if (/\b(equipe|profs|collegues|professeurs|enseignants|conseil)\b/.test(t)) {
    if (classes.size === 1) {
      const cl = [...classes][0];
      const ps = [...new Set(ds.cours.filter((c) => c.classes.includes(cl)).map((c) => c.prof))].sort();
      if (ps.length >= 2) groupe = { id: `classe-${cl}`, nom: `Équipe de la ${cl}`, type: 'classe', profs: ps };
    } else if (matieres.size >= 1 && /\b(profs|collegues|professeurs|enseignants)\s(de|d)\b/.test(t)) {
      const ms = [...matieres];
      const ps = [...new Set(ds.cours.filter((c) => ms.includes(c.matiere)).map((c) => c.prof))].sort();
      if (ps.length >= 2) groupe = { id: `matiere-${ms[0]}`, nom: `Profs de ${ms[0].toLowerCase()}`, type: 'matiere', profs: ps };
    }
  }

  return {
    texte: t,
    classes: [...classes],
    profs,
    locaux: [...new Set(locaux)],
    date,
    dateDite,
    h,
    hDite,
    maintenant,
    semaineProchaine,
    equip,
    rack,
    matieres: [...matieres],
    groupe,
    moiAussi: /\b(moi|je|j|me|mon|ma|mes|nous|on)\b/.test(t),
  };
}

const sansAccentsGarderCasse = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function intention(a: Analyse, profil: Profil): Intention {
  const t = a.texte;
  if (/^(merci|super|top|genial|parfait|ok merci)\b/.test(t)) return 'merci';
  if (/^(bonjour|salut|hello|coucou|hey|bonsoir)\b/.test(t) && t.split(' ').length <= 3) return 'bonjour';
  if (/\b(ne marche|marche pas|fonctionne pas|ne fonctionne|en panne|panne|casse|cassee|fuite|hs|bloque|bloquee|ne s allume|chauffage|il fait froid|signaler|abime|arrache|clignote)\b/.test(t)) return 'signaler';
  if (a.rack && /\b(reserv|libre|dispo|disponible|prendre|emprunter|besoin|il reste|reste)/.test(t)) return 'materiel';
  if (/\b(publier|publication|publie|eleves (sont )?prevenus|changements? (du jour|pour les eleves))\b/.test(t)) return 'publication';
  if (/\b(taux|statistiques?|stats|tableau de bord|combien d heures|heures (perdues|recuperees))\b/.test(t)) return 'stats';
  if (/\b(signalements?|reparations?|technique|depannages?)\b/.test(t)) return 'signalements';
  if (/\b(creneau|creneaux|reunion|reunir|rencontrer|se voir|concertation|collab|en commun|ensemble|tous libres|trouve(r)? (moi )?(une heure|un moment|du temps|\d+ ?min))\b/.test(t) || (a.groupe && !/\bou\b/.test(t))) return 'collab';
  if (/\b(remediation|remedier|qui peut (prendre|faire|aider|surveiller|garder|venir)|coup de main|un renfort|qui est libre|qui est dispo|profs? libres?|collegues? libres?|besoin d aide|aider)\b/.test(t)) return 'aide';
  if (/\b(etude|a l etude|sans prof|pas de prof|n ont pas de prof|n a pas de prof)\b/.test(t)) return 'etude';
  if (/\b(absent|absente|absents|absentes|absences?|qui manque|malade)\b/.test(t) && !a.profs.length) return 'absents';
  if (/\b(deplacer|avancer|echanger|deplacement|deplacements|liberer|partir plus tot|finir plus tot|commencer plus tard|gagner une heure)\b/.test(t)) return 'deplacer';
  if (/\b(local|locaux|salle|salles|labo|laboratoire|informatique)\b/.test(t) && /\b(libre|libres|dispo|disponible|disponibles|reserver|trouve|trouver|cherche|vide|vides|besoin)\b/.test(t)) return 'locaux';
  if (/\b(ou est|ou sont|ou se trouve|ou trouver|ou est ce que|il est ou|elle est ou|ils sont ou|ou en est|ou va|ou vont|ou dois je aller|quel local|dans quel local|quelle salle)\b/.test(t)) return 'ou-est';
  if (/\b(prochain cours|mon prochain|j ai quoi|qu est ce que j ai|qu ai je|mon horaire|mes cours|quand (est ce que )?j ai|quand ai je|quand avons nous|quand a t on|ma journee|ma semaine|on a quoi|nous avons quoi|premier cours|dernier cours|je finis|je commence|fini a quelle heure|commence a quelle heure)\b/.test(t)) return 'horaire';
  if (a.equip.vp || a.equip.tbi || a.equip.tv || a.equip.labo || a.equip.info) return 'locaux';
  if (a.rack) return 'materiel';
  if (a.locaux.length === 1 && /\b(libre|occupe|dispo)\b/.test(t)) return 'ou-est';
  if (a.profs.length + a.classes.length + a.locaux.length === 1) return 'ou-est';
  if (a.profs.length >= 1 && profil !== 'eleve') return 'collab';
  if (a.matieres.length && (profil === 'eleve' || /\bquand\b/.test(t))) return 'horaire';
  return 'inconnu';
}

// ---------------------------------------------------------------------------------------------
// Réponses
// ---------------------------------------------------------------------------------------------

const quandTexte = (cx: Contexte, date: string, h?: number): string => {
  const auj = iso(cx.maintenant);
  const jour = date === auj ? "aujourd'hui" : date === iso(plusJours(cx.maintenant, 1)) ? 'demain' : JOURS[jourSemaineIso(date)];
  return h ? `${jour} en H${h} (${periode(h).debut})` : jour;
};

const emailDe = (ds: Dataset, nom: string): string | undefined => ds.profs.find((p) => p.nom === nom)?.email || undefined;

function actionChat(ds: Dataset, profs: string[], libelle: string, message: string, sujet?: string): Action | null {
  const avec = profs.map((p) => ({ p, e: emailDe(ds, p) })).filter((x) => x.e);
  if (!avec.length) return null;
  return { type: 'teams-chat', libelle, emails: avec.map((x) => x.e!), noms: avec.map((x) => nomAffiche(x.p)), message, sujet };
}

const SUGG_PROF = ['Où est la 6TQA maintenant ?', 'Un local avec projecteur libre en H4 ?', 'Trouve un créneau avec l’équipe de la 3TQA', 'Qui peut aider maintenant ?', 'Mon prochain cours ?'];
const SUGG_ELEVE = ['Où est ma classe maintenant ?', 'Qu’est-ce qui change aujourd’hui ?', 'Quand ai-je sciences ?', 'Mon horaire de demain'];
const SUGG_EDUC = ['Quelles classes sont à l’étude ?', 'Qui est absent aujourd’hui ?', 'Qui peut aider maintenant ?', 'Où est la 1CB ?'];

export function suggestionsPour(profil: Profil): string[] {
  if (profil === 'eleve') return SUGG_ELEVE;
  if (profil === 'educateur' || profil === 'secretariat' || profil === 'direction') return SUGG_EDUC;
  return SUGG_PROF;
}

export function repondre(question: string, cx: Contexte): Reponse {
  const a = analyser(question, cx);
  const i = intention(a, cx.profil);
  const r = (texte: string, blocs: Bloc[] = [], actions: (Action | null)[] = [], suggestions: string[] = []): Reponse => ({
    intention: i,
    texte,
    blocs,
    actions: actions.filter((x): x is Action => !!x),
    suggestions,
  });

  if (cx.profil === 'eleve') return repondreEleve(a, i, cx, r);

  switch (i) {
    case 'bonjour':
      return r(`Bonjour ! Pose-moi une question sur l'école : un collègue, une classe, un local, un créneau commun…`, [], [], suggestionsPour(cx.profil));
    case 'merci':
      return r('Avec plaisir 🙂', [], [], suggestionsPour(cx.profil).slice(0, 3));
    case 'ou-est':
      return ouEst(a, cx, r);
    case 'locaux':
      return locauxLibres(a, cx, r);
    case 'collab':
      return collab(a, cx, r);
    case 'aide':
      return aide(a, cx, r);
    case 'etude':
      return etude(a, cx, r);
    case 'absents':
      return absents(a, cx, r);
    case 'deplacer':
      return deplacer(cx, r);
    case 'horaire':
      return horaire(a, cx, r);
    case 'materiel':
      return materiel(a, cx, r);
    case 'signaler':
      return signaler(question, a, r);
    case 'publication':
      return publication(cx, r);
    case 'stats':
      return stats(cx, r);
    case 'signalements':
      return signalements(cx, r);
    default:
      return r(
        "Je n'ai pas compris. Je sais trouver un collègue, une classe ou un local, des locaux libres, un créneau commun, qui peut aider, ta journée…",
        [],
        [],
        suggestionsPour(cx.profil),
      );
  }
}

type Fabrique = (texte: string, blocs?: Bloc[], actions?: (Action | null)[], suggestions?: string[]) => Reponse;

function journeeBloc(titre: string, items: { h: number; texte: string; ton: Ton }[], actuel?: number): Bloc {
  return { type: 'journee', titre, heures: items.map((x) => ({ ...x, actuel: x.h === actuel })) };
}

function ouEst(a: Analyse, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  const date = a.date;
  const auj = date === iso(cx.maintenant);
  const actuel = auj ? heureCourante(cx.maintenant) : undefined;
  // Sans heure précise : maintenant (aujourd'hui), sinon la journée entière.
  const hc = a.h ?? actuel;
  const quand = hc ? (a.maintenant && auj ? `maintenant (H${hc}, jusqu'à ${periode(hc).fin})` : quandTexte(cx, date, hc)) : quandTexte(cx, date);
  const Jour = quandTexte(cx, date).replace(/^./, (x) => x.toUpperCase());

  if (a.profs.length) {
    const prof = a.profs[0];
    const nom = nomAffiche(prof);
    const jour = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => {
      const x = positionProf(ds, prof, date, h);
      const ton: Ton = x.note === 'local fermé' ? 'rose' : x.statut === 'cours' ? 'indigo' : x.statut === 'absent' ? 'rose' : x.statut === 'fourche' ? 'orange' : 'gris';
      return { h, texte: x.statut === 'cours' ? `${x.classe} · ${x.local}${x.note === 'local fermé' ? ' (local fermé)' : ''}` : x.texte, ton, x };
    });
    let phrase: string;
    if (hc) {
      const p = positionProf(ds, prof, date, hc);
      phrase =
        p.statut === 'cours'
          ? `${nom} est en ${p.local || 'cours'} avec la ${p.classe}${p.note ? ` (${p.note})` : ''}, ${quand}.`
          : p.statut === 'absent'
            ? `${nom} est absent·e ${quand}.`
            : p.statut === 'fourche'
              ? `${nom} n'a pas cours ${quand} : c'est une fourche, il ou elle est à l'école.`
              : p.statut === 'conge'
                ? `C'est congé ${quand}.`
                : `${nom} n'a pas cours ${quand} (${p.texte.toLowerCase()}).`;
    } else {
      const cours = jour.filter((j) => j.x.statut === 'cours');
      phrase = conge(deIso(date))
        ? `C'est congé ${quandTexte(cx, date)}.`
        : jour.every((j) => j.x.statut === 'absent')
          ? `${nom} est absent·e ${quandTexte(cx, date)}.`
          : cours.length
            ? `${Jour}, ${nom} commence à ${periode(cours[0].h).debut} (${cours[0].texte}) et finit à ${periode(cours[cours.length - 1].h).fin}.`
            : `${nom} n'a pas cours ${quandTexte(cx, date)}.`;
    }
    return r(
      phrase,
      [journeeBloc(`Journée de ${nom} · ${JOURS[jourSemaineIso(date)]}`, jour.map(({ h, texte, ton }) => ({ h, texte, ton })), actuel)],
      [actionChat(ds, [prof], `Écrire à ${nom}`, `Bonjour ${nom}, `), { type: 'lien', libelle: 'Voir dans « Où est ? »', href: `#/ouest?q=${encodeURIComponent(prof)}&date=${date}` }],
      [`Trouve un créneau avec ${nom}`, auj ? `Où est ${nom} demain ?` : `Où est ${nom} maintenant ?`],
    );
  }

  if (a.classes.length) {
    const cl = a.classes[0];
    const jour = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => {
      const x = positionClasse(ds, cl, date, h);
      const ferme = x.note === 'local fermé';
      const ton: Ton = ferme ? 'rose' : x.statut === 'cours' || x.statut === 'remediation' ? 'indigo' : x.statut === 'etude' ? 'orange' : 'gris';
      const texte = x.statut === 'cours' || x.statut === 'remediation' ? `${x.matiere || 'Cours'} · ${x.local ?? ''}${ferme ? ' (local fermé)' : ''}${x.prof ? ` · ${nomAffiche(x.prof)}` : ''}` : x.texte;
      return { h, texte, ton, x };
    });
    let phrase: string;
    if (hc) {
      const p = positionClasse(ds, cl, date, hc);
      phrase =
        p.statut === 'cours'
          ? `La ${cl} est en ${p.local || '?'} : ${p.matiere || 'cours'} avec ${nomAffiche(p.prof ?? '')}${p.note ? ` (${p.note})` : ''}, ${quand}.`
          : p.statut === 'etude'
            ? `La ${cl} est à l'étude ${quand} : ${p.matiere ? `pas de ${p.matiere.toLowerCase()}` : 'pas de prof'}.`
            : p.statut === 'remediation'
              ? `La ${cl} est en remédiation avec ${nomAffiche(p.prof ?? '')} en ${p.local}, ${quand}.`
              : p.statut === 'conge'
                ? `C'est congé ${quand}.`
                : `La ${cl} n'a pas cours ${quand}${p.note ? ` (${p.note})` : ''}.`;
    } else {
      const etudes = jour.filter((j) => j.x.statut === 'etude');
      const cours = jour.filter((j) => j.x.statut !== 'libre' && j.x.statut !== 'conge');
      phrase = conge(deIso(date))
        ? `C'est congé ${quandTexte(cx, date)}.`
        : !cours.length
          ? `La ${cl} n'a pas cours ${quandTexte(cx, date)}.`
          : `${Jour}, la ${cl} a cours de ${periode(cours[0].h).debut} à ${periode(cours[cours.length - 1].h).fin}${etudes.length ? ` ; ${etudes.length} heure${etudes.length > 1 ? 's' : ''} à l'étude (${etudes.map((e) => `H${e.h}`).join(', ')})` : ''}.`;
    }
    return r(phrase, [journeeBloc(`Journée de la ${cl}`, jour.map(({ h, texte, ton }) => ({ h, texte, ton })), actuel)], [{ type: 'lien', libelle: 'Voir dans « Où est ? »', href: `#/ouest?q=${encodeURIComponent(cl)}&date=${date}` }], [
      `Qui peut faire une remédiation avec la ${cl} ?`,
      `Trouve un créneau avec l’équipe de la ${cl}`,
    ]);
  }

  if (a.locaux.length) {
    const code = a.locaux[0];
    const jour = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => {
      const x = etatLocal(ds, cx.moi, code, date, h);
      const ton: Ton = x.etat === 'libre' ? 'indigo' : x.etat === 'indispo' ? 'rose' : x.etat === 'moi' ? 'orange' : 'gris';
      return { h, texte: x.etat === 'libre' ? 'Libre' : x.detail, ton, x };
    });
    const h0 = hc ?? 1;
    const e = etatLocal(ds, cx.moi, code, date, h0);
    let phrase: string;
    if (e.etat === 'indispo') phrase = `${code} est indisponible : ${e.detail.replace(/^Indisponible · /, '')}.`;
    else if (hc) {
      const fin = e.etat === 'libre' ? libreJusque(ds, cx.moi, code, date, hc) : hc;
      phrase = e.etat === 'libre' ? `${code} est libre ${quand}${fin > hc ? `, et jusqu'à H${fin} (${periode(fin).fin})` : ''}.` : `${code} est occupé ${quand} : ${e.detail}.`;
    } else {
      const libres = jour.filter((j) => j.x.etat === 'libre').map((j) => `H${j.h}`);
      phrase = libres.length ? `${Jour}, ${code} est libre en ${libres.join(', ')}.` : `${Jour}, ${code} est occupé toute la journée.`;
    }
    const classe = classePour(cx, date, h0);
    return r(
      phrase,
      [journeeBloc(`${code} · ${JOURS[jourSemaineIso(date)]}`, jour.map(({ h, texte, ton }) => ({ h, texte, ton })), actuel)],
      [e.etat === 'libre' && cx.moi && hc ? { type: 'reserver-local', libelle: `Réserver ${code} en H${hc}`, local: code, date, h: hc, classe } : null],
    );
  }
  return r('Dis-moi qui ou quoi chercher : un collègue, une classe (3TQA) ou un local (BF110).', [], [], suggestionsPour(cx.profil));
}

/** La classe du prof à cette heure (ou sa première classe) pour une réservation. */
function classePour(cx: Contexte, date: string, h: number): string {
  if (!cx.moi) return '';
  const c = coursDuProf(cx.ds, cx.moi, date).find((x) => x.h === h);
  return c?.classe ?? [...new Set(cx.ds.cours.filter((x) => x.prof === cx.moi).flatMap((x) => x.classes))].sort()[0] ?? '';
}

function locauxLibres(a: Analyse, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  const h = a.h ?? heureCourante(cx.maintenant) ?? 1;
  const date = a.date;
  if (conge(deIso(date)) || jourSemaine(deIso(date)) > 5) return r(`Pas cours ${quandTexte(cx, date)} : tous les locaux sont fermés.`);
  const e = a.equip;
  const filtres = ds.locaux.filter(
    (l) =>
      l.batiment !== 'Autres' &&
      (!e.vp || l.vp) &&
      (!e.tbi || l.tbi) &&
      (!e.tv || l.tv) &&
      (!e.labo || /labo/i.test(l.type)) &&
      (!e.info || /informatique/i.test(l.type)),
  );
  const libres = filtres.filter((l) => etatLocal(ds, cx.moi, l.code, date, h).etat === 'libre');
  // Les plus proches du cours précédent ou suivant du prof d'abord.
  const voisin = cx.moi ? coursDuProf(ds, cx.moi, date).sort((x, y) => Math.abs(x.h - h) - Math.abs(y.h - h))[0]?.local : undefined;
  const bat = voisin ? ds.locaux.find((l) => l.code === voisin) : undefined;
  libres.sort((x, y) => {
    const px = bat ? (x.batiment === bat.batiment ? 0 : 1) * 10 + Math.abs(x.etage - bat.etage) : 0;
    const py = bat ? (y.batiment === bat.batiment ? 0 : 1) * 10 + Math.abs(y.etage - bat.etage) : 0;
    return px - py || x.code.localeCompare(y.code);
  });
  const criteres = [e.vp && 'projecteur', e.tbi && 'TBI', e.tv && 'TV', e.labo && 'labo', e.info && 'informatique'].filter(Boolean).join(', ');
  const classe = classePour(cx, date, h);
  if (!libres.length) {
    return r(`Aucun local${criteres ? ` (${criteres})` : ''} libre ${quandTexte(cx, date, h)}.`, [], [{ type: 'lien', libelle: 'Ouvrir Locaux', href: `#/locaux?date=${date}&h=${h}` }], [
      `Un local libre en H${Math.min(9, h + 1)} ?`,
    ]);
  }
  const fin = (code: string) => libreJusque(ds, cx.moi, code, date, h);
  return r(
    `${libres.length} ${libres.length > 1 ? 'locaux' : 'local'}${criteres ? ` (${criteres})` : ''} libre${libres.length > 1 ? 's' : ''} ${quandTexte(cx, date, h)}${bat ? `, les plus proches de ${bat.code} d'abord` : ''}.`,
    [
      {
        type: 'puces',
        puces: libres.slice(0, 12).map((l) => ({
          texte: `${l.code}${fin(l.code) > h ? ` → H${fin(l.code)}` : ''}`,
          action: cx.moi ? ({ type: 'reserver-local', libelle: `Réserver ${l.code}`, local: l.code, date, h, classe } as Action) : undefined,
        })),
      },
    ],
    [{ type: 'lien', libelle: 'Voir tous les locaux', href: `#/locaux?date=${date}&h=${h}` }],
  );
}

function collab(a: Analyse, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  let profs = a.groupe ? [...a.groupe.profs] : [...a.profs];
  if (cx.moi && !profs.includes(cx.moi) && (a.moiAussi || !a.groupe)) profs.unshift(cx.moi);
  profs = [...new Set(profs)];
  if (profs.length < 2) {
    const gs = cx.moi ? groupes(ds, cx.moi).slice(0, 3) : [];
    return r(
      'Avec qui ? Donne un ou plusieurs noms, ou un groupe (« l’équipe de la 3TQA », « les profs de sciences »).',
      [],
      [{ type: 'lien', libelle: 'Ouvrir Collab', href: '#/collab' }],
      gs.map((g) => `Trouve un créneau avec ${g.nom.charAt(0).toLowerCase()}${g.nom.slice(1)}`),
    );
  }
  const depuis = a.semaineProchaine ? plusJours(lundiDe(cx.maintenant), 7) : a.dateDite ? deIso(a.date) : cx.maintenant;
  const passe = iso(depuis) === iso(cx.maintenant) ? cx.heurePassee : 0;
  let cr = creneauxCommuns(ds, profs, depuis, passe, { tolerance: 0, aLEcole: false });
  let tolere = false;
  if (!cr.length && profs.length >= 3) {
    cr = creneauxCommuns(ds, profs, depuis, passe, { tolerance: 1, aLEcole: false });
    tolere = true;
  }
  const qui = a.groupe
    ? a.groupe.type === 'classe'
      ? `l'équipe de la ${a.groupe.id.replace(/^classe-/, '')}`
      : `les profs de ${a.groupe.id.replace(/^matiere-/, '').toLowerCase()}`
    : noms(profs.filter((p) => p !== cx.moi)) || noms(profs);
  if (!cr.length) return r(`Aucune heure commune avec ${qui} dans les deux semaines qui viennent.`, [], [{ type: 'lien', libelle: 'Ouvrir Collab', href: '#/collab' }]);
  const meilleur = cr[0];
  const { debut, fin } = bornes(meilleur);
  // Invitation : les autres participants (on ne s'invite pas soi-même).
  const invites = meilleur.presents.filter((p) => p !== cx.moi && emailDe(ds, p));
  const reunion: Action | null = invites.length
    ? { type: 'teams-reunion', libelle: 'Créer la réunion Teams', sujet: a.groupe ? `Réunion · ${a.groupe.nom}` : 'Réunion', debut: debut.toISOString(), fin: fin.toISOString(), emails: invites.map((p) => emailDe(ds, p)!), noms: invites.map(nomAffiche), contenu: 'Heure commune trouvée par La Tour.' }
    : null;
  return r(
    `${tolere ? 'Personne n’est libre en même temps ; en acceptant une absence, le' : 'Le'} meilleur moment avec ${qui} : ${dateLongue(deIso(meilleur.date))}, ${plage(meilleur)}.`,
    [
      {
        type: 'lignes',
        titre: `${cr.length} possibilité${cr.length > 1 ? 's' : ''} sur 2 semaines`,
        lignes: cr.slice(0, 5).map((c) => ({
          titre: `${dateLongue(deIso(c.date))} · ${plage(c)}`,
          sous: c.manquants.length ? `Sans ${noms(c.manquants)}` : c.dansLaJournee ? 'Tout le monde est déjà à l’école' : 'Tout le monde est libre',
          ton: c.manquants.length ? 'orange' : 'indigo',
        })),
      },
    ],
    [reunion, { type: 'lien', libelle: 'Affiner dans Collab', href: `#/collab?p=${encodeURIComponent(profs.join('|'))}` }],
  );
}

function aide(a: Analyse, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  const h = a.h ?? heureCourante(cx.maintenant) ?? 1;
  const date = a.date;
  const cl = a.classes[0];
  let libres = profsLibres(ds, date, h, cx.moi ? [cx.moi] : []);
  if (cl) libres = libres.filter((l) => peutPrendre(ds, l.prof, cl));
  // Ceux qui connaissent la classe (ou la matière) d'abord.
  const connait = (p: string) => (cl ? ds.cours.some((c) => c.prof === p && c.classes.includes(cl)) : false);
  libres.sort((x, y) => Number(connait(y.prof)) - Number(connait(x.prof)) || Number(y.fourche) - Number(x.fourche) || x.prof.localeCompare(y.prof));
  const surs = libres.filter((l) => l.fourche);
  if (!libres.length) return r(`Personne n'est libre ${quandTexte(cx, date, h)}.`);
  const liste = (surs.length ? surs : libres).slice(0, 8);
  const message = cl
    ? `Bonjour, la ${cl} n'a pas de prof en H${h} (${periode(h).debut}). Quelqu'un pourrait-il la prendre en remédiation ? Merci !`
    : `Bonjour, j'aurais besoin d'un coup de main en H${h} (${periode(h).debut}). Quelqu'un est disponible ? Merci !`;
  return r(
    `${surs.length || libres.length} collègue${(surs.length || libres.length) > 1 ? 's' : ''} libre${(surs.length || libres.length) > 1 ? 's' : ''} ${quandTexte(cx, date, h)}${cl ? ` qui peuvent prendre la ${cl}` : ''}${surs.length ? ', déjà à l’école' : ''}.`,
    [
      {
        type: 'lignes',
        lignes: liste.map((l) => ({ titre: nomAffiche(l.prof), sous: [connait(l.prof) ? `connaît la ${cl}` : '', l.texte].filter(Boolean).join(' · '), ton: l.fourche ? 'indigo' : 'gris' })),
      },
    ],
    [actionChat(ds, liste.map((l) => l.prof), 'Leur écrire sur Teams', message, cl ? `Remédiation ${cl} · H${h}` : `Coup de main · H${h}`)],
  );
}

function etude(a: Analyse, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  const date = a.date;
  const hs = a.hDite && a.h ? [a.h] : [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((h) => date !== iso(cx.maintenant) || h > cx.heurePassee || h === heureCourante(cx.maintenant));
  const lignes: Ligne[] = [];
  for (const h of hs) {
    for (const c of coursSansProf(ds, date, h)) {
      if (a.classes.length && !c.classes.some((k) => a.classes.includes(k))) continue;
      const quand = date === iso(cx.maintenant) ? '' : ` ${JOURS[jourSemaineIso(date)]}`;
      lignes.push({
        titre: `H${h} · ${c.classe}`,
        sous: `${c.matiere || 'Cours'} · ${nomAffiche(c.prof)} absent·e`,
        ton: 'orange',
        action: { type: 'question', libelle: 'Qui peut la prendre ?', texte: `Qui peut faire une remédiation avec la ${c.classes[0]}${quand} en H${h} ?` },
      });
    }
  }
  const quand = a.hDite && a.h ? quandTexte(cx, date, a.h) : quandTexte(cx, date);
  if (!lignes.length) return r(`Aucune classe à l'étude ${quand}${a.hDite ? '' : date === iso(cx.maintenant) ? ' pour le reste de la journée' : ''}.`);
  return r(`${lignes.length} heure${lignes.length > 1 ? 's' : ''} de classe à l'étude ${quand}.`, [{ type: 'lignes', lignes: lignes.slice(0, 14) }], [
    { type: 'lien', libelle: 'Ouvrir le pilotage', href: '#/pilotage' },
  ], lignes.length ? [`Qui peut faire une remédiation avec la ${lignes[0].titre.split(' · ')[1]?.split(',')[0]} ?`] : []);
}

function absents(a: Analyse, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  const date = a.date;
  const liste = ds.absences.filter((x) => x.date === date).sort((x, y) => x.prof.localeCompare(y.prof));
  if (!liste.length) return r(`Personne n'est noté absent ${quandTexte(cx, date)}.`);
  return r(`${liste.length} collègue${liste.length > 1 ? 's' : ''} absent${liste.length > 1 ? 's' : ''} ${quandTexte(cx, date)}.`, [
    {
      type: 'lignes',
      lignes: liste.map((x) => ({ titre: nomAffiche(x.prof), sous: x.deH === 1 && x.aH === 9 ? 'Toute la journée' : `De H${x.deH} à H${x.aH}`, ton: 'rose' })),
    },
  ], [{ type: 'lien', libelle: 'Classes à l’étude', href: '#/pilotage' }]);
}

function deplacer(cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  if (!cx.moi) return r('Les déplacements de cours concernent les profs qui ont un horaire.');
  const auj = iso(cx.maintenant);
  const lundi = iso(lundiDe(cx.maintenant));
  const opps = [...opportunitesSemaine(ds, cx.moi, lundi, auj, cx.heurePassee, cx.priorites).values()].filter((o) => !o.passe);
  if (!opps.length) return r("Pas de déplacement possible cette semaine pour l'instant. Je te préviens sur l'écran Aujourd'hui dès qu'une heure se libère.");
  const etoiles = opps.filter((o) => o.etoile);
  return r(
    `${opps.length} heure${opps.length > 1 ? 's' : ''} libérée${opps.length > 1 ? 's' : ''} où tu peux avancer un cours cette semaine${etoiles.length ? `, dont ${etoiles.length} qui te ${etoiles.length > 1 ? 'font' : 'fait'} gagner du temps` : ''}.`,
    [
      {
        type: 'lignes',
        lignes: opps.slice(0, 6).map((o) => ({
          titre: `${JOURS[jourSemaineIso(o.date)]} H${o.h} · ${periode(o.h).debut}`,
          sous: `${o.nb} option${o.nb > 1 ? 's' : ''}${o.etoile ? ' · te fait gagner du temps' : ''}`,
          ton: o.etoile ? 'orange' : 'gris',
          action: { type: 'lien', libelle: 'Voir', href: `#/deplacer?date=${o.date}&h=${o.h}` } as Action,
        })),
      },
    ],
    [{ type: 'lien', libelle: 'Voir ma semaine', href: '#/horaire' }],
  );
}

function horaire(a: Analyse, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  if (!cx.moi) return r("Tu n'as pas d'horaire de cours dans La Tour.");
  const t = a.texte;
  // « Quand ai-je la 3TQA ? » / « Quand ai-je sciences ? » : les prochaines fois.
  if (/\bquand\b/.test(t) && (a.classes.length || a.matieres.length)) {
    const prochaines: Ligne[] = [];
    let d = deIso(jourParDefaut(cx.maintenant));
    for (let n = 0; n < 14 && prochaines.length < 4; n++, d = plusJours(d, 1)) {
      if (!estJourDeCours(d)) continue;
      const date = iso(d);
      for (const c of coursDuProf(ds, cx.moi, date)) {
        if (date === iso(cx.maintenant) && c.h <= cx.heurePassee) continue;
        if (a.classes.length && !c.classes.some((k) => a.classes.includes(k))) continue;
        if (!a.classes.length && a.matieres.length && !a.matieres.includes(c.matiere)) continue;
        prochaines.push({ titre: `${dateLongue(d)} · H${c.h} · ${periode(c.h).debut}`, sous: `${c.classe} · ${c.local}`, ton: 'indigo' });
        if (prochaines.length >= 4) break;
      }
    }
    const quoi = a.classes.length ? `la ${a.classes.join(', ')}` : a.matieres[0].toLowerCase();
    if (!prochaines.length) return r(`Tu n'as pas ${quoi} dans les deux semaines qui viennent.`);
    return r(`Prochaine fois avec ${quoi} : ${prochaines[0].titre}, ${prochaines[0].sous}.`, [{ type: 'lignes', lignes: prochaines }]);
  }
  const date = a.dateDite ? a.date : jourParDefaut(cx.maintenant);
  const cours = coursDuProf(ds, cx.moi, date, true);
  const auj = date === iso(cx.maintenant);
  if (!cours.length) return r(`Pas de cours pour toi ${quandTexte(cx, date)}.`);
  const apres = auj ? cours.filter((c) => c.h > cx.heurePassee || c.h === heureCourante(cx.maintenant)) : cours;
  const prochain = apres[0];
  const premier = cours[0];
  const dernier = cours[cours.length - 1];
  let texte: string;
  if (/\b(prochain|ensuite|apres)\b/.test(t) && prochain) texte = `Ton prochain cours : ${prochain.classe} en ${prochain.local}, H${prochain.h} à ${periode(prochain.h).debut}.`;
  else if (/\b(finis|fini|termine|dernier)\b/.test(t)) texte = `${quandTexte(cx, date).replace(/^./, (x) => x.toUpperCase())}, tu finis à ${periode(dernier.h).fin} (H${dernier.h}, ${dernier.classe}).`;
  else if (/\b(commence|premier)\b/.test(t)) texte = `${quandTexte(cx, date).replace(/^./, (x) => x.toUpperCase())}, tu commences à ${periode(premier.h).debut} (H${premier.h}, ${premier.classe} en ${premier.local}).`;
  else texte = `${quandTexte(cx, date).replace(/^./, (x) => x.toUpperCase())} : ${cours.length} cours, de ${periode(premier.h).debut} à ${periode(dernier.h).fin}.`;
  const jour = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .filter((h) => h >= premier.h && h <= dernier.h)
    .map((h) => {
      const c = cours.find((x) => x.h === h);
      return { h, texte: c ? `${c.classe} · ${c.local}${c.deplace ? (c.deplace.statut === 'Validé' ? ' · déplacé' : ' · en attente') : ''}` : h === MIDI ? 'Temps de midi' : 'Libre', ton: (c ? (c.deplace && c.deplace.statut !== 'Validé' ? 'orange' : 'indigo') : 'gris') as Ton };
    });
  return r(texte, [journeeBloc(`Ta journée · ${JOURS[jourSemaineIso(date)]}`, jour, auj ? heureCourante(cx.maintenant) : undefined)], [{ type: 'lien', libelle: 'Voir ma semaine', href: '#/horaire' }]);
}

function materiel(a: Analyse, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  const h = a.h ?? heureCourante(cx.maintenant) ?? 1;
  const date = a.date;
  const dispo = dispoMateriel(ds, date, h);
  const voulu = a.rack ?? 'Rack tablettes A';
  let choix = dispo.find((d) => d.rack.nom === voulu);
  // Tablettes : si le rack A est pris, proposer le B (et inversement).
  if (choix && choix.reste === 0 && /tablettes/.test(voulu)) choix = dispo.find((d) => /tablettes/.test(d.rack.nom) && d.reste > 0) ?? choix;
  const classe = classePour(cx, date, h);
  const lignes: Ligne[] = dispo.map((d) => ({ titre: d.rack.nom, sous: d.reste ? `${d.reste} sur ${d.rack.stock} disponible${d.reste > 1 ? 's' : ''}` : `Pris (${d.prises.map((p) => nomAffiche(p.prof)).join(', ')})`, ton: d.reste ? 'indigo' : 'gris' }));
  if (!choix) return r('Je ne connais pas ce matériel.', [{ type: 'lignes', lignes }]);
  return r(
    choix.reste ? `${choix.rack.nom} : disponible ${quandTexte(cx, date, h)}.` : `${choix.rack.nom} : déjà pris ${quandTexte(cx, date, h)}.`,
    [{ type: 'lignes', titre: `Matériel ${quandTexte(cx, date, h)}`, lignes }],
    [choix.reste && cx.moi ? { type: 'reserver-materiel', libelle: `Réserver ${choix.rack.nom}`, rack: choix.rack.nom, date, h, classe } : null, { type: 'lien', libelle: 'Ouvrir Matériel', href: `#/materiel?date=${date}&h=${h}` }],
  );
}

function signaler(question: string, a: Analyse, r: Fabrique): Reponse {
  const local = a.locaux[0] ?? '';
  const urgent = /\b(fuite|inonde|danger|dangereux|urgent|electrocut|fumee|odeur de gaz|casse la vitre|vitre cassee)\b/.test(a.texte);
  const texte = question.trim().replace(/\s+/g, ' ');
  return r(
    local ? `Je prépare le signalement pour ${local}. Vérifie le texte et envoie-le au service technique.` : 'Je prépare le signalement. Précise le local dans l’écran qui s’ouvre.',
    [],
    [{ type: 'signaler', libelle: 'Préparer le signalement', local, texte, urgent }],
  );
}

function publication(cx: Contexte, r: Fabrique): Reponse {
  const date = jourParDefaut(cx.maintenant);
  const e = etatPublication(cx.ds, date);
  const texte = !e.dejaPublie
    ? e.calcule.length
      ? `Rien n'est encore publié pour les élèves ${quandTexte(cx, date)} : ${e.calcule.length} changement${e.calcule.length > 1 ? 's' : ''} à publier.`
      : `Aucun changement à publier ${quandTexte(cx, date)}.`
    : e.aJour
      ? `La publication des élèves est à jour (${e.publie.length} ligne${e.publie.length > 1 ? 's' : ''}).`
      : `La publication n'est plus à jour : ${e.nouveaux.length} nouveauté${e.nouveaux.length > 1 ? 's' : ''}${e.retires.length ? ` et ${e.retires.length} ligne${e.retires.length > 1 ? 's' : ''} à retirer` : ''}.`;
  return r(texte, e.nouveaux.length ? [{ type: 'lignes', titre: 'Nouveau', lignes: e.nouveaux.slice(0, 6).map((c) => ({ titre: `${c.classe} · H${c.h}`, sous: c.titre, ton: 'orange' })) }] : [], [
    { type: 'lien', libelle: 'Ouvrir la publication', href: '#/publier' },
  ]);
}

function stats(cx: Contexte, r: Fabrique): Reponse {
  const au = iso(cx.maintenant);
  const du = iso(plusJours(cx.maintenant, -28));
  const s = statsPeriode(cx.ds, du, au);
  return r(
    s.heures
      ? `Sur 4 semaines : ${s.heures} heures sans prof, ${Math.round(s.taux * 100)} % récupérées (${s.parDeplacement} par déplacement, ${s.parRemediation} en remédiation).`
      : 'Aucune heure sans prof sur les 4 dernières semaines.',
    s.parClasse.length ? [{ type: 'lignes', titre: 'Classes les plus touchées', lignes: s.parClasse.slice(0, 4).map((c) => ({ titre: c.classe, sous: `${c.perdues} h sans prof · ${c.recuperees} récupérées`, ton: 'orange' })) }] : [],
    [{ type: 'lien', libelle: 'Ouvrir le tableau de bord', href: '#/direction' }],
  );
}

function signalements(cx: Contexte, r: Fabrique): Reponse {
  const ouverts = cx.ds.signalements.filter((s) => !s.resolu).sort((a, b) => Number(b.bloquant) - Number(a.bloquant) || a.depuis.localeCompare(b.depuis));
  if (!ouverts.length) return r('Aucun signalement en cours.', [], [{ type: 'lien', libelle: 'Signaler un problème', href: '#/signaler' }]);
  return r(`${ouverts.length} signalement${ouverts.length > 1 ? 's' : ''} en cours${ouverts.some((s) => s.bloquant) ? `, dont ${ouverts.filter((s) => s.bloquant).length} qui bloque${ouverts.filter((s) => s.bloquant).length > 1 ? 'nt' : ''} un local` : ''}.`, [
    { type: 'lignes', lignes: ouverts.slice(0, 6).map((s) => ({ titre: `${s.local || '—'} · ${titreSignalement(s.titre, s.local)}`, sous: `${s.statut}${s.reponse ? ` · « ${s.reponse} »` : ''}`, ton: s.bloquant ? 'rose' : 'gris' })) },
  ], [{ type: 'lien', libelle: cx.profil === 'technique' ? 'Ouvrir les signalements' : 'Signaler un problème', href: cx.profil === 'technique' ? '#/technique' : '#/signaler' }]);
}

/** « BF110 · Store bloqué » → « Store bloqué ». */
export const titreSignalement = (titre: string, local: string): string =>
  local ? titre.replace(new RegExp(`^\\s*${local}\\s*[·:\\-–]?\\s*`, 'i'), '') || titre : titre;

// ---------------------------------------------------------------------------------------------
// Élèves : seulement leur classe, l'horaire sans nom de prof et les changements publiés.
// ---------------------------------------------------------------------------------------------

function repondreEleve(a: Analyse, i: Intention, cx: Contexte, r: Fabrique): Reponse {
  const { ds } = cx;
  const cl = a.classes[0] ?? cx.classeEleve;
  if (a.profs.length || i === 'absents' || i === 'aide' || i === 'collab' || i === 'stats' || i === 'publication' || i === 'deplacer') {
    return { ...r("Je ne donne pas d'informations sur le personnel. Pour une question sur un prof, adresse-toi à l'éducateur.", [], [], SUGG_ELEVE), intention: 'refus' };
  }
  if (i === 'signaler') return signaler(a.texte, a, r);
  if (i === 'bonjour') return r('Bonjour ! Je connais ton horaire et les changements du jour.', [], [], SUGG_ELEVE);
  if (i === 'merci') return r('Avec plaisir 🙂', [], [], SUGG_ELEVE.slice(0, 2));
  if (!cl) return r('Choisis d’abord ta classe en haut de l’écran « Ma classe ».', [], [{ type: 'lien', libelle: 'Choisir ma classe', href: '#/eleve' }]);
  const date = a.date;
  const jour = journeeEleve(ds, cl, date);
  const auj = date === iso(cx.maintenant);
  const actuel = auj ? heureCourante(cx.maintenant) : undefined;
  const items = jour
    .filter((x) => x.cours || x.changements.length)
    .map((x) => ({
      h: x.h,
      texte: x.changements.length ? `⚠ ${x.changements.map((c) => c.titre).join(' · ')}` : `${x.cours?.matiere ?? ''} · ${x.cours?.local ?? ''}`,
      ton: (x.changements.length ? 'orange' : 'indigo') as Ton,
    }));
  if (/\bquand\b/.test(a.texte) && a.matieres.length) {
    const prochaines: Ligne[] = [];
    let d = deIso(jourParDefaut(cx.maintenant));
    for (let n = 0; n < 14 && prochaines.length < 4; n++, d = plusJours(d, 1)) {
      if (!estJourDeCours(d)) continue;
      for (const c of ds.coursEleves.filter((x) => x.jour === jourSemaine(d) && x.classes.includes(cl) && a.matieres.includes(x.matiere)).sort((x, y) => x.h - y.h)) {
        if (iso(d) === iso(cx.maintenant) && c.h <= cx.heurePassee) continue;
        prochaines.push({ titre: `${dateLongue(d)} · H${c.h} · ${periode(c.h).debut}`, sous: `${c.matiere} · ${c.local}`, ton: 'indigo' });
      }
    }
    if (!prochaines.length) return r(`Pas de ${a.matieres[0].toLowerCase()} pour la ${cl} dans les deux semaines.`);
    return r(`Prochain cours de ${a.matieres[0].toLowerCase()} : ${prochaines[0].titre}, en ${(prochaines[0].sous ?? '').split(' · ')[1] ?? '?'}.`, [{ type: 'lignes', lignes: prochaines.slice(0, 4) }]);
  }
  if (/\b(change|changements|nouveau|modif)/.test(a.texte)) {
    const chg = ds.changements.filter((c) => c.date === date && c.classe === cl).sort((x, y) => x.h - y.h);
    if (!chg.length) return r(`Aucun changement publié pour la ${cl} ${quandTexte(cx, date)}.`);
    return r(`${chg.length} changement${chg.length > 1 ? 's' : ''} pour la ${cl} ${quandTexte(cx, date)}.`, [{ type: 'lignes', lignes: chg.map((c) => ({ titre: `H${c.h} · ${periode(c.h).debut}`, sous: c.titre, ton: 'orange' })) }]);
  }
  const h = a.h ?? actuel;
  if (h && (i === 'ou-est' || a.maintenant || /\b(maintenant|prochain)\b/.test(a.texte))) {
    const x = jour.find((y) => y.h === h);
    const suite = jour.find((y) => y.h > h && (y.cours || y.changements.length));
    const ici = x?.changements.length ? x.changements.map((c) => c.titre).join(' · ') : x?.cours ? `${x.cours.matiere} en ${x.cours.local}` : 'pas cours';
    return r(
      `${auj ? 'Maintenant' : quandTexte(cx, date, h)}, la ${cl} : ${ici}.${suite ? ` Ensuite (H${suite.h}) : ${suite.changements.length ? suite.changements[0].titre : `${suite.cours?.matiere} en ${suite.cours?.local}`}.` : ''}`,
      [journeeBloc(`La ${cl} · ${JOURS[jourSemaineIso(date)]}`, items, actuel)],
    );
  }
  if (!items.length) return r(`Pas cours pour la ${cl} ${quandTexte(cx, date)}.`);
  return r(`La ${cl} ${quandTexte(cx, date)} : de ${periode(items[0].h).debut} à ${periode(items[items.length - 1].h).fin}.`, [journeeBloc(`La ${cl} · ${JOURS[jourSemaineIso(date)]}`, items, actuel)]);
}

