// Pulse : états du plan, ligne de pouls, trajets et fil, sur la démo (données inventées).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datasetDemo, momentDemo } from '../src/data/demo';
import { iso, plusJoursIso } from '../src/lib/calendar';
import { etatLocal } from '../src/logic/occupation';
import { coursSansProf } from '../src/logic/horaire';
import { blocsPlan, codeCourt, etatPlan, filA, heureDe, momentDe, nomCourt, pouls, trajetClasse, trajetProf } from '../src/pulse/etat';

const moment = momentDemo(new Date());
const ds = datasetDemo(moment);
const lundi = iso(moment);

test('Plan : un état par local, cohérent avec l’écran Locaux de Be Happi', () => {
  for (let h = 1; h <= 9; h++) {
    const plan = etatPlan(ds, ds.moi.nom, lundi, h);
    assert.equal(plan.size, ds.locaux.length);
    for (const l of ds.locaux) {
      const a = plan.get(l.code)!;
      const b = etatLocal(ds, ds.moi.nom, l.code, lundi, h);
      if (b.etat === 'indispo') assert.equal(a.etat, 'ferme', `${l.code} H${h}`);
      else if (b.etat === 'libre') assert.ok(a.etat === 'libre' || a.etat === 'etude', `${l.code} H${h} : ${a.etat}`);
      else assert.ok(['occupe', 'moi', 'changement'].includes(a.etat), `${l.code} H${h} : ${a.etat}`);
    }
  }
});

test('Plan : une classe sans prof marque son local « étude » (jaune)', () => {
  let vus = 0;
  for (let n = 0; n < 5; n++) {
    const date = plusJoursIso(lundi, n);
    for (let h = 1; h <= 9; h++) {
      const plan = etatPlan(ds, '', date, h);
      for (const c of coursSansProf(ds, date, h)) {
        const e = plan.get(c.local);
        if (!e || e.etat === 'ferme' || e.etat === 'changement' || e.etat === 'occupe') continue;
        assert.equal(e.etat, 'etude', `${c.local} ${date} H${h}`);
        vus++;
      }
    }
  }
  assert.ok(vus > 0, 'la démo a des classes à l’étude');
});

test('Pouls : neuf heures, les pics = classes sans prof ; congé = ligne plate', () => {
  const p = pouls(ds, lundi);
  assert.equal(p.length, 9);
  p.forEach((x) => assert.equal(x.etudes, coursSansProf(ds, lundi, x.h).length));
  assert.ok(p.some((x) => x.libres > 0));
  assert.ok(pouls(ds, '2026-12-25').every((x) => x.etudes === 0 && x.libres === 0));
  assert.ok([...etatPlan(ds, '', '2026-12-25', 3).values()].every((c) => c.etat === 'conge'));
});

test('Trajets : dans l’ordre des heures, dans des locaux connus', () => {
  const codes = new Set(ds.locaux.map((l) => l.code));
  const t = trajetProf(ds, ds.moi.nom, lundi);
  assert.ok(t.length > 0);
  t.forEach((e, i) => {
    if (i) assert.ok(e.h > t[i - 1].h);
    assert.ok(codes.has(e.local), e.local);
  });
  const classe = ds.cours.find((c) => c.prof === ds.moi.nom)!.classes[0];
  assert.ok(trajetClasse(ds, classe, lundi).length > 0);
});

test('Fil : études, absents, locaux libres', () => {
  const h = coursSansProf(ds, lundi, 4).length ? 4 : 3;
  const f = filA(ds, lundi, h, etatPlan(ds, '', lundi, h));
  assert.equal(f.etudes.length, coursSansProf(ds, lundi, h).length);
  assert.ok(f.libres.length > 0);
  if (f.etudes.length) assert.ok(f.absents.length > 0);
});

test('Plan des bâtiments, codes et moments de la journée', () => {
  const b = blocsPlan(ds.locaux);
  assert.deepEqual(b.map((x) => x.sigle), ['PR', 'BC', 'BF', 'BT', '+']);
  assert.equal(b.flatMap((x) => x.etages.flatMap((e) => e.locaux)).length, ds.locaux.length);
  assert.deepEqual(b.find((x) => x.sigle === 'BF')!.etages.map((e) => e.etage), [2, 1, 0]);
  assert.equal(codeCourt('BF108'), '108');
  assert.equal(codeCourt('BC010A'), '010A');
  assert.equal(codeCourt('Education Physique 01'), 'Sport 01');
  assert.equal(nomCourt('VAN DEN BOSCH'), 'Van Den Bosch');
  assert.equal(heureDe(600), 2);
  assert.equal(heureDe(612), 3, 'pendant la récré : l’heure suivante');
  assert.equal(heureDe(2000), 9);
  assert.equal(momentDe(612).texte, 'Récré, H3 à 10h25');
  assert.equal(momentDe(700).texte, 'H4');
  assert.equal(momentDe(1000).texte, 'Fin des cours');
});
