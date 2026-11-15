// Version Google Sheets : le vrai script (google/Code.gs) tourne ici sur un faux classeur, et l'app
// le lit par son faux Microsoft Graph. On vérifie la clé, la reconnaissance du prof, le choix du nom,
// les dates tapées à la main, les écritures et la protection contre les modifications croisées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { iso, plusJours } from '../src/lib/calendar';
import { lireParametre, utiliserReglagesGoogle, choixEnAttente, associer, chercherNom, appareilEnAttente } from '../src/data/google';
import { chargerSharePoint, enregistrerPlage, enregistrerReservation, modifierSeance, profil } from '../src/data/sharepoint';

const CLE = 'cle-de-test-1234567890';
const J = (n: number) => iso(plusJours(new Date(), n));

// ---------- Faux Google Sheets ----------

type Cellule = string | number | boolean | Date;
const classeur: Record<string, Cellule[][]> = {
  Profs: [
    ['Title', 'MatierePrincipale', 'Email'],
    ['LAMBERT', 'Géographie', '0'],
    ['MARTIN (math)', 'Histoire', '0'],
    ['MARTIN (sport)', 'Education physique', '0'],
  ],
  Horaires: [
    ['Title', 'JourNum', 'Heure', 'Classes', 'Local', 'Matiere'],
    ['LAMBERT', 1, 3, '5TQB', 'BF110', 'Géographie'],
    ['MARTIN (math)', 2, 4, '3GA', 'BC105', 'Histoire'],
  ],
  // Une absence tapée à la main : pas d'ID, une vraie date de cellule.
  Absences: [['ID', 'Version', 'Title', 'DateAbs', 'DeH', 'AH', 'Motif'], ['', '', 'MARTIN (math)', new Date(`${J(1)}T00:00:00`), 1, 9, 'Médical']],
  Réservations: [['ID', 'Version', 'Title', 'DateRes', 'Heure', 'Local', 'Classe']],
  CapReussite: [['ID', 'Version', 'Title', 'Eleve', 'DateCR', 'Heure', 'Matiere', 'Origine', 'Statut', 'Prof', 'Local']],
  Roles: [['Title', 'Role'], ['educ@ecole.example', 'Éducatrice'], ['direction@ecole.example', 'Direction']],
  Deplacements: [['ID', 'Version', 'Title', 'DateDep', 'HeureVide', 'Classe', 'Collegue', 'HeureOrigine', 'DateOrigine', 'Statut', 'Created', 'CreePar', 'Modified', 'ModifiePar']],
  Materiel: [['ID', 'Version', 'Title', 'DateRes', 'Heure', 'Rack', 'Classe']],
  Decisions: [['ID', 'Version', 'Title', 'Statut', 'Commentaire', 'Collegue', 'Absent', 'DateDep', 'HeureVide', 'DateOrigine', 'HeureOrigine', 'Local']],
};

function feuille(nom: string) {
  const d = classeur[nom];
  return {
    getLastRow: () => d.length,
    getLastColumn: () => Math.max(...d.map((l) => l.length)),
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({
      getValues: () => d.slice(r - 1, r - 1 + nr).map((l) => Array.from({ length: nc }, (_, j) => l[c - 1 + j] ?? '')),
      setValue: (v: Cellule) => {
        while (d.length < r) d.push([]);
        d[r - 1][c - 1] = v;
      },
      setValues: (vs: Cellule[][]) =>
        vs.forEach((l, i) => {
          while (d.length < r + i) d.push([]);
          l.forEach((v, j) => (d[r - 1 + i][c - 1 + j] = v));
        }),
    }),
    appendRow: (l: Cellule[]) => d.push(l),
    deleteRow: (r: number) => d.splice(r - 1, 1),
  };
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0');
const mailsEnvoyes: { to: string; subject: string; body: string; attachments?: { texte: string }[] }[] = [];
// Le cache Google (quelques minutes) : une Map suffit.
const memoireCache = new Map<string, string>();
const cache = {
  get: (k: string) => memoireCache.get(k) ?? null,
  getAll: (ks: string[]) => Object.fromEntries(ks.filter((k) => memoireCache.has(k)).map((k) => [k, memoireCache.get(k)])),
  put: (k: string, v: string) => void memoireCache.set(k, v),
  putAll: (o: Record<string, string>) => Object.entries(o).forEach(([k, v]) => memoireCache.set(k, v)),
  remove: (k: string) => void memoireCache.delete(k),
};
const contexte = vm.createContext({
  // L'horloge du test (voir scripts/horloge-test.mjs), pas celle de la machine.
  Date,
  SpreadsheetApp: { getActive: () => ({ getSheetByName: (n: string) => (classeur[n] ? feuille(n) : null), insertSheet: (n: string) => ((classeur[n] = []), feuille(n)), getSpreadsheetTimeZone: () => 'Europe/Brussels' }) },
  ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
  LockService: { getScriptLock: () => ({ waitLock: () => undefined, tryLock: () => true, releaseLock: () => undefined }) },
  CacheService: { getScriptCache: () => cache },
  MailApp: { getRemainingDailyQuota: () => 100, sendEmail: (m: { to: string; subject: string; body: string; attachments?: { texte: string }[] }) => void mailsEnvoyes.push(m) },
  Utilities: {
    newBlob: (texte: string) => ({ texte }),
    getUuid: () => `${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`,
    // Le test tourne à l'heure locale de la machine : assez pour des dates à minuit.
    formatDate: (d: Date, _tz: string, f: string) => {
      const date = `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
      const heure = `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}:${deuxChiffres(d.getSeconds())}`;
      return f === 'HH:mm:ss' ? heure : f === 'yyyy-MM-dd' ? date : `${date}T${heure}+01:00`;
    },
  },
});
vm.runInContext(readFileSync(new URL('../google/Code.gs', import.meta.url), 'utf8').replace('__CLE__', CLE).replace("const DESTINATAIRE_NOTIF = '';", "const DESTINATAIRE_NOTIF = 'flow@ecole.example';").replace("const APP_TEAMS = '';", "const APP_TEAMS = '00000000-0000-0000-0000-000000000000';").replace("const ADMIN_SUGGESTIONS = '';", "const ADMIN_SUGGESTIONS = 'admin@ecole.example';").replace('const APPAREILS_ROLES = true;', 'const APPAREILS_ROLES = false;'), contexte);
const doPost = contexte.doPost as (e: unknown) => string;
const envoi = async (_url: string, corps: string) => JSON.parse(doPost({ postData: { contents: corps } }));

const appeler = (o: Record<string, unknown>) => JSON.parse(doPost({ postData: { contents: JSON.stringify(o) } }));

// ---------- Tests ----------

test('le réglage « ID~clé » se lit, et rien d’autre', () => {
  assert.deepEqual(lireParametre('AKfycbxTESTTESTTESTTEST~abcdefghijklmnop'), { script: 'AKfycbxTESTTESTTESTTEST', cle: 'abcdefghijklmnop' });
  assert.equal(lireParametre('court~cle'), null);
  assert.equal(lireParametre(''), null);
});

test('le script refuse une mauvaise clé ; une adresse inconnue ne reçoit aucune liste', () => {
  assert.equal(appeler({ action: 'lire', cle: 'faux', mail: 'luc.lambert@ecole.example' }).status, 401);
  const inconnu = appeler({ action: 'lire', cle: CLE, mail: 'eleve.x@ecole.example' });
  assert.equal(inconnu.listes, undefined);
  assert.equal(inconnu.moi.inconnu, true);
  assert.equal(appeler({ action: 'creer', cle: CLE, mail: 'eleve.x@ecole.example', liste: 'Réservations', fields: { Title: 'X' } }).status, 403);
  assert.equal(appeler({ action: 'lire', cle: CLE, mail: '' }).status, 401);
  assert.equal(appeler({ action: 'lire', cle: CLE, mail: 'pas une adresse' }).status, 401);
});

test('le script ne laisse jamais modifier l’horaire ni la liste des profs', () => {
  const r = appeler({ action: 'creer', cle: CLE, mail: 'luc.lambert@ecole.example', liste: 'Horaires', fields: { Title: 'X' } });
  assert.equal(r.status, 500);
  assert.match(r.erreur, /non modifiable/);
});

test('prenom.nom@ est reconnu, l’horaire et l’absence tapée à la main arrivent dans l’app', async () => {
  utiliserReglagesGoogle({ script: 'AKfycbxTESTTESTTESTTEST', cle: CLE }, envoi, 'luc.lambert@ecole.example');
  const moi = await profil();
  assert.equal(moi.email, 'luc.lambert@ecole.example');
  const ds = await chargerSharePoint(moi.email, moi.prenom);
  assert.equal(ds.moi.nom, 'LAMBERT');
  assert.ok(ds.moi.profils?.includes('prof'));
  assert.equal(ds.cours.length, 2);
  assert.deepEqual(ds.absences.map((a) => [a.prof, a.date, a.deH, a.aH]), [['MARTIN (math)', J(1), 1, 9]]);
  // Reconnu pour de bon : son adresse est écrite dans l'onglet Profs.
  assert.equal(classeur.Profs[1][2], 'luc.lambert@ecole.example');
  // La ligne tapée à la main a reçu un ID dans le Sheet.
  assert.ok(String(classeur.Absences[1][0]).length > 5);
});

test('une écriture arrive dans le Sheet ; une modification croisée est refusée', async () => {
  await enregistrerReservation({ prof: 'LAMBERT', date: J(2), h: 4, local: 'BF110', classe: '5TQB' });
  const ligne = classeur.Réservations[classeur.Réservations.length - 1];
  const entetes = classeur.Réservations[0];
  assert.equal(ligne[entetes.indexOf('Title')], 'LAMBERT');
  assert.equal(ligne[entetes.indexOf('DateRes')], J(2));
  assert.equal(ligne[entetes.indexOf('CreePar')], 'luc.lambert@ecole.example');

  classeur.CapReussite.push(['cr1', 1, '3GA', 'Léa D.', J(2), 6, 'Histoire', 'Élève', 'Disponible', '', '']);
  utiliserReglagesGoogle({ script: 'AKfycbxTESTTESTTESTTEST', cle: CLE }, envoi, 'luc.lambert@ecole.example');
  const ds = await chargerSharePoint('luc.lambert@ecole.example', 'Luc');
  const s = ds.capReussite!.find((x) => x.id === 'cr1')!;
  await modifierSeance(s, { statut: 'Prise', prof: 'LAMBERT', local: 'BF110' });
  // La même ligne, avec l'ancienne version : un autre prof l'a prise entre-temps.
  await assert.rejects(modifierSeance(s, { statut: 'Prise', prof: 'AUTRE', local: 'X' }), /Un autre prof vient de prendre/);
});

test('un nom en double : le prof choisit le sien une fois, puis il est reconnu', async () => {
  utiliserReglagesGoogle({ script: 'AKfycbxTESTTESTTESTTEST', cle: CLE }, envoi, 'jean.martin@ecole.example');
  await assert.rejects(chargerSharePoint('jean.martin@ecole.example', 'Jean'), /CHOIX_PROF/);
  // Pas de liste complète : on cherche son nom (3 lettres au moins).
  assert.deepEqual(choixEnAttente()?.libres, []);
  assert.deepEqual(await chercherNom('ma'), []);
  assert.deepEqual(await chercherNom('martin'), ['MARTIN (math)', 'MARTIN (sport)']);
  await associer('MARTIN (math)');
  const ds = await chargerSharePoint('jean.martin@ecole.example', 'Jean');
  assert.equal(ds.moi.nom, 'MARTIN (math)');
  // Le nom est pris : un autre ne peut plus le réclamer.
  assert.equal(appeler({ action: 'associer', cle: CLE, mail: 'autre.personne@ecole.example', nom: 'MARTIN (math)' }).status, 409);
});

test('import de l’Excel : heures d’une sortie, date d’une feuille, nom mal écrit ou homonyme', () => {
  const f = contexte as unknown as Record<string, (...a: unknown[]) => unknown>;
  assert.equal(JSON.stringify(f.heuresDeNote('Départ 9h20 retour 12h05')), '[2,4]');
  assert.equal(JSON.stringify(f.heuresDeNote('RETOUR 13H30')), '[1,6]');
  assert.equal(f.heuresDeNote('2026-11-17'), null);
  assert.equal(f.dateFeuille('Ma 03-11', new Date('2026-11-03T09:00:00')), '2026-11-03');
  assert.equal(f.dateFeuille('Lu 15-03', new Date('2026-11-03T09:00:00')), '2027-03-15');
  const profs = ['MARTIN (math)', 'MARTIN (sport)', 'LAMBERTINI', 'DURANDO'];
  const horaires = [{ prof: 'MARTIN (sport)', jour: 2, h: 3, classes: '4GB' }, { prof: 'MARTIN (math)', jour: 2, h: 3, classes: '3GA' }];
  assert.equal(f.resoudreProf('Martin J.', 2, { 3: '4GB' }, profs, horaires), 'MARTIN (sport)');
  assert.equal(f.resoudreProf('LAMBERTNI', 2, {}, profs, horaires), 'LAMBERTINI');
  assert.equal(f.resoudreProf('Inconnu', 2, {}, profs, horaires), '');
});

test('une coupure réseau à la lecture est retentée ; une écriture ne l’est jamais', async () => {
  let n = 0;
  const instable = async (url: string, corps: string) => {
    n++;
    if (n === 1) throw new TypeError('Load failed');
    return envoi(url, corps);
  };
  utiliserReglagesGoogle({ script: 'AKfycbxTESTTESTTESTTEST', cle: CLE }, instable, 'luc.lambert@ecole.example');
  const ds = await chargerSharePoint('luc.lambert@ecole.example', 'Luc');
  assert.equal(ds.moi.nom, 'LAMBERT');
  let ecritures = 0;
  utiliserReglagesGoogle({ script: 'AKfycbxTESTTESTTESTTEST', cle: CLE }, async (url, corps) => {
    if (JSON.parse(corps).action === 'creer') {
      ecritures++;
      throw new TypeError('Load failed');
    }
    return envoi(url, corps);
  }, 'luc.lambert@ecole.example');
  await assert.rejects(enregistrerReservation({ prof: 'LAMBERT', date: J(3), h: 2, local: 'BF110', classe: '5TQB' }), /Pas de connexion/);
  assert.equal(ecritures, 1);
});

// ---------- Sécurité et droits ----------

const prof = 'luc.lambert@ecole.example';
const educ = 'educ@ecole.example';
const lire = (mail: string) => appeler({ action: 'lire', cle: CLE, mail });
const creerX = (mail: string, liste: string, fields: Record<string, unknown>) => appeler({ action: 'creer', cle: CLE, mail, liste, fields });

test('ni motif d’absence, ni rôles des autres dans ce qui est envoyé', () => {
  const r = lire(prof);
  assert.ok(!r.listes.Absences.cols.includes('Motif'));
  assert.equal(r.listes.Roles.lignes.length, 0);
  assert.deepEqual(lire(educ).listes.Roles.lignes, [[educ, 'Éducatrice']]);
});

test('une formule ne passe jamais dans le Sheet ; colonnes système et inconnues refusées', () => {
  const r = creerX(prof, 'Réservations', { Title: 'LAMBERT', Local: '=IMPORTXML("https://x.example";"//a")', Classe: '+cmd', CreePar: 'autre@ecole.example', Pirate: 'x' });
  assert.equal(r.status, 201);
  const e = classeur.Réservations[0];
  const ligne = classeur.Réservations[classeur.Réservations.length - 1];
  assert.equal(ligne[e.indexOf('Local')], `'=IMPORTXML("https://x.example";"//a")`);
  assert.equal(ligne[e.indexOf('Classe')], "'+cmd");
  assert.equal(ligne[e.indexOf('CreePar')], prof);
  assert.ok(!e.includes('Pirate'));
});

test('un prof ne réserve que pour lui et ne supprime pas la réservation d’un autre', () => {
  assert.equal(creerX(prof, 'Réservations', { Title: 'MARTIN (math)', Local: 'BF110' }).status, 403);
  const r = creerX(educ, 'Réservations', { Title: 'MARTIN (math)', Local: 'BC105' });
  assert.equal(r.status, 201);
  assert.equal(appeler({ action: 'supprimer', cle: CLE, mail: prof, liste: 'Réservations', id: r.item.id }).status, 403);
  assert.equal(appeler({ action: 'supprimer', cle: CLE, mail: educ, liste: 'Réservations', id: r.item.id }).status, 204);
});

test('déplacements : le prof propose pour lui, seul l’éducateur valide', () => {
  const base = { Title: 'MARTIN (math)', DateDep: J(2), HeureVide: 4, Classe: '5TQB', HeureOrigine: 3, DateOrigine: J(3) };
  assert.equal(creerX(prof, 'Deplacements', { ...base, Collegue: 'LAMBERT', Statut: 'Validé' }).status, 403);
  assert.equal(creerX(prof, 'Deplacements', { ...base, Collegue: 'MARTIN (sport)', Statut: 'En attente' }).status, 403);
  const p = creerX(prof, 'Deplacements', { ...base, Collegue: 'LAMBERT', Statut: 'En attente' });
  assert.equal(p.status, 201);
  assert.equal(appeler({ action: 'modifier', cle: CLE, mail: prof, liste: 'Deplacements', id: p.item.id, fields: { Statut: 'Validé' } }).status, 403);
  assert.equal(appeler({ action: 'modifier', cle: CLE, mail: educ, liste: 'Deplacements', id: p.item.id, fields: { Statut: 'Validé' }, etag: p.item.eTag }).status, 200);
  // Validé : le prof ne peut plus le retirer lui-même.
  assert.equal(appeler({ action: 'supprimer', cle: CLE, mail: prof, liste: 'Deplacements', id: p.item.id }).status, 403);
  // Une version dépassée est refusée.
  assert.equal(appeler({ action: 'supprimer', cle: CLE, mail: educ, liste: 'Deplacements', id: p.item.id, etag: p.item.eTag }).status, 412);
});

test('absences : réservées à la gestion (éducateurs, secrétariat, direction)', () => {
  assert.equal(creerX(prof, 'Absences', { Title: 'MARTIN (math)', DateAbs: J(4), DeH: 1, AH: 9 }).status, 403);
  assert.equal(creerX('direction@ecole.example', 'Absences', { Title: 'MARTIN (math)', DateAbs: J(4), DeH: 1, AH: 9 }).status, 201);
});

test('le cache suit les écritures et les modifications à la main', () => {
  const avant = lire(prof).listes.Absences.lignes.length;
  creerX(educ, 'Absences', { Title: 'LAMBERT', DateAbs: J(5), DeH: 2, AH: 3 });
  assert.equal(lire(prof).listes.Absences.lignes.length, avant + 1);
  // Ajout à la main dans le Sheet, puis le déclencheur onEdit : visible tout de suite, avec un ID.
  classeur.Absences.push(['', '', 'LAMBERT', J(6), 1, 2, '']);
  assert.equal(lire(prof).listes.Absences.lignes.length, avant + 1, 'sans onEdit : la copie en cache');
  (contexte.onEdit as () => void)();
  const apres = lire(prof).listes.Absences;
  assert.equal(apres.lignes.length, avant + 2);
  assert.ok(apres.lignes.every((l: unknown[]) => String(l[apres.cols.indexOf('ID')]).length > 5));
});

test('un script collé sans sa clé ne répond à personne', () => {
  const c2 = vm.createContext({ ...contexte });
  vm.runInContext(readFileSync(new URL('../google/Code.gs', import.meta.url), 'utf8'), c2);
  assert.equal(JSON.parse((c2.doPost as (e: unknown) => string)({ postData: { contents: JSON.stringify({ action: 'lire', cle: '__CLE__', mail: prof }) } })).status, 503);
});

test('deux réservations du même local à la même heure : la seconde est refusée', () => {
  const r = { Title: 'LAMBERT', DateRes: `${J(9)}T12:00:00Z`, Heure: 3, Local: 'BF220' };
  assert.equal(creerX(prof, 'Réservations', r).status, 201);
  const deux = creerX(educ, 'Réservations', { ...r, Title: 'MARTIN (math)' });
  assert.equal(deux.status, 409);
  assert.match(deux.erreur, /vient d’être réservé/);
  assert.equal(creerX(prof, 'Réservations', { ...r, Heure: 4 }).status, 201);
});

test('une absence encodée libère une heure : le prof qui a la classe plus tard est prévenu une fois', () => {
  // Lundi prochain : MARTIN (sport) a la 5TQB en H2 ; LAMBERT l'a en H3 et il est libre en H2.
  // (dans plus de deux semaines : loin des absences des autres tests)
  const lundi = (() => { const d = new Date(); d.setDate(d.getDate() + 14 + ((8 - d.getDay()) % 7 || 7)); return iso(d); })();
  classeur.Horaires.push(['MARTIN (sport)', 1, 2, '5TQB', 'GYM', 'Sport']);
  (contexte.onEdit as () => void)();
  mailsEnvoyes.length = 0;
  assert.equal(creerX(educ, 'Absences', { Title: 'MARTIN (sport)', DateAbs: `${lundi}T12:00:00Z`, DeH: 1, AH: 9 }).status, 201);
  // Un seul mail technique, vers la boîte du flow Teams : objet « code | adresse du prof | texte ».
  assert.equal(mailsEnvoyes.length, 1);
  assert.equal(mailsEnvoyes[0].to, 'flow@ecole.example');
  const [code, a, texte] = mailsEnvoyes[0].subject.split(' | ');
  assert.equal(code, `IPES-APP-NOTIF ${CLE.slice(0, 8)}`);
  assert.equal(a, prof);
  assert.match(texte, /Une heure libérée pour ta 5TQB : lundi, tu finis à 10h10 au lieu de 11h15/);
  // La carte Teams : le cours qui part → l'heure libérée, le gain, et un bouton qui ouvre l'app prête.
  const carte = JSON.parse(mailsEnvoyes[0].attachments![0].texte);
  assert.equal(carte.type, 'AdaptiveCard');
  const tout = JSON.stringify(carte);
  assert.match(tout, /Martin absent·e/);
  assert.match(tout, /lun\. \d+\/\d+ · H3/);
  const url = carte.body[2].items.find((x: { type: string }) => x.type === 'ActionSet').actions[0].url as string;
  assert.match(decodeURIComponent(url), /^https:\/\/teams\.microsoft\.com\/l\/entity\/0{8}-.*\/behappi-accueil\?context=\{"subEntityId":"prop~\d{4}-\d{2}-\d{2}~3~\d{4}-\d{2}-\d{2}~2"\}$/);
  // La même heure encore : pas de deuxième mail.
  creerX(educ, 'Absences', { Title: 'MARTIN (sport)', DateAbs: `${lundi}T12:00:00Z`, DeH: 2, AH: 2 });
  assert.equal(mailsEnvoyes.length, 1);
});

test('une suggestion arrive dans l’onglet Suggestions et chez l’admin, jamais chez les autres', () => {
  mailsEnvoyes.length = 0;
  const r = creerX(prof, 'Suggestions', { Title: 'Un mode sombre plus contrasté', Type: 'Idée' });
  assert.equal(r.status, 201);
  assert.equal(classeur.Suggestions.length, 2);
  assert.equal(mailsEnvoyes[0].to, 'admin@ecole.example');
  assert.match(mailsEnvoyes[0].subject, /idée de Lambert/);
  assert.deepEqual(lire(educ).listes.Suggestions.lignes, []);
  // Personne ne les modifie ni ne les supprime depuis l'app.
  assert.equal(appeler({ action: 'supprimer', cle: CLE, mail: educ, liste: 'Suggestions', id: r.item.id }).status, 403);
});

// ---------- Reprises de la version 1.3.0 ----------

const appel = (mail: string, action: string, autres: Record<string, unknown>) => appeler({ action, cle: CLE, mail, ...autres });

test('une plage d’heures se réserve en une fois, ou pas du tout', () => {
  const base = { Title: 'LAMBERT', DateRes: `${J(11)}T12:00:00Z`, Heure: 2, Local: 'BC201', Classe: '5TQB' };
  const r = appel(prof, 'reserverPlage', { liste: 'Réservations', fields: base, fin: 4 });
  assert.equal(r.status, 201);
  assert.equal(r.ids.length, 3);
  // H3 est prise : H1 → H3 est refusée entièrement (rien n'est écrit).
  const avant = classeur.Réservations.length;
  const r2 = appel(educ, 'reserverPlage', { liste: 'Réservations', fields: { ...base, Title: 'MARTIN (math)', Heure: 1 }, fin: 3 });
  assert.equal(r2.status, 409);
  assert.match(r2.erreur, /H2/);
  assert.equal(classeur.Réservations.length, avant);
});

test('matériel : le dernier exemplaire ne part qu’une fois', () => {
  const m = (h: number) => ({ Title: 'LAMBERT', DateRes: `${J(11)}T12:00:00Z`, Heure: h, Rack: 'Rack tablettes A', Classe: '5TQB' });
  assert.equal(appel(prof, 'reserverPlage', { liste: 'Materiel', fields: m(5), fin: 5 }).status, 201);
  assert.equal(appel(educ, 'reserverPlage', { liste: 'Materiel', fields: { ...m(5), Title: 'MARTIN (math)' }, fin: 5 }).status, 409);
  // 3 vidéoprojecteurs : 3 réservations passent, la 4e non.
  const v = { ...m(6), Rack: 'Vidéoprojecteur mobile' };
  for (let i = 0; i < 3; i++) assert.equal(appel(educ, 'reserverPlage', { liste: 'Materiel', fields: { ...v, Title: 'MARTIN (math)' }, fin: 6 }).status, 201);
  assert.equal(appel(educ, 'reserverPlage', { liste: 'Materiel', fields: { ...v, Title: 'MARTIN (math)' }, fin: 6 }).status, 409);
});

test('la décision de l’éducateur : en une fois, une seule fois, jamais par un prof', () => {
  const p = creerX(prof, 'Deplacements', { Title: 'MARTIN (math)', DateDep: J(12), HeureVide: 4, Classe: '3GA', Collegue: 'LAMBERT', HeureOrigine: 6, DateOrigine: J(12), Statut: 'En attente' });
  assert.equal(p.status, 201);
  assert.equal(appel(prof, 'deciderCours', { id: p.item.id, statut: 'Validé' }).status, 403);
  const decisions = classeur.Decisions.length;
  const ok = appel(educ, 'deciderCours', { id: p.item.id, etag: p.item.eTag, statut: 'Validé', commentaire: '', reservation: { Title: 'LAMBERT', DateRes: `${J(12)}T12:00:00Z`, Heure: 4, Local: 'BT101', Classe: '3GA' } });
  assert.equal(ok.status, 200);
  const e = classeur.Deplacements[0];
  const ligne = classeur.Deplacements.find((l) => l[e.indexOf('ID')] === p.item.id)!;
  assert.equal(ligne[e.indexOf('Statut')], 'Validé');
  assert.equal(classeur.Decisions.length, decisions + 1);
  assert.ok(classeur.Réservations.some((l) => l.includes('BT101')));
  // Déjà traitée : une seconde décision est refusée.
  assert.equal(appel(educ, 'deciderCours', { id: p.item.id, statut: 'Refusé', commentaire: 'non' }).status, 409);
});

test('décision refusée : rien n’est écrit si le nouveau local vient d’être pris', () => {
  const p = creerX(prof, 'Deplacements', { Title: 'MARTIN (math)', DateDep: J(13), HeureVide: 2, Classe: '3GA', Collegue: 'LAMBERT', HeureOrigine: 7, DateOrigine: J(13), Statut: 'En attente' });
  creerX(educ, 'Réservations', { Title: 'MARTIN (math)', DateRes: `${J(13)}T12:00:00Z`, Heure: 2, Local: 'BT102', Classe: '4GB' });
  const decisions = classeur.Decisions.length;
  const r = appel(educ, 'deciderCours', { id: p.item.id, statut: 'Validé', reservation: { Title: 'LAMBERT', DateRes: `${J(13)}T12:00:00Z`, Heure: 2, Local: 'BT102', Classe: '3GA' } });
  assert.equal(r.status, 409);
  const e = classeur.Deplacements[0];
  assert.equal(classeur.Deplacements.find((l) => l[e.indexOf('ID')] === p.item.id)![e.indexOf('Statut')], 'En attente');
  assert.equal(classeur.Decisions.length, decisions);
  // Refus : la ligne disparaît (comme Power Apps), le motif va dans Decisions.
  assert.equal(appel(educ, 'deciderCours', { id: p.item.id, statut: 'Refusé', commentaire: 'Local pris' }).status, 200);
  assert.ok(!classeur.Deplacements.some((l) => l[e.indexOf('ID')] === p.item.id));
  assert.equal(classeur.Decisions.length, decisions + 1);
});

test('cache : chaque morceau tient dans la limite en octets, accents compris', () => {
  const f = contexte as unknown as Record<string, (...a: unknown[]) => string[]>;
  const texte = 'é'.repeat(70000) + 'a'.repeat(30000) + '🙂'.repeat(10);
  const morceaux = f.morceauxUtf8(texte, 90000);
  assert.equal(morceaux.join(''), texte);
  assert.ok(morceaux.every((m) => Buffer.byteLength(m, 'utf8') <= 90000));
});

test('import : un nom corrigé une fois dans CorrespondancesImport est reconnu', () => {
  const f = contexte as unknown as Record<string, (...a: unknown[]) => unknown>;
  const profs = ['MARTIN (math)', 'MARTIN (sport)'];
  assert.equal(f.resoudreProf('Mrtn Jacques', 2, {}, profs, [], {}), '');
  assert.equal(f.resoudreProf('Mrtn Jacques', 2, {}, profs, [], { mrtnjacques: 'MARTIN (sport)' }), 'MARTIN (sport)');
});

test('notifications : quota du jour atteint, l’occasion reste en file', () => {
  const quota = (contexte as unknown as { MailApp: { getRemainingDailyQuota: () => number } }).MailApp;
  const avant = quota.getRemainingDailyQuota;
  quota.getRemainingDailyQuota = () => 3;
  const lundi = (() => { const d = new Date(); d.setDate(d.getDate() + 21 + ((8 - d.getDay()) % 7 || 7)); return iso(d); })();
  mailsEnvoyes.length = 0;
  creerX(educ, 'Absences', { Title: 'MARTIN (sport)', DateAbs: `${lundi}T12:00:00Z`, DeH: 1, AH: 9 });
  assert.equal(mailsEnvoyes.length, 0);
  const file = classeur.FileNotifications;
  assert.equal(file[file.length - 1][5], 'En attente');
  quota.getRemainingDailyQuota = avant;
  (contexte.distribuerNotifications as () => number)();
  assert.equal(mailsEnvoyes.length, 1);
  assert.equal(classeur.FileNotifications[file.length - 1][5], 'Transmise');
});

test('l’app réserve une plage en un seul appel (version Google)', async () => {
  let appels = 0;
  utiliserReglagesGoogle({ script: 'AKfycbxTESTTESTTESTTEST', cle: CLE }, async (url, corps) => {
    if (JSON.parse(corps).action === 'reserverPlage') appels++;
    return envoi(url, corps);
  }, prof);
  const ids = await enregistrerPlage({ prof: 'LAMBERT', date: J(14), h: 6, local: 'BF220', classe: '5TQB' }, 8);
  assert.equal(ids.length, 3);
  assert.equal(appels, 1);
});

// ---------- Charge : lignes récentes, « rien n'a changé » ----------

test('un prof ne reçoit que les lignes récentes ; la gestion reçoit tout', () => {
  // Une absence d'il y a un mois, une d'il y a 3 jours, tapées à la main.
  classeur.Absences.push(['', '', 'LAMBERT', J(-30), 1, 9, ''], ['', '', 'LAMBERT', J(-3), 1, 9, '']);
  (contexte.onEdit as () => void)();
  const dates = (r: any) => r.listes.Absences.lignes.map((l: unknown[]) => String(l[r.listes.Absences.cols.indexOf('DateAbs')]));
  const pourProf = dates(lire(prof));
  assert.ok(!pourProf.includes(J(-30)), 'pas l’absence du mois dernier');
  assert.ok(pourProf.includes(J(-3)));
  assert.ok(pourProf.includes(J(5)), 'l’avenir est là');
  assert.ok(dates(lire(educ)).includes(J(-30)), 'l’éducatrice garde l’historique');
  // L'horaire et les profs ne sont jamais coupés.
  assert.equal(lire(prof).listes.Horaires.lignes.length, classeur.Horaires.length - 1);
  // Un déplacement ancien dont le cours d'origine est encore à venir reste visible.
  const e = classeur.Deplacements[0];
  const vieux = e.map((h) => (h === 'Title' ? 'MARTIN (math)' : h === 'DateDep' ? J(-20) : h === 'DateOrigine' ? J(2) : h === 'Collegue' ? 'LAMBERT' : h === 'Statut' ? 'Validé' : h === 'ID' ? 'vieux-1' : h === 'Version' ? 1 : ''));
  const perdu = e.map((h) => (h === 'Title' ? 'MARTIN (math)' : h === 'DateDep' ? J(-20) : h === 'DateOrigine' ? J(-19) : h === 'Collegue' ? 'LAMBERT' : h === 'Statut' ? 'Validé' : h === 'ID' ? 'vieux-2' : h === 'Version' ? 1 : ''));
  classeur.Deplacements.push(vieux, perdu);
  (contexte.onEdit as () => void)();
  const r = lire(prof);
  const ids = r.listes.Deplacements.lignes.map((l: unknown[]) => String(l[r.listes.Deplacements.cols.indexOf('ID')]));
  assert.ok(ids.includes('vieux-1'));
  assert.ok(!ids.includes('vieux-2'));
});

test('« rien n’a changé » : l’app qui a déjà la bonne copie ne la reçoit plus', async () => {
  const premier = lire(prof);
  assert.ok(premier.jeton && premier.listes);
  const pareil = appeler({ action: 'lire', cle: CLE, mail: prof, connu: premier.jeton });
  assert.equal(pareil.inchange, true);
  assert.equal(pareil.listes, undefined);
  assert.equal(pareil.moi.nom, 'LAMBERT');
  // Le jeton d'un autre (l'éducatrice reçoit tout) ne vaut pas pour le prof.
  assert.notEqual(lire(educ).jeton, premier.jeton);
  assert.ok(appeler({ action: 'lire', cle: CLE, mail: prof, connu: lire(educ).jeton }).listes);
  // Le cache expire et le Sheet est relu sans que rien n'ait changé : toujours « rien n'a changé ».
  memoireCache.delete('d|n');
  assert.equal(appeler({ action: 'lire', cle: CLE, mail: prof, connu: premier.jeton }).inchange, true);
  // Une écriture : la copie complète revient, avec un nouveau jeton.
  const cree = creerX(prof, 'Réservations', { Title: 'LAMBERT', DateRes: J(3), Heure: 2, Local: 'BF110', Classe: '5TQB' });
  assert.equal(cree.status, 201);
  const apres = appeler({ action: 'lire', cle: CLE, mail: prof, connu: premier.jeton });
  assert.ok(apres.listes && apres.jeton !== premier.jeton);

  // Dans l'app : deux lectures de suite, la deuxième ne transporte plus les listes.
  let recues = 0;
  const compter = async (url: string, corps: string) => {
    const r = await envoi(url, corps);
    if (JSON.parse(corps).action === 'lire' && r.listes) recues++;
    return r;
  };
  utiliserReglagesGoogle({ script: 'AKfycbxTESTTESTTESTTEST', cle: CLE }, compter, prof);
  const moi = await profil();
  const un = await chargerSharePoint(moi.email, moi.prenom);
  await new Promise((ok) => setTimeout(ok, 4100)); // la copie de l'app a plus de quelques secondes
  const deux = await chargerSharePoint(moi.email, moi.prenom);
  assert.equal(recues, 1, 'les listes n’ont voyagé qu’une fois');
  assert.deepEqual(deux.reservations, un.reservations);
  assert.equal(deux.cours.length, un.cours.length);
});

// ---------- Rôles : seulement depuis un appareil approuvé ----------

test('un rôle ne vaut que depuis un appareil approuvé (onglet Appareils)', async () => {
  // Le même script, avec la règle allumée (comme en vrai), sur le même classeur.
  const strict = vm.createContext({ ...contexte });
  vm.runInContext(readFileSync(new URL('../google/Code.gs', import.meta.url), 'utf8').replace('__CLE__', CLE).replace("const ADMIN_SUGGESTIONS = '';", "const ADMIN_SUGGESTIONS = 'admin@ecole.example';"), strict);
  const poster = strict.doPost as (e: unknown) => string;
  const dire = (o: Record<string, unknown>) => JSON.parse(poster({ postData: { contents: JSON.stringify({ cle: CLE, ...o }) } }));
  const direction = 'direction@ecole.example';
  // Avant la règle, le journal existait déjà (3 colonnes) avec l'appareil habituel de la direction.
  classeur.Appareils = [['Mail', 'Appareil', 'Vu la première fois'], [direction, 'ancien-appareil', '2026-11-03T08:00:00Z']];
  mailsEnvoyes.length = 0;

  // L'appareil déjà connu est approuvé d'office : rien ne change pour elle.
  const connu = dire({ action: 'lire', mail: direction, appareil: 'ancien-appareil' });
  assert.deepEqual(connu.moi.roles, ['Direction']);
  assert.deepEqual(classeur.Appareils[0], ['Mail', 'Appareil', 'Vu la première fois', 'Approuvé']);
  assert.equal(classeur.Appareils[1][3], 'Oui');
  assert.equal(dire({ action: 'creer', mail: direction, appareil: 'ancien-appareil', liste: 'Absences', fields: { Title: 'LAMBERT', DateAbs: J(7), DeH: 1, AH: 2 } }).status, 201);

  // Quelqu'un qui a la clé et connaît son adresse, depuis un autre appareil : pas de rôle, aucune liste, aucune écriture.
  const intrus = dire({ action: 'lire', mail: direction, appareil: 'appareil-inconnu' });
  assert.deepEqual(intrus.moi.roles, []);
  assert.equal(intrus.moi.appareilEnAttente, true);
  assert.equal(intrus.listes, undefined);
  assert.equal(dire({ action: 'creer', mail: direction, appareil: 'appareil-inconnu', liste: 'Absences', fields: { Title: 'LAMBERT', DateAbs: J(8), DeH: 1, AH: 2 } }).status, 403);
  assert.equal(dire({ action: 'creer', mail: direction, liste: 'Absences', fields: { Title: 'LAMBERT', DateAbs: J(8), DeH: 1, AH: 2 } }).status, 403, 'sans appareil : pas de rôle non plus');
  // L'appareil est noté, pas approuvé ; la personne qui gère l'app est prévenue une seule fois.
  const ligne = classeur.Appareils.find((l) => l[1] === 'appareil-inconnu')!;
  assert.equal(ligne[0], direction);
  assert.equal(ligne[3], '');
  dire({ action: 'lire', mail: direction, appareil: 'appareil-inconnu' });
  const alertes = mailsEnvoyes.filter((m) => m.subject === 'IPES App · appareil à approuver');
  assert.equal(alertes.length, 1);
  assert.equal(alertes[0].to, 'admin@ecole.example');
  assert.match(alertes[0].body, /direction@ecole\.example/);

  // Un prof qui a aussi un rôle garde son horaire ; seul le rôle attend.
  classeur.Roles.push([prof, 'Secrétariat']);
  (strict.onEdit as () => void)();
  const profRole = dire({ action: 'lire', mail: prof, appareil: 'tel-du-prof' });
  assert.equal(profRole.moi.nom, 'LAMBERT');
  assert.deepEqual(profRole.moi.roles, []);
  assert.equal(profRole.moi.appareilEnAttente, true);
  assert.ok(profRole.listes.Horaires.lignes.length > 0);
  assert.equal(profRole.listes.Roles.lignes.length, 0);
  assert.equal(dire({ action: 'creer', mail: prof, appareil: 'tel-du-prof', liste: 'Absences', fields: { Title: 'MARTIN (math)', DateAbs: J(9), DeH: 1, AH: 2 } }).status, 403);

  // « Oui » dans la colonne Approuvé : le rôle vaut tout de suite sur cet appareil, et seulement celui-là.
  classeur.Appareils.find((l) => l[1] === 'tel-du-prof')![3] = 'Oui';
  (strict.onEdit as () => void)();
  assert.deepEqual(dire({ action: 'lire', mail: prof, appareil: 'tel-du-prof' }).moi.roles, ['Secrétariat']);
  assert.equal(dire({ action: 'creer', mail: prof, appareil: 'tel-du-prof', liste: 'Absences', fields: { Title: 'MARTIN (math)', DateAbs: J(9), DeH: 1, AH: 2 } }).status, 201);
  assert.deepEqual(dire({ action: 'lire', mail: prof, appareil: 'autre-tel' }).moi.roles, []);
  // Approbation retirée : le rôle tombe.
  classeur.Appareils.find((l) => l[1] === 'tel-du-prof')![3] = '';
  (strict.onEdit as () => void)();
  assert.deepEqual(dire({ action: 'lire', mail: prof, appareil: 'tel-du-prof' }).moi.roles, []);

  // Dans l'app : la direction sur un appareil pas approuvé voit l'écran d'attente, pas « Qui es-tu ? ».
  classeur.Roles.pop();
  (strict.onEdit as () => void)();
  utiliserReglagesGoogle({ script: 'AKfycbxTESTTESTTESTTEST', cle: CLE }, async (_u: string, corps: string) => JSON.parse(poster({ postData: { contents: corps } })), direction);
  const moi = await profil();
  await assert.rejects(() => chargerSharePoint(moi.email, moi.prenom), /approuvé/);
  assert.equal(appareilEnAttente(), 'bloque');
  assert.equal(choixEnAttente(), null);
});

test('réglages privés dans un second fichier (PRIVE) : ils passent avant ceux du modèle', () => {
  const autre = vm.createContext({ ...contexte, PRIVE: { CLE: 'une-autre-cle-privee-123456', ADMIN_SUGGESTIONS: 'chef@ecole.example' } });
  vm.runInContext(readFileSync(new URL('../google/Code.gs', import.meta.url), 'utf8'), autre);
  const poster = autre.doPost as (e: unknown) => string;
  const dire = (o: Record<string, unknown>) => JSON.parse(poster({ postData: { contents: JSON.stringify(o) } }));
  // Le modèle public tel quel, sans clé écrite dedans : c'est celle de PRIVE qui vaut.
  assert.equal(dire({ action: 'lire', cle: 'une-autre-cle-privee-123456', mail: prof, appareil: 'x' }).status, 200);
  assert.equal(dire({ action: 'lire', cle: CLE, mail: prof }).status, 401);
  // Sans PRIVE ni clé : le script ne répond à personne.
  const nu = vm.createContext({ ...contexte });
  vm.runInContext(readFileSync(new URL('../google/Code.gs', import.meta.url), 'utf8'), nu);
  assert.equal(JSON.parse((nu.doPost as (e: unknown) => string)({ postData: { contents: JSON.stringify({ action: 'lire', cle: '__CLE__', mail: prof }) } })).status, 503);
  assert.match(JSON.parse((nu.doGet as () => string)()).version, /^\d{4}-\d{2}-\d{2}$/);
  // L'adresse …/exec dit si la clé est en place, sans la montrer.
  assert.equal(JSON.parse((nu.doGet as () => string)()).configure, false);
  assert.equal(JSON.parse((autre.doGet as () => string)()).configure, true);
  assert.ok(!(autre.doGet as () => string)().includes('une-autre-cle'));
});
