// Tests de Cap Réussite : qui un prof peut prendre, ce que voit un élève, la feuille de prestations.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cours, Dataset, Reservation, SeanceCR } from '../src/data/types';
import { LOCAUX } from '../src/data/locaux';
import { classesDe, coursSansProf } from '../src/logic/horaire';
import { etudesEleve, famille, feuilleCsv, heuresEtude, nomEleve, occasionsProf, seances, texteReservation, totauxMois } from '../src/logic/capreussite';

const LUNDI = '2026-11-16';
const c = (prof: string, jour: number, h: number, classe: string, local: string, matiere: string): Cours => ({ id: `${prof}-${jour}-${h}`, prof, jour, h, classe, classes: classesDe(classe), local, matiere });

function donnees(partiel: Partial<Dataset> = {}): Dataset {
  return {
    moi: { nom: 'MOI', prenom: 'Test' },
    cours: [
      c('MOI', 1, 2, '3A', 'BF108', 'Sciences'), c('MOI', 1, 4, '3A', 'BF108', 'Sciences'),
      c('X', 1, 3, '3A', 'BC205', 'Mathématiques'), c('Y', 1, 3, '1B', 'BF211', 'Français'),
      c('Z', 1, 3, '2C', 'BT102', 'Histoire'),
    ],
    absences: [{ prof: 'X', date: LUNDI, deH: 1, aH: 9 }, { prof: 'Y', date: LUNDI, deH: 3, aH: 3 }],
    reservations: [], deplacements: [], infos: [], locaux: LOCAUX, signalements: [], decisions: [], journal: true,
    coursEleves: [], profs: [], changements: [], materiel: [], absentes: [],
    capReussite: [
      { id: 'a', classe: '3A', eleve: 'Ana P.', eleveMail: 'ana@x', date: LUNDI, h: 3, matiere: 'Sciences de base', origine: 'Élève', statut: 'Disponible' },
      { id: 'b', classe: '3A', eleve: 'Ben Q.', eleveMail: 'ben@x', date: LUNDI, h: 3, matiere: 'Français', origine: 'Élève', statut: 'Disponible' },
      { id: 'c', classe: '3A', eleve: 'Cléo R.', eleveMail: 'cleo@x', date: LUNDI, h: 3, matiere: 'Sciences', origine: 'Élève', statut: 'Annulée' },
    ],
    resultats: [
      { eleve: 'Dan S.', eleveMail: 'dan@x', classe: '3A', matiere: 'Sciences', echec: true },
      { eleve: 'Eva T.', eleveMail: 'eva@x', classe: '3A', matiere: 'Sciences', echec: false },
      { eleve: 'Fred U.', eleveMail: 'fred@x', classe: '3A', matiere: 'Mathématiques', echec: true },
      { eleve: 'Gus V.', eleveMail: 'gus@x', classe: '2C', matiere: 'Sciences', echec: true },
      // Déjà disponible dans une autre matière : pas proposé deux fois à la même heure.
      { eleve: 'Ben Q.', eleveMail: 'ben@x', classe: '3A', matiere: 'Sciences', echec: true },
    ],
    ...partiel,
  };
}

test('les familles de matières se rapprochent', () => {
  assert.equal(famille('Sciences de base'), famille('Formation scientifique'));
  assert.equal(famille('Maths'), famille('Mathématiques'));
  assert.notEqual(famille('Français'), famille('Sciences'));
});

test('le prof en fourche voit les élèves disponibles et en échec dans sa matière, et les classes à l’étude', () => {
  const ds = donnees();
  const os = occasionsProf(ds, 'MOI', LUNDI, 0, 1);
  assert.equal(os.length, 1);
  const o = os[0];
  assert.equal(o.h, 3);
  assert.deepEqual(o.demandes.map((d) => d.eleve), ['Ana P.']);
  assert.deepEqual(o.echecs.map((e) => e.resultat.eleve), ['Dan S.']);
  // Sa 3A d'abord ; la 1B aussi (un prof du DS peut prendre le DI) ; la 2C a cours.
  assert.deepEqual(o.classes.map((k) => k.classe), ['3A', '1B']);
  assert.equal(o.classes[0].mienne, true);
});

test('pas d’occasion pendant une heure passée, ni quand le prof a cours', () => {
  assert.equal(occasionsProf(donnees(), 'MOI', LUNDI, 3, 1).length, 0);
  const ds = donnees({ cours: [...donnees().cours, c('MOI', 1, 3, '4D', 'BF108', 'Sciences')] });
  assert.equal(occasionsProf(ds, 'MOI', LUNDI, 0, 1).length, 0);
});

test('des élèves seuls ne marquent pas leur classe reprise ; une classe entière, si', () => {
  const ds = donnees();
  const seul: Reservation = { prof: 'MOI', date: LUNDI, h: 3, local: 'BF108', classe: texteReservation(false, ['3A'], 2), note: 'remédiation' };
  assert.ok(coursSansProf({ ...ds, reservations: [seul] }, LUNDI, 3).some((k) => k.classes.includes('3A')));
  const classe: Reservation = { ...seul, classe: texteReservation(true, ['3A'], 0) };
  assert.ok(!coursSansProf({ ...ds, reservations: [classe] }, LUNDI, 3).some((k) => k.classes.includes('3A')));
});

test('l’élève ne connaît que les études publiées, et voit sa propre inscription', () => {
  const ds = donnees({
    cours: [],
    changements: [
      { date: LUNDI, h: 3, classe: '3A', type: 'Étude', titre: 'étude' },
      { date: LUNDI, h: 6, classe: '3A', type: 'Local', titre: 'local' },
    ],
  });
  assert.deepEqual(heuresEtude(ds, '3A', LUNDI, true), [3]);
  const e = etudesEleve(ds, '3A', 'ANA@x', LUNDI, 0);
  assert.equal(e.length, 1);
  assert.equal(e[0].moi?.id, 'a');
  assert.equal(etudesEleve(ds, '3A', 'cleo@x', LUNDI, 0)[0].moi, undefined);
});

test('la feuille de prestations se remplit avec les séances prises, sans noms d’élèves', () => {
  const prises: SeanceCR[] = [
    { classe: '3A', eleve: 'Ana P.', eleveMail: 'ana@x', date: '2026-11-09', h: 3, matiere: 'Sciences', origine: 'Élève', statut: 'Prise', prof: 'MOI', local: 'BF108' },
    { classe: '3A', eleve: 'Dan S.', eleveMail: 'dan@x', date: '2026-11-09', h: 3, matiere: 'Sciences', origine: 'Échec', statut: 'Prise', prof: 'MOI', local: 'BF108' },
    { classe: '1B', date: LUNDI, h: 6, matiere: 'Sciences', origine: 'Prof', statut: 'Prise', prof: 'MOI', local: 'BF108' },
  ];
  const ds = donnees({
    capReussite: prises,
    // Une remédiation réservée depuis l'accueil compte aussi.
    reservations: [{ prof: 'Y', date: '2026-11-10', h: 2, local: 'BF211', classe: '1B · remédiation', note: 'remédiation' }],
  });
  const s = seances(ds, LUNDI, 4);
  assert.equal(s.length, 3);
  const premiere = s[0];
  assert.equal(premiere.eleves.length, 2);
  assert.deepEqual(premiere.origines.sort(), ['Élève', 'Échec'].sort());
  const t = totauxMois(s, '2026-11');
  const moi = t.find((x) => x.prof === 'MOI')!;
  assert.equal(moi.faites, 1);
  assert.equal(moi.prevues, 1);
  assert.equal(moi.minutes, 50);
  assert.equal(moi.eleves, 2);
  const csv = feuilleCsv(s);
  assert.ok(!/Ana|Dan/.test(csv));
  assert.ok(csv.includes('classe entière'));
});

test('nom d’élève court d’après l’adresse', () => {
  assert.equal(nomEleve('Léa', 'lea.dupont@eleves.example'), 'Léa D.');
  assert.equal(nomEleve('Léa', 'lea@eleves.example'), 'Léa');
});
