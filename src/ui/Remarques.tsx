// « Happi a remarqué » : jusqu'à trois constats utiles, chacun avec une action.

import { useState } from 'react';
import type { Remarque } from '../logic/remarques';
import { Icon } from './Icon';
import { OPTIONS, lienActif } from '../options';

export function Remarques({ remarques }: { remarques: Remarque[] }) {
  // Une ligne par constat ; on touche pour lire le détail et l'action.
  const [ouverte, setOuverte] = useState<string | null>(null);
  if (!remarques.length) return null;
  return (
    <section className="pile pile--8" aria-label={OPTIONS.happi ? 'Happi a remarqué' : 'À remarquer'}>
      <h2 className="titre-happi">
        <Icon nom="etincelle" taille={18} epaisseur={2} /> {OPTIONS.happi ? 'Happi a remarqué' : 'À remarquer'}
      </h2>
      {remarques.map((r) => {
        const ici = ouverte === r.id;
        return (
          <article key={r.id} className={`remarque remarque--${r.ton} remarque--compacte${ici ? ' remarque--ouverte' : ''}`}>
            <button className="remarque-tete" aria-expanded={ici} onClick={() => setOuverte(ici ? null : r.id)}>
              <span className="vignette">
                <Icon nom={r.icone} />
              </span>
              <span className="titre-s grandit">{r.titre}</span>
              <span className="remarque-fleche" aria-hidden="true">
                <Icon nom="droite" taille={16} />
              </span>
            </button>
            {ici && (
              <div className="pile remarque-corps">
                <p className="texte">{r.texte}</p>
                {r.action && lienActif(r.action.href) && (
                  <a className="lien-action" href={r.action.href}>
                    {r.action.libelle}
                  </a>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
