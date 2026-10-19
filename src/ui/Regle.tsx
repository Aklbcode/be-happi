// La règle des heures : la journée H1–H9 en un coup d'œil, avec les récréations et le temps de midi.
// Le même motif sert partout (pilotage, Où est ?, vue élève, réponses de Happi).

import { MIDI, RECRES, periode } from '../lib/calendar';

export type TonRegle = 'indigo' | 'pale' | 'orange' | 'rose' | 'gris' | 'vide';

export interface CaseRegle {
  h: number;
  ton: TonRegle;
  /** Petit nombre dans la case (classes à l'étude…). */
  compte?: number;
  titre?: string;
}

export function Regle({
  heures,
  actuel,
  choisie,
  onChoisir,
  etiquette = 'La journée heure par heure',
}: {
  heures: CaseRegle[];
  actuel?: number;
  choisie?: number;
  onChoisir?: (h: number) => void;
  etiquette?: string;
}) {
  return (
    <div className="regle" role={onChoisir ? 'group' : 'img'} aria-label={etiquette}>
      {heures.map((c) => {
        const contenu = (
          <>
            <span className={`regle-barre regle-barre--${c.ton}${c.h === MIDI ? ' regle-barre--midi' : ''}`}>{c.compte ? <b>{c.compte}</b> : null}</span>
            <span className="regle-h">H{c.h}</span>
          </>
        );
        const classes = `regle-case${c.h === actuel ? ' regle-case--actuel' : ''}${c.h === choisie ? ' regle-case--choisie' : ''}${RECRES.includes(c.h) ? ' regle-case--recre' : ''}`;
        const titre = c.titre ?? `H${c.h} · ${periode(c.h).debut}`;
        return onChoisir ? (
          <button key={c.h} className={classes} onClick={() => onChoisir(c.h)} aria-pressed={c.h === choisie} aria-label={titre} title={titre}>
            {contenu}
          </button>
        ) : (
          <span key={c.h} className={classes} title={titre}>
            {contenu}
          </span>
        );
      })}
    </div>
  );
}
