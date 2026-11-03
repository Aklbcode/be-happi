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
};

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
  const cles = Array.from({ length: n }, (_, i) => `d|${i}`);
  const morceaux = c.getAll(cles);
  if (cles.some((k) => typeof morceaux[k] !== 'string')) return null;
  try {
    memoire = JSON.parse(cles.map((k) => morceaux[k]).join(''));
    return memoire;
  } catch (e) {
    return null;
  }
}

function ecrireCache(d, g) {
  memoire = d;
  const c = cacheScript();
  if (!c || !g) return;
  const texte = JSON.stringify(d);
  const o = {};
  let n = 0;
  for (let i = 0; i < texte.length; i += MORCEAU) o[`d|${n++}`] = texte.slice(i, i + MORCEAU);
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
  if (LISTES.indexOf(nom) < 0 || LECTURE_SEULE.indexOf(nom) >= 0 || !CHAMPS[nom]) throw new Error(`Liste non modifiable : ${nom}`);
  const f = SpreadsheetApp.getActive().getSheetByName(nom);
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
  const fils = GmailApp.search(`subject:"${OBJET_ABSENCES} ${CLE.slice(0, 8)}" is:unread has:attachment newer_than:2d`, 0, 5);
  if (!fils.length) return;
  // Le plus récent suffit : il contient tout.
  const messages = fils.flatMap((f) => f.getMessages()).filter((m) => m.isUnread());
  if (!messages.length) return;
  messages.sort((a, b) => b.getDate() - a.getDate());
  try {
    const piece = messages[0].getAttachments().find((p) => /\.xlsx$/i.test(p.getName()));
    if (piece) ecrire(() => appliquerAbsencesExcel(lireClasseurXlsx(Utilities.unzip(piece.copyBlob())), new Date()));
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
function resoudreProf(nomExcel, jourNum, heures, profs, horaires) {
  const n = simple(nomExcel);
  if (!n) return '';
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
        const prof = resoudreProf(nomExcel, jourNum, heures, profs, horaires);
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

  // Journal : ce qui a été fait, et les noms à vérifier.
  journaliser(nouvelles.length, inconnus, '');
  return { ajoutees: nouvelles.length, inconnus };
}
