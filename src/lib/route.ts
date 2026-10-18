// Navigation simple par l'adresse (#/horaire, #/locaux…), utile aussi pour les liens profonds depuis Teams.

import { useEffect, useState } from 'react';

export type Ecran = 'aujourdhui' | 'horaire' | 'happi' | 'locaux' | 'ecole' | 'deplacer' | 'connexion' | 'validations';
const ECRANS: Ecran[] = ['aujourdhui', 'horaire', 'happi', 'locaux', 'ecole', 'deplacer', 'connexion', 'validations'];

export interface Route {
  ecran: Ecran;
  params: URLSearchParams;
}

export function lireRoute(): Route {
  const brut = window.location.hash.replace(/^#\/?/, '');
  const [chemin, qs] = brut.split('?');
  const ecran = (ECRANS as string[]).includes(chemin) ? (chemin as Ecran) : 'aujourdhui';
  return { ecran, params: new URLSearchParams(qs ?? '') };
}

export function lien(ecran: Ecran, params?: Record<string, string | number>): string {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}` : '';
  return `#/${ecran}${qs}`;
}

export function aller(ecran: Ecran, params?: Record<string, string | number>): void {
  window.location.hash = lien(ecran, params);
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(lireRoute);
  useEffect(() => {
    const f = () => {
      setR(lireRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
