// Tests du moteur de déplacements, sur de petits horaires inventés (aucune donnée réelle).
// Lancer : npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cours, Dataset, Deplacement } from '../src/data/types';
import { LOCAUX } from '../src/data/locaux';
import { plusJoursIso } from '../src/lib/calendar';
import { classesDe, coursDuProf, coursSansProf, heuresDeLaClasse } from '../src/logic/horaire';
import { analyserProposition, heureLibre, optionsPour, verifierDeplacement } from '../src/logic/deplacements';
import { etatLocal } from '../src/logic/occupation';

const LUNDI = '2026-11-16'; // un lundi de cours (pas de congé cette semaine-là)
const j = (n: number) => plusJoursIso(LUNDI, n);

const c = (prof: string, jour: number, h: number, classe: string, local: string, matiere = 'Cours'): Cours => ({
  id: `${prof}-${jour}-${h}`,
  prof,
  jour,
  h,
  classe,
  classes: classesDe(classe),
  local,
  matiere,
});

function donnees(partiel: Partial<Dataset> & { cours: Cours[] }): Dataset {
  return {
    moi: { nom: 'MOI', prenom: 'Test' },
    absences: [],
    reservations: [],
    deplacements: [],
    infos: [],
    locaux: LOCAUX,
    signalements: [],
    decisions: [],
    journal: true,
    coursEleves: [],
    profs: [],
    changements: [],
    materiel: [],
    absentes: [],
    ...partiel,
  };
}

// Horaire de base : MOI a la 3A et la 4B ; X est absent lundi en H3 (3A).
const BASE: Cours[] = [
  c('MOI', 1, 1, '3A', 'BF201'), c('MOI', 1, 2, '4B', 'BF201'), c('MOI', 1, 6, '3A', 'BF201'),
  c('MOI', 4, 1, '3A', 'BF201'), c('MOI', 4, 2, '4B', 'BF201'),
  c('X', 1, 3, '3A', 'BC105'),
];
const absentX = { prof: 'X', date: LUNDI, deH: 3, aH: 3 };

test('un cours peut être avancé le jour même, et c’est l’option la plus avantageuse', () => {
  const ds = donnees({ cours: BASE, absences: [absentX] });
  const options = optionsPour(ds, 'MOI', LUNDI, 3, LUNDI, 0);
  assert.ok(options.length >= 2);
  const meilleure = options[0];
  assert.equal(meilleure.dateO, LUNDI);
  assert.equal(meilleure.hO, 6);
  assert.equal(meilleure.memeJour, true);
  assert.equal(meilleure.meilleur, true);
  assert.match(meilleure.avantages[0], /tu finis à/);
  assert.equal(meilleure.local, 'BC105');
  assert.ok(meilleure.controles.every((x) => x.ok));
});

test('H5 (temps de midi) n’est jamais une cible', () => {
  const ds = donnees({
    cours: [...BASE, c('X', 1, 5, '3A', 'BC105')],
    absences: [{ prof: 'X', date: LUNDI, deH: 5, aH: 5 }],
  });
  assert.deepEqual(optionsPour(ds, 'MOI', LUNDI, 5, LUNDI, 0), []);
  const v = verifierDeplacement(ds, { absent: 'X', date: LUNDI, hVide: 5, classe: '3A', prof: 'MOI', hOrigine: 6, dateOrigine: LUNDI, statut: 'En attente' }, LUNDI, 0);
  assert.equal(v.ok, false);
  assert.equal(v.controles.find((x) => x.cle === 'midi')?.ok, false);
});

test('un déplacement qui allonge la journée est pénalisé et signalé', () => {
  const ds = donnees({
    cours: [...BASE, c('MOI', 2, 3, '3A', 'BF201'), c('MOI', 2, 4, '4B', 'BF201'), c('Y', 2, 1, '4B', 'BC106')],
    absences: [{ prof: 'Y', date: j(1), deH: 1, aH: 1 }],
  });
  const options = optionsPour(ds, 'MOI', j(1), 1, LUNDI, 0);
  const jeudi = options.find((o) => o.dateO === j(3) && o.hO === 2);
  assert.ok(jeudi, 'le cours du jeudi H2 peut venir mardi H1');
  assert.equal(jeudi.allonge, true);
  assert.ok(jeudi.avantages.some((a) => a.startsWith('Attention : mardi')));
  assert.ok(jeudi.score < 10);

  // Venir un jour où l'on n'avait pas cours compte aussi comme un allongement.
  const sansMardi = donnees({ cours: [...BASE, c('Y', 2, 1, '4B', 'BC106')], absences: [{ prof: 'Y', date: j(1), deH: 1, aH: 1 }] });
  const o = optionsPour(sansMardi, 'MOI', j(1), 1, LUNDI, 0).find((x) => x.dateO === j(3));
  assert.ok(o);
  assert.equal(o.allonge, true);
  assert.ok(o.avantages.includes("Attention : mardi, tu n'avais pas cours"));
});

test('avancer son dernier cours le jour même raccourcit la journée : pas de pénalité', () => {
  const ds = donnees({ cours: BASE, absences: [absentX] });
  const o = optionsPour(ds, 'MOI', LUNDI, 3, LUNDI, 0).find((x) => x.memeJour && x.hO === 6);
  assert.ok(o);
  assert.equal(o.allonge, false);
  assert.ok(!o.avantages.some((a) => a.startsWith('Attention')));
});

test('cours groupé : mêmes classes que le cours libéré (comme Power Apps), et le déplacement les emporte toutes', () => {
  const groupe = c('MOI', 3, 4, '5A, 5B', 'BF202');
  const seulement5A = donnees({ cours: [...BASE, groupe, c('Y', 1, 7, '5A', 'BC106'), c('Z', 1, 7, '5B', 'BC107')], absences: [{ prof: 'Y', date: LUNDI, deH: 7, aH: 7 }] });
  assert.equal(optionsPour(seulement5A, 'MOI', LUNDI, 7, LUNDI, 0).length, 0, '5B a cours avec Z : pas de place');

  const lesDeux = donnees({ cours: [...BASE, groupe, c('Y', 1, 7, '5A, 5B', 'BC106')], absences: [{ prof: 'Y', date: LUNDI, deH: 7, aH: 7 }] });
  const [o] = optionsPour(lesDeux, 'MOI', LUNDI, 7, LUNDI, 0);
  assert.ok(o);
  assert.equal(o.classe, '5A, 5B');
  assert.deepEqual(o.classes, ['5A', '5B']);

  // Comme Power Apps : un cours d'une seule classe ne prend pas l'heure d'un cours groupé
  // (« Publier pour les élèves » l'annoncerait aussi à l'autre classe, qui reste à l'étude).
  const seul5A = donnees({ cours: [...BASE, c('MOI', 3, 5, '5A', 'BF202'), c('Y', 1, 7, '5A, 5B', 'BC106')], absences: [{ prof: 'Y', date: LUNDI, deH: 7, aH: 7 }] });
  assert.equal(optionsPour(seul5A, 'MOI', LUNDI, 7, LUNDI, 0).length, 0);
  // L'ordre des classes ne compte pas.
  const ordre = donnees({ cours: [...BASE, groupe, c('Y', 1, 7, '5B,5A', 'BC106')], absences: [{ prof: 'Y', date: LUNDI, deH: 7, aH: 7 }] });
  assert.equal(optionsPour(ordre, 'MOI', LUNDI, 7, LUNDI, 0).length, 1);

  const dep: Deplacement = { absent: 'Y', date: LUNDI, hVide: 7, classe: o.classe, prof: 'MOI', hOrigine: 4, dateOrigine: j(2), statut: 'Validé' };
  const apres = { ...lesDeux, deplacements: [dep] };
  const arrive = coursDuProf(apres, 'MOI', LUNDI).find((x) => x.h === 7);
  assert.deepEqual(arrive?.classes, ['5A', '5B']);
  assert.ok(heuresDeLaClasse(apres, '5B', LUNDI).includes(7));
  assert.ok(!heuresDeLaClasse(apres, '5B', j(2)).includes(4));
  assert.equal(coursSansProf(apres, LUNDI, 7).length, 0);
});

test('local de l’heure libérée réservé entre-temps : un autre local libre est choisi', () => {
  const ds = donnees({
    cours: BASE,
    absences: [absentX],
    reservations: [{ prof: 'Z', date: LUNDI, h: 3, local: 'BC105', classe: '—' }],
  });
  const options = optionsPour(ds, 'MOI', LUNDI, 3, LUNDI, 0);
  assert.ok(options.length > 0);
  for (const o of options) {
    assert.notEqual(o.local, 'BC105');
    assert.equal(o.localChange, true);
    assert.equal(o.localPrevu, 'BC105');
    assert.ok(['libre', 'moi'].includes(etatLocal(ds, 'MOI', o.local, LUNDI, 3).etat));
  }
});

test('une réservation à cette heure-là rend le prof occupé', () => {
  const ds = donnees({ cours: BASE, absences: [absentX], reservations: [{ prof: 'MOI', date: LUNDI, h: 3, local: 'BC108', classe: '6C · remédiation', note: 'remédiation' }] });
  assert.equal(heureLibre(ds, 'MOI', LUNDI, 3), false);
  assert.deepEqual(optionsPour(ds, 'MOI', LUNDI, 3, LUNDI, 0), []);
});

test('une remédiation récupère la classe : elle n’est plus « à l’étude »', () => {
  const ds = donnees({ cours: BASE, absences: [absentX] });
  assert.equal(coursSansProf(ds, LUNDI, 3).length, 1);
  const pris = { ...ds, reservations: [{ prof: 'W', date: LUNDI, h: 3, local: 'BC105', classe: '3A · remédiation', note: 'remédiation' }] };
  assert.equal(coursSansProf(pris, LUNDI, 3).length, 0);
});

test('la semaine suivante n’est proposée que s’il n’y a rien dans la semaine', () => {
  // X absent vendredi H3 avec la 3A ; cette semaine, MOI n'a plus la 3A après vendredi.
  const vendredi = j(4);
  const cours = [c('MOI', 1, 1, '3A', 'BF201'), c('MOI', 1, 2, '4B', 'BF201'), c('X', 5, 3, '3A', 'BC105')];
  const ds = donnees({ cours, absences: [{ prof: 'X', date: vendredi, deH: 3, aH: 3 }] });
  const options = optionsPour(ds, 'MOI', vendredi, 3, LUNDI, 0);
  assert.ok(options.length > 0);
  assert.ok(options.every((o) => o.semaineSuivante));
  assert.equal(options[0].dateO, j(7));

  // S'il y a une option dans la semaine, pas de S+1.
  const avecVendredi = donnees({ cours: [...cours, c('MOI', 5, 6, '3A', 'BF201')], absences: [{ prof: 'X', date: vendredi, deH: 3, aH: 3 }] });
  const o2 = optionsPour(avecVendredi, 'MOI', vendredi, 3, LUNDI, 0);
  assert.ok(o2.length > 0);
  assert.ok(o2.every((o) => !o.semaineSuivante));
});

test('revérification : collègue revenu, classe déjà prise, heure passée', () => {
  const proposition: Deplacement = { id: '7', absent: 'X', date: LUNDI, hVide: 3, classe: '3A', prof: 'MOI', hOrigine: 6, dateOrigine: LUNDI, statut: 'En attente' };
  const ds = donnees({ cours: BASE, absences: [absentX], deplacements: [proposition] });

  // La proposition en attente ne se bloque pas elle-même.
  assert.equal(verifierDeplacement(ds, proposition, LUNDI, 0).ok, true);

  const revenu = { ...ds, absences: [] };
  const v1 = verifierDeplacement(revenu, proposition, LUNDI, 0);
  assert.equal(v1.ok, false);
  assert.equal(v1.controles.find((x) => x.cle === 'absent')?.ok, false);

  const autre: Deplacement = { id: '8', absent: 'X', date: LUNDI, hVide: 3, classe: '3A', prof: 'V', hOrigine: 7, dateOrigine: j(1), statut: 'Validé' };
  const v2 = verifierDeplacement({ ...ds, deplacements: [proposition, autre] }, proposition, LUNDI, 0);
  assert.equal(v2.controles.find((x) => x.cle === 'classes')?.ok, false);

  const v3 = verifierDeplacement(ds, proposition, LUNDI, 3);
  assert.equal(v3.controles.find((x) => x.cle === 'heure')?.ok, false);
});

test('une proposition refusée n’est pas reproposée telle quelle', () => {
  const ds = donnees({
    cours: BASE,
    absences: [absentX],
    decisions: [{ statut: 'Refusé', commentaire: 'Contrôle prévu', classe: '3A', prof: 'MOI', absent: 'X', date: LUNDI, hVide: 3, dateOrigine: LUNDI, hOrigine: 6, par: 'Éduc', le: `${LUNDI}T07:00:00` }],
  });
  const options = optionsPour(ds, 'MOI', LUNDI, 3, LUNDI, 0);
  assert.ok(!options.some((o) => o.dateO === LUNDI && o.hO === 6));
  assert.ok(options.length > 0, 'les autres options restent');
});

test('analyse d’une proposition pour l’éducateur', () => {
  const proposition: Deplacement = { id: '7', absent: 'X', date: LUNDI, hVide: 3, classe: '3A', prof: 'MOI', hOrigine: 6, dateOrigine: LUNDI, statut: 'En attente' };
  const ds = donnees({ cours: BASE, absences: [absentX], deplacements: [proposition] });
  const a = analyserProposition(ds, proposition, LUNDI, 0);
  assert.equal(a.verif.ok, true);
  assert.equal(a.avantageProf, true);
  assert.match(a.avantages[0], /Lundi, tu finis à/);
});

test('ce qui compte pour toi : « finir plus tôt » décoché, le cours qui fait commencer plus tard passe devant', () => {
  // Lundi : MOI a H1, H2 et H6 ; mardi : H1, H2, H3. X est absent lundi en H3 (3A).
  const ds = donnees({
    cours: [
      c('MOI', 1, 1, '4B', 'BF201'), c('MOI', 1, 2, '4B', 'BF201'), c('MOI', 1, 6, '3A', 'BF201'),
      c('MOI', 2, 1, '3A', 'BF201'), c('MOI', 2, 2, '4B', 'BF201'), c('MOI', 2, 3, '4B', 'BF201'),
      c('X', 1, 3, '3A', 'BC105'),
    ],
    absences: [absentX],
  });
  const parDefaut = optionsPour(ds, 'MOI', LUNDI, 3, LUNDI, 0);
  assert.equal(parDefaut[0].hO, 6, 'par défaut : finir plus tôt lundi (H6 avancé)');
  assert.match(parDefaut[0].avantages[0], /tu finis à/);
  const matin = optionsPour(ds, 'MOI', LUNDI, 3, LUNDI, 0, { finTot: false, debutTard: true, fourches: true });
  assert.equal(matin[0].dateO, j(1), 'sans « finir plus tôt » : commencer plus tard mardi');
  assert.match(matin[0].avantages[0], /tu commences à/);
  assert.ok(matin.every((o) => o.controles.every((x) => x.ok)), 'les mêmes contrôles, seul le classement change');
});
