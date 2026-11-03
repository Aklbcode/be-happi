// « À l'école aujourd'hui » : dates importantes, sorties regroupées, profs absents quand ils sont plusieurs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Dataset } from '../src/data/types';
import { aLEcole } from '../src/logic/ecole';

const base: Dataset = {
  moi: { nom: 'MOI', prenom: 'Test' }, cours: [], reservations: [], deplacements: [], infos: [], locaux: [], signalements: [], decisions: [], journal: true,
  coursEleves: [], profs: [], changements: [], materiel: [], absentes: [],
  absences: [{ prof: 'B', date: '2026-11-05', deH: 1, aH: 9 }, { prof: 'A', date: '2026-11-05', deH: 2, aH: 4 }, { prof: 'C', date: '2026-11-06', deH: 1, aH: 9 }],
  stages: [
    { classe: '6GB', du: '2026-11-04', au: '2026-11-06', titre: 'Rotterdam' },
    { classe: '6GA', du: '2026-11-04', au: '2026-11-06', titre: 'Rotterdam' },
    { classe: '6TQEDA', du: '2026-11-02', au: '2026-11-13', titre: 'Stage' },
  ],
  agenda: [
    { du: '2026-11-05', au: '2026-11-05', titre: 'Conseil', heure: '16h' },
    { du: '2026-11-10', au: '2026-11-10', titre: 'Réunion de parents' },
    { du: '2026-12-30', au: '2026-12-30', titre: 'Trop loin' },
  ],
};

test('le jour même : la date, la sortie (classes groupées), les profs absents', () => {
  const e = aLEcole(base, '2026-11-05');
  assert.deepEqual(e.aujourdhui.map((x) => x.titre), ['Conseil']);
  assert.deepEqual(e.sorties, [{ titre: 'Rotterdam', classes: ['6GA', '6GB'], au: '2026-11-06' }]);
  assert.deepEqual(e.absents, ['A', 'B']);
  assert.deepEqual(e.bientot.map((x) => x.titre), ['Réunion de parents']);
});

test('un seul prof absent ne fait pas une info ; un stage n’est pas une sortie', () => {
  const e = aLEcole(base, '2026-11-06');
  assert.deepEqual(e.absents, []);
  assert.deepEqual(e.sorties.map((s) => s.titre), ['Rotterdam']);
  assert.deepEqual(aLEcole(base, '2026-11-12').sorties, []);
});
