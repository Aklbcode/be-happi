// Version Google Sheets : le vrai script (google/Code.gs) tourne ici sur un faux classeur, et l'app
// le lit par son faux Microsoft Graph. On vérifie la clé, la reconnaissance du prof, le choix du nom,
// les dates tapées à la main, les écritures et la protection contre les modifications croisées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { iso, plusJours } from '../src/lib/calendar';
import { lireParametre, utiliserReglagesGoogle, choixEnAttente, associer, chercherNom } from '../src/data/google';
import { chargerSharePoint, enregistrerReservation, modifierSeance, profil } from '../src/data/sharepoint';

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
    }),
    appendRow: (l: Cellule[]) => d.push(l),
    deleteRow: (r: number) => d.splice(r - 1, 1),
  };
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0');
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
  SpreadsheetApp: { getActive: () => ({ getSheetByName: (n: string) => (classeur[n] ? feuille(n) : null), getSpreadsheetTimeZone: () => 'Europe/Brussels' }) },
  ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
  LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
  CacheService: { getScriptCache: () => cache },
  Utilities: {
    getUuid: () => `${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`,
    // Le test tourne à l'heure locale de la machine : assez pour des dates à minuit.
    formatDate: (d: Date, _tz: string, f: string) => {
      const date = `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
      const heure = `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}:${deuxChiffres(d.getSeconds())}`;
      return f === 'HH:mm:ss' ? heure : f === 'yyyy-MM-dd' ? date : `${date}T${heure}+01:00`;
    },
  },
});
vm.runInContext(readFileSync(new URL('../google/Code.gs', import.meta.url), 'utf8').replace('__CLE__', CLE), contexte);
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
