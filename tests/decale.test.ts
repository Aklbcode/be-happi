// Décale : le moteur qui combine les déplacements (données inventées de la démo, plus des cas faits main).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datasetDemo, momentDemo } from '../src/data/demo';
import type { Cours, Dataset } from '../src/data/types';
import { LOCAUX } from '../src/data/locaux';
import { dernierePeriodeFinie, iso, minutesDe, plusJoursIso, situation } from '../src/lib/calendar';
import { verifierDeplacement } from '../src/logic/deplacements';
import { scenarioDecale } from '../src/decale/demo';
import {
  PRIORITES_DEFAUT,
  accroche,
  effetJour,
  enDeplacements,
  heuresLiberees,
  horizon,
  journee,
  meilleursPlans,
  occasions,
  phrasesJour,
  pointsJour,
  pourquoiPas,
  semaines,
  titrePlan,
  verifierPlan,
} from '../src/decale/moteur';

const moment = momentDemo(new Date());
const ds = scenarioDecale(datasetDemo(moment), moment);
const aujourdhui = iso(moment);
const sit = situation(minutesDe(moment));
const heurePassee = sit.enCours ? sit.h : dernierePeriodeFinie(minutesDe(moment));
const moi = ds.moi.nom;
const jours = horizon(aujourdhui);
const occ = occasions(ds, moi, jours, aujourdhui, heurePassee);
const vendredi = plusJoursIso(aujourdhui, 4);

test('Journée : début, fin, fourches (H5 n’en est pas une)', () => {
  const j = journee([1, 3, 4, 6, 7, 8]);
  assert.equal(j.debut, 505);
  assert.equal(j.fin, 935);
  assert.deepEqual(j.fourches, [2]);
  assert.deepEqual(journee([]).fourches, []);
  // Les deux dernières heures parties : 110 minutes plus tôt.
  const e = effetJour('2026-11-13', j, journee([1, 2, 3, 4, 6]));
  assert.equal(e.soir, 110);
  assert.equal(e.matin, 0);
  assert.deepEqual(e.comblees, [2]);
  assert.ok(pointsJour(e, PRIORITES_DEFAUT) > 110);
  // Une journée qui s'allonge coûte plus qu'elle ne rapporte.
  const pire = effetJour('2026-11-12', journee([6, 7]), journee([3, 7]));
  assert.ok(pointsJour(pire, PRIORITES_DEFAUT) < 0);
  assert.ok(phrasesJour(pire).every((p) => p.signe === 'perte'));
  assert.match(phrasesJour(pire)[0].texte, /commences plus tôt : 10h25 au lieu de 12h55/);
});

test('Temps regardé : pendant un congé, Décale regarde la rentrée', () => {
  // Congé d'automne 2026 : du 19 au 30 octobre ; le 2 novembre est férié.
  const [s1, s2] = semaines('2026-10-21');
  assert.equal(s1, '2026-11-02');
  assert.equal(s2, '2026-11-09');
  const h = horizon('2026-10-21');
  assert.ok(!h.includes('2026-11-02'), 'Fête des morts');
  assert.ok(!h.includes('2026-11-11'), 'Armistice');
  assert.equal(h[0], '2026-11-03');
});

test('Plans : valides, sans doublon, jamais plus longs pour le prof', () => {
  const plans = meilleursPlans(ds, moi, occ);
  assert.ok(plans.length >= 2, `au moins deux plans (${plans.length})`);
  for (const p of plans) {
    assert.ok(p.pointsProf >= 0, `${titrePlan(p)} : le prof ne perd pas de temps`);
    assert.ok(!p.effets.some((e) => e.nouveau), 'aucun jour de cours en plus');
    const origines = p.deplacements.map((o) => `${o.dateO}|${o.hO}`);
    const cibles = p.deplacements.map((o) => `${o.date}|${o.h}`);
    assert.equal(new Set(origines).size, origines.length, 'un cours ne part qu’une fois');
    assert.equal(new Set(cibles).size, cibles.length, 'une heure n’accueille qu’un cours');
    assert.deepEqual(verifierPlan(ds, moi, p, aujourdhui, heurePassee), [], `${titrePlan(p)} passe les contrôles`);
    // Chaque déplacement, enregistré avec les autres, passe les contrôles de La Tour et Power Apps.
    const deps = enDeplacements(moi, p);
    for (const d of deps) {
      const avec = { ...ds, deplacements: [...ds.deplacements, ...deps] };
      assert.ok(verifierDeplacement(avec, d, aujourdhui, heurePassee).ok);
    }
    assert.ok(accroche(p).length > 10);
  }
  // Différents pour le prof : aucun plan n'est contenu dans un autre.
  for (const a of plans)
    for (const b of plans)
      if (a !== b) assert.ok(!a.deplacements.every((o) => b.deplacements.some((x) => x.cle === o.cle)), 'pas de sous-plan');
});

test('Plans : deux déplacements ensemble valent plus que la somme (les deux dernières heures du vendredi)', () => {
  const plans = meilleursPlans(ds, moi, occ);
  const paire = plans.find((p) => p.deplacements.some((o) => o.dateO === vendredi && o.hO === 7) && p.deplacements.some((o) => o.dateO === vendredi && o.hO === 8));
  assert.ok(paire, 'le plan qui avance H7 et H8 du vendredi est proposé');
  const ven = paire!.effets.find((e) => e.date === vendredi)!;
  assert.equal(ven.soir, 110, 'vendredi : fini à 13h45 au lieu de 15h35');
  // H7 seule ne change pas l'heure de fin du vendredi (H8 reste).
  const seule = occ.find((o) => o.dateO === vendredi && o.hO === 7)!;
  const p1 = meilleursPlans(ds, moi, [seule]);
  assert.ok(!p1.some((p) => p.effets.some((e) => e.date === vendredi && e.soir > 0)));
});

test('Priorités : « commencer plus tard » met en tête le plan qui libère le matin', () => {
  const plans = meilleursPlans(ds, moi, occ, { finTot: false, debutTard: true, fourches: false });
  const ven = plans[0].effets.find((e) => e.date === vendredi);
  assert.ok(ven && ven.matin > 0, titrePlan(plans[0]));
  const plansSoir = meilleursPlans(ds, moi, occ, { finTot: true, debutTard: false, fourches: true });
  assert.ok(plansSoir[0].effets.every((e) => e.matin <= 0) && plansSoir[0].effets.some((e) => e.soir > 0), titrePlan(plansSoir[0]));
});

test('Heures libérées : chacune dit si tu peux la prendre, et pourquoi', () => {
  const plans = meilleursPlans(ds, moi, occ);
  const hl = heuresLiberees(ds, moi, jours, aujourdhui, heurePassee, occ, plans[0]);
  const jeudi = plusJoursIso(aujourdhui, 3);
  const trouver = (date: string, h: number, classe: string) => hl.find((x) => x.date === date && x.h === h && x.classe === classe);
  assert.equal(trouver(jeudi, 2, '3TQB')?.etat, 'prise', 'reprise par un collègue');
  assert.match(trouver(jeudi, 2, '3TQB')!.raison!, /Willems/);
  assert.equal(trouver(vendredi, 1, '6TQA')?.etat, 'non');
  assert.match(trouver(vendredi, 1, '6TQA')!.raison!, /Tu as cours/);
  const jeudiH3 = trouver(jeudi, 3, '2SD');
  assert.equal(jeudiH3?.etat, 'possible');
  assert.match(jeudiH3!.raison!, /commences plus tôt/);
  assert.ok(hl.some((x) => x.etat === 'plan'));
  // Rien du passé, rien d'une classe que tu n'as pas.
  assert.ok(hl.every((x) => !(x.date === aujourdhui && x.h <= heurePassee)));
  assert.ok(!hl.some((x) => x.classe === '1CA'));
});

// Petit horaire fait main pour les règles fines.
function mini(cours: [string, number, number, string][], absences: [string, string, number, number][]): Dataset {
  const c: Cours[] = cours.map(([prof, jour, h, classe], i) => ({ id: `m${i}`, prof, jour, h, classe, classes: classe.split(',').map((x) => x.trim()), local: LOCAUX[i % 20].code, matiere: 'Test' }));
  return {
    moi: { nom: 'MOI', prenom: 'Toi' },
    cours: c,
    coursEleves: [],
    absences: absences.map(([prof, d, deH, aH], i) => ({ id: `a${i}`, prof, date: d, deH, aH })),
    reservations: [],
    deplacements: [],
    infos: [],
    locaux: LOCAUX,
    signalements: [],
    decisions: [],
    journal: true,
    profs: [],
    changements: [],
    materiel: [],
    absentes: [],
  };
}

test('Pourquoi pas : classes groupées, et cours déjà proposé', () => {
  // Lundi 9 novembre 2026 : l'heure libérée est pour 5GA et 5GD ensemble ; j'ai 5GA seule.
  const lundi = '2026-11-09';
  const d = mini(
    [
      ['ABS', 1, 3, '5GA, 5GD'],
      ['MOI', 1, 1, '5GA'],
      ['MOI', 1, 7, '5GA'],
    ],
    [['ABS', lundi, 1, 9]],
  );
  assert.match(pourquoiPas(d, 'MOI', ['5GA', '5GD'], lundi, 3, lundi, 0), /ensemble/);
  // Mon seul cours avec la 5GA, déjà proposé ailleurs.
  const d2 = mini(
    [
      ['ABS', 1, 3, '5GA'],
      ['ABS', 1, 4, '5GA'],
      ['MOI', 1, 1, '6X'],
      ['MOI', 1, 8, '5GA'],
    ],
    [['ABS', lundi, 1, 9]],
  );
  d2.deplacements.push({ absent: 'ABS', date: lundi, hVide: 3, classe: '5GA', prof: 'MOI', hOrigine: 8, dateOrigine: lundi, statut: 'En attente' });
  assert.match(pourquoiPas(d2, 'MOI', ['5GA'], lundi, 4, lundi, 0), /déjà proposé/);
  assert.match(pourquoiPas(d2, 'MOI', ['5GA'], lundi, 5, lundi, 0), /midi/);
});

test('Plans : jamais un jour de cours en plus, même pour des heures « gagnées » ailleurs', () => {
  // Mardi je n'ai pas cours ; une heure libérée mardi H3 avec ma classe, mon cours vendredi H8.
  const lundi = '2026-11-09';
  const mardi = '2026-11-10';
  const d = mini(
    [
      ['ABS', 2, 3, '4TA'],
      ['MOI', 5, 7, '4TB'],
      ['MOI', 5, 8, '4TA'],
    ],
    [['ABS', mardi, 1, 9]],
  );
  const o = occasions(d, 'MOI', [lundi, mardi, '2026-11-12', '2026-11-13'], lundi, 0);
  assert.equal(o.length, 1, 'l’occasion existe');
  assert.deepEqual(meilleursPlans(d, 'MOI', o), [], 'mais venir mardi pour finir 50 min plus tôt vendredi n’est pas un plan');
});

test('Plans : beaucoup d’occasions → recherche par paquets, toujours valide', () => {
  // Une semaine chargée : un collègue absent toute la semaine a mes classes dans mes fourches.
  const lundi = '2026-11-16';
  const cl = ['1A', '1B', '1C', '1D', '2A', '2B', '2C', '2D'];
  const cours: [string, number, number, string][] = [];
  for (let j = 1; j <= 5; j++) {
    const k = j - 1;
    const [a, b, c, d] = [cl[k % 8], cl[(k + 1) % 8], cl[(k + 2) % 8], cl[(k + 3) % 8]];
    cours.push(['MOI', j, 1, a], ['MOI', j, 3, b], ['MOI', j, 6, c], ['MOI', j, 8, d]);
    cours.push(['ABS', j, 2, d], ['ABS', j, 4, c], ['ABS', j, 7, b]);
  }
  const js = [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n));
  const d = mini(cours, js.map((x) => ['ABS', x, 1, 9] as [string, string, number, number]));
  const o = occasions(d, 'MOI', js, lundi, 0);
  assert.ok(o.length > 14, `assez d’occasions pour la recherche par paquets (${o.length})`);
  const plans = meilleursPlans(d, 'MOI', o);
  assert.ok(plans.length >= 1);
  for (const p of plans) {
    assert.deepEqual(verifierPlan(d, 'MOI', p, lundi, 0), []);
    assert.ok(p.pointsProf > 0);
  }
  assert.ok(plans[0].gain >= 110, `gain du meilleur plan : ${plans[0].gain} min`);
});

test('Plans : un jour libre peut valoir une fin plus tardive ailleurs (dit clairement)', () => {
  // Lundi 9 novembre 2026 : je finis à 12h05 ; jeudi, je n'ai qu'une heure (la 4TD en H6).
  const lundi = '2026-11-09';
  const jeudi = '2026-11-12';
  const d = mini(
    [
      ['MOI', 1, 1, '4TA'],
      ['MOI', 1, 2, '4TB'],
      ['MOI', 1, 4, '4TC'],
      ['MOI', 4, 6, '4TD'],
      ['ABS', 1, 6, '4TD'],
    ],
    [['ABS', lundi, 1, 9]],
  );
  const o = occasions(d, 'MOI', [lundi, jeudi], lundi, 0);
  const plans = meilleursPlans(d, 'MOI', o);
  assert.equal(plans.length, 1);
  const p = plans[0];
  assert.ok(p.effets.some((e) => e.date === jeudi && e.libre), 'jeudi libre');
  assert.equal(titrePlan(p), 'Jeudi libre');
  const textes = p.effets.flatMap(phrasesJour);
  assert.ok(textes.some((x) => x.signe === 'perte' && /Lundi, tu finis plus tard : 13h45 au lieu de 12h05/.test(x.texte)), 'le coût est dit');
});
