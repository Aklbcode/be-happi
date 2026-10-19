// Lecture et écriture des listes SharePoint de l'école via Microsoft Graph.
// Les données ne quittent pas Microsoft 365 : le navigateur parle directement à Graph.

import { config } from '../config';
import { jeton } from '../lib/auth';
import { LOCAUX } from './locaux';
import { jour, localDans, num, profilsAvec, reconnaitre, rolesDe, sansAccents, txt, val, versUtcMidi, ALIAS, type Champs } from './champs';
import type { Absence, Changement, Cours, CoursEleve, Dataset, Decision, Deplacement, FicheProf, Info, Reservation, ResaMateriel, Signalement } from './types';
import { iso, plusJoursIso } from '../lib/calendar';
import { repondreSimulation, simulationActive } from './simulation';

export { localDans, reconnaitre } from './champs';

const GRAPH = 'https://graph.microsoft.com/v1.0';

interface Item {
  id: string;
  eTag?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: { user?: { displayName?: string; email?: string } };
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
  // Simulation : la copie locale répond à la place de Microsoft (rien ne sort de l'appareil).
  if (simulationActive()) {
    const r = await repondreSimulation(url, init);
    if (r.status >= 400) throw new ErreurGraph(r.status, `Simulation ${r.status} : ${String(r.corps)}`);
    return r.corps;
  }
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

const versSignalement = (it: Item): Signalement => {
  const C = config.champs.signalements;
  const titre = txt(val(it.fields, C.titre)) || 'Signalement';
  const urgence = txt(val(it.fields, C.urgence));
  const statut = txt(val(it.fields, C.statut)) || 'Nouveau';
  return {
    id: it.id,
    local: localDans(titre),
    titre,
    depuis: jour(val(it.fields, C.date)) || jour(it.createdDateTime),
    bloquant: /urgent|bloqu|indispo/i.test(`${urgence} ${statut}`),
    statut,
    resolu: /fait|résolu|resolu|clôtur|clotur/i.test(statut),
    auteur: it.createdBy?.user?.displayName,
    auteurMail: it.createdBy?.user?.email,
    le: it.createdDateTime,
    reponse: txt(val(it.fields, C.reponse)) || undefined,
    etag: it.eTag,
  };
};

/**
 * Charge les données de la personne connectée.
 * D'abord les listes Profs et Roles : elles disent si c'est un membre du personnel. Un élève ne
 * charge ensuite que l'horaire des classes (sans nom de prof), les changements publiés et ses signalements.
 */
export async function chargerSharePoint(email: string, prenom: string): Promise<Dataset> {
  const C = config.champs;
  const L = config.listes;
  const ids = await listes();
  const absentes = (Object.keys(L) as (keyof typeof L)[]).filter((k) => !ids[L[k]]);

  const [profsItems, rol] = await Promise.all([itemsDe(L.profs), itemsDe(L.roles)]);
  const nom = reconnaitre(profsItems.map((p) => p.fields), email);
  const roles = rolesDe(rol.map((r) => r.fields), email);
  const personnel = !!nom || roles.length > 0;
  // Depuis la mi-août de l'année scolaire en cours : assez pour le tableau de bord de l'année.
  const maintenant = new Date();
  const depuis = `${maintenant.getMonth() >= 7 ? maintenant.getFullYear() : maintenant.getFullYear() - 1}-08-15`;

  const infosDe = (items: Item[]): Info[] =>
    items.map((it) => ({
      id: it.id,
      date: jour(val(it.fields, C.infos.date)),
      categorie: txt(val(it.fields, C.infos.categorie)),
      titre: txt(val(it.fields, C.infos.titre)),
    }));
  const changementsDe = (items: Item[]): Changement[] =>
    items
      .map((it) => ({
        id: it.id,
        date: jour(val(it.fields, C.changements.date)),
        h: num(val(it.fields, C.changements.heure)),
        classe: txt(val(it.fields, C.changements.classe)),
        type: txt(val(it.fields, C.changements.type)),
        titre: txt(val(it.fields, C.changements.titre)),
      }))
      .filter((c) => c.date >= plusJoursIso(iso(new Date()), -14));

  if (!personnel) {
    // Pas de liste du personnel pour un élève : l'horaire des classes, les changements publiés, ses signalements.
    const [hel, chg, sig] = await Promise.all([itemsDe(L.horairesEleves), itemsDe(L.changements), itemsDe(L.signalements)]);
    const coursEleves: CoursEleve[] = hel.map((it) => {
      const classe = txt(val(it.fields, C.horairesEleves.classes));
      return {
        jour: num(val(it.fields, C.horairesEleves.jour)),
        h: num(val(it.fields, C.horairesEleves.heure)),
        classes: classe.split(',').map((x) => x.trim()).filter(Boolean),
        matiere: txt(val(it.fields, C.horairesEleves.matiere)),
        local: txt(val(it.fields, C.horairesEleves.local)),
      };
    });
    const mail = email.toLowerCase();
    return {
      moi: { nom: '', prenom, email, roles: [], profils: ['eleve'] },
      cours: [],
      coursEleves,
      absences: [],
      reservations: [],
      deplacements: [],
      infos: [],
      locaux: LOCAUX,
      // Un élève ne voit que ses propres signalements (comme Power Apps).
      signalements: sig.map(versSignalement).filter((x) => (x.auteurMail ?? '').toLowerCase() === mail),
      decisions: [],
      journal: false,
      profs: [],
      changements: changementsDe(chg),
      materiel: [],
      absentes,
    };
  }

  const [hor, abs, res, dep, inf, sig, dec, mat, chg] = await Promise.all([
    itemsDe(L.horaires), itemsDe(L.absences), itemsDe(L.reservations), itemsDe(L.deplacements), itemsDe(L.infos),
    itemsDe(L.signalements), itemsDe(L.decisions), itemsDe(L.materiel), itemsDe(L.changements),
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

  const absences: Absence[] = abs
    .map((it) => ({
      id: it.id,
      prof: txt(val(it.fields, C.absences.prof)),
      date: jour(val(it.fields, C.absences.date)),
      deH: num(val(it.fields, C.absences.deH)) || 1,
      aH: num(val(it.fields, C.absences.aH)) || 9,
    }))
    .filter((a) => a.date >= depuis);

  const reservations: Reservation[] = res
    .map((it) => {
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
    })
    .filter((r) => r.date >= depuis);

  const deplacements: Deplacement[] = dep.map(versDeplacement).filter((d) => d.date >= depuis || d.dateOrigine >= depuis);

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

  const materiel: ResaMateriel[] = mat
    .map((it) => ({
      id: it.id,
      prof: txt(val(it.fields, C.materiel.prof)),
      date: jour(val(it.fields, C.materiel.date)),
      h: num(val(it.fields, C.materiel.heure)),
      rack: txt(val(it.fields, C.materiel.rack)),
      classe: txt(val(it.fields, C.materiel.classe)),
    }))
    .filter((m) => m.date >= plusJoursIso(iso(new Date()), -7));

  const profs: FicheProf[] = profsItems.map((it) => ({ nom: txt(val(it.fields, C.profs.nom)), email: txt(val(it.fields, C.profs.mail)) || undefined })).filter((p) => p.nom);
  // L'horaire des élèves se déduit de l'horaire des profs (sans les noms).
  const vus = new Set<string>();
  const coursEleves: CoursEleve[] = [];
  for (const c of cours) {
    const cle = `${c.jour}|${c.h}|${c.classe}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    coursEleves.push({ jour: c.jour, h: c.h, classes: c.classes, matiere: c.matiere, local: c.local });
  }
  const estProf = !!nom && cours.some((c) => c.prof === nom);
  const profils = profilsAvec(roles, estProf);

  return {
    moi: { nom, prenom, email, roles, profils: profils.length ? profils : ['eleve'] },
    cours,
    coursEleves,
    absences,
    reservations,
    deplacements,
    infos: infosDe(inf),
    locaux: LOCAUX,
    signalements: sig.map(versSignalement),
    decisions,
    journal: !!ids[L.decisions],
    profs,
    changements: changementsDe(chg),
    materiel,
    absentes,
  };
}

async function idListe(nomListe: string): Promise<string> {
  const ids = await listes();
  const id = ids[nomListe];
  if (!id) throw new Error(`Liste introuvable : ${nomListe}`);
  return id;
}

/**
 * Crée une ligne. `facultatifs` : colonnes envoyées si elles existent ; si SharePoint refuse la
 * ligne (400, colonne inconnue), on réessaie sans elles.
 */
async function creer(nomListe: string, fields: Champs, facultatifs: Champs = {}): Promise<string> {
  const id = await idListe(nomListe);
  const s = await site();
  const poster = (f: Champs) => appel(`/sites/${s}/lists/${id}/items`, { method: 'POST', body: JSON.stringify({ fields: f }) });
  try {
    const r = await poster({ ...fields, ...facultatifs });
    return r.id as string;
  } catch (e) {
    if (!(e instanceof ErreurGraph && e.status === 400 && Object.keys(facultatifs).length)) throw e;
    const r = await poster(fields);
    return r.id as string;
  }
}

async function modifier(nomListe: string, idItem: string, fields: Champs, etag?: string): Promise<void> {
  const id = await idListe(nomListe);
  const s = await site();
  await appel(`/sites/${s}/lists/${id}/items/${idItem}/fields`, { method: 'PATCH', headers: etag ? { 'If-Match': etag } : {}, body: JSON.stringify(fields) });
}

async function supprimer(nomListe: string, idItem: string): Promise<void> {
  const id = await idListe(nomListe);
  const s = await site();
  try {
    await appel(`/sites/${s}/lists/${id}/items/${idItem}`, { method: 'DELETE' });
  } catch (e) {
    // Déjà supprimée ailleurs : le résultat voulu est atteint.
    if (!(e instanceof ErreurGraph && e.status === 404)) throw e;
  }
}

export async function enregistrerReservation(r: Reservation): Promise<string> {
  const C = config.champs.reservations;
  return creer(
    config.listes.reservations,
    { [C.prof]: r.prof, [C.date]: versUtcMidi(r.date), [C.heure]: r.h, [C.local]: r.local, [C.classe]: r.classe },
    // Comme Power Apps : le prof qui a normalement ce local à cette heure.
    r.absent ? { [C.absent]: r.absent } : {},
  );
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

/**
 * Le prof retire sa propre proposition, tant qu'elle attend (comme le bouton « Annuler » de
 * Power Apps) : la ligne est relue, puis supprimée seulement si elle n'a pas bougé entre-temps.
 * Déjà validée : on ne touche à rien, c'est à l'éducateur de l'annuler.
 */
export async function retirerDeplacement(d: Deplacement): Promise<void> {
  const ids = await listes();
  const idListe = ids[config.listes.deplacements];
  if (!idListe) throw new Error(`Liste introuvable : ${config.listes.deplacements}`);
  if (!d.id) throw new Error('Proposition sans identifiant.');
  const s = await site();
  const relire = async () => {
    try {
      return await relireProposition(idListe, d.id!);
    } catch (e) {
      if (e instanceof Error && /déjà été traitée/.test(e.message)) throw new Error('Déjà validée : demande à l’éducateur de l’annuler.');
      throw e;
    }
  };
  let item: Item;
  try {
    item = await relire();
  } catch (e) {
    // Déjà retirée ailleurs : le résultat voulu est atteint.
    if (e instanceof Error && /retirée entre-temps/.test(e.message)) return;
    throw e;
  }
  try {
    await appel(`/sites/${s}/lists/${idListe}/items/${d.id}`, { method: 'DELETE', headers: item.eTag ? { 'If-Match': item.eTag } : {} });
  } catch (e) {
    if (e instanceof ErreurGraph && e.status === 404) return;
    if (!(e instanceof ErreurGraph && e.status === 412)) throw e;
    await relire();
    await appel(`/sites/${s}/lists/${idListe}/items/${d.id}`, { method: 'DELETE' });
  }
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

// ---------------------------------------------------------------------------------------------
// Écritures des autres espaces (mêmes colonnes et mêmes valeurs que Power Apps)
// ---------------------------------------------------------------------------------------------

/** Absences : une ligne par jour, comme l'écran Secrétariat de Power Apps (motif « Non précisé »). */
export async function enregistrerAbsence(a: Absence): Promise<string> {
  const C = config.champs.absences;
  return creer(config.listes.absences, { [C.prof]: a.prof, [C.date]: versUtcMidi(a.date), [C.deH]: a.deH, [C.aH]: a.aH }, C.motif ? { [C.motif]: 'Non précisé' } : {});
}

export async function modifierAbsence(id: string, deH: number, aH: number): Promise<void> {
  const C = config.champs.absences;
  await modifier(config.listes.absences, id, { [C.deH]: deH, [C.aH]: aH });
}

export const supprimerAbsence = (id: string): Promise<void> => supprimer(config.listes.absences, id);

export async function enregistrerInfo(i: Info): Promise<string> {
  const C = config.champs.infos;
  return creer(config.listes.infos, { [C.titre]: i.titre, [C.date]: versUtcMidi(i.date), [C.categorie]: i.categorie });
}

export const supprimerInfo = (id: string): Promise<void> => supprimer(config.listes.infos, id);

/** Signalement : le local est écrit au début du texte (la liste n'a pas de colonne Local). */
export async function enregistrerSignalement(titre: string, urgent: boolean): Promise<string> {
  const C = config.champs.signalements;
  return creer(config.listes.signalements, { [C.titre]: titre }, { [C.urgence]: urgent ? 'Urgente' : 'Normale' });
}

/** Le service technique change le statut (Nouveau → En cours → Résolu) et peut laisser un mot. */
export async function traiterSignalement(id: string, statut: string, reponse?: string): Promise<void> {
  const C = config.champs.signalements;
  await modifier(config.listes.signalements, id, { [C.statut]: statut });
  if (reponse !== undefined) {
    try {
      await modifier(config.listes.signalements, id, { [C.reponse]: reponse });
    } catch {
      // Colonne « Reponse » facultative : le statut est déjà enregistré.
    }
  }
}

export async function enregistrerMateriel(m: ResaMateriel): Promise<string> {
  const C = config.champs.materiel;
  return creer(config.listes.materiel, { [C.prof]: m.prof, [C.date]: versUtcMidi(m.date), [C.heure]: m.h, [C.rack]: m.rack, [C.classe]: m.classe });
}

export const supprimerMateriel = (id: string): Promise<void> => supprimer(config.listes.materiel, id);
export const supprimerReservation = (id: string): Promise<void> => supprimer(config.listes.reservations, id);

/**
 * « Publier pour les élèves » : comme Power Apps, on retire les lignes du jour dans Changements
 * puis on écrit la nouvelle liste. Relu juste avant, pour ne rien oublier de publié ailleurs.
 */
export async function publierChangements(date: string, lignes: Changement[]): Promise<number> {
  const C = config.champs.changements;
  const existants = (await itemsDe(config.listes.changements)).filter((it) => jour(val(it.fields, C.date)) === date);
  await parLots(existants, (it) => supprimer(config.listes.changements, it.id));
  await parLots(lignes, (l) => creer(config.listes.changements, { [C.titre]: l.titre, [C.date]: versUtcMidi(date), [C.heure]: l.h, [C.classe]: l.classe, [C.type]: l.type }));
  return lignes.length;
}

/** Quelques requêtes à la fois (plus rapide qu'une par une, sans brusquer SharePoint). */
async function parLots<T>(elements: T[], f: (x: T) => Promise<unknown>, taille = 4): Promise<void> {
  for (let i = 0; i < elements.length; i += taille) await Promise.all(elements.slice(i, i + taille).map(f));
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
    const facultatives = config.colonnesFacultatives[cle] ?? [];
    for (const [champ, attendu] of Object.entries(champs[cle] ?? {})) {
      if (facultatives.includes(champ)) continue;
      if (noms.has(attendu) || (ALIAS[attendu] ?? []).some((a) => noms.has(a))) continue;
      const piste = cols.find((c) => sansAccents(c.displayName) === sansAccents(attendu));
      manquantes.push({ attendu, piste: piste?.name });
    }
    sortie.push({ liste: nom, trouvee: true, facultative, colonnes: visibles, manquantes });
  }
  return sortie;
}
