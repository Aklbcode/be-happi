import test from 'node:test';
import assert from 'node:assert/strict';
import { creneauInitial, reservationPossible } from '../src/lib/calendar';

test('après H9 les trois services ouvrent le prochain jour scolaire, y compris après un congé', () => {
  assert.deepEqual(creneauInitial(new Date(2026, 10, 3, 21)), { date: '2026-11-04', h: 1 });
  assert.deepEqual(creneauInitial(new Date(2026, 10, 10, 16, 25)), { date: '2026-11-12', h: 1 });
  assert.deepEqual(creneauInitial(new Date(2026, 10, 6, 21)), { date: '2026-11-09', h: 1 });
});
test('un lien de cours conserve sa date et son heure ; le passé est en lecture seule', () => {
  const maintenant = new Date(2026, 10, 3, 21);
  assert.deepEqual(creneauInitial(maintenant, new URLSearchParams({ date: '2026-11-04', h: '2' })), { date: '2026-11-04', h: 2 });
  assert.equal(reservationPossible(maintenant, '2026-11-03', 9), false);
  assert.equal(reservationPossible(maintenant, '2026-11-11', 2), false);
  assert.equal(reservationPossible(maintenant, '2026-11-04', 2), true);
});
