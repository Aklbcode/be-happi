/**
 * La Tour – version Google Sheets.
 *
 * Ce script vit DANS le Google Sheet privé (Extensions → Apps Script). Il est la seule porte
 * d'entrée vers les données : La Tour lui envoie la clé secrète et l'adresse du prof connecté
 * (donnée par Teams) ; il ne répond qu'aux profs de l'onglet Profs (ou de l'onglet Roles).
 *
 * Déploiement : Déployer → Nouveau déploiement → Application Web
 *   - Exécuter en tant que : moi
 *   - Qui a accès : tout le monde
 * puis donner l'adresse « …/exec » à la personne qui fabrique le paquet Teams.
 *
 * Chaque onglet = une liste. Ligne 1 : les noms de colonnes. Les colonnes ID, Version, Created,
 * CreePar, Modified et ModifiePar sont gérées par le script (une ligne ajoutée à la main reçoit
 * son ID au prochain chargement).
 *
 * Ce modèle est public : la vraie clé n'y est jamais. Elle est écrite dans la copie collée dans le Sheet.
 */

const CLE = '__CLE__';

/** Les onglets lisibles et modifiables par l'app (mêmes noms que les listes SharePoint). */
const LISTES = [
  'Horaires', 'Profs', 'Absences', 'Réservations', 'Deplacements', 'Infos', 'Signalements', 'Roles',
  'Decisions', 'Materiel', 'Changements', 'HorairesEleves', 'CapReussite', 'Resultats', 'Stages',
];
/** Ce que l'app ne peut jamais modifier. */
const LECTURE_SEULE = ['Horaires', 'Profs', 'Roles', 'HorairesEleves', 'Resultats', 'Stages'];
const SYSTEME = ['ID', 'Version', 'Created', 'CreePar', 'Modified', 'ModifiePar'];

/**
 * Les stages de départ : l'onglet « Stages » est créé avec ces lignes s'il n'existe pas encore
 * (classe, du, au, nom du stage). Ensuite, on le complète directement dans le Sheet.
 * Le modèle public est vide ; la copie collée dans le Sheet porte les vraies périodes.
 */
const STAGES_DEPART = [];

/**
 * Un lot à importer une seule fois (absences connues, sorties) : ajouté au premier chargement,
 * sans doublon (même prof et même jour ; même classe et mêmes dates). Si on supprime ensuite une
 * ligne dans le Sheet, elle ne revient pas : le lot est marqué « importé ».
 * Le modèle public est vide ; la copie collée dans le Sheet porte les vraies lignes.
 */
const LOTS = [];

function ajouterLignes(nom, lignesLot, cle) {
  const f = SpreadsheetApp.getActive().getSheetByName(nom);
  if (!f || !lignesLot.length) return 0;
  const t = tableau(f);
  const deja = new Set(lignes(nom).map(cle));
  const nouvelles = lignesLot.filter((o) => !deja.has(cle(o)));
  if (!nouvelles.length) return 0;
  const valeurs = nouvelles.map((o) => t.entetes.map((h) => (o[h] === undefined ? '' : o[h])));
  f.getRange(f.getLastRow() + 1, 1, valeurs.length, t.entetes.length).setValues(valeurs);
  return nouvelles.length;
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

function preparerStages() {
  const classeur = SpreadsheetApp.getActive();
  if (classeur.getSheetByName('Stages')) return;
  const f = classeur.insertSheet('Stages');
  f.appendRow(['Title', 'Du', 'Au', 'Stage']);
  STAGES_DEPART.forEach((l) => f.appendRow(l));
}

function doGet() {
  return json({ ok: true, app: 'La Tour', message: 'Le script répond. Ouvre La Tour dans Teams.' });
}

function doPost(e) {
  let q;
  try {
    q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json({ status: 400, erreur: 'Requête illisible.' });
  }
  if (q.cle !== CLE) return json({ status: 401, erreur: 'Clé refusée.' });
  try {
    const mail = String(q.mail || '').trim().toLowerCase();
    if (!mail) return json({ status: 401, erreur: 'Adresse manquante : ouvre La Tour dans Teams.' });
    if (q.action === 'qui') return json(qui(mail));
    if (q.action === 'associer') return json(associer(mail, String(q.nom || '')));
    const moi = qui(mail);
    if (!moi.nom && !moi.roles.length) return json({ status: 403, erreur: 'Adresse inconnue.' });
    if (q.action === 'lire') return json({ status: 200, moi, listes: toutLire() });
    if (q.action === 'creer') return json(ecrire(() => creer(q.liste, q.fields || {}, mail)));
    if (q.action === 'modifier') return json(ecrire(() => modifier(q.liste, q.id, q.fields || {}, q.etag, mail)));
    if (q.action === 'supprimer') return json(ecrire(() => supprimer(q.liste, q.id)));
    return json({ status: 400, erreur: 'Action inconnue.' });
  } catch (err) {
    return json({ status: 500, erreur: String(err && err.message ? err.message : err) });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

let verrouille = false;

/** Une écriture à la fois (deux profs qui prennent le même élève). Réentrant : pas de double verrou. */
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
  }
}

// ---------- Qui est connecté ? ----------

const simple = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nomSeul = (t) => (t.indexOf(' (') >= 0 ? t.slice(0, t.indexOf(' (')) : t);

/**
 * Le prof qui correspond à cette adresse : la colonne Email de l'onglet Profs, sinon comme
 * Power Apps (prenom.nom@… → NOM), seulement si un seul prof correspond et qu'aucune autre
 * adresse ne l'a déjà pris. Renvoie aussi ses rôles (onglet Roles) et, s'il est inconnu, les noms
 * encore libres pour qu'il se reconnaisse.
 */
function qui(mail) {
  const profs = lignes('Profs');
  const roles = lignes('Roles')
    .filter((r) => String(r.Title || '').trim().toLowerCase() === mail)
    .map((r) => String(r.Role || ''));
  const avecMail = (p) => { const m = String(p.Email || '').trim().toLowerCase(); return m && m !== '0' ? m : ''; };
  let fiche = profs.find((p) => avecMail(p) === mail);
  if (!fiche) {
    const local = mail.split('@')[0];
    const point = local.indexOf('.');
    const cle = point >= 0 ? simple(local.slice(point + 1)) : '';
    const trouves = cle ? profs.filter((p) => simple(nomSeul(String(p.Title || ''))) === cle) : [];
    if (trouves.length === 1 && !avecMail(trouves[0])) {
      fiche = trouves[0];
      // Relié pour de bon : ce nom ne pourra plus être choisi par quelqu'un d'autre.
      ecrire(() => ecrireMail(String(fiche.Title), mail));
    }
  }
  if (fiche) return { status: 200, nom: String(fiche.Title), roles };
  const libres = profs.filter((p) => !avecMail(p)).map((p) => String(p.Title)).sort();
  return { status: 200, nom: '', roles, inconnu: true, libres };
}

/** Écrit l'adresse dans la colonne Email de l'onglet Profs, sur la ligne de ce nom. */
function ecrireMail(nom, mail) {
  const f = SpreadsheetApp.getActive().getSheetByName('Profs');
  const t = tableau(f);
  const iNom = t.entetes.indexOf('Title');
  const iMail = t.entetes.indexOf('Email');
  if (iNom < 0 || iMail < 0) return false;
  const i = t.valeurs.findIndex((l) => String(l[iNom]) === nom);
  if (i < 0) return false;
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
    if (actuel && actuel !== '0') return { status: 409, erreur: 'Ce nom est déjà relié à une autre adresse. Demande à la personne qui gère La Tour.' };
    f.getRange(i + 2, iMail + 1).setValue(mail);
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

/** Une date de cellule → texte : « 2026-11-02 » pour un jour, ISO complet si une heure est là. */
function texteDate(v) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const h = Utilities.formatDate(v, tz, 'HH:mm:ss');
  return h === '00:00:00' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : Utilities.formatDate(v, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function valeur(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return texteDate(v);
  if (typeof v === 'string') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return v;
}

function lignes(nom) {
  const f = SpreadsheetApp.getActive().getSheetByName(nom);
  if (!f) return [];
  const t = tableau(f);
  return t.valeurs
    .filter((l) => l.some((x) => x !== '' && x !== null))
    .map((l) => {
      const o = {};
      t.entetes.forEach((h, j) => { if (h) o[h] = valeur(l[j]); });
      return o;
    });
}

/** Donne un ID aux lignes ajoutées à la main (absences du matin…). */
function numeroter(f) {
  const t = tableau(f);
  const iId = t.entetes.indexOf('ID');
  const iV = t.entetes.indexOf('Version');
  if (iId < 0) return;
  t.valeurs.forEach((l, i) => {
    const vide = !l.some((x, j) => j !== iId && j !== iV && x !== '' && x !== null);
    if (!vide && (l[iId] === '' || l[iId] === null)) {
      f.getRange(i + 2, iId + 1).setValue(Utilities.getUuid().slice(0, 13));
      if (iV >= 0) f.getRange(i + 2, iV + 1).setValue(1);
    }
  });
}

function item(o) {
  const fields = {};
  Object.keys(o).forEach((k) => { if (SYSTEME.indexOf(k) < 0 && o[k] !== '' && o[k] !== null) fields[k] = o[k]; });
  if (o.Created) fields.Created = o.Created;
  return {
    id: String(o.ID),
    eTag: `"${o.ID},${o.Version || 1}"`,
    createdDateTime: o.Created || undefined,
    lastModifiedDateTime: o.Modified || undefined,
    createdBy: { user: { displayName: o.CreePar || '', email: o.CreePar || '' } },
    lastModifiedBy: { user: { displayName: o.ModifiePar || '' } },
    fields,
  };
}

function toutLire() {
  const classeur = SpreadsheetApp.getActive();
  const sortie = {};
  ecrire(() => {
    if (classeur.insertSheet) preparerStages();
    importerLots();
    LISTES.forEach((nom) => { const f = classeur.getSheetByName(nom); if (f) numeroter(f); });
  });
  LISTES.forEach((nom) => {
    const f = classeur.getSheetByName(nom);
    if (!f) return;
    const t = tableau(f);
    sortie[nom] = {
      colonnes: t.entetes.filter((h) => h && SYSTEME.indexOf(h) < 0),
      // Onglet sans colonne ID (Horaires, Profs…) : la ligne sert d'identifiant (lecture seule).
      items: lignes(nom)
        .map((o, i) => (t.entetes.indexOf('ID') < 0 ? Object.assign({}, o, { ID: `L${i + 2}` }) : o))
        .filter((o) => o.ID !== '' && o.ID !== undefined)
        .map(item),
    };
  });
  return sortie;
}

// ---------- Écriture ----------

function feuille(nom) {
  if (LISTES.indexOf(nom) < 0 || LECTURE_SEULE.indexOf(nom) >= 0) throw new Error(`Liste non modifiable : ${nom}`);
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

function colonnesAvec(f, t, champs) {
  const manquantes = Object.keys(champs).filter((k) => k && t.entetes.indexOf(k) < 0 && SYSTEME.indexOf(k) < 0);
  manquantes.forEach((k) => {
    f.getRange(1, t.entetes.length + 1).setValue(k);
    t.entetes.push(k);
  });
  SYSTEME.forEach((k) => {
    if (t.entetes.indexOf(k) < 0) {
      f.getRange(1, t.entetes.length + 1).setValue(k);
      t.entetes.push(k);
    }
  });
}

function creer(nom, champs, mail) {
  const f = feuille(nom);
  const t = tableau(f);
  colonnesAvec(f, t, champs);
  const maintenant = new Date().toISOString();
  const o = Object.assign({}, champs, { ID: Utilities.getUuid().slice(0, 13), Version: 1, Created: maintenant, CreePar: mail, Modified: maintenant, ModifiePar: mail });
  f.appendRow(t.entetes.map((h) => versCellule(o[h])));
  return { status: 201, item: item(Object.assign({}, o, Object.fromEntries(Object.keys(champs).map((k) => [k, champs[k]])))) };
}

function trouver(f, id) {
  const t = tableau(f);
  const iId = t.entetes.indexOf('ID');
  const i = t.valeurs.findIndex((l) => String(l[iId]) === String(id));
  return { t, i };
}

function modifier(nom, id, champs, etag, mail) {
  const f = feuille(nom);
  const { t, i } = trouver(f, id);
  if (i < 0) return { status: 404, erreur: 'Élément introuvable.' };
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

function supprimer(nom, id) {
  const f = feuille(nom);
  const { i } = trouver(f, id);
  if (i >= 0) f.deleteRow(i + 2);
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
  const fils = GmailApp.search(`subject:"${OBJET_ABSENCES} ${CLE.slice(0, 8)}" is:unread has:attachment newer_than:2d`, 0, 5);
  if (!fils.length) return;
  // Le plus récent suffit : il contient tout.
  const messages = fils.flatMap((f) => f.getMessages()).filter((m) => m.isUnread());
  messages.sort((a, b) => b.getDate() - a.getDate());
  const piece = messages[0].getAttachments().find((p) => /\.xlsx$/i.test(p.getName()));
  if (piece) ecrire(() => appliquerAbsencesExcel(lireClasseurXlsx(Utilities.unzip(piece.copyBlob())), new Date()));
  messages.forEach((m) => m.markRead());
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
const isoDate = (d) => Utilities.formatDate(d, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');

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
  const deja = {};
  for (let r = t.valeurs.length - 1; r >= 0; r--) {
    const ligne = t.valeurs[r];
    const d = String(valeur(ligne[iD]) || '').slice(0, 10);
    if (!d || d < aujourdhui || d > fin) continue;
    const cle = `${String(ligne[iT]).trim()}|${d}`;
    if (iC >= 0 && ligne[iC] === SOURCE_EXCEL && !voulues[cle]) f.deleteRow(r + 2); // retirée de l'Excel
    else deja[cle] = true;
  }
  const maintenantIso = new Date().toISOString();
  const nouvelles = Object.keys(voulues).filter((k) => !deja[k]).map((k) => Object.assign({ Created: maintenantIso, CreePar: SOURCE_EXCEL, Version: 1 }, voulues[k]));
  if (nouvelles.length) {
    colonnesAvec(f, t, { Title: 1, DateAbs: 1, DeH: 1, AH: 1 });
    f.getRange(f.getLastRow() + 1, 1, nouvelles.length, t.entetes.length).setValues(nouvelles.map((o) => t.entetes.map((h) => (o[h] === undefined ? '' : o[h]))));
  }

  // Journal : ce qui a été fait, et les noms à vérifier.
  const classeurG = SpreadsheetApp.getActive();
  const journal = classeurG.getSheetByName('Import') || classeurG.insertSheet('Import');
  if (journal.getLastRow() === 0) journal.appendRow(['Quand', 'Ajoutées', 'Nom non reconnu (date)']);
  journal.appendRow([maintenantIso, nouvelles.length, inconnus.map(([d, n]) => `${n} (${d})`).join(', ')]);
  return { ajoutees: nouvelles.length, inconnus };
}
