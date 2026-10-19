// En-tête commun des écrans : retour éventuel, titre, sous-titre, et le rond « Moi » (espace, thème).
// En démo, la pastille « Démo » ouvre aussi la feuille « Moi » pour essayer les autres espaces.

import type { ReactNode } from 'react';
import { useStore } from '../data/store';
import { Icon } from './Icon';
import { initiales, useMoi } from './Moi';

export function Entete({ titre, sous, retour, droite, apres }: { titre: string; sous?: string; retour?: string; droite?: ReactNode; apres?: ReactNode }) {
  const { ds, demo, profil } = useStore();
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
        <h1 className="titre-xl">{titre}</h1>
        {apres}
      </div>
      <div className="rangee">
        {droite}
        {demo && (
          <button className="puce puce--demo" onClick={ouvrir} aria-label="Démo : essayer les autres espaces">
            Démo
          </button>
        )}
        <button className="rond rond--nuit" onClick={ouvrir} aria-label={`Moi et mes espaces (espace ${profil})`}>
          {!ds ? '…' : profil === 'eleve' && (demo || !ds.moi.nom) ? 'É' : initiales(ds.moi.prenom, ds.moi.nom)}
        </button>
      </div>
    </header>
  );
}
