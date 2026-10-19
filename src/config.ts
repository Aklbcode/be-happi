// Réglages de connexion. Tant que tenantId, clientId et le site ne sont pas remplis,
// l'app tourne en mode démo (données fictives).
// Ces quatre valeurs ne sont JAMAIS écrites ici (le code est public) : elles arrivent au démarrage
// par le lien d'installation de l'école (voir src/lib/reglages.ts et le README, « Mise en service »).

export const config = {
  /** Identifiant du tenant Microsoft 365 de l'école (fourni par l'IT). */
  tenantId: '',
  /** Identifiant de l'application enregistrée dans Entra ID (fourni par l'IT). */
  clientId: '',
  /** Site SharePoint qui contient les listes, ex. "monecole.sharepoint.com". */
  siteHost: '',
  /** Chemin du site, ex. "/sites/BeHappi". */
  sitePath: '',

  /** Noms affichés des listes SharePoint (les mêmes que l'app Power Apps). */
  listes: {
    horaires: 'Horaires',
    profs: 'Profs',
    absences: 'Absences',
    reservations: 'Réservations',
    deplacements: 'Deplacements',
    infos: 'Infos',
    signalements: 'Signalements',
    /** Adresse e-mail → rôle (Secrétariat, Éducateur, Direction…) : qui peut valider. */
    roles: 'Roles',
    /**
     * FACULTATIVE, à créer pour garder le journal des décisions et le motif des refus
     * (colonnes : voir champs.decisions). Sans elle, valider et refuser fonctionnent quand même.
     */
    decisions: 'Decisions',
    /** Réservations de matériel (racks de tablettes, PC portables…), comme Power Apps. */
    materiel: 'Materiel',
    /** Ce qui est publié pour les élèves (« Publier pour les élèves »). */
    changements: 'Changements',
    /** Horaire des élèves, sans nom de prof (lu seulement en vue élève). */
    horairesEleves: 'HorairesEleves',
  },

  /** Listes dont l'absence n'est pas une erreur. */
  listesFacultatives: ['decisions'] as string[],
  /** Colonnes dont l'absence n'est pas une erreur (liste → champs de config.champs). */
  colonnesFacultatives: { signalements: ['reponse', 'urgence'], absences: ['motif'], reservations: ['absent'] } as Record<string, string[]>,

  /**
   * Rôles de la liste Roles (accents et majuscules ignorés) et les espaces qu'ils ouvrent.
   * Éducateurs et secrétariat valident les déplacements (dans Power Apps : écran Secrétariat) ;
   * la direction consulte ; le service technique traite les signalements.
   */
  roles: {
    educateur: ['Éducateur', 'Éducatrice', 'Éducateurs', 'Éducatrices'],
    secretariat: ['Secrétariat', 'Administratif', 'Service administratif'],
    direction: ['Direction', 'Directeur', 'Directrice', 'Sous-directeur', 'Sous-directrice'],
    technique: ['Technique', 'Service technique', 'Entretien'],
  },

  /**
   * Permission Graph demandée pour SharePoint.
   * - 'Sites.ReadWrite.All' : tous les sites que la personne peut déjà ouvrir (réglage par défaut).
   * - 'Sites.Selected' : uniquement le site que l'IT a explicitement ouvert à l'app (plus restreint,
   *   un peu plus de travail pour l'IT : voir le README).
   */
  permissionSharePoint: 'Sites.ReadWrite.All' as 'Sites.ReadWrite.All' | 'Sites.Selected',

  /**
   * Noms INTERNES des colonnes, ceux que voit Microsoft Graph.
   * Attention : la colonne que Power Apps appelle « Titre » (SharePoint en français)
   * s'appelle toujours « Title » pour Graph.
   * Repris des formules Power Apps v3 ; l'écran École → Connexion → « Vérifier les listes »
   * signale toute colonne manquante.
   */
  champs: {
    horaires: { prof: 'Title', jour: 'JourNum', heure: 'Heure', classes: 'Classes', local: 'Local', matiere: 'Matiere' },
    profs: { nom: 'Title', mail: 'Email' },
    /** Motif : toujours « Non précisé » depuis Be Happi (jamais de motif médical). */
    absences: { prof: 'Title', date: 'DateAbs', deH: 'DeH', aH: 'AH', motif: 'Motif' },
    reservations: { prof: 'Title', date: 'DateRes', heure: 'Heure', local: 'Local', classe: 'Classe', absent: 'Absent' },
    deplacements: {
      absent: 'Title', date: 'DateDep', hVide: 'HeureVide', classe: 'Classe', prof: 'Collegue',
      hOrigine: 'HeureOrigine', dateOrigine: 'DateOrigine', statut: 'Statut',
    },
    infos: { date: 'DateInfo', categorie: 'Categorie', titre: 'Title' },
    /** Pas de colonne Local : le local est écrit dans le texte du signalement (formulaire Power Apps). */
    signalements: { titre: 'Title', date: 'Created', statut: 'Statut', urgence: 'Urgence', reponse: 'Reponse' },
    roles: { mail: 'Title', role: 'Role' },
    /** Liste facultative « Decisions » : une ligne par validation ou refus. */
    decisions: {
      classe: 'Title', statut: 'Statut', commentaire: 'Commentaire', prof: 'Collegue', absent: 'Absent',
      date: 'DateDep', hVide: 'HeureVide', dateOrigine: 'DateOrigine', hOrigine: 'HeureOrigine', local: 'Local',
    },
    materiel: { prof: 'Title', date: 'DateRes', heure: 'Heure', rack: 'Rack', classe: 'Classe' },
    changements: { titre: 'Title', date: 'DateChg', heure: 'Heure', classe: 'Classe', type: 'TypeChg' },
    horairesEleves: { jour: 'JourNum', heure: 'Heure', classes: 'Classes', matiere: 'Matiere', local: 'Local' },
  },
};

export const SCOPES = ['User.Read', config.permissionSharePoint];

export const sharepointConfigure = (): boolean =>
  !!(config.tenantId && config.clientId && config.siteHost && config.sitePath);
