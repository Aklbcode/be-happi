// Barre d'onglets flottante : Aujourd'hui · Horaire · Happi · Locaux · École.

import type { Ecran } from '../lib/route';
import { Icon, type NomIcone } from './Icon';

const ONGLETS: { ecran: Ecran; libelle: string; icone: NomIcone; centre?: boolean }[] = [
  { ecran: 'aujourdhui', libelle: "Aujourd'hui", icone: 'soleil' },
  { ecran: 'horaire', libelle: 'Horaire', icone: 'calendrier' },
  { ecran: 'happi', libelle: 'Happi', icone: 'etincelle', centre: true },
  { ecran: 'locaux', libelle: 'Locaux', icone: 'porte' },
  { ecran: 'ecole', libelle: 'École', icone: 'grille' },
];

export function Onglets({ actif }: { actif: Ecran }) {
  const courant: Ecran = actif === 'deplacer' ? 'horaire' : actif === 'connexion' ? 'ecole' : actif;
  return (
    <nav className="onglets" aria-label="Navigation principale">
      {ONGLETS.map((o) => (
        <a key={o.ecran} href={`#/${o.ecran}`} className={`onglet${o.centre ? ' onglet--centre' : ''}`} aria-current={courant === o.ecran ? 'page' : undefined}>
          {o.centre ? (
            <span className="bulle">
              <Icon nom={o.icone} taille={26} />
            </span>
          ) : (
            <Icon nom={o.icone} taille={24} epaisseur={courant === o.ecran ? 2.1 : 1.8} />
          )}
          <span>{o.libelle}</span>
        </a>
      ))}
    </nav>
  );
}
