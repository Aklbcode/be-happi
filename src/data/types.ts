// Modèle de données de La Tour.
// Il suit les listes SharePoint déjà utilisées par l'app Power Apps (Horaires, Absences, Réservations, Deplacements, Infos…).

/** Les espaces de l'app : chacun voit d'abord ce qui le concerne. */
export type Profil = 'prof' | 'educateur' | 'secretariat' | 'direction' | 'technique' | 'eleve';

/** Une ligne de la liste Horaires : un prof, un jour, une heure. */
export interface Cours {
  id: string;
  prof: string;        // nom tel qu'il apparaît dans Horaires (ex. DURANT)
  jour: number;        // 1 = lundi … 5 = vendredi
  h: number;           // 1 à 9
  classes: string[];   // une ou plusieurs classes (groupes)
  classe: string;      // texte tel quel
  local: string;
  matiere: string;
}

/** Une absence (liste Absences) : une ligne par jour, sans motif affiché. */
export interface Absence {
  id?: string;
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

/** Une info du jour (liste Infos), visible par tous les profs. */
export interface Info {
  id?: string;
  date: string;
  categorie: string;   // Retard · Éducateur absent · Changement de local · Info (comme Power Apps)
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

/** Un signalement (liste Signalements) : le local est écrit dans le texte, comme dans Power Apps. */
export interface Signalement {
  id?: string;
  local: string;
  titre: string;
  depuis: string;      // AAAA-MM-JJ
  bloquant: boolean;   // urgent : le local ne peut plus être utilisé
  statut: string;      // Nouveau · En cours · Résolu (comme Power Apps)
  resolu: boolean;
  auteur?: string;     // qui a signalé (nom affiché)
  auteurMail?: string;
  le?: string;         // quand (ISO)
  reponse?: string;    // mot du service technique (colonne facultative)
  etag?: string;
}

/** Ce qui est publié pour les élèves (liste Changements, comme « Publier pour les élèves » de Power Apps). */
export interface Changement {
  id?: string;
  date: string;
  h: number;
  classe: string;
  type: string;        // Étude · Déplacé · Local
  titre: string;
}

/** Réservation de matériel (liste Materiel) : racks de tablettes, PC, projecteurs mobiles… */
export interface ResaMateriel {
  id?: string;
  prof: string;
  date: string;
  h: number;
  rack: string;
  classe: string;
}

/** Fiche d'un membre du personnel (liste Profs) : nom comme dans Horaires, adresse pour Teams. */
export interface FicheProf {
  nom: string;
  email?: string;
}

/** Horaire vu par les élèves (liste HorairesEleves) : sans nom de prof. */
export interface CoursEleve {
  jour: number;
  h: number;
  classes: string[];
  matiere: string;
  local: string;
}

/**
 * Cap Réussite : une remédiation pendant une heure d'étude (liste « CapReussite »).
 * - « Disponible » : un élève à l'étude se dit prêt pour une remédiation dans une matière ;
 * - « Prise » : un prof (dans sa fourche) le prend, avec un local réservé ;
 * - « Annulée » : retirée par l'élève ou le prof.
 * Une ligne « Prise » sans élève = toute la classe. Les lignes « Prise » font la feuille de prestations.
 */
export interface SeanceCR {
  id?: string;
  classe: string;
  eleve?: string;
  eleveMail?: string;
  date: string;
  h: number;
  matiere: string;
  /** Qui l'a demandée : l'élève, le prof, ou l'app (élève en échec dans la matière). */
  origine: 'Élève' | 'Prof' | 'Échec';
  statut: 'Disponible' | 'Prise' | 'Annulée';
  prof?: string;
  local?: string;
  creeLe?: string;
  etag?: string;
}

/** Résultat d'un élève dans une matière (liste « Resultats », export des bulletins ; personnel seulement). */
export interface Resultat {
  eleve: string;
  eleveMail?: string;
  classe: string;
  matiere: string;
  periode?: string;
  echec: boolean;
}

export interface Moi {
  nom: string;         // nom dans Horaires (vide pour un élève)
  prenom: string;
  email?: string;
  roles?: string[];    // liste Roles : Secrétariat, Éducateur, Direction…
  /** Les espaces ouverts à cette personne (calculés au chargement). */
  profils?: Profil[];
}

export interface Dataset {
  moi: Moi;
  cours: Cours[];
  /** Horaire des classes sans nom de prof (vue élève). */
  coursEleves: CoursEleve[];
  absences: Absence[];
  reservations: Reservation[];
  deplacements: Deplacement[];
  infos: Info[];
  locaux: Local[];
  signalements: Signalement[];
  decisions: Decision[];
  /** La liste « Decisions » existe : les refus et leurs motifs sont gardés. */
  journal: boolean;
  profs: FicheProf[];
  changements: Changement[];
  materiel: ResaMateriel[];
  /** Cap Réussite : remédiations (facultatif, liste « CapReussite »). */
  capReussite?: SeanceCR[];
  /** Résultats des bulletins (facultatif, liste « Resultats », personnel seulement). */
  resultats?: Resultat[];
  /** Listes absentes du site (clés de config.listes) : leurs écrans l'expliquent au lieu d'échouer. */
  absentes: string[];
}
