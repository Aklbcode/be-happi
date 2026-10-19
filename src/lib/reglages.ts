// Réglages de connexion de l'école (tenant, application, site SharePoint), gardés HORS du code public.
// Ils voyagent dans un « lien d'installation » préparé dans École → Connexion → Mise en service :
//   https://aklbcode.github.io/be-happi/?ecole=<tenant>.<application>.<site>
// - Dans Teams, l'onglet installé par l'IT porte ce lien : il fait foi à chaque ouverture.
// - Ailleurs (navigateur, téléphone, QR code d'une porte), la personne confirme une fois que c'est
//   bien son école, puis l'appareil s'en souvient. Un lien ne remplace jamais des réglages en silence.
// Sans réglages, l'app reste en démo (données fictives).

import { config } from '../config';

export interface ReglagesEcole {
  tenantId: string;
  clientId: string;
  siteHost: string;
  sitePath: string;
}

const CLE = 'behappi-ecole';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const HOTE = /^([a-z0-9-]+)\.sharepoint\.com$/;
const CHEMIN = /^\/(sites|teams)\/[A-Za-z0-9_.-]+$/;

/** Un identifiant Microsoft (GUID) ? */
export const estGuid = (texte: string): boolean => GUID.test(texte.trim());

/** GUID → 22 caractères (base64url de ses 16 octets) : un QR code plus petit. */
export function guidCourt(guid: string): string {
  let bits = '';
  for (const c of guid.replace(/-/g, '')) bits += parseInt(c, 16).toString(2).padStart(4, '0');
  bits = bits.padEnd(132, '0');
  let s = '';
  for (let i = 0; i < 132; i += 6) s += B64[parseInt(bits.slice(i, i + 6), 2)];
  return s;
}

/** 22 caractères → GUID ; null si ce n'en est pas un. */
export function guidLong(court: string): string | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(court)) return null;
  let bits = '';
  for (const c of court) bits += B64.indexOf(c).toString(2).padStart(6, '0');
  if (bits.slice(128).includes('1')) return null;
  let hex = '';
  for (let i = 0; i < 128; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** « https://ecole.sharepoint.com/sites/BeHappi/… » → hôte et chemin du site ; null sinon. */
export function lireSite(texte: string): { siteHost: string; sitePath: string } | null {
  const t = texte.trim().replace(/^https?:\/\//i, '').replace(/[?#].*$/, '');
  const morceaux = t.split('/').filter(Boolean);
  if (morceaux.length < 3) return null;
  const siteHost = morceaux[0].toLowerCase();
  // On garde « /sites/Nom » même si l'adresse copiée continue (« /Lists/Horaires/AllItems.aspx »).
  const sitePath = `/${morceaux[1].toLowerCase()}/${morceaux[2]}`;
  return HOTE.test(siteHost) && CHEMIN.test(sitePath) ? { siteHost, sitePath } : null;
}

/** Réglages complets et bien formés ? */
export function valides(r: Partial<ReglagesEcole> | null | undefined): r is ReglagesEcole {
  return !!r && GUID.test(r.tenantId ?? '') && GUID.test(r.clientId ?? '') && HOTE.test(r.siteHost ?? '') && CHEMIN.test(r.sitePath ?? '');
}

/** Valeur du paramètre ?ecole= : tenant et application raccourcis, puis le site sans « .sharepoint.com ». */
export function parametreEcole(r: ReglagesEcole): string {
  return `${guidCourt(r.tenantId)}.${guidCourt(r.clientId)}.${r.siteHost.replace(HOTE, '$1')}${r.sitePath}`;
}

/**
 * Les réglages portés par une adresse : ?ecole=… (lien préparé par l'app), ou la forme lisible
 * ?tenant=…&client=…&site=… (lien écrit à la main). null si absents ou mal formés.
 */
export function depuisAdresse(recherche: string): ReglagesEcole | null {
  const p = new URLSearchParams(recherche);
  const e = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})\.([a-z0-9-]+)(\/.+)$/i.exec((p.get('ecole') ?? '').trim());
  const r = e
    ? { tenantId: guidLong(e[1]) ?? '', clientId: guidLong(e[2]) ?? '', siteHost: `${e[3].toLowerCase()}.sharepoint.com`, sitePath: e[4] }
    : { tenantId: (p.get('tenant') ?? '').trim().toLowerCase(), clientId: (p.get('client') ?? '').trim().toLowerCase(), ...(lireSite(p.get('site') ?? '') ?? { siteHost: '', sitePath: '' }) };
  return valides(r) ? r : null;
}

/** Réglages tirés d'un lien d'installation collé tel quel (ou null). */
export function depuisLien(texte: string): ReglagesEcole | null {
  const i = texte.indexOf('?');
  return i < 0 ? null : depuisAdresse(texte.slice(i).split('#')[0]);
}

export const memes = (a: ReglagesEcole, b: ReglagesEcole): boolean =>
  a.tenantId.toLowerCase() === b.tenantId.toLowerCase() &&
  a.clientId.toLowerCase() === b.clientId.toLowerCase() &&
  a.siteHost === b.siteHost &&
  a.sitePath.toLowerCase() === b.sitePath.toLowerCase();

/** Ajoute ?ecole=… à une adresse (avant le # de l'écran). */
export function avecEcole(adresse: string, r: ReglagesEcole): string {
  const i = adresse.indexOf('#');
  const avant = i < 0 ? adresse : adresse.slice(0, i);
  const apres = i < 0 ? '' : adresse.slice(i);
  return `${avant}${avant.includes('?') ? '&' : '?'}ecole=${parametreEcole(r)}${apres}`;
}

/** Lien d'installation : l'adresse de l'app suivie des réglages de l'école. */
export const lienInstallation = (base: string, r: ReglagesEcole): string => avecEcole(base.replace(/[?#].*$/, ''), r);

/** Les réglages actuellement utilisés (null en démo). */
export const reglagesActuels = (): ReglagesEcole | null => {
  const r = { tenantId: config.tenantId, clientId: config.clientId, siteHost: config.siteHost, sitePath: config.sitePath };
  return valides(r) ? r : null;
};

// L'adresse d'ouverture, lue une seule fois (on retire ensuite les réglages de la barre d'adresse).
const OUVERTURE = typeof window === 'undefined' ? '' : window.location.search;

/** L'adresse porte-t-elle ?inTeams=1 (onglet Teams) ? À confirmer par le SDK Teams. */
export const indiceTeams = (): boolean => new URLSearchParams(OUVERTURE).has('inTeams');

function lireStocke(): ReglagesEcole | null {
  try {
    const s = window.localStorage.getItem(CLE);
    const r = s ? (JSON.parse(s) as ReglagesEcole) : null;
    return valides(r) ? r : null;
  } catch {
    return null;
  }
}

function appliquer(r: ReglagesEcole | null): void {
  config.tenantId = r?.tenantId ?? '';
  config.clientId = r?.clientId ?? '';
  config.siteHost = r?.siteHost ?? '';
  config.sitePath = r?.sitePath ?? '';
}

function nettoyerAdresse(): void {
  try {
    const u = new URL(window.location.href);
    ['ecole', 'tenant', 'client', 'site'].forEach((k) => u.searchParams.delete(k));
    window.history.replaceState(window.history.state, '', u.toString());
  } catch {
    /* rien */
  }
}

export type Depart =
  | { etat: 'pret' }
  /** Un lien propose des réglages : la personne doit confirmer que c'est bien son école. */
  | { etat: 'confirmer'; propose: ReglagesEcole; actuels: ReglagesEcole | null };

/**
 * Au démarrage, avant de charger les données : choisit les réglages et remplit config.
 * Dans Teams, ceux de l'onglet (paquet de l'IT) ; sinon ceux de l'appareil, et un lien
 * qui en propose d'autres attend une confirmation. Peut être appelée plusieurs fois.
 */
export function preparerReglages(enTeams: boolean): Depart {
  const lien = depuisAdresse(OUVERTURE);
  const stocke = lireStocke();
  if (lien && enTeams) {
    appliquer(lien);
    return { etat: 'pret' };
  }
  if (lien) nettoyerAdresse();
  if (lien && !(stocke && memes(stocke, lien))) return { etat: 'confirmer', propose: lien, actuels: stocke };
  appliquer(stocke);
  return { etat: 'pret' };
}

/** Enregistre ces réglages sur l'appareil et les utilise tout de suite. */
export function adopterReglages(r: ReglagesEcole): void {
  try {
    const avant = lireStocke();
    if (avant && !memes(avant, r)) effacerDonnees(avant);
    window.localStorage.setItem(CLE, JSON.stringify(r));
  } catch {
    /* pas de stockage : valables pour cette visite seulement */
  }
  appliquer(r);
}

/** Refuse le lien : on garde les réglages d'avant (ou la démo). */
export function refuserLien(actuels: ReglagesEcole | null): void {
  appliquer(actuels);
}

/** Retire de l'appareil les données de l'école : copie des listes et session Microsoft de l'app. */
function effacerDonnees(r: ReglagesEcole): void {
  const stockage = window.localStorage;
  stockage.removeItem('behappi-cache-v3');
  const ids = [r.clientId.toLowerCase(), r.tenantId.toLowerCase()];
  const cles: string[] = [];
  for (let i = 0; i < stockage.length; i++) {
    const k = stockage.key(i);
    if (k && (k.startsWith('msal.') || ids.some((id) => k.toLowerCase().includes(id)))) cles.push(k);
  }
  cles.forEach((k) => stockage.removeItem(k));
}

/** Oublie les réglages de l'école sur cet appareil (retour à la démo au prochain démarrage). */
export function oublierReglages(): void {
  try {
    const r = lireStocke();
    if (r) effacerDonnees(r);
    window.localStorage.removeItem(CLE);
  } catch {
    /* rien */
  }
  appliquer(null);
}
