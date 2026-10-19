// Simulation sur les vraies données exportées (CSV) : lecture des fichiers et app complète
// branchée sur la copie locale, sans connexion. Données inventées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, plusJours } from '../src/lib/calendar';

// La simulation est « active » : un petit localStorage factice suffit.
const memoire = new Map<string, string>([['behappi-simulation', '1']]);
(globalThis as any).localStorage = { getItem: (k: string) => memoire.get(k) ?? null, setItem: (k: string, v: string) => memoire.set(k, v), removeItem: (k: string) => memoire.delete(k) };
(globalThis as any).fetch = async () => {
  throw new Error('aucun appel réseau en simulation');
};

const sim = await import('../src/data/simulation');
const sp = await import('../src/data/sharepoint');

const demain = plusJours(new Date(), 1);
const fr = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

test('CSV : virgule ou point-virgule, guillemets, BOM, lignes vides', () => {
  assert.deepEqual(sim.lireCsv('﻿Titre,Classes\r\nLAMBERT,"5GA, 5GD"\r\n\r\n'), [['Titre', 'Classes'], ['LAMBERT', '5GA, 5GD']]);
  assert.deepEqual(sim.lireCsv('a;b\n"x ""y""";2\n'), [['a', 'b'], ['x "y"', '2']]);
  assert.deepEqual(sim.lireCsv('a,b\n"ligne\nsuite",3'), [['a', 'b'], ['ligne\nsuite', '3']]);
});

test('Dates de l’export et noms de fichiers', () => {
  assert.equal(iso(new Date(sim.versDate('19/10/2026')!)), '2026-10-19');
  assert.equal(new Date(sim.versDate('19/10/2026 08:25')!).getHours(), 8);
  assert.equal(sim.versDate('3'), null);
  assert.equal(sim.listePourFichier('Réservations.csv'), 'Réservations');
  assert.equal(sim.listePourFichier('reservations (2).csv'), 'Réservations');
  assert.equal(sim.listePourFichier('HorairesEleves.csv'), 'HorairesEleves');
  assert.equal(sim.listePourFichier('Photos.csv'), null);
});

test('Simulation : l’app charge les vraies listes et écrit seulement dans la copie', async () => {
  const L = (id: string, csv: string) => sim.versListe(id, sim.lireCsv(csv));
  const jourNum = ((demain.getDay() + 6) % 7) + 1;
  sim.utiliserEtat({
    moi: { givenName: 'Luc', mail: 'luc.lambert@ecole.example' },
    importeLe: new Date().toISOString(),
    listes: {
      // Titre renommé « Prof » dans SharePoint : l'export porte « Prof » (comme à l'école).
      Profs: L('L1', 'Prof,MatierePrincipale,Email\nLAMBERT,Géographie,luc.lambert@ecole.example\nDURANT,Histoire,'),
      Roles: L('L2', 'Titre,Role\neduc@ecole.example,Éducatrice'),
      Horaires: L('L3', `Prof,JourNum,Jour,Heure,HeureDebut,Matière,Classes,Local,DeplacementPossible\nLAMBERT,${jourNum},x,3,10:25,Géographie,5TQB,BF110,Oui\nDURANT,${jourNum},x,4,11:15,Histoire,"3A, 3B",BC105,Oui`),
      Absences: L('L4', `Prof,DateAbs,DeH,AH,Créé\nDURANT,${fr(demain)},1,9,${fr(new Date())} 08:00`),
      Deplacements: L('L5', 'Titre,DateDep,HeureVide,Classe,Collegue,HeureOrigine,DateOrigine,Statut'),
      Signalements: L('L6', `Titre,Statut,Urgence,Créé,Créé par\nBF110 · Store bloqué,En cours,Normale,${fr(new Date())} 09:00,Auteur Test`),
    },
  });
  const ds = await sp.chargerSharePoint((await sp.profil()).email, 'Luc');
  assert.equal(ds.moi.nom, 'LAMBERT');
  assert.equal(ds.cours.length, 2);
  assert.deepEqual(ds.cours[1].classes, ['3A', '3B']);
  assert.equal(ds.cours[0].matiere, 'Géographie', 'colonne « Matière » de l’export → Matiere');
  assert.equal(ds.absences[0]?.date, iso(demain));
  assert.equal(ds.signalements[0].local, 'BF110');
  assert.equal(ds.signalements[0].auteur, 'Auteur Test');

  const id = await sp.enregistrerSignalement('BT004 · Le projecteur clignote', true);
  const apres = await sp.chargerSharePoint('luc.lambert@ecole.example', 'Luc');
  assert.ok(apres.signalements.some((s) => s.id === id && s.bloquant), 'écrit dans la copie locale');
});
