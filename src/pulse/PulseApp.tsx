// Pulse : la deuxième façon de voir l'école, sur le même moteur que Be Happi.
// Démarrage commun (réglages de l'école, confirmation d'un lien), puis les données, puis l'écran.

import { useEffect } from 'react';
import { StoreProvider } from '../data/store';
import { useDepart } from '../lib/depart';
import type { ReglagesEcole } from '../lib/reglages';
import { Pulse } from './Pulse';
import { Glyphe } from './Glyphe';
import { appliquerThemePulse, themePulse } from './theme';

export function PulseApp() {
  const { depart, oui, non } = useDepart();

  useEffect(() => {
    appliquerThemePulse(themePulse());
  }, []);

  if (!depart)
    return (
      <main className="attente" aria-busy="true">
        <Glyphe anime />
      </main>
    );

  if (depart.etat === 'confirmer') return <Relier propose={depart.propose} actuels={depart.actuels} onOui={oui} onNon={non} />;

  return (
    <StoreProvider>
      <Pulse />
    </StoreProvider>
  );
}

function Relier({ propose, actuels, onOui, onNon }: { propose: ReglagesEcole; actuels: ReglagesEcole | null; onOui: () => void; onNon: () => void }) {
  return (
    <main className="relier" aria-labelledby="titre-relier">
      <Glyphe />
      <h1 id="titre-relier">Relier Pulse à ton école ?</h1>
      <p className="relier-site">
        {propose.siteHost}
        <wbr />
        {propose.sitePath}
      </p>
      <p>Tu te connectes ensuite avec ton compte Microsoft de l’école. Les données restent dans ce SharePoint.</p>
      {actuels && (
        <p className="discret">
          Cet appareil est déjà relié à {actuels.siteHost}
          <wbr />
          {actuels.sitePath}. « Oui » remplace ce réglage.
        </p>
      )}
      <div className="relier-actions">
        <button className="btn btn--plein" onClick={onOui}>
          Oui, c’est mon école
        </button>
        <button className="btn" onClick={onNon}>
          {actuels ? 'Non, garder le réglage actuel' : 'Non, voir la démo'}
        </button>
      </div>
      <p className="discret">Tu n’attendais pas ce lien ? Réponds « Non ».</p>
    </main>
  );
}
