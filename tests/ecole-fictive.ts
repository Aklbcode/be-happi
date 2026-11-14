// Une école inventée de la taille de la vraie (environ 2 000 heures de cours par semaine), pour
// essayer le plan de l'école à grande échelle. Aucune donnée réelle : profs « P001 », classes « 3C »…

import type { Absence, Cours, Dataset } from '../src/data/types';
import { LOCAUX } from '../src/data/locaux';

export function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function datasetVide(partiel: Partial<Dataset> = {}): Dataset {
  return {
    moi: { nom: 'SECRETARIAT', prenom: 'Test' },
    cours: [],
    absences: [],
    reservations: [],
    deplacements: [],
    infos: [],
    locaux: LOCAUX,
    signalements: [],
    decisions: [],
    journal: true,
    coursEleves: [],
    profs: [],
    changements: [],
    materiel: [],
    absentes: [],
    ...partiel,
  };
}

/**
 * Un horaire complet : `nbClasses` classes (années 1 à 6), une dizaine de profs par classe, chaque
 * prof une vingtaine d'heures. Personne n'est à deux endroits à la fois ; chaque prof a son local.
 */
export function ecoleFictive(graine = 1, nbClasses = 66): Dataset {
  const alea = hasard(graine);
  const classes = Array.from({ length: nbClasses }, (_, i) => `${(i % 6) + 1}${String.fromCharCode(65 + Math.floor(i / 6))}`);
  const nbProfs = Math.round((nbClasses * 31) / 20);
  const profs = Array.from({ length: nbProfs }, (_, i) => `P${String(i + 1).padStart(3, '0')}`);
  const salles = LOCAUX.filter((l) => l.type === 'Classe').map((l) => l.code);
  const charge = new Map(profs.map((p) => [p, 0]));
  const occupe = new Set<string>(); // prof|jour|h
  const cours: Cours[] = [];
  // L'équipe de chaque classe : 10 profs, avec 2 à 5 heures chacun.
  for (const [i, classe] of classes.entries()) {
    const equipe: { prof: string; reste: number }[] = [];
    for (let k = 0; equipe.length < 10 && k < 200; k++) {
      const p = profs[Math.floor(alea() * profs.length)];
      if (equipe.some((e) => e.prof === p) || (charge.get(p) ?? 0) >= 22) continue;
      equipe.push({ prof: p, reste: 2 + Math.floor(alea() * 4) });
    }
    // La journée de la classe : de H1 ou H2 jusqu'à H7, H8 ou H9, sans le temps de midi.
    for (let jour = 1; jour <= 5; jour++) {
      const debut = alea() < 0.75 ? 1 : 2;
      const fin = jour === 3 ? 4 : 7 + Math.floor(alea() * 3);
      for (let h = debut; h <= fin; h++) {
        if (h === 5) continue;
        const libres = equipe.filter((e) => e.reste > 0 && (charge.get(e.prof) ?? 0) < 24 && !occupe.has(`${e.prof}|${jour}|${h}`));
        if (!libres.length) continue; // une heure d'étude dans l'horaire : ça arrive
        const e = libres[Math.floor(alea() * libres.length)];
        e.reste--;
        charge.set(e.prof, (charge.get(e.prof) ?? 0) + 1);
        occupe.add(`${e.prof}|${jour}|${h}`);
        const local = salles[(profs.indexOf(e.prof) + i) % salles.length];
        cours.push({ id: `${e.prof}-${jour}-${h}`, prof: e.prof, jour, h, classes: [classe], classe, local, matiere: 'Cours' });
      }
    }
  }
  return datasetVide({ cours, profs: profs.map((nom) => ({ nom, email: `${nom.toLowerCase()}@ecole.example` })) });
}

/** `n` profs absents ce jour-là (toute la journée, ou une demi-journée pour un sur trois). */
export function absencesFictives(ds: Dataset, date: string, jour: number, n: number, graine = 7): Absence[] {
  const alea = hasard(graine);
  const presents = [...new Set(ds.cours.filter((c) => c.jour === jour).map((c) => c.prof))].sort();
  const absents = new Set<string>();
  for (let k = 0; absents.size < Math.min(n, presents.length) && k < 1000; k++) absents.add(presents[Math.floor(alea() * presents.length)]);
  return [...absents].map((prof, i) => (i % 3 === 2 ? { prof, date, deH: 1, aH: 4 } : { prof, date, deH: 1, aH: 9 }));
}
