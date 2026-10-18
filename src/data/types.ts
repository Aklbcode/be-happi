// Modèle de données de Be Happi.
// Il suit les listes SharePoint déjà utilisées par l'app Power Apps (Horaires, Absences, Réservations, Deplacements, Infos…).

/** Une ligne de la liste Horaires : un prof, un jour, une heure. */
export interface Cours {
  id: string;
  prof: string;        // nom tel qu'il apparaît dans Horaires (ex. DUPONT)
  jour: number;        // 1 = lundi … 5 = vendredi
  h: number;           // 1 à 9
  classes: string[];   // une ou plusieurs classes (groupes)
  classe: string;      // texte tel quel
  local: string;
  matiere: string;
}

export interface Absence {
  prof: string;
  date: string;        // AAAA-MM-JJ
  deH: number;         // première heure d'absence
  aH: number;          // dernière heure d'absence (incluse)
}

export interface Reservation {
  id?: string;
  prof: string;
  date: string;
  h: number;
  local: string;
  classe: string;
  note?: string;
  absent?: string;     // prof qui a normalement ce local à cette heure (colonne Absent)
}

/**
 * Un déplacement : un prof avance un de ses cours dans l'heure libérée par un collègue absent.
 * Statuts partagés avec Power Apps : « En attente » puis « Validé ». Power Apps ne connaît pas
 * « Refusé » (tout ce qui n'est pas « En attente » y compte comme confirmé) : un refus supprime donc
 * la ligne, comme le bouton « Annuler » de Power Apps, et la décision va dans le journal.
 */
export interface Deplacement {
  id?: string;
  absent: string;      // prof absent dont l'heure est libérée
  date: string;        // jour de l'heure libérée
  hVide: number;       // heure libérée
  classe: string;      // une classe ou plusieurs (« 5GA, 5GD ») pour un cours groupé
  prof: string;        // prof qui déplace son cours
  hOrigine: number;
  dateOrigine: string;
  statut: string;      // En attente · Validé
  creeLe?: string;     // date et heure de la proposition (ISO)
  modifieLe?: string;  // dernière modification (ISO) : la validation, pour un déplacement validé
  modifiePar?: string; // qui a fait la dernière modification
  etag?: string;       // version SharePoint, pour ne pas écraser une décision prise ailleurs
}

/** Une décision de l'éducateur, gardée dans le journal (liste « Decisions », facultative). */
export interface Decision {
  id?: string;
  statut: 'Validé' | 'Refusé';
  commentaire: string;
  classe: string;
  prof: string;        // prof qui avait proposé
  absent: string;
  date: string;        // heure libérée : jour…
  hVide: number;       // … et heure
  dateOrigine: string;
  hOrigine: number;
  local?: string;      // local finalement attribué, s'il a changé
  par: string;         // qui a décidé
  le: string;          // quand (ISO)
}

export interface Info {
  date: string;
  categorie: string;
  titre: string;
}

export interface Local {
  code: string;
  batiment: string;    // T, F, C, PR ou Autres
  etage: number;       // 0 = rez, 1, 2 ; -1 = hors bâtiment
  type: string;
  vp: boolean;         // vidéoprojecteur
  tbi: boolean;
  tv: boolean;
  autre: string;
}

export interface Signalement {
  local: string;
  titre: string;
  depuis: string;      // AAAA-MM-JJ
  bloquant: boolean;   // le local ne peut plus être utilisé
}

export interface Moi {
  nom: string;         // nom dans Horaires
  prenom: string;
  email?: string;
  roles?: string[];    // liste Roles : Secrétariat, Éducateur, Direction…
}

export interface Dataset {
  moi: Moi;
  cours: Cours[];
  absences: Absence[];
  reservations: Reservation[];
  deplacements: Deplacement[];
  infos: Info[];
  locaux: Local[];
  signalements: Signalement[];
  decisions: Decision[];
  /** La liste « Decisions » existe : les refus et leurs motifs sont gardés. */
  journal: boolean;
}
