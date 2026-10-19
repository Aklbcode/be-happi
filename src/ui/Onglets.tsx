// Barre d'onglets flottante : cinq onglets propres à l'espace affiché, Happi toujours au milieu.

import type { Ecran } from '../lib/route';
import { profil as descProfil } from '../data/profils';
import type { Profil } from '../data/types';
import { Icon } from './Icon';

/** Écrans « enfants » rattachés à un onglet (pour garder l'onglet allumé). */
const PARENT: Partial<Record<Ecran, Ecran>> = {
  deplacer: 'horaire',
  connexion: 'ecole',
  collab: 'ecole',
  materiel: 'ecole',
  signaler: 'ecole',
  qr: 'ecole',
};

export function Onglets({ actif, profil, pastilles = {} }: { actif: Ecran; profil: Profil; pastilles?: Partial<Record<Ecran, number>> }) {
  const onglets = descProfil(profil).onglets;
  const present = onglets.some((o) => o.ecran === actif);
  const courant: Ecran = present ? actif : PARENT[actif] && onglets.some((o) => o.ecran === PARENT[actif]) ? PARENT[actif]! : 'ecole';
  return (
    <nav className="onglets" aria-label="Navigation principale">
      {onglets.map((o) => {
        const centre = o.ecran === 'happi';
        const n = pastilles[o.ecran];
        return (
          <a key={o.ecran} href={`#/${o.ecran}`} className={`onglet${centre ? ' onglet--centre' : ''}`} aria-current={courant === o.ecran ? 'page' : undefined}>
            {centre ? (
              <span className="bulle">
                <Icon nom={o.icone} taille={26} />
              </span>
            ) : (
              <span className="onglet-icone">
                <Icon nom={o.icone} taille={24} epaisseur={courant === o.ecran ? 2.1 : 1.8} />
                {!!n && <span className="pastille">{n}</span>}
              </span>
            )}
            <span>{o.libelle}</span>
          </a>
        );
      })}
    </nav>
  );
}
