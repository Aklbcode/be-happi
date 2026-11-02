// Version de test : ce qui est coupé pour les premiers essais avec quelques collègues.
// Rien n'est supprimé : pour rallumer une option, il suffit de la remettre à true ici.

import type { Ecran } from './lib/route';
import type { Profil } from './data/types';

export const OPTIONS = {
  /** Happi, l'assistant (onglet du milieu). */
  happi: false,
  /** Cap Réussite : remédiation au lieu de l'étude. */
  capReussite: false,
  /** Décale : le plan de déplacements de la semaine (page à part). */
  decale: false,
  /** Signaler un problème dans un local, et ce qui va avec : service technique, QR des portes. */
  signaler: false,
  /** Publication pour les élèves, et ce qui va avec : vue élève, écran du hall. */
  publication: false,
  /** Infos du jour. */
  infos: false,
  /** Tableau de bord de la direction. */
  direction: false,
  /** Espace éducateur. */
  educateur: false,
  /** Espace et vue élève. */
  eleve: false,
  /** Message d'accueil à la première ouverture. */
  bienvenue: false,
};

const COUPES: [boolean, Ecran[]][] = [
  [OPTIONS.happi, ['happi']],
  [OPTIONS.capReussite, ['cap']],
  [OPTIONS.signaler, ['signaler', 'technique', 'qr']],
  [OPTIONS.publication, ['publier', 'ecran']],
  [OPTIONS.infos, ['infos']],
  [OPTIONS.direction, ['direction']],
  [OPTIONS.eleve, ['eleve', 'semaine']],
];
const ECRANS_COUPES = new Set<Ecran>(COUPES.filter(([actif]) => !actif).flatMap(([, e]) => e));

/** L'écran est-il ouvert dans cette version ? */
export const ecranActif = (e: Ecran): boolean => !ECRANS_COUPES.has(e);

/** Un lien « #/ecran… » mène-t-il à un écran ouvert ? (les autres liens passent toujours) */
export function lienActif(href: string): boolean {
  const m = /^#\/([a-z]+)/.exec(href);
  return !m || ecranActif(m[1] as Ecran);
}

const PROFILS_COUPES = new Set<Profil>([
  ...(!OPTIONS.direction ? (['direction'] as Profil[]) : []),
  ...(!OPTIONS.educateur ? (['educateur'] as Profil[]) : []),
  ...(!OPTIONS.eleve ? (['eleve'] as Profil[]) : []),
  ...(!OPTIONS.signaler ? (['technique'] as Profil[]) : []),
]);

/** Les espaces ouverts dans cette version (sans en laisser aucun vide). */
export function profilsActifs(p: Profil[]): Profil[] {
  const garde = p.filter((x) => !PROFILS_COUPES.has(x));
  return garde.length ? garde : p.slice(0, 1);
}
