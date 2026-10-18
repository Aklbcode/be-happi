// Déplacements de cours quand un collègue est absent.
// Règle : seul un prof qui a la MÊME classe et qui est LIBRE à ce moment-là peut avancer (ou reculer)
// un de ses cours dans l'heure libérée. Priorité : l'avantage pour le prof (arriver plus tard,
// partir plus tôt), puis pour la classe. On cherche d'abord dans la semaine ; la semaine suivante
// n'est proposée que s'il n'y a rien dans la semaine.

import type { Dataset } from '../data/types';
import { JOURS, MIDI, deIso, dureeTxt, jourSemaineIso, periode, plusJoursIso } from '../lib/calendar';
import { absentA, coursDuProf, coursSansProf, heuresDeLaClasse, nomAffiche } from './horaire';

export interface OptionDeplacement {
  cle: string;
  classe: string;
  matiere: string;
  absent: string;
  local: string;
  /** Cours de départ */
  dateO: string;
  hO: number;
  /** Heure libérée (arrivée) */
  date: string;
  h: number;
  memeJour: boolean;
  semaineSuivante: boolean;
  score: number;
  meilleur: boolean;
  avantageProf: boolean;
  allonge: boolean;
  gainMinutes: number;
  avantages: string[];
  resume: string;
}

const jourDe = (date: string) => JOURS[jourSemaineIso(date)];
const lundiIso = (date: string) => plusJoursIso(date, 1 - jourSemaineIso(date));

/** Mon heure est-elle libre, présente et pas déjà prise ? */
export function heureLibre(ds: Dataset, moi: string, date: string, h: number): boolean {
  if (h === MIDI) return false;
  if (absentA(ds, moi, date, h)) return false;
  if (coursDuProf(ds, moi, date, true).some((c) => c.h === h)) return false;
  return true;
}

export function optionsPour(ds: Dataset, moi: string, date: string, h: number, aujourdhui: string, heureFinie: number): OptionDeplacement[] {
  if (!heureLibre(ds, moi, date, h)) return [];
  if (date < aujourdhui || (date === aujourdhui && h <= heureFinie)) return [];

  const vacants = coursSansProf(ds, date, h).filter((c) => c.prof !== moi);
  if (!vacants.length) return [];
  const parClasse = new Map<string, { absent: string; local: string }>();
  vacants.forEach((c) => c.classes.forEach((cl) => parClasse.set(cl, { absent: c.prof, local: c.local })));

  const dejaPropose = (d: string, hh: number) =>
    ds.deplacements.some((x) => x.prof === moi && x.statut !== 'Refusé' && x.dateOrigine === d && x.hOrigine === hh);

  const candidats = (jours: string[], semaineSuivante: boolean) =>
    jours.flatMap((d) =>
      coursDuProf(ds, moi, d)
        .filter((c) => !c.deplace)
        .filter((c) => !(d === date && c.h === h))
        .filter((c) => !(d === aujourdhui && c.h <= heureFinie))
        .filter((c) => c.classes.some((cl) => parClasse.has(cl)))
        .filter((c) => !dejaPropose(d, c.h))
        .map((c) => ({ c, d, semaineSuivante })),
    );

  const lundi = lundiIso(date);
  const joursRestants = [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n)).filter((d) => d >= date);
  let liste = candidats(joursRestants, false);
  if (!liste.length) liste = candidats([0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n + 7)), true);

  const mesHeuresCible = coursDuProf(ds, moi, date).map((c) => c.h);

  const options = liste.map(({ c, d, semaineSuivante }): OptionDeplacement => {
    const classe = c.classes.find((cl) => parClasse.has(cl)) ?? c.classes[0];
    const vac = parClasse.get(classe)!;
    const autres = coursDuProf(ds, moi, d).filter((x) => x.h !== c.h).map((x) => x.h);
    const memeJour = d === date;
    // Côté prof, jour de départ : est-ce que j'arrive plus tard ou pars plus tôt ?
    const autresApres = memeJour ? [...autres, h] : autres;
    let PG = 0;
    let gainMinutes = 0;
    let sens: 'aucun' | 'commence' | 'finit' | 'libre' = 'aucun';
    if (!autresApres.length) {
      PG = 6;
      sens = 'libre';
      gainMinutes = periode(c.h).fm - periode(c.h).dm;
    } else if (c.h < Math.min(...autresApres)) {
      PG = Math.min(...autresApres) - c.h;
      gainMinutes = periode(Math.min(...autresApres)).dm - periode(c.h).dm;
      sens = 'commence';
    } else if (c.h > Math.max(...autresApres)) {
      PG = c.h - Math.max(...autresApres);
      gainMinutes = periode(c.h).fm - periode(Math.max(...autresApres)).fm;
      sens = 'finit';
    }
    const avantageProf = PG > 0;
    // Le jour de l'heure libérée : est-ce que ça allonge ma journée ?
    const autresCible = memeJour ? autres : mesHeuresCible;
    const allonge = autresCible.length > 0 && (h < Math.min(...autresCible) || h > Math.max(...autresCible));
    const combleFourche = autresCible.length > 0 && h > Math.min(...autresCible) && h < Math.max(...autresCible);
    // Côté classe, jour de départ
    const q = heuresDeLaClasse(ds, classe, d);
    const q2 = q.filter((x) => x !== c.h);
    const fin = q2.length > 0 && Math.max(...q2) < Math.max(...q);
    const deb = q2.length > 0 && Math.min(...q2) > Math.min(...q);

    const score = (avantageProf ? 10 + 3 * PG : 0) + (fin || deb ? 2 : 0) + (combleFourche ? 1 : 0) - (allonge ? 12 : 0);

    const jO = jourDe(d);
    const jC = jourDe(date);
    const avantages: string[] = [];
    if (sens === 'libre') avantages.push(`${capital(jO)}, tu n'as plus cours`);
    else if (sens === 'commence') avantages.push(`${capital(jO)}, tu commences à ${periode(Math.min(...autresApres)).debut} au lieu de ${periode(c.h).debut}`);
    else if (sens === 'finit') avantages.push(`${capital(jO)}, tu finis à ${periode(Math.max(...autresApres)).fin} au lieu de ${periode(c.h).fin}`);
    if (combleFourche) avantages.push(`${capital(jC)}, ta fourche de ${periode(h).debut} est comblée`);
    if (fin) avantages.push(`La ${classe} finit plus tôt ${jO}`);
    if (deb) avantages.push(`La ${classe} commence plus tard ${jO}`);
    if (allonge) avantages.push(`Attention : ${jC}, ta journée s'allonge`);
    if (!avantages.length) avantages.push('Échange simple, sans heure gagnée');

    const quand = semaineSuivante ? `${jO} ${deIso(d).getDate()} (semaine prochaine)` : memeJour ? 'aujourd’hui' : jO;
    const resume = avantageProf
      ? `${dureeTxt(gainMinutes || PG * 50)} de moins ${jO}`
      : combleFourche
        ? 'comble ta fourche'
        : 'échange simple';

    return {
      cle: `${d}-${c.h}-${date}-${h}`,
      classe,
      matiere: c.matiere,
      absent: vac.absent,
      local: vac.local,
      dateO: d,
      hO: c.h,
      date,
      h,
      memeJour,
      semaineSuivante,
      score,
      meilleur: false,
      avantageProf,
      allonge,
      gainMinutes,
      avantages,
      resume: `${resume} · depuis ${quand} H${c.h}`,
    };
  });

  options.sort((a, b) => b.score - a.score || a.dateO.localeCompare(b.dateO) || a.hO - b.hO);
  if (options.length && options[0].score >= 2) {
    const max = options[0].score;
    options.forEach((o) => (o.meilleur = o.score === max));
  }
  return options;
}

export interface CaseSemaine {
  date: string;
  h: number;
  nb: number;
  etoile: boolean;
  passe: boolean;
}

/** Pour la grille de la semaine : combien de déplacements possibles par heure libre. */
export function opportunitesSemaine(ds: Dataset, moi: string, lundi: string, aujourdhui: string, heureFinie: number): Map<string, CaseSemaine> {
  const res = new Map<string, CaseSemaine>();
  for (let n = 0; n < 5; n++) {
    const date = plusJoursIso(lundi, n);
    for (let h = 1; h <= 9; h++) {
      if (!heureLibre(ds, moi, date, h)) continue;
      const passe = date < aujourdhui || (date === aujourdhui && h <= heureFinie);
      if (passe) {
        const nb = coursSansProf(ds, date, h).filter((c) => ds.cours.some((m) => m.prof === moi && m.classes.some((cl) => c.classes.includes(cl)))).length;
        if (nb) res.set(`${date}|${h}`, { date, h, nb, etoile: false, passe: true });
        continue;
      }
      const opts = optionsPour(ds, moi, date, h, aujourdhui, heureFinie);
      if (opts.length) res.set(`${date}|${h}`, { date, h, nb: opts.length, etoile: opts.some((o) => o.meilleur && o.avantageProf), passe: false });
    }
  }
  return res;
}

export const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const texteAbsent = (nom: string): string => nomAffiche(nom);
