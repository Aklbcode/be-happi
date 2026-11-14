// Le plan de l'école : le meilleur ensemble de déplacements pour toute l'école (données inventées).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cours, Dataset, Deplacement } from '../src/data/types';
import { datasetDemo, momentDemo } from '../src/data/demo';
import { dernierePeriodeFinie, iso, minutesDe, periode, plusJoursIso, situation } from '../src/lib/calendar';
import { absentA, classesDe, coursDuProf, heuresDeLaClasse } from '../src/logic/horaire';
import { optionsPour, probable, verifierDeplacement } from '../src/logic/deplacements';
import { essaisPlan, messagePlan, planEcole, textePlan, trajetPlan, type PlanEcole } from '../src/logic/planEcole';
import { absencesFictives, datasetVide, ecoleFictive, hasard } from './ecole-fictive';

const LUNDI = '2026-11-16'; // un lundi de cours, semaine complète
const j = (n: number) => plusJoursIso(LUNDI, n);

const c = (prof: string, jour: number, h: number, classe: string, local = 'BF201'): Cours => ({
  id: `${prof}-${jour}-${h}`,
  prof,
  jour,
  h,
  classe,
  classes: classesDe(classe),
  local,
  matiere: 'Cours',
});

/** Une classe qui a cours ces heures-là ce jour-là, chaque heure avec un prof « décor » différent. */
const decor = (classe: string, jour: number, heures: number[]): Cours[] => heures.map((h) => c(`D${classe}${jour}${h}`, jour, h, classe, 'BC105'));

const enDep = (m: { prof: string; option: { absent: string; date: string; h: number; classe: string; hO: number; dateO: string } }): Deplacement => ({
  absent: m.option.absent,
  date: m.option.date,
  hVide: m.option.h,
  classe: m.option.classe,
  prof: m.prof,
  hOrigine: m.option.hO,
  dateOrigine: m.option.dateO,
  statut: 'En attente',
});

/** Pour chaque classe touchée : les heures d'étude en plus (positif) ou en moins (négatif) avec ces déplacements. */
function etudesAjoutees(ds: Dataset, deps: Deplacement[]): [string, number][] {
  const etudes = (hs: number[]) => (hs.length ? Array.from({ length: 9 }, (_, i) => i + 1).filter((h) => h > Math.min(...hs) && h < Math.max(...hs) && h !== 5 && !hs.includes(h)).length : 0);
  const jours = new Map<string, Set<number>>();
  const de = (cl: string, date: string) => {
    const k = `${cl}|${date}`;
    let x = jours.get(k);
    if (!x) jours.set(k, (x = new Set(heuresDeLaClasse(ds, cl, date))));
    return x;
  };
  for (const d of deps)
    for (const cl of classesDe(d.classe)) {
      if (!absentA(ds, d.prof, d.dateOrigine, d.hOrigine)) de(cl, d.dateOrigine).delete(d.hOrigine);
      de(cl, d.date).add(d.hVide);
    }
  const parClasse = new Map<string, number>();
  for (const [k, apres] of jours) {
    const [cl, date] = k.split('|');
    parClasse.set(cl, (parClasse.get(cl) ?? 0) + etudes([...apres]) - etudes(heuresDeLaClasse(ds, cl, date)));
  }
  return [...parClasse];
}

/** Ce qui doit toujours être vrai d'un plan, quel qu'il soit. */
function verifierPlan(ds: Dataset, plan: PlanEcole, aujourdhui: string, heurePassee: number) {
  const deps = plan.mouvements.map(enDep);
  // Chaque déplacement passe les contrôles de l'app, les autres étant déjà proposés.
  deps.forEach((d, i) => {
    const v = verifierDeplacement({ ...ds, deplacements: [...ds.deplacements, ...deps.filter((_, k) => k !== i)] }, d, aujourdhui, heurePassee);
    assert.ok(v.ok, `${trajetPlan(plan.mouvements[i])} : ${v.controles.filter((x) => !x.ok).map((x) => x.detail ?? x.libelle).join(' ')}`);
  });
  // Une classe n'est pas prise deux fois à la même heure ; un cours ne part qu'une fois ; un prof n'arrive qu'une fois par heure.
  const vus = new Set<string>();
  const unique = (k: string) => {
    assert.ok(!vus.has(k), `en double : ${k}`);
    vus.add(k);
  };
  for (const m of plan.mouvements) {
    for (const cl of m.option.classes) unique(`classe ${cl} ${m.option.date} H${m.option.h}`);
    unique(`départ ${m.prof} ${m.option.dateO} H${m.option.hO}`);
    unique(`arrivée ${m.prof} ${m.option.date} H${m.option.h}`);
    assert.notEqual(m.option.h, 5, 'H5 n’est jamais une cible');
    assert.ok(plan.jours.includes(m.option.date), 'l’heure libérée est dans les jours demandés');
  }
  // Aucun prof n'y perd : pas de jour en plus, pas de journée plus longue, pas de fourche en plus.
  const duree = (hs: number[]) => (hs.length ? periode(Math.max(...hs)).fm - periode(Math.min(...hs)).dm : 0);
  const fourches = (hs: number[]) => hs.length ? Array.from({ length: 9 }, (_, i) => i + 1).filter((h) => h > Math.min(...hs) && h < Math.max(...hs) && h !== 5 && !hs.includes(h)) : [];
  for (const p of plan.profs) {
    const jours = new Set(p.mouvements.flatMap((m) => [m.option.date, m.option.dateO]));
    for (const d of jours) {
      const avant = coursDuProf(ds, p.prof, d, true).map((x) => x.h);
      const apres = new Set(avant);
      p.mouvements.filter((m) => m.option.dateO === d).forEach((m) => apres.delete(m.option.hO));
      p.mouvements.filter((m) => m.option.date === d).forEach((m) => apres.add(m.option.h));
      if (!apres.size) continue;
      assert.ok(avant.length > 0, `${p.prof} : pas de jour de cours en plus (${d})`);
      assert.ok(duree([...apres]) <= duree(avant), `${p.prof} : pas de journée plus longue (${d})`);
      assert.ok(fourches([...apres]).every((h) => fourches(avant).includes(h)), `${p.prof} : pas de fourche en plus (${d})`);
    }
    assert.ok(p.phrases.every((x) => x.signe !== 'perte'), `${p.prof} : aucune perte annoncée (${p.phrases.map((x) => x.texte).join(' / ')})`);
  }
  // Aucune classe n'a plus d'heures d'étude qu'avant (les heures sans cours entre son premier et son dernier cours).
  assert.deepEqual(etudesAjoutees(ds, plan.mouvements.map(enDep)).filter(([, n]) => n > 0), [], 'aucune classe avec plus d’étude');
  assert.equal(plan.bilan.etudes, 0 - etudesAjoutees(ds, plan.mouvements.map(enDep)).reduce((t, [, n]) => t + n, 0), 'études évitées');
  assert.equal(plan.restent.length, plan.bilan.sansProf - plan.bilan.reprises, 'ce qui reste = sans prof − repris');
  assert.ok(plan.bilan.sansEchange <= plan.bilan.reprises);
}

test('Plan : une heure libérée, deux profs intéressés → celui qui évite l’étude pour de bon', () => {
  // La 3A a cours lundi de H1 à H8. X est absent en H3. P a la 3A en H8 (la dernière heure de la
  // classe), Q en H6 (au milieu). Les deux y gagnent autant ; mais si Q avance son cours, la 3A a
  // étude en H6 à la place : rien de gagné pour elle.
  const cours = [
    ...decor('3A', 1, [1, 2, 4, 7]),
    c('X', 1, 3, '3A', 'BC105'),
    c('P', 1, 2, '4B'), c('P', 1, 8, '3A'),
    c('Q', 1, 2, '5C'), c('Q', 1, 6, '3A'),
  ];
  const ds = datasetVide({ cours, absences: [{ prof: 'X', date: LUNDI, deH: 3, aH: 3 }] });
  const plan = planEcole(ds, [LUNDI], LUNDI, 0);
  verifierPlan(ds, plan, LUNDI, 0);
  assert.equal(plan.mouvements.length, 1);
  const m = plan.mouvements[0];
  assert.equal(m.prof, 'P');
  assert.equal(trajetPlan(m), 'lun. 16 H8 → lun. 16 H3');
  assert.equal(m.local, 'BC105');
  assert.deepEqual(m.classes, [{ classe: '3A', texte: 'La 3A finit à 14h35 lundi au lieu de 15h35', signe: 'gain' }]);
  assert.deepEqual(plan.bilan, { sansProf: 1, reprises: 1, sansEchange: 1, etudes: 1, minutesProfs: 260, dominos: 0 });
  assert.equal(plan.restent.length, 0);
  assert.match(plan.profs[0].phrases[0].texte, /Lundi, tu finis à 11h15 au lieu de 15h35/);

  // Sans P : Q prend l'heure (il y gagne), et le plan dit que l'étude ne fait que changer de place.
  const sansP = datasetVide({ cours: cours.filter((x) => x.prof !== 'P').concat(decor('3A', 1, [8])), absences: ds.absences });
  const plan2 = planEcole(sansP, [LUNDI], LUNDI, 0);
  verifierPlan(sansP, plan2, LUNDI, 0);
  assert.equal(plan2.mouvements[0].prof, 'Q');
  assert.equal(plan2.mouvements[0].classes[0].signe, 'neutre');
  assert.match(plan2.mouvements[0].classes[0].texte, /aura une heure libre lundi en H6 à la place/);
  assert.equal(plan2.bilan.sansEchange, 0);
  assert.equal(plan2.bilan.etudes, 0, 'l’étude a seulement changé de place');
});

test('Plan : chacun pour soi laisserait une heure à l’étude ; le plan place les deux profs', () => {
  // Deux heures libérées pour la 3A : lundi H3 (X) et mardi H2 (Y).
  // P peut aller aux deux (son cours de jeudi H8) ; Q ne peut aller que lundi H3 (mardi H2, il a cours).
  // Dans son horaire, P voit d'abord lundi H3 ; s'il la prend, Q n'a plus rien et mardi H2 reste à l'étude.
  const cours = [
    ...decor('3A', 1, [1, 2, 4, 6]), ...decor('3A', 2, [1, 3, 4]), ...decor('3A', 4, [1, 2, 3, 4, 6]),
    c('X', 1, 3, '3A', 'BC105'), c('Y', 2, 2, '3A', 'BC106'),
    c('P', 1, 2, '4B'), c('P', 1, 4, '4B'), c('P', 2, 1, '4B'), c('P', 2, 3, '4B'), c('P', 4, 1, '4B'), c('P', 4, 8, '3A'),
    c('Q', 1, 2, '5C'), c('Q', 1, 4, '5C'), c('Q', 2, 2, '5C'), c('Q', 4, 1, '5C'), c('Q', 4, 7, '3A'),
  ];
  const ds = datasetVide({ cours, absences: [{ prof: 'X', date: LUNDI, deH: 3, aH: 3 }, { prof: 'Y', date: j(1), deH: 2, aH: 2 }] });
  // Chacun pour soi : le meilleur déplacement de P va vers lundi H3.
  const pourP = [...optionsPour(ds, 'P', LUNDI, 3, LUNDI, 0), ...optionsPour(ds, 'P', j(1), 2, LUNDI, 0)].filter(probable).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  assert.equal(pourP[0].date, LUNDI);

  const plan = planEcole(ds, [LUNDI, j(1)], LUNDI, 0);
  verifierPlan(ds, plan, LUNDI, 0);
  assert.equal(plan.exact, true);
  assert.deepEqual(plan.mouvements.map((m) => `${m.prof} ${trajetPlan(m)}`), ['Q jeu. 19 H7 → lun. 16 H3', 'P jeu. 19 H8 → mar. 17 H2']);
  assert.equal(plan.bilan.reprises, 2);
  // Les deux dernières heures de la 3A partent du jeudi : elle finit à 13h45, et c'est dit pour les deux.
  for (const m of plan.mouvements) assert.equal(m.classes[0].texte, 'La 3A finit à 13h45 jeudi au lieu de 15h35');
  assert.equal(plan.bilan.sansEchange, 2);
});

test('Plan : aucun prof n’y perd (journée plus longue, jour en plus, fourche en plus → pas proposé)', () => {
  const base = [...decor('3A', 1, [1, 2, 4, 6]), c('X', 1, 3, '3A', 'BC105')];
  const abs = [{ prof: 'X', date: LUNDI, deH: 3, aH: 3 }];
  // P n'a pas cours lundi : venir pour H3 serait un jour en plus.
  const jourEnPlus = datasetVide({ cours: [...base, c('P', 4, 8, '3A'), c('P', 4, 7, '4B')], absences: abs });
  // P commence lundi en H6 : H3 allongerait sa journée.
  const plusLongue = datasetVide({ cours: [...base, c('P', 1, 6, '4B'), c('P', 1, 7, '4B'), c('P', 4, 8, '3A'), c('P', 4, 7, '4B')], absences: abs });
  // P a la 3A jeudi au milieu de sa journée : la déplacer lui laisserait une fourche de plus.
  const fourche = datasetVide({ cours: [...base, c('P', 1, 2, '4B'), c('P', 1, 4, '4B'), c('P', 4, 1, '4B'), c('P', 4, 2, '3A'), c('P', 4, 3, '4B')], absences: abs });
  for (const ds of [jourEnPlus, plusLongue, fourche]) {
    const plan = planEcole(ds, [LUNDI], LUNDI, 0);
    verifierPlan(ds, plan, LUNDI, 0);
    assert.equal(plan.mouvements.length, 0);
    assert.deepEqual(plan.restent, [{ date: LUNDI, h: 3, classe: '3A', absent: 'X', etude: true }]);
    assert.equal(plan.bilan.sansProf, 1);
  }
  // Finir un peu plus tard pour commencer beaucoup plus tard : la journée raccourcit nettement, c'est proposé.
  // P a cours lundi en H1 (3A) et H7 ; X est absent en H8 avec la 3A : P viendrait de 13h45 à 15h35 au lieu de 8h25 à 14h35.
  const decalee = datasetVide({
    cours: [...decor('3A', 1, [2, 3, 4, 6, 7]), c('X', 1, 8, '3A', 'BC105'), c('P', 1, 1, '3A'), c('P', 1, 7, '4B')],
    absences: [{ prof: 'X', date: LUNDI, deH: 8, aH: 8 }],
  });
  const plan = planEcole(decalee, [LUNDI], LUNDI, 0);
  verifierPlan(decalee, plan, LUNDI, 0);
  assert.equal(plan.mouvements.length, 1);
  assert.equal(trajetPlan(plan.mouvements[0]), 'lun. 16 H1 → lun. 16 H8');
  assert.equal(plan.profs[0].phrases[0].texte, 'Lundi, tu es là de 13h45 à 15h35 au lieu de 8h25 à 14h35');
  assert.equal(plan.profs[0].gain, 260);
  // Une heure plus tard des deux côtés : rien de gagné, pas proposé.
  const glissee = datasetVide({
    cours: [...decor('3A', 1, [2, 3, 4, 6, 7]), c('X', 1, 8, '3A', 'BC105'), c('P', 1, 6, '3A'), c('P', 1, 7, '4B')],
    absences: [{ prof: 'X', date: LUNDI, deH: 8, aH: 8 }],
  });
  assert.equal(planEcole(glissee, [LUNDI], LUNDI, 0).mouvements.length, 0);
});

test('Plan : première ou dernière heure de la classe sans prof = licenciement, pas une étude', () => {
  // Lundi, la 3A a cours de H1 à H6 puis X en H7, sa dernière heure : X absent, elle est licenciée à 13h45.
  const base = [...decor('3A', 1, [1, 2, 3, 4, 6]), c('X', 1, 7, '3A', 'BC105'), c('P', 1, 6, '4B'), c('P', 1, 8, '4B'), c('P', 4, 6, '4B')];
  const abs = [{ prof: 'X', date: LUNDI, deH: 7, aH: 7 }];
  // P y gagnerait (il commence plus tard jeudi), mais son cours part du milieu du jeudi de la 3A :
  // elle resterait lundi au lieu de partir, et aurait une étude jeudi en plus. Pas proposé.
  const milieu = datasetVide({ cours: [...base, ...decor('3A', 4, [1, 2, 3, 6]), c('P', 4, 4, '3A')], absences: abs });
  const rien = planEcole(milieu, [LUNDI], LUNDI, 0);
  verifierPlan(milieu, rien, LUNDI, 0);
  assert.equal(rien.mouvements.length, 0);
  assert.deepEqual(rien.restent, [{ date: LUNDI, h: 7, classe: '3A', absent: 'X', etude: false }]);
  // Le même cours en dernière heure du jeudi de la 3A : elle reste lundi, elle part plus tôt jeudi. Aucune étude en plus, P y gagne.
  const bord = datasetVide({ cours: [...base, ...decor('3A', 4, [1, 2, 3, 4, 6]), c('P', 4, 7, '3A')], absences: abs });
  const plan = planEcole(bord, [LUNDI], LUNDI, 0);
  verifierPlan(bord, plan, LUNDI, 0);
  assert.equal(plan.mouvements.length, 1);
  assert.deepEqual(plan.mouvements[0].classes, [
    { classe: '3A', texte: 'La 3A finit à 13h45 jeudi au lieu de 14h35', signe: 'gain' },
    { classe: '3A', texte: 'La 3A a cours lundi en H7 au lieu d’être licenciée', signe: 'neutre' },
  ]);
  assert.equal(plan.bilan.etudes, 0);
  assert.equal(plan.bilan.reprises, 1);
  // Une heure sans prof au milieu de la journée reste une étude : la reprendre compte.
  const dedans = datasetVide({ cours: [...base, ...decor('3A', 1, [8]), ...decor('3A', 4, [1, 2, 3, 4, 6]), c('P', 4, 7, '3A')], absences: abs });
  const plan2 = planEcole(dedans, [LUNDI], LUNDI, 0);
  verifierPlan(dedans, plan2, LUNDI, 0);
  assert.equal(plan2.bilan.etudes, 1);
  assert.equal(plan2.mouvements[0].classes.length, 1);
});

test('Plan : un cours qui aurait été perdu est sauvé (son prof est absent ce jour-là)', () => {
  // P est absent jeudi (formation), où il a la 3A en H2. Lundi H3, X est absent avec la 3A et P est libre.
  const cours = [
    ...decor('3A', 1, [1, 2, 4, 6]), ...decor('3A', 4, [1, 3, 4]),
    c('X', 1, 3, '3A', 'BC105'),
    c('P', 1, 2, '4B'), c('P', 1, 4, '4B'), c('P', 4, 2, '3A'), c('P', 4, 3, '4B'),
  ];
  const ds = datasetVide({ cours, absences: [{ prof: 'X', date: LUNDI, deH: 3, aH: 3 }, { prof: 'P', date: j(3), deH: 1, aH: 9 }] });
  const plan = planEcole(ds, [LUNDI], LUNDI, 0);
  verifierPlan(ds, plan, LUNDI, 0);
  assert.equal(plan.mouvements.length, 1);
  assert.equal(plan.mouvements[0].sauve, true);
  assert.match(plan.mouvements[0].classes[0].texte, /Le cours de la 3A est sauvé : P est noté·e absent·e jeudi/);
  assert.equal(plan.bilan.sansEchange, 1);
});

test('Plan : ce qui est déjà proposé ou validé est respecté', () => {
  const cours = [
    ...decor('3A', 1, [1, 2, 4, 6]),
    c('X', 1, 3, '3A', 'BC105'),
    c('P', 1, 2, '4B'), c('P', 1, 8, '3A'),
    c('R', 1, 2, '5C'), c('R', 1, 7, '3A'),
  ];
  const deja: Deplacement = { id: 'd1', absent: 'X', date: LUNDI, hVide: 3, classe: '3A', prof: 'R', hOrigine: 7, dateOrigine: LUNDI, statut: 'En attente' };
  const ds = datasetVide({ cours, absences: [{ prof: 'X', date: LUNDI, deH: 3, aH: 3 }], deplacements: [deja] });
  const plan = planEcole(ds, [LUNDI], LUNDI, 0);
  assert.equal(plan.mouvements.length, 0);
  assert.equal(plan.bilan.sansProf, 0, 'l’heure est déjà reprise par R');
  // Heure déjà commencée : plus rien à proposer.
  const sans = datasetVide({ cours, absences: ds.absences });
  assert.equal(planEcole(sans, [LUNDI], LUNDI, 3).mouvements.length, 0);
  assert.equal(planEcole(sans, [LUNDI], LUNDI, 2).mouvements.length, 1);
});

test('Plan : domino signalé quand le cours part du milieu de la journée de la classe', () => {
  // Jeudi, la 3A a cours de H1 à H7. P a la 3A jeudi H3 (première heure de P) : s'il l'avance à lundi,
  // la 3A a étude jeudi H3. W, qui a la dernière heure de la 3A jeudi (H7), est libre en H3.
  const cours = [
    ...decor('3A', 1, [1, 2, 4, 6]), ...decor('3A', 4, [1, 2, 4, 6]),
    c('X', 1, 3, '3A', 'BC105'),
    c('P', 1, 2, '4B'), c('P', 1, 4, '4B'), c('P', 4, 3, '3A'), c('P', 4, 4, '4B'),
    c('W', 4, 6, '5C'), c('W', 4, 7, '3A'),
  ];
  const ds = datasetVide({ cours, absences: [{ prof: 'X', date: LUNDI, deH: 3, aH: 3 }], profs: [{ nom: 'P', email: 'p@ecole.example' }] });
  const plan = planEcole(ds, [LUNDI], LUNDI, 0);
  verifierPlan(ds, plan, LUNDI, 0);
  assert.equal(plan.mouvements.length, 1);
  const m = plan.mouvements[0];
  assert.equal(m.classes[0].signe, 'neutre');
  assert.equal(m.domino?.prof, 'W');
  assert.match(m.domino!.texte, /W peut avancer son cours de H7 en H3 : la 3A finirait à 13h45 au lieu de 14h35/);
  assert.equal(plan.bilan.dominos, 1);
  // Le message pour le prof : qui est absent, quel cours, ce qu'il y gagne, quoi faire.
  const message = messagePlan(plan.profs[0], LUNDI);
  assert.match(message, /X est absent·e aujourd’hui en H3 \(10h25\) avec la 3A : tu pourrais y avancer ton cours de jeudi 19 H3 \(local BC105\)\./);
  assert.match(message, /Jeudi, tu commences à 11h15 au lieu de 10h25\./);
  assert.match(message, /propose-le dans IPES App/);
  assert.equal(plan.profs[0].email, 'p@ecole.example');
  assert.match(textePlan(plan), /^P \(gagne 50 min\)\n {2}jeu\. 19 H3 → lun\. 16 H3 · 3A · BC105 · à la place de X$/);
});

test('Plan : classes groupées, exactement les mêmes classes', () => {
  const cours = [
    ...decor('5GA', 1, [1, 2, 4]), ...decor('5GD', 1, [1, 2, 4]),
    c('X', 1, 3, '5GA, 5GD', 'BC105'),
    c('P', 1, 2, '4B'), c('P', 1, 8, '5GA, 5GD'),
    c('Q', 1, 2, '4C'), c('Q', 1, 7, '5GA'),
  ];
  const ds = datasetVide({ cours, absences: [{ prof: 'X', date: LUNDI, deH: 3, aH: 3 }] });
  const plan = planEcole(ds, [LUNDI], LUNDI, 0);
  verifierPlan(ds, plan, LUNDI, 0);
  assert.deepEqual(plan.mouvements.map((m) => m.prof), ['P']);
  assert.deepEqual(plan.bilan.sansProf, 2);
  assert.deepEqual(plan.bilan.reprises, 2);
  assert.equal(plan.mouvements[0].classes.length, 2);
});

test('Plan : sur de petites écoles, la recherche trouve bien le meilleur plan (comparée à tous les plans possibles)', () => {
  let compares = 0;
  for (let graine = 1; graine <= 150 && compares < 25; graine++) {
    const ecole = ecoleFictive(graine, 12);
    // Un prof absent lundi en H2 et H3, un autre mardi en H7.
    const [a, b] = absencesFictives(ecole, LUNDI, 1, 2, graine);
    const ds: Dataset = { ...ecole, absences: [{ ...a, deH: 2, aH: 3 }, { ...b, date: j(1), deH: 7, aH: 7 }] };
    const jours = [LUNDI, j(1)];
    const { cles, valeur } = essaisPlan(ds, jours, LUNDI, 0);
    if (cles.length < 4 || cles.length > 15) continue;
    const plan = planEcole(ds, jours, LUNDI, 0);
    verifierPlan(ds, plan, LUNDI, 0);
    if (plan.ecartes) continue;
    // Tous les sous-ensembles de déplacements possibles.
    let max = 0;
    for (let masque = 1; masque < 1 << cles.length; masque++) {
      const v = valeur(cles.filter((_, i) => masque & (1 << i)));
      if (v !== null && v > max) max = v;
    }
    assert.equal(plan.points, Math.round(max), `école ${graine} : ${cles.length} déplacements possibles`);
    compares++;
  }
  assert.ok(compares >= 15, `${compares} écoles comparées`);
});

test('Plan : à la taille de l’école (2 000 heures de cours, 12 absents par jour, 2 jours), toujours valide, stable et rapide', () => {
  const ecole = ecoleFictive(3);
  assert.ok(ecole.cours.length > 1800);
  const ds: Dataset = { ...ecole, absences: [...absencesFictives(ecole, LUNDI, 1, 12, 3), ...absencesFictives(ecole, j(1), 2, 12, 14)] };
  const debut = performance.now();
  const plan = planEcole(ds, [LUNDI, j(1)], LUNDI, 0);
  const duree = performance.now() - debut;
  verifierPlan(ds, plan, LUNDI, 0);
  assert.ok(plan.bilan.reprises >= 20, `${plan.bilan.reprises} heures reprises`);
  assert.ok(duree < 5000, `${Math.round(duree)} ms`);
  // Mêmes données, même plan.
  assert.equal(textePlan(planEcole(ds, [LUNDI, j(1)], LUNDI, 0)), textePlan(plan));

  // Chacun pour soi : à tour de rôle (ordre tiré au sort), chaque prof prend son meilleur déplacement
  // « probable », comme dans son horaire. Le plan de l'école reprend au moins autant d'heures.
  const alea = hasard(5);
  const profs = [...new Set(ds.cours.map((x) => x.prof))].map((p) => ({ p, r: alea() })).sort((a, b) => a.r - b.r).map((x) => x.p);
  let seuls: Dataset = ds;
  for (let tour = 0; tour < 3; tour++)
    for (const prof of profs) {
      const options = [LUNDI, j(1)].flatMap((d) => [1, 2, 3, 4, 6, 7, 8, 9].flatMap((h) => optionsPour(seuls, prof, d, h, LUNDI, 0))).filter(probable).sort((a, b) => b.score - a.score);
      const o = options[0];
      if (o) seuls = { ...seuls, deplacements: [...seuls.deplacements, { absent: o.absent, date: o.date, hVide: o.h, classe: o.classe, prof, hOrigine: o.hO, dateOrigine: o.dateO, statut: 'En attente' }] };
    }
  // Chacun pour soi, des classes se retrouvent avec plus d'étude qu'avant ; avec le plan, aucune.
  const pires = etudesAjoutees(ds, seuls.deplacements).filter(([, n]) => n > 0);
  assert.ok(pires.length > 0, 'chacun pour soi ajoute de l’étude à des classes');
  const evitees = 0 - etudesAjoutees(ds, seuls.deplacements).reduce((t, [, n]) => t + n, 0);
  assert.ok(plan.bilan.etudes >= evitees, `études évitées : plan ${plan.bilan.etudes} ≥ chacun pour soi ${evitees}`);
});

test('Plan : des écoles et des absences tirées au sort → toujours valide, et jamais moins bien que chacun pour soi', () => {
  for (let graine = 1; graine <= 8; graine++) {
    const ecole = ecoleFictive(graine + 20, 30);
    const ds: Dataset = { ...ecole, absences: [...absencesFictives(ecole, LUNDI, 1, 5, graine), ...absencesFictives(ecole, j(1), 2, 5, graine + 50), ...absencesFictives(ecole, j(3), 4, 3, graine + 70)] };
    const jours = [LUNDI, j(1)];
    // Lundi, en cours de journée : H1 à H3 sont passées.
    const plan = planEcole(ds, jours, LUNDI, 3);
    verifierPlan(ds, plan, LUNDI, 3);
    assert.ok(plan.mouvements.every((m) => m.option.date > LUNDI || m.option.h > 3), 'rien vers une heure passée');
    assert.ok(plan.mouvements.every((m) => m.option.dateO > LUNDI || m.option.hO > 3), 'rien depuis une heure passée');
    const { cles, valeur } = essaisPlan(ds, jours, LUNDI, 3);
    // Chacun pour soi, un déplacement « probable » chacun, dans l'ordre des noms.
    let seuls: Dataset = ds;
    const pris: string[] = [];
    for (const prof of [...new Set(ds.cours.map((x) => x.prof))].sort()) {
      const o = jours.flatMap((d) => [1, 2, 3, 4, 6, 7, 8, 9].flatMap((h) => optionsPour(seuls, prof, d, h, LUNDI, 3))).filter(probable).sort((a, b) => b.score - a.score)[0];
      if (!o) continue;
      seuls = { ...seuls, deplacements: [...seuls.deplacements, { absent: o.absent, date: o.date, hVide: o.h, classe: o.classe, prof, hOrigine: o.hO, dateOrigine: o.dateO, statut: 'En attente' }] };
      pris.push(`${prof}|${o.cle}`);
    }
    const chacun = valeur(pris.filter((k) => cles.includes(k)));
    assert.ok(chacun === null || plan.points >= Math.round(chacun), `école ${graine} : plan ${plan.points} ≥ chacun pour soi ${chacun}`);
  }
});

test('Plan : sur la démo, tout ce qui est proposé passe les contrôles', () => {
  const moment = momentDemo(new Date());
  const ds = datasetDemo(moment);
  const aujourdhui = iso(moment);
  const sit = situation(minutesDe(moment));
  const heurePassee = sit.enCours ? sit.h : dernierePeriodeFinie(minutesDe(moment));
  const jours = [0, 1, 2, 3, 4].map((n) => plusJoursIso(aujourdhui, n));
  const plan = planEcole(ds, jours, aujourdhui, heurePassee);
  verifierPlan(ds, plan, aujourdhui, heurePassee);
  assert.ok(plan.mouvements.length >= 1, 'la démo a au moins un déplacement à proposer');
});
