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
    // Pas encore utilisées par Be Happi, mais vérifiées par l'écran Connexion.
    roles: 'Roles',
    materiel: 'Materiel',
    changements: 'Changements',
  },

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
    materiel: { prof: 'Title', date: 'DateRes', heure: 'Heure', rack: 'Rack', classe: 'Classe' },
    changements: { prof: 'Title', date: 'DateChg', heure: 'Heure', classe: 'Classe', type: 'TypeChg' },
  },
};

export const SCOPES = ['User.Read', 'Sites.ReadWrite.All'];

export const sharepointConfigure = (): boolean =>
  !!(config.tenantId && config.clientId && config.siteHost && config.sitePath);
