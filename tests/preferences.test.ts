import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cours, Dataset } from '../src/data/types';
import { LOCAUX } from '../src/data/locaux';
import { optionsPour, verifierDeplacement } from '../src/logic/deplacements';
import { impactPersonnel, normaliserPreferences, PREFERENCES_DEFAUT } from '../src/logic/preferences';
import { clePreferences, enregistrerPreferences, lirePreferencesStockees, preferencesEffectives } from '../src/data/preferences';
import { remarquesProf } from '../src/logic/remarques';
import { dureeTxt, periode } from '../src/lib/calendar';

const lundi = '2026-11-16';
const jeudi = '2026-11-19';
const cours = (prof: string, jour: number, h: number, classe = '3A'): Cours => ({
  id: `${prof}-${jour}-${h}`, prof, jour, h, classe, classes: [classe], local: 'BF201', matiere: 'Cours',
});
function donnees(hCible = 1): Dataset {
  return {
    moi: { nom: 'MOI', prenom: 'Test' },
    cours: [cours('MOI', 1, 3, '4B'), cours('MOI', 4, 1), cours('MOI', 4, 2, '4B'), cours('MOI', 4, 6), cours('X', 1, hCible)],
    absences: [{ prof: 'X', date: lundi, deH: hCible, aH: hCible }],
    locaux: LOCAUX, coursEleves: [], reservations: [], deplacements: [], infos: [], signalements: [], decisions: [], journal: true,
    profs: [], changements: [], materiel: [], absentes: [],
  };
}

test('une préférence souple conserve les options, une indisponibilité les filtre', () => {
  const ds = donnees();
  const neutre = optionsPour(ds, 'MOI', lundi, 1, lundi, 0);
  assert.ok(neutre.length > 0);
  ds.preferencesDeplacements = { ...PREFERENCES_DEFAUT, premiere: 'eviter' };
  assert.deepEqual(optionsPour(ds, 'MOI', lundi, 1, lundi, 0).map((o) => o.cle).sort(), neutre.map((o) => o.cle).sort());
  ds.preferencesDeplacements.premiere = 'indisponible';
  assert.deepEqual(optionsPour(ds, 'MOI', lundi, 1, lundi, 0), []);
});

test('la préférence première heure modifie le classement et explique le choix', () => {
  const ds = donnees();
  ds.preferencesDeplacements = { ...PREFERENCES_DEFAUT, premiere: 'preferer' };
  const options = optionsPour(ds, 'MOI', lundi, 1, lundi, 0);
  assert.equal(options[0].hO, 6, 'préserver le cours déjà en première heure au départ');
  assert.ok(options[0].raisonsPersonnelles.some((r) => r.includes('préfères donner cours en première')));
});

test('la dernière heure indisponible est filtrée indépendamment de la première', () => {
  const ds = donnees(9);
  assert.ok(optionsPour(ds, 'MOI', lundi, 9, lundi, 0).length);
  ds.preferencesDeplacements = { ...PREFERENCES_DEFAUT, derniere: 'indisponible' };
  assert.deepEqual(optionsPour(ds, 'MOI', lundi, 9, lundi, 0), []);
});

test('un gain au départ compensé par une journée plus longue reste un coût net', () => {
  const ds = donnees(9);
  ds.cours = [cours('MOI', 1, 2, '4B'), cours('MOI', 4, 1), cours('MOI', 4, 2, '4B'), cours('X', 1, 9)];
  const impact = impactPersonnel(ds, 'MOI', jeudi, 1, lundi, 9);
  assert.ok(impact.gainNetMinutes < 0);
  ds.preferencesDeplacements = { ...PREFERENCES_DEFAUT, echanges: false };
  assert.deepEqual(optionsPour(ds, 'MOI', lundi, 9, lundi, 0), []);
});

test('une réservation au départ empêche d’annoncer un départ anticipé fictif', () => {
  const ds = donnees(2);
  ds.cours = [cours('MOI', 1, 1, '4B'), cours('MOI', 1, 6), cours('X', 1, 2)];
  assert.ok(impactPersonnel(ds, 'MOI', lundi, 6, lundi, 2).gainNetMinutes > 0);
  ds.reservations = [{ prof: 'MOI', date: lundi, h: 6, classe: '', local: 'BC105' }];
  assert.equal(impactPersonnel(ds, 'MOI', lundi, 6, lundi, 2).gainNetMinutes, 0);
});

test('préserver une journée libre interdit une venue supplémentaire', () => {
  const ds = donnees();
  ds.cours = ds.cours.filter((c) => c.prof !== 'MOI' || c.jour !== 1);
  assert.ok(optionsPour(ds, 'MOI', lundi, 1, lundi, 0).length);
  ds.preferencesDeplacements = { ...PREFERENCES_DEFAUT, jourLibre: true };
  assert.deepEqual(optionsPour(ds, 'MOI', lundi, 1, lundi, 0), []);
});

test('les préférences ne lèvent jamais un conflit de professeur', () => {
  const ds = donnees();
  ds.cours.push(cours('MOI', 1, 1, '6B'));
  ds.preferencesDeplacements = { ...PREFERENCES_DEFAUT, premiere: 'preferer' };
  assert.deepEqual(optionsPour(ds, 'MOI', lundi, 1, lundi, 0), []);
  assert.equal(verifierDeplacement(ds, { prof: 'MOI', absent: 'X', classe: '3A', date: lundi, hVide: 1, dateOrigine: jeudi, hOrigine: 6, statut: 'En attente' }, lundi, 0).ok, false);
});

test('les préférences sont séparées par personne et entre démo et école', () => {
  const cle = clePreferences('a@ecole.be', 'ecole');
  enregistrerPreferences(cle, { ...PREFERENCES_DEFAUT, premiere: 'eviter' });
  assert.equal(preferencesEffectives(lirePreferencesStockees(cle), lundi).premiere, 'eviter');
  assert.equal(preferencesEffectives(lirePreferencesStockees(clePreferences('b@ecole.be', 'ecole')), lundi).premiere, 'neutre');
  assert.equal(preferencesEffectives(lirePreferencesStockees(clePreferences('a@ecole.be', 'demo')), lundi).premiere, 'neutre');
});

test('les choix temporaires expirent sans écraser les préférences habituelles', () => {
  const cle = clePreferences('temp@ecole.be', 'ecole');
  enregistrerPreferences(cle, { ...PREFERENCES_DEFAUT, premiere: 'eviter' });
  enregistrerPreferences(cle, { ...PREFERENCES_DEFAUT, derniere: 'indisponible' }, lundi);
  const texte = lirePreferencesStockees(cle);
  assert.equal(preferencesEffectives(texte, lundi).derniere, 'indisponible');
  assert.equal(preferencesEffectives(texte, '2026-11-23').premiere, 'eviter');
  assert.equal(preferencesEffectives(texte, '2026-11-23').derniere, 'neutre');
});

test('un stockage corrompu retrouve des valeurs neutres', () => {
  assert.deepEqual(preferencesEffectives('null', lundi), PREFERENCES_DEFAUT);
  assert.deepEqual(preferencesEffectives('{cassé', lundi), PREFERENCES_DEFAUT);
  assert.equal(normaliserPreferences({ premiere: 'invalide', echanges: 'non' }).echanges, true);
});

test('les préférences d’une personne ne filtrent pas les propositions pour une autre', () => {
  const ds = donnees();
  ds.moi.nom = 'AUTRE';
  ds.preferencesDeplacements = { ...PREFERENCES_DEFAUT, premiere: 'indisponible' };
  assert.ok(optionsPour(ds, 'MOI', lundi, 1, lundi, 0).length > 0);
});

test('l’accueil ne cumule pas deux déplacements alternatifs du même cours', () => {
  const ds = donnees(2);
  ds.cours = [cours('MOI', 1, 1, '4B'), cours('MOI', 1, 6), cours('X', 1, 2), cours('X', 1, 3)];
  ds.absences = [{ prof: 'X', date: lundi, deH: 2, aH: 3 }];
  const remarque = remarquesProf(ds, 'MOI', new Date(2026, 10, 16, 7, 0), 0).find((r) => r.id === 'gain');
  assert.ok(remarque);
  assert.equal(remarque.titre, `Jusqu’à ${dureeTxt(periode(6).fm - periode(2).fm)} de présence en moins`);
  assert.match(remarque.texte, /un déplacement/);
});
