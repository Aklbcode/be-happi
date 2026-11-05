/**
 * IPES App – version Google Sheets.
 *
 * Ce script vit DANS le Google Sheet privé (Extensions → Apps Script). Il est la seule porte
 * d'entrée vers les données : l'app lui envoie la clé secrète et l'adresse du prof connecté
 * (donnée par Teams) ; il ne répond qu'aux personnes de l'onglet Profs (ou de l'onglet Roles).
 *
 * Déploiement : Déployer → Nouveau déploiement → Application Web
 *   - Exécuter en tant que : moi
 *   - Qui a accès : tout le monde
 * puis donner l'adresse « …/exec » à la personne qui fabrique le paquet Teams.
 * Après chaque collage d'une nouvelle version : Déployer → Gérer les déploiements → ✏️ → Nouvelle version.
 *
 * Chaque onglet = une liste. Ligne 1 : les noms de colonnes. Les colonnes ID, Version, Created,
 * CreePar, Modified et ModifiePar sont gérées par le script (une ligne ajoutée à la main reçoit
 * son ID au prochain chargement).
 *
 * Rapide pour beaucoup d'utilisateurs : les listes sont gardées en mémoire (cache Google) quelques
 * minutes ; toute écriture de l'app, tout import et toute modification à la main dans le Sheet
 * vident ce cache.
 *
 * Ce modèle est public : la vraie clé n'y est jamais. Elle est écrite dans la copie collée dans le Sheet.
 */

const CLE = '__CLE__';

/** Les onglets lisibles par l'app (mêmes noms que les listes SharePoint). */
const LISTES = [
  'Horaires', 'Profs', 'Absences', 'Réservations', 'Deplacements', 'Infos', 'Signalements', 'Roles',
  'Decisions', 'Materiel', 'Changements', 'HorairesEleves', 'CapReussite', 'Resultats', 'Stages', 'Agenda',
];
/** Ce que l'app ne peut jamais modifier. */
const LECTURE_SEULE = ['Horaires', 'Profs', 'Roles', 'HorairesEleves', 'Resultats', 'Stages', 'Agenda'];
const SYSTEME = ['ID', 'Version', 'Created', 'CreePar', 'Modified', 'ModifiePar'];
/** Colonnes jamais envoyées à l'app (pas de motif d'absence affiché). */
const CACHEES = { Absences: ['Motif'] };

/** Les colonnes que l'app peut remplir, liste par liste (rien d'autre n'est accepté). */
const CHAMPS = {
  Absences: ['Title', 'DateAbs', 'DeH', 'AH', 'Motif'],
  'Réservations': ['Title', 'DateRes', 'Heure', 'Local', 'Classe', 'Absent'],
  Deplacements: ['Title', 'DateDep', 'HeureVide', 'Classe', 'Collegue', 'HeureOrigine', 'DateOrigine', 'Statut'],
  Infos: ['Title', 'DateInfo', 'Categorie'],
  Signalements: ['Title', 'Statut', 'Urgence', 'Reponse'],
  Decisions: ['Title', 'Statut', 'Commentaire', 'Collegue', 'Absent', 'DateDep', 'HeureVide', 'DateOrigine', 'HeureOrigine', 'Local'],
  Materiel: ['Title', 'DateRes', 'Heure', 'Rack', 'Classe'],
  Changements: ['Title', 'DateChg', 'Heure', 'Classe', 'TypeChg'],
  CapReussite: ['Title', 'Eleve', 'EleveMail', 'DateCR', 'Heure', 'Matiere', 'Origine', 'Statut', 'Prof', 'Local'],
  Suggestions: ['Title', 'Type'],
};

/**
 * Suggestions (profil → « Une idée, une remarque ? ») : écrites dans l'onglet Suggestions, que seule
 * la personne qui gère l'app lit (jamais renvoyées aux autres). Prévenue aussi par mail si
 * ADMIN_SUGGESTIONS est rempli (copie privée).
 */
const ADMIN_SUGGESTIONS = '';

/** Les rôles de l'onglet Roles (sans accents ni majuscules), comme dans l'app. */
const ROLES = {
  educateur: ['educateur', 'educatrice', 'educateurs', 'educatrices'],
  secretariat: ['secretariat', 'administratif', 'service administratif'],
  direction: ['direction', 'directeur', 'directrice', 'sous-directeur', 'sous-directrice'],
  technique: ['technique', 'service technique', 'entretien'],
};

/**
 * Les stages de départ : l'onglet « Stages » est créé avec ces lignes s'il n'existe pas encore
 * (classe, du, au, nom du stage ou de la sortie). Ensuite, on le complète directement dans le Sheet.
 * Le modèle public est vide ; la copie collée dans le Sheet porte les vraies périodes.
 */
const STAGES_DEPART = [];

/**
 * Les dates importantes de l'école (réunions de parents, bulletins, conseils…) : l'onglet « Agenda »
 * est créé avec ces lignes s'il n'existe pas encore (du, au, titre, heure). Ensuite, on le complète
 * dans le Sheet. Le modèle public est vide ; la copie collée dans le Sheet porte les vraies dates.
 */
const AGENDA_DEPART = [];

/**
 * Un lot à importer une seule fois (absences connues, sorties) : ajouté au premier chargement,
 * sans doublon (même prof et même jour ; même classe et mêmes dates). Si on supprime ensuite une
 * ligne dans le Sheet, elle ne revient pas : le lot est marqué « importé ».
 * Le modèle public est vide ; la copie collée dans le Sheet porte les vraies lignes.
 */
const LOTS = [];

// ---------- Entrée ----------

function doGet() {
  return json({ ok: true, app: 'IPES App', message: 'Le script répond. Ouvre IPES App dans Teams.' });
}

function doPost(e) {
  memoire = null;
  // Un modèle collé sans sa clé ne répond à personne.
  if (CLE.indexOf('__') === 0 || CLE.length < 20) return json({ status: 503, erreur: 'Script pas encore configuré (clé manquante).' });
  let q;
  try {
    q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json({ status: 400, erreur: 'Requête illisible.' });
  }
  if (!q || q.cle !== CLE) return json({ status: 401, erreur: 'Clé refusée.' });
  try {
    const mail = String(q.mail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) || mail.length > 120) return json({ status: 401, erreur: 'Adresse manquante : ouvre IPES App dans Teams.' });
    if (tropDeDemandes(mail)) return json({ status: 429, erreur: 'Trop de demandes en peu de temps : réessaie dans une minute.' });
    try {
      noterAppareil(mail, q.appareil);
    } catch (err) {
      /* le journal ne bloque jamais l'app */
    }
    if (q.action === 'qui') return json(qui(mail));
    if (q.action === 'associer') return json(associer(mail, String(q.nom || '').slice(0, 120)));
    if (q.action === 'chercher') return json(chercher(mail, String(q.texte || '')));
    const moi = qui(mail);
    if (!moi.nom && !moi.roles.length) {
      // Pas encore reconnu : on renvoie de quoi choisir son nom (un seul aller-retour).
      if (q.action === 'lire') return json({ status: 200, moi });
      return json({ status: 403, erreur: 'Adresse inconnue.' });
    }
    if (q.action === 'lire') return json({ status: 200, moi, listes: listesPour(mail) });
    const liste = String(q.liste || '');
    if (q.action === 'reserverPlage') return json(ecrire(() => reserverPlage(liste, nettoyer(liste, q.fields), q.fin, mail, moi)));
    if (q.action === 'deciderCours') return json(ecrire(() => deciderCours(q, mail, moi)));
    if (q.action === 'creer') return json(ecrire(() => creer(liste, nettoyer(liste, q.fields), mail, moi)));
    if (q.action === 'modifier') return json(ecrire(() => modifier(liste, String(q.id || ''), nettoyer(liste, q.fields), q.etag, mail, moi)));
    if (q.action === 'supprimer') return json(ecrire(() => supprimer(liste, String(q.id || ''), q.etag, mail, moi)));
    return json({ status: 400, erreur: 'Action inconnue.' });
  } catch (err) {
    const m = String(err && err.message ? err.message : err);
    if (/^Pas autorisé/.test(m)) return json({ status: 403, erreur: m });
    if (/Lock|timed out|verrou/i.test(m)) return json({ status: 503, erreur: 'Beaucoup de monde en même temps : réessaie dans un instant.' });
    return json({ status: 500, erreur: m });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Garde-fous ----------

const cacheScript = () => (typeof CacheService === 'undefined' ? null : CacheService.getScriptCache());

/** Plus de 90 demandes par minute pour une même adresse : on freine (boucle, abus). */
function tropDeDemandes(mail) {
  const c = cacheScript();
  if (!c) return false;
  const cle = `n|${mail}|${Math.floor(Date.now() / 60000)}`;
  const n = Number(c.get(cle) || 0) + 1;
  c.put(cle, String(n), 120);
  return n > 90;
}

/**
 * Journal des appareils (onglet « Appareils ») : chaque nouvel appareil d'une adresse y est noté
 * une fois. Une adresse utilisée sur un appareil inattendu se voit ici.
 */
function noterAppareil(mail, appareil) {
  const a = String(appareil || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  const c = cacheScript();
  if (!a || !c) return;
  const cle = `a|${mail}|${a}`;
  if (c.get(cle)) return;
  c.put(cle, '1', 21600);
  const classeur = SpreadsheetApp.getActive();
  const f = classeur.getSheetByName('Appareils') || (classeur.insertSheet ? classeur.insertSheet('Appareils') : null);
  if (!f) return;
  if (f.getLastRow() === 0) f.appendRow(['Mail', 'Appareil', 'Vu la première fois']);
  const deja = f.getLastRow() > 1 ? f.getRange(2, 1, f.getLastRow() - 1, 2).getValues() : [];
  if (!deja.some((l) => String(l[0]) === mail && String(l[1]) === a)) f.appendRow([mail, a, new Date().toISOString()]);
}

/** Une valeur écrite par l'app : texte court ou nombre ; jamais une formule. */
function sure(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v;
  let s = String(v).slice(0, 1000);
  // « =IMPORTXML(…) », « +… », « @… » : le Sheet le lirait comme une formule.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return s;
}

/** Garde seulement les colonnes prévues pour cette liste, avec des valeurs sûres. */
function nettoyer(liste, champs) {
  const permis = CHAMPS[liste] || [];
  const o = {};
  if (champs && typeof champs === 'object') Object.keys(champs).forEach((k) => { if (permis.indexOf(k) >= 0) o[k] = sure(champs[k]); });
  return o;
}

let verrouille = false;

/** Une écriture à la fois (deux profs qui prennent le même élève). Réentrant. Vide le cache ensuite. */
function ecrire(f) {
  if (verrouille) return f();
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  verrouille = true;
  try {
    return f();
  } finally {
    verrouille = false;
    verrou.releaseLock();
    invalider();
  }
}

// ---------- Droits ----------

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const aRole = (moi, ...familles) => moi.roles.some((r) => familles.some((f) => ROLES[f].indexOf(sansAccents(r)) >= 0));
const valideur = (moi) => aRole(moi, 'educateur', 'secretariat');
const gestion = (moi) => aRole(moi, 'educateur', 'secretariat', 'direction');

/**
 * Qui peut faire quoi (le même partage que dans l'app, vérifié ici pour de bon) :
 * - absences, infos, changements : éducateurs, secrétariat, direction ;
 * - déplacements : un prof propose pour lui-même (« En attente ») et retire sa proposition tant
 *   qu'elle attend ; seuls éducateurs et secrétariat valident, refusent ou annulent ;
 * - réservations de local et de matériel : chacun pour soi (et la gestion pour les autres) ;
 * - signalements : chacun en crée ; le service technique et la direction les traitent.
 */
function autoriser(action, liste, moi, mail, champs, ligne) {
  const auteur = ligne && String(ligne.CreePar || '').toLowerCase() === mail;
  const pourSoi = (col) => gestion(moi) || (moi.nom && String(champs[col] || '') === moi.nom);
  let ok = false;
  switch (liste) {
    case 'Absences': case 'Infos': case 'Changements':
      ok = gestion(moi);
      break;
    case 'Deplacements':
      if (action === 'creer') ok = valideur(moi) || (pourSoi('Collegue') && String(champs.Statut || 'En attente') === 'En attente');
      else if (action === 'supprimer') ok = valideur(moi) || (auteur && String(ligne.Statut) !== 'Validé');
      else ok = valideur(moi);
      break;
    case 'Réservations': case 'Materiel':
      if (action === 'creer') ok = pourSoi('Title');
      else ok = gestion(moi) || auteur;
      break;
    case 'Decisions':
      ok = action === 'creer' && valideur(moi);
      break;
    case 'Signalements':
      ok = action === 'creer' || aRole(moi, 'technique', 'direction');
      break;
    case 'CapReussite':
      ok = action !== 'supprimer' || gestion(moi) || auteur;
      break;
    case 'Suggestions':
      ok = action === 'creer';
      break;
    default:
      ok = false;
  }
  if (!ok) throw new Error('Pas autorisé pour ce rôle.');
}

// ---------- Qui est connecté ? ----------

const simple = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nomSeul = (t) => (t.indexOf(' (') >= 0 ? t.slice(0, t.indexOf(' (')) : t);
const avecMail = (p) => { const m = String(p.Email || '').trim().toLowerCase(); return m && m !== '0' ? m : ''; };

/**
 * La personne qui correspond à cette adresse : la colonne Email de l'onglet Profs, sinon comme
 * Power Apps (prenom.nom@… → NOM), seulement si un seul prof correspond et qu'aucune autre
 * adresse ne l'a déjà pris. Renvoie aussi ses rôles (onglet Roles) et, si elle est inconnue, les
 * noms encore libres pour qu'elle se reconnaisse.
 */
function qui(mail) {
  const d = donnees();
  const roles = d.roles.filter((r) => r[0] === mail).map((r) => r[1]);
  let fiche = d.profs.find((p) => avecMail(p) === mail);
  if (!fiche) {
    const local = mail.split('@')[0];
    const point = local.indexOf('.');
    const cle = point >= 0 ? simple(local.slice(point + 1)) : '';
    const trouves = cle ? d.profs.filter((p) => simple(nomSeul(String(p.Title || ''))) === cle) : [];
    if (trouves.length === 1 && !avecMail(trouves[0])) {
      fiche = trouves[0];
      // Relié pour de bon : ce nom ne pourra plus être choisi par quelqu'un d'autre.
      ecrire(() => ecrireMail(String(fiche.Title), mail));
    }
  }
  if (fiche) return { status: 200, nom: String(fiche.Title), roles };
  // Pas la liste complète des noms : la personne cherche le sien (voir chercher).
  return { status: 200, nom: '', roles, inconnu: true, libres: [] };
}

/**
 * Pas encore reconnu : chercher son nom parmi ceux qui n'ont pas encore d'adresse. Au moins
 * 3 lettres, 8 réponses au plus : on retrouve son nom sans pouvoir lire toute la liste du personnel.
 */
function chercher(mail, texte) {
  const t = simple(texte);
  if (t.length < 3) return { status: 200, noms: [] };
  if (qui(mail).nom) return { status: 200, noms: [] };
  const noms = donnees().profs.filter((p) => !avecMail(p) && simple(String(p.Title || '')).indexOf(t) >= 0).map((p) => String(p.Title)).sort().slice(0, 8);
  return { status: 200, noms };
}

/** Écrit l'adresse dans la colonne Email de l'onglet Profs, sur la ligne de ce nom (s'il est libre). */
function ecrireMail(nom, mail) {
  const f = SpreadsheetApp.getActive().getSheetByName('Profs');
  const t = tableau(f);
  const iNom = t.entetes.indexOf('Title');
  const iMail = t.entetes.indexOf('Email');
  if (iNom < 0 || iMail < 0) return false;
  const i = t.valeurs.findIndex((l) => String(l[iNom]) === nom);
  if (i < 0) return false;
  const actuel = String(t.valeurs[i][iMail] || '').trim();
  if (actuel && actuel !== '0') return false;
  f.getRange(i + 2, iMail + 1).setValue(mail);
  return true;
}

/** « C'est moi » : relie l'adresse au nom choisi, seulement si ce nom n'a pas encore d'adresse. */
function associer(mail, nom) {
  return ecrire(() => {
    const deja = qui(mail);
    if (deja.nom) return deja;
    const f = SpreadsheetApp.getActive().getSheetByName('Profs');
    const t = tableau(f);
    const iNom = t.entetes.indexOf('Title');
    const iMail = t.entetes.indexOf('Email');
    if (iNom < 0 || iMail < 0) return { status: 500, erreur: "L'onglet Profs doit avoir les colonnes Title et Email." };
    const i = t.valeurs.findIndex((l) => String(l[iNom]) === nom);
    if (i < 0) return { status: 404, erreur: 'Nom introuvable.' };
    const actuel = String(t.valeurs[i][iMail] || '').trim();
    if (actuel && actuel !== '0') return { status: 409, erreur: 'Ce nom est déjà relié à une autre adresse. Demande à la personne qui gère IPES App.' };
    f.getRange(i + 2, iMail + 1).setValue(mail);
    invalider();
    return qui(mail);
  });
}

// ---------- Lecture ----------

function tableau(f) {
  const n = f.getLastRow();
  const c = f.getLastColumn();
  if (n < 1 || c < 1) return { entetes: [], valeurs: [] };
  const tout = f.getRange(1, 1, n, c).getValues();
  return { entetes: tout[0].map((h) => String(h).trim()), valeurs: tout.slice(1) };
}

let fuseau = '';

/** Une date de cellule → texte : « 2026-11-02 » pour un jour, ISO complet si une heure est là. */
function texteDate(v) {
  fuseau = fuseau || SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const h = Utilities.formatDate(v, fuseau, 'HH:mm:ss');
  return h === '00:00:00' ? Utilities.formatDate(v, fuseau, 'yyyy-MM-dd') : Utilities.formatDate(v, fuseau, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function valeur(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return texteDate(v);
  if (typeof v === 'string') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return v;
}

const pleine = (l) => l.some((x) => x !== '' && x !== null);

function lignes(nom) {
  const f = SpreadsheetApp.getActive().getSheetByName(nom);
  if (!f) return [];
  const t = tableau(f);
  return t.valeurs.filter(pleine).map((l) => {
    const o = {};
    t.entetes.forEach((h, j) => { if (h) o[h] = valeur(l[j]); });
    return o;
  });
}

/** Une ligne remplie (hors ID et Version) qui n'a pas encore d'ID : ajoutée à la main. */
function sansId(t, l) {
  const iId = t.entetes.indexOf('ID');
  const iV = t.entetes.indexOf('Version');
  if (iId < 0 || (l[iId] !== '' && l[iId] !== null)) return false;
  return l.some((x, j) => j !== iId && j !== iV && x !== '' && x !== null);
}

/** Donne un ID aux lignes ajoutées à la main (absences du matin…). Renvoie true si une ligne a changé. */
function numeroter(f, t) {
  const iId = t.entetes.indexOf('ID');
  const iV = t.entetes.indexOf('Version');
  if (iId < 0) return false;
  let change = false;
  t.valeurs.forEach((l, i) => {
    if (sansId(t, l)) {
      f.getRange(i + 2, iId + 1).setValue(Utilities.getUuid().slice(0, 13));
      if (iV >= 0) f.getRange(i + 2, iV + 1).setValue(1);
      change = true;
    }
  });
  return change;
}

function preparerOnglet(nom, entetes, depart) {
  const classeur = SpreadsheetApp.getActive();
  if (!classeur.insertSheet || classeur.getSheetByName(nom) || !depart.length) return;
  const f = classeur.insertSheet(nom);
  f.appendRow(entetes);
  f.getRange(2, 1, depart.length, entetes.length).setValues(depart.map((l) => entetes.map((_, i) => (l[i] === undefined ? '' : l[i]))));
}

/**
 * Tout le Sheet sous une forme compacte (une ligne = un tableau de valeurs), gardé dans le cache.
 * Le premier qui trouve le cache vide le reconstruit ; les autres lisent la copie.
 */
function donnees() {
  const enCache = lireCache();
  if (enCache) return enCache;
  const c = cacheScript();
  const g = c ? generation(c) : '';
  // Rangement (onglets à créer, lots, IDs manquants) : seulement quand il y a quelque chose à faire.
  const classeur = SpreadsheetApp.getActive();
  const aFaire = () => (classeur.insertSheet && ((!classeur.getSheetByName('Stages') && STAGES_DEPART.length) || (!classeur.getSheetByName('Agenda') && AGENDA_DEPART.length))) || lotsEnAttente();
  if (aFaire()) {
    ecrire(() => {
      preparerOnglet('Stages', ['Title', 'Du', 'Au', 'Stage'], STAGES_DEPART);
      preparerOnglet('Agenda', ['Du', 'Au', 'Title', 'Heure'], AGENDA_DEPART);
      importerLots();
    });
  }
  const listes = {};
  let profs = [];
  let roles = [];
  LISTES.forEach((nom) => {
    const f = classeur.getSheetByName(nom);
    if (!f) return;
    let t = tableau(f);
    if (t.valeurs.some((l) => sansId(t, l))) {
      ecrire(() => numeroter(f, t));
      t = tableau(f);
    }
    const garder = t.entetes.map((h, j) => (h && (CACHEES[nom] || []).indexOf(h) < 0 ? j : -1)).filter((j) => j >= 0);
    const rangs = t.valeurs.filter(pleine).map((l) => garder.map((j) => valeur(l[j])));
    const cols = garder.map((j) => t.entetes[j]);
    if (nom === 'Profs') profs = rangs.map((l) => ({ Title: l[cols.indexOf('Title')], Email: cols.indexOf('Email') >= 0 ? l[cols.indexOf('Email')] : '' }));
    if (nom === 'Roles') {
      // Les rôles restent ici : chacun ne reçoit que les siens (voir listesPour).
      roles = rangs.map((l) => [String(l[cols.indexOf('Title')] || '').trim().toLowerCase(), String(l[cols.indexOf('Role')] || '')]);
      listes[nom] = { cols, lignes: [] };
      return;
    }
    listes[nom] = { cols, lignes: rangs };
  });
  // Les suggestions restent privées : l'app sait seulement que la liste existe (pour écrire).
  listes.Suggestions = { cols: ['Title', 'Type'], lignes: [] };
  const d = { listes, profs, roles };
  // Une écriture pendant la construction a changé la génération : cette copie n'est pas gardée.
  ecrireCache(d, c && generation(c) === g ? g : '');
  return d;
}

/** Les listes pour cette personne : tout, sauf les lignes Roles des autres. */
function listesPour(mail) {
  const d = donnees();
  const listes = Object.assign({}, d.listes);
  const mesRoles = d.roles.filter((r) => r[0] === mail);
  if (listes.Roles) listes.Roles = { cols: ['Title', 'Role'], lignes: mesRoles.map((r) => [r[0], r[1]]) };
  return listes;
}

// ---------- Cache (morceaux de 90 Ko : le cache Google limite chaque valeur à 100 Ko) ----------

const CACHE_DUREE = 300;
const MORCEAU = 90000;
let memoire = null;

/** La génération du cache : changée à chaque écriture, pour qu'une copie construite avant ne serve plus. */
function generation(c) {
  let g = c.get('d|g');
  if (!g) {
    g = Utilities.getUuid().slice(0, 8);
    c.put('d|g', g, 21600);
  }
  return g;
}

function lireCache() {
  if (memoire) return memoire;
  const c = cacheScript();
  if (!c) return null;
  const [n0, g0] = String(c.get('d|n') || '').split('|');
  const n = Number(n0 || 0);
  if (!n || g0 !== generation(c)) return null;
  const cles = Array.from({ length: n }, (_, i) => `d|${g0}|${i}`);
  const morceaux = c.getAll(cles);
  if (cles.some((k) => typeof morceaux[k] !== 'string')) return null;
  try {
    memoire = JSON.parse(cles.map((k) => morceaux[k]).join(''));
    return memoire;
  } catch (e) {
    return null;
  }
}

/** Découpe un texte en morceaux d'au plus « limite » octets UTF-8 (sans couper une lettre). */
function morceauxUtf8(texte, limite) {
  const morceaux = [];
  let debut = 0;
  let position = 0;
  let taille = 0;
  for (const lettre of texte) {
    const cp = lettre.codePointAt(0);
    const octets = cp <= 127 ? 1 : cp <= 2047 ? 2 : cp <= 65535 ? 3 : 4;
    if (taille + octets > limite) {
      morceaux.push(texte.slice(debut, position));
      debut = position;
      taille = 0;
    }
    position += lettre.length;
    taille += octets;
  }
  if (position > debut) morceaux.push(texte.slice(debut));
  return morceaux;
}

function ecrireCache(d, g) {
  memoire = d;
  const c = cacheScript();
  if (!c || !g) return;
  // Morceaux comptés en octets (les accents en prennent 2) et marqués de leur génération : une copie
  // n'en mélange jamais deux.
  const o = {};
  const morceaux = morceauxUtf8(JSON.stringify(d), MORCEAU);
  const n = morceaux.length;
  morceaux.forEach((partie, i) => (o[`d|${g}|${i}`] = partie));
  try {
    c.putAll(o, CACHE_DUREE);
    c.put('d|n', `${n}|${g}`, CACHE_DUREE);
  } catch (e) {
    /* trop gros pour le cache : on relira le Sheet, c'est tout */
  }
}

/** Après une écriture : la prochaine lecture relit le Sheet. */
function invalider() {
  memoire = null;
  const c = cacheScript();
  if (!c) return;
  c.put('d|g', Utilities.getUuid().slice(0, 8), 21600);
  c.remove('d|n');
}

/**
 * Modification à la main dans le Sheet (absence du matin…) : le cache est vidé, l'app la voit
 * tout de suite. Déclencheur simple : rien à installer.
 */
function onEdit() {
  try {
    invalider();
  } catch (e) {
    /* le cache expirera de lui-même */
  }
}

// ---------- Lots (une seule fois) ----------

function ajouterLignes(nom, lignesLot, cle) {
  const f = SpreadsheetApp.getActive().getSheetByName(nom);
  if (!f || !lignesLot.length) return 0;
  const t = tableau(f);
  const deja = new Set(lignes(nom).map(cle));
  const nouvelles = lignesLot.filter((o) => !deja.has(cle(o)));
  if (!nouvelles.length) return 0;
  const avecId = t.entetes.indexOf('ID') >= 0;
  const valeurs = nouvelles.map((o) => t.entetes.map((h) => (h === 'ID' && avecId ? Utilities.getUuid().slice(0, 13) : h === 'Version' ? 1 : o[h] === undefined ? '' : o[h])));
  f.getRange(f.getLastRow() + 1, 1, valeurs.length, t.entetes.length).setValues(valeurs);
  return nouvelles.length;
}

function lotsEnAttente() {
  if (!LOTS.length || typeof PropertiesService === 'undefined') return false;
  const props = PropertiesService.getScriptProperties();
  return LOTS.some((lot) => lot.id && !props.getProperty(`lot-${lot.id}`));
}

/**
 * Chaque lot ne s'importe qu'une fois. « remplacerStages » : on retire d'abord les lignes de l'onglet
 * Stages qui portent ce nom (ex. « Stage »), pour corriger des dates déjà importées.
 */
function importerLots() {
  if (!LOTS.length || typeof PropertiesService === 'undefined') return;
  const props = PropertiesService.getScriptProperties();
  const jour = (v) => String(valeur(v) || '').slice(0, 10);
  LOTS.forEach((lot) => {
    const marque = `lot-${lot.id}`;
    if (!lot.id || props.getProperty(marque)) return;
    if (lot.remplacerStages) retirerStages(lot.remplacerStages);
    ajouterLignes('Absences', (lot.absences || []).map(([p, d, de, a]) => ({ Title: p, DateAbs: d, DeH: de, AH: a })), (o) => `${String(o.Title).trim().toUpperCase()}|${jour(o.DateAbs)}`);
    ajouterLignes('Stages', (lot.stages || []).map(([c, du, au, st]) => ({ Title: c, Du: du, Au: au, Stage: st })), (o) => `${String(o.Title).trim().toUpperCase()}|${jour(o.Du)}|${jour(o.Au)}`);
    props.setProperty(marque, new Date().toISOString());
  });
}

/** Retire de l'onglet Stages les lignes dont la colonne « Stage » vaut ce nom. */
function retirerStages(nom) {
  const f = SpreadsheetApp.getActive().getSheetByName('Stages');
  if (!f) return;
  const t = tableau(f);
  const i = t.entetes.indexOf('Stage');
  if (i < 0) return;
  for (let r = t.valeurs.length - 1; r >= 0; r--) if (String(t.valeurs[r][i]).trim() === nom) f.deleteRow(r + 2);
}

// ---------- Écriture ----------

function feuille(nom) {
  if ((LISTES.indexOf(nom) < 0 && nom !== 'Suggestions') || LECTURE_SEULE.indexOf(nom) >= 0 || !CHAMPS[nom]) throw new Error(`Liste non modifiable : ${nom}`);
  const classeur = SpreadsheetApp.getActive();
  if (nom === 'Suggestions' && !classeur.getSheetByName(nom) && classeur.insertSheet) classeur.insertSheet(nom).appendRow(['ID', 'Version', 'Title', 'Type', 'Created', 'CreePar', 'Modified', 'ModifiePar']);
  const f = classeur.getSheetByName(nom);
  if (!f) throw new Error(`Onglet introuvable : ${nom}`);
  return f;
}

/** Une date envoyée par l'app (« 2026-11-02T12:00:00Z ») est gardée comme un jour. */
function versCellule(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T12:00:00Z$/.test(v)) return v.slice(0, 10);
  if (v === null || v === undefined) return '';
  return v;
}

/** Ajoute les colonnes manquantes (seulement celles prévues pour la liste, et les colonnes système). */
function colonnesAvec(f, t, champs) {
  Object.keys(champs).concat(SYSTEME).forEach((k) => {
    if (k && t.entetes.indexOf(k) < 0) {
      f.getRange(1, t.entetes.length + 1).setValue(k);
      t.entetes.push(k);
    }
  });
}

/**
 * Deux personnes au même moment : le premier enregistré gagne. Même local à la même heure, ou même
 * classe (ou même prof) déjà déplacée vers cette heure-là → refusé ; l'app relit et propose autre chose.
 * (Le matériel a plusieurs exemplaires par rack : c'est l'app qui compte.)
 */
const CONFLITS = {
  'Réservations': [[['DateRes', 'Heure', 'Local'], 'Ce local vient d’être réservé par quelqu’un d’autre.']],
  Deplacements: [
    [['DateDep', 'HeureVide', 'Classe'], 'Cette classe a déjà un cours proposé à cette heure-là.'],
    [['DateDep', 'HeureVide', 'Collegue'], 'Tu as déjà proposé un cours à cette heure-là.'],
  ],
};

/** Le message du conflit, ou '' s'il n'y en a pas. */
function enConflit(nom, t, champs) {
  const norm = (v) => String(valeur(v)).slice(0, 10).trim().toUpperCase();
  const iS = t.entetes.indexOf('Statut');
  const conflit = (CONFLITS[nom] || []).find(([cles]) => {
    if (cles.some((k) => champs[k] === '' || champs[k] === undefined)) return false;
    const idx = cles.map((k) => t.entetes.indexOf(k));
    if (idx.some((i) => i < 0)) return false;
    return t.valeurs.some((l) => idx.every((i, n) => norm(l[i]) === norm(versCellule(champs[cles[n]]))) && !(iS >= 0 && String(l[iS]) === 'Refusé'));
  });
  return conflit ? conflit[1] : '';
}

/** Le matériel et ses quantités (comme src/data/materiel.ts) : pour garantir le dernier exemplaire. */
const RACKS = {
  'Rack tablettes A': 1,
  'Rack tablettes B': 1,
  'Rack PC portables': 1,
  'Vidéoprojecteur mobile': 3,
  'Rallonge électrique': 3,
  'Câble HDMI': 3,
};

/**
 * Réserver un local ou du matériel de H à « fin » en une fois : toutes les heures, ou aucune.
 * Le local ne doit être réservé par personne ; le matériel doit rester en stock à chaque heure.
 */
function reserverPlage(nom, champs, fin, mail, moi) {
  if (nom !== 'Réservations' && nom !== 'Materiel') return { status: 400, erreur: 'Ressource inconnue.' };
  const f = feuille(nom);
  autoriser('creer', nom, moi, mail, champs, null);
  const h = Number(champs.Heure);
  const dernier = Number(fin || h);
  const date = String(versCellule(champs.DateRes) || '').slice(0, 10);
  if (!Number.isInteger(h) || !Number.isInteger(dernier) || h < 1 || dernier > 9 || dernier < h || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { status: 400, erreur: 'Plage ou jour invalide.' };
  const cle = nom === 'Materiel' ? 'Rack' : 'Local';
  const stock = nom === 'Materiel' ? RACKS[String(champs.Rack)] : 1;
  if (!stock || !champs[cle]) return { status: 400, erreur: 'Ressource inconnue.' };
  const t = tableau(f);
  const iD = t.entetes.indexOf('DateRes');
  const iH = t.entetes.indexOf('Heure');
  const iR = t.entetes.indexOf(cle);
  const norm = (v) => String(v).trim().toUpperCase();
  for (let hh = h; hh <= dernier; hh++) {
    const prises = iD < 0 || iH < 0 || iR < 0 ? 0 : t.valeurs.filter((l) => String(valeur(l[iD])).slice(0, 10) === date && Number(l[iH]) === hh && norm(l[iR]) === norm(champs[cle])).length;
    if (prises >= stock) return { status: 409, erreur: `${nom === 'Materiel' ? 'Ce matériel' : 'Ce local'} vient d’être réservé par quelqu’un d’autre en H${hh}.` };
  }
  colonnesAvec(f, t, champs);
  const maintenant = new Date().toISOString();
  const lignesNeuves = [];
  for (let hh = h; hh <= dernier; hh++) {
    lignesNeuves.push(Object.assign({}, champs, { DateRes: date, Heure: hh, ID: Utilities.getUuid().slice(0, 13), Version: 1, Created: maintenant, CreePar: mail, Modified: maintenant, ModifiePar: mail }));
  }
  f.getRange(f.getLastRow() + 1, 1, lignesNeuves.length, t.entetes.length).setValues(lignesNeuves.map((o) => t.entetes.map((k) => versCellule(o[k]))));
  return { status: 201, ids: lignesNeuves.map((o) => o.ID) };
}

/**
 * La décision de l'éducateur en une seule fois : tout est vérifié avant d'écrire quoi que ce soit
 * (proposition toujours en attente et inchangée, nouveau local encore libre), puis le statut, la
 * réservation du nouveau local et le journal (Decisions). Un refus supprime la ligne, comme Power Apps.
 */
function deciderCours(q, mail, moi) {
  if (!valideur(moi)) return { status: 403, erreur: 'Validation réservée au secrétariat et aux éducateurs.' };
  const statut = String(q.statut || '');
  if (statut !== 'Validé' && statut !== 'Refusé') return { status: 400, erreur: 'Décision inconnue.' };
  const f = feuille('Deplacements');
  const id = String(q.id || '');
  const { t, i } = trouver(f, id);
  if (i < 0) return { status: 409, erreur: 'Cette proposition a été retirée entre-temps.' };
  const d = objetLigne(t, i);
  if (String(d.Statut || '') !== 'En attente') return { status: 409, erreur: 'Cette proposition a déjà été traitée.' };
  const version = Number(d.Version) || 1;
  if (q.etag && q.etag !== `"${id},${version}"`) return { status: 412, erreur: 'La proposition a changé : relis-la avant de décider.' };
  const reservation = statut === 'Validé' && q.reservation ? nettoyer('Réservations', q.reservation) : null;
  const fr = reservation ? feuille('Réservations') : null;
  const tr = fr ? tableau(fr) : null;
  if (reservation && tr) {
    const conflit = enConflit('Réservations', tr, reservation);
    if (conflit) return { status: 409, erreur: 'Le nouveau local vient d’être pris : actualise avant de valider.' };
  }
  // Tout est vérifié : on écrit.
  const maintenant = new Date().toISOString();
  if (statut === 'Validé') {
    const ligne = i + 2;
    f.getRange(ligne, t.entetes.indexOf('Statut') + 1).setValue('Validé');
    f.getRange(ligne, t.entetes.indexOf('Version') + 1).setValue(version + 1);
    if (t.entetes.indexOf('Modified') >= 0) f.getRange(ligne, t.entetes.indexOf('Modified') + 1).setValue(maintenant);
    if (t.entetes.indexOf('ModifiePar') >= 0) f.getRange(ligne, t.entetes.indexOf('ModifiePar') + 1).setValue(mail);
  } else {
    f.deleteRow(i + 2);
  }
  if (reservation && fr && tr) {
    colonnesAvec(fr, tr, reservation);
    const o = Object.assign({}, reservation, { ID: Utilities.getUuid().slice(0, 13), Version: 1, Created: maintenant, CreePar: mail, Modified: maintenant, ModifiePar: mail });
    fr.appendRow(tr.entetes.map((k) => versCellule(o[k])));
  }
  const fd = SpreadsheetApp.getActive().getSheetByName('Decisions');
  if (fd) {
    const td = tableau(fd);
    const dec = nettoyer('Decisions', {
      Title: d.Classe, Statut: statut, Commentaire: String(q.commentaire || ''), Collegue: d.Collegue, Absent: d.Title,
      DateDep: d.DateDep, HeureVide: d.HeureVide, DateOrigine: d.DateOrigine, HeureOrigine: d.HeureOrigine, Local: reservation ? reservation.Local : '',
    });
    colonnesAvec(fd, td, dec);
    const o = Object.assign({}, dec, { ID: Utilities.getUuid().slice(0, 13), Version: 1, Created: maintenant, CreePar: mail, Modified: maintenant, ModifiePar: mail });
    fd.appendRow(td.entetes.map((k) => versCellule(o[k])));
  }
  return { status: 200 };
}

/** La ligne du Sheet sous forme d'objet (pour vérifier l'auteur, le statut…). */
const objetLigne = (t, i) => Object.fromEntries(t.entetes.map((h, j) => [h, valeur(t.valeurs[i][j])]));

function creer(nom, champs, mail, moi) {
  const f = feuille(nom);
  autoriser('creer', nom, moi, mail, champs, null);
  const t = tableau(f);
  const conflit = enConflit(nom, t, champs);
  if (conflit) return { status: 409, erreur: conflit };
  colonnesAvec(f, t, champs);
  const maintenant = new Date().toISOString();
  const o = Object.assign({}, champs, { ID: Utilities.getUuid().slice(0, 13), Version: 1, Created: maintenant, CreePar: mail, Modified: maintenant, ModifiePar: mail });
  f.appendRow(t.entetes.map((h) => versCellule(o[h])));
  if (nom === 'Suggestions' && ADMIN_SUGGESTIONS && typeof MailApp !== 'undefined') {
    try {
      MailApp.sendEmail({ to: ADMIN_SUGGESTIONS, subject: `IPES App · ${String(champs.Type || 'Suggestion').toLowerCase()} de ${moi.nom ? nomCourt(moi.nom) : mail}`, body: `${String(champs.Title || '').replace(/^'/, '')}\n\n— ${mail}`, name: 'IPES App' });
    } catch (e) {
      /* la suggestion est gardée dans l'onglet, même sans mail */
    }
  }
  if (nom === 'Absences') {
    try {
      notifierDeplacements([{ Title: champs.Title, DateAbs: versCellule(champs.DateAbs), DeH: champs.DeH, AH: champs.AH }], new Date());
    } catch (e) {
      /* une notification ratée ne bloque jamais l'encodage */
    }
  }
  return { status: 201, item: { id: o.ID, eTag: `"${o.ID},1"`, createdDateTime: maintenant, lastModifiedDateTime: maintenant, createdBy: { user: { displayName: mail, email: mail } }, lastModifiedBy: { user: { displayName: mail } }, fields: Object.assign({ Created: maintenant }, champs) } };
}

function trouver(f, id) {
  const t = tableau(f);
  const iId = t.entetes.indexOf('ID');
  const i = iId < 0 || !id ? -1 : t.valeurs.findIndex((l) => String(l[iId]) === String(id));
  return { t, i };
}

function modifier(nom, id, champs, etag, mail, moi) {
  const f = feuille(nom);
  const { t, i } = trouver(f, id);
  if (i < 0) return { status: 404, erreur: 'Élément introuvable.' };
  autoriser('modifier', nom, moi, mail, champs, objetLigne(t, i));
  colonnesAvec(f, t, champs);
  const iV = t.entetes.indexOf('Version');
  const version = Number(t.valeurs[i][iV]) || 1;
  if (etag && etag !== `"${id},${version}"`) return { status: 412, erreur: 'Modifié entre-temps.' };
  const ligne = i + 2;
  Object.keys(champs).forEach((k) => f.getRange(ligne, t.entetes.indexOf(k) + 1).setValue(versCellule(champs[k])));
  f.getRange(ligne, iV + 1).setValue(version + 1);
  f.getRange(ligne, t.entetes.indexOf('Modified') + 1).setValue(new Date().toISOString());
  f.getRange(ligne, t.entetes.indexOf('ModifiePar') + 1).setValue(mail);
  return { status: 200, eTag: `"${id},${version + 1}"`, fields: champs };
}

function supprimer(nom, id, etag, mail, moi) {
  const f = feuille(nom);
  const { t, i } = trouver(f, id);
  if (i < 0) return { status: 204 };
  autoriser('supprimer', nom, moi, mail, {}, objetLigne(t, i));
  const version = Number(t.valeurs[i][t.entetes.indexOf('Version')]) || 1;
  if (etag && etag !== `"${id},${version}"`) return { status: 412, erreur: 'Modifié entre-temps.' };
  f.deleteRow(i + 2);
  return { status: 204 };
}

// =====================================================================================
// Absences de l'école, chaque matin, sans toucher à l'Excel de l'école (lecture seule).
//
// Power Automate (licence de l'école) envoie le fichier Excel « Absences enseignants » en pièce
// jointe à l'adresse Gmail de ce Sheet, à 8h20 et à 9h, avec l'objet « IPES-APP-ABSENCES <code> »
// (le code = les 8 premiers caractères de la clé, pour que personne d'autre ne puisse en envoyer).
// Toutes les 10 minutes, ce script regarde s'il y a un nouveau mail, lit l'Excel (sans le convertir
// ni le copier) et met à jour l'onglet Absences pour aujourd'hui et les 14 jours suivants :
//   - une absence de l'Excel qui manque est ajoutée (CreePar = « Excel de l'école ») ;
//   - une absence ajoutée ainsi qui a disparu de l'Excel est retirée ;
//   - les absences encodées à la main ou dans l'app ne sont jamais touchées.
// Les noms que le script ne reconnaît pas vont dans l'onglet « Import » (à vérifier).
//
// Mise en route : dans Apps Script, choisir la fonction « installerImportAbsences » puis Exécuter
// (une seule fois ; Google demande l'autorisation de lire les mails).
// =====================================================================================

const SOURCE_EXCEL = "Excel de l'école";
const OBJET_ABSENCES = 'IPES-APP-ABSENCES';

function installerImportAbsences() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'importerAbsencesMail')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('importerAbsencesMail').timeBased().everyMinutes(10).create();
  importerAbsencesMail();
}

function importerAbsencesMail() {
  if (CLE.indexOf('__') === 0) return;
  try {
    lireMailAbsences();
  } finally {
    // À chaque passage : les notifications en attente (quota du jour atteint, nouvel envoi…).
    try {
      distribuerNotifications();
    } catch (e) {
      /* la file sera reprise au prochain passage */
    }
  }
}

function lireMailAbsences() {
  const objet = `${OBJET_ABSENCES} ${CLE.slice(0, 8)}`;
  const fils = GmailApp.search(`subject:"${objet}" is:unread has:attachment newer_than:2d`, 0, 5);
  if (!fils.length) return;
  // Gmail range les réponses dans la même conversation : on ne garde que les messages qui portent
  // bien l'objet et un .xlsx. Le plus récent suffit : il contient tout.
  const nonLus = fils.flatMap((f) => f.getMessages()).filter((m) => m.isUnread());
  const messages = nonLus.filter((m) => String(m.getSubject()).indexOf(objet) >= 0 && m.getAttachments().some((p) => /\.xlsx$/i.test(p.getName())));
  if (!messages.length) return;
  messages.sort((a, b) => b.getDate() - a.getDate());
  try {
    const piece = messages[0].getAttachments().find((p) => /\.xlsx$/i.test(p.getName()));
    if (piece) ecrire(() => appliquerAbsencesExcel(lireClasseurXlsx(Utilities.unzip(piece.copyBlob().setContentType('application/zip'))), new Date()));
    else journaliser(0, [], 'Mail reçu sans fichier .xlsx');
  } catch (err) {
    // Un fichier illisible ne doit pas être relu toutes les 10 minutes : on le note et on passe.
    journaliser(0, [], `Erreur : ${String(err && err.message ? err.message : err).slice(0, 200)}`);
  }
  messages.forEach((m) => m.markRead());
}

function journaliser(ajoutees, inconnus, remarque) {
  const classeur = SpreadsheetApp.getActive();
  const journal = classeur.getSheetByName('Import') || classeur.insertSheet('Import');
  if (journal.getLastRow() === 0) journal.appendRow(['Quand', 'Ajoutées', 'Nom non reconnu (date)', 'Remarque']);
  journal.appendRow([new Date().toISOString(), ajoutees, inconnus.map(([d, n]) => `${n} (${d})`).join(', '), remarque || '']);
}

// ---------- Lecture d'un .xlsx (sans conversion) ----------

const entites = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');

/** Les fichiers du zip → { feuilles: { nom: lignes[][] } } (seulement le texte et les nombres). */
function lireClasseurXlsx(blobs) {
  const fichiers = {};
  blobs.forEach((b) => (fichiers[b.getName()] = b));
  const texte = (n) => (fichiers[n] ? fichiers[n].getDataAsString('UTF-8') : '');
  const partages = [];
  (texte('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []).forEach((si) => {
    partages.push(entites((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  });
  const liens = {};
  (texte('xl/_rels/workbook.xml.rels').match(/<Relationship [^>]*>/g) || []).forEach((r) => {
    const id = (r.match(/Id="([^"]+)"/) || [])[1];
    const cible = (r.match(/Target="([^"]+)"/) || [])[1];
    if (id && cible) liens[id] = cible.replace(/^\/?xl\//, '').replace(/^\//, '');
  });
  const feuilles = [];
  (texte('xl/workbook.xml').match(/<sheet [^>]*>/g) || []).forEach((s) => {
    const nom = entites((s.match(/name="([^"]*)"/) || [])[1] || '');
    const rid = (s.match(/r:id="([^"]+)"/) || [])[1];
    if (rid && liens[rid]) feuilles.push({ nom, chemin: `xl/${liens[rid]}` });
  });
  return {
    noms: feuilles.map((f) => f.nom),
    lire: (nom) => {
      const f = feuilles.find((x) => x.nom === nom);
      return f ? lignesFeuille(texte(f.chemin), partages) : [];
    },
  };
}

function colonne(ref) {
  let n = 0;
  for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function lignesFeuille(xml, partages) {
  const lignes = [];
  (xml.match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) || []).forEach((row) => {
    const r = Number((row.match(/ r="(\d+)"/) || [])[1]) - 1;
    const ligne = [];
    (row.match(/<c [^>]*\/>|<c [^>]*>[\s\S]*?<\/c>/g) || []).forEach((c) => {
      const ref = (c.match(/ r="([A-Z]+\d+)"/) || [])[1];
      if (!ref) return;
      const type = (c.match(/ t="([^"]+)"/) || [])[1];
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (type === 's' && v !== undefined) val = partages[Number(v)] || '';
      else if (type === 'inlineStr') val = entites((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '');
      else if (type === 'str') val = entites(v || '');
      else if (v !== undefined) val = Number(v);
      ligne[colonne(ref)] = val;
    });
    lignes[r] = ligne;
  });
  return lignes;
}

// ---------- De l'Excel aux absences ----------

const PERIODES_MIN = [[0, 0], [505, 555], [560, 610], [625, 675], [675, 725], [725, 775], [775, 825], [825, 875], [885, 935], [935, 985]];
const isoDate = (d) => Utilities.formatDate(d, (fuseau = fuseau || SpreadsheetApp.getActive().getSpreadsheetTimeZone()), 'yyyy-MM-dd');

/** « Ma 03-11 » → date de l'année scolaire en cours (août à juillet). */
function dateFeuille(nom, aujourdhui) {
  const m = /(\d{1,2})-(\d{1,2})/.exec(nom);
  if (!m) return null;
  const jour = Number(m[1]);
  const mois = Number(m[2]);
  const debut = aujourdhui.getMonth() >= 7 ? aujourdhui.getFullYear() : aujourdhui.getFullYear() - 1;
  const an = mois >= 8 ? debut : debut + 1;
  return `${an}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/** Une note « Départ 9h20 retour 12h05 », « RETOUR 13H30 »… → [de, à] ; sinon null. */
function heuresDeNote(note) {
  const t = [];
  String(note).replace(/(\d{1,2})\s*[hH]\s*(\d{2})?/g, (_, h, m) => t.push(Number(h) * 60 + Number(m || 0)));
  const bas = String(note).toLowerCase();
  const debutApres = (min) => { for (let i = 1; i <= 9; i++) if (PERIODES_MIN[i][1] > min) return i; return 9; };
  const finAvant = (min) => { let a = 1; for (let i = 1; i <= 9; i++) if (PERIODES_MIN[i][0] < min) a = i; return a; };
  if (bas.indexOf('départ') >= 0 && bas.indexOf('retour') >= 0 && t.length >= 2) return [debutApres(t[0]), finAvant(t[1])];
  if (bas.indexOf('retour') >= 0 && t.length) return [1, finAvant(t[0])];
  if (bas.indexOf('départ') >= 0 && t.length) return [debutApres(t[0]), 9];
  return null;
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Le nom de l'Excel → le nom de l'horaire (fautes de frappe, initiales, homonymes). */
/**
 * Corrections de noms faites une fois pour toutes : onglet « CorrespondancesImport », colonnes Excel
 * (le nom tel qu'écrit dans l'Excel) et Prof (le nom exact de l'onglet Profs). Elles passent avant
 * toute devinette.
 */
function correspondancesImport() {
  const f = SpreadsheetApp.getActive().getSheetByName('CorrespondancesImport');
  if (!f) return {};
  const o = {};
  lignes('CorrespondancesImport').forEach((l) => {
    const e = simple(l.Excel);
    if (e && l.Prof) o[e] = String(l.Prof).trim();
  });
  return o;
}

function resoudreProf(nomExcel, jourNum, heures, profs, horaires, alias) {
  const n = simple(nomExcel);
  if (!n) return '';
  if (alias && alias[n] && profs.indexOf(alias[n]) >= 0) return alias[n];
  const base = (p) => simple(nomSeul(p));
  const exact = profs.filter((p) => simple(p) === n || base(p) === n);
  if (exact.length === 1) return exact[0];
  let cands = exact.length ? exact : profs.filter((p) => base(p).length >= 4 && (n.indexOf(base(p)) === 0 || base(p).indexOf(n) === 0));
  if (!cands.length) {
    const proches = profs.filter((p) => distance(base(p), n) <= 2);
    if (proches.length) cands = proches;
  }
  if (cands.length <= 1) return cands[0] || '';
  // Homonymes : celui dont l'horaire de ce jour colle aux classes listées.
  const score = (p) => Object.keys(heures).filter((h) => horaires.some((c) => c.prof === p && c.jour === jourNum && c.h === Number(h) && simple(c.classes).indexOf(simple(heures[h]).slice(0, 3)) >= 0)).length;
  cands.sort((a, b) => score(b) - score(a));
  return score(cands[0]) > score(cands[1]) ? cands[0] : '';
}

/** Lit les feuilles d'aujourd'hui à J+14 et met l'onglet Absences à jour. */
function appliquerAbsencesExcel(classeur, maintenant) {
  const aujourdhui = isoDate(maintenant);
  const fin = isoDate(new Date(maintenant.getTime() + 14 * 86400000));
  const profs = lignes('Profs').map((p) => String(p.Title));
  const horaires = lignes('Horaires').map((c) => ({ prof: String(c.Title), jour: Number(c.JourNum), h: Number(c.Heure), classes: String(c.Classes || '') }));
  const alias = correspondancesImport();
  const voulues = {};
  const inconnus = [];
  classeur.noms.forEach((nom) => {
    const date = dateFeuille(nom, maintenant);
    if (!date || date < aujourdhui || date > fin) return;
    const jourNum = new Date(`${date}T12:00:00`).getDay();
    const l = classeur.lire(nom);
    l.forEach((r, i) => {
      if (!r || String(r[1] || '').trim() !== 'H1') return;
      [0, 8].forEach((col) => {
        const nomExcel = String(r[col] || '').trim();
        if (!nomExcel || nomExcel === 'Prof absent') return;
        const heures = {};
        let note = null;
        let jusque = date;
        for (let k = 0; k < 9; k++) {
          const ligne = l[i + k] || [];
          const h = Number(String(ligne[col + 1] || '').replace(/\D/g, ''));
          const classe = String(ligne[col + 2] || '').trim();
          if (h && /\d/.test(classe)) heures[h] = classe;
          const marque = ligne[col];
          if (k > 0 && marque !== '' && marque !== undefined && marque !== null) {
            if (typeof marque === 'number' && marque > 40000 && marque < 60000) {
              const d = isoDate(new Date(Math.round((marque - 25569) * 86400000) + 43200000));
              if (d > jusque) jusque = d;
            } else if (heuresDeNote(marque)) note = heuresDeNote(marque);
          }
        }
        const prof = resoudreProf(nomExcel, jourNum, heures, profs, horaires, alias);
        if (!prof) {
          inconnus.push([date, nomExcel]);
          return;
        }
        let deH = 1;
        let aH = 9;
        const hs = Object.keys(heures).map(Number).sort((a, b) => a - b);
        const tous = horaires.filter((c) => c.prof === prof && c.jour === jourNum).map((c) => c.h);
        if (note) [deH, aH] = note;
        else if (hs.length && tous.length && hs.length < tous.length && tous.some((h) => hs.indexOf(h) < 0)) [deH, aH] = [hs[0], hs[hs.length - 1]];
        // Une date de retour notée : absent jusque-là, jours de semaine compris.
        for (let d = date; d <= jusque && d <= fin; d = isoDate(new Date(new Date(`${d}T12:00:00`).getTime() + 86400000))) {
          const js = new Date(`${d}T12:00:00`).getDay();
          if (js === 0 || js === 6) continue;
          const cle = `${prof}|${d}`;
          if (!voulues[cle] || d === date) voulues[cle] = { Title: prof, DateAbs: d, DeH: d === date ? deH : 1, AH: d === date ? aH : 9 };
        }
      });
    });
  });

  // Mise à jour de l'onglet Absences.
  const f = SpreadsheetApp.getActive().getSheetByName('Absences');
  const t = tableau(f);
  const iT = t.entetes.indexOf('Title');
  const iD = t.entetes.indexOf('DateAbs');
  const iC = t.entetes.indexOf('CreePar');
  const iDe = t.entetes.indexOf('DeH');
  const iA = t.entetes.indexOf('AH');
  const deja = {};
  for (let r = t.valeurs.length - 1; r >= 0; r--) {
    const ligne = t.valeurs[r];
    const d = String(valeur(ligne[iD]) || '').slice(0, 10);
    if (!d || d < aujourdhui || d > fin) continue;
    const cle = `${String(ligne[iT]).trim()}|${d}`;
    const excel = iC >= 0 && ligne[iC] === SOURCE_EXCEL;
    if (excel && !voulues[cle]) f.deleteRow(r + 2); // retirée de l'Excel
    else {
      // Heures changées dans l'Excel : la ligne importée suit (une ligne encodée à la main, jamais).
      if (excel && iDe >= 0 && iA >= 0 && (Number(ligne[iDe]) !== voulues[cle].DeH || Number(ligne[iA]) !== voulues[cle].AH)) {
        f.getRange(r + 2, iDe + 1).setValue(voulues[cle].DeH);
        f.getRange(r + 2, iA + 1).setValue(voulues[cle].AH);
      }
      deja[cle] = true;
    }
  }
  const maintenantIso = new Date().toISOString();
  const nouvelles = Object.keys(voulues).filter((k) => !deja[k]).map((k) => Object.assign({ ID: Utilities.getUuid().slice(0, 13), Created: maintenantIso, CreePar: SOURCE_EXCEL, Version: 1 }, voulues[k]));
  if (nouvelles.length) {
    colonnesAvec(f, t, { Title: 1, DateAbs: 1, DeH: 1, AH: 1 });
    f.getRange(f.getLastRow() + 1, 1, nouvelles.length, t.entetes.length).setValues(nouvelles.map((o) => t.entetes.map((h) => (o[h] === undefined ? '' : o[h]))));
  }

  // Journal : ce qui a été fait, et les noms à vérifier (à corriger une fois dans CorrespondancesImport).
  const enFile = nouvelles.length ? notifierDeplacements(nouvelles, maintenant) : 0;
  journaliser(nouvelles.length, inconnus, enFile ? `${enFile} notification(s) Teams en file` : '');
  return { ajoutees: nouvelles.length, inconnus };
}

// =====================================================================================
// Prévenir les profs dans Teams : une nouvelle absence libère des heures ; les profs qui ont la même
// classe plus tard dans la semaine, et qui sont libres à cette heure-là, reçoivent une notification
// Teams (une seule fois par heure libérée). Mêmes règles de base que l'app : mêmes classes, prof
// libre, jamais H5, pas de classe en stage, pas d'heure déjà passée. L'app revérifie tout.
//
// Comment : le script envoie UN mail technique par prof à l'adresse DESTINATAIRE_NOTIF (la boîte
// de l'école de la personne qui gère l'app), objet « IPES-APP-NOTIF <code> | <adresse du prof> | <texte> »,
// avec la carte Teams en pièce jointe (carte.json : le cours qui part → l'heure libérée, le gain,
// un bouton « Proposer » qui ouvre IPES App avec ce déplacement prêt). Un flow Power Automate
// (« When a new email arrives ») poste la carte au prof dans Teams (Flow bot) puis supprime le mail.
// Les profs ne reçoivent aucun mail. Seulement les déplacements qu'ils ont toutes les chances d'accepter.
// Il faut l'adresse du prof (colonne Email de l'onglet Profs, remplie à sa première ouverture).
// Pour couper : mettre NOTIFIER à false. Le modèle public laisse DESTINATAIRE_NOTIF vide.
// =====================================================================================

const NOTIFIER = true;
const DESTINATAIRE_NOTIF = '';
/** L'identifiant du paquet Teams d'IPES App (manifest « id ») : le bouton de la carte ouvre l'app. */
const APP_TEAMS = '';
const OBJET_NOTIF = 'IPES-APP-NOTIF';
const FINS_MIN = [0, 555, 610, 675, 725, 775, 825, 875, 935, 985];
const MAX_MAILS = 40;
const JOURS_NOMS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const classesDe = (t) => String(t || '').split(/[,;]/).map((x) => x.trim().toUpperCase()).filter(Boolean).sort().join(', ');
const jourIso = (d) => new Date(`${d}T12:00:00`).getDay();
const plusJours = (d, n) => isoDate(new Date(new Date(`${d}T12:00:00`).getTime() + n * 86400000));

const heureTexte = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
const debutH = (h) => heureTexte(FINS_MIN[h] - 50);
const finH = (h) => heureTexte(FINS_MIN[h]);
const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const nomCourt = (t) => { const n = nomSeul(String(t)); return n.charAt(0) + n.slice(1).toLowerCase(); };

/**
 * Les occasions nées de ces absences, seulement celles qu'un prof a toutes les chances d'accepter
 * (comme l'app) : il commence plus tard ou finit plus tôt, sans journée plus longue, sans jour de
 * cours en plus. → { prof: [{ date, h, classes, local, absent, depuisDate, depuisH, depuisLocal, gain }] }.
 */
function occasionsDe(nouvelles, maintenant) {
  fuseau = fuseau || SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const aujourdhui = isoDate(maintenant);
  const minutes = Number(Utilities.formatDate(maintenant, fuseau, 'H')) * 60 + Number(Utilities.formatDate(maintenant, fuseau, 'm'));
  // Les remédiations ne sont pas des cours de la classe : ni heure libérée, ni cours à avancer.
  const horaires = lignes('Horaires').filter((c) => !/^\s*(rem\b|rem[eé]diation)/i.test(String(c.Matiere || ''))).map((c) => ({ prof: String(c.Title), jour: Number(c.JourNum), h: Number(c.Heure), classes: classesDe(c.Classes), local: String(c.Local || '') })).filter((c) => c.prof && c.h && c.classes);
  const absences = lignes('Absences').map((a) => ({ prof: String(a.Title), date: String(a.DateAbs || '').slice(0, 10), de: Number(a.DeH) || 1, a: Number(a.AH) || 9 }));
  const stages = lignes('Stages').flatMap((x) => String(x.Title || '').split(/[,;]/).map((c) => ({ classe: c.trim().toUpperCase(), du: String(x.Du || '').slice(0, 10), au: String(x.Au || x.Du || '').slice(0, 10) })));
  const deplacements = lignes('Deplacements').map((x) => ({ prof: String(x.Collegue || ''), date: String(x.DateDep || '').slice(0, 10), h: Number(x.HeureVide), dO: String(x.DateOrigine || '').slice(0, 10), hO: Number(x.HeureOrigine), classe: classesDe(x.Classe) }));
  const absent = (p, d, h) => absences.some((a) => a.prof === p && a.date === d && a.de <= h && h <= a.a);
  const enStage = (k, d) => k.split(', ').some((c) => stages.some((x) => x.classe === c && x.du <= d && d <= x.au));
  const heuresDe = (p, j) => horaires.filter((c) => c.prof === p && c.jour === j).map((c) => c.h);
  const duree = (hs) => (hs.length ? FINS_MIN[Math.max(...hs)] - (FINS_MIN[Math.min(...hs)] - 50) : 0);
  const parProf = {};
  nouvelles.forEach((n) => {
    const x = String(n.Title || '');
    const d = String(n.DateAbs || '').slice(0, 10);
    const j = jourIso(d);
    if (!x || !d || d < aujourdhui || j < 1 || j > 5) return;
    const de = Number(n.DeH) || 1;
    const a = Number(n.AH) || 9;
    horaires.filter((c) => c.prof === x && c.jour === j && c.h >= de && c.h <= a && c.h !== 5).forEach((libere) => {
      if (d === aujourdhui && FINS_MIN[libere.h] - 50 <= minutes) return; // heure déjà commencée
      if (enStage(libere.classes, d)) return;
      if (deplacements.some((z) => z.date === d && z.h === libere.h && z.classe === libere.classes)) return; // déjà reprise
      // Les cours de cette classe plus tard dans la semaine, chez un prof libre à cette heure-là.
      for (let k = 0; k <= 5 - j; k++) {
        const d2 = plusJours(d, k);
        const j2 = j + k;
        horaires
          .filter((c) => c.prof !== x && c.classes === libere.classes && c.jour === j2 && (k > 0 || c.h > libere.h))
          .forEach((c) => {
            if (heuresDe(c.prof, j).indexOf(libere.h) >= 0 || absent(c.prof, d, libere.h) || absent(c.prof, d2, c.h)) return;
            if (deplacements.some((z) => z.prof === c.prof && z.dO === d2 && z.hO === c.h)) return; // déjà proposé
            // Ce que ça change pour lui : seulement si c'est clairement mieux.
            const H = heuresDe(c.prof, j2);
            const memeJour = k === 0;
            const restent = H.filter((h) => h !== c.h).concat(memeJour ? [libere.h] : []);
            let gain = '';
            const jour = majuscule(JOURS_NOMS[j2]);
            if (!restent.length) gain = `${jour}, tu n'as plus cours`;
            else if (c.h < Math.min(...restent)) gain = `${jour}, tu commences à ${debutH(Math.min(...restent))} au lieu de ${debutH(c.h)}`;
            else if (c.h > Math.max(...restent)) gain = `${jour}, tu finis à ${finH(Math.max(...restent))} au lieu de ${finH(c.h)}`;
            if (!gain) return;
            const T = heuresDe(c.prof, j);
            if (!memeJour && !T.length) return; // un jour de cours en plus
            const avant = memeJour ? H : T;
            const apres = memeJour ? restent : T.concat([libere.h]);
            if (duree(apres) > duree(avant)) return; // journée plus longue
            (parProf[c.prof] = parProf[c.prof] || []).push({ date: d, h: libere.h, classes: libere.classes, local: libere.local, absent: x, depuisDate: d2, depuisH: c.h, depuisLocal: c.local, gain });
          });
      }
    });
  });
  return parProf;
}

/** Le lien qui ouvre IPES App dans Teams avec ce déplacement prêt à proposer. */
function lienTeams(o) {
  const contexte = JSON.stringify({ subEntityId: `prop~${o.depuisDate}~${o.depuisH}~${o.date}~${o.h}` });
  return `https://teams.microsoft.com/l/entity/${APP_TEAMS}/behappi-accueil?context=${encodeURIComponent(contexte)}`;
}

/** La carte Teams : pour chaque occasion, le cours qui part → l'heure libérée, le gain, et « Proposer ». */
function carteTeams(occasions) {
  const quand = (d, h) => `${JOURS_NOMS[jourIso(d)].slice(0, 3)}. ${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))} · H${h}`;
  const bloc = (o) => ({
    type: 'Container',
    style: 'emphasis',
    spacing: 'Medium',
    items: [
      { type: 'TextBlock', text: `${nomCourt(o.absent)} absent·e · ${quand(o.date, o.h)} (${debutH(o.h)}) libérée`, isSubtle: true, size: 'Small', wrap: true },
      {
        type: 'ColumnSet',
        columns: [
          { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: 'Ton cours', size: 'Small', isSubtle: true }, { type: 'TextBlock', text: quand(o.depuisDate, o.depuisH), weight: 'Bolder', wrap: true }, { type: 'TextBlock', text: `${o.classes}${o.depuisLocal ? ` · ${o.depuisLocal}` : ''}`, size: 'Small', spacing: 'None', wrap: true }] },
          { type: 'Column', width: 'auto', verticalContentAlignment: 'Center', items: [{ type: 'TextBlock', text: '➜', size: 'ExtraLarge', color: 'Accent' }] },
          { type: 'Column', width: 'stretch', style: 'good', items: [{ type: 'TextBlock', text: 'Avancé à', size: 'Small', isSubtle: true }, { type: 'TextBlock', text: quand(o.date, o.h), weight: 'Bolder', wrap: true }, { type: 'TextBlock', text: `${o.classes}${o.local ? ` · ${o.local}` : ''}`, size: 'Small', spacing: 'None', wrap: true }] },
        ],
      },
      { type: 'TextBlock', text: `✓ ${o.gain}`, color: 'Good', weight: 'Bolder', wrap: true },
      { type: 'ActionSet', actions: [{ type: 'Action.OpenUrl', title: 'Proposer ce déplacement', url: lienTeams(o) }] },
    ],
  });
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      { type: 'TextBlock', text: occasions.length > 1 ? `${occasions.length} heures libérées pour toi` : `Une heure libérée pour ta ${occasions[0].classes}`, size: 'Large', weight: 'Bolder', wrap: true },
      { type: 'TextBlock', text: 'IPES App revérifie tout avant d’envoyer ; l’éducateur valide.', isSubtle: true, size: 'Small', wrap: true, spacing: 'None' },
      ...occasions.map(bloc),
    ],
  };
}

/** L'onglet FileNotifications : une ligne par occasion (prof, jour, heure) et son état. */
function fileNotifications() {
  const classeur = SpreadsheetApp.getActive();
  const f = classeur.getSheetByName('FileNotifications') || classeur.insertSheet('FileNotifications');
  if (!f.getLastRow()) f.appendRow(['Clé', 'Prof', 'Date', 'Heure', 'Absent', 'État', 'Envoyée le']);
  return f;
}

/**
 * Met en file les occasions nées de ces absences (une seule fois par prof, jour et heure), puis
 * tente l'envoi tout de suite. Renvoie le nombre d'occasions ajoutées à la file.
 */
function notifierDeplacements(nouvelles, maintenant) {
  if (!NOTIFIER || !DESTINATAIRE_NOTIF || !APP_TEAMS) return 0;
  const parProf = occasionsDe(nouvelles, maintenant);
  if (!Object.keys(parProf).length) return 0;
  const f = fileNotifications();
  const deja = new Set(tableau(f).valeurs.map((l) => String(l[0])));
  // Les envois de l'ancienne version (onglet Notifications) ne sont pas refaits.
  const ancien = SpreadsheetApp.getActive().getSheetByName('Notifications');
  if (ancien) tableau(ancien).valeurs.forEach((l) => deja.add(String(l[0])));
  let ajoutees = 0;
  Object.keys(parProf).forEach((prof) => {
    parProf[prof].forEach((o) => {
      const cle = `${prof}|${o.date}|${o.h}`;
      if (deja.has(cle)) return;
      f.appendRow([cle, prof, o.date, o.h, o.absent, 'En attente', '']);
      deja.add(cle);
      ajoutees++;
    });
  });
  if (ajoutees) {
    try {
      distribuerNotifications();
    } catch (e) {
      /* reprise au prochain passage du déclencheur */
    }
  }
  return ajoutees;
}

/**
 * Envoie les notifications en attente, prof par prof (3 occasions au plus par carte), en gardant
 * 5 mails du quota du jour pour le reste. Chaque occasion est revérifiée (absence toujours là,
 * prof toujours libre) ; sinon « Expirée ». Quota atteint : la ligne reste « En attente » et part
 * au prochain passage (toutes les 10 min).
 */
function distribuerNotifications() {
  if (!NOTIFIER || !DESTINATAIRE_NOTIF || !APP_TEAMS || typeof MailApp === 'undefined') return 0;
  const f = SpreadsheetApp.getActive().getSheetByName('FileNotifications');
  if (!f || f.getLastRow() < 2) return 0;
  let budget = Math.min(MAX_MAILS, Math.max(0, MailApp.getRemainingDailyQuota() - 5));
  if (!budget) return 0;
  const t = tableau(f);
  const attente = t.valeurs
    .map((l, i) => ({ ligne: i + 2, prof: String(l[1]), date: String(valeur(l[2])).slice(0, 10), h: Number(l[3]), absent: String(l[4]), etat: String(l[5]) }))
    .filter((x) => x.etat === 'En attente');
  if (!attente.length) return 0;
  const mails = {};
  lignes('Profs').forEach((p) => { const m = avecMail(p); if (m) mails[String(p.Title)] = m; });
  const absences = lignes('Absences');
  let envoyes = 0;
  const profs = [...new Set(attente.map((x) => x.prof))];
  for (const prof of profs) {
    if (!budget) break;
    const pourLui = attente.filter((x) => x.prof === prof);
    // Revérifier : les absences concernées sont-elles toujours là, l'occasion toujours bonne ?
    const concernees = absences.filter((a) => pourLui.some((x) => String(a.Title) === x.absent && String(valeur(a.DateAbs)).slice(0, 10) === x.date));
    const occasions = (occasionsDe(concernees, new Date())[prof] || []);
    const paquet = [];
    pourLui.forEach((x) => {
      const o = occasions.find((c) => c.absent === x.absent && c.date === x.date && c.h === x.h);
      if (!o) return f.getRange(x.ligne, 6).setValue('Expirée');
      if (!mails[prof]) return f.getRange(x.ligne, 6).setValue('Adresse à vérifier');
      if (paquet.length < 3) paquet.push({ x, o });
    });
    if (!paquet.length) continue;
    const premiere = paquet[0].o;
    const texte = `Une heure libérée pour ta ${premiere.classes} : ${premiere.gain.charAt(0).toLowerCase()}${premiere.gain.slice(1)}.`.replace(/\|/g, '/');
    try {
      MailApp.sendEmail({
        to: DESTINATAIRE_NOTIF,
        subject: `${OBJET_NOTIF} ${CLE.slice(0, 8)} | ${mails[prof]} | ${texte}`.slice(0, 250),
        body: texte,
        name: 'IPES App',
        attachments: [Utilities.newBlob(JSON.stringify(carteTeams(paquet.map((p) => p.o))), 'application/json', 'carte.json')],
      });
      const quand = new Date().toISOString();
      paquet.forEach((p) => {
        f.getRange(p.x.ligne, 6).setValue('Transmise');
        f.getRange(p.x.ligne, 7).setValue(quand);
      });
      envoyes++;
      budget--;
    } catch (e) {
      // Quota atteint : on réessaiera ; autre erreur : à vérifier à la main.
      if (!/quota|too many|limit/i.test(String(e))) paquet.forEach((p) => f.getRange(p.x.ligne, 6).setValue('À vérifier'));
      break;
    }
  }
  return envoyes;
}
