// Déplacements de cours quand un collègue est absent.
// Règle : seul un prof qui a la MÊME classe et qui est LIBRE à ce moment-là peut avancer (ou reculer)
// un de ses cours dans l'heure libérée. Pour un cours groupé (« 5GA, 5GD »), TOUTES ses classes
// doivent être libérées par le même collègue absent. Priorité : l'avantage pour le prof (arriver plus
// tard, partir plus tôt), puis pour la classe ; pénalité si sa journée s'allonge. On cherche d'abord
// dans la semaine ; la semaine suivante n'est proposée que s'il n'y a rien dans la semaine.
// H5 (temps de midi) n'est jamais une cible.
//
// Chaque option, et chaque proposition au moment de la valider, passe par les mêmes contrôles
// (verifierDeplacement) : heure à venir, pas H5, collègue toujours absent, prof libre, classes libres,
// cours de départ toujours là, local disponible (sinon un autre local libre est choisi).

import type { Dataset, Deplacement } from '../data/types';
import { JOURS, MIDI, deIso, dureeTxt, jourSemaineIso, periode, plusJoursIso } from '../lib/calendar';
import { absentA, classeOccupee, classesDe, coursDuProf, coursSansProf, heuresDeLaClasse, nomAffiche, seCroisent, type CoursJour } from './horaire';
import { etatLocal } from './occupation';

export interface Controle {
  cle: 'heure' | 'midi' | 'absent' | 'prof' | 'classes' | 'origine' | 'local';
  ok: boolean;
  /** Texte court, pour une pastille : « Prof libre ». */
  libelle: string;
  /** Explication quand le contrôle bloque, ou précision (local changé). */
  detail?: string;
}

export interface Verification {
  ok: boolean;
  controles: Controle[];
  /** Local à utiliser (celui de l'heure libérée, ou un autre s'il est pris). */
  local: string;
  /** Local de l'heure libérée. */
  localPrevu: string;
  localChange: boolean;
}

export interface OptionDeplacement {
  cle: string;
  classe: string;
  classes: string[];
  matiere: string;
  absent: string;
  local: string;
  localPrevu: string;
  localChange: boolean;
  controles: Controle[];
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
export const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const liste = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}` : xs[0] ?? '');

/** Mon heure est-elle libre : présent, pas de cours, pas de réservation, pas le temps de midi ? */
export function heureLibre(ds: Dataset, moi: string, date: string, h: number): boolean {
  if (h === MIDI) return false;
  if (absentA(ds, moi, date, h)) return false;
  if (coursDuProf(ds, moi, date, true).some((c) => c.h === h)) return false;
  if (ds.reservations.some((r) => r.prof === moi && r.date === date && r.h === h)) return false;
  return true;
}

/** Un local libre à cette heure : d'abord ceux qu'on préfère, puis un local du même type, puis une classe. */
export function choisirLocal(ds: Dataset, prof: string, date: string, h: number, preferes: string[]): string {
  const dispo = (code: string) => {
    if (!code) return false;
    const e = etatLocal(ds, prof, code, date, h).etat;
    return e === 'libre' || e === 'moi';
  };
  for (const p of preferes) if (dispo(p)) return p;
  const ref = preferes.map((p) => ds.locaux.find((l) => l.code === p)).find(Boolean);
  const ordre = [
    ...ds.locaux.filter((l) => ref && l.type === ref.type && l.batiment === ref.batiment),
    ...ds.locaux.filter((l) => ref && l.type === ref.type),
    ...ds.locaux.filter((l) => l.type === 'Classe'),
  ];
  return ordre.find((l) => dispo(l.code))?.code ?? '';
}

/**
 * Les contrôles d'un déplacement (nouveau ou en attente). Le déplacement vérifié ne compte pas
 * contre lui-même (il peut déjà être dans la liste, en attente).
 */
export function verifierDeplacement(ds: Dataset, d: Deplacement, aujourdhui: string, heureFinie: number): Verification {
  const classes = classesDe(d.classe);
  const jour = jourSemaineIso(d.date);
  const absent = nomAffiche(d.absent);
  const controles: Controle[] = [];

  const passee = d.date < aujourdhui || (d.date === aujourdhui && d.hVide <= heureFinie);
  controles.push({ cle: 'heure', ok: !passee, libelle: 'Heure à venir', detail: passee ? 'L’heure libérée est déjà passée.' : undefined });

  const midi = d.hVide === MIDI;
  controles.push({ cle: 'midi', ok: !midi, libelle: 'Hors temps de midi', detail: midi ? 'H5 est le temps de midi : jamais une cible.' : undefined });

  const libere = ds.cours.find((c) => c.prof === d.absent && c.jour === jour && c.h === d.hVide && classes.every((cl) => c.classes.includes(cl)));
  const toujoursAbsent = absentA(ds, d.absent, d.date, d.hVide);
  controles.push({
    cle: 'absent',
    ok: !!libere && toujoursAbsent,
    libelle: `${absent} absent·e`,
    detail: !toujoursAbsent
      ? `${absent} n’est plus noté·e absent·e en H${d.hVide}.`
      : !libere
        ? `${absent} n’a pas ${liste(classes)} en H${d.hVide}.`
        : undefined,
  });

  const profOccupe =
    absentA(ds, d.prof, d.date, d.hVide) ||
    coursDuProf(ds, d.prof, d.date, true).some((c) => c.h === d.hVide && !(c.deplace && c.deplace.date === d.dateOrigine && c.deplace.h === d.hOrigine)) ||
    ds.reservations.some((r) => r.prof === d.prof && r.date === d.date && r.h === d.hVide);
  controles.push({ cle: 'prof', ok: !profOccupe, libelle: 'Prof libre', detail: profOccupe ? `${nomAffiche(d.prof)} n’est plus libre en H${d.hVide}.` : undefined });

  const prises = classes.filter((cl) => classeOccupee(ds, cl, d.date, d.hVide, d));
  controles.push({
    cle: 'classes',
    ok: classes.length > 0 && prises.length === 0,
    libelle: classes.length > 1 ? 'Classes libres' : 'Classe libre',
    detail: prises.length ? `${liste(prises)} ${prises.length > 1 ? 'ont' : 'a'} déjà cours ou une réservation en H${d.hVide}.` : undefined,
  });

  const origine = coursDuProf(ds, d.prof, d.dateOrigine).find((c) => !c.deplace && c.h === d.hOrigine && seCroisent(c.classes, classes));
  controles.push({
    cle: 'origine',
    ok: !!origine,
    libelle: 'Cours de départ trouvé',
    detail: origine ? undefined : `Le cours de ${jourDe(d.dateOrigine)} H${d.hOrigine} n’est plus à l’horaire de ${nomAffiche(d.prof)}.`,
  });

  const localPrevu = libere?.local ?? '';
  const local = choisirLocal(ds, d.prof, d.date, d.hVide, [localPrevu, origine?.local ?? '']);
  const localChange = !!local && !!localPrevu && local !== localPrevu;
  controles.push({
    cle: 'local',
    ok: !!local,
    libelle: local ? `Local ${local}` : 'Aucun local libre',
    detail: !local ? `Aucun local libre en H${d.hVide}.` : localChange ? `${localPrevu} n’est pas disponible : ${local} à la place.` : undefined,
  });

  return { ok: controles.every((c) => c.ok), controles, local, localPrevu, localChange };
}

type Avantages = Pick<OptionDeplacement, 'score' | 'avantageProf' | 'allonge' | 'gainMinutes' | 'avantages' | 'resume' | 'memeJour'>;

/** Ce que le déplacement change pour le prof (et pour la classe). */
export function evaluer(ds: Dataset, moi: string, c: CoursJour, d: string, date: string, h: number, semaineSuivante: boolean): Avantages {
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
  // Le jour de l'heure libérée : est-ce que ma journée (du début du premier cours à la fin du
  // dernier) devient plus longue ? Le jour même, avancer son dernier cours la raccourcit.
  const duree = (hs: number[]) => (hs.length ? periode(Math.max(...hs)).fm - periode(Math.min(...hs)).dm : 0);
  const jourCibleAvant = memeJour ? [...autres, c.h] : coursDuProf(ds, moi, date).map((x) => x.h);
  const jourCibleApres = memeJour ? [...autres, h] : [...jourCibleAvant, h];
  const allonge = duree(jourCibleApres) > duree(jourCibleAvant);
  const jourVide = !memeJour && jourCibleAvant.length === 0;
  const autresCible = memeJour ? autres : jourCibleAvant;
  const combleFourche = autresCible.length > 0 && h > Math.min(...autresCible) && h < Math.max(...autresCible);
  // Côté classes, jour de départ : finissent-elles plus tôt, commencent-elles plus tard ?
  const classesFin: string[] = [];
  const classesDeb: string[] = [];
  for (const cl of c.classes) {
    const q = heuresDeLaClasse(ds, cl, d);
    const q2 = q.filter((x) => x !== c.h);
    if (q2.length > 0 && Math.max(...q2) < Math.max(...q)) classesFin.push(cl);
    if (q2.length > 0 && Math.min(...q2) > Math.min(...q)) classesDeb.push(cl);
  }

  const score = (avantageProf ? 10 + 3 * PG : 0) + (classesFin.length || classesDeb.length ? 2 : 0) + (combleFourche ? 1 : 0) - (allonge ? 12 : 0);

  const jO = jourDe(d);
  const jC = jourDe(date);
  const avantages: string[] = [];
  if (sens === 'libre') avantages.push(`${capital(jO)}, tu n'as plus cours`);
  else if (sens === 'commence') avantages.push(`${capital(jO)}, tu commences à ${periode(Math.min(...autresApres)).debut} au lieu de ${periode(c.h).debut}`);
  else if (sens === 'finit') avantages.push(`${capital(jO)}, tu finis à ${periode(Math.max(...autresApres)).fin} au lieu de ${periode(c.h).fin}`);
  if (combleFourche) avantages.push(`${capital(jC)}, ta fourche de ${periode(h).debut} est comblée`);
  if (classesFin.length) avantages.push(`${classesFin.length > 1 ? 'Les' : 'La'} ${liste(classesFin)} ${classesFin.length > 1 ? 'finissent' : 'finit'} plus tôt ${jO}`);
  if (classesDeb.length) avantages.push(`${classesDeb.length > 1 ? 'Les' : 'La'} ${liste(classesDeb)} ${classesDeb.length > 1 ? 'commencent' : 'commence'} plus tard ${jO}`);
  if (jourVide) avantages.push(`Attention : ${jC}, tu n'avais pas cours`);
  else if (allonge) avantages.push(`Attention : ${jC}, ta journée s'allonge`);
  if (!avantages.length) avantages.push('Échange simple, sans heure gagnée');

  const quand = semaineSuivante ? `${jO} ${deIso(d).getDate()} (semaine prochaine)` : memeJour ? 'aujourd’hui' : jO;
  const resume = avantageProf ? `${dureeTxt(gainMinutes || PG * 50)} de moins ${jO}` : combleFourche ? 'comble ta fourche' : 'échange simple';

  return { score, avantageProf, allonge, gainMinutes, avantages, resume: `${resume} · depuis ${quand} H${c.h}`, memeJour };
}

export function optionsPour(ds: Dataset, moi: string, date: string, h: number, aujourdhui: string, heureFinie: number): OptionDeplacement[] {
  if (!heureLibre(ds, moi, date, h)) return [];
  if (date < aujourdhui || (date === aujourdhui && h <= heureFinie)) return [];

  const vacants = coursSansProf(ds, date, h).filter((c) => c.prof !== moi);
  if (!vacants.length) return [];
  // Le cours libéré qui peut accueillir le mien : toutes mes classes y sont libérées, par le même collègue.
  const accueil = (c: CoursJour) => vacants.find((v) => c.classes.length > 0 && c.classes.every((cl) => v.classes.includes(cl)));

  const dejaPropose = (d: string, hh: number) =>
    ds.deplacements.some((x) => x.prof === moi && x.statut !== 'Refusé' && x.dateOrigine === d && x.hOrigine === hh);
  // Une proposition refusée par l'éducateur n'est pas reproposée telle quelle.
  const dejaRefuse = (d: string, hh: number) =>
    ds.decisions.some((x) => x.statut === 'Refusé' && x.prof === moi && x.dateOrigine === d && x.hOrigine === hh && x.date === date && x.hVide === h);

  const construire = (jours: string[], semaineSuivante: boolean): OptionDeplacement[] =>
    jours.flatMap((d) =>
      coursDuProf(ds, moi, d)
        .filter((c) => !c.deplace)
        .filter((c) => !(d === date && c.h === h))
        .filter((c) => !(d === aujourdhui && c.h <= heureFinie))
        .filter((c) => !dejaPropose(d, c.h) && !dejaRefuse(d, c.h))
        .flatMap((c): OptionDeplacement[] => {
          const v = accueil(c);
          if (!v) return [];
          const dep: Deplacement = { absent: v.prof, date, hVide: h, classe: c.classe, prof: moi, hOrigine: c.h, dateOrigine: d, statut: 'En attente' };
          const verif = verifierDeplacement(ds, dep, aujourdhui, heureFinie);
          if (!verif.ok) return [];
          return [
            {
              cle: `${d}-${c.h}-${date}-${h}`,
              classe: c.classe,
              classes: c.classes,
              matiere: c.matiere,
              absent: v.prof,
              local: verif.local,
              localPrevu: verif.localPrevu,
              localChange: verif.localChange,
              controles: verif.controles,
              dateO: d,
              hO: c.h,
              date,
              h,
              semaineSuivante,
              meilleur: false,
              ...evaluer(ds, moi, c, d, date, h, semaineSuivante),
            },
          ];
        }),
    );

  const lundi = lundiIso(date);
  const joursRestants = [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n)).filter((d) => d >= date);
  let options = construire(joursRestants, false);
  if (!options.length) options = construire([0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n + 7)), true);

  options.sort((a, b) => b.score - a.score || a.dateO.localeCompare(b.dateO) || a.hO - b.hO);
  if (options.length && options[0].score >= 2) {
    const max = options[0].score;
    options.forEach((o) => (o.meilleur = o.score === max));
  }
  return options;
}

/** Une proposition en attente, vue par l'éducateur : contrôles à jour et intérêt pour le prof. */
export interface Analyse {
  verif: Verification;
  avantages: string[];
  avantageProf: boolean;
  allonge: boolean;
  matiere: string;
}

export function analyserProposition(ds: Dataset, d: Deplacement, aujourdhui: string, heureFinie: number): Analyse {
  const verif = verifierDeplacement(ds, d, aujourdhui, heureFinie);
  const classes = classesDe(d.classe);
  const origine = coursDuProf(ds, d.prof, d.dateOrigine).find((c) => !c.deplace && c.h === d.hOrigine && seCroisent(c.classes, classes));
  if (!origine) return { verif, avantages: [], avantageProf: false, allonge: false, matiere: '' };
  const semaineSuivante = d.dateOrigine >= plusJoursIso(lundiIso(d.date), 7);
  const ev = evaluer(ds, d.prof, origine, d.dateOrigine, d.date, d.hVide, semaineSuivante);
  return { verif, avantages: ev.avantages, avantageProf: ev.avantageProf, allonge: ev.allonge, matiere: origine.matiere };
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

export const texteAbsent = (nom: string): string => nomAffiche(nom);
