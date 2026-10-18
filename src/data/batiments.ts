// Les bâtiments de l'IPES Tubize, tels que les profs les nomment.
// Seulement des repères de lieu (pas de données personnelles).

export type CodeBatiment = 'T' | 'F' | 'C' | 'PR' | 'Autres';

export interface Batiment {
  code: CodeBatiment;
  /** Ce qui est écrit sur les portes : BT, BF, BC, PR. */
  sigle: string;
  nom: string;
  repere: string;
  /** Étages, du plus haut au plus bas (0 = rez ; -1 = hors bâtiment). */
  etages: number[];
}

export const BATIMENTS: Batiment[] = [
  { code: 'T', sigle: 'BT', nom: 'La Tour', repere: 'côté chaussée de Mons', etages: [2, 1, 0] },
  { code: 'F', sigle: 'BF', nom: 'Le grand bâtiment', repere: 'au milieu, à côté du BT', etages: [2, 1, 0] },
  { code: 'C', sigle: 'BC', nom: 'Côté rue Papleux', repere: 'le long de la rue Papleux', etages: [2, 1, 0] },
  { code: 'PR', sigle: 'PR', nom: 'Les préfabriqués', repere: 'de plain-pied, le long des terrains de sport', etages: [0] },
  { code: 'Autres', sigle: '+', nom: 'Sport, atelier, cuisines', repere: 'hors des quatre bâtiments', etages: [-1] },
];

export const batiment = (code: string): Batiment => BATIMENTS.find((b) => b.code === code) ?? BATIMENTS[BATIMENTS.length - 1];

/** Nom court d'un étage (les préfabriqués sont de plain-pied : « Rez »). */
export const nomEtage = (etage: number, code: CodeBatiment): string =>
  code === 'Autres' || etage < 0 ? '' : etage === 0 ? 'Rez' : etage === 1 ? '1er' : `${etage}e`;
