// Matériel partagé (racks de tablettes, PC portables, projecteurs mobiles…) : ce qui reste à une heure donnée.

import type { Dataset, ResaMateriel } from '../data/types';
import { RACKS, type Rack } from '../data/materiel';

export interface Dispo {
  rack: Rack;
  reste: number;
  prises: ResaMateriel[];
}

/** Disponibilité de chaque rack à cette heure (stock moins les réservations). */
export function dispoMateriel(ds: Dataset, date: string, h: number): Dispo[] {
  return RACKS.map((rack) => {
    const prises = ds.materiel.filter((m) => m.rack === rack.nom && m.date === date && m.h === h);
    return { rack, reste: Math.max(0, rack.stock - prises.length), prises };
  });
}

/** Le rack reste-t-il disponible sur toute la plage (de h à jusque) ? */
export function libreSurPlage(ds: Dataset, rack: string, date: string, h: number, jusque: number): boolean {
  const r = RACKS.find((x) => x.nom === rack);
  if (!r) return false;
  for (let x = h; x <= jusque; x++) if (ds.materiel.filter((m) => m.rack === rack && m.date === date && m.h === x).length >= r.stock) return false;
  return true;
}
