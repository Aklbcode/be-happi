// État global : données (démo ou SharePoint), heure courante, actions et messages.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Dataset, Deplacement, Reservation } from './types';
import { datasetDemo, momentDemo } from './demo';
import { sharepointConfigure } from '../config';
import { dernierePeriodeFinie, iso, jourSemaineIso, minutesDe } from '../lib/calendar';

declare const __DEMO_FORCEE__: boolean;

export interface Store {
  ds: Dataset | null;
  demo: boolean;
  maintenant: Date;
  aujourdhui: string;
  minutes: number;
  heureFinie: number;
  chargement: boolean;
  erreur: string | null;
  recharger: () => void;
  reserver: (r: Omit<Reservation, 'prof'>) => Promise<void>;
  proposer: (d: Omit<Deplacement, 'prof' | 'statut'>) => Promise<void>;
  toast: string | null;
  montrerToast: (t: string) => void;
}

const Ctx = createContext<Store | null>(null);
const CLE_CACHE = 'behappi-cache-v1';

function lireCache(): Dataset | null {
  try {
    const s = localStorage.getItem(CLE_CACHE);
    return s ? (JSON.parse(s) as Dataset) : null;
  } catch {
    return null;
  }
}

function ecrireCache(ds: Dataset) {
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify(ds));
  } catch {
    /* stockage indisponible : pas grave */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const demo = __DEMO_FORCEE__ || !sharepointConfigure();
  const [maintenant, setMaintenant] = useState<Date>(() => (demo ? momentDemo(new Date()) : new Date()));
  const [ds, setDs] = useState<Dataset | null>(() => (demo ? datasetDemo(momentDemo(new Date())) : lireCache()));
  const [chargement, setChargement] = useState(!demo);
  const [erreur, setErreur] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const minuterie = useRef<number | undefined>(undefined);

  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(demo ? momentDemo(new Date()) : new Date()), 30000);
    return () => window.clearInterval(id);
  }, [demo]);

  const charger = useCallback(async () => {
    if (demo) {
      setDs(datasetDemo(momentDemo(new Date())));
      return;
    }
    setChargement(true);
    setErreur(null);
    try {
      const sp = await import('./sharepoint');
      const { prenom, email } = await sp.profil();
      const donnees = await sp.chargerSharePoint(email, prenom);
      setDs(donnees);
      ecrireCache(donnees);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setChargement(false);
    }
  }, [demo]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const montrerToast = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const reserver = useCallback(
    async (r: Omit<Reservation, 'prof'>) => {
      if (!ds) return;
      const j = jourSemaineIso(r.date);
      const titulaire = ds.cours.find((c) => c.jour === j && c.h === r.h && c.local === r.local)?.prof;
      const complete: Reservation = { ...r, prof: ds.moi.nom, ...(titulaire ? { absent: titulaire } : {}) };
      if (!demo) {
        const sp = await import('./sharepoint');
        complete.id = await sp.enregistrerReservation(complete);
      }
      setDs((x) => (x ? { ...x, reservations: [...x.reservations, complete] } : x));
    },
    [demo, ds],
  );

  const proposer = useCallback(
    async (d: Omit<Deplacement, 'prof' | 'statut'>) => {
      if (!ds) return;
      const complet: Deplacement = { ...d, prof: ds.moi.nom, statut: 'En attente' };
      if (!demo) {
        const sp = await import('./sharepoint');
        complet.id = await sp.enregistrerDeplacement(complet);
      } else {
        complet.id = `demo-${Date.now()}`;
      }
      setDs((x) => (x ? { ...x, deplacements: [...x.deplacements, complet] } : x));
    },
    [demo, ds],
  );

  const valeur = useMemo<Store>(() => {
    const minutes = minutesDe(maintenant);
    return {
      ds,
      demo,
      maintenant,
      aujourdhui: iso(maintenant),
      minutes,
      heureFinie: dernierePeriodeFinie(minutes),
      chargement,
      erreur,
      recharger: () => void charger(),
      reserver,
      proposer,
      toast,
      montrerToast,
    };
  }, [ds, demo, maintenant, chargement, erreur, charger, reserver, proposer, toast, montrerToast]);

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}
