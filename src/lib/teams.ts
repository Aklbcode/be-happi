// Détection de Teams et synchronisation du thème (clair, sombre, contraste élevé).

import { app } from '@microsoft/teams-js';

let promesse: Promise<boolean> | null = null;

/** L'app tourne-t-elle dans Teams ? (l'onglet Teams ajoute ?inTeams=1 à l'adresse) */
export function dansTeams(): Promise<boolean> {
  if (!promesse) {
    promesse = (async () => {
      const indice = new URLSearchParams(window.location.search).has('inTeams');
      if (!indice) return false;
      try {
        // Teams sur téléphone peut mettre quelques secondes à répondre au démarrage.
        await Promise.race([
          app.initialize(),
          new Promise((_, refus) => setTimeout(() => refus(new Error('délai dépassé')), 6000)),
        ]);
        return true;
      } catch {
        // Pas de réponse à temps : on réessaiera au prochain appel au lieu de rester « hors Teams ».
        promesse = null;
        return false;
      }
    })();
  }
  return promesse;
}

export type Theme = 'clair' | 'sombre' | 'contraste';

const versTheme = (t: string | undefined): Theme => (t === 'dark' ? 'sombre' : t === 'contrast' ? 'contraste' : 'clair');

export async function suivreThemeTeams(appliquer: (t: Theme) => void): Promise<boolean> {
  if (!(await dansTeams())) return false;
  try {
    const ctx = await app.getContext();
    appliquer(versTheme(ctx.app.theme));
    app.registerOnThemeChangeHandler((t) => appliquer(versTheme(t)));
    return true;
  } catch {
    return false;
  }
}

export async function indiceConnexion(): Promise<string | undefined> {
  if (!(await dansTeams())) return undefined;
  try {
    const ctx = await app.getContext();
    return ctx.user?.loginHint ?? ctx.user?.userPrincipalName;
  } catch {
    return undefined;
  }
}

/** Le « sous-onglet » demandé par un lien profond Teams (carte de notification → déplacement prêt). */
export async function sousPage(): Promise<string | undefined> {
  if (!(await dansTeams())) return undefined;
  try {
    const ctx = await app.getContext();
    return ctx.page?.subPageId || undefined;
  } catch {
    return undefined;
  }
}

/** Ouvre un lien (Teams, page web) : dans Teams, par Teams lui-même ; sinon dans un nouvel onglet. */
export async function ouvrirLien(url: string): Promise<void> {
  if (await dansTeams()) {
    try {
      await app.openLink(url);
      return;
    } catch {
      /* repli : nouvel onglet */
    }
  }
  window.open(url, '_blank', 'noopener');
}
