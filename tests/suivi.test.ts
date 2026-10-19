// Tests du suivi : ce que voit le prof, le journal et le bilan du jour de l'éducateur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cours, Dataset } from '../src/data/types';
import { LOCAUX } from '../src/data/locaux';
import { classesDe } from '../src/logic/horaire';
import { aPrevenir, bilanDuJour, journal, suiviDuProf } from '../src/logic/suivi';

const LUNDI = '2026-11-16';
const c = (prof: string, jour: number, h: number, classe: string, local: string): Cours => ({ id: `${prof}-${jour}-${h}`, prof, jour, h, classe, classes: classesDe(classe), local, matiere: 'Cours' });

function donnees(partiel: Partial<Dataset>): Dataset {
  return { moi: { nom: 'MOI', prenom: 'Test' }, cours: [], absences: [], reservations: [], deplacements: [], infos: [], locaux: LOCAUX, signalements: [], decisions: [], journal: true, coursEleves: [], profs: [], changements: [], materiel: [], absentes: [], ...partiel };
}

test('le prof voit ses propositions : en attente, validées à venir, refusées récemment avec le motif', () => {
  const ds = donnees({
    deplacements: [
      { id: '1', absent: 'X', date: LUNDI, hVide: 3, classe: '3A', prof: 'MOI', hOrigine: 6, dateOrigine: LUNDI, statut: 'En attente', creeLe: `${LUNDI}T07:00:00` },
      { id: '2', absent: 'Y', date: '2026-11-18', hVide: 2, classe: '4B', prof: 'MOI', hOrigine: 7, dateOrigine: '2026-11-19', statut: 'Validé', modifiePar: 'Éduc' },
      { id: '3', absent: 'Y', date: '2026-11-09', hVide: 2, classe: '4B', prof: 'MOI', hOrigine: 7, dateOrigine: '2026-11-10', statut: 'Validé' },
      { id: '4', absent: 'X', date: LUNDI, hVide: 3, classe: '6C', prof: 'AUTRE', hOrigine: 5, dateOrigine: LUNDI, statut: 'En attente' },
    ],
    decisions: [
      { statut: 'Refusé', commentaire: 'Contrôle prévu', classe: '3A', prof: 'MOI', absent: 'X', date: LUNDI, hVide: 4, dateOrigine: LUNDI, hOrigine: 7, par: 'Éduc', le: '2026-11-13T15:00:00' },
      { statut: 'Refusé', commentaire: 'Trop ancien', classe: '3A', prof: 'MOI', absent: 'X', date: '2026-10-01', hVide: 4, dateOrigine: '2026-10-01', hOrigine: 7, par: 'Éduc', le: '2026-10-01T15:00:00' },
    ],
  });
  const s = suiviDuProf(ds, 'MOI', LUNDI);
  assert.deepEqual(s.map((x) => x.statut), ['En attente', 'Refusé', 'Validé']);
  assert.equal(s[1].commentaire, 'Contrôle prévu');
  assert.equal(s[2].par, 'Éduc');
  assert.match(s[0].trajet, /^lun\. 16 H6 → lun\. 16 H3$/);
});

test('journal : les décisions de la liste, sinon les validations reconstituées', () => {
  const avec = donnees({ decisions: [
    { statut: 'Validé', commentaire: '', classe: '3A', prof: 'P', absent: 'X', date: LUNDI, hVide: 3, dateOrigine: LUNDI, hOrigine: 6, par: 'A', le: '2026-11-13T10:00:00' },
    { statut: 'Refusé', commentaire: 'non', classe: '4B', prof: 'P', absent: 'X', date: LUNDI, hVide: 3, dateOrigine: LUNDI, hOrigine: 7, par: 'B', le: '2026-11-14T10:00:00' },
  ] });
  assert.deepEqual(journal(avec, LUNDI).map((x) => x.par), ['B', 'A']);

  const sans = donnees({
    journal: false,
    deplacements: [{ id: '2', absent: 'Y', date: LUNDI, hVide: 2, classe: '4B', prof: 'P', hOrigine: 7, dateOrigine: '2026-11-19', statut: 'Validé', modifiePar: 'Éduc', modifieLe: '2026-11-13T16:00:00' }],
  });
  const j = journal(sans, LUNDI);
  assert.equal(j.length, 1);
  assert.equal(j[0].statut, 'Validé');
  assert.equal(j[0].par, 'Éduc');
});

test('bilan du jour : heures sans prof, récupérées ou à l’étude (sans motif d’absence)', () => {
  const ds = donnees({
    cours: [c('X', 1, 3, '3A, 3B', 'BC105'), c('X', 1, 4, '4B', 'BC105'), c('Z', 1, 3, '5C', 'BC106')],
    absences: [{ prof: 'X', date: LUNDI, deH: 1, aH: 9 }],
    deplacements: [{ absent: 'X', date: LUNDI, hVide: 3, classe: '3A', prof: 'P', hOrigine: 7, dateOrigine: LUNDI, statut: 'En attente' }],
    reservations: [{ prof: 'Q', date: LUNDI, h: 4, local: 'BC108', classe: '4B · remédiation', note: 'remédiation' }],
  });
  const b = bilanDuJour(ds, LUNDI);
  assert.deepEqual(b.absents, ['X']);
  assert.equal(b.heures.length, 3);
  assert.equal(b.recuperees, 2);
  assert.equal(b.aLEtude, 1);
  assert.deepEqual(b.heures.filter((x) => !x.recuperee).map((x) => x.classe), ['3B']);
});

test('qui prévenir : le prof seul en cas de refus ; élèves et collègues en cas de validation', () => {
  assert.equal(aPrevenir({ prof: 'DURANT', absent: 'X', classe: '3A' }, 'Refusé').length, 1);
  const v = aPrevenir({ prof: 'DURANT', absent: 'X', classe: '5A, 5B' }, 'Validé');
  assert.equal(v.length, 3);
  assert.equal(v[0].auto, true);
  assert.match(v[1].qui, /5A, 5B/);
});
