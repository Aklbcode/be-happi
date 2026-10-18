// Données de démonstration : un horaire réaliste mais fictif (noms des collègues inventés).
// Le scénario se joue toujours un lundi de cours : plusieurs profs absents, des heures libérées,
// un local en panne, un déplacement déjà validé, des propositions de collègues à valider
// (dont une qui ne passe plus les contrôles) et un refus récent avec son motif.

import type { Absence, Cours, Dataset, Decision, Deplacement, Info, Reservation, Signalement } from './types';
import { LOCAUX } from './locaux';
import { conge, deIso, estJourDeCours, iso, jourSemaine, minutesDe, plusJours, prochainJourDeCours } from '../lib/calendar';

export const MOI_DEMO = 'MOREAU';

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

// Collègues fictifs qui complètent les journées des classes du prof connecté.
const RENFORTS: [string, string][] = [
  ['PEETERS', 'Français'], ['MARTIN', 'Mathématiques'], ['SIMON', 'Histoire'], ['WILLEMS', 'Néerlandais'],
  ['JANSSENS', 'Éducation physique'], ['GOOSSENS', 'Religion'], ['MAES', 'Anglais'], ['LEROY', 'Géographie'],
  ['DUMONT', 'Français'], ['RENARD', SC],
];
const CLASSES_COMPLETEES = ['3TQA', '3TQB', '2SD', '6TQA', '6TQB'];

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
  for (const classe of CLASSES_COMPLETEES) {
    for (let jour = 1; jour <= 5; jour++) {
      const derniere = jour === 3 ? 5 : 8;
      for (let h = 1; h <= derniere; h++) {
        if (classeOccupee.has(`${classe}|${jour}|${h}`)) continue;
        if (r() > (h === 5 ? 0.35 : 0.82)) continue;
        const candidats = RENFORTS.filter(([p]) => !profOccupe.has(`${p}|${jour}|${h}`));
        if (!candidats.length) continue;
        const [prof, matiere] = candidats[Math.floor(r() * candidats.length)];
        const libres = salles.filter((s) => !localOccupe.has(`${s}|${jour}|${h}`));
        const local = libres[Math.floor(r() * libres.length)] ?? 'BF201';
        ajouter(prof, jour, h, classe, local, matiere);
      }
    }
  }
  return cours;
}

export function datasetDemo(moment: Date): Dataset {
  const lundi = iso(moment);
  const j = (n: number) => iso(plusJours(moment, n));
  const absences: Absence[] = [
    { prof: 'DELVAUX', date: lundi, deH: 1, aH: 9 },
    { prof: 'VERHOEVEN', date: lundi, deH: 3, aH: 4 },
    { prof: 'CLAES', date: lundi, deH: 3, aH: 3 },
    { prof: 'HADDAD', date: j(3), deH: 2, aH: 4 },
    ...[0, 1, 2, 3, 4].map((n) => ({ prof: 'MERTENS', date: j(n), deH: 1, aH: 9 })),
  ];
  const vendrediDernier = j(-3);
  const ouvre = (d: Deplacement) => !conge(deIso(d.date)) && !conge(deIso(d.dateOrigine));
  const deplacements: Deplacement[] = [
    {
      id: 'dep-1', absent: 'VERHOEVEN', date: lundi, hVide: 4, classe: '5TQB', prof: 'LAMBERT', hOrigine: 2, dateOrigine: j(3), statut: 'Validé',
      creeLe: `${j(-4)}T15:02:00`, modifieLe: `${vendrediDernier}T16:10:00`, modifiePar: 'Éducatrice (démo)',
    },
    // À valider : libère le jeudi de Lemaire, mais allonge son lundi.
    { id: 'dep-2', absent: 'DELVAUX', date: lundi, hVide: 7, classe: '1CB', prof: 'LEMAIRE', hOrigine: 1, dateOrigine: j(3), statut: 'En attente', creeLe: `${lundi}T08:12:00` },
    // À valider : le local prévu (BF207) a été réservé entre-temps → un autre local est proposé.
    { id: 'dep-3', absent: 'DELVAUX', date: lundi, hVide: 8, classe: '1CB', prof: 'BENALI', hOrigine: 1, dateOrigine: j(1), statut: 'En attente', creeLe: `${lundi}T08:40:00` },
    // Ne passe plus les contrôles : Lambert n'est finalement pas absent.
    { id: 'dep-4', absent: 'LAMBERT', date: lundi, hVide: 7, classe: '6TQA', prof: 'MAES', hOrigine: 8, dateOrigine: j(3), statut: 'En attente', creeLe: `${vendrediDernier}T12:30:00` },
  ].filter((d) => d.statut === 'Validé' || ouvre(d));
  const reservations: Reservation[] = [{ prof: 'PEETERS', date: lundi, h: 8, local: 'BF207', classe: '—' }];
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
    { date: lundi, categorie: 'Note de service', titre: 'Conseils de classe du 1er trimestre' },
    { date: lundi, categorie: 'Réunion', titre: 'Réunion sciences jeudi · H8 · BT004' },
  ];
  const signalements: Signalement[] = [{ local: 'BC104', titre: "Fuite d'eau", depuis: lundi, bloquant: true }];
  return {
    moi: { nom: MOI_DEMO, prenom: 'Camille', email: 'demo@ecole.be', roles: [] },
    cours: construireCours(),
    absences,
    reservations,
    deplacements,
    infos,
    locaux: LOCAUX,
    signalements,
    decisions,
    journal: true,
  };
}
