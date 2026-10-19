// Le plan de l'école : les locaux là où ils sont (PR au nord, BC à l'ouest, BF au milieu, BT et sa
// tour à l'est), les étages alignés. Chaque case prend la couleur de son état à l'heure regardée.
// Un trajet (le sien, celui d'un prof ou d'une classe) se dessine par-dessus, heure par heure.

import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Local } from '../data/types';
import { blocsPlan, codeCourt, nomCourt, type CasePlan, type Etape, type Lentille } from './etat';

interface Props {
  locaux: Local[];
  plan: Map<string, CasePlan>;
  lentille: Lentille;
  h: number;
  choisi: string | null;
  /** Locaux mis en avant (recherche) : les autres s'éteignent. */
  enAvant: Set<string> | null;
  trajet: { etapes: Etape[]; libelle: string } | null;
  onChoisir: (code: string) => void;
}

const ETIQUETTE_ETAGE: Record<number, string> = { 2: '2e', 1: '1er', 0: 'Rez' };

/** Ce qui s'écrit sous le numéro, selon la lentille. */
function texte(c: CasePlan | undefined, lentille: Lentille): string {
  if (!c) return '';
  if (c.etat === 'etude') return lentille === 'profs' ? 'étude' : (c.classe ?? '').split(',')[0];
  if (c.etat === 'occupe' || c.etat === 'moi' || c.etat === 'changement') {
    if (lentille === 'profs') return c.prof ? nomCourt(c.prof).slice(0, 4) : '';
    if (lentille === 'classes') return (c.classe ?? '').split(',')[0].trim() + ((c.classe ?? '').includes(',') ? '+' : '');
  }
  return '';
}

export const Plan = memo(function Plan({ locaux, plan, lentille, h, choisi, enAvant, trajet, onChoisir }: Props) {
  const blocs = useMemo(() => blocsPlan(locaux), [locaux]);
  const pr = blocs.find((b) => b.code === 'PR');
  const autres = blocs.find((b) => b.code === 'Autres');
  const corps = blocs.filter((b) => b.code === 'C' || b.code === 'F' || b.code === 'T');
  const colonnes = corps.map((b) => Math.max(...b.etages.map((e) => e.locaux.length)));
  const etages = [2, 1, 0];
  const lieux = useMemo(() => new Set(trajet?.etapes.map((e) => e.local)), [trajet]);

  const tuile = (l: Local) => {
    const c = plan.get(l.code);
    const etat = c?.etat ?? 'libre';
    const eteinte = (enAvant && !enAvant.has(l.code)) || (trajet && trajet.etapes.length > 0 && !lieux.has(l.code));
    const t = texte(c, lentille);
    return (
      <button
        key={l.code}
        type="button"
        data-code={l.code}
        className={`tuile tuile--${etat}${eteinte ? ' tuile--eteinte' : ''}${choisi === l.code ? ' tuile--choisie' : ''}`}
        title={`${l.code} : ${c?.detail ?? ''}`}
        aria-label={`${l.code}, ${c?.detail ?? ''}`}
        aria-pressed={choisi === l.code}
        onClick={() => onChoisir(l.code)}
      >
        <span className={`tuile-code${codeCourt(l.code).length > 3 ? ' tuile-code--long' : ''}`}>{codeCourt(l.code)}</span>
        {t && <span className="tuile-texte">{t}</span>}
      </button>
    );
  };

  // Sur un écran étroit (téléphone), les bâtiments s'empilent au lieu d'être côte à côte.
  const ref = useRef<HTMLDivElement>(null);
  const [etroit, setEtroit] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setEtroit(el.clientWidth < 640));
    ro.observe(el);
    setEtroit(el.clientWidth < 640);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`plan${etroit ? ' plan--etroit' : ''}`} ref={ref} aria-label={`Plan de l’école en H${h}`}>
      <div className="plan-interieur">
        {pr && (
          <div className="plan-pr">
            <span className="sigle">PR</span>
            <div className="rangee-tuiles" style={{ gridTemplateColumns: etroit ? 'repeat(10, minmax(0, 1fr))' : `repeat(${pr.etages[0].locaux.length}, minmax(34px, 58px))` }}>
              {pr.etages[0].locaux.map(tuile)}
            </div>
          </div>
        )}

        {etroit ? (
          corps.map((b) => (
            <div key={b.code} className="plan-bloc">
              <span className="sigle">
                {b.sigle}
                {b.code === 'T' && <i className="tour" aria-hidden="true" />}
              </span>
              <div className="plan-bloc-etages">
                {b.etages.map((e) => (
                  <div key={e.etage} className="plan-bloc-etage">
                    <span className="etage">{ETIQUETTE_ETAGE[e.etage]}</span>
                    <div className="rangee-tuiles" style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))' }}>
                      {e.locaux.map(tuile)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="plan-corps" style={{ gridTemplateColumns: `auto ${colonnes.map((n) => `minmax(0, ${n}fr)`).join(' ')}` }}>
            <span />
            {corps.map((b) => (
              <span key={b.code} className="sigle">
                {b.sigle}
                {b.code === 'T' && <i className="tour" aria-hidden="true" />}
              </span>
            ))}
            {etages.map((etage) => (
              <div key={etage} style={{ display: 'contents' }}>
                <span className="etage">{ETIQUETTE_ETAGE[etage]}</span>
                {corps.map((b, i) => {
                  const e = b.etages.find((x) => x.etage === etage);
                  return (
                    <div key={b.code} className="rangee-tuiles" style={{ gridTemplateColumns: `repeat(${colonnes[i]}, minmax(0, 1fr))` }}>
                      {e?.locaux.map(tuile)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {autres && (
          <div className="plan-autres">
            <span className="sigle sigle--long">Sport, atelier, cuisines</span>
            <div className="rangee-tuiles rangee-tuiles--larges">{autres.etages[0].locaux.map(tuile)}</div>
          </div>
        )}

        {trajet && trajet.etapes.length > 0 && <Trajet etapes={trajet.etapes} h={h} libelle={trajet.libelle} cle={`${etroit}`} />}
      </div>
    </div>
  );
});

interface Arret {
  x: number;
  y: number;
  heures: number[];
  local: string;
}

/** Le trajet de la journée : une ligne qui relie les locaux, heure par heure. */
function Trajet({ etapes, h, libelle, cle }: { etapes: Etape[]; h: number; libelle: string; cle: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [arrets, setArrets] = useState<Arret[]>([]);

  const mesurer = useCallback(() => {
    const svg = ref.current;
    const conteneur = svg?.parentElement;
    if (!svg || !conteneur) return;
    const base = conteneur.getBoundingClientRect();
    const sortie: Arret[] = [];
    for (const e of etapes) {
      const el = conteneur.querySelector<HTMLElement>(`[data-code="${CSS.escape(e.local)}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dernier = sortie[sortie.length - 1];
      // Deux heures de suite dans le même local : un seul arrêt.
      if (dernier && dernier.local === e.local) dernier.heures.push(e.h);
      else sortie.push({ x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2, heures: [e.h], local: e.local });
    }
    setArrets(sortie);
  }, [etapes, cle]);

  useLayoutEffect(() => {
    mesurer();
    const conteneur = ref.current?.parentElement;
    if (!conteneur) return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(conteneur);
    return () => ro.disconnect();
  }, [mesurer]);

  const chemin = arrets
    .map((a, i) => {
      if (!i) return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}`;
      const p = arrets[i - 1];
      const mx = (p.x + a.x) / 2;
      const my = (p.y + a.y) / 2 - Math.min(40, Math.abs(a.x - p.x) * 0.18 + 8);
      return `Q${mx.toFixed(1)} ${my.toFixed(1)} ${a.x.toFixed(1)} ${a.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg ref={ref} className="trajet" aria-label={`Trajet : ${libelle}`} role="img">
      <path d={chemin} className="trajet-fond" />
      <path d={chemin} className="trajet-ligne" />
      {arrets.map((a) => {
        const actuel = a.heures.includes(h);
        const passe = Math.max(...a.heures) < h;
        const etiquette = a.heures.length > 1 ? `${a.heures[0]}–${a.heures[a.heures.length - 1]}` : `${a.heures[0]}`;
        return (
          <g key={`${a.local}-${a.heures[0]}`} transform={`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})`} className={`arret${actuel ? ' arret--actuel' : ''}${passe ? ' arret--passe' : ''}`}>
            <rect x={-(12 + etiquette.length * 3.8)} y={-12} width={24 + etiquette.length * 7.6} height={24} rx={12} />
            <text y={4.5} textAnchor="middle">
              H{etiquette}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
