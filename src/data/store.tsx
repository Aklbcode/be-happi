// État global : données (démo ou SharePoint), heure courante, actions et messages.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Dataset, Decision, Deplacement, Reservation } from './types';
import { datasetDemo, momentDemo } from './demo';
import { peutValiderAvec, peutVoirAvec } from './champs';
import { sharepointConfigure } from '../config';
import { dernierePeriodeFinie, iso, jourSemaineIso, minutesDe, situation } from '../lib/calendar';
import { memeDeplacement, nomAffiche } from '../logic/horaire';
import { verifierDeplacement } from '../logic/deplacements';

declare const __DEMO_FORCEE__: boolean;

export type RoleDemo = 'prof' | 'educateur';

export interface Store {
  ds: Dataset | null;
  demo: boolean;
  maintenant: Date;
  aujourdhui: string;
  minutes: number;
  heureFinie: number;
  /** Dernière heure qui ne peut plus recevoir de cours : finie, ou en train de se donner. */
  heurePassee: number;
  chargement: boolean;
  erreur: string | null;
  recharger: () => void;
  reserver: (r: Omit<Reservation, 'prof'>) => Promise<void>;
  proposer: (d: Omit<Deplacement, 'prof' | 'statut'>) => Promise<void>;
  /** Valider ou refuser une proposition (revérifiée sur les données les plus fraîches). */
  decider: (d: Deplacement, statut: Decision['statut'], commentaire: string) => Promise<{ journalOk: boolean; local?: string }>;
  peutValider: boolean;
  peutVoirValidations: boolean;
  roleDemo: RoleDemo;
  changerRoleDemo: (r: RoleDemo) => void;
  toast: string | null;
  montrerToast: (t: string) => void;
}

const Ctx = createContext<Store | null>(null);
const CLE_CACHE = 'behappi-cache-v2';

function lireCache(): Dataset | null {
  try {
    const s = localStorage.getItem(CLE_CACHE);
    // Un cache d'une version plus ancienne peut manquer de champs : on complète.
    return s ? ({ decisions: [], journal: false, ...JSON.parse(s) } as Dataset) : null;
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

/** Le prof qui a normalement ce local à cette heure (colonne Absent des réservations, comme Power Apps). */
const titulaireDe = (ds: Dataset, local: string, date: string, h: number): string | undefined =>
  ds.cours.find((c) => c.jour === jourSemaineIso(date) && c.h === h && c.local === local)?.prof;

export function StoreProvider({ children }: { children: ReactNode }) {
  const demo = __DEMO_FORCEE__ || !sharepointConfigure();
  const [maintenant, setMaintenant] = useState<Date>(() => (demo ? momentDemo(new Date()) : new Date()));
  const [ds, setDs] = useState<Dataset | null>(() => (demo ? datasetDemo(momentDemo(new Date())) : lireCache()));
  const [chargement, setChargement] = useState(!demo);
  const [erreur, setErreur] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [roleDemo, setRoleDemo] = useState<RoleDemo>('prof');
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
    minuterie.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const reserver = useCallback(
    async (r: Omit<Reservation, 'prof'>) => {
      if (!ds) return;
      const titulaire = titulaireDe(ds, r.local, r.date, r.h);
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
      const complet: Deplacement = { ...d, prof: ds.moi.nom, statut: 'En attente', creeLe: new Date().toISOString() };
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

  const minutes = minutesDe(maintenant);
  const heureFinie = dernierePeriodeFinie(minutes);
  const sit = situation(minutes);
  const heurePassee = sit.enCours ? sit.h : heureFinie;
  const aujourdhui = iso(maintenant);

  const decider = useCallback(
    async (d: Deplacement, statut: Decision['statut'], commentaire: string) => {
      if (!ds) throw new Error('Données pas encore chargées.');
      // Revérifier sur l'état le plus récent : en vrai, on relit SharePoint juste avant de décider.
      let base = ds;
      if (!demo) {
        const sp = await import('./sharepoint');
        base = await sp.chargerSharePoint(ds.moi.email ?? '', ds.moi.prenom);
      }
      const actuel = base.deplacements.find((x) => memeDeplacement(x, d));
      if (!actuel) throw new Error('Cette proposition a été retirée entre-temps.');
      if (actuel.statut !== 'En attente') throw new Error('Cette proposition a déjà été traitée.');
      const verif = verifierDeplacement(base, actuel, aujourdhui, heurePassee);
      if (statut === 'Validé' && !verif.ok) {
        throw new Error(verif.controles.filter((c) => !c.ok).map((c) => c.detail ?? c.libelle).join(' '));
      }
      const localChange = statut === 'Validé' && verif.localChange ? verif.local : undefined;
      const par = demo ? 'Toi (démo)' : `${ds.moi.prenom} ${nomAffiche(ds.moi.nom)}`.trim() || (ds.moi.email ?? '');
      const decision: Decision = {
        statut,
        commentaire: commentaire.trim(),
        classe: actuel.classe,
        prof: actuel.prof,
        absent: actuel.absent,
        date: actuel.date,
        hVide: actuel.hVide,
        dateOrigine: actuel.dateOrigine,
        hOrigine: actuel.hOrigine,
        ...(localChange ? { local: localChange } : {}),
        par,
        le: new Date().toISOString(),
      };
      const titulaire = localChange ? titulaireDe(base, localChange, actuel.date, actuel.hVide) : undefined;
      const resa: Reservation | undefined = localChange
        ? { prof: actuel.prof, date: actuel.date, h: actuel.hVide, local: localChange, classe: actuel.classe, ...(titulaire ? { absent: titulaire } : {}) }
        : undefined;

      if (demo) {
        setDs((x) =>
          x
            ? {
                ...x,
                deplacements:
                  statut === 'Validé'
                    ? x.deplacements.map((y) => (memeDeplacement(y, actuel) ? { ...y, statut: 'Validé', modifieLe: decision.le, modifiePar: par } : y))
                    : x.deplacements.filter((y) => !memeDeplacement(y, actuel)),
                reservations: resa ? [...x.reservations, resa] : x.reservations,
                decisions: [decision, ...x.decisions],
              }
            : x,
        );
        return { journalOk: true, local: localChange };
      }
      const sp = await import('./sharepoint');
      const journalOk = await sp.deciderDeplacement(actuel, decision, resa);
      await charger();
      return { journalOk, local: localChange };
    },
    [demo, ds, aujourdhui, heurePassee, charger],
  );

  const peutValider = demo ? roleDemo === 'educateur' : peutValiderAvec(ds?.moi.roles);
  const peutVoirValidations = demo || peutVoirAvec(ds?.moi.roles);

  const valeur = useMemo<Store>(
    () => ({
      ds,
      demo,
      maintenant,
      aujourdhui,
      minutes,
      heureFinie,
      heurePassee,
      chargement,
      erreur,
      recharger: () => void charger(),
      reserver,
      proposer,
      decider,
      peutValider,
      peutVoirValidations,
      roleDemo,
      changerRoleDemo: setRoleDemo,
      toast,
      montrerToast,
    }),
    [ds, demo, maintenant, aujourdhui, minutes, heureFinie, heurePassee, chargement, erreur, charger, reserver, proposer, decider, peutValider, peutVoirValidations, roleDemo, toast, montrerToast],
  );

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}
