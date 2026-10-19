// Paquet Teams fabriqué dans le navigateur : archive zip valide et manifeste relié à l'école.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { archiveZip, crc32 } from '../src/lib/zip';
import { ID_TEAMS, manifesteTeams } from '../src/lib/paquetTeams';
import { depuisLien, type ReglagesEcole } from '../src/lib/reglages';

const ECOLE: ReglagesEcole = {
  tenantId: '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
  clientId: 'f0e1d2c3-b4a5-4968-8776-655443322110',
  siteHost: 'ecoleexemple.sharepoint.com',
  sitePath: '/sites/BeHappi',
};

/** Lecteur zip minimal (répertoire central → fichiers), pour relire ce qu'on a écrit. */
function lireZip(zip: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const fin = zip.length - 22;
  assert.equal(v.getUint32(fin, true), 0x06054b50, 'fin du répertoire central');
  const n = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const fichiers = new Map<string, Uint8Array>();
  for (let i = 0; i < n; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50, 'entrée centrale');
    const crc = v.getUint32(p + 16, true);
    const taille = v.getUint32(p + 24, true);
    const lNom = v.getUint16(p + 28, true);
    const nom = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + lNom));
    const local = v.getUint32(p + 42, true);
    assert.equal(v.getUint32(local, true), 0x04034b50, 'en-tête local');
    assert.equal(v.getUint16(local + 8, true), 0, 'stocké');
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const donnees = zip.subarray(debut, debut + taille);
    assert.equal(crc32(donnees), crc, `CRC de ${nom}`);
    fichiers.set(nom, donnees);
    p += 46 + lNom;
  }
  return fichiers;
}

test('CRC-32 : valeur de contrôle du format', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test('Archive zip : relue à l’identique', () => {
  const icone = new Uint8Array(3000).map((_, i) => (i * 37) % 256);
  const zip = archiveZip([
    { nom: 'manifest.json', donnees: new TextEncoder().encode('{"é":"à"}') },
    { nom: 'color.png', donnees: icone },
  ], new Date(2026, 9, 19, 10, 30, 0));
  const f = lireZip(zip);
  assert.deepEqual([...f.keys()], ['manifest.json', 'color.png']);
  assert.equal(new TextDecoder().decode(f.get('manifest.json')), '{"é":"à"}');
  assert.deepEqual(f.get('color.png'), icone);
});

test('Identifiant Teams : le même que scripts/teams_zip.py (uuid5)', () => {
  const ns = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const h = createHash('sha1').update(Buffer.concat([ns, Buffer.from('be-happi.ipes-tubize')])).digest().subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString('hex');
  assert.equal(ID_TEAMS, `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`);
});

test('Manifeste Teams : onglet relié à l’école, domaine et version', () => {
  const modele = readFileSync(new URL('../public/teams/manifest.template.json', import.meta.url), 'utf8');
  const m = JSON.parse(manifesteTeams(modele, { url: 'https://aklbcode.github.io/be-happi', version: '1.0.0', ecole: ECOLE }));
  assert.equal(m.id, ID_TEAMS);
  assert.equal(m.version, '1.0.0');
  assert.deepEqual(m.validDomains, ['aklbcode.github.io']);
  const onglet = m.staticTabs[0];
  assert.match(onglet.contentUrl, /^https:\/\/aklbcode\.github\.io\/be-happi\/\?inTeams=1&ecole=/);
  assert.deepEqual(depuisLien(onglet.contentUrl), ECOLE);
  assert.deepEqual(depuisLien(onglet.websiteUrl), ECOLE);
  assert.ok(!JSON.stringify(m).includes('{{'), 'plus aucun champ à remplir');
  const demo = JSON.parse(manifesteTeams(modele, { url: 'https://aklbcode.github.io/be-happi/', version: '1.0.0' }));
  assert.equal(demo.staticTabs[0].contentUrl, 'https://aklbcode.github.io/be-happi/?inTeams=1');
});
