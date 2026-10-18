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
}

/** Un déplacement : un prof avance (ou recule) un de ses cours dans l'heure libérée par un collègue absent. */
export interface Deplacement {
  id?: string;
  absent: string;      // prof absent dont l'heure est libérée
  date: string;        // jour de l'heure libérée
  hVide: number;       // heure libérée
  classe: string;
  prof: string;        // prof qui déplace son cours
  hOrigine: number;
  dateOrigine: string;
  statut: string;      // En attente · Accepté · Validé · Refusé
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
}
