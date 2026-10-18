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

const txt = (v: unknown): string => (v == null ? '' : String(v)).trim();
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
    const classe = txt(f[C.horaires.classes]);
    return {
      id: it.id,
      prof: txt(f[C.horaires.prof]),
      jour: num(f[C.horaires.jour]),
      h: num(f[C.horaires.heure]),
      classes: classe.split(',').map((x) => x.trim()).filter(Boolean),
      classe,
      local: txt(f[C.horaires.local]),
      matiere: txt(f[C.horaires.matiere]),
    };
  });

  const fiche = profs.find((p) => txt(p.fields[C.profs.mail]).toLowerCase() === email.toLowerCase());
  const nom = fiche ? txt(fiche.fields[C.profs.nom]) : '';

  const absences: Absence[] = abs.map((it) => ({
    prof: txt(it.fields[C.absences.prof]),
    date: jour(it.fields[C.absences.date]),
    deH: num(it.fields[C.absences.deH]) || 1,
    aH: num(it.fields[C.absences.aH]) || 9,
  }));

  const reservations: Reservation[] = res.map((it) => ({
    id: it.id,
    prof: txt(it.fields[C.reservations.prof]),
    date: jour(it.fields[C.reservations.date]),
    h: num(it.fields[C.reservations.heure]),
    local: txt(it.fields[C.reservations.local]),
    classe: txt(it.fields[C.reservations.classe]),
  }));

  const deplacements: Deplacement[] = dep.map((it) => ({
    id: it.id,
    absent: txt(it.fields[C.deplacements.absent]),
    date: jour(it.fields[C.deplacements.date]),
    hVide: num(it.fields[C.deplacements.hVide]),
    classe: txt(it.fields[C.deplacements.classe]),
    prof: txt(it.fields[C.deplacements.prof]),
    hOrigine: num(it.fields[C.deplacements.hOrigine]),
    dateOrigine: jour(it.fields[C.deplacements.dateOrigine]) || jour(it.fields[C.deplacements.date]),
    statut: txt(it.fields[C.deplacements.statut]) || 'En attente',
  }));

  const infos: Info[] = inf.map((it) => ({
    date: jour(it.fields[C.infos.date]),
    categorie: txt(it.fields[C.infos.categorie]),
    titre: txt(it.fields[C.infos.titre]),
  }));

  const signalements: Signalement[] = sig
    .filter((it) => !/fait|résolu|resolu/i.test(txt(it.fields[C.signalements.statut])))
    .map((it) => ({
      local: txt(it.fields[C.signalements.local]),
      titre: txt(it.fields[C.signalements.titre]) || 'Signalement',
      depuis: jour(it.fields[C.signalements.date]),
      bloquant: /bloqu|urgent|indispo/i.test(txt(it.fields[C.signalements.statut])),
    }));

  return { moi: { nom, prenom, email }, cours, absences, reservations, deplacements, infos, locaux: LOCAUX, signalements };
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
  });
}

export async function enregistrerDeplacement(d: Deplacement): Promise<string> {
  const C = config.champs.deplacements;
  return creer(config.listes.deplacements, {
    [C.absent]: d.absent, [C.date]: versUtcMidi(d.date), [C.hVide]: d.hVide, [C.classe]: d.classe,
    [C.prof]: d.prof, [C.hOrigine]: d.hOrigine, [C.dateOrigine]: versUtcMidi(d.dateOrigine), [C.statut]: d.statut,
  });
}

/** Pour l'écran Connexion : les listes trouvées, leur nombre d'éléments et les colonnes du premier élément. */
export async function diagnostic(): Promise<{ liste: string; trouvee: boolean; nb: number; colonnes: string[] }[]> {
  const ids = await listes();
  const s = await site();
  const sortie = [];
  for (const nom of Object.values(config.listes)) {
    const id = ids[nom];
    if (!id) {
      sortie.push({ liste: nom, trouvee: false, nb: 0, colonnes: [] });
      continue;
    }
    const page = await appel(`/sites/${s}/lists/${id}/items?$expand=fields&$top=1`);
    const premier = page.value?.[0]?.fields ?? {};
    const colonnes = Object.keys(premier).filter((k) => !k.startsWith('@') && !/^(_|Edit|Link|Content|Attachments|Folder|Item|App|Compliance|odata)/.test(k));
    sortie.push({ liste: nom, trouvee: true, nb: (page.value ?? []).length, colonnes });
  }
  return sortie;
}
