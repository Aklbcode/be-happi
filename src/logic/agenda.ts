// « Ajouter à mon agenda » : les 4 prochaines semaines de cours du prof, en fichier .ics (Outlook, iPhone…).

import type { Dataset } from '../data/types';
import { calendrierIcs, joursDeCours, telecharger, type Evenement } from '../lib/ics';
import { coursDuProf, nomAffiche } from './horaire';

export function exporterAgenda(ds: Dataset, maintenant: Date): void {
  const moi = ds.moi.nom;
  const evenements: Evenement[] = [];
  for (const d of joursDeCours(maintenant, 4)) {
    for (const c of coursDuProf(ds, moi, d)) {
      evenements.push({ uid: `${moi}-${d}-${c.h}`, date: d, hDebut: c.h, hFin: c.h, titre: `${c.classe}${c.matiere ? ` · ${c.matiere}` : ''}`, lieu: c.local, description: c.deplace ? 'Cours déplacé (validé)' : `H${c.h}` });
    }
  }
  telecharger('mon-horaire.ics', calendrierIcs(`Horaire · ${ds.moi.prenom} ${nomAffiche(moi)}`, evenements));
}
