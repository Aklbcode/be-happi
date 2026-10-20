// Mode réel contre un faux Microsoft Graph en mémoire : qui est reconnu (prof, éducatrice, élève),
// ce qu'un élève charge (rien du personnel), et les écritures (colonnes facultatives, publication élèves).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, plusJours } from '../src/lib/calendar';

// Dates relatives à aujourd'hui : le test reste valable toute l'année.
const J = (n: number) => iso(plusJours(new Date(), n));
const T = (n: number) => `${J(n)}T12:00:00Z`;

type Item = { id: string; eTag: string; createdDateTime: string; createdBy: { user: { displayName: string; email: string } }; fields: Record<string, unknown> };
const listes: Record<string, { id: string; items: Item[]; refuse?: string[] }> = {};
let n = 1;
const ajouterListe = (nom: string, items: Record<string, unknown>[], refuse?: string[]) => {
  listes[nom] = {
    id: `L${n++}`,
    refuse,
    items: items.map((f, i) => ({ id: `${i + 1}`, eTag: `"e${i}"`, createdDateTime: `${J(-1)}T08:00:00Z`, createdBy: { user: { displayName: 'Auteur Test', email: 'auteur@ecole.example' } }, fields: f })),
  };
};
const listeParId = (id: string) => Object.entries(listes).find(([, l]) => l.id === id);
const journal: string[] = [];

ajouterListe('Profs', [{ Title: 'LAMBERT', Email: 'luc.lambert@ecole.example' }, { Title: 'DURANT' }]);
ajouterListe('Roles', [{ Title: 'educ@ecole.example', Role: 'Éducatrice' }, { Title: 'tech@ecole.example', Role: { Value: 'Service technique' } }]);
ajouterListe('Horaires', [
  { Title: 'LAMBERT', JourNum: 1, Heure: 3, Classes: '5TQB', Local: 'BF110', Matiere: 'Géographie' },
  { Title: 'DURANT', JourNum: 1, Heure: 4, Classes: '3A, 3B', Local: 'BC105', Matiere: 'Histoire' },
]);
ajouterListe('Absences', [{ Title: 'DURANT', DateAbs: T(1), DeH: 1, AH: 9, Motif: 'Maladie' }], ['Motif']);
ajouterListe('Réservations', []);
ajouterListe('Deplacements', [{ Title: 'DURANT', DateDep: T(1), HeureVide: 4, Classe: '3A, 3B', Collegue: 'LAMBERT', HeureOrigine: 3, DateOrigine: T(1), Statut: '' }]);
ajouterListe('Infos', [{ Title: 'Info du jour', DateInfo: T(1), Categorie: 'Info' }]);
ajouterListe('Signalements', [{ Title: 'BF110 · Store bloqué', Statut: { Value: 'En cours' }, Urgence: { Value: 'Normale' }, Created: `${J(-1)}T08:00:00Z` }]);
ajouterListe('Materiel', []);
ajouterListe('Changements', [
  { Title: 'ancien', DateChg: T(1), Heure: 4, Classe: '3A', TypeChg: 'Étude' },
  { Title: 'autre jour', DateChg: T(2), Heure: 1, Classe: '3A', TypeChg: 'Étude' },
]);
ajouterListe('HorairesEleves', [{ JourNum: 1, Heure: 4, Classes: '3A, 3B', Matiere: 'Histoire', Local: 'BC105' }]);

let utilisateur = { givenName: 'Luc', mail: 'luc.lambert@ecole.example' };

globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const chemin = decodeURIComponent(url.pathname.replace('/v1.0', ''));
  const methode = (init.method ?? 'GET').toUpperCase();
  const json = (code: number, corps: unknown) => new Response(code === 204 ? null : JSON.stringify(corps), { status: code, headers: { 'Content-Type': 'application/json' } });
  journal.push(`${methode} ${chemin}`);
  if (chemin === '/me') return json(200, utilisateur);
  if (/^\/sites\/[^/]*:[^/]*$/.test(chemin)) return json(200, { id: 'site1' });
  if (chemin === '/sites/site1/lists') return json(200, { value: Object.entries(listes).map(([displayName, l]) => ({ id: l.id, displayName, name: displayName })) });
  const m = chemin.match(/^\/sites\/site1\/lists\/([^/]+)\/items(?:\/([^/]+))?(\/fields)?$/);
  if (m) {
    const trouvee = listeParId(m[1]);
    if (!trouvee) return json(404, { error: 'liste' });
    const [, l] = trouvee;
    if (!m[2] && methode === 'GET') return json(200, { value: l.items });
    if (!m[2] && methode === 'POST') {
      const { fields } = JSON.parse(String(init.body));
      const refus = (l.refuse ?? []).find((c) => c in fields);
      if (refus) return json(400, { error: { message: `Field '${refus}' is not recognized` } });
      const it: Item = { id: String(100 + l.items.length), eTag: '"n"', createdDateTime: new Date().toISOString(), createdBy: { user: { displayName: 'Luc Lambert', email: utilisateur.mail } }, fields };
      l.items.push(it);
      return json(201, it);
    }
    const it = l.items.find((x) => x.id === m[2]);
    if (!it) return json(404, { error: 'item' });
    if (methode === 'DELETE') {
      l.items = l.items.filter((x) => x !== it);
      return json(204, null);
    }
    if (methode === 'PATCH' && m[3]) {
      Object.assign(it.fields, JSON.parse(String(init.body)));
      return json(200, it.fields);
    }
    if (methode === 'GET') return json(200, it);
  }
  return json(404, { error: `route inconnue ${methode} ${chemin}` });
}) as typeof fetch;

const sp = await import('../src/data/sharepoint');


test('SharePoint · Un prof reconnu par la colonne Email.', async () => {
  const prof = await sp.chargerSharePoint('luc.lambert@ecole.example', 'Luc');
  assert.equal(prof.moi.nom, 'LAMBERT');
  assert.deepEqual(prof.moi.profils, ['prof']);
  assert.equal(prof.cours.length, 2);
  assert.deepEqual(prof.cours[1].classes, ['3A', '3B']);
  assert.equal(prof.deplacements[0].statut, 'Validé', 'statut vide = validé, comme Power Apps');
  assert.equal(prof.signalements[0].statut, 'En cours');
  assert.equal(prof.signalements[0].local, 'BF110');
  assert.equal(prof.signalements[0].auteurMail, 'auteur@ecole.example');
  assert.equal(prof.changements.length, 2, 'changements récents ou à venir');
  assert.equal(prof.coursEleves.length, 2, 'horaire élève déduit de l’horaire');
  assert.equal(prof.profs.find((p) => p.nom === 'LAMBERT')?.email, 'luc.lambert@ecole.example');
  assert.ok(!JSON.stringify(prof.absences).includes('Maladie'), 'le motif n’est jamais lu');
  assert.deepEqual(prof.absentes, ['decisions', 'capReussite', 'resultats']);
});

test('SharePoint · Une éducatrice (liste Roles), sans horaire.', async () => {
  utilisateur = { givenName: 'Eva', mail: 'educ@ecole.example' };
  const educ = await sp.chargerSharePoint('educ@ecole.example', 'Eva');
  assert.deepEqual(educ.moi.profils, ['educateur']);
  assert.equal(educ.cours.length, 2, 'le personnel charge l’horaire');
});

test('SharePoint · Un élève : rien du personnel.', async () => {
  utilisateur = { givenName: 'Zoé', mail: 'zoe@eleve.example' };
  journal.length = 0;
  const eleve = await sp.chargerSharePoint('zoe@eleve.example', 'Zoé');
  assert.deepEqual(eleve.moi.profils, ['eleve']);
  assert.equal(eleve.cours.length, 0);
  assert.equal(eleve.absences.length + eleve.reservations.length + eleve.deplacements.length + eleve.infos.length + eleve.profs.length, 0);
  assert.equal(eleve.coursEleves.length, 1);
  assert.equal(eleve.signalements.length, 0, 'seulement ses propres signalements');
  const lus = journal.filter((l) => l.startsWith('GET /sites/site1/lists/') && l.endsWith('/items')).map((l) => Object.entries(listes).find(([, x]) => l.includes(`/lists/${x.id}/`))?.[0]);
  assert.deepEqual(lus.sort(), ['Changements', 'HorairesEleves', 'Profs', 'Roles', 'Signalements'].sort(), `listes lues par un élève : ${lus.join(', ')}`);
});

test('SharePoint · Écritures.', async () => {
  const idAbs = await sp.enregistrerAbsence({ prof: 'DURANT', date: J(2), deH: 2, aH: 5 });
  const abs = listes['Absences'].items.find((x) => x.id === idAbs)!;
  assert.equal(abs.fields.Motif, undefined, 'colonne Motif refusée : réessai sans elle');
  assert.equal(abs.fields.DeH, 2);
  await sp.modifierAbsence(idAbs, 3, 4);
  assert.equal(abs.fields.DeH, 3);
  await sp.supprimerAbsence(idAbs);
  assert.ok(!listes['Absences'].items.some((x) => x.id === idAbs));
  await sp.supprimerAbsence(idAbs); // déjà supprimée : pas d'erreur

  const idSig = await sp.enregistrerSignalement('BT004 · Le projecteur clignote', true);
  assert.equal(listes['Signalements'].items.find((x) => x.id === idSig)!.fields.Urgence, 'Urgente');
  await sp.traiterSignalement(idSig, 'Résolu', 'Lampe changée.');
  const sig = listes['Signalements'].items.find((x) => x.id === idSig)!;
  assert.equal(sig.fields.Statut, 'Résolu');
  assert.equal(sig.fields.Reponse, 'Lampe changée.');

  await sp.enregistrerMateriel({ prof: 'LAMBERT', date: J(1), h: 3, rack: 'Rack tablettes A', classe: '5TQB' });
  assert.equal(listes['Materiel'].items.length, 1);

  await sp.enregistrerInfo({ date: J(1), categorie: 'Retard', titre: 'Bus en retard' });
  assert.equal(listes['Infos'].items.length, 2);

  const nb = await sp.publierChangements(J(1), [
    { date: J(1), h: 4, classe: '3A', type: 'Étude', titre: 'Pas de cours de Histoire (DURANT absent(e)) → étude' },
    { date: J(1), h: 4, classe: '3B', type: 'Étude', titre: 'Pas de cours de Histoire (DURANT absent(e)) → étude' },
  ]);
  assert.equal(nb, 2);
  const chg = listes['Changements'].items;
  assert.equal(chg.length, 3, 'le jour publié est remplacé, les autres jours restent');
  assert.ok(chg.some((x) => x.fields.Title === 'autre jour'));
  assert.ok(!chg.some((x) => x.fields.Title === 'ancien'));
});

test('SharePoint · Retirer sa proposition : seulement tant qu’elle attend.', async () => {
  const id = await sp.enregistrerDeplacement({ absent: 'DURANT', date: J(1), hVide: 4, classe: '3A, 3B', prof: 'LAMBERT', hOrigine: 3, dateOrigine: J(1), statut: 'En attente' });
  assert.ok(listes['Deplacements'].items.some((x) => x.id === id));
  await sp.retirerDeplacement({ id, absent: 'DURANT', date: J(1), hVide: 4, classe: '3A, 3B', prof: 'LAMBERT', hOrigine: 3, dateOrigine: J(1), statut: 'En attente' });
  assert.ok(!listes['Deplacements'].items.some((x) => x.id === id), 'ligne supprimée, comme « Annuler » dans Power Apps');
  // Déjà retirée : rien à faire, pas d'erreur.
  await sp.retirerDeplacement({ id, absent: 'DURANT', date: J(1), hVide: 4, classe: '3A, 3B', prof: 'LAMBERT', hOrigine: 3, dateOrigine: J(1), statut: 'En attente' });
  // Validée entre-temps (statut vide = confirmé pour Power Apps) : on ne touche à rien.
  const validee = listes['Deplacements'].items[0];
  await assert.rejects(
    sp.retirerDeplacement({ id: validee.id, absent: 'DURANT', date: J(1), hVide: 4, classe: '3A, 3B', prof: 'LAMBERT', hOrigine: 3, dateOrigine: J(1), statut: 'En attente' }),
    /Déjà validée/,
  );
  assert.ok(listes['Deplacements'].items.includes(validee));
});
