// « Happi a remarqué » : quelques constats utiles, calculés à partir des listes, pour chaque espace.
// Jamais plus de trois à la fois, du plus utile au moins utile, chacun avec une action concrète.

import type { Dataset } from '../data/types';
import { JOURS, MIDI, deIso, dureeTxt, estJourDeCours, iso, jourSemaineIso, lundiDe, periode, plusJours, plusJoursIso } from '../lib/calendar';
import { coursDuProf, coursSansProf, nomAffiche } from './horaire';
import { etatLocal } from './occupation';
import { optionsPour, opportunitesSemaine } from './deplacements';
import { impactAbsence } from './impact';
import { etatPublication } from './publication';
import { heuresSansProf, statsPeriode } from './stats';
import { titreSignalement } from './happi';

export type Icone = 'horloge' | 'echange' | 'livre' | 'porte' | 'outil' | 'haut_parleur' | 'etincelle' | 'gens' | 'tablette' | 'attention' | 'coche';

export interface Remarque {
  id: string;
  icone: Icone;
  titre: string;
  texte: string;
  action?: { libelle: string; href: string };
  ton: 'indigo' | 'orange' | 'rose';
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

/** Pour un prof : sa semaine, ses classes, ses demandes en cours. */
export function remarquesProf(ds: Dataset, moi: string, maintenant: Date, heurePassee: number): Remarque[] {
  if (!moi) return [];
  const sortie: Remarque[] = [];
  const auj = iso(maintenant);
  const lundi = iso(lundiDe(maintenant));
  const jours = [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n)).filter((d) => d >= auj && estJourDeCours(deIso(d)));

  // 1. Du temps à gagner en avançant des cours cette semaine.
  let gain = 0;
  let nb = 0;
  for (const o of opportunitesSemaine(ds, moi, lundi, auj, heurePassee).values()) {
    if (o.passe || !o.etoile) continue;
    const meilleure = optionsPour(ds, moi, o.date, o.h, auj, heurePassee)[0];
    if (meilleure?.avantageProf && !meilleure.allonge) {
      gain += meilleure.gainMinutes;
      nb++;
    }
  }
  if (nb > 0 && gain >= 50) {
    sortie.push({
      id: 'gain',
      icone: 'echange',
      ton: 'orange',
      titre: `${dureeTxt(gain)} à gagner cette semaine`,
      texte: `En avançant ${pluriel(nb, 'cours', 'cours')} dans des heures libérées par des collègues absents. Tu proposes, l'éducateur valide.`,
      action: { libelle: 'Voir ma semaine', href: '#/horaire' },
    });
  }

  // 2. La plus longue fourche de la semaine, avec un local calme à proximité.
  let meilleure: { date: string; de: number; a: number; n: number } | null = null;
  for (const d of jours) {
    const hs = coursDuProf(ds, moi, d, true).map((c) => c.h).sort((x, y) => x - y);
    if (hs.length < 2) continue;
    let suite: number[] = [];
    const finir = () => {
      const n = suite.filter((h) => h !== MIDI).length;
      if (n >= 2 && (!meilleure || n > meilleure.n)) meilleure = { date: d, de: suite[0], a: suite[suite.length - 1], n };
      suite = [];
    };
    for (let h = hs[0] + 1; h < hs[hs.length - 1]; h++) {
      const pris = hs.includes(h) || (d === auj && h <= heurePassee) || ds.reservations.some((r) => r.prof === moi && r.date === d && r.h === h);
      if (pris) finir();
      else suite.push(h);
    }
    finir();
  }
  if (meilleure) {
    const m: { date: string; de: number; a: number; n: number } = meilleure;
    const avant = coursDuProf(ds, moi, m.date).filter((c) => c.h < m.de).pop();
    const ref = ds.locaux.find((l) => l.code === avant?.local);
    const calme = ds.locaux
      .filter((l) => l.type === 'Classe' && (!ref || l.batiment === ref.batiment))
      .find((l) => {
        for (let h = m.de; h <= m.a; h++) if (h !== MIDI && etatLocal(ds, moi, l.code, m.date, h).etat !== 'libre') return false;
        return true;
      });
    sortie.push({
      id: 'fourche',
      icone: 'horloge',
      ton: 'indigo',
      titre: `${JOURS[jourSemaineIso(m.date)].replace(/^./, (x) => x.toUpperCase())} : ${m.n} h de fourche`,
      texte: `De ${periode(m.de).debut} à ${periode(m.a).fin}.${calme ? ` ${calme.code} est libre tout ce temps, pour corriger au calme.` : ''}`,
      action: calme ? { libelle: `Réserver ${calme.code}`, href: `#/locaux?date=${m.date}&h=${m.de}` } : undefined,
    });
  }

  // 3. Une de mes classes a perdu beaucoup d'heures ces 4 dernières semaines.
  const mesClasses = new Set(ds.cours.filter((c) => c.prof === moi).flatMap((c) => c.classes));
  const perdues = new Map<string, number>();
  for (const x of heuresSansProf(ds, plusJoursIso(auj, -28), plusJoursIso(auj, -1))) {
    if (x.recup) continue;
    for (const k of x.classes) if (mesClasses.has(k)) perdues.set(k, (perdues.get(k) ?? 0) + 1);
  }
  const pire = [...perdues.entries()].sort((a, b) => b[1] - a[1])[0];
  if (pire && pire[1] >= 3) {
    sortie.push({
      id: 'perdues',
      icone: 'livre',
      ton: 'orange',
      titre: `La ${pire[0]} a perdu ${pire[1]} h ce mois-ci`,
      texte: `Des heures passées à l'étude, faute de prof. Une heure de remédiation dans ta matière l'aiderait à rattraper.`,
      action: { libelle: 'Voir quand c’est possible', href: `#/happi?q=${encodeURIComponent(`Quand ai-je la ${pire[0]} ?`)}` },
    });
  }

  // 4. Réponse du service technique à un de mes signalements.
  const repondu = ds.signalements.find((s) => !s.resolu && s.reponse && estMien(ds, s));
  if (repondu) {
    sortie.push({
      id: 'sig',
      icone: 'outil',
      ton: 'indigo',
      titre: `${repondu.local || 'Signalement'} : le service technique a répondu`,
      texte: `« ${repondu.reponse} » · ${titreSignalement(repondu.titre, repondu.local)}`,
      action: { libelle: 'Mes signalements', href: '#/signaler' },
    });
  }

  // 5. Merci pour la remédiation donnée.
  const remed = ds.reservations.filter((r) => r.prof === moi && r.note === 'remédiation' && r.date < auj && r.date >= plusJoursIso(auj, -70)).length;
  if (remed >= 3) {
    sortie.push({
      id: 'merci',
      icone: 'etincelle',
      ton: 'indigo',
      titre: `Merci : ${remed} h de remédiation données`,
      texte: 'Ces dix dernières semaines, au lieu de laisser des classes à l’étude. Ça compte pour les élèves.',
    });
  }
  return sortie.slice(0, 3);
}

const estMien = (ds: Dataset, s: { auteurMail?: string; auteur?: string }): boolean =>
  (!!s.auteurMail && s.auteurMail.toLowerCase() === (ds.moi.email ?? '').toLowerCase()) ||
  (!!s.auteur && !!ds.moi.prenom && s.auteur.toLowerCase() === `${ds.moi.prenom} ${nomAffiche(ds.moi.nom)}`.toLowerCase());

export { estMien };

/** Cours prévus aujourd'hui dans un local fermé par un signalement bloquant. */
export function coursDansLocauxFermes(ds: Dataset, date: string, apres = 0): { local: string; titre: string; cours: { h: number; classe: string; prof: string }[] }[] {
  const jour = jourSemaineIso(date);
  return ds.signalements
    .filter((s) => s.bloquant && !s.resolu && s.local && s.depuis <= date)
    .map((s) => ({
      local: s.local,
      titre: titreSignalement(s.titre, s.local),
      cours: ds.cours
        .filter((c) => c.local === s.local && c.jour === jour && c.h > apres)
        .filter((c) => !ds.absences.some((a) => a.prof === c.prof && a.date === date && c.h >= a.deH && c.h <= a.aH))
        .map((c) => ({ h: c.h, classe: c.classe, prof: c.prof }))
        .sort((a, b) => a.h - b.h),
    }))
    .filter((x) => x.cours.length > 0);
}

/** Pour l'éducateur : la journée de l'école. */
export function remarquesVieScolaire(ds: Dataset, maintenant: Date, heurePassee: number): Remarque[] {
  const sortie: Remarque[] = [];
  const auj = iso(maintenant);
  if (!estJourDeCours(maintenant)) return sortie;

  // 1. La classe la plus souvent à l'étude aujourd'hui (heures à venir).
  const parClasse = new Map<string, number[]>();
  for (let h = heurePassee + 1; h <= 9; h++) for (const c of coursSansProf(ds, auj, h)) for (const k of c.classes) parClasse.set(k, [...(parClasse.get(k) ?? []), h]);
  const pire = [...parClasse.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (pire && pire[1].length >= 2) {
    sortie.push({
      id: 'etude',
      icone: 'livre',
      ton: 'orange',
      titre: `La ${pire[0]} est à l'étude ${pire[1].length} h aujourd'hui`,
      texte: `En ${pire[1].map((h) => `H${h}`).join(', ')}. Des collègues libres peuvent la prendre en remédiation.`,
      action: { libelle: 'Qui peut aider ?', href: `#/happi?q=${encodeURIComponent(`Qui peut faire une remédiation avec la ${pire[0]} en H${pire[1][0]} ?`)}` },
    });
  }

  // 2. Locaux fermés où des cours sont prévus.
  const fermes = coursDansLocauxFermes(ds, auj, heurePassee);
  if (fermes.length) {
    const f = fermes[0];
    sortie.push({
      id: 'ferme',
      icone: 'porte',
      ton: 'rose',
      titre: `${f.local} est fermé : ${pluriel(f.cours.length, 'cours prévu', 'cours prévus')}`,
      texte: `${f.titre}. ${f.cours.map((c) => `H${c.h} ${c.classe}`).join(', ')} : il faut un autre local et prévenir.`,
      action: { libelle: 'Publier une info', href: `#/infos?local=${encodeURIComponent(f.local)}` },
    });
  }

  // 3. Des heures sans prof qui ont une piste de récupération.
  const absences = ds.absences.filter((a) => a.date === auj).map((a) => ({ ...a, deH: Math.max(a.deH, heurePassee + 1) })).filter((a) => a.deH <= a.aH);
  const impact = impactAbsence(ds, absences);
  const pistes = impact.cours.filter((c) => c.pistes.length && coursSansProf(ds, auj, c.h).some((v) => v.classes.some((k) => c.classes.includes(k))));
  if (pistes.length) {
    const qui = [...new Set(pistes.flatMap((p) => p.pistes))].slice(0, 3).map(nomAffiche);
    sortie.push({
      id: 'pistes',
      icone: 'echange',
      ton: 'indigo',
      titre: `${pluriel(pistes.length, 'heure récupérable', 'heures récupérables')}`,
      texte: `${qui.join(', ')} ${qui.length > 1 ? 'ont' : 'a'} ces classes et ${qui.length > 1 ? 'sont libres' : 'est libre'} : un déplacement de cours éviterait l'étude.`,
      action: { libelle: 'Voir le pilotage', href: '#/pilotage' },
    });
  }

  // 4. La publication des élèves n'est plus à jour.
  const pub = etatPublication(ds, auj);
  if (pub.dejaPublie && !pub.aJour) {
    sortie.push({
      id: 'pub',
      icone: 'haut_parleur',
      ton: 'orange',
      titre: 'Les élèves ne sont pas à jour',
      texte: `${pluriel(pub.nouveaux.length + pub.retires.length, 'changement')} depuis la dernière publication.`,
      action: { libelle: 'Publier', href: '#/publier' },
    });
  }
  return sortie.slice(0, 3);
}

/** Pour le secrétariat : la publication et les absences à venir. */
export function remarquesSecretariat(ds: Dataset, maintenant: Date): Remarque[] {
  const sortie: Remarque[] = [];
  const auj = iso(maintenant);
  const pub = etatPublication(ds, auj);
  if (estJourDeCours(maintenant) && (!pub.dejaPublie ? pub.calcule.length > 0 : !pub.aJour)) {
    sortie.push({
      id: 'pub',
      icone: 'haut_parleur',
      ton: 'orange',
      titre: pub.dejaPublie ? 'Les élèves ne sont pas à jour' : 'Rien n’est encore publié pour les élèves',
      texte: pub.dejaPublie ? `${pluriel(pub.nouveaux.length + pub.retires.length, 'changement')} depuis la dernière publication.` : `${pluriel(pub.calcule.length, 'changement')} à annoncer aujourd'hui.`,
      action: { libelle: 'Voir et publier', href: '#/publier' },
    });
  }
  const fermes = coursDansLocauxFermes(ds, auj);
  if (fermes.length && !ds.infos.some((i) => i.date === auj && i.titre.includes(fermes[0].local))) {
    sortie.push({
      id: 'ferme',
      icone: 'porte',
      ton: 'rose',
      titre: `${fermes[0].local} fermé : personne n'est prévenu`,
      texte: `${pluriel(fermes[0].cours.length, 'cours prévu', 'cours prévus')} aujourd'hui. Une info du jour évite que les classes attendent devant la porte.`,
      action: { libelle: 'Publier une info', href: `#/infos?local=${encodeURIComponent(fermes[0].local)}` },
    });
  }
  let demain = plusJours(maintenant, 1);
  for (let n = 0; n < 10 && !estJourDeCours(demain); n++) demain = plusJours(demain, 1);
  const absDemain = ds.absences.filter((a) => a.date === iso(demain));
  if (absDemain.length) {
    const imp = impactAbsence(ds, absDemain);
    sortie.push({
      id: 'demain',
      icone: 'gens',
      ton: 'indigo',
      titre: `${JOURS[jourSemaineIso(iso(demain))].replace(/^./, (x) => x.toUpperCase())} : ${pluriel(absDemain.length, 'absence')}`,
      texte: `${pluriel(imp.heures, 'cours concerné', 'cours concernés')}, ${imp.recuperables} avec une piste de récupération.`,
      action: { libelle: 'Voir', href: `#/absences?date=${iso(demain)}` },
    });
  }
  return sortie.slice(0, 3);
}

/** Les n derniers jours de cours avant une date (exclue) : du premier au dernier. */
export function joursDeCoursAvant(fin: string, n: number): { du: string; au: string } {
  let d = deIso(fin);
  let au = '';
  for (let k = 0, garde = 0; k < n && garde < 400; garde++) {
    d = plusJours(d, -1);
    if (!estJourDeCours(d)) continue;
    if (!au) au = iso(d);
    k++;
  }
  return { du: iso(d), au: au || iso(d) };
}

/** Pour la direction : les tendances. */
export function remarquesDirection(ds: Dataset, maintenant: Date): Remarque[] {
  const sortie: Remarque[] = [];
  const auj = iso(maintenant);
  // Deux semaines de cours (congés sautés) comparées aux deux d'avant.
  const r = joursDeCoursAvant(auj, 10);
  const a = joursDeCoursAvant(r.du, 10);
  const recent = statsPeriode(ds, r.du, r.au);
  const avant = statsPeriode(ds, a.du, a.au);
  if (recent.heures >= 5 && avant.heures >= 5) {
    const diff = Math.round((recent.taux - avant.taux) * 100);
    sortie.push({
      id: 'taux',
      icone: diff >= 0 ? 'etincelle' : 'attention',
      ton: diff >= 0 ? 'indigo' : 'orange',
      titre: `${Math.round(recent.taux * 100)} % des heures récupérées`,
      texte: `Sur les deux dernières semaines de cours, ${diff >= 0 ? `+${diff}` : diff} point${Math.abs(diff) > 1 ? 's' : ''} par rapport aux deux précédentes.`,
      action: { libelle: 'Tableau de bord', href: '#/direction' },
    });
  }
  const mois = statsPeriode(ds, joursDeCoursAvant(auj, 20).du, plusJoursIso(auj, -1));
  const pire = mois.parClasse[0];
  if (pire && pire.perdues - pire.recuperees >= 3) {
    sortie.push({
      id: 'classe',
      icone: 'livre',
      ton: 'orange',
      titre: `La ${pire.classe} est la plus touchée`,
      texte: `${pire.perdues} h sans prof en 4 semaines, ${pire.recuperees} récupérées.`,
      action: { libelle: 'Détail par classe', href: '#/direction' },
    });
  }
  const vieux = ds.signalements.filter((s) => !s.resolu).sort((a, b) => a.depuis.localeCompare(b.depuis))[0];
  if (vieux) {
    const jours = Math.round((new Date(`${auj}T12:00:00`).getTime() - new Date(`${vieux.depuis}T12:00:00`).getTime()) / 86400000);
    if (jours >= 3) {
      sortie.push({
        id: 'sig',
        icone: 'outil',
        ton: vieux.bloquant ? 'rose' : 'indigo',
        titre: `${vieux.local || 'Un signalement'} attend depuis ${jours} jours`,
        texte: `${titreSignalement(vieux.titre, vieux.local)} · ${vieux.statut}${vieux.reponse ? ` · « ${vieux.reponse} »` : ''}`,
        action: { libelle: 'Signalements', href: '#/technique' },
      });
    }
  }
  return sortie.slice(0, 3);
}

/** Pour le service technique : ce qui bloque des cours d'abord. */
export function remarquesTechnique(ds: Dataset, maintenant: Date): Remarque[] {
  const sortie: Remarque[] = [];
  const auj = iso(maintenant);
  const fermes = coursDansLocauxFermes(ds, auj);
  for (const f of fermes.slice(0, 2)) {
    sortie.push({
      id: `ferme-${f.local}`,
      icone: 'attention',
      ton: 'rose',
      titre: `${f.local} bloque ${pluriel(f.cours.length, 'cours', 'cours')} aujourd'hui`,
      texte: `${f.titre}. Premier cours prévu à ${periode(f.cours[0].h).debut}.`,
      action: { libelle: 'Ouvrir', href: '#/technique' },
    });
  }
  const nouveaux = ds.signalements.filter((s) => !s.resolu && s.statut === 'Nouveau');
  if (nouveaux.length) {
    sortie.push({
      id: 'nouveaux',
      icone: 'outil',
      ton: 'orange',
      titre: `${pluriel(nouveaux.length, 'nouveau signalement', 'nouveaux signalements')}`,
      texte: nouveaux.slice(0, 3).map((s) => `${s.local || '—'} : ${titreSignalement(s.titre, s.local)}`).join(' · '),
      action: { libelle: 'Traiter', href: '#/technique' },
    });
  }
  return sortie.slice(0, 3);
}
