// Écran « Horaire » : la semaine, les heures libérées et les flèches de déplacement.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as EvPointeur, type CSSProperties } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { Feuille } from '../ui/Feuille';
import { Entete } from '../ui/Entete';
import { absentA, coursDuProf, coursSansProf, nomAffiche, type CoursJour, enStage, sansStage } from '../logic/horaire';
import { capital, opportunitesSemaine, optionsPour, probable, type OptionDeplacement } from '../logic/deplacements';
import type { Deplacement } from '../data/types';
import { JOURS, JOURS_COURTS, MIDI, PERIODES, conge, deIso, iso, jourSemaine, jourSemaineIso, lundiDe, periode, plusJours, plusJoursIso, situation } from '../lib/calendar';
import { aller, lireRoute } from '../lib/route';
import { couleurMatiere } from '../logic/couleurs';

type Vue = 'moi' | 'classe' | 'local';
const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

interface Case {
  cle: string;
  date: string;
  h: number;
  type: 'vide' | 'cours' | 'passe' | 'possible' | 'etoile' | 'perdue' | 'deplace' | 'attente' | 'depart' | 'libre-maint' | 'sansprof' | 'stage';
  haut?: string;
  bas?: string;
  nb?: number;
  cours?: CoursJour;
}

interface Fleche {
  d: string;
  couleur: string;
  marqueur: string;
  label?: { x: number; y: number; texte: string };
  epais: number;
  anime: boolean;
}

const CLE_AIDE = 'behappi-aide-horaire';
const aideVue = (): boolean => {
  try {
    return localStorage.getItem(CLE_AIDE) === '1';
  } catch {
    return false;
  }
};

export function Horaire() {
  const { ds, maintenant, aujourdhui, minutes, heureFinie, priorites, changerPriorites, proposer, retirer, montrerToast } = useStore();
  // Pendant un congé, on ouvre directement la première semaine de cours (au plus 3 semaines plus loin).
  const [depart] = useState(() => {
    const b = jourSemaine(maintenant) >= 6 ? plusJours(maintenant, 8 - jourSemaine(maintenant)) : lundiDe(maintenant);
    for (let n = 0; n < 3; n++) if ([0, 1, 2, 3, 4].some((k) => !conge(plusJours(b, n * 7 + k)))) return n;
    return 0;
  });
  const [decalage, setDecalage] = useState(depart);
  // L'aide sous la grille disparaît dès qu'on a touché une heure libérée une première fois.
  const [aide, setAide] = useState(() => !aideVue());
  const [sens, setSens] = useState(0);
  // Version de test : toujours la semaine, toujours « Moi » (une classe ou un local : « Où est ? »).
  const mode = 'semaine' as 'semaine' | 'jour';
  const [jourIdx, setJourIdx] = useState<number | null>(null);
  const vue = 'moi' as Vue;
  const classe = '';
  const salle = '';
  // Œil : tous les déplacements possibles (même ceux qui te coûtent), avec tes préférences.
  const [explorer, setExplorer] = useState(false);
  // Le cours choisi (en attente de « Proposer »), l'animation, la proposition qu'on peut encore annuler.
  const [choix, setChoix] = useState<OptionDeplacement | null>(null);
  const [envol, setEnvol] = useState<{ texte: string; x0: number; y0: number; x1: number; y1: number; w: number; h: number } | null>(null);
  const [fait, setFait] = useState<Deplacement | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [detail, setDetail] = useState<CoursJour | null>(null);
  const [passee, setPassee] = useState<Case | null>(null);
  const grilleRef = useRef<HTMLDivElement>(null);
  const [fleches, setFleches] = useState<Fleche[]>([]);

  const sit = situation(minutes);
  const finieEff = sit.enCours ? sit.h : heureFinie;
  const base = jourSemaine(maintenant) >= 6 ? plusJours(maintenant, 8 - jourSemaine(maintenant)) : lundiDe(maintenant);
  const lundi = iso(plusJours(base, decalage * 7));
  const dates = useMemo(() => [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n)), [lundi]);

  const moi = ds?.moi.nom ?? '';
  const mesClasses = useMemo(() => (ds ? [...new Set(ds.cours.filter((c) => c.prof === moi).flatMap((c) => c.classes))].sort() : []), [ds, moi]);
  const classeVue = classe || mesClasses[0] || '';
  const salleVue = salle || 'BT004';

  const opps = useMemo(() => (ds && vue === 'moi' ? opportunitesSemaine(ds, moi, lundi, aujourdhui, finieEff, priorites) : new Map()), [ds, vue, moi, lundi, aujourdhui, finieEff, priorites]);


  // Le meilleur cours à avancer pour chaque heure libérée de la semaine : une flèche directement sur l'horaire.
  const parHeure = useMemo(() => {
    const m = new Map<string, ReturnType<typeof optionsPour>>();
    if (!ds || vue !== 'moi') return m;
    for (const o of opps.values()) {
      if (o.passe) continue;
      // D'office : seulement ce que le prof a toutes les chances d'accepter. L'œil montre tout.
      const l = optionsPour(ds, moi, o.date, o.h, aujourdhui, finieEff, priorites);
      const g = explorer ? l : l.filter(probable);
      if (g.length) m.set(`${o.date}|${o.h}`, g);
    }
    return m;
  }, [ds, vue, opps, moi, aujourdhui, finieEff, priorites, explorer]);
  // Ce qu'on montre d'office : seulement les meilleures propositions (vraiment avantageuses pour toi),
  // 3 au plus, un cours ne part que vers une seule heure. Les autres : au survol ou au toucher.
  const meilleures = useMemo(() => {
    const tous = [...parHeure.values()].map((l) => l[0]).filter((o) => o && probable(o) && !o.semaineSuivante);
    tous.sort((a, b) => b.score - a.score);
    const pris = new Set<string>();
    const res: typeof tous = [];
    for (const o of tous) {
      const k = `${o.dateO}|${o.hO}`;
      if (pris.has(k)) continue;
      pris.add(k);
      res.push(o);
      if (res.length >= 3) break;
    }
    return res;
  }, [parHeure]);
  // Souris : survoler une heure libérée montre ses options ; survoler un cours montre où il peut aller.
  const [survol, setSurvol] = useState<string | null>(null);
  // Au doigt : l'heure libérée touchée une fois (ses flèches restent affichées).
  const [apercu, setApercu] = useState<string | null>(null);
  const survolees = useMemo(() => {
    const cle = apercu ?? survol;
    if (!cle) return null;
    const ici = parHeure.get(cle);
    if (ici?.length) return ici.slice(0, 4);
    const depuis = [...parHeure.values()].flat().filter((o) => `${o.semaineSuivante ? plusJoursIso(o.dateO, -7) : o.dateO}|${o.hO}` === cle);
    return depuis.length ? depuis : null;
  }, [survol, apercu, parHeure]);

  // Glisser-déposer : prendre un cours qui peut bouger et le lâcher sur une heure encadrée.
  // Souris : on glisse tout de suite ; doigt : appui long (0,3 s) puis on glisse.
  const origineDe = (o: { semaineSuivante: boolean; dateO: string; hO: number }) => `${o.semaineSuivante ? plusJoursIso(o.dateO, -7) : o.dateO}|${o.hO}`;
  const glisse = useRef<{ cle: string; texte: string; x0: number; y0: number; id: number; souris: boolean; actif: boolean; minuteur?: number } | null>(null);
  const [fantome, setFantome] = useState<{ x: number; y: number; texte: string } | null>(null);
  const ignorerClic = useRef(false);
  const doigt = useRef<{ x: number; y: number } | null>(null);

  const placer = (x: number, y: number) => {
    const g = grilleRef.current;
    if (!g || !glisse.current) return;
    const r = g.getBoundingClientRect();
    setFantome({ x: x - r.left, y: y - r.top, texte: glisse.current.texte });
  };
  const activer = (x: number, y: number) => {
    const g = glisse.current;
    if (!g) return;
    g.actif = true;
    setSurvol(g.cle);
    try {
      navigator.vibrate?.(12);
    } catch {
      /* rien */
    }
    placer(x, y);
  };
  function debutGlisse(e: EvPointeur) {
    if (vue !== 'moi' || e.button > 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cle]');
    const cle = el?.dataset.cle;
    if (!cle || ![...parHeure.values()].flat().some((o) => origineDe(o) === cle)) return;
    const texte = el.querySelector('b')?.textContent ?? '';
    const souris = e.pointerType === 'mouse';
    glisse.current = { cle, texte, x0: e.clientX, y0: e.clientY, id: e.pointerId, souris, actif: false };
    if (!souris) glisse.current.minuteur = window.setTimeout(() => activer(e.clientX, e.clientY), 300);
  }
  function bougeGlisse(e: EvPointeur) {
    const g = glisse.current;
    if (!g || e.pointerId !== g.id) return;
    if (!g.actif) {
      const d = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
      if (g.souris && d > 6) activer(e.clientX, e.clientY);
      else if (!g.souris && d > 10) {
        window.clearTimeout(g.minuteur);
        glisse.current = null;
      }
      return;
    }
    placer(e.clientX, e.clientY);
  }
  function finGlisse(e: EvPointeur, annule = false) {
    const g = glisse.current;
    glisse.current = null;
    if (!g) return;
    window.clearTimeout(g.minuteur);
    if (!g.actif) return;
    setFantome(null);
    setSurvol(null);
    ignorerClic.current = true;
    window.setTimeout(() => (ignorerClic.current = false), 80);
    if (annule) return;
    const cible = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cle]')?.dataset.cle;
    const o = [...parHeure.values()].flat().find((x) => origineDe(x) === g.cle && `${x.date}|${x.h}` === cible);
    if (o) setChoix(o);
    else if (cible !== g.cle) montrerToast('Lâche le cours sur une heure encadrée');
  }
  // Pendant le glisser au doigt, la page ne doit pas défiler.
  useEffect(() => {
    const g = grilleRef.current;
    if (!g) return;
    const bloquer = (e: TouchEvent) => {
      if (glisse.current?.actif) e.preventDefault();
    };
    g.addEventListener('touchmove', bloquer, { passive: false });
    return () => g.removeEventListener('touchmove', bloquer);
  });

  const lignes: Case[][] = useMemo(() => {
    if (!ds) return [];
    return PERIODES.map((p) =>
      dates.map((date): Case => {
        const cle = `${date}|${p.h}`;
        const passe = date < aujourdhui || (date === aujourdhui && p.h <= heureFinie && !(sit.enCours && p.h === sit.h));
        if (conge(deIso(date))) return { cle, date, h: p.h, type: 'vide' };
        if (vue === 'classe') {
          const jour = jourSemaineIso(date);
          const c = ds.cours.find((x) => x.jour === jour && x.h === p.h && x.classes.includes(classeVue));
          if (!c) return { cle, date, h: p.h, type: 'vide' };
          if (enStage(ds, classeVue, date)) return { cle, date, h: p.h, type: 'stage', haut: 'Stage' };
          if (absentA(ds, c.prof, date, p.h)) return { cle, date, h: p.h, type: 'sansprof', haut: c.matiere.slice(0, 10) || 'Cours', bas: 'sans prof' };
          return { cle, date, h: p.h, type: passe ? 'passe' : 'cours', haut: c.matiere.slice(0, 10) || c.classe, bas: nomAffiche(c.prof).slice(0, 9) };
        }
        if (vue === 'local') {
          const jour = jourSemaineIso(date);
          const c = ds.cours.find((x) => x.jour === jour && x.h === p.h && x.local === salleVue && !absentA(ds, x.prof, date, p.h) && !!sansStage(ds, x, date));
          const r = ds.reservations.find((x) => x.date === date && x.h === p.h && x.local === salleVue);
          if (r) return { cle, date, h: p.h, type: 'attente', haut: r.classe.split(' ')[0], bas: 'réservé' };
          if (!c) return { cle, date, h: p.h, type: 'vide' };
          return { cle, date, h: p.h, type: passe ? 'passe' : 'cours', haut: c.classe, bas: nomAffiche(c.prof).slice(0, 9) };
        }
        const c = coursDuProf(ds, moi, date, true).find((x) => x.h === p.h);
        const part = ds.deplacements.find((d) => d.prof === moi && d.statut !== 'Refusé' && d.dateOrigine === date && d.hOrigine === p.h);
        if (c && c.deplace) {
          const valide = c.deplace.statut === 'Validé';
          return { cle, date, h: p.h, type: valide ? 'deplace' : 'attente', haut: c.classe, bas: valide ? 'déplacé' : 'proposé', cours: c };
        }
        if (c && part) return { cle, date, h: p.h, type: 'depart', haut: c.classe, bas: `→ ${JOURS_COURTS[jourSemaineIso(part.date)].toLowerCase()}. H${part.hVide}`, cours: c };
        if (c) return { cle, date, h: p.h, type: passe ? 'passe' : 'cours', haut: c.classe, bas: c.local, cours: c };
        if (part && part.statut === 'Validé') return { cle, date, h: p.h, type: 'perdue', haut: `→ ${JOURS_COURTS[jourSemaineIso(part.date)].toLowerCase()}. H${part.hVide}` };
        const o = opps.get(cle);
        const nb = parHeure.get(cle)?.length ?? 0;
        if (date === aujourdhui && sit.enCours && p.h === sit.h) return { cle, date, h: p.h, type: 'libre-maint', haut: 'Libre', bas: 'en cours', nb };
        if (o && o.passe) return { cle, date, h: p.h, type: 'perdue', nb: o.nb };
        // ✦ seulement là où arrive une des meilleures propositions (celles dessinées d'office).
        // Sans proposition à montrer (d'office : rien de vraiment avantageux), l'heure reste simplement libre.
        if (o && nb) return { cle, date, h: p.h, type: meilleures.some((m) => `${m.date}|${m.h}` === cle) ? 'etoile' : 'possible', nb };
        // Un cours qui saute parce que la classe est en stage : l'heure est libre, on dit pourquoi.
        const enStageIci = ds.cours.find((x) => x.prof === moi && x.jour === jourSemaineIso(date) && x.h === p.h && !sansStage(ds, x, date));
        if (enStageIci) return { cle, date, h: p.h, type: 'stage', haut: enStageIci.classe, bas: 'stage' };
        return { cle, date, h: p.h, type: 'vide' };
      }),
    );
  }, [ds, dates, vue, classeVue, salleVue, moi, opps, parHeure, meilleures, aujourdhui, heureFinie, sit.enCours, sit.h]);

  // Flèches : du cours de départ vers l'heure libérée.
  const dessiner = useCallback(() => {
    const g = grilleRef.current;
    if (!g || vue !== 'moi') {
      setFleches([]);
      return;
    }
    const gr = g.getBoundingClientRect();
    const centre = (cle: string) => {
      const el = g.querySelector<HTMLElement>(`[data-cle="${cle}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - gr.left + r.width / 2, y: r.top - gr.top + r.height / 2, w: r.width, h: r.height };
    };
    const res: Fleche[] = [];
    // Un cours choisi : sa seule flèche. Une heure touchée ou survolée : ses options, animées.
    // Sinon : les meilleures propositions seulement.
    const aDessiner = choix ? [choix] : survolees ?? meilleures;
    const vif = !!choix || !!survolees;
    aDessiner.forEach((o) => {
      const cible = centre(`${o.date}|${o.h}`);
      const dateCase = o.semaineSuivante ? plusJoursIso(o.dateO, -7) : o.dateO;
      const dep = centre(`${dateCase}|${o.hO}`);
      if (!dep || !cible) return;
      const dx = cible.x - dep.x;
      const dy = cible.y - dep.y;
      const long = Math.hypot(dx, dy) || 1;
      const ux = dx / long;
      const uy = dy / long;
      const x1 = dep.x + ux * Math.min(dep.w, dep.h) * 0.45;
      const y1 = dep.y + uy * Math.min(dep.w, dep.h) * 0.45;
      const x2 = cible.x - ux * Math.min(cible.w, cible.h) * 0.55;
      const y2 = cible.y - uy * Math.min(cible.w, cible.h) * 0.55;
      const cx = (x1 + x2) / 2 - uy * long * 0.18;
      const cy = (y1 + y2) / 2 + ux * long * 0.18;
      const fort = vif ? o.meilleur : true;
      const couleur = o.semaineSuivante ? 'var(--sarcelle)' : fort ? 'var(--indigo)' : 'var(--indigo-moyen)';
      res.push({
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
        couleur,
        marqueur: o.semaineSuivante ? 'pointe-s1' : fort ? 'pointe-best' : 'pointe-autre',
        epais: vif ? (o.meilleur ? 3 : 2.2) : fort ? 2.4 : 1.8,
        anime: vif,
        label: o.semaineSuivante ? { x: (x1 + 2 * cx + x2) / 4, y: (y1 + 2 * cy + y2) / 4, texte: 'S+1' } : undefined,
      });
    });
    setFleches(res);
  }, [choix, vue, meilleures, survolees]);

  useLayoutEffect(() => {
    dessiner();
    const g = grilleRef.current;
    if (!g) return;
    const ro = new ResizeObserver(() => dessiner());
    ro.observe(g);
    return () => ro.disconnect();
  }, [dessiner, lignes]);

  // Lien d'une notification Teams (« prop~dateO~hO~date~h ») ou #/horaire?prop=… : la semaine de
  // l'heure libérée s'ouvre et le déplacement est prêt ; il ne reste qu'à toucher « Proposer ».
  const [demande, setDemande] = useState<string | null>(() => lireRoute().params.get('prop'));
  const demandeVue = useRef(false);
  useEffect(() => {
    if (demande) return;
    let actif = true;
    void import('../lib/teams').then((t) => t.sousPage()).then((p) => actif && p && setDemande(p.replace(/^prop~/, '')));
    return () => {
      actif = false;
    };
  }, [demande]);
  useEffect(() => {
    if (!ds || !demande || demandeVue.current) return;
    const [dateO, hO, date, h] = demande.split('~');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !Number(h)) return;
    const semaines = Math.round((deIso(iso(lundiDe(deIso(date)))).getTime() - deIso(iso(lundiDe(base))).getTime()) / (7 * 86400000));
    if (semaines !== decalage) {
      setDecalage(semaines);
      return; // on attend la bonne semaine
    }
    demandeVue.current = true;
    const o = optionsPour(ds, moi, date, Number(h), aujourdhui, finieEff, priorites).find((x) => x.dateO === dateO && x.hO === Number(hO));
    if (o) setChoix(o);
    else montrerToast('Ce déplacement n’est plus possible (déjà repris, annulé ou heure passée).');
  }, [ds, demande, decalage, base, moi, aujourdhui, finieEff, priorites, montrerToast]);

  // « Proposé » reste annulable quelques secondes.
  useEffect(() => {
    if (!fait) return;
    const id = window.setTimeout(() => setFait(null), 8000);
    return () => window.clearTimeout(id);
  }, [fait]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;

  const d1 = deIso(dates[0]);
  const d5 = deIso(dates[4]);
  const libelleSemaine = d1.getMonth() === d5.getMonth() ? `${d1.getDate()} – ${d5.getDate()} ${MOIS[d5.getMonth()]}` : `${d1.getDate()} ${MOIS[d1.getMonth()]} – ${d5.getDate()} ${MOIS[d5.getMonth()]}`;
  const colonneAuj = dates.indexOf(aujourdhui);
  const origines = new Set((choix ? [choix] : survolees ?? []).map((o) => `${o.semaineSuivante ? plusJoursIso(o.dateO, -7) : o.dateO}|${o.hO}`));
  const cibles = new Set((survolees ?? []).map((o) => `${o.date}|${o.h}`));
  const mobiles = new Set([...parHeure.values()].flat().map(origineDe));
  const aiguille = (() => {
    if (colonneAuj < 0 || sit.h < 1 || sit.h > 9) return null;
    const p = periode(sit.h);
    const top = sit.enCours ? (sit.h - 1) * 52 + ((minutes - p.dm) / (p.fm - p.dm)) * 48 : (sit.h - 1) * 52 - 2;
    return top;
  })();

  const jourCourt = (d: string) => `${JOURS_COURTS[jourSemaineIso(d)].toLowerCase()}.`;

  /** Le cours choisi glisse vers l'heure libérée, puis la barre « Proposer » apparaît. */
  function choisir(o: OptionDeplacement) {
    setApercu(null);
    setFait(null);
    const g = grilleRef.current;
    const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const el = (cle: string) => g?.querySelector<HTMLElement>(`[data-cle="${cle}"]`)?.getBoundingClientRect();
    const a = el(origineDe(o));
    const b = el(`${o.date}|${o.h}`);
    const gr = g?.getBoundingClientRect();
    if (!a || !b || !gr || reduit) {
      setChoix(o);
      return;
    }
    setEnvol({ texte: o.classe, x0: a.left - gr.left, y0: a.top - gr.top, x1: b.left - gr.left, y1: b.top - gr.top, w: a.width, h: a.height });
    window.setTimeout(() => {
      setEnvol(null);
      setChoix(o);
    }, 1150);
  }

  async function confirmer() {
    if (!choix) return;
    setEnvoi(true);
    try {
      const d = await proposer({ absent: choix.absent, date: choix.date, hVide: choix.h, classe: choix.classe, hOrigine: choix.hO, dateOrigine: choix.dateO });
      setChoix(null);
      setFait(d ?? null);
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  async function annuler(d: Deplacement) {
    try {
      await retirer(d);
      setFait(null);
      setDetail(null);
      montrerToast('Proposition retirée : ton cours reste à sa place');
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    }
  }

  function toucher(c: Case) {
    if (vue !== 'moi' || ignorerClic.current) return;
    if (c.type === 'perdue') {
      setPassee(c);
      return;
    }
    if (c.cours) {
      // Une heure libérée est ouverte et ce cours peut y aller : c'est le choix.
      const o = apercu ? (parHeure.get(apercu) ?? []).find((x) => origineDe(x) === c.cle) : undefined;
      if (o) {
        choisir(o);
        return;
      }
      setApercu(null);
      setChoix(null);
      setDetail(c.cours);
      return;
    }
    if ((c.type === 'possible' || c.type === 'etoile' || (c.type === 'libre-maint' && c.nb)) && c.nb) {
      // Un toucher : les flèches ; un second toucher sur la même heure : on les retire.
      setChoix(null);
      setApercu(apercu === c.cle ? null : c.cle);
      if (aide) {
        setAide(false);
        try {
          localStorage.setItem(CLE_AIDE, '1');
        } catch {
          /* rien */
        }
      }
    } else {
      setApercu(null);
      setChoix(null);
    }
  }

  const changerSemaine = (n: number) => {
    setDecalage((d) => d + n);
    setSens(n);
    setApercu(null);
    setChoix(null);
    setJourIdx(null);
  };

  const colStyle = (i: number) => ({ left: `calc(46px + ${i} * ((100% - 62px) / 5 + 4px))`, width: 'calc((100% - 62px) / 5)' });


  return (
    <section
      className="ecran ecran--large ecran--horaire"
      aria-label="Horaire"
      // Glisser du doigt vers la gauche ou la droite : semaine suivante ou précédente (partout sur l'écran).
      onTouchStart={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return; // une feuille ouverte (portail) : pas ici
        doigt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const d = doigt.current;
        doigt.current = null;
        if (!d || ignorerClic.current || glisse.current?.actif || !e.currentTarget.contains(e.target as Node)) return;
        const dx = e.changedTouches[0].clientX - d.x;
        const dy = e.changedTouches[0].clientY - d.y;
        if (Math.abs(dx) >= 60 && Math.abs(dx) > 2 * Math.abs(dy)) changerSemaine(dx < 0 ? 1 : -1);
      }}
    >
      <Entete
        titre={libelleSemaine}
        sous={vue === 'moi' ? undefined : vue === 'classe' ? `Horaire de la ${classeVue}` : `Occupation de ${salleVue}`}
        droite={
          <>
            <button
              className={`rond rond--petit${explorer ? ' rond--actif' : ''}`}
              aria-pressed={explorer}
              aria-label={explorer ? 'Revenir aux meilleures propositions' : 'Voir tous les déplacements possibles'}
              title={explorer ? 'Revenir aux meilleures propositions' : 'Voir tous les déplacements possibles'}
              onClick={() => {
                setExplorer((v) => !v);
                setApercu(null);
                setChoix(null);
              }}
            >
              <Icon nom="oeil" taille={18} />
            </button>
            <button className="rond rond--petit" aria-label="Semaine précédente" onClick={() => changerSemaine(-1)}>
              <Icon nom="gauche" taille={18} />
            </button>
            <button className="rond rond--petit" aria-label="Semaine suivante" onClick={() => changerSemaine(1)}>
              <Icon nom="droite" taille={18} />
            </button>
          </>
        }
        apres={
          decalage !== depart ? (
            <button className="puce puce--indigo puce--bouton" onClick={() => { setDecalage(depart); setApercu(null); setChoix(null); }}>
              Revenir à cette semaine
            </button>
          ) : undefined
        }
      />

      {explorer && (
        <div className="explorer" aria-label="Tous les déplacements possibles">
          <span className="petit">
            <b>Tous les déplacements possibles</b>, même ceux qui te coûtent. Ce qui compte pour toi :
          </span>
          <div className="rangee enrouler" style={{ gap: 6 }}>
            {(
              [
                ['finTot', 'Finir plus tôt'],
                ['debutTard', 'Commencer plus tard'],
                ['fourches', 'Moins de fourches'],
              ] as const
            ).map(([k, libelle]) => (
              <button key={k} className={`puce puce--bouton${priorites[k] ? ' puce--indigo' : ''}`} aria-pressed={priorites[k]} onClick={() => changerPriorites({ ...priorites, [k]: !priorites[k] })}>
                {priorites[k] && <Icon nom="coche" taille={13} epaisseur={2.6} />} {libelle}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'jour' && (() => {
        const idx = jourIdx ?? (colonneAuj >= 0 ? colonneAuj : Math.max(0, dates.findIndex((d) => !conge(deIso(d)))));
        const dateJ = dates[idx];
        const cg = conge(deIso(dateJ));
        return (
          <div
            className="jour-vue"
            onTouchStart={(e) => (doigt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
            onTouchEnd={(e) => {
              const d = doigt.current;
              doigt.current = null;
              if (!d) return;
              const dx = e.changedTouches[0].clientX - d.x;
              const dy = e.changedTouches[0].clientY - d.y;
              if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return;
              const n = idx + (dx < 0 ? 1 : -1);
              if (n < 0) { changerSemaine(-1); setJourIdx(4); }
              else if (n > 4) { changerSemaine(1); setJourIdx(0); }
              else setJourIdx(n);
            }}
          >
            <div className="seg seg--jours" role="group" aria-label="Jour">
              {dates.map((d, i) => (
                <button key={d} aria-pressed={i === idx} onClick={() => setJourIdx(i)} className={i === colonneAuj ? 'auj' : undefined}>
                  <span>{JOURS_COURTS[i + 1]}</span>
                  <b>{deIso(d).getDate()}</b>
                </button>
              ))}
            </div>
            {cg ? (
              <p className="texte">{cg.nom} : pas de cours.</p>
            ) : (
              <div className="pile pile--8" key={dateJ}>
                {lignes.map((ligne, hIdx) => {
                  const c = ligne[idx];
                  const p = PERIODES[hIdx];
                  const meilleure = parHeure.get(c.cle)?.[0];
                  let titre = c.haut ?? '';
                  let sous = c.bas ?? '';
                  if (c.cours) {
                    titre = `${c.cours.classe}${c.cours.matiere ? ` · ${c.cours.matiere}` : ''}`;
                    sous = c.type === 'deplace' ? `${c.cours.local} · cours déplacé ici` : c.type === 'attente' ? `${c.cours.local} · proposé, à valider` : c.type === 'depart' ? `${c.cours.local} · part ${c.bas?.replace('→ ', 'vers ')}` : c.cours.local;
                  } else if (c.type === 'possible' || c.type === 'etoile') {
                    titre = `${c.nb} cours ${c.nb && c.nb > 1 ? 'peuvent' : 'peut'} venir ici`;
                    sous = meilleure ? `Le plus avantageux : ${meilleure.classe}, ${JOURS[jourSemaineIso(meilleure.dateO)].toLowerCase()} H${meilleure.hO} · ${meilleure.resume.split(' · ')[0]}` : '';
                  } else if (c.type === 'stage') {
                    titre = `${c.haut} en stage`;
                    sous = 'Pas de cours : heure libre';
                  } else if (c.type === 'perdue') {
                    titre = c.haut ? `Cours parti ${c.haut.replace('→ ', 'vers ')}` : 'Heure passée';
                    sous = c.haut ? '' : `${c.nb} classe${c.nb && c.nb > 1 ? 's' : ''} à toi à l’étude`;
                  } else if (c.type === 'vide') {
                    titre = p.h === MIDI ? 'Temps de midi' : 'Libre';
                  }
                  return (
                    <button key={c.cle} className={`jour-ligne jour-ligne--${c.type}${p.h === MIDI ? ' jour-ligne--midi' : ''}`} onClick={() => toucher(c)} disabled={c.type === 'vide' || vue !== 'moi'}>
                      <span className="jour-heure">
                        <b>H{p.h}</b>
                        <span>{p.debut}</span>
                      </span>
                      <span className="pile grandit">
                        <span className="jour-titre">{titre}</span>
                        {sous && <span className="jour-sous">{sous}</span>}
                      </span>
                      {(c.type === 'possible' || c.type === 'etoile') && <Icon nom="droite" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {mode === 'semaine' && (
      <>
      <div className="semaine-entete">
        <span />
        {dates.map((d, i) => (
          <div key={d} className={`jour-entete${i === colonneAuj ? ' jour-entete--auj' : ''}`}>
            <span>{JOURS_COURTS[i + 1]}</span>
            <b>{deIso(d).getDate()}</b>
          </div>
        ))}
      </div>

      <div
        className={`grille${fantome ? ' grille--glisse' : ''}${sens ? (sens > 0 ? ' grille--suivante' : ' grille--precedente') : ''}`}
        key={lundi}
        ref={grilleRef}
        onPointerLeave={() => !glisse.current?.actif && setSurvol(null)}
        onPointerDown={debutGlisse}
        onPointerMove={bougeGlisse}
        onPointerUp={(e) => finGlisse(e)}
        onPointerCancel={(e) => finGlisse(e, true)}
      >
        {envol && <Envol {...envol} />}
        {fantome && (
          <div className="fantome" style={{ transform: `translate(${fantome.x}px, ${fantome.y}px)` }}>
            {fantome.texte}
          </div>
        )}
        {colonneAuj >= 0 && <div className="colonne-auj" style={colStyle(colonneAuj)} />}
        {dates.map((d, i) => {
          const c = conge(deIso(d));
          return c ? (
            <div key={d} className="colonne-conge" style={colStyle(i)}>
              <span>{c.nom}</span>
            </div>
          ) : null;
        })}

        {lignes.map((ligne, idx) => {
          const p = PERIODES[idx];
          return (
            <div key={p.h} className={`semaine-ligne${p.h === MIDI ? ' semaine-ligne--midi' : ''}`}>
              <div className="heure-col">
                <b>H{p.h}</b>
                <span>{p.debut}</span>
              </div>
              {ligne.map((c) => (
                <CaseHoraire
                  key={c.cle}
                  c={c}
                  cible={apercu === c.cle || (!!choix && `${choix.date}|${choix.h}` === c.cle) || cibles.has(c.cle)}
                  origine={origines.has(c.cle)}
                  mobile={mobiles.has(c.cle)}
                  onClick={() => toucher(c)}
                  cliquable={vue === 'moi'}
                  onSurvol={(e, dedans) => {
                    if (e.pointerType !== 'mouse' || vue !== 'moi' || glisse.current?.actif) return;
                    setSurvol(dedans ? c.cle : null);
                  }}
                />
              ))}
            </div>
          );
        })}

        {aiguille !== null && (
          <div className="aiguille" style={{ top: aiguille, left: `calc(46px + ${colonneAuj} * ((100% - 62px) / 5 + 4px) - 4px)`, width: 'calc((100% - 62px) / 5 + 8px)' }} />
        )}

        <svg className="fleches" aria-hidden="true">
          <defs>
            {[
              ['pointe-best', 'var(--indigo)'],
              ['pointe-autre', 'var(--indigo-moyen)'],
              ['pointe-s1', 'var(--sarcelle)'],
            ].map(([id, c]) => (
              <marker key={id} id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill={c} />
              </marker>
            ))}
          </defs>
          {fleches.map((f, i) => (
            <g key={i}>
              <path d={f.d} fill="none" stroke="var(--fond)" strokeWidth={f.epais + 4} strokeLinecap="round" opacity={0.85} />
              <path d={f.d} fill="none" stroke={f.couleur} strokeWidth={f.epais} strokeDasharray={f.anime ? '6 4' : undefined} strokeLinecap="round" markerEnd={`url(#${f.marqueur})`} opacity={f.anime ? 1 : 0.9}>
                {f.anime && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.9s" repeatCount="indefinite" />}
              </path>
              {f.label && (
                <g transform={`translate(${f.label.x} ${f.label.y})`}>
                  <rect x={-17} y={-11} width={34} height={22} rx={11} fill="var(--sarcelle)" />
                  <text x={0} y={4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
                    {f.label.texte}
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
      </>
      )}

      {(() => {
        // Une heure libérée ouverte : qui est absent, et quoi faire.
        const ici = apercu ? parHeure.get(apercu) ?? [] : [];
        if (!ici.length || choix) return null;
        const absents = [...new Set(ici.map((o) => nomAffiche(o.absent)))];
        return (
          <p className="petit indication">
            <b>{capital(jourCourt(ici[0].date))} H{ici[0].h}</b> · {absents.join(', ')} {absents.length > 1 ? 'absents' : 'absent·e'} · touche le cours à avancer, ou encore l’heure pour fermer.
          </p>
        );
      })()}
      {vue === 'moi' && !apercu && !choix && mode === 'semaine' && aide && (
        <p className="petit" style={{ margin: 0 }}>
          {meilleures.length
            ? 'Touche une heure libérée : ses flèches apparaissent. Touche ensuite le cours à avancer.'
            : explorer
              ? 'Aucun déplacement possible cette semaine.'
              : 'Pas de déplacement vraiment avantageux cette semaine. L’œil, en haut, montre toutes les possibilités.'}
        </p>
      )}

      {choix && (
        <div className="barre-choix" role="dialog" aria-label="Proposer ce déplacement">
          <div className="pile grandit" style={{ gap: 2, minWidth: 0 }}>
            <b>
              {choix.classe} · {jourCourt(choix.dateO)} H{choix.hO} → {jourCourt(choix.date)} H{choix.h}
            </b>
            <span className="petit">
              {nomAffiche(choix.absent)} absent·e · {(choix.avantages[0] ?? '').replace(/^Attention : (.)/, (_, l: string) => l.toUpperCase())}
            </span>
          </div>
          <button className="bouton bouton--prim" disabled={envoi} onClick={() => void confirmer()}>
            {envoi ? '…' : 'Proposer'}
          </button>
          <button className="rond rond--petit" aria-label="Ne pas proposer" onClick={() => setChoix(null)}>
            <Icon nom="fermer" taille={16} />
          </button>
        </div>
      )}
      {fait && !choix && (
        <div className="barre-choix barre-choix--fait" role="status">
          <Icon nom="coche" taille={18} epaisseur={2.4} />
          <span className="grandit">Proposé. L’éducateur va valider.</span>
          <button className="bouton bouton--sec" onClick={() => void annuler(fait)}>
            Annuler
          </button>
        </div>
      )}

      <Feuille ouverte={!!passee} onFermer={() => setPassee(null)} titre="Heure passée">
        {passee && (() => {
          const part = ds.deplacements.find((d) => d.prof === moi && d.statut !== 'Refusé' && d.dateOrigine === passee.date && d.hOrigine === passee.h);
          const mesClassesSet = new Set(mesClasses);
          const etudes = coursSansProf(ds, passee.date, passee.h).filter((c) => c.classes.some((cl) => mesClassesSet.has(cl)));
          return (
            <>
              <span className="surtitre">
                {JOURS[jourSemaineIso(passee.date)]} · H{passee.h} · {periode(passee.h).debut} – {periode(passee.h).fin}
              </span>
              {part ? (
                <>
                  <h2 className="titre-l">Ton cours est parti</h2>
                  <p className="texte">
                    Ta {part.classe} de cette heure a été donnée {JOURS[jourSemaineIso(part.date)].toLowerCase()} {deIso(part.date).getDate()} en H{part.hVide}, à la place du cours de {nomAffiche(part.absent)} ({part.statut.toLowerCase()}).
                  </p>
                </>
              ) : (
                <>
                  <h2 className="titre-l">{etudes.length ? 'Une occasion passée' : 'Heure libre passée'}</h2>
                  {etudes.length ? (
                    <>
                      <p className="texte">Pendant ton heure libre, {etudes.length > 1 ? 'ces classes que tu as étaient' : 'une classe que tu as était'} sans prof :</p>
                      {etudes.map((e) => (
                        <span key={e.id} className="avantage">
                          <Icon nom="livre" taille={16} /> {e.classe} · {e.matiere || 'cours'} (étude)
                        </span>
                      ))}
                      <p className="petit">La prochaine fois, une flèche te propose d’avancer un cours ou une remédiation dès que l’absence est encodée.</p>
                    </>
                  ) : (
                    <p className="texte">Rien de particulier à cette heure.</p>
                  )}
                </>
              )}
              <button className="bouton bouton--sec" onClick={() => setPassee(null)}>
                Fermer
              </button>
            </>
          );
        })()}
      </Feuille>

      <Feuille ouverte={!!detail} onFermer={() => setDetail(null)} titre="Détail du cours">
        {detail && (
          <>
            <span className="surtitre">
              {JOURS[jourSemaineIso(detail.date)]} · H{detail.h} · {periode(detail.h).debut} – {periode(detail.h).fin}
            </span>
            <h2 className="titre-l">
              {detail.classe} · {detail.local}
            </h2>
            <p className="texte">{detail.matiere}{detail.deplace ? ` · déplacé depuis ${JOURS[jourSemaineIso(detail.deplace.date)]} H${detail.deplace.h} (${detail.deplace.statut.toLowerCase()})` : ''}</p>
            {(() => {
              // Une proposition liée à ce cours (il part, ou il arrive ici) : qui est absent, et l'annuler.
              const d = ds.deplacements.find(
                (x) =>
                  x.prof === moi &&
                  x.statut !== 'Refusé' &&
                  ((detail.deplace && x.date === detail.date && x.hVide === detail.h && x.dateOrigine === detail.deplace.date && x.hOrigine === detail.deplace.h) ||
                    (!detail.deplace && x.dateOrigine === detail.date && x.hOrigine === detail.h)),
              );
              if (!d) return null;
              return (
                <div className="carte carte--grise pile pile--8">
                  <span className="texte">
                    {d.dateOrigine === detail.date && d.hOrigine === detail.h ? `Proposé vers ${JOURS[jourSemaineIso(d.date)]} H${d.hVide}` : `Avancé ici depuis ${JOURS[jourSemaineIso(d.dateOrigine)]} H${d.hOrigine}`} · {nomAffiche(d.absent)} absent·e ·{' '}
                    <b>{d.statut === 'Validé' ? 'validé' : 'en attente'}</b>
                  </span>
                  {d.statut === 'En attente' ? (
                    <button className="bouton bouton--sec" onClick={() => void annuler(d)}>
                      Annuler ma proposition
                    </button>
                  ) : (
                    <span className="petit">Déjà validé : pour l’annuler, demande à l’éducateur.</span>
                  )}
                </div>
              );
            })()}
            {detail.date > aujourdhui || (detail.date === aujourdhui && detail.h > heureFinie) ? (
              <button className="bouton bouton--prim" onClick={() => { setDetail(null); aller('locaux', { date: detail.date, h: detail.h }); }}>
                <Icon nom="porte" /> Changer de local
              </button>
            ) : (
              <p className="petit">Cours passé.</p>
            )}
          </>
        )}
      </Feuille>
    </section>
  );
}

function CaseHoraire({ c, cible, origine, mobile, onClick, cliquable, onSurvol }: { c: Case; cible: boolean; origine: boolean; mobile: boolean; onClick: () => void; cliquable: boolean; onSurvol: (e: EvPointeur, dedans: boolean) => void }) {
  const extra = `${cible ? ' case--cible' : ''}${origine ? ' case--origine' : ''}${mobile ? ' case--mobile' : ''}`;
  const commun = {
    'data-cle': c.cle,
    onPointerEnter: (e: EvPointeur) => onSurvol(e, true),
    onPointerLeave: (e: EvPointeur) => onSurvol(e, false),
  } as Record<string, unknown>;
  switch (c.type) {
    case 'vide':
      return <div className="case" {...commun} />;
    case 'possible':
    case 'etoile':
      return (
        <button className={`case case--possible${c.type === 'etoile' ? ' case--etoile' : ''}${extra}`} onClick={onClick} aria-label={`${c.nb} déplacement(s) possible(s)`} {...commun}>
          <Icon nom={c.type === 'etoile' ? 'etincelle' : 'echange'} taille={14} epaisseur={2.2} />
          {c.nb}
        </button>
      );
    case 'perdue':
      return cliquable ? (
        <button className={`case case--perdue${extra}`} {...commun} onClick={onClick} aria-label="Heure passée : voir ce qui s’est passé">
          {c.haut ?? (
            <>
              <Icon nom="horloge" taille={13} /> {c.nb}
            </>
          )}
        </button>
      ) : (
        <div className={`case case--perdue${extra}`} {...commun} title="Heure passée">
          {c.haut ?? (
            <>
              <Icon nom="horloge" taille={13} /> {c.nb}
            </>
          )}
        </div>
      );
    case 'stage':
      // Classe en stage : l'heure est libre, on le rappelle sans attirer l'œil.
      return (
        <div className={`case case--stage${extra}`} {...commun} title={`${c.haut} en stage : heure libre`} aria-label={`${c.haut} en stage`}>
          <span>stage</span>
        </div>
      );
    case 'libre-maint':
      return (
        <button className={`case case--libre-maint${extra}`} onClick={onClick} {...commun}>
          <b>{c.haut}</b>
          <span>{c.bas}</span>
        </button>
      );
    default: {
      const classe =
        c.type === 'cours' ? 'case--cours' : c.type === 'passe' ? 'case--passe' : c.type === 'deplace' ? 'case--deplace' : c.type === 'sansprof' ? 'case--possible' : 'case--attente';
      // La couleur de la matière, comme sur l'horaire de l'école.
      const mat = c.type !== 'sansprof' ? couleurMatiere(c.cours?.matiere) : undefined;
      const style = { ...(c.type === 'sansprof' ? { flexDirection: 'column' } : {}), ...(mat ? { '--mat': mat } : {}) } as CSSProperties;
      return (
        <button className={`case ${classe}${mat ? ' case--mat' : ''}${extra}`} onClick={onClick} aria-label={`${c.cours?.matiere ?? ''} ${c.haut ?? ''} ${c.bas ?? ''}`} {...commun} style={style}>
          <b>{c.haut}</b>
          <span>{c.bas}</span>
        </button>
      );
    }
  }
}

/** Le cours choisi glisse vers l'heure libérée (un peu plus d'une seconde, pour qu'on le suive des yeux). */
function Envol({ texte, x0, y0, x1, y1, w, h }: { texte: string; x0: number; y0: number; x1: number; y1: number; w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(1)` },
        { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 18}px) scale(1.08)`, offset: 0.5 },
        { transform: `translate(${x1}px, ${y1}px) scale(1)` },
      ],
      { duration: 1100, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' },
    );
  }, [x0, y0, x1, y1]);
  return (
    <div ref={ref} className="envol" style={{ width: w, height: h, transform: `translate(${x0}px, ${y0}px)` }} aria-hidden="true">
      {texte}
    </div>
  );
}

