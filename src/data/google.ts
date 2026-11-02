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

export function oublierGoogle(): void {
  try {
    window.localStorage.removeItem(CLE_STOCKAGE);
  } catch {
    /* rien */
  }
  reglages = null;
}

// ---------- Appels au script ----------

type Envoi = (url: string, corps: string) => Promise<any>;

let envoyer: Envoi = async (url, corps) => {
  // text/plain : pas de requête préalable (CORS), le script Google l'accepte telle quelle.
  const r = await fetch(url, { method: 'POST', body: corps, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`Script Google ${r.status}`);
  return r.json();
};

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
  const r = await envoyer(`https://script.google.com/macros/s/${reglages.script}/exec`, JSON.stringify({ action, cle: reglages.cle, mail, ...donnees }));
  const status = Number(r?.status ?? 200);
  if (status >= 400) throw new ErreurScript(status, String(r?.erreur ?? `Erreur ${status}`));
  return r;
}

// ---------- Qui est connecté ? ----------

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

let etat: Etat | null = null;
let promesse: Promise<Etat> | null = null;

/** Relit le Sheet si la copie a plus de quelques secondes (un chargement de l'app = une lecture). */
function fraiche(): Promise<Etat> {
  if (etat && Date.now() - etat.lu < 4000) return Promise.resolve(etat);
  promesse ??= (async () => {
    try {
      const q = await script('qui');
      if (!q.nom && !(q.roles ?? []).length) {
        choix = { mail: await adresse(), libres: q.libres ?? [] };
        throw new ErreurScript(403, 'CHOIX_PROF');
      }
      choix = null;
      const r = await script('lire');
      etat = { moi: r.moi, listes: r.listes ?? {}, lu: Date.now() };
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
      await script('supprimer', { liste: nom, id: m[2] });
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
