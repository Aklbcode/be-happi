// Choisir un jour de cours (aujourd'hui et les suivants) ou une heure (H1–H9).

import { JOURS_COURTS, PERIODES, deIso, estJourDeCours, iso, jourSemaine, plusJours } from '../lib/calendar';

/** Les prochains jours de cours à partir d'une date (congés exclus). */
export function prochainsJours(depuis: Date, n: number): string[] {
  const sortie: string[] = [];
  for (let d = depuis, k = 0; sortie.length < n && k < 60; k++, d = plusJours(d, 1)) if (estJourDeCours(d)) sortie.push(iso(d));
  return sortie;
}

export function ChoixJour({ jours, date, aujourdhui, onChoisir }: { jours: string[]; date: string; aujourdhui: string; onChoisir: (d: string) => void }) {
  return (
    <div className="defile-x" role="group" aria-label="Choisir le jour">
      {jours.map((j) => {
        const d = deIso(j);
        return (
          <button key={j} className="choix choix--jour" aria-pressed={j === date} onClick={() => onChoisir(j)}>
            <span>{j === aujourdhui ? "Aujourd'hui" : JOURS_COURTS[jourSemaine(d)]}</span>
            <small>{d.getDate()}/{d.getMonth() + 1}</small>
          </button>
        );
      })}
    </div>
  );
}

export function ChoixHeure({ h, onChoisir, sous }: { h: number; onChoisir: (h: number) => void; sous?: (h: number) => string }) {
  return (
    <div className="defile-x" role="group" aria-label="Choisir l'heure">
      {PERIODES.map((p) => (
        <button key={p.h} className="choix choix--jour" aria-pressed={p.h === h} onClick={() => onChoisir(p.h)}>
          <span>H{p.h}</span>
          <small>{sous ? sous(p.h) : p.debut}</small>
        </button>
      ))}
    </div>
  );
}
