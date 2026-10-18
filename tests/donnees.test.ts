// Tests de la lecture des listes (sans réseau) et du scénario de démonstration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDans, peutValiderAvec, peutVoirAvec, reconnaitre, rolesDe, txt, val } from '../src/data/champs';
import { datasetDemo, momentDemo } from '../src/data/demo';
import { iso, situation, minutesDe, dernierePeriodeFinie } from '../src/lib/calendar';
import { analyserProposition, optionsPour } from '../src/logic/deplacements';

test('reconnaître un prof : colonne Email, alias Mail, ou adresse prenom.nom@', () => {
  const profs = [{ Title: 'MOREAU', Email: '' }, { Title: 'DUBOIS (néerl.)' }, { Title: 'LEFÈVRE' }, { Title: 'MARTIN', Mail: 'x.martin@ecole.be' }, { Title: 'ROUX' }, { Title: 'ROUX' }];
  assert.equal(reconnaitre(profs, 'camille.moreau@ecole.be'), 'MOREAU');
  assert.equal(reconnaitre(profs, 'Anne.Dubois@ecole.be'), 'DUBOIS (néerl.)');
  assert.equal(reconnaitre(profs, 'jean.lefevre@ecole.be'), 'LEFÈVRE');
  assert.equal(reconnaitre(profs, 'X.MARTIN@ecole.be'), 'MARTIN');
  assert.equal(reconnaitre(profs, 'a.roux@ecole.be'), '', 'deux homonymes : on ne devine pas');
  assert.equal(reconnaitre(profs, 'inconnu@ecole.be'), '');
});

test('alias de colonnes : Titre et Title désignent la même colonne', () => {
  assert.equal(txt(val({ Titre: 'A' }, 'Title')), 'A');
  assert.equal(txt(val({ Title: 'B' }, 'Titre')), 'B');
  assert.equal(txt({ Value: 'Urgente' }), 'Urgente');
});

test('le local d’un signalement est trouvé dans le texte', () => {
  assert.equal(localDans('Vidéoprojecteur HS en bf005a'), 'BF005A');
  assert.equal(localDans('Fuite au BC 108 urgent'), 'BC108');
  assert.equal(localDans('Problème général'), '');
});

test('rôles : qui peut valider, qui peut seulement consulter', () => {
  const lignes = [
    { Title: 'educ@ecole.be', Role: 'Secretariat' },
    { Title: 'dir@ecole.be', Role: { Value: 'Direction' } },
  ];
  assert.deepEqual(rolesDe(lignes, 'EDUC@ecole.be'), ['Secretariat']);
  assert.equal(peutValiderAvec(rolesDe(lignes, 'educ@ecole.be')), true, 'accents ignorés');
  assert.equal(peutValiderAvec(rolesDe(lignes, 'dir@ecole.be')), false);
  assert.equal(peutVoirAvec(rolesDe(lignes, 'dir@ecole.be')), true);
  assert.equal(peutVoirAvec([]), false);
});

test('démo : des propositions à valider, dont une bloquée et une avec changement de local', () => {
  for (const reel of ['2026-10-18T19:00:00', '2026-11-20T09:00:00', '2027-01-06T12:00:00']) {
    const m = momentDemo(new Date(reel));
    const ds = datasetDemo(m);
    const auj = iso(m);
    const sit = situation(minutesDe(m));
    const passee = sit.enCours ? sit.h : dernierePeriodeFinie(minutesDe(m));
    const attente = ds.deplacements.filter((d) => d.statut === 'En attente');
    assert.ok(attente.length >= 2, `au moins deux propositions (${reel})`);
    const analyses = attente.map((d) => ({ d, a: analyserProposition(ds, d, auj, passee) }));
    assert.ok(analyses.some(({ a }) => a.verif.ok), `une proposition valable (${reel})`);
    assert.ok(analyses.some(({ a }) => !a.verif.ok), `une proposition bloquée (${reel})`);
    assert.ok(analyses.some(({ a }) => a.verif.ok && a.verif.localChange), `un changement de local (${reel})`);
    // Le prof de démo a une suggestion, et l'option refusée n'est pas reproposée.
    const opts = optionsPour(ds, ds.moi.nom, auj, 6, auj, passee);
    assert.ok(opts.length > 0, `une suggestion pour le prof de démo (${reel})`);
    const refus = ds.decisions.find((x) => x.statut === 'Refusé' && x.prof === ds.moi.nom);
    assert.ok(refus);
    assert.ok(!opts.some((o) => o.dateO === refus.dateOrigine && o.hO === refus.hOrigine));
  }
});

test('bâtiments : chaque local de la liste appartient à un bâtiment du plan', async () => {
  const { LOCAUX } = await import('../src/data/locaux');
  const { BATIMENTS, nomEtage } = await import('../src/data/batiments');
  for (const l of LOCAUX) {
    const b = BATIMENTS.find((x) => x.code === l.batiment);
    assert.ok(b, `${l.code} : bâtiment ${l.batiment} inconnu`);
    assert.ok(b.etages.includes(l.etage) || b.code === 'Autres', `${l.code} : étage ${l.etage} absent de la façade ${b.sigle}`);
  }
  assert.equal(nomEtage(2, 'T'), '2e');
  assert.equal(nomEtage(0, 'PR'), 'Rez');
});
