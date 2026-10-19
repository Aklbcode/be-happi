// Paquet Teams de l'école (be-happi-teams.zip), fabriqué dans le navigateur : le manifeste
// (modèle public/teams/manifest.template.json) avec l'adresse de l'app et les réglages de l'école,
// plus les deux icônes. Même résultat que scripts/teams_zip.py. Rien n'est envoyé nulle part.

import { archiveZip } from './zip';
import { avecEcole, type ReglagesEcole } from './reglages';

/** Identifiant de l'app dans Teams, le même à chaque version (uuid5 de « be-happi.ipes-tubize »). */
export const ID_TEAMS = '618b93c5-49e9-5f8e-8738-2ee85055b68f';

interface ManifesteOnglets {
  staticTabs?: { contentUrl: string; websiteUrl?: string }[];
}

/** Le manifeste Teams rempli à partir du modèle (texte JSON). */
export function manifesteTeams(modele: string, o: { url: string; version: string; ecole?: ReglagesEcole | null }): string {
  const url = o.url.replace(/[?#].*$/, '').replace(/\/*$/, '/');
  const texte = modele
    .split('{{URL}}').join(url)
    .split('{{DOMAINE}}').join(new URL(url).host)
    .split('{{ID}}').join(ID_TEAMS)
    .split('{{VERSION}}').join(o.version);
  const m = JSON.parse(texte) as ManifesteOnglets;
  if (o.ecole) {
    for (const t of m.staticTabs ?? []) {
      t.contentUrl = avecEcole(t.contentUrl, o.ecole);
      if (t.websiteUrl) t.websiteUrl = avecEcole(t.websiteUrl, o.ecole);
    }
  }
  return `${JSON.stringify(m, null, 2)}\n`;
}

async function lire(chemin: string): Promise<Uint8Array> {
  const r = await fetch(chemin, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Fichier du paquet introuvable : ${chemin}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Le paquet .zip à importer dans le centre d'administration Teams. */
export async function paquetTeams(o: { url: string; version: string; ecole: ReglagesEcole | null }): Promise<Blob> {
  const [modele, couleur, contour] = await Promise.all([lire('./teams/manifest.template.json'), lire('./teams/color.png'), lire('./teams/outline.png')]);
  const manifeste = manifesteTeams(new TextDecoder().decode(modele), o);
  const zip = archiveZip([
    { nom: 'manifest.json', donnees: new TextEncoder().encode(manifeste) },
    { nom: 'color.png', donnees: couleur },
    { nom: 'outline.png', donnees: contour },
  ]);
  return new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' });
}

/** Propose un fichier au téléchargement. */
export function telecharger(fichier: Blob, nom: string): void {
  const url = URL.createObjectURL(fichier);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
