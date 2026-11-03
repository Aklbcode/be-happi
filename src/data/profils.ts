// Les espaces de La Tour selon le rôle : ce que chacun voit en premier, ses onglets, ses droits.
// Les droits de l'app sont un confort : la vraie protection reste celle des listes SharePoint.

import type { Profil } from './types';
import type { Ecran } from '../lib/route';
import { ecranActif } from '../options';

export type { Profil } from './types';

export interface DescriptionProfil {
  id: Profil;
  nom: string;
  qui: string;
  /** Ce que l'espace apporte, en une ligne. */
  apport: string;
  icone: string;
  accueil: Ecran;
  /** Les 5 onglets du bas (Happi toujours au milieu). */
  onglets: { ecran: Ecran; libelle: string; icone: string; /** Libellé complet (menu sur ordinateur). */ long?: string }[];
  /** Onglets de remplacement quand une option est coupée (version de test). */
  secours?: { ecran: Ecran; libelle: string; icone: string; long?: string }[];
}

const HAPPI = { ecran: 'happi' as Ecran, libelle: 'Happi', icone: 'etincelle' };
const ECOLE = { ecran: 'ecole' as Ecran, libelle: 'École', icone: 'grille' };
const CAP = { ecran: 'cap' as Ecran, libelle: 'Réussite', long: 'Cap Réussite', icone: 'drapeau' };

export const PROFILS: DescriptionProfil[] = [
  {
    id: 'prof',
    nom: 'Prof',
    qui: 'Professeur',
    apport: 'Ta journée, tes déplacements de cours, les locaux libres',
    icone: 'livre',
    // Version de test : on ouvre sur la semaine.
    accueil: 'horaire',
    onglets: [
      { ecran: 'horaire', libelle: 'Horaire', icone: 'calendrier' },
      { ecran: 'aujourdhui', libelle: "Aujourd'hui", icone: 'soleil' },
      HAPPI,
      CAP,
      ECOLE,
    ],
    secours: [
      { ecran: 'locaux', libelle: 'Locaux', icone: 'porte' },
      { ecran: 'ouest', libelle: 'Où est ?', icone: 'loupe' },
    ],
  },
  {
    id: 'educateur',
    nom: 'Éducateur',
    qui: 'Éducatrice, éducateur',
    apport: 'Le pilotage du jour, les classes à l’étude, les validations',
    icone: 'gens',
    accueil: 'pilotage',
    onglets: [
      { ecran: 'pilotage', libelle: 'Pilotage', icone: 'pouls' },
      { ecran: 'ouest', libelle: 'Où est ?', icone: 'loupe' },
      HAPPI,
      { ecran: 'validations', libelle: 'Valider', icone: 'echange' },
      ECOLE,
    ],
  },
  {
    id: 'secretariat',
    nom: 'Secrétariat',
    qui: 'Service administratif',
    apport: 'Absences et leur impact, validation des déplacements',
    icone: 'note',
    accueil: 'absences',
    onglets: [
      { ecran: 'absences', libelle: 'Absences', icone: 'gens' },
      { ecran: 'publier', libelle: 'Élèves', icone: 'haut_parleur' },
      HAPPI,
      { ecran: 'infos', libelle: 'Infos', icone: 'note' },
      ECOLE,
    ],
    secours: [
      { ecran: 'validations', libelle: 'Valider', icone: 'echange' },
      { ecran: 'pilotage', libelle: 'Pilotage', icone: 'pouls' },
      { ecran: 'ouest', libelle: 'Où est ?', icone: 'loupe' },
    ],
  },
  {
    id: 'direction',
    nom: 'Direction',
    qui: 'Direction',
    apport: 'Le tableau de bord : heures récupérées, classes touchées, locaux',
    icone: 'graphe',
    accueil: 'direction',
    onglets: [
      { ecran: 'direction', libelle: 'Tableau', icone: 'graphe' },
      { ecran: 'pilotage', libelle: 'Pilotage', icone: 'pouls' },
      HAPPI,
      CAP,
      ECOLE,
    ],
  },
  {
    id: 'technique',
    nom: 'Technique',
    qui: 'Service technique',
    apport: 'Les signalements à traiter, ce qui bloque des cours d’abord',
    icone: 'outil',
    accueil: 'technique',
    onglets: [
      { ecran: 'technique', libelle: 'À traiter', icone: 'outil' },
      { ecran: 'locaux', libelle: 'Locaux', icone: 'porte' },
      HAPPI,
      { ecran: 'qr', libelle: 'QR portes', icone: 'qr' },
      ECOLE,
    ],
  },
  {
    id: 'eleve',
    nom: 'Élève',
    qui: 'Élève',
    apport: 'Ta classe aujourd’hui et cette semaine, sans rien manquer',
    icone: 'chapeau',
    accueil: 'eleve',
    onglets: [
      { ecran: 'eleve', libelle: 'Ma classe', icone: 'chapeau' },
      { ecran: 'semaine', libelle: 'Semaine', icone: 'calendrier' },
      HAPPI,
      CAP,
      ECOLE,
    ],
  },
];

/** L'espace, avec ses onglets ouverts dans cette version (les onglets coupés sont remplacés). */
export function profil(id: Profil): DescriptionProfil {
  const p = PROFILS.find((x) => x.id === id) ?? PROFILS[0];
  const onglets = p.onglets.filter((o) => ecranActif(o.ecran));
  const ecole = onglets.filter((o) => o.ecran === 'ecole');
  const autres = onglets.filter((o) => o.ecran !== 'ecole');
  for (const s of p.secours ?? []) {
    if (autres.length + ecole.length >= 5) break;
    if (ecranActif(s.ecran) && !autres.some((o) => o.ecran === s.ecran)) autres.push(s);
  }
  const accueil = ecranActif(p.accueil) ? p.accueil : (autres[0]?.ecran ?? 'ecole');
  return { ...p, accueil, onglets: [...autres, ...ecole] };
}

const PERSONNEL: Profil[] = ['prof', 'educateur', 'secretariat', 'direction', 'technique'];

/** Qui peut ouvrir quel écran (selon les espaces ouverts à la personne). */
const ACCES: Partial<Record<Ecran, Profil[]>> = {
  aujourdhui: ['prof'],
  horaire: ['prof'],
  deplacer: ['prof'],
  locaux: PERSONNEL,
  materiel: ['prof', 'educateur', 'secretariat', 'direction', 'technique'],
  ouest: PERSONNEL,
  collab: PERSONNEL,
  pilotage: ['educateur', 'secretariat', 'direction'],
  validations: ['educateur', 'secretariat', 'direction'],
  absences: ['secretariat', 'educateur', 'direction'],
  publier: ['secretariat', 'educateur'],
  direction: ['direction'],
  technique: ['technique', 'direction'],
  qr: ['technique', 'direction', 'secretariat'],
  infos: PERSONNEL,
  connexion: PERSONNEL,
};

export function peutOuvrir(ecran: Ecran, profils: Profil[]): boolean {
  if (!ecranActif(ecran)) return false;
  const qui = ACCES[ecran];
  return !qui || qui.some((p) => profils.includes(p));
}
