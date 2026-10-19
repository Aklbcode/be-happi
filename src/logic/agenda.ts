// Agenda du prof : cours confirmés et réservations, sans les heures d'absence.
import type { Dataset, Reservation } from '../data/types';
import { joursDeCours, type Evenement } from '../lib/ics';
import { absentA, classesReservation, coursDuProf } from './horaire';

const estRemediation = (r: Reservation): boolean => r.note === 'remédiation' || /remédiation/i.test(r.classe);

export function evenementsProf(ds: Dataset, prof: string, depuis: Date, semaines = 4): Evenement[] {
  const evenements: Evenement[] = [];
  for (const date of joursDeCours(depuis, semaines)) {
    const cours = coursDuProf(ds, prof, date).filter((c) => !absentA(ds, prof, date, c.h));
    const reservations = ds.reservations.filter((r) => r.prof === prof && r.date === date && !absentA(ds, prof, date, r.h));
    const heures = new Set(cours.map((c) => c.h));
    for (const c of cours) {
      const reserve = reservations.find((r) => r.h === c.h && !estRemediation(r));
      evenements.push({
        uid: `${prof}-${date}-${c.h}`, date, hDebut: c.h, hFin: c.h,
        titre: `${c.classe}${c.matiere ? ` · ${c.matiere}` : ''}`,
        lieu: reserve?.local ?? c.local,
        description: c.deplace ? 'Cours déplacé (validé)' : `H${c.h}`,
      });
    }
    // Un local réservé pendant un cours est déjà pris en compte ci-dessus.
    // Les autres réservations (dont les remédiations) sont des activités à part entière.
    for (const r of reservations) {
      if (heures.has(r.h)) continue;
      const classe = classesReservation(r).join(', ');
      const activite = estRemediation(r) ? 'Remédiation' : 'Local réservé';
      evenements.push({
        uid: `${prof}-${date}-${r.h}`, date, hDebut: r.h, hFin: r.h,
        titre: `${activite}${classe ? ` · ${classe}` : ''}`,
        lieu: r.local, description: `H${r.h}`,
      });
      heures.add(r.h);
    }
  }
  return evenements.sort((a, b) => a.date.localeCompare(b.date) || a.hDebut - b.hDebut);
}
