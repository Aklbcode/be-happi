// « Ce qui compte pour toi » : ce que le prof veut gagner quand il avance un cours. Les mêmes
// réglages servent à Be Happi (le cours le plus avantageux, les flèches) et à Décale (les plans).

export interface Priorites {
  /** Finir plus tôt : une heure gagnée en fin de journée compte pleinement. */
  finTot: boolean;
  /** Commencer plus tard : une heure gagnée en début de journée compte pleinement. */
  debutTard: boolean;
  /** Moins de fourches : combler un trou dans la journée compte, en créer un aussi. */
  fourches: boolean;
}

export const PRIORITES_DEFAUT: Priorites = { finTot: true, debutTard: true, fourches: true };

export const LIBELLES_PRIORITES: [keyof Priorites, string][] = [
  ['finTot', 'Finir plus tôt'],
  ['debutTard', 'Commencer plus tard'],
  ['fourches', 'Moins de fourches'],
];

/** Des réglages lus quelque part (appareil, ancienne version) : complétés et vérifiés. */
export function priorites(brut: unknown): Priorites {
  const p = (brut && typeof brut === 'object' ? brut : {}) as Partial<Record<keyof Priorites, unknown>>;
  return {
    finTot: typeof p.finTot === 'boolean' ? p.finTot : PRIORITES_DEFAUT.finTot,
    debutTard: typeof p.debutTard === 'boolean' ? p.debutTard : PRIORITES_DEFAUT.debutTard,
    fourches: typeof p.fourches === 'boolean' ? p.fourches : PRIORITES_DEFAUT.fourches,
  };
}
