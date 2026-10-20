// Données de démonstration : un horaire réaliste mais fictif (noms des collègues inventés).
// Le scénario se joue toujours un lundi de cours : plusieurs profs absents, des heures libérées,
// un local en panne, un déplacement déjà validé, des propositions de collègues à valider
// (dont une qui ne passe plus les contrôles) et un refus récent avec son motif.

import type { Absence, Cours, CoursEleve, Dataset, Decision, Deplacement, FicheProf, Info, Reservation, ResaMateriel, Resultat, SeanceCR, Signalement } from './types';
import { LOCAUX } from './locaux';
import { MIDI, conge, deIso, estJourDeCours, iso, jourSemaine, jourSemaineIso, minutesDe, plusJours, plusJoursIso, prochainJourDeCours } from '../lib/calendar';
import { memesClasses } from '../logic/horaire';
import { changementsDuJour } from '../logic/publication';

export const MOI_DEMO = 'MOREAU';
/** L'élève de la démo (vue élève de Cap Réussite) : adresse inventée. */
export const ELEVE_DEMO_MAIL = 'eleve.demo@eleves.ecole.example';

/** Le lundi de cours qui sert de décor à la démo, et l'heure simulée. */
export function momentDemo(reel: Date): Date {
  let d = prochainJourDeCours(reel, true);
  for (let i = 0; i < 60 && jourSemaine(d) !== 1; i++) d = prochainJourDeCours(plusJours(d, 1), true);
  const memeJour = iso(d) === iso(reel) && estJourDeCours(reel);
  const min = memeJour && minutesDe(reel) >= 480 && minutesDe(reel) <= 990 ? minutesDe(reel) : 10 * 60 + 31;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(min / 60), min % 60, 0);
}

type Fixe = [prof: string, jour: number, h: number, classe: string, local: string, matiere: string];

const SC = 'Sciences';
const FS = 'Formation scientifique';

// Horaire du prof de démo (inventé) + scénario du lundi.
const FIXES: Fixe[] = [
  [MOI_DEMO, 1, 1, '3TQA', 'BF108', SC], [MOI_DEMO, 1, 2, '3TQB', 'BF108', SC], [MOI_DEMO, 1, 4, '2SD', 'BC206', SC],
  [MOI_DEMO, 1, 5, '3GB', 'BF110', SC], [MOI_DEMO, 1, 7, '2SD', 'BC105', SC],
  [MOI_DEMO, 3, 2, '6TQB', 'BT102', FS], [MOI_DEMO, 3, 3, '3TQB', 'BT102', SC],
  [MOI_DEMO, 3, 4, '2SD', 'BT103', SC], [MOI_DEMO, 3, 5, '6TQA', 'BT103', FS],
  [MOI_DEMO, 4, 6, '2SD', 'BT204', SC], [MOI_DEMO, 4, 7, '3TQA', 'BT204', SC],
  [MOI_DEMO, 5, 1, '3TQA', 'BF202', SC], [MOI_DEMO, 5, 3, '4SA', 'BC104', SC], [MOI_DEMO, 5, 4, '4SA', 'BC104', SC],
  [MOI_DEMO, 5, 6, '3TQA', 'BF109', SC], [MOI_DEMO, 5, 7, '6TQB', 'BF109', FS], [MOI_DEMO, 5, 8, '6TQA', 'BF109', FS],

  ['DELVAUX', 1, 1, '5TQA', 'BF207', 'Mathématiques'], ['DELVAUX', 1, 2, '5TQA', 'BF207', 'Mathématiques'],
  ['DELVAUX', 1, 4, '4TQB', 'BC203', 'Mathématiques'], ['DELVAUX', 1, 6, '3TQA', 'BT203', 'Mathématiques'],
  ['DELVAUX', 1, 7, '1CB', 'BF207', 'Mathématiques'], ['DELVAUX', 1, 8, '1CB', 'BF207', 'Mathématiques'],
  ['VERHOEVEN', 1, 3, '2SA', 'BF208', 'Français'], ['VERHOEVEN', 1, 4, '5TQB', 'BF110', 'Français'],
  ['MERTENS', 1, 6, '1CA', 'BC205', 'Français'], ['MERTENS', 2, 2, '1CA', 'BC205', 'Français'], ['MERTENS', 4, 5, '1CA', 'BC205', 'Français'],
  ['BENALI', 1, 2, '1CA', 'BF211', 'Néerlandais'], ['BENALI', 1, 9, '1CA', 'BC205', 'Néerlandais'], ['BENALI', 2, 1, '1CB', 'BF207', 'Néerlandais'],
  ['LEMAIRE', 1, 1, '4TQA', 'BC203', 'Histoire'], ['LEMAIRE', 1, 3, '6TQA', 'BF211', 'Histoire'],
  ['LEMAIRE', 1, 4, '6TQA', 'BC104', 'Histoire'], ['LEMAIRE', 3, 2, '1CB', 'BF207', 'Histoire'], ['LEMAIRE', 4, 1, '1CB', 'BF207', 'Histoire'],
  ['LAMBERT', 1, 3, '5TQB', 'BF110', 'Géographie'], ['LAMBERT', 1, 7, '6TQA', 'BT004', 'Géographie'], ['LAMBERT', 4, 2, '5TQB', 'BF110', 'Géographie'],
  ['KABONGO', 1, 1, '6TQB', 'BT006', SC], ['KABONGO', 1, 2, '2SC', 'BT203', SC], ['KABONGO', 1, 3, '4TQA', 'BT006', SC],
  ['KABONGO', 1, 6, '5TQB', 'BT006', SC], ['KABONGO', 1, 7, '6TQB', 'BT203', SC],
  ['RENARD', 1, 1, '5SB', 'BT004', SC], ['RENARD', 1, 2, '4SB', 'BT004', SC],
  ['HADDAD', 1, 1, '3TQB', 'BC205', 'Mathématiques'], ['HADDAD', 1, 3, '2SD', 'BC205', 'Mathématiques'], ['HADDAD', 1, 7, '3TQB', 'BF110', 'Mathématiques'],
  ['HADDAD', 4, 2, '3TQB', 'BC205', 'Mathématiques'], ['HADDAD', 4, 3, '2SD', 'BC205', 'Mathématiques'], ['HADDAD', 4, 4, '3TQA', 'BC205', 'Mathématiques'],
  ['DUMONT', 1, 7, '5TQA', 'BF211', 'Français'],
  ['CLAES', 1, 3, '1CB', 'BF209', 'Néerlandais'],
];

// Collègues fictifs (noms inventés) qui complètent les journées de toutes les classes de la démo.
const RENFORTS: [string, string][] = [
  ['PEETERS', 'Français'], ['MARTIN', 'Mathématiques'], ['SIMON', 'Histoire'], ['WILLEMS', 'Néerlandais'],
  ['JANSSENS', 'Éducation physique'], ['GOOSSENS', 'Religion'], ['MAES', 'Anglais'], ['LEROY', 'Géographie'],
  ['DUMONT', 'Français'], ['RENARD', SC],
  ['WOUTERS', 'Mathématiques'], ['DUBOIS', 'Français'], ['COLLARD', 'Néerlandais'], ['HENRARD', 'Éducation physique'],
  ['LECOMTE', 'Anglais'], ['GERARD', 'Histoire'], ['FONTAINE', SC], ['DESCAMPS', 'Mathématiques'],
  ['NGUYEN', 'Informatique'], ['OZTURK', 'Français'], ['ROSSI', 'Géographie'], ['GARCIA', 'Néerlandais'],
  ['DELCOURT', 'Religion'], ['LEBRUN', 'Éducation physique'], ['CORNET', 'Mathématiques'], ['PIRARD', SC],
];
/** Les classes du prof de démo d'abord (même tirage qu'avant), puis toutes les autres. */
const CLASSES_COMPLETEES = ['3TQA', '3TQB', '2SD', '6TQA', '6TQB', '1CA', '1CB', '2SA', '2SC', '3GB', '4SA', '4SB', '4TQA', '4TQB', '5SB', '5TQA', '5TQB'];

function hasard(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function construireCours(): Cours[] {
  const cours: Cours[] = [];
  const profOccupe = new Set<string>();
  const classeOccupee = new Set<string>();
  const localOccupe = new Set<string>();
  const ajouter = (prof: string, jour: number, h: number, classe: string, local: string, matiere: string) => {
    cours.push({ id: `d${cours.length}`, prof, jour, h, classes: classe.split(',').map((c) => c.trim()), classe, local, matiere });
    profOccupe.add(`${prof}|${jour}|${h}`);
    classeOccupee.add(`${classe}|${jour}|${h}`);
    localOccupe.add(`${local}|${jour}|${h}`);
  };
  FIXES.forEach((f) => ajouter(...f));

  const r = hasard(20261116);
  const salles = LOCAUX.filter((l) => l.type === 'Classe').map((l) => l.code);
  const labos = LOCAUX.filter((l) => /labo/i.test(l.type)).map((l) => l.code);
  const gym = LOCAUX.filter((l) => /sport/i.test(l.type)).map((l) => l.code);
  const info = LOCAUX.filter((l) => /informatique/i.test(l.type)).map((l) => l.code);
  // Chaque classe garde une salle « à elle » quand elle est libre : c'est plus réaliste.
  const salleDe = new Map<string, string>();
  for (const classe of CLASSES_COMPLETEES) {
    const premiere = classe === '3TQA' || CLASSES_COMPLETEES.indexOf(classe) < 5;
    for (let jour = 1; jour <= 5; jour++) {
      const derniere = jour === 3 ? 5 : 8;
      for (let h = 1; h <= derniere; h++) {
        if (classeOccupee.has(`${classe}|${jour}|${h}`)) continue;
        if (r() > (h === 5 ? 0.35 : 0.82)) continue;
        const pool = premiere ? RENFORTS.slice(0, 10) : RENFORTS;
        const candidats = pool.filter(([p]) => !profOccupe.has(`${p}|${jour}|${h}`));
        if (!candidats.length) continue;
        const [prof, matiere] = candidats[Math.floor(r() * candidats.length)];
        const libres = (liste: string[]) => liste.filter((s) => !localOccupe.has(`${s}|${jour}|${h}`));
        let local: string;
        if (premiere) {
          local = libres(salles)[Math.floor(r() * libres(salles).length)] ?? 'BF201';
        } else {
          const special = matiere === 'Éducation physique' ? libres(gym) : matiere === SC ? libres(labos) : matiere === 'Informatique' ? libres(info) : [];
          const habituelle = salleDe.get(classe);
          local = special[0] ?? (habituelle && !localOccupe.has(`${habituelle}|${jour}|${h}`) ? habituelle : libres(salles)[Math.floor(r() * libres(salles).length)] ?? 'BF201');
          if (!salleDe.has(classe) && !special.length) salleDe.set(classe, local);
        }
        ajouter(prof, jour, h, classe, local, matiere);
      }
    }
  }
  return cours;
}

/** Le n-ième jour de cours avant (n < 0) ou après (n > 0) la date. */
function jourOuvre(depuis: Date, n: number): string {
  let d = depuis;
  for (let k = 0; k < Math.abs(n); ) {
    d = plusJours(d, n > 0 ? 1 : -1);
    if (estJourDeCours(d)) k++;
  }
  return iso(d);
}

/**
 * Sept semaines d'historique avant le lundi de démo : des absences, et des heures récupérées de plus
 * en plus souvent (déplacements validés ou remédiation), pour que le tableau de bord ait du relief.
 */
function historique(cours: Cours[], moment: Date): { absences: Absence[]; deplacements: Deplacement[]; reservations: Reservation[] } {
  const r = hasard(1109);
  const absences: Absence[] = [];
  const deplacements: Deplacement[] = [];
  const reservations: Reservation[] = [];
  const profs = [...new Set(cours.map((c) => c.prof))].filter((p) => p !== MOI_DEMO).sort();
  const jours: string[] = [];
  for (let d = plusJours(moment, -1); jours.length < 35; d = plusJours(d, -1)) if (estJourDeCours(d)) jours.push(iso(d));
  jours.reverse();
  const occupe = new Set<string>();
  let remedMoi = 0;
  let reste = 0.5;

  const libre = (prof: string, date: string, h: number) => {
    const jour = jourSemaineIso(date);
    if (occupe.has(`${prof}|${date}|${h}`)) return false;
    if (cours.some((c) => c.prof === prof && c.jour === jour && c.h === h)) return false;
    return !absences.some((a) => a.prof === prof && a.date === date && h >= a.deH && h <= a.aH);
  };

  jours.forEach((date, i) => {
    const jour = jourSemaineIso(date);
    const pRecup = 0.15 + 0.75 * (i / (jours.length - 1));
    const candidats = profs.filter((p) => cours.some((c) => c.prof === p && c.jour === jour));
    const nb = r() < 0.3 ? 1 : r() < 0.75 ? 2 : 3;
    const choisis: string[] = [];
    while (choisis.length < Math.min(nb, candidats.length)) {
      const p = candidats[Math.floor(r() * candidats.length)];
      if (!choisis.includes(p)) choisis.push(p);
    }
    for (const prof of choisis) {
      const sesCours = cours.filter((c) => c.prof === prof && c.jour === jour).sort((a, b) => a.h - b.h);
      const plein = r() < 0.6;
      const deH = plein ? 1 : sesCours[Math.floor(r() * sesCours.length)].h;
      const aH = plein ? 9 : Math.min(9, deH + Math.floor(r() * 3));
      absences.push({ id: `h-a-${absences.length}`, prof, date, deH, aH });
      for (const c of sesCours.filter((x) => x.h >= deH && x.h <= aH && x.h !== MIDI)) {
        // Diffusion d'erreur : la part d'heures récupérées suit la rampe sans à-coups d'une semaine à l'autre.
        reste += pRecup;
        if (reste < 1) continue;
        reste -= 1;
        const lundi = plusJoursIso(date, 1 - jour);
        const moves = cours.filter(
          (x) => x.prof !== prof && x.prof !== MOI_DEMO && memesClasses(x.classes, c.classes) && (x.jour > jour || (x.jour === jour && x.h !== c.h)) && libre(x.prof, date, c.h),
        );
        const x = moves.length && r() < 0.7 ? moves[Math.floor(r() * moves.length)] : undefined;
        const dateOrigine = x ? plusJoursIso(lundi, x.jour - 1) : '';
        if (x && estJourDeCours(deIso(dateOrigine))) {
          const veille = jourOuvre(deIso(date), -1);
          deplacements.push({
            id: `h-d-${deplacements.length}`, absent: prof, date, hVide: c.h, classe: x.classe, prof: x.prof, hOrigine: x.h, dateOrigine, statut: 'Validé',
            creeLe: `${veille}T15:${String(10 + Math.floor(r() * 40)).padStart(2, '0')}:00`, modifieLe: `${veille}T16:${String(10 + Math.floor(r() * 40)).padStart(2, '0')}:00`, modifiePar: 'Éducatrice (démo)',
          });
          occupe.add(`${x.prof}|${date}|${c.h}`);
          continue;
        }
        const dispo = [MOI_DEMO, ...profs].filter((p) => p !== prof && libre(p, date, c.h));
        const prof2 = dispo.includes(MOI_DEMO) && remedMoi < 6 && r() < 0.45 ? MOI_DEMO : dispo[Math.floor(r() * dispo.length)];
        if (!prof2) continue;
        if (prof2 === MOI_DEMO) remedMoi++;
        reservations.push({ id: `h-r-${reservations.length}`, prof: prof2, date, h: c.h, local: c.local, classe: `${c.classes[0]} · remédiation`, note: 'remédiation' });
        occupe.add(`${prof2}|${date}|${c.h}`);
      }
    }
  });
  return { absences, deplacements, reservations };
}

/** Prénoms inventés, pour les signalements et les messages de la démo. */
const PRENOMS: Record<string, string> = { HADDAD: 'Nadia', LAMBERT: 'Luc', LEMAIRE: 'Sarah', BENALI: 'Yanis', KABONGO: 'Grâce' };

export function datasetDemo(moment: Date): Dataset {
  const lundi = iso(moment);
  const j = (n: number) => iso(plusJours(moment, n));
  const cours = construireCours();
  const histo = historique(cours, moment);
  const absences: Absence[] = [
    ...histo.absences,
    { id: 'a-1', prof: 'DELVAUX', date: lundi, deH: 1, aH: 9 },
    { id: 'a-2', prof: 'VERHOEVEN', date: lundi, deH: 3, aH: 4 },
    { id: 'a-3', prof: 'CLAES', date: lundi, deH: 3, aH: 3 },
    { id: 'a-4', prof: 'HADDAD', date: j(3), deH: 2, aH: 4 },
    ...[0, 1, 2, 3, 4].map((n) => ({ id: `a-m${n}`, prof: 'MERTENS', date: j(n), deH: 1, aH: 9 })),
  ];
  const vendrediDernier = jourOuvre(moment, -1);
  const ouvre = (d: Deplacement) => !conge(deIso(d.date)) && !conge(deIso(d.dateOrigine));
  const deplacements: Deplacement[] = [
    ...histo.deplacements,
    ...[
      {
        id: 'dep-1', absent: 'VERHOEVEN', date: lundi, hVide: 4, classe: '5TQB', prof: 'LAMBERT', hOrigine: 2, dateOrigine: j(3), statut: 'Validé',
        creeLe: `${jourOuvre(moment, -2)}T15:02:00`, modifieLe: `${vendrediDernier}T16:10:00`, modifiePar: 'Éducatrice (démo)',
      },
      // À valider : libère le jeudi de Lemaire, mais allonge son lundi.
      { id: 'dep-2', absent: 'DELVAUX', date: lundi, hVide: 7, classe: '1CB', prof: 'LEMAIRE', hOrigine: 1, dateOrigine: j(3), statut: 'En attente', creeLe: `${lundi}T08:12:00` },
      // À valider : le local prévu (BF207) a été réservé entre-temps → un autre local est proposé.
      { id: 'dep-3', absent: 'DELVAUX', date: lundi, hVide: 8, classe: '1CB', prof: 'BENALI', hOrigine: 1, dateOrigine: j(1), statut: 'En attente', creeLe: `${lundi}T08:40:00` },
      // Ne passe plus les contrôles : Lambert n'est finalement pas absent.
      { id: 'dep-4', absent: 'LAMBERT', date: lundi, hVide: 7, classe: '6TQA', prof: 'MAES', hOrigine: 8, dateOrigine: j(3), statut: 'En attente', creeLe: `${vendrediDernier}T12:30:00` },
    ].filter((d) => d.statut === 'Validé' || ouvre(d)),
  ];
  const reservations: Reservation[] = [...histo.reservations, { id: 'r-1', prof: 'PEETERS', date: lundi, h: 8, local: 'BF207', classe: '—' }];
  const decisions: Decision[] = [
    {
      id: 'dec-1', statut: 'Validé', commentaire: 'OK, la 5TQB est prévenue.', classe: '5TQB', prof: 'LAMBERT', absent: 'VERHOEVEN',
      date: lundi, hVide: 4, dateOrigine: j(3), hOrigine: 2, par: 'Éducatrice (démo)', le: `${vendrediDernier}T16:10:00`,
    },
    {
      id: 'dec-2', statut: 'Refusé', commentaire: 'Vendredi en H6, la 3TQA présente son projet au jury : on garde ce cours.', classe: '3TQA', prof: MOI_DEMO, absent: 'DELVAUX',
      date: lundi, hVide: 6, dateOrigine: j(4), hOrigine: 6, par: 'Éducatrice (démo)', le: `${vendrediDernier}T11:05:00`,
    },
  ];
  const infos: Info[] = [
    { id: 'i-1', date: lundi, categorie: 'Info', titre: 'Conseils de classe du 1er trimestre : le planning est dans ton casier' },
    { id: 'i-2', date: lundi, categorie: 'Retard', titre: 'Bus 115 en retard : les élèves concernés arrivent vers 8h45' },
    { id: 'i-3', date: lundi, categorie: 'Info', titre: 'Réunion sciences jeudi · H8 · BT004' },
    { id: 'i-4', date: jourOuvre(moment, 3), categorie: 'Info', titre: 'Conseil de classe des 3TQ · 16h30 · BT004' },
    { id: 'i-5', date: jourOuvre(moment, 4), categorie: 'Info', titre: 'Sortie au musée des sciences · 6TQA, de H3 à H8' },
  ];
  const moiMail = 'camille.moreau@ecole.example';
  const ilYa = jourOuvre(moment, -2);
  const signalements: Signalement[] = [
    { id: 'sig-1', local: 'BC104', titre: "BC104 · Fuite d'eau au plafond", depuis: lundi, bloquant: true, statut: 'En cours', resolu: false, auteur: 'Nadia Haddad', le: `${lundi}T07:52:00`, reponse: 'Plombier prévenu, passage ce midi.' },
    { id: 'sig-2', local: 'BF110', titre: 'BF110 · Store bloqué en position basse', depuis: ilYa, bloquant: false, statut: 'En cours', resolu: false, auteur: 'Camille Moreau', auteurMail: moiMail, le: `${ilYa}T10:20:00`, reponse: 'Pièce commandée, passage jeudi.' },
    { id: 'sig-3', local: 'BC205', titre: 'BC205 · Prise électrique arrachée près du bureau', depuis: jourOuvre(moment, -12), bloquant: false, statut: 'Résolu', resolu: true, auteur: 'Camille Moreau', auteurMail: moiMail, le: `${jourOuvre(moment, -12)}T13:05:00`, reponse: 'Réparée.' },
    { id: 'sig-4', local: 'BT004', titre: 'BT004 · Le projecteur clignote', depuis: lundi, bloquant: false, statut: 'Nouveau', resolu: false, auteur: 'Luc Lambert', le: `${lundi}T08:31:00` },
    { id: 'sig-5', local: 'PR003', titre: 'PR003 · Chauffage froid depuis ce matin', depuis: lundi, bloquant: false, statut: 'Nouveau', resolu: false, auteur: 'Élève (démo)', le: `${lundi}T09:05:00` },
  ];
  const materiel: ResaMateriel[] = [
    { id: 'm-1', prof: 'LAMBERT', date: lundi, h: 3, rack: 'Rack tablettes A', classe: '5TQB' },
    { id: 'm-2', prof: 'KABONGO', date: lundi, h: 3, rack: 'Vidéoprojecteur mobile', classe: '4TQA' },
    // Le prochain cours de Camille en H6 (un autre jour que lundi) : PC portables pour sa classe.
    ...(() => {
      for (let n = 1; n <= 10; n++) {
        const d = jourOuvre(moment, n);
        const c = cours.find((x) => x.prof === MOI_DEMO && x.jour === jourSemaineIso(d) && x.h === 6);
        if (c) return [{ id: 'm-3', prof: MOI_DEMO, date: d, h: 6, rack: 'Rack PC portables', classe: c.classe }];
      }
      return [];
    })(),
  ];
  const noms = [...new Set(cours.map((c) => c.prof))].sort();
  const profs: FicheProf[] = noms.map((nom) => ({ nom, email: nom === MOI_DEMO ? moiMail : `${(PRENOMS[nom] ?? '').toLowerCase()}${PRENOMS[nom] ? '.' : ''}${nom.toLowerCase()}@ecole.example`.normalize('NFD').replace(/[̀-ͯ]/g, '') }));
  const vus = new Set<string>();
  const coursEleves: CoursEleve[] = [];
  for (const c of cours) {
    const cle = `${c.jour}|${c.h}|${c.classe}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    coursEleves.push({ jour: c.jour, h: c.h, classes: c.classes, matiere: c.matiere, local: c.local });
  }
  // Cap Réussite (élèves inventés). Lundi H6, la 3TQA (Delvaux absent) et la 1CA (Mertens absente)
  // sont à l'étude ; Camille est en fourche et donne Sciences.
  const mailEl = (n: string) => `${n.toLowerCase().replace(/[^a-z.]/g, '')}@eleves.ecole.example`;
  const ilYa3 = jourOuvre(moment, -3);
  const capReussite: SeanceCR[] = [
    { id: 'cr-1', classe: '3TQA', eleve: 'Léa D.', eleveMail: mailEl('lea.d'), date: lundi, h: 6, matiere: SC, origine: 'Élève', statut: 'Disponible', creeLe: `${lundi}T08:02:00` },
    { id: 'cr-2', classe: '3TQA', eleve: 'Tom V.', eleveMail: mailEl('tom.v'), date: lundi, h: 6, matiere: SC, origine: 'Élève', statut: 'Disponible', creeLe: `${lundi}T09:40:00` },
    { id: 'cr-3', classe: '1CA', eleve: 'Yasmine A.', eleveMail: mailEl('yasmine.a'), date: lundi, h: 6, matiere: 'Français', origine: 'Élève', statut: 'Disponible', creeLe: `${lundi}T08:15:00` },
    // Déjà données (elles remplissent la feuille de prestations).
    { id: 'cr-4', classe: '3TQA', eleve: 'Élève (démo)', eleveMail: ELEVE_DEMO_MAIL, date: ilYa3, h: 6, matiere: SC, origine: 'Élève', statut: 'Prise', prof: MOI_DEMO, local: 'BF108' },
    { id: 'cr-5', classe: '3TQA', eleve: 'Noah K.', eleveMail: mailEl('noah.k'), date: ilYa3, h: 6, matiere: SC, origine: 'Échec', statut: 'Prise', prof: MOI_DEMO, local: 'BF108' },
    { id: 'cr-6', classe: '2SD', date: jourOuvre(moment, -8), h: 3, matiere: SC, origine: 'Prof', statut: 'Prise', prof: MOI_DEMO, local: 'BC206' },
    { id: 'cr-7', classe: '1CA', eleve: 'Inès B.', eleveMail: mailEl('ines.b'), date: jourOuvre(moment, -2), h: 4, matiere: SC, origine: 'Échec', statut: 'Prise', prof: 'KABONGO', local: 'BT006' },
    { id: 'cr-8', classe: '5TQB', date: jourOuvre(moment, -5), h: 8, matiere: 'Géographie', origine: 'Prof', statut: 'Prise', prof: 'LAMBERT', local: 'BF110' },
    { id: 'cr-9', classe: '1CA', eleve: 'Sam R.', eleveMail: mailEl('sam.r'), date: jourOuvre(moment, -4), h: 2, matiere: 'Français', origine: 'Élève', statut: 'Prise', prof: 'DUMONT', local: 'BF211' },
  ];
  // Export des bulletins (inventé) : seulement « en échec » ou non, jamais de note.
  const resultats: Resultat[] = [
    { eleve: 'Noah K.', eleveMail: mailEl('noah.k'), classe: '3TQA', matiere: SC, periode: 'Bulletin de Toussaint', echec: true },
    { eleve: 'Inès B.', eleveMail: mailEl('ines.b'), classe: '1CA', matiere: SC, periode: 'Bulletin de Toussaint', echec: true },
    { eleve: 'Sam R.', eleveMail: mailEl('sam.r'), classe: '1CA', matiere: 'Français', periode: 'Bulletin de Toussaint', echec: true },
    { eleve: 'Léa D.', eleveMail: mailEl('lea.d'), classe: '3TQA', matiere: 'Mathématiques', periode: 'Bulletin de Toussaint', echec: true },
    { eleve: 'Tom V.', eleveMail: mailEl('tom.v'), classe: '3TQA', matiere: SC, periode: 'Bulletin de Toussaint', echec: false },
  ];
  const ds: Dataset = {
    moi: { nom: MOI_DEMO, prenom: 'Camille', email: moiMail, roles: [], profils: ['prof', 'educateur', 'secretariat', 'direction', 'technique', 'eleve'] },
    cours,
    coursEleves,
    absences,
    reservations,
    deplacements,
    infos,
    locaux: LOCAUX,
    signalements,
    decisions,
    journal: true,
    profs,
    changements: [],
    materiel,
    capReussite,
    resultats,
    absentes: [],
  };
  // Publiée à 8h05 par le secrétariat, avant les propositions du matin.
  ds.changements = changementsDuJour(ds, lundi).map((c, i) => ({ ...c, id: `c-${i}` }));
  return ds;
}
