// Réglages de l'école hors du code : lien d'installation, adresses, QR codes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  avecEcole,
  depuisAdresse,
  depuisLien,
  estGuid,
  guidCourt,
  guidLong,
  lienInstallation,
  lireSite,
  parametreEcole,
  preparerReglages,
  reglagesActuels,
  valides,
  type ReglagesEcole,
} from '../src/lib/reglages';
import { config } from '../src/config';
import { lienApp } from '../src/lib/liens';
import { qrCode } from '../src/lib/qr';

// Valeurs inventées (jamais celles d'une vraie école dans le code ni les tests).
const ECOLE: ReglagesEcole = {
  tenantId: '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
  clientId: 'f0e1d2c3-b4a5-4968-8776-655443322110',
  siteHost: 'ecoleexemple.sharepoint.com',
  sitePath: '/sites/BeHappi',
};

test('GUID raccourci : 22 caractères, base64url standard, aller-retour exact', () => {
  for (let i = 0; i < 50; i++) {
    const g = randomUUID();
    const court = guidCourt(g);
    assert.equal(court.length, 22);
    assert.equal(court, Buffer.from(g.replace(/-/g, ''), 'hex').toString('base64url'), 'même codage que Python (urlsafe_b64encode)');
    assert.equal(guidLong(court), g);
  }
  assert.equal(guidLong('trop-court'), null);
  assert.equal(guidLong('AAAAAAAAAAAAAAAAAAAAAB'), null, 'les 4 derniers bits doivent être nuls');
});

test('Adresse du site : copiée telle quelle depuis le navigateur', () => {
  const attendu = { siteHost: 'ecoleexemple.sharepoint.com', sitePath: '/sites/BeHappi' };
  assert.deepEqual(lireSite('https://EcoleExemple.sharepoint.com/sites/BeHappi'), attendu);
  assert.deepEqual(lireSite(' ecoleexemple.sharepoint.com/sites/BeHappi/ '), attendu);
  assert.deepEqual(lireSite('https://ecoleexemple.sharepoint.com/sites/BeHappi/Lists/Horaires/AllItems.aspx?viewid=1'), attendu);
  assert.deepEqual(lireSite('https://ecoleexemple.sharepoint.com/teams/Profs'), { siteHost: 'ecoleexemple.sharepoint.com', sitePath: '/teams/Profs' });
  for (const faux of ['', 'https://ecoleexemple.sharepoint.com/', 'https://exemple.com/sites/BeHappi', 'https://ecoleexemple.sharepoint.com.piege.com/sites/x', 'https://ecoleexemple.sharepoint.com/personal/x'])
    assert.equal(lireSite(faux), null, faux);
});

test('Lien d’installation compact : aller-retour, forme lisible acceptée, liens abîmés refusés', () => {
  const p = parametreEcole(ECOLE);
  assert.match(p, /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}\.ecoleexemple\/sites\/BeHappi$/);
  assert.deepEqual(depuisAdresse(`?ecole=${p}`), ECOLE);
  assert.deepEqual(depuisAdresse(`?inTeams=1&ecole=${encodeURIComponent(p)}`), ECOLE, 'même encodé par un intermédiaire');
  const lisible = new URLSearchParams({ tenant: ECOLE.tenantId.toUpperCase(), client: ECOLE.clientId, site: 'https://ecoleexemple.sharepoint.com/sites/BeHappi' });
  assert.deepEqual(depuisAdresse(`?${lisible}`), ECOLE);
  assert.equal(depuisAdresse(''), null);
  assert.equal(depuisAdresse(`?ecole=${p.slice(1)}`), null);
  assert.equal(depuisAdresse('?tenant=abc&client=def&site=x'), null);
  assert.equal(valides({ ...ECOLE, siteHost: 'piege.com' }), false);
  assert.ok(estGuid(` ${ECOLE.clientId} `));
});

test('Adresses avec réglages : avant l’écran (#), après ?inTeams=1', () => {
  const p = parametreEcole(ECOLE);
  assert.equal(avecEcole('https://x.github.io/be-happi/#/signaler?local=BF110', ECOLE), `https://x.github.io/be-happi/?ecole=${p}#/signaler?local=BF110`);
  assert.equal(avecEcole('https://x.github.io/be-happi/?inTeams=1', ECOLE), `https://x.github.io/be-happi/?inTeams=1&ecole=${p}`);
  const lien = lienInstallation('https://x.github.io/be-happi/?vieux=1#/ecole', ECOLE);
  assert.equal(lien, `https://x.github.io/be-happi/?ecole=${p}`);
  assert.deepEqual(depuisLien(lien), ECOLE);
  assert.deepEqual(depuisLien(`${lien}#/eleve`), ECOLE);
  assert.equal(depuisLien('bonjour'), null);
});

test('QR codes des portes et du hall : réglages compris une fois l’école reliée, code toujours lisible', () => {
  const avant = { ...config };
  try {
    assert.equal(reglagesActuels(), null, 'démo par défaut');
    assert.equal(lienApp('signaler?local=BF110'), 'https://aklbcode.github.io/be-happi/#/signaler?local=BF110');
    Object.assign(config, { ...ECOLE, sitePath: '/sites/BeHappi-IPES-Tubize-2026' });
    const porte = lienApp('signaler?local=BF110');
    assert.ok(porte.includes('?ecole='), porte);
    assert.equal(depuisLien(porte)?.sitePath, '/sites/BeHappi-IPES-Tubize-2026');
    const modules = qrCode(porte).length;
    assert.ok(modules <= 53, `QR version 9 au plus (${modules} modules)`);
    assert.doesNotThrow(() => qrCode(lienApp('eleve')));
  } finally {
    Object.assign(config, avant);
  }
});

test('Démarrage hors navigateur : démo, sans erreur', () => {
  assert.deepEqual(preparerReglages(false), { etat: 'pret' });
  assert.equal(config.siteHost, '');
});
