// Ouverture d'un lien d'installation hors Teams : relier cet appareil à l'école, après confirmation.
// Un lien piégé ne peut donc pas relier l'app à un autre site sans qu'on le voie.

import type { ReglagesEcole } from '../lib/reglages';
import { Icon } from './Icon';

/** « ecole.sharepoint.com/sites/BeHappi », coupé de préférence avant « /sites » sur un petit écran. */
export function AdresseSite({ r }: { r: Pick<ReglagesEcole, 'siteHost' | 'sitePath'> }) {
  return (
    <>
      {r.siteHost}
      <wbr />
      {r.sitePath}
    </>
  );
}

interface Props {
  propose: ReglagesEcole;
  actuels: ReglagesEcole | null;
  onOui: () => void;
  onNon: () => void;
}

export function ConfirmerEcole({ propose, actuels, onOui, onNon }: Props) {
  return (
    <main className="ecran ecran--relier" aria-labelledby="titre-relier">
      <span className="bulle-chargement" aria-hidden="true">
        <Icon nom="etincelle" taille={30} />
      </span>
      <div className="pile">
        <span className="sous-titre">La Tour · IPES Tubize</span>
        <h1 id="titre-relier" className="titre-l">Relier La Tour à ton école ?</h1>
      </div>
      <div className="carte">
        <div className="pile">
          <span className="petit">Site SharePoint de l’école</span>
          <span className="titre-s mono adresse-site">
            <AdresseSite r={propose} />
          </span>
        </div>
        <p className="texte">Tu te connectes ensuite avec ton compte Microsoft de l’école. Les données restent dans ce SharePoint : rien n’est copié ailleurs.</p>
        {actuels && (
          <p className="petit">
            Cet appareil est déjà relié à{' '}
            <span className="mono adresse-site">
              <AdresseSite r={actuels} />
            </span>
            . « Oui » remplace ce réglage.
          </p>
        )}
      </div>
      <div className="pile pile--8">
        <button className="bouton bouton--prim" onClick={onOui}>
          <Icon nom="coche" epaisseur={2.4} /> Oui, c’est mon école
        </button>
        <button className="bouton bouton--sec" onClick={onNon}>
          {actuels ? 'Non, garder le réglage actuel' : 'Non, voir la démo'}
        </button>
      </div>
      <p className="petit">Tu n’attendais pas ce lien ? Réponds « Non ».</p>
    </main>
  );
}
