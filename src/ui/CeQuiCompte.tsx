// « Ce qui compte pour toi » : ce que le prof veut gagner en avançant un cours. Le cours « le plus
// avantageux », les flèches de l'horaire et les plans de Décale suivent ces choix (gardés sur
// l'appareil, les mêmes dans les deux apps).

import { useStore } from '../data/store';
import { LIBELLES_PRIORITES } from '../logic/priorites';
import { Icon } from './Icon';

export function CeQuiCompte({ explication = true }: { explication?: boolean }) {
  const { priorites, changerPriorites } = useStore();
  return (
    <section className="pile pile--8" aria-labelledby="titre-ce-qui-compte">
      <h2 id="titre-ce-qui-compte" className="titre-s">
        Ce qui compte pour toi
      </h2>
      <div className="rangee enrouler" style={{ gap: 8 }}>
        {LIBELLES_PRIORITES.map(([k, libelle]) => (
          <button key={k} className="filtre" aria-pressed={priorites[k]} onClick={() => changerPriorites({ ...priorites, [k]: !priorites[k] })}>
            {priorites[k] && <Icon nom="coche" taille={16} epaisseur={2.4} />}
            {libelle}
          </button>
        ))}
      </div>
      {explication && <p className="petit">Le cours le plus avantageux et les flèches suivent ces choix, ici et dans Décale.</p>}
    </section>
  );
}
