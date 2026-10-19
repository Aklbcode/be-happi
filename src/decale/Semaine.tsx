// La feuille de la semaine : ton horaire sur papier Seyès, les heures libérées de tes classes en
// rouge, les déplacements du plan en flèches bleues. « Après » : les cours glissent dans les heures
// libérées et tes journées se raccourcissent ; le temps gagné est hachuré en vert.

import { useLayoutEffect, useRef, useState } from 'react';
import type { Deplacement } from '../data/types';
import type { CoursJour } from '../logic/horaire';
import { JOURS_COURTS, PERIODES, conge, deIso, dureeTxt, jourSemaineIso } from '../lib/calendar';
import { effetJour, journee, heuresApres, type HeureLiberee, type Occasion } from './moteur';

export type Vue = 'avant' | 'apres';

interface Props {
  jours: string[];
  aujourdhui: string;
  heurePassee: number;
  cours: Map<string, CoursJour[]>;
  /** Ton horaire habituel, sans aucun déplacement : la référence du temps gagné. */
  origine: Map<string, number[]>;
  /** Tes déplacements déjà demandés ou validés qui touchent la semaine. */
  demandes: Deplacement[];
  trous: HeureLiberee[];
  plan: Occasion[];
  vue: Vue;
  onTrou: (date: string, h: number) => void;
  onCours: (date: string, h: number) => void;
}

function useTaille<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => setTaille({ l: el.clientWidth, h: el.clientHeight });
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, taille] as const;
}

const pct = (col: number) => `${col * 20}%`;
/** « 55 min », « 1h50 » : écrit comme au stylo, sans se couper. */
const court = (min: number) => (min < 60 ? `${min}\u202fmin` : dureeTxt(min).replace(/ h /, 'h').replace(/ h$/, 'h'));

/** Les zones de temps gagné d'une journée : avant le nouveau premier cours, après le nouveau dernier. */
function zonesGagnees(avant: number[], apres: number[], libre: boolean, nouveau: boolean, matin: number, soir: number): { de: number; a: number; texte: string }[] {
  if (!avant.length || nouveau) return [];
  if (libre) return [{ de: avant[0], a: avant[avant.length - 1], texte: 'libre !' }];
  const z: { de: number; a: number; texte: string }[] = [];
  if (matin > 0) z.push({ de: avant[0], a: apres[0] - 1, texte: court(matin) });
  if (soir > 0) z.push({ de: apres[apres.length - 1] + 1, a: avant[avant.length - 1], texte: court(soir) });
  return z;
}
const haut = (h: number) => `calc(${h - 1} * var(--rang))`;
const hauteur = (n: number) => `calc(${n} * var(--rang))`;

export function Semaine({ jours, aujourdhui, heurePassee, cours, origine, demandes, trous, plan, vue, onTrou, onCours }: Props) {
  const [ref, taille] = useTaille<HTMLDivElement>();
  const apres = vue === 'apres';
  const colDe = (date: string) => jours.indexOf(date);
  const cw = taille.l / 5;
  const rh = taille.h / 9;

  // Ce qui bouge dans cette semaine.
  const partants = plan.filter((o) => colDe(o.dateO) >= 0);
  const arrivants = plan.filter((o) => colDe(o.date) >= 0 && colDe(o.dateO) < 0);
  const heuresJour = (d: string) => (cours.get(d) ?? []).map((c) => c.h);
  /** Les heures affichées : maintenant (avec tes demandes), ou après le plan. */
  const finales = (d: string) => (apres ? heuresApres(heuresJour(d), d, plan) : heuresJour(d));
  /** Le temps gagné par rapport à ton horaire habituel (tes demandes, plus le plan en vue « Après »). */
  const zones = (d: string) => {
    const o = journee(origine.get(d) ?? []);
    const f = journee(finales(d));
    const e = effetJour(d, o, f);
    return zonesGagnees(o.heures, f.heures, e.libre, e.nouveau, e.matin, e.soir);
  };
  const couvert = (date: string, h: number) => zones(date).some((z) => h >= z.de && h <= z.a);

  return (
    <div className={`feuille feuille--${vue}`}>
      <div className="feuille-tete" aria-hidden="true">
        <span />
        {jours.map((d) => {
          const c = conge(deIso(d));
          return (
            <span key={d} className={`jour-tete${d === aujourdhui ? ' jour-tete--aujourdhui' : ''}${c ? ' jour-tete--conge' : ''}`}>
              <b>{JOURS_COURTS[jourSemaineIso(d)]}</b> {deIso(d).getDate()}
            </span>
          );
        })}
      </div>

      <div className="feuille-corps">
        <ol className="marge" aria-hidden="true">
          {PERIODES.map((p) => (
            <li key={p.h} className={p.h === 5 ? 'midi' : ''}>
              <b>H{p.h}</b>
              <span>{p.debut}</span>
            </li>
          ))}
        </ol>

        <div className="cases" ref={ref}>
          {/* Récrés : un trait plus fort après H2 et H7 ; le temps de midi teinté. */}
          <span className="recre" style={{ top: hauteur(2) }} aria-hidden="true" />
          <span className="recre" style={{ top: hauteur(7) }} aria-hidden="true" />
          <span className="bande-midi" style={{ top: haut(5), height: hauteur(1) }} aria-hidden="true" />

          {jours.map((d, col) => {
            const c = conge(deIso(d));
            if (c)
              return (
                <span key={`c-${d}`} className="conge" style={{ left: pct(col), width: '20%' }} aria-hidden="true">
                  <span>{c.nom}</span>
                </span>
              );
            const passees = d < aujourdhui ? 9 : d === aujourdhui ? heurePassee : 0;
            return passees > 0 ? <span key={`p-${d}`} className="passe" style={{ left: pct(col), width: '20%', top: 0, height: hauteur(Math.min(9, passees)) }} aria-hidden="true" /> : null;
          })}

          {/* La silhouette de chaque journée (du premier au dernier cours), avant ou après. */}
          {jours.map((d, col) => {
            const j = journee(finales(d));
            const premiere = j.heures[0];
            const derniere = j.heures[j.heures.length - 1];
            const gagne = conge(deIso(d)) ? [] : zones(d);
            return (
              <span key={`s-${d}`} aria-hidden="true">
                {premiere !== undefined && (
                  <span className="silhouette" style={{ left: pct(col), top: haut(premiere), height: hauteur(derniere - premiere + 1) }} />
                )}
                {gagne.map((g) => {
                  // Une heure libérée dans la zone : l'annotation se range dans le coin.
                  const coin = trous.some((t) => t.date === d && t.h >= g.de && t.h <= g.a);
                  return (
                    <span key={g.texte} className={`gagne${coin ? ' gagne--coin' : ''}`} style={{ left: pct(col), top: haut(g.de), height: hauteur(g.a - g.de + 1) }}>
                      <span className="main">{g.texte}</span>
                    </span>
                  );
                })}
              </span>
            );
          })}

          {/* Les heures libérées de tes classes. */}
          {trous.map((t) => {
            const col = colDe(t.date);
            if (col < 0) return null;
            const memeCase = trous.filter((x) => x.date === t.date && x.h === t.h);
            if (memeCase[0] !== t) return null;
            const dansPlan = memeCase.some((x) => x.etat === 'plan');
            const toutesPrises = memeCase.every((x) => x.etat === 'prise' || x.etat === 'toi');
            const etiquettes = [...new Set(memeCase.map((x) => x.classe))];
            return (
              <button
                key={t.cle}
                className={`trou${dansPlan ? ' trou--plan' : ''}${toutesPrises ? ' trou--prise' : ''}`}
                style={{ left: pct(col), top: haut(t.h), width: '20%', height: hauteur(1) }}
                onClick={() => onTrou(t.date, t.h)}
                aria-label={`${JOURS_COURTS[jourSemaineIso(t.date)]} H${t.h}, heure libérée : ${memeCase.map((x) => `${x.classe} (${x.etat === 'prise' ? `reprise par ${x.par}` : x.etat === 'plan' ? 'dans le plan' : x.etat === 'toi' ? 'ta demande' : 'possible'})`).join(', ')}`}
              >
                <span>
                  {etiquettes.map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </span>
              </button>
            );
          })}

          {/* Tes cours : ceux du plan glissent vers l'heure libérée quand on passe à « Après ». */}
          {jours.flatMap((d, col) =>
            (cours.get(d) ?? []).map((c) => {
              const part = partants.find((o) => o.dateO === d && o.hO === c.h);
              const versCol = part ? colDe(part.date) : -1;
              const bouge = apres && part;
              const ailleurs = bouge && versCol < 0;
              const l = bouge && !ailleurs ? pct(versCol) : pct(col);
              const t = bouge && !ailleurs ? haut(part!.h) : haut(c.h);
              const statut = c.deplace ? (c.deplace.statut === 'Validé' ? 'valide' : 'attente') : '';
              return (
                <button
                  key={`${d}-${c.h}-${c.id}`}
                  className={`bloc${part ? ' bloc--mobile' : ''}${bouge ? ' bloc--arrive' : ''}${ailleurs ? ' bloc--parti' : ''}${statut ? ` bloc--${statut}` : ''}`}
                  style={{ left: l, top: t, width: '20%', height: hauteur(1), transitionDelay: `${(partants.indexOf(part!) + 1) * 90}ms` }}
                  onClick={() => onCours(d, c.h)}
                  aria-label={`${JOURS_COURTS[jourSemaineIso(d)]} H${c.h}, ${c.classe}${c.local ? `, ${c.local}` : ''}${part ? `, dans le plan : vers ${JOURS_COURTS[jourSemaineIso(part.date)]} H${part.h}` : ''}${statut === 'attente' ? ', déplacement en attente' : statut === 'valide' ? ', déplacement validé' : ''}`}
                >
                  <span className="bloc-classe">{c.classe}</span>
                  <span className="bloc-local">{statut === 'attente' ? 'attente' : statut === 'valide' ? 'validé' : c.local}</span>
                </button>
              );
            }),
          )}

          {/* Ce qui arrive d'une autre semaine (un cours de la semaine suivante). */}
          {arrivants.map((o) => (
            <span
              key={`arr-${o.cle}`}
              className={`bloc bloc--venu${apres ? ' bloc--visible' : ''}`}
              style={{ left: pct(colDe(o.date)), top: haut(o.h), width: '20%', height: hauteur(1) }}
              aria-hidden="true"
            >
              <span className="bloc-classe">{o.classe}</span>
              <span className="bloc-local">{o.local}</span>
            </span>
          ))}

          {/* La place laissée par un cours parti au milieu de ta journée ; au bord, c'est du temps gagné. */}
          {[
            ...demandes.filter((d) => colDe(d.dateOrigine) >= 0).map((d) => ({ cle: `d-${d.id ?? d.dateOrigine + d.hOrigine}`, date: d.dateOrigine, h: d.hOrigine, classe: d.classe })),
            ...(apres ? partants.map((o) => ({ cle: `p-${o.cle}`, date: o.dateO, h: o.hO, classe: o.classe })) : []),
          ]
            .filter((f) => !couvert(f.date, f.h) && !finales(f.date).includes(f.h))
            .map((f) => (
              <span key={f.cle} className="fantome" style={{ left: pct(colDe(f.date)), top: haut(f.h), width: '20%', height: hauteur(1) }} aria-hidden="true">
                <span>{f.classe}</span>
              </span>
            ))}

          {/* Les flèches du plan, tracées au stylo bleu (Maintenant). */}
          {taille.l > 0 && (
            <svg className="fleches" width={taille.l} height={taille.h} viewBox={`0 0 ${taille.l} ${taille.h}`} aria-hidden="true">
              <defs>
                <marker id="pointe" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M1 1.5 8 5 1 8.5" fill="none" stroke="context-stroke" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>
              {plan.map((o, i) => {
                const co = colDe(o.dateO);
                const ct = colDe(o.date);
                if (co < 0 && ct < 0) return null;
                const yt = (o.h - 0.5) * rh;
                const yo = (o.hO - 0.5) * rh;
                let d: string;
                if (co >= 0 && ct >= 0 && co === ct) {
                  // Même jour : la flèche contourne la colonne par le côté le plus proche du centre.
                  const x = (co + 0.5) * cw;
                  const cote = co === 4 ? -1 : 1;
                  const xb = x + cote * cw * 0.32;
                  d = `M ${xb} ${yo} C ${xb + cote * cw * 0.55} ${yo}, ${xb + cote * cw * 0.55} ${yt}, ${xb + cote * 4} ${yt}`;
                } else if (co >= 0 && ct >= 0) {
                  const xo = (co + 0.5) * cw;
                  const xt = (ct + 0.5) * cw;
                  const sens = xt < xo ? -1 : 1;
                  const x1 = xo + sens * cw * 0.1;
                  const y1 = yo - rh * 0.34;
                  const x2 = xt - sens * cw * 0.2;
                  const y2 = yt - rh * 0.3;
                  const cy = Math.max(6, Math.min(y1, y2) - rh * 0.9);
                  d = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
                } else if (ct >= 0) {
                  // Le cours vient de la semaine suivante : la flèche entre par le bord droit.
                  const xt = (ct + 0.5) * cw + cw * 0.3;
                  d = `M ${taille.l - 2} ${yt - rh * 0.5} Q ${xt + cw * 0.5} ${yt - rh * 0.6}, ${xt} ${yt}`;
                } else {
                  // Le cours part vers la semaine précédente : la flèche sort par le haut.
                  const xo = (co + 0.5) * cw;
                  d = `M ${xo} ${yo - rh * 0.34} Q ${xo - cw * 0.4} ${Math.max(4, yo - rh * 1.2)}, ${Math.max(4, xo - cw * 0.5)} 4`;
                }
                return <path key={o.cle} className="fleche" d={d} markerEnd="url(#pointe)" style={{ animationDelay: `${i * 120}ms` }} pathLength={1} />;
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
