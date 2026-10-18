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

  /** Noms affichés des listes SharePoint. */
  listes: {
    horaires: 'Horaires',
    profs: 'Profs',
    absences: 'Absences',
    reservations: 'Réservations',
    deplacements: 'Deplacements',
    infos: 'Infos',
    signalements: 'Signalements',
  },

  /** Noms internes des colonnes (à ajuster grâce à l'écran Connexion si besoin). */
  champs: {
    horaires: { prof: 'Title', jour: 'JourNum', heure: 'Heure', classes: 'Classes', local: 'Local', matiere: 'Matiere' },
    profs: { nom: 'Title', mail: 'Mail', prenom: 'Prenom' },
    absences: { prof: 'Titre', date: 'DateAbs', deH: 'DeH', aH: 'AH' },
    reservations: { prof: 'Titre', date: 'DateRes', heure: 'Heure', local: 'Local', classe: 'Classe' },
    deplacements: {
      absent: 'Titre', date: 'DateDep', hVide: 'HeureVide', classe: 'Classe', prof: 'Collegue',
      hOrigine: 'HeureOrigine', dateOrigine: 'DateOrigine', statut: 'Statut',
    },
    infos: { date: 'DateInfo', categorie: 'Categorie', titre: 'Titre' },
    signalements: { local: 'Local', titre: 'Title', date: 'Created', statut: 'Statut' },
  },
};

export const SCOPES = ['User.Read', 'Sites.ReadWrite.All'];

export const sharepointConfigure = (): boolean =>
  !!(config.tenantId && config.clientId && config.siteHost && config.sitePath);
