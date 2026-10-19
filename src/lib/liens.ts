// Liens profonds vers Teams : ouvrir une conversation ou une réunion déjà remplie.
// Aucune permission supplémentaire : Teams s'ouvre chez la personne, qui n'a plus qu'à envoyer.

import { avecEcole, reglagesActuels } from './reglages';

/** Un message ou une réunion Teams prêts à ouvrir (adresses + texte). */
export type MessageTeams =
  | { type: 'teams-chat'; emails: string[]; noms: string[]; message: string; sujet?: string }
  | { type: 'teams-reunion'; sujet: string; debut: string; fin: string; emails: string[]; noms: string[]; contenu?: string };

/** Conversation (à un ou plusieurs collègues) avec un message prérempli. */
export function lienChatTeams(emails: string[], message: string, sujet?: string): string {
  const p = new URLSearchParams();
  p.set('users', emails.filter(Boolean).join(','));
  if (sujet && emails.length > 1) p.set('topicName', sujet);
  p.set('message', message);
  return `https://teams.microsoft.com/l/chat/0/0?${p.toString()}`;
}

/** Nouvelle réunion Teams, avec participants, horaire et texte. */
export function lienReunionTeams(o: { sujet: string; debut: Date; fin: Date; participants: string[]; contenu?: string }): string {
  const p = new URLSearchParams();
  p.set('subject', o.sujet);
  p.set('startTime', o.debut.toISOString());
  p.set('endTime', o.fin.toISOString());
  if (o.participants.length) p.set('attendees', o.participants.filter(Boolean).join(','));
  if (o.contenu) p.set('content', o.contenu);
  return `https://teams.microsoft.com/l/meeting/new?${p.toString()}`;
}

/** Adresse de l'app (sans paramètres ni écran). */
export const adresseApp = (): string =>
  typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://aklbcode.github.io/be-happi/';

/**
 * Adresse d'un écran de Be Happi (QR code d'une porte, écran du hall…). Une fois l'école reliée,
 * elle porte aussi les réglages : un téléphone qui scanne arrive sur les vraies données, pas en démo.
 */
export function lienApp(chemin: string): string {
  const ecole = reglagesActuels();
  const base = ecole ? avecEcole(adresseApp(), ecole) : adresseApp();
  return `${base}${chemin.startsWith('#') ? chemin : `#/${chemin}`}`;
}
