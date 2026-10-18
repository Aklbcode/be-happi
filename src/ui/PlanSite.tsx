// Plan schématique de l'IPES Tubize, orienté comme une carte (nord en haut) :
// BC côté rue Papleux, BF au milieu (le grand bâtiment en longueur, à côté du BT),
// BT côté chaussée de Mons avec sa tour ronde, PR (préfabriqués) le long des terrains de sport.
// Chaque bâtiment est un bouton qui affiche le nombre de locaux libres à l'heure choisie.

import type { KeyboardEvent } from 'react';
import { BATIMENTS, type CodeBatiment } from '../data/batiments';

interface Forme {
  code: CodeBatiment;
  points: string;
  /** Zone de toucher plus large que le dessin (bâtiments fins). */
  zone?: string;
  etiquette: [number, number];
  pastille: [number, number];
}

const FORMES: Forme[] = [
  { code: 'PR', points: '57,33 61,54 190,26 186,5', zone: '50,24 58,64 197,36 189,-4', etiquette: [123, 31], pastille: [208, 14] },
  { code: 'C', points: '55,76 83,69 110,180 82,187', etiquette: [83, 120], pastille: [96, 150] },
  { code: 'F', points: '138,53 262,141 232,183 108,95', etiquette: [185, 112], pastille: [185, 138] },
  { code: 'T', points: '203,212 217,230 309,153 295,135', etiquette: [194, 226], pastille: [262, 183] },
];

const TOUR = { cx: 194, cy: 226, r: 19 };

export function PlanSite({
  libres,
  choisi,
  heure,
  onChoisir,
}: {
  libres: Record<string, number>;
  choisi: CodeBatiment;
  heure: number;
  onChoisir: (b: CodeBatiment) => void;
}) {
  const touche = (b: CodeBatiment) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChoisir(b);
    }
  };

  return (
    <svg className="plan" viewBox="0 0 360 250" role="group" aria-label="Plan de l'école : touche un bâtiment">
      {/* Rues */}
      <path id="rue-papleux" className="plan-rue" d="M24 -6 L60 256" />
      <path className="plan-rue plan-rue--large" d="M190 262 L374 108" />
      {/* Nom de la chaussée posé à côté, hors de l'école, pour ne rien cacher. */}
      <path id="chaussee-mons" d="M214 270 L384 128" fill="none" />
      <text className="plan-nom-rue">
        <textPath href="#rue-papleux" startOffset="62%" textAnchor="middle">Rue Papleux</textPath>
      </text>
      <text className="plan-nom-rue">
        <textPath href="#chaussee-mons" startOffset="52%" textAnchor="middle">Chaussée de Mons</textPath>
      </text>

      {/* Pelouses et terrains de sport (au nord) */}
      <path className="plan-herbe" d="M108 72 Q140 52 196 44 Q228 58 240 88 Q200 104 156 110 Q118 100 108 72 Z" />
      <g transform="rotate(-12 262 38)">
        <rect className="plan-herbe plan-terrain" x="222" y="14" width="84" height="46" rx="6" />
        <path className="plan-ligne" d="M264 14 V60 M222 37 H306" />
        <circle className="plan-ligne" cx="264" cy="37" r="8" fill="none" />
      </g>
      <text className="plan-legende" x="270" y="78" textAnchor="middle">Terrains</text>

      {/* Bâtiments */}
      {FORMES.map((f) => {
        const b = BATIMENTS.find((x) => x.code === f.code)!;
        const n = libres[f.code] ?? 0;
        const actif = choisi === f.code;
        const etat = actif ? ' plan-bat--choisi' : n === 0 ? ' plan-bat--plein' : '';
        return (
          <g
            key={f.code}
            className="plan-groupe"
            role="button"
            tabIndex={0}
            aria-pressed={actif}
            aria-label={`${b.sigle}, ${b.nom} : ${n} local${n > 1 ? 'aux' : ''} libre${n > 1 ? 's' : ''} en H${heure}`}
            onClick={() => onChoisir(f.code)}
            onKeyDown={touche(f.code)}
          >
            {f.zone && <polygon className="plan-zone" points={f.zone} />}
            <polygon className={`plan-bat${etat}`} points={f.points} />
            {f.code === 'T' && (
              <>
                {/* La tour, emblème de l'école : toujours foncée, indigo quand le BT est choisi. */}
                <circle className={`plan-tour${actif ? ' plan-tour--choisi' : ''}`} cx={TOUR.cx} cy={TOUR.cy} r={TOUR.r} />
                <circle className="plan-fenetres" cx={TOUR.cx} cy={TOUR.cy} r={TOUR.r - 4.5} />
              </>
            )}
            <text
              className={`plan-sigle${actif || f.code === 'T' ? ' plan-sigle--choisi' : ''}${f.code === 'PR' ? ' plan-sigle--petit' : ''}`}
              x={f.etiquette[0]}
              y={f.etiquette[1]}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {b.sigle}
            </text>
            <g transform={`translate(${f.pastille[0]} ${f.pastille[1]})`}>
              <rect className={`plan-pastille${n === 0 ? ' plan-pastille--zero' : ''}`} x={-14} y={-10} width={28} height={20} rx={10} />
              <text className={`plan-pastille-txt${n === 0 ? ' plan-pastille-txt--zero' : ''}`} x={0} y={0.5} textAnchor="middle" dominantBaseline="central">
                {n}
              </text>
            </g>
          </g>
        );
      })}

      {/* Nord */}
      <g transform="translate(338 226)" aria-hidden="true">
        <path className="plan-nord" d="M0 -14 L6 2 L0 -2 L-6 2 Z" />
        <text className="plan-legende" x={0} y={16} textAnchor="middle">N</text>
      </g>
    </svg>
  );
}
