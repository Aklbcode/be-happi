// Réglages de connexion. Tant que tenantId, clientId et le site ne sont pas remplis,
// l'app tourne en mode démo (données fictives).

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
    // Pas encore utilisées par Be Happi, mais vérifiées par l'écran Connexion.
    materiel: 'Materiel',
    changements: 'Changements',
  },

  /** Listes dont l'absence n'est pas une erreur. */
  listesFacultatives: ['decisions'] as string[],

  /** Rôles de la liste Roles qui ouvrent l'écran Validations (accents et majuscules ignorés). */
  roles: {
    /** Peuvent valider ou refuser (dans Power Apps, la validation se fait à l'écran Secrétariat). */
    validation: ['Secrétariat', 'Éducateur', 'Éducatrice', 'Éducateurs'],
    /** Peuvent consulter sans décider. */
    lecture: ['Direction'],
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
    absences: { prof: 'Title', date: 'DateAbs', deH: 'DeH', aH: 'AH' },
    reservations: { prof: 'Title', date: 'DateRes', heure: 'Heure', local: 'Local', classe: 'Classe', absent: 'Absent' },
    deplacements: {
      absent: 'Title', date: 'DateDep', hVide: 'HeureVide', classe: 'Classe', prof: 'Collegue',
      hOrigine: 'HeureOrigine', dateOrigine: 'DateOrigine', statut: 'Statut',
    },
    infos: { date: 'DateInfo', categorie: 'Categorie', titre: 'Title' },
    /** Pas de colonne Local : le local est écrit dans le texte du signalement (formulaire Power Apps). */
    signalements: { titre: 'Title', date: 'Created', statut: 'Statut', urgence: 'Urgence' },
    roles: { mail: 'Title', role: 'Role' },
    /** Liste facultative « Decisions » : une ligne par validation ou refus. */
    decisions: {
      classe: 'Title', statut: 'Statut', commentaire: 'Commentaire', prof: 'Collegue', absent: 'Absent',
      date: 'DateDep', hVide: 'HeureVide', dateOrigine: 'DateOrigine', hOrigine: 'HeureOrigine', local: 'Local',
    },
    materiel: { prof: 'Title', date: 'DateRes', heure: 'Heure', rack: 'Rack', classe: 'Classe' },
    changements: { prof: 'Title', date: 'DateChg', heure: 'Heure', classe: 'Classe', type: 'TypeChg' },
  },
};

export const SCOPES = ['User.Read', config.permissionSharePoint];

export const sharepointConfigure = (): boolean =>
  !!(config.tenantId && config.clientId && config.siteHost && config.sitePath);
