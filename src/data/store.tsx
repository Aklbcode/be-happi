// État global : données (démo ou SharePoint), heure courante, espace choisi, actions et messages.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Absence, Dataset, Decision, Deplacement, Info, Profil, Reservation, ResaMateriel, Signalement } from './types';
import { datasetDemo, momentDemo } from './demo';
import { peutValiderAvec, peutVoirAvec } from './champs';
import { RACKS } from './materiel';
import { sharepointConfigure } from '../config';
import { dernierePeriodeFinie, deIso, estJourDeCours, iso, jourSemaineIso, minutesDe, plusJoursIso, situation } from '../lib/calendar';
import { memeDeplacement, nomAffiche } from '../logic/horaire';
import { verifierDeplacement } from '../logic/deplacements';
import { changementsDuJour } from '../logic/publication';
import { lienChatTeams, lienReunionTeams, type MessageTeams } from '../lib/liens';

declare const __DEMO_FORCEE__: boolean;

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
  /** Espace affiché (prof, éducateur…) et ceux auxquels la personne a droit. */
  profil: Profil;
  profils: Profil[];
  changerProfil: (p: Profil) => void;
  /** Classe choisie en vue élève (gardée sur l'appareil). */
  classeEleve: string;
  changerClasseEleve: (c: string) => void;
  reserver: (r: Omit<Reservation, 'prof'>) => Promise<void>;
  annulerReservation: (r: Reservation) => Promise<void>;
  proposer: (d: Omit<Deplacement, 'prof' | 'statut'>) => Promise<void>;
  /** Valider ou refuser une proposition (revérifiée sur les données les plus fraîches). */
  decider: (d: Deplacement, statut: Decision['statut'], commentaire: string) => Promise<{ journalOk: boolean; local?: string }>;
  peutValider: boolean;
  peutVoirValidations: boolean;
  encoderAbsences: (prof: string, du: string, au: string, deH: number, aH: number) => Promise<{ jours: number; ignores: number }>;
  modifierAbsence: (a: Absence, deH: number, aH: number) => Promise<void>;
  supprimerAbsence: (a: Absence) => Promise<void>;
  publierInfo: (i: Omit<Info, 'id'>) => Promise<void>;
  supprimerInfo: (i: Info) => Promise<void>;
  signaler: (local: string, texte: string, urgent: boolean) => Promise<void>;
  traiterSignalement: (s: Signalement, statut: string, reponse?: string) => Promise<void>;
  reserverMateriel: (m: Omit<ResaMateriel, 'prof' | 'id'>) => Promise<void>;
  annulerMateriel: (m: ResaMateriel) => Promise<void>;
  /** « Publier pour les élèves » pour une journée : renvoie le nombre de lignes publiées. */
  publier: (date: string) => Promise<number>;
  /** Ouvre Teams (message ou réunion préremplis) ; en démo, montre l'aperçu. */
  ouvrirTeams: (m: MessageTeams) => void;
  apercuTeams: MessageTeams | null;
  fermerApercuTeams: () => void;
  toast: string | null;
  montrerToast: (t: string) => void;
}

const Ctx = createContext<Store | null>(null);
const CLE_CACHE = 'behappi-cache-v3';
const CLE_PROFIL = 'behappi-profil';
const CLE_CLASSE = 'behappi-classe';

const lire = (cle: string): string | null => {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
};
const ecrire = (cle: string, v: string) => {
  try {
    localStorage.setItem(cle, v);
  } catch {
    /* stockage indisponible : pas grave */
  }
};

function lireCache(): Dataset | null {
  const s = lire(CLE_CACHE);
  if (!s) return null;
  try {
    // Un cache d'une version plus ancienne peut manquer de champs : on complète.
    return { decisions: [], journal: false, coursEleves: [], profs: [], changements: [], materiel: [], absentes: [], ...JSON.parse(s) } as Dataset;
  } catch {
    return null;
  }
}

/** Le prof qui a normalement ce local à cette heure (colonne Absent des réservations, comme Power Apps). */
const titulaireDe = (ds: Dataset, local: string, date: string, h: number): string | undefined =>
  ds.cours.find((c) => c.jour === jourSemaineIso(date) && c.h === h && c.local === local)?.prof;

const TOUS: Profil[] = ['prof', 'educateur', 'secretariat', 'direction', 'technique', 'eleve'];

export function StoreProvider({ children }: { children: ReactNode }) {
  const demo = __DEMO_FORCEE__ || !sharepointConfigure();
  const [maintenant, setMaintenant] = useState<Date>(() => (demo ? momentDemo(new Date()) : new Date()));
  const [ds, setDs] = useState<Dataset | null>(() => (demo ? datasetDemo(momentDemo(new Date())) : lireCache()));
  const [chargement, setChargement] = useState(!demo);
  const [erreur, setErreur] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [apercuTeams, setApercuTeams] = useState<MessageTeams | null>(null);
  const [profilChoisi, setProfilChoisi] = useState<Profil | null>(() => lire(CLE_PROFIL) as Profil | null);
  const [classeEleve, setClasseEleve] = useState<string>(() => lire(CLE_CLASSE) ?? '');
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
      ecrire(CLE_CACHE, JSON.stringify(donnees));
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

  const profilsDs = ds?.moi.profils;
  const profils: Profil[] = useMemo(() => (demo ? TOUS : profilsDs?.length ? profilsDs : ['eleve']), [demo, profilsDs]);
  const profil: Profil = profilChoisi && profils.includes(profilChoisi) ? profilChoisi : profils[0];
  const changerProfil = useCallback((p: Profil) => {
    setProfilChoisi(p);
    ecrire(CLE_PROFIL, p);
  }, []);
  const changerClasseEleve = useCallback((c: string) => {
    setClasseEleve(c);
    ecrire(CLE_CLASSE, c);
  }, []);

  const sp = useCallback(() => import('./sharepoint'), []);
  const maj = useCallback((f: (x: Dataset) => Dataset) => setDs((x) => (x ? f(x) : x)), []);
  const horodatage = useCallback(() => (demo ? maintenant : new Date()).toISOString(), [demo, maintenant]);
  const moiAffiche = ds ? `${ds.moi.prenom} ${nomAffiche(ds.moi.nom)}`.trim() || ds.moi.email || '' : '';

  const reserver = useCallback(
    async (r: Omit<Reservation, 'prof'>) => {
      if (!ds) return;
      const titulaire = titulaireDe(ds, r.local, r.date, r.h);
      const complete: Reservation = { ...r, prof: ds.moi.nom, ...(titulaire ? { absent: titulaire } : {}) };
      complete.id = demo ? `demo-r-${Date.now()}-${r.h}` : await (await sp()).enregistrerReservation(complete);
      maj((x) => ({ ...x, reservations: [...x.reservations, complete] }));
    },
    [demo, ds, maj, sp],
  );

  const annulerReservation = useCallback(
    async (r: Reservation) => {
      if (!demo && r.id) await (await sp()).supprimerReservation(r.id);
      maj((x) => ({ ...x, reservations: x.reservations.filter((y) => y !== r && !(r.id && y.id === r.id)) }));
    },
    [demo, maj, sp],
  );

  const proposer = useCallback(
    async (d: Omit<Deplacement, 'prof' | 'statut'>) => {
      if (!ds) return;
      // En démo, l'heure affichée suit le lundi simulé.
      const complet: Deplacement = { ...d, prof: ds.moi.nom, statut: 'En attente', creeLe: horodatage() };
      complet.id = demo ? `demo-${Date.now()}` : await (await sp()).enregistrerDeplacement(complet);
      maj((x) => ({ ...x, deplacements: [...x.deplacements, complet] }));
    },
    [demo, ds, horodatage, maj, sp],
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
      if (!demo) base = await (await sp()).chargerSharePoint(ds.moi.email ?? '', ds.moi.prenom);
      const actuel = base.deplacements.find((x) => memeDeplacement(x, d));
      if (!actuel) throw new Error('Cette proposition a été retirée entre-temps.');
      if (actuel.statut !== 'En attente') throw new Error('Cette proposition a déjà été traitée.');
      const verif = verifierDeplacement(base, actuel, aujourdhui, heurePassee);
      if (statut === 'Validé' && !verif.ok) {
        throw new Error(verif.controles.filter((c) => !c.ok).map((c) => c.detail ?? c.libelle).join(' '));
      }
      const localChange = statut === 'Validé' && verif.localChange ? verif.local : undefined;
      const par = demo ? 'Toi (démo)' : moiAffiche;
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
        le: horodatage(),
      };
      const titulaire = localChange ? titulaireDe(base, localChange, actuel.date, actuel.hVide) : undefined;
      const resa: Reservation | undefined = localChange
        ? { prof: actuel.prof, date: actuel.date, h: actuel.hVide, local: localChange, classe: actuel.classe, ...(titulaire ? { absent: titulaire } : {}) }
        : undefined;

      if (demo) {
        maj((x) => ({
          ...x,
          deplacements:
            statut === 'Validé'
              ? x.deplacements.map((y) => (memeDeplacement(y, actuel) ? { ...y, statut: 'Validé', modifieLe: decision.le, modifiePar: par } : y))
              : x.deplacements.filter((y) => !memeDeplacement(y, actuel)),
          reservations: resa ? [...x.reservations, { ...resa, id: `demo-r-${Date.now()}` }] : x.reservations,
          decisions: [decision, ...x.decisions],
        }));
        return { journalOk: true, local: localChange };
      }
      const journalOk = await (await sp()).deciderDeplacement(actuel, decision, resa);
      await charger();
      return { journalOk, local: localChange };
    },
    [demo, ds, aujourdhui, heurePassee, charger, horodatage, maj, moiAffiche, sp],
  );

  const encoderAbsences = useCallback(
    async (prof: string, du: string, au: string, deH: number, aH: number) => {
      if (!ds) return { jours: 0, ignores: 0 };
      const jours: string[] = [];
      for (let d = du; d <= au && jours.length < 60; d = plusJoursIso(d, 1)) if (estJourDeCours(deIso(d))) jours.push(d);
      const nouveaux: Absence[] = [];
      let ignores = 0;
      for (const d of jours) {
        if (ds.absences.some((a) => a.prof === prof && a.date === d)) {
          ignores++;
          continue;
        }
        nouveaux.push({ prof, date: d, deH: d === du ? deH : 1, aH: d === au ? aH : 9 });
      }
      for (const a of nouveaux) a.id = demo ? `demo-a-${Date.now()}-${a.date}` : await (await sp()).enregistrerAbsence(a);
      maj((x) => ({ ...x, absences: [...x.absences, ...nouveaux] }));
      return { jours: nouveaux.length, ignores };
    },
    [demo, ds, maj, sp],
  );

  const modifierAbsence = useCallback(
    async (a: Absence, deH: number, aH: number) => {
      if (!demo && a.id) await (await sp()).modifierAbsence(a.id, deH, aH);
      maj((x) => ({ ...x, absences: x.absences.map((y) => (y === a || (a.id && y.id === a.id) ? { ...y, deH, aH } : y)) }));
    },
    [demo, maj, sp],
  );

  const supprimerAbsence = useCallback(
    async (a: Absence) => {
      if (!demo && a.id) await (await sp()).supprimerAbsence(a.id);
      maj((x) => ({ ...x, absences: x.absences.filter((y) => !(y === a || (a.id && y.id === a.id))) }));
    },
    [demo, maj, sp],
  );

  const publierInfo = useCallback(
    async (i: Omit<Info, 'id'>) => {
      const complete: Info = { ...i, id: demo ? `demo-i-${Date.now()}` : await (await sp()).enregistrerInfo(i) };
      maj((x) => ({ ...x, infos: [...x.infos, complete] }));
    },
    [demo, maj, sp],
  );

  const supprimerInfo = useCallback(
    async (i: Info) => {
      if (!demo && i.id) await (await sp()).supprimerInfo(i.id);
      maj((x) => ({ ...x, infos: x.infos.filter((y) => !(y === i || (i.id && y.id === i.id))) }));
    },
    [demo, maj, sp],
  );

  const signaler = useCallback(
    async (local: string, texte: string, urgent: boolean) => {
      if (!ds) return;
      const propre = texte.trim();
      const titre = local && !propre.toUpperCase().startsWith(local.toUpperCase()) ? `${local} · ${propre}` : propre;
      const s: Signalement = {
        local,
        titre,
        depuis: aujourdhui,
        bloquant: urgent,
        statut: 'Nouveau',
        resolu: false,
        auteur: demo ? (profil === 'eleve' ? 'Élève (démo)' : 'Camille Moreau') : moiAffiche,
        auteurMail: ds.moi.email,
        le: horodatage(),
      };
      s.id = demo ? `demo-s-${Date.now()}` : await (await sp()).enregistrerSignalement(titre, urgent);
      maj((x) => ({ ...x, signalements: [s, ...x.signalements] }));
    },
    [aujourdhui, demo, ds, horodatage, maj, moiAffiche, profil, sp],
  );

  const traiterSignalement = useCallback(
    async (s: Signalement, statut: string, reponse?: string) => {
      if (!demo && s.id) await (await sp()).traiterSignalement(s.id, statut, reponse);
      maj((x) => ({
        ...x,
        signalements: x.signalements.map((y) =>
          y === s || (s.id && y.id === s.id) ? { ...y, statut, resolu: /résolu/i.test(statut), ...(reponse !== undefined ? { reponse } : {}) } : y,
        ),
      }));
    },
    [demo, maj, sp],
  );

  const reserverMateriel = useCallback(
    async (m: Omit<ResaMateriel, 'prof' | 'id'>) => {
      if (!ds) return;
      const stock = RACKS.find((r) => r.nom === m.rack)?.stock ?? 1;
      if (ds.materiel.filter((x) => x.rack === m.rack && x.date === m.date && x.h === m.h).length >= stock) throw new Error(`${m.rack} est déjà pris en H${m.h}.`);
      const complete: ResaMateriel = { ...m, prof: ds.moi.nom };
      complete.id = demo ? `demo-m-${Date.now()}-${m.h}` : await (await sp()).enregistrerMateriel(complete);
      maj((x) => ({ ...x, materiel: [...x.materiel, complete] }));
    },
    [demo, ds, maj, sp],
  );

  const annulerMateriel = useCallback(
    async (m: ResaMateriel) => {
      if (!demo && m.id) await (await sp()).supprimerMateriel(m.id);
      maj((x) => ({ ...x, materiel: x.materiel.filter((y) => !(y === m || (m.id && y.id === m.id))) }));
    },
    [demo, maj, sp],
  );

  const publier = useCallback(
    async (date: string) => {
      if (!ds) return 0;
      let base = ds;
      // En vrai, on relit tout juste avant : une validation a pu arriver entre-temps.
      if (!demo) base = await (await sp()).chargerSharePoint(ds.moi.email ?? '', ds.moi.prenom);
      const lignes = changementsDuJour(base, date);
      if (!demo) await (await sp()).publierChangements(date, lignes);
      setDs({ ...base, changements: [...base.changements.filter((c) => c.date !== date), ...lignes.map((c, i) => ({ ...c, id: `p-${date}-${i}` }))] });
      return lignes.length;
    },
    [demo, ds, sp],
  );

  const ouvrirTeams = useCallback(
    (m: MessageTeams) => {
      if (demo) {
        setApercuTeams(m);
        return;
      }
      const url =
        m.type === 'teams-chat'
          ? lienChatTeams(m.emails, m.message, m.sujet)
          : lienReunionTeams({ sujet: m.sujet, debut: new Date(m.debut), fin: new Date(m.fin), participants: m.emails, contenu: m.contenu });
      void import('../lib/teams').then((t) => t.ouvrirLien(url));
    },
    [demo],
  );

  const peutValider = demo ? profil === 'educateur' || profil === 'secretariat' : peutValiderAvec(ds?.moi.roles);
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
      profil,
      profils,
      changerProfil,
      classeEleve,
      changerClasseEleve,
      reserver,
      annulerReservation,
      proposer,
      decider,
      peutValider,
      peutVoirValidations,
      encoderAbsences,
      modifierAbsence,
      supprimerAbsence,
      publierInfo,
      supprimerInfo,
      signaler,
      traiterSignalement,
      reserverMateriel,
      annulerMateriel,
      publier,
      ouvrirTeams,
      apercuTeams,
      fermerApercuTeams: () => setApercuTeams(null),
      toast,
      montrerToast,
    }),
    [ds, demo, maintenant, aujourdhui, minutes, heureFinie, heurePassee, chargement, erreur, charger, profil, profils, changerProfil, classeEleve, changerClasseEleve, reserver, annulerReservation, proposer, decider, peutValider, peutVoirValidations, encoderAbsences, modifierAbsence, supprimerAbsence, publierInfo, supprimerInfo, signaler, traiterSignalement, reserverMateriel, annulerMateriel, publier, ouvrirTeams, apercuTeams, toast, montrerToast],
  );

  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}
