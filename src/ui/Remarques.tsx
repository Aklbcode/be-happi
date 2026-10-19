// « Happi a remarqué » : jusqu'à trois constats utiles, chacun avec une action.

import type { Remarque } from '../logic/remarques';
import { Icon } from './Icon';

export function Remarques({ remarques }: { remarques: Remarque[] }) {
  if (!remarques.length) return null;
  return (
    <section className="pile pile--8" aria-label="Happi a remarqué">
      <h2 className="titre-happi">
        <Icon nom="etincelle" taille={18} epaisseur={2} /> Happi a remarqué
      </h2>
      {remarques.map((r) => (
        <article key={r.id} className={`remarque remarque--${r.ton}`}>
          <span className="vignette">
            <Icon nom={r.icone} />
          </span>
          <div className="pile grandit">
            <h3 className="titre-s">{r.titre}</h3>
            <p className="texte">{r.texte}</p>
            {r.action && (
              <a className="lien-action" href={r.action.href}>
                {r.action.libelle}
              </a>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
