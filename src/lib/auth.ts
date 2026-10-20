// Connexion avec le compte Microsoft de l'école.
// Dans Teams : authentification « imbriquée » (NAA), sans nouvelle fenêtre de connexion.
// Hors Teams (navigateur, app installée sur le téléphone) : connexion classique par redirection.

import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  createNestablePublicClientApplication,
  type AccountInfo,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { SCOPES, config } from '../config';
import { dansTeams, indiceConnexion } from './teams';

let pca: IPublicClientApplication | null = null;
let teams = false;

/**
 * Adresse de retour après la connexion : la page d'accueil de La Tour, la seule que l'IT inscrit.
 * Depuis une autre page du site (Décale), MSAL revient ensuite tout seul sur la page de départ.
 */
const adresseRetour = (): string => window.location.origin + window.location.pathname.replace(/(?:decale\/)?(?:index\.html)?$/, '');

async function client(): Promise<IPublicClientApplication> {
  if (pca) return pca;
  const auth = {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
    redirectUri: adresseRetour(),
  };
  teams = await dansTeams();
  if (teams) {
    pca = await createNestablePublicClientApplication({
      auth: { ...auth, supportsNestedAppAuth: true },
      cache: { cacheLocation: 'localStorage' },
    });
  } else {
    const p = new PublicClientApplication({ auth, cache: { cacheLocation: 'localStorage' } });
    await p.initialize();
    const retour = await p.handleRedirectPromise();
    if (retour?.account) p.setActiveAccount(retour.account);
    pca = p;
  }
  return pca;
}

export async function compte(): Promise<AccountInfo | null> {
  const p = await client();
  return p.getActiveAccount() ?? p.getAllAccounts()[0] ?? null;
}

/** Jeton d'accès pour Microsoft Graph (lecture/écriture des listes SharePoint). */
export async function jeton(): Promise<string> {
  const p = await client();
  const account = await compte();
  try {
    if (!account && !teams) throw new InteractionRequiredAuthError('aucun_compte');
    const r = account
      ? await p.acquireTokenSilent({ scopes: SCOPES, account })
      : await p.ssoSilent({ scopes: SCOPES, loginHint: await indiceConnexion() });
    if (r.account) p.setActiveAccount(r.account);
    return r.accessToken;
  } catch (e) {
    if (!(e instanceof InteractionRequiredAuthError) && account) throw e;
    if (teams) {
      const r = await p.acquireTokenPopup({ scopes: SCOPES });
      if (r.account) p.setActiveAccount(r.account);
      return r.accessToken;
    }
    await p.acquireTokenRedirect({ scopes: SCOPES });
    throw new Error('Redirection vers la connexion Microsoft…');
  }
}

export async function deconnexion(): Promise<void> {
  const p = await client();
  if (!teams) await p.logoutRedirect();
}
