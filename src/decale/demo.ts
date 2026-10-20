// Démo de Décale : la démo de La Tour (données inventées), avec deux absences de plus pour que
// la semaine de Camille Moreau montre ce que le moteur sait faire : plusieurs plans possibles, dont
// un qui combine ses deux dernières heures du vendredi, et une heure libérée déjà reprise par un
// collègue. Rien de réel : mêmes noms inventés que la démo de La Tour.

import type { Dataset } from '../data/types';
import { iso, plusJoursIso } from '../lib/calendar';

export function scenarioDecale(ds: Dataset, moment: Date): Dataset {
  const lundi = iso(moment);
  const j = (n: number) => plusJoursIso(lundi, n);
  return {
    ...ds,
    // Jeudi H7, Willems est libre : il pourra combler l'heure laissée par un cours de Camille (effet domino).
    cours: ds.cours.filter((c) => !(c.prof === 'WILLEMS' && c.jour === 4 && c.h === 7)),
    absences: [
      ...ds.absences,
      // Lundi H6 : la 6TQB est libre aussi (Camille l'a vendredi en H7).
      { id: 'dc-a1', prof: 'GOOSSENS', date: lundi, deH: 6, aH: 6 },
      // Vendredi H1-H2 : la 6TQA est libre (Camille l'a vendredi en H8).
      { id: 'dc-a2', prof: 'JANSSENS', date: j(4), deH: 1, aH: 2 },
    ],
    deplacements: [
      ...ds.deplacements,
      // Jeudi H2 : un collègue a déjà repris la 3TQB (Camille la voit « reprise »).
      { id: 'dc-d1', absent: 'HADDAD', date: j(3), hVide: 2, classe: '3TQB', prof: 'WILLEMS', hOrigine: 5, dateOrigine: j(4), statut: 'En attente', creeLe: `${lundi}T09:12:00` },
    ],
  };
}
