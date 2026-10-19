// Impact d'une absence, calculé au moment où le secrétariat l'encode : les cours touchés, les classes,
// et les pistes de récupération (collègues qui ont exactement ces classes et sont libres à cette heure).

import type { Absence, Dataset } from '../data/types';
import { MIDI, jourSemaineIso, plusJoursIso } from '../lib/calendar';
import { coursDuProf, memesClasses } from './horaire';
import { heureLibre } from './deplacements';

export interface CoursTouche {
  date: string;
  h: number;
  classe: string;
  classes: string[];
  matiere: string;
  local: string;
  /** Collègues qui pourraient avancer un cours de ces classes dans cette heure. */
  pistes: string[];
}

export interface Impact {
  cours: CoursTouche[];
  classes: string[];
  heures: number;
  recuperables: number;
}

/** Les cours d'un prof touchés par une absence (une ou plusieurs journées). */
export function impactAbsence(ds: Dataset, absences: Absence[]): Impact {
  const cours: CoursTouche[] = [];
  for (const a of absences) {
    const lundi = plusJoursIso(a.date, 1 - jourSemaineIso(a.date));
    const semaine = [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n));
    for (const c of coursDuProf(ds, a.prof, a.date)) {
      if (c.h < a.deH || c.h > a.aH) continue;
      const pistes =
        c.h === MIDI
          ? []
          : [...new Set(
              ds.cours
                .filter((x) => x.prof !== a.prof && memesClasses(x.classes, c.classes))
                .filter((x) => semaine.some((d) => d >= a.date && jourSemaineIso(d) === x.jour))
                .map((x) => x.prof),
            )]
              .filter((p) => heureLibre(ds, p, a.date, c.h))
              .sort();
      cours.push({ date: a.date, h: c.h, classe: c.classe, classes: c.classes, matiere: c.matiere, local: c.local, pistes });
    }
  }
  const classes = [...new Set(cours.flatMap((c) => c.classes))].sort((x, y) => x.localeCompare(y, 'fr', { numeric: true }));
  return { cours, classes, heures: cours.length, recuperables: cours.filter((c) => c.pistes.length > 0).length };
}
