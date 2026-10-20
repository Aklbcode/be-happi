// Export agenda (.ics) : l'horaire des prochaines semaines dans Outlook, Google Agenda ou le téléphone.
// Heures en UTC (calculées depuis l'heure locale), congés exclus, déplacements validés appliqués.

import { deIso, estJourDeCours, iso, periode, plusJours } from './calendar';

export interface Evenement {
  uid: string;
  date: string;     // AAAA-MM-JJ
  hDebut: number;
  hFin: number;
  titre: string;
  lieu?: string;
  description?: string;
}

const deux = (n: number) => String(n).padStart(2, '0');

function utc(d: Date): string {
  return `${d.getUTCFullYear()}${deux(d.getUTCMonth() + 1)}${deux(d.getUTCDate())}T${deux(d.getUTCHours())}${deux(d.getUTCMinutes())}00Z`;
}

/** Échappe le texte selon la RFC 5545 et coupe les lignes trop longues. */
const echappe = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lignes de 75 octets au plus (les lettres accentuées comptent double en UTF-8). */
function plier(ligne: string): string {
  const morceaux: string[] = [];
  let courant = '';
  let octets = 0;
  for (const car of ligne) {
    const n = new TextEncoder().encode(car).length;
    if (octets + n > 74) {
      morceaux.push(courant);
      courant = ' ';
      octets = 1;
    }
    courant += car;
    octets += n;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n');
}

export function calendrierIcs(nom: string, evenements: Evenement[], maintenant = new Date()): string {
  const lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//La Tour//IPES Tubize//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${echappe(nom)}`];
  for (const e of evenements) {
    const d = deIso(e.date);
    const a = periode(e.hDebut);
    const b = periode(e.hFin);
    const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(a.dm / 60), a.dm % 60);
    const fin = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(b.fm / 60), b.fm % 60);
    lignes.push(
      'BEGIN:VEVENT',
      `UID:${echappe(e.uid)}@be-happi`,
      `DTSTAMP:${utc(maintenant)}`,
      `DTSTART:${utc(debut)}`,
      `DTEND:${utc(fin)}`,
      `SUMMARY:${echappe(e.titre)}`,
      ...(e.lieu ? [`LOCATION:${echappe(e.lieu)}`] : []),
      ...(e.description ? [`DESCRIPTION:${echappe(e.description)}`] : []),
      'END:VEVENT',
    );
  }
  lignes.push('END:VCALENDAR');
  return lignes.map(plier).join('\r\n') + '\r\n';
}

/** Les jours de cours à partir d'une date (congés et week-ends exclus). */
export function joursDeCours(depuis: Date, semaines: number): string[] {
  const sortie: string[] = [];
  for (let d = depuis, n = 0; n < semaines * 7; n++, d = plusJours(d, 1)) if (estJourDeCours(d)) sortie.push(iso(d));
  return sortie;
}

/** Fait télécharger un fichier texte (agenda, liste…) depuis le navigateur. */
export function telecharger(nomFichier: string, contenu: string, type = 'text/calendar;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
