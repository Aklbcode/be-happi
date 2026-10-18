// Lecture et écriture des listes SharePoint de l'école via Microsoft Graph.
// Les données ne quittent pas Microsoft 365 : le navigateur parle directement à Graph.

import { config } from '../config';
import { jeton } from '../lib/auth';
import { iso } from '../lib/calendar';
import { LOCAUX } from './locaux';
import type { Absence, Cours, Dataset, Deplacement, Info, Reservation, Signalement } from './types';

const GRAPH = 'https://graph.microsoft.com/v1.0';

type Champs = Record<string, unknown>;
interface Item { id: string; fields: Champs }

async function appel(url: string, init: RequestInit = {}): Promise<any> {
  const t = await jeton();
  const r = await fetch(url.startsWith('http') ? url : GRAPH + url, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
      Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly',
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) {
    const corps = await r.text();
    throw new Error(`Microsoft Graph ${r.status} : ${corps.slice(0, 300)}`);
  }
  return r.status === 204 ? null : r.json();
}

async function tout(url: string): Promise<any[]> {
  const sortie: any[] = [];
  let suivant: string | undefined = url;
  while (suivant) {
    const page: any = await appel(suivant);
    sortie.push(...(page.value ?? []));
    suivant = page['@odata.nextLink'];
  }
  return sortie;
}

let siteId: string | null = null;
let idsListes: Record<string, string> | null = null;

export async function site(): Promise<string> {
  if (siteId) return siteId;
  const s = await appel(`/sites/${config.siteHost}:${config.sitePath}`);
  siteId = s.id as string;
  return siteId;
}

export async function listes(): Promise<Record<string, string>> {
  if (idsListes) return idsListes;
  const s = await site();
  const toutes = await tout(`/sites/${s}/lists?$select=id,displayName,name&$top=200`);
  idsListes = {};
  for (const l of toutes) idsListes[l.displayName as string] = l.id as string;
  return idsListes;
}

async function itemsDe(nomListe: string): Promise<Item[]> {
  const ids = await listes();
  const id = ids[nomListe];
  if (!id) return [];
  const s = await site();
  return tout(`/sites/${s}/lists/${id}/items?$expand=fields&$top=999`);
}

/**
 * Noms qui désignent la même colonne selon la langue du site ou l'outil qui l'a créée.
 * Ex. Power Apps affiche « Titre » mais Graph renvoie « Title ».
 */
const ALIAS: Record<string, string[]> = {
  Title: ['Titre'],
  Titre: ['Title'],
  Email: ['Mail', 'E_x002d_mail', 'Courriel'],
  Mail: ['Email', 'E_x002d_mail', 'Courriel'],
};

/** Lit une colonne, en essayant ses autres noms connus si elle est absente. */
function val(f: Champs, nom: string): unknown {
  if (f[nom] != null) return f[nom];
  for (const a of ALIAS[nom] ?? []) if (f[a] != null) return f[a];
  return undefined;
}

const txt = (v: unknown): string => {
  if (v == null) return '';
  // Colonne Choix ou Personne renvoyée comme objet.
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.Value ?? o.LookupValue ?? o.displayName ?? '').trim();
  }
  return String(v).trim();
};
const num = (v: unknown): number => Number(v ?? 0) || 0;
/** Les dates SharePoint arrivent en UTC : on les ramène au jour local. */
const jour = (v: unknown): string => (v ? iso(new Date(String(v))) : '');
const versUtcMidi = (date: string): string => `${date}T12:00:00Z`;

/** Le compte connecté (prénom et adresse e-mail). */
export async function profil(): Promise<{ prenom: string; email: string }> {
  const me = await appel('/me?$select=givenName,mail,userPrincipalName');
  return { prenom: txt(me.givenName), email: txt(me.mail) || txt(me.userPrincipalName) };
}

export async function chargerSharePoint(email: string, prenom: string): Promise<Dataset> {
  const C = config.champs;
  const L = config.listes;
  const [hor, profs, abs, res, dep, inf, sig] = await Promise.all([
    itemsDe(L.horaires), itemsDe(L.profs), itemsDe(L.absences), itemsDe(L.reservations),
    itemsDe(L.deplacements), itemsDe(L.infos), itemsDe(L.signalements),
  ]);

  const cours: Cours[] = hor.map((it) => {
    const f = it.fields;
    const classe = txt(val(f, C.horaires.classes));
    return {
      id: it.id,
      prof: txt(val(f, C.horaires.prof)),
      jour: num(val(f, C.horaires.jour)),
      h: num(val(f, C.horaires.heure)),
      classes: classe.split(',').map((x) => x.trim()).filter(Boolean),
      classe,
      local: txt(val(f, C.horaires.local)),
      matiere: txt(val(f, C.horaires.matiere)),
    };
  });

  const nom = reconnaitre(profs.map((p) => p.fields), email);

  const absences: Absence[] = abs.map((it) => ({
    prof: txt(val(it.fields, C.absences.prof)),
    date: jour(val(it.fields, C.absences.date)),
    deH: num(val(it.fields, C.absences.deH)) || 1,
    aH: num(val(it.fields, C.absences.aH)) || 9,
  }));

  const reservations: Reservation[] = res.map((it) => ({
    id: it.id,
    prof: txt(val(it.fields, C.reservations.prof)),
    date: jour(val(it.fields, C.reservations.date)),
    h: num(val(it.fields, C.reservations.heure)),
    local: txt(val(it.fields, C.reservations.local)),
    classe: txt(val(it.fields, C.reservations.classe)),
  }));

  const deplacements: Deplacement[] = dep.map((it) => ({
    id: it.id,
    absent: txt(val(it.fields, C.deplacements.absent)),
    date: jour(val(it.fields, C.deplacements.date)),
    hVide: num(val(it.fields, C.deplacements.hVide)),
    classe: txt(val(it.fields, C.deplacements.classe)),
    prof: txt(val(it.fields, C.deplacements.prof)),
    hOrigine: num(val(it.fields, C.deplacements.hOrigine)),
    dateOrigine: jour(val(it.fields, C.deplacements.dateOrigine)) || jour(val(it.fields, C.deplacements.date)),
    statut: txt(val(it.fields, C.deplacements.statut)) || 'En attente',
  }));

  const infos: Info[] = inf.map((it) => ({
    date: jour(val(it.fields, C.infos.date)),
    categorie: txt(val(it.fields, C.infos.categorie)),
    titre: txt(val(it.fields, C.infos.titre)),
  }));

  const signalements: Signalement[] = sig
    .filter((it) => !/fait|résolu|resolu/i.test(txt(val(it.fields, C.signalements.statut))))
    .map((it) => {
      const titre = txt(val(it.fields, C.signalements.titre)) || 'Signalement';
      const urgence = txt(val(it.fields, C.signalements.urgence));
      return {
        local: localDans(titre),
        titre,
        depuis: jour(val(it.fields, C.signalements.date)),
        bloquant: /urgent|bloqu|indispo/i.test(`${urgence} ${txt(val(it.fields, C.signalements.statut))}`),
      };
    });

  return { moi: { nom, prenom, email }, cours, absences, reservations, deplacements, infos, locaux: LOCAUX, signalements };
}

const sansAccents = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Retrouve le nom du prof (tel qu'il est écrit dans Horaires) à partir de son adresse e-mail.
 * 1. La colonne e-mail de la liste Profs.
 * 2. Sinon, comme l'app Power Apps : la partie après le premier point de l'adresse
 *    (prenom.nom@… → nom) comparée au nom de la liste Profs, sans accents ni espaces,
 *    et seulement si un seul prof correspond.
 */
export function reconnaitre(profs: Champs[], email: string): string {
  const C = config.champs.profs;
  const mail = email.toLowerCase();
  const fiche = profs.find((p) => txt(val(p, C.mail)).toLowerCase() === mail);
  if (fiche) return txt(val(fiche, C.nom));

  const local = mail.split('@')[0] ?? '';
  const point = local.indexOf('.');
  if (point < 0) return '';
  const cle = sansAccents(local.slice(point + 1));
  if (!cle) return '';
  const nomSeul = (t: string): string => (t.includes(' (') ? t.slice(0, t.indexOf(' (')) : t);
  const trouves = profs.filter((p) => sansAccents(nomSeul(txt(val(p, C.nom)))) === cle);
  return trouves.length === 1 ? txt(val(trouves[0], C.nom)) : '';
}

/** Le formulaire de signalement n'a pas de colonne Local : on cherche un code de local dans le texte. */
export function localDans(texte: string): string {
  const t = sansAccents(texte);
  let meilleur = '';
  for (const l of LOCAUX) {
    const code = sansAccents(l.code);
    // Le plus long code trouvé gagne (BF005A avant BF005).
    if (code.length > meilleur.length && t.includes(code)) meilleur = l.code;
  }
  return meilleur;
}

async function creer(nomListe: string, fields: Champs): Promise<string> {
  const ids = await listes();
  const id = ids[nomListe];
  if (!id) throw new Error(`Liste introuvable : ${nomListe}`);
  const s = await site();
  const r = await appel(`/sites/${s}/lists/${id}/items`, { method: 'POST', body: JSON.stringify({ fields }) });
  return r.id as string;
}

export async function enregistrerReservation(r: Reservation): Promise<string> {
  const C = config.champs.reservations;
  return creer(config.listes.reservations, {
    [C.prof]: r.prof, [C.date]: versUtcMidi(r.date), [C.heure]: r.h, [C.local]: r.local, [C.classe]: r.classe,
    // Comme Power Apps : le prof qui a normalement ce local à cette heure.
    ...(r.absent ? { [C.absent]: r.absent } : {}),
  });
}

export async function enregistrerDeplacement(d: Deplacement): Promise<string> {
  const C = config.champs.deplacements;
  return creer(config.listes.deplacements, {
    [C.absent]: d.absent, [C.date]: versUtcMidi(d.date), [C.hVide]: d.hVide, [C.classe]: d.classe,
    [C.prof]: d.prof, [C.hOrigine]: d.hOrigine, [C.dateOrigine]: versUtcMidi(d.dateOrigine), [C.statut]: d.statut,
  });
}

export interface DiagListe {
  liste: string;
  trouvee: boolean;
  /** Colonnes de la liste (nom interne), sans les colonnes système. */
  colonnes: string[];
  /** Colonnes attendues par Be Happi mais absentes, avec une piste quand une colonne porte ce nom affiché. */
  manquantes: { attendu: string; piste?: string }[];
}

const SYSTEME = new Set(['Created', 'Modified', 'Author', 'Editor', 'ID', 'Title']);

/** Pour l'écran Connexion : chaque liste, ses colonnes et celles qui manquent à Be Happi. */
export async function diagnostic(): Promise<DiagListe[]> {
  const ids = await listes();
  const s = await site();
  const sortie: DiagListe[] = [];
  const champs = config.champs as Record<string, Record<string, string>>;
  for (const [cle, nom] of Object.entries(config.listes)) {
    const id = ids[nom];
    if (!id) {
      sortie.push({ liste: nom, trouvee: false, colonnes: [], manquantes: [] });
      continue;
    }
    const cols: { name: string; displayName: string; hidden?: boolean; readOnly?: boolean }[] =
      await tout(`/sites/${s}/lists/${id}/columns?$select=name,displayName,hidden,readOnly`);
    const noms = new Set(cols.map((c) => c.name));
    const visibles = cols
      .filter((c) => !c.hidden && (!c.readOnly || SYSTEME.has(c.name)) && !c.name.startsWith('_'))
      .map((c) => c.name);
    const manquantes: DiagListe['manquantes'] = [];
    for (const attendu of Object.values(champs[cle] ?? {})) {
      if (noms.has(attendu) || (ALIAS[attendu] ?? []).some((a) => noms.has(a))) continue;
      const piste = cols.find((c) => sansAccents(c.displayName) === sansAccents(attendu));
      manquantes.push({ attendu, piste: piste?.name });
    }
    sortie.push({ liste: nom, trouvee: true, colonnes: visibles, manquantes });
  }
  return sortie;
}
