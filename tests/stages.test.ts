// Classes en stage : leurs cours sautent, le prof est libre, la classe n'est ni à l'étude ni disponible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cours, Dataset } from '../src/data/types';
import { LOCAUX } from '../src/data/locaux';
import { classeOccupee, classesDe, coursDuProf, coursSansProf, heuresDeLaClasse } from '../src/logic/horaire';
import { etatLocal } from '../src/logic/occupation';
import { positionClasse } from '../src/logic/ouest';

const LUNDI = '2026-11-16';
const c = (prof: string, jour: number, h: number, classe: string, local: string): Cours => ({ id: `${prof}-${jour}-${h}`, prof, jour, h, classe, classes: classesDe(classe), local, matiere: 'Cours' });

const ds: Dataset = {
  moi: { nom: 'MOI', prenom: 'Test' },
  cours: [c('MOI', 1, 2, '6A', 'BF108'), c('MOI', 1, 3, '6A, 6B', 'BF108'), c('MOI', 1, 4, '4C', 'BF108'), c('AUTRE', 1, 5, '6A', 'BC105')],
  absences: [{ prof: 'AUTRE', date: LUNDI, deH: 1, aH: 9 }],
  reservations: [], deplacements: [], infos: [], locaux: LOCAUX, signalements: [], decisions: [], journal: true,
  coursEleves: [], profs: [], changements: [], materiel: [], absentes: [],
  stages: [{ classe: '6A', du: '2026-11-16', au: '2026-11-27', titre: 'Stage' }],
};

test('le cours d’une classe en stage disparaît ; un groupe garde les autres classes', () => {
  const jour = coursDuProf(ds, 'MOI', LUNDI);
  assert.deepEqual(jour.map((x) => [x.h, x.classe]), [[3, '6B'], [4, '4C']]);
  // La semaine d'après, le stage est fini.
  assert.equal(coursDuProf(ds, 'MOI', '2026-11-30').length, 3);
});

test('une classe en stage n’a pas cours, n’est pas à l’étude et ne peut pas recevoir un cours', () => {
  assert.deepEqual(heuresDeLaClasse(ds, '6A', LUNDI), []);
  assert.equal(coursSansProf(ds, LUNDI, 5).length, 0);
  assert.equal(classeOccupee(ds, '6A', LUNDI, 6), true);
  assert.equal(positionClasse(ds, '6A', LUNDI, 2).texte, 'En stage (Stage)');
});

test('le local d’un cours en stage est libre', () => {
  assert.equal(etatLocal(ds, 'X', 'BF108', LUNDI, 2).etat, 'libre');
  assert.equal(etatLocal(ds, 'X', 'BF108', LUNDI, 3).etat, 'occupe');
});
