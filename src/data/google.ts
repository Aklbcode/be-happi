// Version « Google Sheets » de La Tour : les listes vivent dans un Google Sheet privé, derrière un
// petit script Google (google/Code.gs). Pas de compte Microsoft à inscrire : dans Teams, l'app
// demande à Teams l'adresse du prof connecté et l'envoie au script avec une clé secrète.
// Le script ne répond qu'aux profs de l'onglet Profs (ou de l'onglet Roles).
//
// Les réglages (adresse du script et clé) arrivent par l'adresse de l'onglet Teams :
//   https://aklbcode.github.io/be-happi/?inTeams=1&g=<ID du script>~<clé>
// Ils ne sont jamais écrits dans le code public.
//
// Pour que tout le reste de l'app marche sans changer, ce module répond aux appels Microsoft Graph
// comme le ferait SharePoint (même principe que la simulation), en lisant et écrivant dans le Sheet.

export interface ReglagesGoogle {
  script: string; // ID du déploiement (…/macros/s/<ID>/exec)
  cle: string;
}

const CLE_STOCKAGE = 'latour-google';
const FORME = /^([A-Za-z0-9_-]{20,})~([A-Za-z0-9_-]{16,})$/;

/** « ID~clé » → réglages ; null si mal formé. */
export function lireParametre(texte: string | null | undefined): ReglagesGoogle | null {
  const m = FORME.exec((texte ?? '').trim());
  return m ? { script: m[1], cle: m[2] } : null;
}

let reglages: ReglagesGoogle | null = null;

(function demarrer() {
  if (typeof window === 'undefined') return;
  try {
    const u = new URL(window.location.href);
    const r = lireParametre(u.searchParams.get('g'));
    if (r) {
      window.localStorage.setItem(CLE_STOCKAGE, `${r.script}~${r.cle}`);
      u.searchParams.delete('g');
      window.history.replaceState(window.history.state, '', u.toString());
    }
    reglages = r ?? lireParametre(window.localStorage.getItem(CLE_STOCKAGE));
  } catch {
    reglages = null;
  }
})();

/** La Tour lit-elle un Google Sheet ? */
export const googleActif = (): boolean => !!reglages;

/** Pour les tests. */
export function utiliserReglagesGoogle(r: ReglagesGoogle | null, envoi?: Envoi, mail?: string): void {
  reglages = r;
  if (envoi) envoyer = envoi;
  if (mail !== undefined) mailForce = mail;
  etat = null;
  promesse = null;
  identite = null;
}

// ---------- Appels au script ----------

type Envoi = (url: string, corps: string) => Promise<any>;

let envoyer: Envoi = async (url, corps) => {
  // text/plain : pas de requête préalable (CORS), le script Google l'accepte telle quelle.
  const r = await fetch(url, { method: 'POST', body: corps, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`Script Google ${r.status}`);
  return r.json();
};

export const MESSAGE_RESEAU = 'Pas de connexion au Google Sheet pour le moment. Nouvel essai dans un instant.';

/** « Load failed » (iPhone), « Failed to fetch » (Chrome), « NetworkError » (Firefox) : le réseau, pas le script. */
export function erreurReseau(e: unknown): boolean {
  return e instanceof TypeError || /load failed|failed to fetch|networkerror|network request failed/i.test(String((e as Error)?.message ?? e));
}

/** Erreur du script avec son code (401 clé, 403 inconnu, 404, 409, 412 modifié entre-temps). */
export class ErreurScript extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function script(action: string, donnees: Record<string, unknown> = {}): Promise<any> {
  if (!reglages) throw new ErreurScript(400, 'IPES App n’est pas reliée à un Google Sheet.');
  const mail = await adresse();
  const url = `https://script.google.com/macros/s/${reglages.script}/exec`;
  const corps = JSON.stringify({ action, cle: reglages.cle, mail, appareil: appareil(), ...donnees });
  // Une lecture qui échoue sur le réseau (téléphone qui sort de veille, Google lent à démarrer) est
  // retentée deux fois. Une écriture, jamais : elle a peut-être été faite.
  const essais = action === 'lire' || action === 'qui' ? 3 : 1;
  let r: any;
  for (let i = 1; ; i++) {
    try {
      r = await envoyer(url, corps);
      // Le script est occupé (beaucoup de monde à 8h) : une lecture attend un peu et réessaie.
      if (Number(r?.status) === 503 && i < essais) {
        await new Promise((ok) => setTimeout(ok, i * 1500));
        continue;
      }
      break;
    } catch (e) {
      if (i >= essais || !erreurReseau(e)) throw erreurReseau(e) ? new ErreurScript(503, MESSAGE_RESEAU) : e;
      await new Promise((ok) => setTimeout(ok, i * 1500));
    }
  }
  const status = Number(r?.status ?? 200);
  if (status >= 400) throw new ErreurScript(status, String(r?.erreur ?? `Erreur ${status}`));
  return r;
}

// ---------- Qui est connecté ? ----------

/** Un numéro au hasard propre à cet appareil (le script note chaque nouvel appareil d'une adresse). */
function appareil(): string {
  try {
    let a = window.localStorage.getItem('latour-appareil');
    if (!a) {
      a = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 36);
      window.localStorage.setItem('latour-appareil', a);
    }
    return a;
  } catch {
    return '';
  }
}

let mailForce: string | undefined;
let identite: Promise<string> | null = null;

/** L'adresse donnée par Teams. Hors de Teams, personne n'est reconnu. */
async function adresse(): Promise<string> {
  if (mailForce !== undefined) return mailForce;
  identite ??= import('../lib/teams').then((t) => t.indiceConnexion()).then((m) => (m ?? '').toLowerCase());
  const m = await identite;
  if (!m) {
    identite = null;
    throw new ErreurScript(401, 'Ouvre IPES App dans Teams : c’est Teams qui dit à l’app qui tu es.');
  }
  return m;
}

/** Noms encore libres quand l'adresse n'a pas été reconnue (le prof choisit le sien une fois). */
let choix: { mail: string; libres: string[] } | null = null;
export const choixEnAttente = (): { mail: string; libres: string[] } | null => choix;

/** Ce que le script sait de la personne connectée (il fait foi : c'est lui qui a reconnu l'adresse). */
export const moiDuScript = (): { nom: string; roles: string[] } | null => (etat ? { nom: etat.moi.nom || '', roles: etat.moi.roles ?? [] } : null);

/** Réserver un local ou du matériel sur une plage d'heures, en une fois (tout ou rien). */
export async function reserverPlageGoogle(liste: string, fields: Record<string, unknown>, fin: number): Promise<string[]> {
  try {
    const r = await script('reserverPlage', { liste, fields, fin });
    return Array.isArray(r.ids) ? r.ids.map(String) : [];
  } finally {
    etat = null; // la prochaine lecture voit la réservation
  }
}

/** La décision de l'éducateur en une seule opération (statut, nouveau local, journal). */
export async function deciderCoursGoogle(demande: Record<string, unknown>): Promise<void> {
  try {
    await script('deciderCours', demande);
  } finally {
    etat = null;
  }
}

/** Les noms encore libres qui contiennent ce texte (3 lettres au moins, 8 réponses au plus). */
export async function chercherNom(texte: string): Promise<string[]> {
  const r = await script('chercher', { texte });
  return Array.isArray(r.noms) ? r.noms.map(String) : [];
}

/** « C'est moi » : relie l'adresse Teams à ce nom dans le Sheet. */
export async function associer(nom: string): Promise<void> {
  const r = await script('associer', { nom });
  if (!r.nom) throw new ErreurScript(404, 'Pas reconnu.');
  choix = null;
  etat = null;
  promesse = null;
}

// ---------- Copie des listes ----------

interface ItemG {
  id: string;
  eTag: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: { user?: { displayName?: string; email?: string } };
  lastModifiedBy?: { user?: { displayName?: string } };
  fields: Record<string, unknown>;
}
interface Etat {
  moi: { nom: string; roles: string[] };
  listes: Record<string, { colonnes: string[]; items: ItemG[] }>;
  lu: number;
}

/** Forme compacte du script (une ligne = un tableau de valeurs). */
interface ListeCompacte {
  cols: string[];
  lignes: unknown[][];
}

const SYSTEME = ['ID', 'Version', 'Created', 'CreePar', 'Modified', 'ModifiePar'];

/** Lignes compactes → éléments au format SharePoint (comme le reste de l'app les attend). */
export function deplier(l: ListeCompacte): { colonnes: string[]; items: ItemG[] } {
  const iId = l.cols.indexOf('ID');
  const items = l.lignes.map((r, i): ItemG => {
    const o: Record<string, unknown> = {};
    l.cols.forEach((c, j) => (o[c] = r[j]));
    const id = iId >= 0 ? String(o.ID ?? '') : `L${i + 2}`;
    const fields: Record<string, unknown> = {};
    for (const c of l.cols) if (!SYSTEME.includes(c) && o[c] !== '' && o[c] !== null && o[c] !== undefined) fields[c] = o[c];
    if (o.Created) fields.Created = o.Created;
    const par = String(o.CreePar ?? '');
    return {
      id,
      eTag: `"${id},${o.Version || 1}"`,
      createdDateTime: (o.Created as string) || undefined,
      lastModifiedDateTime: (o.Modified as string) || undefined,
      createdBy: { user: { displayName: par, email: par } },
      lastModifiedBy: { user: { displayName: String(o.ModifiePar ?? '') } },
      fields,
    };
  });
  return { colonnes: l.cols.filter((c) => c && !SYSTEME.includes(c)), items: items.filter((x) => x.id) };
}

let etat: Etat | null = null;
let promesse: Promise<Etat> | null = null;

/** Relit le Sheet si la copie a plus de quelques secondes (un chargement de l'app = une lecture). */
function fraiche(): Promise<Etat> {
  if (etat && Date.now() - etat.lu < 4000) return Promise.resolve(etat);
  promesse ??= (async () => {
    try {
      // Un seul aller-retour : le script renvoie les listes, ou de quoi choisir son nom.
      let r: any;
      try {
        r = await script('lire');
      } catch (e) {
        // Ancien script (avant la version rapide) : il répond 403 à une adresse pas encore reliée.
        if (!(e instanceof ErreurScript && e.status === 403)) throw e;
        r = { moi: await script('qui') };
      }
      const moi = r.moi ?? {};
      if (!moi.nom && !(moi.roles ?? []).length) {
        choix = { mail: await adresse(), libres: moi.libres ?? [] };
        throw new ErreurScript(403, 'CHOIX_PROF');
      }
      choix = null;
      const listes: Etat['listes'] = {};
      for (const [nom, l] of Object.entries<any>(r.listes ?? {})) listes[nom] = Array.isArray(l?.lignes) ? deplier(l) : l;
      etat = { moi: { nom: moi.nom, roles: moi.roles ?? [] }, listes, lu: Date.now() };
      return etat;
    } finally {
      promesse = null;
    }
  })();
  return promesse;
}

const ID_SITE = 'google';
const idListe = (nom: string) => encodeURIComponent(nom);

const prenomDe = (mail: string): string => {
  const p = mail.split('@')[0].split(/[._-]/)[0] ?? '';
  return p.charAt(0).toUpperCase() + p.slice(1);
};

/** Répond à un appel Microsoft Graph comme SharePoint, à partir du Google Sheet. */
export async function repondreGoogle(url: string, init: RequestInit = {}): Promise<{ status: number; corps: unknown }> {
  const u = new URL(url, 'https://graph.microsoft.com/v1.0/');
  const chemin = decodeURIComponent(u.pathname.replace(/^\/v1\.0/, ''));
  const methode = (init.method ?? 'GET').toUpperCase();

  if (chemin === '/me') {
    const mail = await adresse();
    return { status: 200, corps: { givenName: prenomDe(mail), mail, userPrincipalName: mail } };
  }
  if (/^\/sites\/[^/]*:[^/]*$/.test(chemin)) return { status: 200, corps: { id: ID_SITE } };
  if (chemin === `/sites/${ID_SITE}/lists`) {
    const e = await fraiche();
    return { status: 200, corps: { value: Object.keys(e.listes).map((n) => ({ id: idListe(n), displayName: n, name: n })) } };
  }
  const col = new RegExp(`^/sites/${ID_SITE}/lists/([^/]+)/columns$`).exec(chemin);
  if (col) {
    const l = (await fraiche()).listes[col[1]];
    if (!l) return { status: 404, corps: 'liste introuvable' };
    return { status: 200, corps: { value: ['Title', 'Created', ...l.colonnes.filter((c) => c !== 'Title')].map((n) => ({ name: n, displayName: n, hidden: false, readOnly: false })) } };
  }
  const m = new RegExp(`^/sites/${ID_SITE}/lists/([^/]+)/items(?:/([^/]+))?(/fields)?$`).exec(chemin);
  if (!m) return { status: 404, corps: `route inconnue ${methode} ${chemin}` };
  const nom = m[1];
  const corps = init.body ? JSON.parse(String(init.body)) : {};

  if (!m[2] && methode === 'GET') {
    const l = (await fraiche()).listes[nom];
    return l ? { status: 200, corps: { value: l.items } } : { status: 404, corps: 'liste introuvable' };
  }
  try {
    if (!m[2] && methode === 'POST') {
      const r = await script('creer', { liste: nom, fields: corps.fields ?? {} });
      etat?.listes[nom]?.items.push(r.item);
      return { status: 201, corps: r.item };
    }
    if (m[2] && methode === 'DELETE') {
      const etag = (init.headers as Record<string, string> | undefined)?.['If-Match'];
      await script('supprimer', { liste: nom, id: m[2], etag });
      if (etat?.listes[nom]) etat.listes[nom].items = etat.listes[nom].items.filter((x) => x.id !== m[2]);
      return { status: 204, corps: null };
    }
    if (m[2] && methode === 'PATCH' && m[3]) {
      const etag = (init.headers as Record<string, string> | undefined)?.['If-Match'];
      const r = await script('modifier', { liste: nom, id: m[2], fields: corps, etag });
      const it = etat?.listes[nom]?.items.find((x) => x.id === m[2]);
      if (it) {
        Object.assign(it.fields, corps);
        it.eTag = r.eTag;
      }
      return { status: 200, corps };
    }
  } catch (e) {
    if (e instanceof ErreurScript) return { status: e.status, corps: e.message };
    throw e;
  }
  if (m[2] && methode === 'GET') {
    const it = (await fraiche()).listes[nom]?.items.find((x) => x.id === m[2]);
    return it ? { status: 200, corps: it } : { status: 404, corps: 'élément introuvable' };
  }
  return { status: 405, corps: 'non pris en charge' };
}
