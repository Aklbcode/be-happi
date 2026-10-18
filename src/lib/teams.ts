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
        await Promise.race([
          app.initialize(),
          new Promise((_, refus) => setTimeout(() => refus(new Error('délai dépassé')), 2500)),
        ]);
        return true;
      } catch {
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
