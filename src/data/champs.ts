// Lecture des colonnes SharePoint, sans dépendance réseau (testable seule).

import { config } from '../config';
import { iso } from '../lib/calendar';
import { LOCAUX } from './locaux';

export type Champs = Record<string, unknown>;

/**
 * Noms qui désignent la même colonne selon la langue du site ou l'outil qui l'a créée.
 * Ex. Power Apps affiche « Titre » mais Graph renvoie « Title ».
 */
export const ALIAS: Record<string, string[]> = {
  Title: ['Titre'],
  Titre: ['Title'],
  Email: ['Mail', 'E_x002d_mail', 'Courriel'],
  Mail: ['Email', 'E_x002d_mail', 'Courriel'],
};

/** Lit une colonne, en essayant ses autres noms connus si elle est absente. */
export function val(f: Champs, nom: string): unknown {
  if (f[nom] != null) return f[nom];
  for (const a of ALIAS[nom] ?? []) if (f[a] != null) return f[a];
  return undefined;
}

export const txt = (v: unknown): string => {
  if (v == null) return '';
  // Colonne Choix ou Personne renvoyée comme objet.
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return String(o.Value ?? o.LookupValue ?? o.displayName ?? '').trim();
  }
  return String(v).trim();
};

export const num = (v: unknown): number => Number(v ?? 0) || 0;

/** Les dates SharePoint arrivent en UTC : on les ramène au jour local. */
export const jour = (v: unknown): string => (v ? iso(new Date(String(v))) : '');

/** Une date « jour seulement » envoyée à midi UTC, pour ne pas glisser d'un jour. */
export const versUtcMidi = (date: string): string => `${date}T12:00:00Z`;

export const sansAccents = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Retrouve le nom du prof (tel qu'il est écrit dans Horaires) à partir de son adresse e-mail.
 * 1. La colonne e-mail de la liste Profs.
 * 2. Sinon, comme l'app Power Apps : la partie après le premier point de l'adresse
 *    (prenom.nom@… → nom) comparée au nom de la liste Profs, sans accents ni espaces,
 *    et seulement si un seul prof correspond.
 */
export function reconnaitre(profs: Champs[], email: string): string {
  const C = config.champs.profs;
  const mail = email.toLowerCase();
  const fiche = profs.find((p) => txt(val(p, C.mail)).toLowerCase() === mail);
  if (fiche) return txt(val(fiche, C.nom));

  const local = mail.split('@')[0] ?? '';
  const point = local.indexOf('.');
  if (point < 0) return '';
  const cle = sansAccents(local.slice(point + 1));
  if (!cle) return '';
  const nomSeul = (t: string): string => (t.includes(' (') ? t.slice(0, t.indexOf(' (')) : t);
  const trouves = profs.filter((p) => sansAccents(nomSeul(txt(val(p, C.nom)))) === cle);
  return trouves.length === 1 ? txt(val(trouves[0], C.nom)) : '';
}

/** Le formulaire de signalement n'a pas de colonne Local : on cherche un code de local dans le texte. */
export function localDans(texte: string): string {
  const t = sansAccents(texte);
  let meilleur = '';
  for (const l of LOCAUX) {
    const code = sansAccents(l.code);
    // Le plus long code trouvé gagne (BF005A avant BF005).
    if (code.length > meilleur.length && t.includes(code)) meilleur = l.code;
  }
  return meilleur;
}

/** Rôles de la personne connectée, lus dans la liste Roles (adresse e-mail → rôle). */
export function rolesDe(lignes: Champs[], email: string): string[] {
  const C = config.champs.roles;
  const mail = email.toLowerCase();
  return lignes.filter((r) => txt(val(r, C.mail)).toLowerCase() === mail).map((r) => txt(val(r, C.role))).filter(Boolean);
}

const aUnRole = (roles: string[] | undefined, attendus: string[]): boolean => {
  const voulus = attendus.map(sansAccents);
  return (roles ?? []).some((r) => voulus.includes(sansAccents(r)));
};

/** Peut valider ou refuser les déplacements (rôles réglés dans config.roles.validation). */
export const peutValiderAvec = (roles: string[] | undefined): boolean => aUnRole(roles, config.roles.validation);

/** Peut consulter l'écran Validations sans décider (config.roles.lecture). */
export const peutVoirAvec = (roles: string[] | undefined): boolean => peutValiderAvec(roles) || aUnRole(roles, config.roles.lecture);
