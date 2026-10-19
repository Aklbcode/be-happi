// La ligne de pouls : la journée de 8h25 à 16h25. Chaque heure de cours bat ; un pic jaune = des
// classes sans prof. On la fait glisser (doigt, souris, flèches du clavier) et toute l'école suit.
// Le bouton lecture fait défiler la journée en accéléré.

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { PERIODES } from '../lib/calendar';
import type { PointPouls } from './etat';

const DEBUT = 505;
const FIN = 985;

interface Props {
  minutes: number;
  onMinutes: (m: number) => void;
  pouls: PointPouls[];
  /** Heures où la personne a cours (petits repères blancs) et heures à saisir (losanges jaunes). */
  mesHeures: number[];
  occasions: number[];
  /** La minute réelle, si on regarde aujourd'hui sans être en direct (repère bleu). */
  maintenant: number | null;
  joue: boolean;
  onJoue: (j: boolean) => void;
}

export function Ligne({ minutes, onMinutes, pouls, mesHeures, occasions, maintenant, joue, onJoue }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(800);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth));
    ro.observe(el);
    setLargeur(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const marge = 14;
  const x = (m: number) => marge + ((m - DEBUT) / (FIN - DEBUT)) * (largeur - 2 * marge);
  const versMinutes = (px: number) => Math.round(DEBUT + ((px - marge) / (largeur - 2 * marge)) * (FIN - DEBUT));
  const base = 40;
  const max = Math.max(1, ...pouls.map((p) => p.etudes));

  // Le tracé : plat entre les heures, un battement au milieu de chaque heure. Seuls les battements
  // des heures avec des classes sans prof sont en jaune ; le reste de la ligne reste à la craie.
  let plat = '';
  const pics: { d: string; alerte: boolean }[] = [];
  let curseur = x(DEBUT);
  for (const p of PERIODES) {
    const v = pouls.find((q) => q.h === p.h)?.etudes ?? 0;
    const a = x(p.dm);
    const b = x(p.fm);
    const w = b - a;
    const amp = v > 0 ? 10 + (Math.min(v, max) / max) * 20 : 3;
    plat += `M${curseur.toFixed(1)} ${base}L${(a + w * 0.38).toFixed(1)} ${base}M${(a + w * 0.62).toFixed(1)} ${base}L${b.toFixed(1)} ${base}`;
    pics.push({
      d:
        `M${(a + w * 0.38).toFixed(1)} ${base}L${(a + w * 0.44).toFixed(1)} ${base + 2.5}` +
        `L${(a + w * 0.5).toFixed(1)} ${base - amp}L${(a + w * 0.56).toFixed(1)} ${base + amp * 0.35}L${(a + w * 0.62).toFixed(1)} ${base}`,
      alerte: v > 0,
    });
    curseur = b;
  }
  plat += `M${curseur.toFixed(1)} ${base}L${x(FIN).toFixed(1)} ${base}`;

  const glisse = useRef(false);
  function point(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    onMinutes(Math.min(FIN, Math.max(DEBUT, versMinutes(e.clientX - r.left))));
  }

  function clavier(e: KeyboardEvent) {
    const actuelle = PERIODES.find((p) => minutes < p.fm) ?? PERIODES[8];
    if (e.key === 'ArrowRight') {
      const suivante = PERIODES.find((p) => p.dm > minutes);
      onMinutes(suivante ? suivante.dm : FIN);
    } else if (e.key === 'ArrowLeft') {
      const precedente = [...PERIODES].reverse().find((p) => p.dm < minutes && p.h !== actuelle.h) ?? PERIODES[0];
      onMinutes(minutes > actuelle.dm ? actuelle.dm : precedente.dm);
    } else if (e.key === 'Home') onMinutes(DEBUT);
    else if (e.key === 'End') onMinutes(FIN);
    else return;
    e.preventDefault();
  }

  const hh = Math.floor(minutes / 60);
  const mm = String(Math.round(minutes) % 60).padStart(2, '0');
  const xc = x(minutes);

  return (
    <footer className="ligne">
      <button className={`lecture${joue ? ' lecture--joue' : ''}`} onClick={() => onJoue(!joue)} aria-label={joue ? 'Arrêter le défilement' : 'Voir la journée défiler'}>
        {joue ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1.5" />
            <rect x="14" y="5" width="4" height="14" rx="1.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        )}
      </button>
      <div className="ligne-piste" ref={ref}>
        <svg
          className="ligne-svg"
          width={largeur}
          height={74}
          role="slider"
          tabIndex={0}
          aria-label="Moment de la journée"
          aria-valuemin={DEBUT}
          aria-valuemax={FIN}
          aria-valuenow={Math.round(minutes)}
          aria-valuetext={`${hh} h ${mm}`}
          onKeyDown={clavier}
          onPointerDown={(e) => {
            glisse.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            point(e);
          }}
          onPointerMove={(e) => glisse.current && point(e)}
          onPointerUp={() => (glisse.current = false)}
          onPointerCancel={() => (glisse.current = false)}
        >
          {PERIODES.map((p) => (
            <g key={p.h}>
              <rect className={`ligne-heure${p.h === 5 ? ' ligne-heure--midi' : ''}`} x={x(p.dm)} y={8} width={Math.max(0, x(p.fm) - x(p.dm) - 1)} height={50} rx={6} />
              <text className="ligne-h" x={(x(p.dm) + x(p.fm)) / 2} y={70} textAnchor="middle">
                H{p.h}
              </text>
              {mesHeures.includes(p.h) && <rect className="ligne-moi" x={(x(p.dm) + x(p.fm)) / 2 - 9} y={52} width={18} height={3} rx={1.5} />}
              {occasions.includes(p.h) && <path className="ligne-occasion" d={`M${(x(p.dm) + x(p.fm)) / 2} 13l4 4-4 4-4-4z`} />}
            </g>
          ))}
          <path d={plat} className="pouls" />
          {pics.map((m, i) => (
            <path key={i} d={m.d} className={m.alerte ? 'pouls pouls--alerte' : 'pouls'} />
          ))}
          {maintenant !== null && maintenant >= DEBUT && maintenant <= FIN && (
            <g className="ligne-maintenant" transform={`translate(${x(maintenant)} ${base})`}>
              <circle r={4.5} />
            </g>
          )}
          <g className="curseur" transform={`translate(${xc.toFixed(1)} 0)`}>
            <line y1={4} y2={60} />
            <circle cy={base} r={7.5} />
          </g>
        </svg>
      </div>
    </footer>
  );
}
