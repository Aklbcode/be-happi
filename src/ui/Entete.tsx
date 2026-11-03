// En-tête commun des écrans : retour éventuel, titre, sous-titre. Le rond « Moi » (initiales) n'est que sur Aujourd'hui.
// En démo, la pastille « Démo » ouvre aussi la feuille « Moi » pour essayer les autres espaces.

import type { ReactNode } from 'react';
import { useStore } from '../data/store';
import { Icon } from './Icon';
import { BoutonTheme, useMoi } from './Moi';

export function Entete({ titre, sous, retour, droite, apres, titreCache }: { titre: string; sous?: string; retour?: string; droite?: ReactNode; apres?: ReactNode; /** Le titre est déjà dans l'onglet : gardé pour les lecteurs d'écran seulement. */ titreCache?: boolean }) {
  const { demo, simulation } = useStore();
  const { ouvrir } = useMoi();
  return (
    <header className="entete">
      {retour && (
        <a className="rond" href={retour} aria-label="Retour">
          <Icon nom="gauche" />
        </a>
      )}
      <div className="pile grandit">
        {sous && <p className="sous-titre">{sous}</p>}
        <h1 className={titreCache ? 'visuellement-cache' : 'titre-xl'}>{titre}</h1>
        {apres}
      </div>
      <div className="rangee">
        {droite}
        {!retour && !droite && <BoutonTheme />}
        {simulation && (
          <a className="puce puce--demo" href="#/connexion" aria-label="Simulation : vraies données sur cet appareil seulement">
            Simulation
          </a>
        )}
        {demo && (
          <button className="puce puce--demo" onClick={ouvrir} aria-label="Démo : essayer les autres espaces">
            Démo
          </button>
        )}
      </div>
    </header>
  );
}
