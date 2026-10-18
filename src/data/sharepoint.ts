// Lecture et écriture des listes SharePoint de l'école via Microsoft Graph.
// Les données ne quittent pas Microsoft 365 : le navigateur parle directement à Graph.

import { config } from '../config';
import { jeton } from '../lib/auth';
import { LOCAUX } from './locaux';
import { jour, localDans, num, reconnaitre, rolesDe, sansAccents, txt, val, versUtcMidi, ALIAS, type Champs } from './champs';
import type { Absence, Cours, Dataset, Decision, Deplacement, Info, Reservation, Signalement } from './types';

export { localDans, reconnaitre } from './champs';

const GRAPH = 'https://graph.microsoft.com/v1.0';

interface Item {
  id: string;
  eTag?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: { user?: { displayName?: string } };
  lastModifiedBy?: { user?: { displayName?: string } };
  fields: Champs;
}

/** Erreur Graph avec son code HTTP (404 : n'existe plus, 412 : modifié entre-temps). */
export class ErreurGraph extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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
    throw new ErreurGraph(r.status, `Microsoft Graph ${r.status} : ${corps.slice(0, 300)}`);
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

/** Le compte connecté (prénom et adresse e-mail). */
export async function profil(): Promise<{ prenom: string; email: string }> {
  const me = await appel('/me?$select=givenName,mail,userPrincipalName');
  return { prenom: txt(me.givenName), email: txt(me.mail) || txt(me.userPrincipalName) };
}

const versDeplacement = (it: Item): Deplacement => {
  const C = config.champs.deplacements;
  return {
    id: it.id,
    absent: txt(val(it.fields, C.absent)),
    date: jour(val(it.fields, C.date)),
    hVide: num(val(it.fields, C.hVide)),
    classe: txt(val(it.fields, C.classe)),
    prof: txt(val(it.fields, C.prof)),
    hOrigine: num(val(it.fields, C.hOrigine)),
    dateOrigine: jour(val(it.fields, C.dateOrigine)) || jour(val(it.fields, C.date)),
    // Comme Power Apps : un statut vide compte comme validé ; seul « En attente » attend.
    statut: txt(val(it.fields, C.statut)) || 'Validé',
    creeLe: it.createdDateTime,
    modifieLe: it.lastModifiedDateTime,
    modifiePar: it.lastModifiedBy?.user?.displayName,
    etag: it.eTag,
  };
};

export async function chargerSharePoint(email: string, prenom: string): Promise<Dataset> {
  const C = config.champs;
  const L = config.listes;
  const ids = await listes();
  const [hor, profs, abs, res, dep, inf, sig, rol, dec] = await Promise.all([
    itemsDe(L.horaires), itemsDe(L.profs), itemsDe(L.absences), itemsDe(L.reservations),
    itemsDe(L.deplacements), itemsDe(L.infos), itemsDe(L.signalements), itemsDe(L.roles), itemsDe(L.decisions),
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
  const roles = rolesDe(rol.map((r) => r.fields), email);

  const absences: Absence[] = abs.map((it) => ({
    prof: txt(val(it.fields, C.absences.prof)),
    date: jour(val(it.fields, C.absences.date)),
    deH: num(val(it.fields, C.absences.deH)) || 1,
    aH: num(val(it.fields, C.absences.aH)) || 9,
  }));

  const reservations: Reservation[] = res.map((it) => {
    const classe = txt(val(it.fields, C.reservations.classe));
    return {
      id: it.id,
      prof: txt(val(it.fields, C.reservations.prof)),
      date: jour(val(it.fields, C.reservations.date)),
      h: num(val(it.fields, C.reservations.heure)),
      local: txt(val(it.fields, C.reservations.local)),
      classe,
      ...(/remédiation/i.test(classe) ? { note: 'remédiation' } : {}),
    };
  });

  const deplacements: Deplacement[] = dep.map(versDeplacement);

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

  const D = C.decisions;
  const decisions: Decision[] = dec.map((it) => ({
    id: it.id,
    statut: /refus/i.test(txt(val(it.fields, D.statut))) ? 'Refusé' : 'Validé',
    commentaire: txt(val(it.fields, D.commentaire)),
    classe: txt(val(it.fields, D.classe)),
    prof: txt(val(it.fields, D.prof)),
    absent: txt(val(it.fields, D.absent)),
    date: jour(val(it.fields, D.date)),
    hVide: num(val(it.fields, D.hVide)),
    dateOrigine: jour(val(it.fields, D.dateOrigine)),
    hOrigine: num(val(it.fields, D.hOrigine)),
    local: txt(val(it.fields, D.local)) || undefined,
    par: it.createdBy?.user?.displayName ?? '',
    le: it.createdDateTime ?? '',
  }));

  return {
    moi: { nom, prenom, email, roles },
    cours,
    absences,
    reservations,
    deplacements,
    infos,
    locaux: LOCAUX,
    signalements,
    decisions,
    journal: !!ids[L.decisions],
  };
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

/** Relit une proposition juste avant de décider : elle doit exister et être encore « En attente ». */
async function relireProposition(idListe: string, idItem: string): Promise<Item> {
  const s = await site();
  try {
    const it: Item = await appel(`/sites/${s}/lists/${idListe}/items/${idItem}?$expand=fields`);
    const statut = txt(val(it.fields, config.champs.deplacements.statut)) || 'Validé';
    if (statut !== 'En attente') throw new Error(`Cette proposition a déjà été traitée ailleurs (statut : ${statut}).`);
    return it;
  } catch (e) {
    if (e instanceof ErreurGraph && e.status === 404) throw new Error('Cette proposition a été retirée entre-temps.');
    throw e;
  }
}

/**
 * Valide ou refuse une proposition, sans écraser une décision prise ailleurs (Power Apps,
 * autre éducateur) : la ligne est relue, puis modifiée seulement si elle n'a pas bougé.
 * - Validé : Statut = « Validé » (comme Power Apps), et réservation du local s'il a changé.
 * - Refusé : la ligne est supprimée (comme le bouton « Annuler » de Power Apps, qui ne connaît
 *   pas de statut « Refusé » et compterait la ligne comme confirmée).
 * Renvoie false si la décision est appliquée mais n'a pas pu être notée au journal.
 */
export async function deciderDeplacement(d: Deplacement, decision: Decision, nouveauLocal?: Reservation): Promise<boolean> {
  const ids = await listes();
  const idListe = ids[config.listes.deplacements];
  if (!idListe) throw new Error(`Liste introuvable : ${config.listes.deplacements}`);
  if (!d.id) throw new Error('Proposition sans identifiant.');
  const s = await site();

  const agir = async (etag?: string) => {
    const entete: Record<string, string> = etag ? { 'If-Match': etag } : {};
    if (decision.statut === 'Validé') {
      await appel(`/sites/${s}/lists/${idListe}/items/${d.id}/fields`, {
        method: 'PATCH',
        headers: entete,
        body: JSON.stringify({ [config.champs.deplacements.statut]: 'Validé' }),
      });
    } else {
      await appel(`/sites/${s}/lists/${idListe}/items/${d.id}`, { method: 'DELETE', headers: entete });
    }
  };

  const item = await relireProposition(idListe, d.id);
  try {
    await agir(item.eTag);
  } catch (e) {
    if (!(e instanceof ErreurGraph && e.status === 412)) throw e;
    // Modifiée entre-temps : on relit ; si elle attend toujours, on applique la décision.
    await relireProposition(idListe, d.id);
    await agir();
  }

  if (decision.statut === 'Validé' && nouveauLocal) await enregistrerReservation(nouveauLocal);
  return enregistrerDecision(decision);
}

/** Note la décision dans la liste facultative « Decisions ». Ne bloque jamais la décision elle-même. */
export async function enregistrerDecision(dec: Decision): Promise<boolean> {
  const ids = await listes();
  if (!ids[config.listes.decisions]) return true;
  const D = config.champs.decisions;
  try {
    await creer(config.listes.decisions, {
      [D.classe]: dec.classe, [D.statut]: dec.statut, [D.commentaire]: dec.commentaire, [D.prof]: dec.prof, [D.absent]: dec.absent,
      [D.date]: versUtcMidi(dec.date), [D.hVide]: dec.hVide, [D.dateOrigine]: versUtcMidi(dec.dateOrigine), [D.hOrigine]: dec.hOrigine,
      ...(dec.local ? { [D.local]: dec.local } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

export interface DiagListe {
  liste: string;
  trouvee: boolean;
  /** Liste facultative : son absence n'est pas une erreur. */
  facultative: boolean;
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
    const facultative = config.listesFacultatives.includes(cle);
    const id = ids[nom];
    if (!id) {
      sortie.push({ liste: nom, trouvee: false, facultative, colonnes: [], manquantes: [] });
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
    sortie.push({ liste: nom, trouvee: true, facultative, colonnes: visibles, manquantes });
  }
  return sortie;
}
