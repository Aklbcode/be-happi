// Tests du « cerveau » : publication élèves, Où est ?, créneaux communs, impact d'une absence,
// tableau de bord, agenda, Happi et les constats « Happi a remarqué ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Cours, Dataset } from '../src/data/types';
import { LOCAUX } from '../src/data/locaux';
import { changementsDuJour, etatPublication, jourEtDate, sansNom } from '../src/logic/publication';
import { positionClasse, positionProf, profsLibres, rechercher } from '../src/logic/ouest';
import { creneauxCommuns, groupes, plage } from '../src/logic/collab';
import { impactAbsence } from '../src/logic/impact';
import { statsPeriode } from '../src/logic/stats';
import { calendrierIcs } from '../src/lib/ics';
import { analyser, intention, repondre, type Contexte } from '../src/logic/happi';
import { dispoMateriel, libreSurPlage } from '../src/logic/materiel';
import { datasetDemo, momentDemo } from '../src/data/demo';
import { iso, minutesDe, situation, dernierePeriodeFinie } from '../src/lib/calendar';
import { remarquesDirection, remarquesProf, remarquesSecretariat, remarquesTechnique, remarquesVieScolaire, coursDansLocauxFermes } from '../src/logic/remarques';

const LUNDI = '2026-11-16';
const JEUDI = '2026-11-19';

let n = 0;
const c = (prof: string, jour: number, h: number, classe: string, local = 'BF201', matiere = 'Maths'): Cours => ({
  id: `c${n++}`, prof, jour, h, classes: classe.split(',').map((x) => x.trim()), classe, local, matiere,
});

function donnees(partiel: Partial<Dataset>): Dataset {
  return {
    moi: { nom: 'MOI', prenom: 'Test', email: 'moi@ecole.example' },
    cours: [], coursEleves: [], absences: [], reservations: [], deplacements: [], infos: [], locaux: LOCAUX,
    signalements: [], decisions: [], journal: true, profs: [], changements: [], materiel: [], absentes: [],
    ...partiel,
  };
}

test('publication : mêmes textes que Power Apps (étude, cours avancé, cours d’un autre jour, départs, local)', () => {
  const ds = donnees({
    cours: [
      c('X', 1, 3, '3A', 'BC105', 'Histoire'), c('X', 1, 4, '3A, 3B', 'BC105', 'Histoire'),
      c('MOI', 1, 6, '3A', 'BF201'), c('MOI', 4, 2, '3A, 3B', 'BF202'),
    ],
    absences: [{ prof: 'X', date: LUNDI, deH: 3, aH: 4 }],
    deplacements: [
      // Avancé le jour même (H6 → H3) et cours d'un autre jour (jeudi H2 → H4).
      { absent: 'X', date: LUNDI, hVide: 3, classe: '3A', prof: 'MOI', hOrigine: 6, dateOrigine: LUNDI, statut: 'Validé' },
      { absent: 'X', date: LUNDI, hVide: 4, classe: '3A, 3B', prof: 'MOI', hOrigine: 2, dateOrigine: JEUDI, statut: '' || 'Validé' },
    ],
    reservations: [{ prof: 'Y', date: LUNDI, h: 8, local: 'BT004', classe: '5C' }],
  });
  const lignes = changementsDuJour(ds, LUNDI);
  const t = (classe: string, h: number) => lignes.filter((l) => l.classe === classe && l.h === h).map((l) => l.titre);
  assert.deepEqual(t('3A', 3), ['MOI donne cours à cette heure (avancé de H6) · local BC105']);
  assert.deepEqual(t('3B', 4), ['MOI donne cours à cette heure (cours du jeudi 19/11 H2) · local BC105']);
  assert.deepEqual(t('3A', 6), ['Cours de MOI déplacé en H3 → heure libre']);
  assert.deepEqual(t('5C', 8), ['Changement de local → BT004']);
  // Le jeudi, l'heure de départ est annoncée comme déjà donnée.
  const jeudi = changementsDuJour(ds, JEUDI);
  assert.deepEqual(jeudi.filter((l) => l.classe === '3A').map((l) => l.titre), ['Cours de MOI déjà donné le lundi 16/11 (H4) → heure libre']);
  assert.equal(jourEtDate('2026-11-05'), 'jeudi 05/11');
});

test('publication : la remédiation remplace l’étude, le local changé à la validation est annoncé tout de suite', () => {
  const ds = donnees({
    cours: [c('X', 1, 3, '2A', 'BC105', 'Français'), c('X', 1, 5, '2B', 'BC105', 'Français'), c('MOI', 1, 7, '2B', 'BF201')],
    absences: [{ prof: 'X', date: LUNDI, deH: 1, aH: 9 }],
    reservations: [
      { prof: 'MOI', date: LUNDI, h: 3, local: 'BF110', classe: '2A · remédiation', note: 'remédiation' },
      { prof: 'MOI', date: LUNDI, h: 5, local: 'BF207', classe: '2B' },
    ],
    deplacements: [{ absent: 'X', date: LUNDI, hVide: 5, classe: '2B', prof: 'MOI', hOrigine: 7, dateOrigine: LUNDI, statut: 'Validé' }],
  });
  const lignes = changementsDuJour(ds, LUNDI);
  assert.deepEqual(lignes.filter((l) => l.h === 3).map((l) => l.titre), ['Remédiation avec MOI · local BF110']);
  assert.deepEqual(lignes.filter((l) => l.h === 5).map((l) => l.titre), ['MOI donne cours à cette heure (avancé de H7) · local BF207']);
  assert.ok(!lignes.some((l) => l.titre.startsWith('Changement de local')), 'pas de ligne en double');
  assert.equal(sansNom({ type: 'Étude', titre: 'Pas de cours de Français (X absent(e)) → étude' }), 'Étude (pas de cours)');
  assert.ok(!sansNom(lignes[0]).includes('MOI'));
});

test('publication : une validation après la publication rend la publication « pas à jour »', () => {
  const base = donnees({
    cours: [c('X', 1, 3, '2A'), c('MOI', 1, 6, '2A')],
    absences: [{ prof: 'X', date: LUNDI, deH: 3, aH: 3 }],
    deplacements: [{ absent: 'X', date: LUNDI, hVide: 3, classe: '2A', prof: 'MOI', hOrigine: 6, dateOrigine: LUNDI, statut: 'En attente' }],
  });
  base.changements = changementsDuJour(base, LUNDI);
  assert.equal(etatPublication(base, LUNDI).aJour, true);
  const apres = { ...base, deplacements: base.deplacements.map((d) => ({ ...d, statut: 'Validé' })) };
  const e = etatPublication(apres, LUNDI);
  assert.equal(e.aJour, false);
  assert.equal(e.nouveaux.length, 2, 'le cours avancé et l’heure de départ libérée');
  assert.equal(e.retires.length, 1, 'l’étude annoncée disparaît');
});

test('Où est ? : un prof en cours, absent, en fourche, avant ou après sa journée', () => {
  const ds = donnees({
    cours: [c('A', 1, 2, '3A', 'BF201'), c('A', 1, 6, '4B', 'BC105'), c('B', 1, 1, '5C'), c('B', 1, 2, '5C')],
    absences: [{ prof: 'B', date: LUNDI, deH: 1, aH: 9 }],
    reservations: [{ prof: 'A', date: LUNDI, h: 4, local: 'BF110', classe: '2A · remédiation', note: 'remédiation' }],
  });
  assert.equal(positionProf(ds, 'A', LUNDI, 2).statut, 'cours');
  assert.equal(positionProf(ds, 'A', LUNDI, 2).local, 'BF201');
  assert.equal(positionProf(ds, 'A', LUNDI, 4).note, 'remédiation');
  assert.equal(positionProf(ds, 'A', LUNDI, 3).statut, 'fourche');
  assert.equal(positionProf(ds, 'A', LUNDI, 5).statut, 'midi');
  assert.equal(positionProf(ds, 'A', LUNDI, 1).statut, 'avant');
  assert.equal(positionProf(ds, 'A', LUNDI, 8).statut, 'apres');
  assert.equal(positionProf(ds, 'B', LUNDI, 1).statut, 'absent');
  assert.equal(positionProf(ds, 'A', '2026-11-11', 2).statut, 'conge', 'Armistice');
  const libres = profsLibres(ds, LUNDI, 3);
  assert.deepEqual(libres.map((l) => [l.prof, l.fourche]), [['A', true]]);
});

test('Où est ? : une classe en cours, à l’étude, en remédiation, ou libérée par un déplacement', () => {
  const ds = donnees({
    cours: [c('X', 1, 3, '2A', 'BC105', 'Français'), c('Y', 1, 4, '2A', 'BF201', 'Maths'), c('Z', 1, 6, '2A', 'BT102', 'Histoire'), c('Z', 1, 2, '6C', 'BT102', 'Histoire')],
    absences: [{ prof: 'X', date: LUNDI, deH: 1, aH: 9 }, { prof: 'Y', date: LUNDI, deH: 4, aH: 4 }],
    reservations: [{ prof: 'W', date: LUNDI, h: 4, local: 'BF110', classe: '2A · remédiation', note: 'remédiation' }],
    deplacements: [{ absent: 'X', date: LUNDI, hVide: 3, classe: '2A', prof: 'Z', hOrigine: 6, dateOrigine: LUNDI, statut: 'Validé' }],
  });
  const h3 = positionClasse(ds, '2A', LUNDI, 3);
  assert.equal(h3.statut, 'cours');
  assert.equal(h3.prof, 'Z');
  assert.equal(h3.note, 'cours déplacé ici');
  assert.equal(positionClasse(ds, '2A', LUNDI, 4).statut, 'remediation');
  assert.equal(positionClasse(ds, '2A', LUNDI, 6).statut, 'libre');
  const sans = donnees({ ...ds, reservations: [], deplacements: [] });
  assert.equal(positionClasse(sans, '2A', LUNDI, 3).statut, 'etude');
  assert.deepEqual(rechercher(ds, '2a').map((t) => t.nom)[0], '2A');
  assert.ok(rechercher(ds, 'bf 2').some((t) => t.nom === 'BF201'), 'les espaces sont ignorés');
  assert.deepEqual(rechercher(ds, 'bf20').map((t) => t.nom).slice(0, 2), ['BF201', 'BF202']);
});

test('Collab : heures communes regroupées, H5 exclue, tolérance d’une absence', () => {
  const ds = donnees({
    cours: [
      c('A', 1, 1, '3A'), c('A', 1, 6, '3A'), c('B', 1, 1, '4B'), c('B', 1, 2, '4B'), c('B', 1, 7, '4B'),
      c('C', 1, 3, '5C'), c('C', 1, 4, '5C'),
    ],
  });
  const lundi = new Date(2026, 10, 16, 7, 0);
  const cr = creneauxCommuns(ds, ['A', 'B'], lundi, 0, { tolerance: 0, aLEcole: true }, 1);
  // A et B sont tous les deux à l'école entre H3 et H4 (A : H1–H6, B : H1–H7) ; H5 est exclue.
  assert.equal(plage(cr[0]), 'H3–H4 · 10h25 – 12h05');
  assert.ok(!cr.some((x) => x.hDebut <= 5 && x.hFin >= 5));
  const trois = creneauxCommuns(ds, ['A', 'B', 'C'], lundi, 0, { tolerance: 0, aLEcole: false }, 1);
  assert.ok(trois.every((x) => x.manquants.length === 0));
  assert.ok(!trois.some((x) => x.hDebut <= 3 && x.hFin >= 3), 'C a cours en H3');
  const tol = creneauxCommuns(ds, ['A', 'B', 'C'], lundi, 0, { tolerance: 1, aLEcole: true }, 1);
  assert.ok(tol.some((x) => x.manquants.length === 1));
  const g = groupes(donnees({ cours: [c('MOI', 1, 1, '3A', 'BF201', 'Sciences'), c('Z', 2, 1, '3A', 'BF201', 'Maths'), c('W', 2, 2, '4B', 'BF201', 'Sciences')] }), 'MOI');
  assert.deepEqual(g.map((x) => x.nom), ['Équipe de la 3A', 'Profs de sciences']);
});

test('impact d’une absence : cours touchés et pistes de récupération', () => {
  const ds = donnees({
    cours: [c('X', 1, 3, '3A'), c('X', 1, 5, '3A'), c('MOI', 4, 2, '3A'), c('Y', 1, 3, '4B'), c('Z', 2, 1, '3A'), c('Z', 1, 3, '6C')],
  });
  const imp = impactAbsence(ds, [{ prof: 'X', date: LUNDI, deH: 1, aH: 9 }]);
  assert.equal(imp.heures, 2);
  assert.deepEqual(imp.classes, ['3A']);
  const h3 = imp.cours.find((x) => x.h === 3)!;
  assert.deepEqual(h3.pistes, ['MOI'], 'Z a cours en H3 ; MOI a la 3A jeudi et est libre');
  assert.deepEqual(imp.cours.find((x) => x.h === 5)!.pistes, [], 'H5 : jamais une cible');
});

test('tableau de bord : heures sans prof, récupérées par déplacement ou remédiation, par semaine', () => {
  const ds = donnees({
    cours: [c('X', 1, 1, '3A'), c('X', 1, 2, '3A, 3B'), c('X', 1, 3, '4C'), c('MOI', 4, 1, '3A')],
    absences: [{ prof: 'X', date: LUNDI, deH: 1, aH: 9 }, { prof: 'X', date: '2026-11-11', deH: 1, aH: 9 }],
    deplacements: [{ absent: 'X', date: LUNDI, hVide: 1, classe: '3A', prof: 'MOI', hOrigine: 1, dateOrigine: JEUDI, statut: 'Validé' }],
    reservations: [{ prof: 'Y', date: LUNDI, h: 3, local: 'BF110', classe: '4C · remédiation', note: 'remédiation' }],
  });
  const s = statsPeriode(ds, '2026-11-09', '2026-11-20');
  assert.equal(s.joursProf, 1, 'l’Armistice ne compte pas');
  assert.equal(s.heures, 3);
  assert.equal(s.parDeplacement, 1);
  assert.equal(s.parRemediation, 1);
  assert.equal(Math.round(s.taux * 100), 67);
  assert.deepEqual(s.parClasse.find((x) => x.classe === '3B'), { classe: '3B', perdues: 1, recuperees: 0 });
  assert.deepEqual(s.semaines.map((x) => [x.lundi, x.sansProf, x.recuperees]), [['2026-11-09', 0, 0], ['2026-11-16', 3, 2]]);
  assert.deepEqual(s.parCollegue.map((x) => x.prof), ['MOI', 'Y']);
});

test('agenda .ics : lignes CRLF de 75 octets au plus, texte échappé, heures en UTC', () => {
  const ics = calendrierIcs('Horaire de Camille, 3TQA', [{ uid: 'a', date: LUNDI, hDebut: 1, hFin: 1, titre: 'Sciences ; labo, BF110', lieu: 'BF110', description: 'É'.repeat(80) }], new Date(Date.UTC(2026, 10, 1)));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('X-WR-CALNAME:Horaire de Camille\\, 3TQA'));
  assert.ok(ics.includes('SUMMARY:Sciences \\; labo\\, BF110'));
  assert.ok(ics.includes(`DTSTART:${new Date(2026, 10, 16, 8, 25).toISOString().replace(/[-:]/g, '').slice(0, 13)}00Z`));
  for (const ligne of ics.split('\r\n')) assert.ok(new TextEncoder().encode(ligne).length <= 75, `ligne trop longue : ${ligne}`);
});

test('matériel : disponibilité par heure et sur une plage', () => {
  const ds = donnees({ materiel: [{ prof: 'A', date: LUNDI, h: 3, rack: 'Rack tablettes A', classe: '3A' }, { prof: 'B', date: LUNDI, h: 3, rack: 'Vidéoprojecteur mobile', classe: '4B' }] });
  const d = dispoMateriel(ds, LUNDI, 3);
  assert.equal(d.find((x) => x.rack.nom === 'Rack tablettes A')!.reste, 0);
  assert.equal(d.find((x) => x.rack.nom === 'Vidéoprojecteur mobile')!.reste, 2);
  assert.equal(libreSurPlage(ds, 'Rack tablettes A', LUNDI, 2, 4), false);
  assert.equal(libreSurPlage(ds, 'Rack tablettes B', LUNDI, 2, 4), true);
});

// --- Happi, sur les données de démonstration ---------------------------------------------------

const M = momentDemo(new Date('2026-10-18T19:00:00'));
const DS = datasetDemo(M);
const passee = (() => {
  const s = situation(minutesDe(M));
  return s.enCours ? s.h : dernierePeriodeFinie(minutesDe(M));
})();
const cx = (profil: Contexte['profil'] = 'prof', classeEleve?: string): Contexte => ({ ds: DS, moi: profil === 'prof' ? DS.moi.nom : '', profil, maintenant: M, heurePassee: passee, classeEleve });

test('Happi comprend les classes, les profs, les locaux, les heures et les jours', () => {
  const a = analyser('Où est la 6tqa jeudi en H4 ?', cx());
  assert.deepEqual(a.classes, ['6TQA']);
  assert.equal(a.h, 4);
  assert.equal(new Date(`${a.date}T12:00:00`).getDay(), 4);
  const b = analyser('local avec projecteur libre à 10h30 au bf 110', cx());
  assert.deepEqual(b.locaux, ['BF110']);
  assert.equal(b.h, 3, '10h30 tombe en H3');
  assert.equal(b.equip.vp, true);
  const p = analyser('Trouve un créneau avec Lambert et Kabongo', cx());
  assert.deepEqual(p.profs.sort(), ['KABONGO', 'LAMBERT']);
  assert.equal(intention(p, 'prof'), 'collab');
  assert.equal(intention(analyser('Quelles classes sont à l’étude ?', cx()), 'educateur'), 'etude');
  assert.equal(intention(analyser('le projecteur du BF110 ne marche plus', cx()), 'prof'), 'signaler');
  assert.equal(intention(analyser('je voudrais réserver les tablettes en H3', cx()), 'prof'), 'materiel');
  assert.equal(analyser('les tablettes en H3', cx()).rack, 'Rack tablettes A');
});

test('Happi répond : Où est, locaux libres, créneau, aide, étude, absents', () => {
  const ou = repondre('Où est Lemaire ?', cx());
  assert.equal(ou.intention, 'ou-est');
  assert.ok(/Lemaire/.test(ou.texte));
  assert.ok(ou.blocs.some((b) => b.type === 'journee'));
  assert.ok(ou.actions.some((x) => x.type === 'teams-chat'));
  const loc = repondre('Un local avec projecteur libre en H6 ?', cx());
  assert.equal(loc.intention, 'locaux');
  assert.ok(loc.blocs.some((b) => b.type === 'puces' && b.puces.length > 0));
  const col = repondre('Trouve un créneau avec l’équipe de la 3TQA', cx());
  assert.equal(col.intention, 'collab');
  assert.ok(/meilleur moment|absence/.test(col.texte), col.texte);
  const aide = repondre('Qui peut faire une remédiation avec la 1CB en H7 ?', cx('educateur'));
  assert.equal(aide.intention, 'aide');
  const etu = repondre('Quelles classes sont à l’étude ?', cx('educateur'));
  assert.ok(/étude/.test(etu.texte));
  const abs = repondre('Qui est absent aujourd’hui ?', cx('educateur'));
  assert.ok(/absent/.test(abs.texte));
  assert.ok(!JSON.stringify(abs).toLowerCase().includes('maladie'), 'jamais de motif');
});

test('Happi en vue élève : sa classe seulement, rien sur le personnel', () => {
  const refus = repondre('Où est M. Lambert ?', cx('eleve', '3TQA'));
  assert.equal(refus.intention, 'refus');
  const abs = repondre('Qui est absent aujourd’hui ?', cx('eleve', '3TQA'));
  assert.equal(abs.intention, 'refus');
  const ma = repondre('Où est ma classe maintenant ?', cx('eleve', '3TQA'));
  assert.ok(/3TQA/.test(ma.texte));
  const chg = repondre('Qu’est-ce qui change aujourd’hui ?', cx('eleve', '1CB'));
  assert.ok(/changement/.test(chg.texte), chg.texte);
});

test('Happi a remarqué : des constats utiles pour chaque espace', () => {
  const auj = iso(M);
  assert.ok(remarquesProf(DS, DS.moi.nom, M, passee).length >= 1);
  assert.ok(remarquesVieScolaire(DS, M, passee).length >= 1);
  assert.ok(remarquesSecretariat(DS, M).some((r) => r.id === 'ferme'), 'BC104 fermé et personne prévenu');
  assert.ok(remarquesDirection(DS, M).some((r) => r.id === 'taux'));
  assert.ok(remarquesTechnique(DS, M).length >= 1);
  const fermes = coursDansLocauxFermes(DS, auj);
  assert.equal(fermes[0].local, 'BC104');
});

test('démo : historique pour le tableau de bord, sans toucher au scénario du jour', () => {
  const m = momentDemo(new Date('2026-10-18T19:00:00'));
  const ds = datasetDemo(m);
  const auj = iso(m);
  assert.ok(ds.absences.filter((a) => a.date < auj).length > 30);
  const s = statsPeriode(ds, '2026-08-31', auj);
  assert.ok(s.semaines.length >= 6);
  const debut = s.semaines.slice(0, 2).reduce((n, x) => n + x.recuperees, 0) / Math.max(1, s.semaines.slice(0, 2).reduce((n, x) => n + x.sansProf, 0));
  const fin = s.semaines.slice(-3, -1).reduce((n, x) => n + x.recuperees, 0) / Math.max(1, s.semaines.slice(-3, -1).reduce((n, x) => n + x.sansProf, 0));
  assert.ok(fin > debut, `le taux progresse (${debut.toFixed(2)} → ${fin.toFixed(2)})`);
  assert.ok(ds.changements.length > 0 && ds.changements.every((x) => x.date === auj));
  assert.ok(ds.profs.every((p) => p.email?.endsWith('@ecole.example')));
  assert.ok(ds.coursEleves.length > 100);
});

test('QR des portes : taille selon la longueur, motifs de repérage et lignes de synchronisation', async () => {
  const { qrCode } = await import('../src/lib/qr');
  const court = qrCode('Be Happi');
  assert.equal(court.length, 21, 'version 1 pour un texte court');
  const url = qrCode('https://aklbcode.github.io/be-happi/#/signaler?local=BF110');
  assert.equal(url.length, 33, 'version 4 pour une adresse de local');
  const n = url.length;
  // Motif de repérage 7×7 dans trois coins : bord noir, anneau blanc, carré noir 3×3.
  for (const [y0, x0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let i = 0; i < 7; i++) {
      assert.equal(url[y0][x0 + i], true);
      assert.equal(url[y0 + 6][x0 + i], true);
      assert.equal(url[y0 + i][x0], true);
      assert.equal(url[y0 + i][x0 + 6], true);
    }
    assert.equal(url[y0 + 1][x0 + 1], false);
    assert.equal(url[y0 + 3][x0 + 3], true);
  }
  // Lignes de synchronisation : un module sur deux.
  for (let i = 8; i < n - 8; i++) {
    assert.equal(url[6][i], i % 2 === 0);
    assert.equal(url[i][6], i % 2 === 0);
  }
  // Le module sombre fixe, toujours présent.
  assert.equal(url[n - 8][8], true);
});
