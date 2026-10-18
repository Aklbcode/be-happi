import { useEffect } from 'react';
import { StoreProvider, useStore } from './data/store';
import { useRoute } from './lib/route';
import { suivreThemeTeams } from './lib/teams';
import { Onglets } from './ui/Onglets';
import { Icon } from './ui/Icon';
import { Aujourdhui } from './screens/Aujourdhui';
import { Horaire } from './screens/Horaire';
import { Deplacer } from './screens/Deplacer';
import { Locaux } from './screens/Locaux';
import { Ecole } from './screens/Ecole';
import { Happi } from './screens/Happi';
import { Connexion } from './screens/Connexion';

function Coquille() {
  const route = useRoute();
  const { toast, erreur, chargement, ds } = useStore();

  useEffect(() => {
    void suivreThemeTeams((t) => {
      document.documentElement.dataset.theme = t;
    });
  }, []);

  let ecran;
  switch (route.ecran) {
    case 'horaire': ecran = <Horaire />; break;
    case 'deplacer': ecran = <Deplacer params={route.params} />; break;
    case 'locaux': ecran = <Locaux params={route.params} key={route.params.toString()} />; break;
    case 'ecole': ecran = <Ecole />; break;
    case 'happi': ecran = <Happi />; break;
    case 'connexion': ecran = <Connexion />; break;
    default: ecran = <Aujourdhui />;
  }

  return (
    <>
      {erreur && route.ecran !== 'connexion' && (
        <div role="alert" className="toast" style={{ top: 12, bottom: 'auto', background: 'var(--rose-encre)' }}>
          <Icon nom="attention" /> Connexion SharePoint impossible : <a href="#/connexion" style={{ color: '#fff' }}>détails</a>
        </div>
      )}
      {chargement && !ds ? (
        <section className="ecran">
          <p className="texte">Connexion à SharePoint…</p>
        </section>
      ) : (
        ecran
      )}
      {route.ecran !== 'deplacer' && <Onglets actif={route.ecran} />}
      {toast && (
        <div role="status" className="toast">
          <Icon nom="coche" epaisseur={2.4} /> {toast}
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Coquille />
    </StoreProvider>
  );
}
