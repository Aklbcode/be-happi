// Simulation sur les vraies données, sans connexion Microsoft : les listes exportées de SharePoint
// (Exporter → Exporter au format CSV) sont déposées dans l'app et restent SUR CET APPAREIL
// (IndexedDB du navigateur). Rien n'est publié ni envoyé : les écritures (réserver, valider…)
// modifient seulement cette copie. Un « faux Graph » en mémoire répond à la place de Microsoft,
// si bien que toute l'app tourne comme en vrai.

import { config } from '../config';
import { sansAccents } from './champs';

const CLE = 'behappi-simulation';
const BASE = 'behappi-simulation';

interface ItemSim {
  id: string;
  eTag: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: { user?: { displayName?: string; email?: string } };
  lastModifiedBy?: { user?: { displayName?: string } };
  fields: Record<string, unknown>;
}

interface ListeSim {
  id: string;
  colonnes: string[];
  items: ItemSim[];
}

export interface EtatSimulation {
  listes: Record<string, ListeSim>;
  moi: { givenName: string; mail: string };
  importeLe: string;
}

/** La simulation est-elle active sur cet appareil ? (lu de façon synchrone au démarrage) */
export function simulationActive(): boolean {
  try {
    return localStorage.getItem(CLE) === '1';
  } catch {
    return false;
  }
}

// ---------- Stockage local (IndexedDB : plus de place que localStorage) ----------

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('donnees');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function operation<T>(mode: IDBTransactionMode, faire: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await ouvrir();
  return new Promise<T>((ok, ko) => {
    const t = db.transaction('donnees', mode);
    const r = faire(t.objectStore('donnees'));
    t.oncomplete = () => {
      db.close();
      ok(r.result as T);
    };
    t.onerror = () => ko(t.error);
  });
}

let etat: EtatSimulation | null = null;

async function charger(): Promise<EtatSimulation> {
  if (etat) return etat;
  const e = await operation<EtatSimulation | undefined>('readonly', (s) => s.get('etat'));
  if (!e) throw new Error('Simulation : données introuvables sur cet appareil. Importe à nouveau les fichiers.');
  etat = e;
  return e;
}

/** Pour les tests : utiliser cet état sans IndexedDB (rien n'est enregistré). */
export function utiliserEtat(e: EtatSimulation): void {
  etat = e;
  memoireSeule = true;
}
let memoireSeule = false;

const sauver = () => (memoireSeule ? Promise.resolve() : etat ? operation('readwrite', (s) => s.put(etat, 'etat')) : Promise.resolve());

/** Démarre la simulation avec ces listes (remplace une simulation précédente). */
export async function demarrerSimulation(e: EtatSimulation): Promise<void> {
  etat = e;
  await sauver();
  localStorage.setItem(CLE, '1');
  localStorage.removeItem('behappi-cache-v3');
}

/** Arrête la simulation et efface la copie des données de cet appareil. */
export async function arreterSimulation(): Promise<void> {
  try {
    localStorage.removeItem(CLE);
    localStorage.removeItem('behappi-cache-v3');
  } catch {
    /* rien */
  }
  etat = null;
  await operation('readwrite', (s) => s.delete('etat')).catch(() => undefined);
}

export async function infoSimulation(): Promise<{ moi: string; importeLe: string; listes: [string, number][] } | null> {
  try {
    const e = await charger();
    return { moi: e.moi.mail, importeLe: e.importeLe, listes: Object.entries(e.listes).map(([n, l]) => [n, l.items.length]) };
  } catch {
    return null;
  }
}

// ---------- Lecture des fichiers CSV exportés ----------

/** CSV (virgule ou point-virgule, guillemets, retours à la ligne dans une cellule). */
export function lireCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, '');
  const fin = t.indexOf('\n');
  const premiere = fin < 0 ? t : t.slice(0, fin);
  const sep = (premiere.match(/;/g) ?? []).length > (premiere.match(/,/g) ?? []).length ? ';' : ',';
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = '';
  let guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') {
        cellule += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else cellule += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) {
      ligne.push(cellule);
      cellule = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      ligne.push(cellule);
      if (ligne.some((x) => x !== '')) lignes.push(ligne);
      ligne = [];
      cellule = '';
    } else cellule += c;
  }
  ligne.push(cellule);
  if (ligne.some((x) => x !== '')) lignes.push(ligne);
  return lignes;
}

/** « 19/10/2026 08:25 » ou « 19/10/2026 » → date ISO ; autre chose → tel quel. */
export function versDate(v: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v.trim());
  if (m) {
    const d = m[4] != null ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] ?? 0)) : new Date(+m[3], +m[2] - 1, +m[1], 12);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v.trim());
  if (iso) {
    const d = iso[4] != null ? new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] ?? 0)) : new Date(+iso[1], +iso[2] - 1, +iso[3], 12);
    return d.toISOString();
  }
  return null;
}

/** Le nom de liste (config.listes) qui correspond à un nom de fichier exporté. */
export function listePourFichier(nomFichier: string): string | null {
  const n = sansAccents(nomFichier.replace(/\.csv$/i, '').replace(/\s*\(\d+\)$/, ''));
  return Object.values(config.listes).find((l) => sansAccents(l) === n) ?? null;
}

/** Les noms internes connus (config.champs), pour retrouver chaque colonne de l'export. */
function nomsInternes(): Map<string, string> {
  const m = new Map<string, string>();
  for (const champs of Object.values(config.champs)) for (const nom of Object.values(champs)) m.set(sansAccents(nom), nom);
  return m;
}

/** Transforme un export CSV d'une liste en éléments « comme Graph ». */
export function versListe(id: string, lignes: string[][]): ListeSim {
  const [entetes = [], ...donnees] = lignes;
  const connus = nomsInternes();
  const role = entetes.map((h) => {
    const n = sansAccents(h);
    if (n === 'titre' || n === 'title') return 'Title';
    if (n === 'cree' || n === 'created') return '@cree';
    if (n === 'creepar' || n === 'createdby' || n === 'auteur') return '@auteur';
    if (n === 'modifie' || n === 'modified') return '@modifie';
    if (n === 'modifiepar' || n === 'modifiedby') return '@modifiepar';
    return connus.get(n) ?? h.trim();
  });
  const items = donnees.map((cellules, i): ItemSim => {
    const it: ItemSim = { id: String(i + 1), eTag: `"${i + 1},1"`, fields: {} };
    role.forEach((r, j) => {
      const v = (cellules[j] ?? '').trim();
      if (!v) return;
      if (r === '@cree') {
        it.createdDateTime = versDate(v) ?? undefined;
        it.fields.Created = it.createdDateTime;
      } else if (r === '@auteur') it.createdBy = { user: { displayName: v } };
      else if (r === '@modifie') it.lastModifiedDateTime = versDate(v) ?? undefined;
      else if (r === '@modifiepar') it.lastModifiedBy = { user: { displayName: v } };
      else it.fields[r] = versDate(v) ?? v;
    });
    return it;
  });
  return { id, colonnes: role.filter((r) => !r.startsWith('@')), items };
}

// ---------- Le faux Microsoft Graph ----------

let suivant = 100000;

/** Répond à un appel Graph comme le ferait Microsoft, sur la copie locale. */
export async function repondreSimulation(url: string, init: RequestInit = {}): Promise<{ status: number; corps: unknown }> {
  const e = await charger();
  const u = new URL(url, 'https://graph.microsoft.com/v1.0/');
  const chemin = decodeURIComponent(u.pathname.replace(/^\/v1\.0/, ''));
  const methode = (init.method ?? 'GET').toUpperCase();
  const listeParId = (id: string) => Object.values(e.listes).find((l) => l.id === id);
  if (chemin === '/me') return { status: 200, corps: { givenName: e.moi.givenName, mail: e.moi.mail, userPrincipalName: e.moi.mail } };
  if (/^\/sites\/[^/]*:[^/]*$/.test(chemin)) return { status: 200, corps: { id: 'simulation' } };
  if (chemin === '/sites/simulation/lists') return { status: 200, corps: { value: Object.entries(e.listes).map(([displayName, l]) => ({ id: l.id, displayName, name: displayName })) } };
  const col = /^\/sites\/simulation\/lists\/([^/]+)\/columns$/.exec(chemin);
  if (col) {
    const l = listeParId(col[1]);
    if (!l) return { status: 404, corps: 'liste introuvable' };
    return { status: 200, corps: { value: ['Title', 'Created', ...l.colonnes.filter((c) => c !== 'Title')].map((n) => ({ name: n, displayName: n, hidden: false, readOnly: false })) } };
  }
  const m = /^\/sites\/simulation\/lists\/([^/]+)\/items(?:\/([^/]+))?(\/fields)?$/.exec(chemin);
  if (!m) return { status: 404, corps: `route inconnue ${methode} ${chemin}` };
  const l = listeParId(m[1]);
  if (!l) return { status: 404, corps: 'liste introuvable' };
  if (!m[2] && methode === 'GET') return { status: 200, corps: { value: l.items } };
  if (!m[2] && methode === 'POST') {
    const { fields } = JSON.parse(String(init.body)) as { fields: Record<string, unknown> };
    const maintenant = new Date().toISOString();
    const it: ItemSim = { id: String(suivant++), eTag: '"1,1"', createdDateTime: maintenant, lastModifiedDateTime: maintenant, createdBy: { user: { displayName: e.moi.givenName, email: e.moi.mail } }, fields: { ...fields, Created: maintenant } };
    l.items.push(it);
    await sauver();
    return { status: 201, corps: it };
  }
  const it = l.items.find((x) => x.id === m[2]);
  if (!it) return { status: 404, corps: 'élément introuvable' };
  if (methode === 'DELETE') {
    l.items = l.items.filter((x) => x !== it);
    await sauver();
    return { status: 204, corps: null };
  }
  if (methode === 'PATCH' && m[3]) {
    const attendu = (init.headers as Record<string, string> | undefined)?.['If-Match'];
    if (attendu && attendu !== it.eTag) return { status: 412, corps: 'modifié entre-temps' };
    Object.assign(it.fields, JSON.parse(String(init.body)));
    it.eTag = `"${it.id},${Number(/,(\d+)/.exec(it.eTag)?.[1] ?? 1) + 1}"`;
    it.lastModifiedDateTime = new Date().toISOString();
    it.lastModifiedBy = { user: { displayName: e.moi.givenName } };
    await sauver();
    return { status: 200, corps: it.fields };
  }
  if (methode === 'GET') return { status: 200, corps: it };
  return { status: 405, corps: 'non pris en charge' };
}
