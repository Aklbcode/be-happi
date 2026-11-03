// Version Google Sheets : le vrai script (google/Code.gs) tourne ici sur un faux classeur, et l'app
// le lit par son faux Microsoft Graph. On vérifie la clé, la reconnaissance du prof, le choix du nom,
// les dates tapées à la main, les écritures et la protection contre les modifications croisées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { iso, plusJours } from '../src/lib/calendar';
import { lireParametre, utiliserReglagesGoogle, choixEnAttente, associer } from '../src/data/google';
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
  Absences: [['ID', 'Version', 'Title', 'DateAbs', 'DeH', 'AH'], ['', '', 'MARTIN (math)', new Date(`${J(1)}T00:00:00`), 1, 9]],
  Réservations: [['ID', 'Version', 'Title', 'DateRes', 'Heure', 'Local', 'Classe']],
  CapReussite: [['ID', 'Version', 'Title', 'Eleve', 'DateCR', 'Heure', 'Matiere', 'Origine', 'Statut', 'Prof', 'Local']],
  Roles: [['Title', 'Role'], ['educ@ecole.example', 'Éducatrice']],
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
const contexte = vm.createContext({
  SpreadsheetApp: { getActive: () => ({ getSheetByName: (n: string) => (classeur[n] ? feuille(n) : null), getSpreadsheetTimeZone: () => 'Europe/Brussels' }) },
  ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
  LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
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

test('le script refuse une mauvaise clé et une adresse inconnue', () => {
  assert.equal(appeler({ action: 'lire', cle: 'faux', mail: 'luc.lambert@ecole.example' }).status, 401);
  assert.equal(appeler({ action: 'lire', cle: CLE, mail: 'eleve.x@ecole.example' }).status, 403);
  assert.equal(appeler({ action: 'lire', cle: CLE, mail: '' }).status, 401);
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
  assert.deepEqual(choixEnAttente()?.libres, ['MARTIN (math)', 'MARTIN (sport)']);
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
