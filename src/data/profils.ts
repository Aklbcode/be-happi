// Les espaces de Be Happi selon le rôle : ce que chacun voit en premier, ses onglets, ses droits.
// Les droits de l'app sont un confort : la vraie protection reste celle des listes SharePoint.

import type { Profil } from './types';
import type { Ecran } from '../lib/route';

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
  onglets: { ecran: Ecran; libelle: string; icone: string }[];
}

const HAPPI = { ecran: 'happi' as Ecran, libelle: 'Happi', icone: 'etincelle' };
const ECOLE = { ecran: 'ecole' as Ecran, libelle: 'École', icone: 'grille' };

export const PROFILS: DescriptionProfil[] = [
  {
    id: 'prof',
    nom: 'Prof',
    qui: 'Professeur',
    apport: 'Ta journée, tes déplacements de cours, les locaux libres',
    icone: 'livre',
    accueil: 'aujourdhui',
    onglets: [
      { ecran: 'aujourdhui', libelle: "Aujourd'hui", icone: 'soleil' },
      { ecran: 'horaire', libelle: 'Horaire', icone: 'calendrier' },
      HAPPI,
      { ecran: 'locaux', libelle: 'Locaux', icone: 'porte' },
      ECOLE,
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
    apport: 'Absences et leur impact, publication élèves, infos du jour',
    icone: 'note',
    accueil: 'absences',
    onglets: [
      { ecran: 'absences', libelle: 'Absences', icone: 'gens' },
      { ecran: 'publier', libelle: 'Élèves', icone: 'haut_parleur' },
      HAPPI,
      { ecran: 'infos', libelle: 'Infos', icone: 'note' },
      ECOLE,
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
      { ecran: 'ouest', libelle: 'Où est ?', icone: 'loupe' },
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
      { ecran: 'signaler', libelle: 'Signaler', icone: 'outil' },
      ECOLE,
    ],
  },
];

export const profil = (id: Profil): DescriptionProfil => PROFILS.find((p) => p.id === id) ?? PROFILS[0];

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
  const qui = ACCES[ecran];
  return !qui || qui.some((p) => profils.includes(p));
}
