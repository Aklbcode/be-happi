// Écran « Horaire » : la semaine, les heures libérées et les flèches de déplacement.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { Feuille } from '../ui/Feuille';
import { Entete } from '../ui/Entete';
import { calendrierIcs, joursDeCours, telecharger, type Evenement } from '../lib/ics';
import { absentA, coursDuProf, coursSansProf, nomAffiche, type CoursJour } from '../logic/horaire';
import { opportunitesSemaine, optionsPour } from '../logic/deplacements';
import { JOURS, JOURS_COURTS, MIDI, PERIODES, conge, deIso, iso, jourSemaine, jourSemaineIso, lundiDe, periode, plusJours, plusJoursIso, situation } from '../lib/calendar';
import { aller, lien } from '../lib/route';

type Vue = 'moi' | 'classe' | 'local';
const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

interface Case {
  cle: string;
  date: string;
  h: number;
  type: 'vide' | 'cours' | 'passe' | 'possible' | 'etoile' | 'perdue' | 'deplace' | 'attente' | 'depart' | 'libre-maint' | 'sansprof';
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

const CLE_FLECHES = 'behappi-fleches';
const flechesVisibles = (): boolean => {
  try {
    return localStorage.getItem(CLE_FLECHES) !== '0';
  } catch {
    return true;
  }
};

export function Horaire() {
  const { ds, maintenant, aujourdhui, minutes, heureFinie, montrerToast } = useStore();
  // Pendant un congé, on ouvre directement la première semaine de cours (au plus 3 semaines plus loin).
  const [depart] = useState(() => {
    const b = jourSemaine(maintenant) >= 6 ? plusJours(maintenant, 8 - jourSemaine(maintenant)) : lundiDe(maintenant);
    for (let n = 0; n < 3; n++) if ([0, 1, 2, 3, 4].some((k) => !conge(plusJours(b, n * 7 + k)))) return n;
    return 0;
  });
  const [decalage, setDecalage] = useState(depart);
  const [toutesFleches, setToutesFleches] = useState(flechesVisibles);
  const [vue, setVue] = useState<Vue>('moi');
  const [classe, setClasse] = useState('');
  const [salle, setSalle] = useState('');
  const [sel, setSel] = useState<{ date: string; h: number } | null>(null);
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
  const sallesConnues = useMemo(() => (ds ? ds.locaux.map((l) => l.code) : []), [ds]);
  const salleVue = salle || 'BT004';

  const opps = useMemo(() => (ds && vue === 'moi' ? opportunitesSemaine(ds, moi, lundi, aujourdhui, finieEff) : new Map()), [ds, vue, moi, lundi, aujourdhui, finieEff]);

  const options = useMemo(() => (ds && sel ? optionsPour(ds, moi, sel.date, sel.h, aujourdhui, finieEff) : []), [ds, sel, moi, aujourdhui, finieEff]);

  // Le meilleur cours à avancer pour chaque heure libérée de la semaine : une flèche directement sur l'horaire.
  const meilleures = useMemo(() => {
    if (!ds || vue !== 'moi') return [];
    return [...opps.values()]
      .filter((o) => !o.passe)
      .map((o) => optionsPour(ds, moi, o.date, o.h, aujourdhui, finieEff)[0])
      .filter(Boolean);
  }, [ds, vue, opps, moi, aujourdhui, finieEff]);

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
          if (absentA(ds, c.prof, date, p.h)) return { cle, date, h: p.h, type: 'sansprof', haut: c.matiere.slice(0, 10) || 'Cours', bas: 'sans prof' };
          return { cle, date, h: p.h, type: passe ? 'passe' : 'cours', haut: c.matiere.slice(0, 10) || c.classe, bas: nomAffiche(c.prof).slice(0, 9) };
        }
        if (vue === 'local') {
          const jour = jourSemaineIso(date);
          const c = ds.cours.find((x) => x.jour === jour && x.h === p.h && x.local === salleVue && !absentA(ds, x.prof, date, p.h));
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
        if (date === aujourdhui && sit.enCours && p.h === sit.h) return { cle, date, h: p.h, type: 'libre-maint', haut: 'Libre', bas: 'en cours', nb: o?.nb };
        if (o && o.passe) return { cle, date, h: p.h, type: 'perdue', nb: o.nb };
        if (o) return { cle, date, h: p.h, type: o.etoile ? 'etoile' : 'possible', nb: o.nb };
        return { cle, date, h: p.h, type: 'vide' };
      }),
    );
  }, [ds, dates, vue, classeVue, salleVue, moi, opps, aujourdhui, heureFinie, sit.enCours, sit.h]);

  // Flèches : du cours de départ vers l'heure libérée.
  const dessiner = useCallback(() => {
    const g = grilleRef.current;
    if (!g || vue !== 'moi' || (!sel && !toutesFleches)) {
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
    // Une heure touchée : toutes ses options, animées. Sinon : la meilleure de chaque heure, discrète.
    const aDessiner = sel ? options.slice(0, 4) : meilleures;
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
      const fort = sel ? o.meilleur : o.meilleur && o.avantageProf;
      const couleur = o.semaineSuivante ? 'var(--sarcelle)' : fort ? 'var(--indigo)' : 'var(--indigo-moyen)';
      res.push({
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
        couleur,
        marqueur: o.semaineSuivante ? 'pointe-s1' : fort ? 'pointe-best' : 'pointe-autre',
        epais: sel ? (o.meilleur ? 3 : 2.2) : fort ? 2.4 : 1.8,
        anime: !!sel,
        label: o.semaineSuivante ? { x: (x1 + 2 * cx + x2) / 4, y: (y1 + 2 * cy + y2) / 4, texte: 'S+1' } : undefined,
      });
    });
    setFleches(res);
  }, [sel, options, vue, meilleures, toutesFleches]);

  useLayoutEffect(() => {
    dessiner();
    const g = grilleRef.current;
    if (!g) return;
    const ro = new ResizeObserver(() => dessiner());
    ro.observe(g);
    return () => ro.disconnect();
  }, [dessiner, lignes]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;

  const d1 = deIso(dates[0]);
  const d5 = deIso(dates[4]);
  const libelleSemaine = d1.getMonth() === d5.getMonth() ? `${d1.getDate()} – ${d5.getDate()} ${MOIS[d5.getMonth()]}` : `${d1.getDate()} ${MOIS[d1.getMonth()]} – ${d5.getDate()} ${MOIS[d5.getMonth()]}`;
  const colonneAuj = dates.indexOf(aujourdhui);
  const origines = new Set(options.map((o) => `${o.semaineSuivante ? plusJoursIso(o.dateO, -7) : o.dateO}|${o.hO}`));
  const aiguille = (() => {
    if (colonneAuj < 0 || sit.h < 1 || sit.h > 9) return null;
    const p = periode(sit.h);
    const top = sit.enCours ? (sit.h - 1) * 52 + ((minutes - p.dm) / (p.fm - p.dm)) * 48 : (sit.h - 1) * 52 - 2;
    return top;
  })();

  function toucher(c: Case) {
    if (vue !== 'moi') return;
    if (c.type === 'perdue') {
      setSel(null);
      setPassee(c);
      return;
    }
    if (c.cours) {
      setSel(null);
      setDetail(c.cours);
      return;
    }
    if ((c.type === 'possible' || c.type === 'etoile' || (c.type === 'libre-maint' && c.nb)) && c.nb) {
      setSel(sel && sel.date === c.date && sel.h === c.h ? null : { date: c.date, h: c.h });
    } else setSel(null);
  }

  const colStyle = (i: number) => ({ left: `calc(46px + ${i} * ((100% - 62px) / 5 + 4px))`, width: 'calc((100% - 62px) / 5)' });

  function exporterAgenda() {
    if (!ds) return;
    const evenements: Evenement[] = [];
    for (const d of joursDeCours(maintenant, 4)) {
      for (const c of coursDuProf(ds, moi, d)) {
        evenements.push({ uid: `${moi}-${d}-${c.h}`, date: d, hDebut: c.h, hFin: c.h, titre: `${c.classe}${c.matiere ? ` · ${c.matiere}` : ''}`, lieu: c.local, description: c.deplace ? 'Cours déplacé (validé)' : `H${c.h}` });
      }
    }
    telecharger('mon-horaire.ics', calendrierIcs(`Horaire · ${ds.moi.prenom} ${nomAffiche(moi)}`, evenements));
    montrerToast('Agenda téléchargé : ouvre le fichier pour l’ajouter à Outlook');
  }

  return (
    <section className="ecran ecran--large" aria-label="Horaire">
      <Entete
        titre="Horaire"
        sous="Ta semaine et les heures libérées"
        droite={
          decalage !== depart ? (
            <button className="bouton bouton--sec bouton--petit" onClick={() => { setDecalage(depart); setSel(null); }}>
              Cette semaine
            </button>
          ) : undefined
        }
      />

      <div className="seg" role="group" aria-label="Afficher l'horaire de">
        {(['moi', 'classe', 'local'] as Vue[]).map((v) => (
          <button key={v} aria-pressed={vue === v} onClick={() => { setVue(v); setSel(null); }}>
            {v === 'moi' ? 'Moi' : v === 'classe' ? 'Une classe' : 'Un local'}
          </button>
        ))}
      </div>

      {vue === 'classe' && (
        <label className="rangee">
          <span className="petit">Classe</span>
          <select className="bouton bouton--sec bouton--petit grandit" value={classeVue} onChange={(e) => setClasse(e.target.value)}>
            {mesClasses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      {vue === 'local' && (
        <label className="rangee">
          <span className="petit">Local</span>
          <select className="bouton bouton--sec bouton--petit grandit" value={salleVue} onChange={(e) => setSalle(e.target.value)}>
            {sallesConnues.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}

      <div className="rangee rangee--entre">
        <button className="rond" aria-label="Semaine précédente" onClick={() => { setDecalage(decalage - 1); setSel(null); }}>
          <Icon nom="gauche" />
        </button>
        <div className="pile" style={{ alignItems: 'center' }}>
          <span className="titre-m">{libelleSemaine}</span>
          <span className="petit">
            {vue === 'moi' ? 'Mon horaire' : vue === 'classe' ? `Horaire de la ${classeVue}` : `Occupation de ${salleVue}`}
          </span>
        </div>
        <button className="rond" aria-label="Semaine suivante" onClick={() => { setDecalage(decalage + 1); setSel(null); }}>
          <Icon nom="droite" />
        </button>
      </div>

      <div className="semaine-entete">
        <span />
        {dates.map((d, i) => (
          <div key={d} className={`jour-entete${i === colonneAuj ? ' jour-entete--auj' : ''}`}>
            <span>{JOURS_COURTS[i + 1]}</span>
            <b>{deIso(d).getDate()}</b>
          </div>
        ))}
      </div>

      <div className="grille" ref={grilleRef}>
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
                  cible={!!sel && sel.date === c.date && sel.h === c.h}
                  origine={origines.has(c.cle)}
                  onClick={() => toucher(c)}
                  cliquable={vue === 'moi'}
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

      <button className="bouton bouton--sec" onClick={exporterAgenda}>
        <Icon nom="agenda" taille={18} /> Mettre mon horaire dans mon agenda (4 semaines)
      </button>
      <div className="legende">
        {vue === 'moi' ? (
          <>
            <span><i className="carre" style={{ background: 'var(--surface)', border: '1px solid var(--trait)' }} />Cours</span>
            <span><i className="carre" style={{ background: 'var(--orange-pale-2)', border: '2px dashed var(--orange)' }} />Heure libérée</span>
            <span><i className="carre" style={{ background: 'var(--orange-pale)', border: '2px solid var(--orange)' }} />Proposé</span>
            <span><i className="carre" style={{ background: 'var(--indigo)' }} />Déplacé</span>
          </>
        ) : (
          <span>{vue === 'classe' ? 'Touche « Moi » pour revenir à ton horaire.' : 'Les réservations apparaissent en orange.'}</span>
        )}
      </div>
      {vue === 'moi' && !sel && (
        <div className="rangee rangee--entre enrouler">
          <p className="petit grandit" style={{ margin: 0 }}>
            {meilleures.length
              ? toutesFleches
                ? `${meilleures.length === 1 ? 'Une flèche montre le cours' : `${meilleures.length} flèches montrent les cours`} que tu peux avancer. Touche l’heure libérée pour voir toutes les options.`
                : 'Touche une heure libérée pour voir les cours qui peuvent y venir.'
              : 'Aucun cours à avancer cette semaine.'}
          </p>
          {meilleures.length > 0 && (
            <button
              className="lien-action"
              onClick={() => {
                const v = !toutesFleches;
                setToutesFleches(v);
                try {
                  localStorage.setItem(CLE_FLECHES, v ? '1' : '0');
                } catch {
                  /* rien */
                }
              }}
            >
              {toutesFleches ? 'Masquer les flèches' : 'Montrer les flèches'}
            </button>
          )}
        </div>
      )}

      <Feuille ouverte={!!sel && options.length > 0} onFermer={() => setSel(null)} titre="Déplacements possibles">
        {sel && (
          <>
            <span className="surtitre">
              {JOURS[jourSemaineIso(sel.date)]} · H{sel.h} · {periode(sel.h).debut}
            </span>
            <h2 className="titre-l">{options.length > 1 ? `${options.length} cours peuvent venir ici` : 'Un cours peut venir ici'}</h2>
            {options.slice(0, 4).map((o) => (
              <a key={o.cle} className="option" href={lien('deplacer', { date: o.date, h: o.h, o: o.cle })} style={{ textDecoration: 'none' }}>
                <span className="pile grandit" style={{ gap: 6 }}>
                  <span className="rangee rangee--entre">
                    <span className="titre-s">
                      {o.classe} · {o.semaineSuivante ? 'semaine prochaine, ' : ''}
                      {JOURS[jourSemaineIso(o.dateO)]} H{o.hO}
                    </span>
                    {o.meilleur && <span className="puce puce--indigo">Le plus avantageux</span>}
                    {o.semaineSuivante && !o.meilleur && <span className="puce" style={{ background: 'var(--sarcelle)', color: '#fff' }}>S+1</span>}
                  </span>
                  <span className="petit">
                    Local {o.local}
                    {o.localChange ? ` (${o.localPrevu} pris)` : ''} · prof, classes et local vérifiés
                  </span>
                  {o.avantages.slice(0, 2).map((a) => (
                    <span key={a} className="avantage">
                      <Icon nom={a.startsWith('Attention') ? 'attention' : 'coche'} taille={16} epaisseur={2.2} />
                      {a}
                    </span>
                  ))}
                </span>
                <Icon nom="droite" />
              </a>
            ))}
          </>
        )}
      </Feuille>

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

function CaseHoraire({ c, cible, origine, onClick, cliquable }: { c: Case; cible: boolean; origine: boolean; onClick: () => void; cliquable: boolean }) {
  const extra = `${cible ? ' case--cible' : ''}${origine ? ' case--origine' : ''}`;
  const commun = { 'data-cle': c.cle } as Record<string, string>;
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
      return (
        <button className={`case ${classe}${extra}`} onClick={onClick} aria-label={`${c.haut ?? ''} ${c.bas ?? ''}`} {...commun} style={c.type === 'sansprof' ? { flexDirection: 'column' } : undefined}>
          <b>{c.haut}</b>
          <span>{c.bas}</span>
        </button>
      );
    }
  }
}
