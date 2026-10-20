// « Publier pour les élèves » : ce que chaque classe doit savoir pour une journée.
// Mêmes textes que le bouton de l'écran Secrétariat de Power Apps (liste Changements), pour que les
// deux apps publient la même chose. La Tour ajoute ce que Power Apps ne connaît pas : une classe
// prise en remédiation n'est pas annoncée « à l'étude », et un déplacement dont le local a changé
// à la validation annonce directement le bon local (au lieu de deux lignes contradictoires).

import type { Changement, Dataset, Reservation } from '../data/types';
import { JOURS, deIso, jourSemaineIso } from '../lib/calendar';
import { classesDe, classesReservation } from './horaire';

/** « jeudi 12/11 », comme Text(date, "dddd dd/mm", "fr-FR") dans Power Apps. */
export function jourEtDate(date: string): string {
  const d = deIso(date);
  return `${JOURS[jourSemaineIso(date)]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const estRemediation = (r: Reservation): boolean => r.note === 'remédiation' || /remédiation/i.test(r.classe);
const confirme = (statut: string): boolean => statut !== 'En attente';

/** Les changements de la journée, une ligne par classe et par heure (sans motif d'absence). */
export function changementsDuJour(ds: Dataset, date: string): Changement[] {
  const jour = jourSemaineIso(date);
  const sortie: Changement[] = [];
  const ajouter = (h: number, classe: string, type: string, titre: string) => sortie.push({ date, h, classe, type, titre });

  const depDuJour = ds.deplacements.filter((d) => d.date === date && confirme(d.statut));
  const resaDuJour = ds.reservations.filter((r) => r.date === date && r.classe !== '—');
  // Réservations déjà annoncées dans une autre ligne (remédiation, local changé à la validation).
  const dejaDites = new Set<Reservation>();

  // 1. Heures des profs absents : étude, ou cours d'un collègue venu à cette heure.
  for (const a of ds.absences.filter((x) => x.date === date)) {
    for (const c of ds.cours.filter((x) => x.prof === a.prof && x.jour === jour && x.h >= a.deH && x.h <= a.aH)) {
      const d = depDuJour.find((x) => x.absent === c.prof && x.hVide === c.h);
      for (const k of c.classes) {
        if (d) {
          const resa = resaDuJour.find((r) => r.prof === d.prof && r.h === d.hVide && !estRemediation(r));
          if (resa) dejaDites.add(resa);
          const origine = d.dateOrigine && d.dateOrigine !== date ? `cours du ${jourEtDate(d.dateOrigine)} H` : 'avancé de H';
          ajouter(c.h, k, 'Déplacé', `${d.prof} donne cours à cette heure (${origine}${d.hOrigine}) · local ${resa?.local ?? c.local}`);
          continue;
        }
        const remed = resaDuJour.find((r) => r.h === c.h && estRemediation(r) && classesReservation(r).includes(k));
        if (remed) {
          dejaDites.add(remed);
          ajouter(c.h, k, 'Local', `Remédiation avec ${remed.prof} · local ${remed.local}`);
          continue;
        }
        ajouter(c.h, k, 'Étude', `Pas de cours de ${c.matiere} (${c.prof} absent(e)) → étude`);
      }
    }
  }

  // 2. Cours partis ailleurs : l'heure de départ devient libre.
  for (const d of depDuJour.filter((x) => !x.dateOrigine || x.dateOrigine === date)) {
    for (const k of classesDe(d.classe)) ajouter(d.hOrigine, k, 'Déplacé', `Cours de ${d.prof} déplacé en H${d.hVide} → heure libre`);
  }
  for (const d of ds.deplacements.filter((x) => x.dateOrigine === date && x.date !== date && confirme(x.statut))) {
    for (const k of classesDe(d.classe)) {
      ajouter(d.hOrigine, k, 'Déplacé', `Cours de ${d.prof} déjà donné le ${jourEtDate(d.date)} (H${d.hVide}) → heure libre`);
    }
  }

  // 3. Changements de local (réservations pour une classe).
  for (const r of resaDuJour) {
    if (dejaDites.has(r) || estRemediation(r)) continue;
    for (const k of classesReservation(r)) ajouter(r.h, k, 'Local', `Changement de local → ${r.local}`);
  }

  return sortie.sort((a, b) => a.classe.localeCompare(b.classe) || a.h - b.h);
}

const cle = (c: Pick<Changement, 'classe' | 'h' | 'titre'>): string => `${c.classe}|${c.h}|${c.titre}`;

export interface EtatPublication {
  /** Ce qu'il faudrait publier maintenant. */
  calcule: Changement[];
  /** Ce que les élèves voient (liste Changements). */
  publie: Changement[];
  nouveaux: Changement[];
  retires: Changement[];
  aJour: boolean;
  dejaPublie: boolean;
}

/** La publication des élèves est-elle à jour par rapport aux données d'aujourd'hui ? */
export function etatPublication(ds: Dataset, date: string): EtatPublication {
  const calcule = changementsDuJour(ds, date);
  const publie = ds.changements.filter((c) => c.date === date);
  const cles = new Set(publie.map(cle));
  const clesCalc = new Set(calcule.map(cle));
  const nouveaux = calcule.filter((c) => !cles.has(cle(c)));
  const retires = publie.filter((c) => !clesCalc.has(cle(c)));
  return { calcule, publie, nouveaux, retires, aJour: nouveaux.length === 0 && retires.length === 0, dejaPublie: publie.length > 0 };
}

/** Pour l'écran d'accueil public : le même message, sans nom de prof. */
export function sansNom(c: Pick<Changement, 'type' | 'titre'>): string {
  if (c.type === 'Étude') return 'Étude (pas de cours)';
  if (/^Remédiation/.test(c.titre)) return c.titre.replace(/^Remédiation avec [^·]+·/, 'Remédiation ·');
  if (/donne cours à cette heure/.test(c.titre)) return `Cours déplacé à cette heure${c.titre.includes('· local') ? ` · local ${c.titre.split('· local ')[1]}` : ''}`;
  if (/→ heure libre/.test(c.titre)) return 'Heure libre (cours déplacé)';
  return c.titre;
}
