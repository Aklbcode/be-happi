// Décale : l'app des profs pour optimiser leurs déplacements de cours, sur le même moteur que
// La Tour (mêmes données, mêmes règles, mêmes écritures). Démarrage commun (réglages de l'école,
// confirmation d'un lien), puis les données, puis l'écran.

import { StoreProvider } from '../data/store';
import { useDepart } from '../lib/depart';
import type { ReglagesEcole } from '../lib/reglages';
import { Decale } from './Decale';
import { scenarioDecale } from './demo';

export function DecaleApp() {
  const { depart, oui, non } = useDepart();

  if (!depart)
    return (
      <main className="attente" aria-busy="true">
        <p className="marque">Décale</p>
      </main>
    );

  if (depart.etat === 'confirmer') return <Relier propose={depart.propose} actuels={depart.actuels} onOui={oui} onNon={non} />;

  return (
    <StoreProvider scenario={scenarioDecale}>
      <Decale />
    </StoreProvider>
  );
}

function Relier({ propose, actuels, onOui, onNon }: { propose: ReglagesEcole; actuels: ReglagesEcole | null; onOui: () => void; onNon: () => void }) {
  return (
    <main className="attente" aria-labelledby="titre-relier">
      <p className="marque">Décale</p>
      <h1 id="titre-relier">Relier Décale à ton école ?</h1>
      <p>
        {propose.siteHost}
        <wbr />
        {propose.sitePath}
      </p>
      <p className="crayon">Tu te connectes ensuite avec ton compte Microsoft de l’école. Les données restent dans ce SharePoint.</p>
      {actuels && (
        <p className="crayon">
          Cet appareil est déjà relié à {actuels.siteHost}
          <wbr />
          {actuels.sitePath}. « Oui » remplace ce réglage.
        </p>
      )}
      <div className="rang">
        <button className="bouton bouton--plein" onClick={onOui}>
          Oui, c’est mon école
        </button>
        <button className="bouton" onClick={onNon}>
          {actuels ? 'Non, garder le réglage actuel' : 'Non, voir la démo'}
        </button>
      </div>
      <p className="crayon petit">Tu n’attendais pas ce lien ? Réponds « Non ».</p>
    </main>
  );
}
