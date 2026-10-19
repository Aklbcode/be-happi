import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendrierIcs } from '../src/lib/ics';
import { bornes } from '../src/logic/collab';
import { evenementsProf } from '../src/logic/agenda';
import type { Cours, Dataset } from '../src/data/types';

const LUNDI = '2026-11-16';
const depuis = new Date(2026, 10, 16, 12);
const cours = (h: number, prof = 'MOI', jour = 1): Cours => ({
  id: `${prof}-${jour}-${h}`, prof, jour, h, classe: '3A', classes: ['3A'], matiere: 'Maths', local: 'BF110',
});
const donnees = (partiel: Partial<Dataset>): Dataset => ({
  moi: { nom: 'MOI', prenom: 'Camille' }, cours: [], coursEleves: [], absences: [],
  reservations: [], deplacements: [], infos: [], locaux: [], signalements: [], decisions: [],
  journal: false, profs: [], changements: [], materiel: [], absentes: [], ...partiel,
});

// Les mêmes instants doivent sortir, quel que soit le fuseau de l'appareil.
for (const fuseau of ['UTC', 'Europe/Brussels', 'America/New_York', 'Asia/Tokyo']) {
  test(`agenda et réunions : heures de Bruxelles depuis ${fuseau}`, () => {
    const precedent = process.env.TZ;
    process.env.TZ = fuseau;
    try {
      for (const [date, debut, fin] of [
        ['2026-11-16', '07:25', '11:05'],
        ['2027-06-07', '06:25', '10:05'],
        ['2026-10-23', '06:25', '10:05'],
        ['2026-10-26', '07:25', '11:05'],
        ['2027-03-26', '07:25', '11:05'],
        ['2027-03-29', '06:25', '10:05'],
      ]) {
        const b = bornes({ date, hDebut: 1, hFin: 4 });
        assert.equal(b.debut.toISOString(), `${date}T${debut}:00.000Z`);
        assert.equal(b.fin.toISOString(), `${date}T${fin}:00.000Z`);
        const ics = calendrierIcs('Horaire', [{ uid: 'cours', date, hDebut: 1, hFin: 4, titre: 'Cours' }]);
        assert.ok(ics.includes(`DTSTART:${date.replaceAll('-', '')}T${debut.replace(':', '')}00Z\r\n`));
        assert.ok(ics.includes(`DTEND:${date.replaceAll('-', '')}T${fin.replace(':', '')}00Z\r\n`));
      }
    } finally {
      if (precedent === undefined) delete process.env.TZ;
      else process.env.TZ = precedent;
    }
  });
}

test('agenda : tous les retours à la ligne restent dans le texte, accents et emoji conservés', () => {
  const titre = 'Labo\\Sciences; bio, chimie\rLigne 2\nLigne 3\r\nLigne 4';
  const description = 'É🧪'.repeat(60);
  const ics = calendrierIcs('École', [{ uid: 'cours', date: '2026-11-16', hDebut: 1, hFin: 1, titre, description }]);
  const deplie = ics.replace(/\r\n /g, '');
  assert.ok(deplie.includes('SUMMARY:Labo\\\\Sciences\\; bio\\, chimie\\nLigne 2\\nLigne 3\\nLigne 4\r\n'));
  assert.ok(deplie.includes(`DESCRIPTION:${description}\r\n`));
  for (const ligne of ics.split('\r\n')) {
    assert.ok(new TextEncoder().encode(ligne).length <= 75);
    assert.ok(!/[\r\n\uFFFD]/u.test(ligne));
  }
});

test('agenda prof : une absence partielle retire seulement les activités concernées', () => {
  const ds = donnees({
    cours: [cours(1), cours(2), cours(3, 'AUTRE')],
    absences: [{ prof: 'MOI', date: LUNDI, deH: 1, aH: 1 }],
    reservations: [{ prof: 'MOI', date: LUNDI, h: 1, local: 'BF201', classe: '3A · remédiation', note: 'remédiation' }],
  });
  const agenda = evenementsProf(ds, 'MOI', depuis, 1);
  assert.deepEqual(agenda.map((e) => [e.date, e.hDebut]), [[LUNDI, 2]]);
  assert.equal(agenda[0].titre, '3A · Maths');
});

test('agenda prof : seuls les déplacements validés remplacent les cours de départ', () => {
  const ds = donnees({
    cours: [cours(6), cours(8), cours(9), cours(3, 'ABSENT')],
    absences: [{ prof: 'ABSENT', date: LUNDI, deH: 1, aH: 9 }],
    deplacements: [
      { prof: 'MOI', absent: 'ABSENT', classe: '3A', date: LUNDI, hVide: 3, dateOrigine: LUNDI, hOrigine: 6, statut: 'Validé' },
      { prof: 'MOI', absent: 'ABSENT', classe: '3A', date: LUNDI, hVide: 4, dateOrigine: LUNDI, hOrigine: 8, statut: 'En attente' },
      { prof: 'MOI', absent: 'ABSENT', classe: '3A', date: LUNDI, hVide: 2, dateOrigine: LUNDI, hOrigine: 9, statut: 'Refusé' },
    ],
    reservations: [{ prof: 'MOI', date: LUNDI, h: 3, local: 'BF201', classe: '3A' }],
  });
  const agenda = evenementsProf(ds, 'MOI', depuis, 1);
  assert.deepEqual(agenda.map((e) => e.hDebut), [3, 8, 9]);
  assert.equal(agenda[0].lieu, 'BF201');
  assert.equal(agenda[0].description, 'Cours déplacé (validé)');
});

test('agenda prof : local changé, remédiations et réservations sans doublon', () => {
  const ds = donnees({
    cours: [cours(2)],
    reservations: [
      { prof: 'MOI', date: LUNDI, h: 2, local: 'BF201', classe: '3A' },
      { prof: 'MOI', date: LUNDI, h: 4, local: 'BF202', classe: '2A · remédiation', note: 'remédiation' },
      { prof: 'MOI', date: LUNDI, h: 5, local: 'BF203', classe: '—' },
      { prof: 'MOI', date: LUNDI, h: 6, local: 'BF204', classe: '2B · remédiation' },
      { prof: 'AUTRE', date: LUNDI, h: 7, local: 'BF205', classe: '3B' },
      { prof: 'MOI', date: '2026-11-23', h: 8, local: 'BF206', classe: '3B' },
    ],
  });
  const agenda = evenementsProf(ds, 'MOI', depuis, 1);
  assert.deepEqual(agenda.map((e) => [e.hDebut, e.titre, e.lieu]), [
    [2, '3A · Maths', 'BF201'],
    [4, 'Remédiation · 2A', 'BF202'],
    [5, 'Local réservé', 'BF203'],
    [6, 'Remédiation · 2B', 'BF204'],
  ]);
  assert.equal(new Set(agenda.map((e) => e.uid)).size, agenda.length);
});

test('agenda prof : week-ends, jours fériés et congés exclus, y compris les réservations', () => {
  const ds = donnees({
    cours: [1, 2, 3, 4, 5, 6, 7].map((j) => cours(1, 'MOI', j)),
    reservations: [
      { prof: 'MOI', date: '2026-11-11', h: 4, local: 'BF201', classe: '3A' },
      { prof: 'MOI', date: '2026-11-14', h: 4, local: 'BF201', classe: '3A' },
      { prof: 'MOI', date: '2026-10-19', h: 4, local: 'BF201', classe: '3A' },
    ],
  });
  assert.deepEqual(evenementsProf(ds, 'MOI', new Date(2026, 10, 9, 12), 1).map((e) => e.date), [
    '2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13',
  ]);
  assert.deepEqual(evenementsProf(ds, 'MOI', new Date(2026, 9, 19, 12), 1), []);
});
