import { useEffect, type ReactNode } from 'react';
import { StoreProvider, useStore } from './data/store';
import { useRoute, type Ecran } from './lib/route';
import { suivreThemeTeams } from './lib/teams';
import { useDepart } from './lib/depart';
import { profil as descProfil, peutOuvrir } from './data/profils';
import { Onglets } from './ui/Onglets';
import { MenuLateral } from './ui/MenuLateral';
import { Icon } from './ui/Icon';
import { MoiProvider, appliquerTheme, themeEnregistre } from './ui/Moi';
import { ApercuTeams } from './ui/ApercuTeams';
import { Bienvenue } from './ui/Bienvenue';
import { ConfirmerEcole } from './ui/ConfirmerEcole';
import { Aujourdhui } from './screens/Aujourdhui';
import { Horaire } from './screens/Horaire';
import { Deplacer } from './screens/Deplacer';
import { Locaux } from './screens/Locaux';
import { Ecole } from './screens/Ecole';
import { Happi } from './screens/Happi';
import { Connexion } from './screens/Connexion';
import { Validations } from './screens/Validations';
import { Pilotage } from './screens/Pilotage';
import { OuEst } from './screens/OuEst';
import { Collab } from './screens/Collab';
import { Absences } from './screens/Absences';
import { Publier } from './screens/Publier';
import { Infos } from './screens/Infos';
import { Direction } from './screens/Direction';
import { Technique } from './screens/Technique';
import { Signaler } from './screens/Signaler';
import { Materiel } from './screens/Materiel';
import { Eleve } from './screens/Eleve';
import { EcranHall } from './screens/EcranHall';
import { QrPortes } from './screens/QrPortes';
import { CapReussite } from './screens/CapReussite';

function Coquille() {
  const route = useRoute();
  const { toast, erreur, chargement, ds, profil, profils, peutValider } = useStore();

  useEffect(() => {
    void suivreThemeTeams((t) => {
      document.documentElement.dataset.theme = t;
    });
  }, []);

  const ecran: Ecran = route.ecran ?? descProfil(profil).accueil;
  const p = route.params;
  // Connexion reste ouverte tant que rien n'est chargé ou en cas d'erreur : c'est là qu'on voit pourquoi.
  const autorise = peutOuvrir(ecran, profils) || (ecran === 'connexion' && (!ds || !!erreur));

  let vue: ReactNode;
  if (!autorise) vue = <NonAutorise />;
  else
    switch (ecran) {
      case 'horaire': vue = <Horaire />; break;
      case 'deplacer': vue = <Deplacer params={p} />; break;
      case 'locaux': vue = <Locaux params={p} key={p.toString()} />; break;
      case 'ecole': vue = <Ecole />; break;
      case 'happi': vue = <Happi params={p} key={p.get('q') ?? ''} />; break;
      case 'connexion': vue = <Connexion />; break;
      case 'validations': vue = <Validations />; break;
      case 'pilotage': vue = <Pilotage />; break;
      case 'ouest': vue = <OuEst params={p} key={p.toString()} />; break;
      case 'collab': vue = <Collab params={p} key={p.get('p') ?? ''} />; break;
      case 'absences': vue = <Absences params={p} key={p.get('date') ?? ''} />; break;
      case 'publier': vue = <Publier />; break;
      case 'infos': vue = <Infos params={p} key={p.toString()} />; break;
      case 'direction': vue = <Direction />; break;
      case 'technique': vue = <Technique />; break;
      case 'signaler': vue = <Signaler params={p} key={p.toString()} />; break;
      case 'materiel': vue = <Materiel params={p} key={p.toString()} />; break;
      case 'eleve': vue = <Eleve vue="jour" />; break;
      case 'semaine': vue = <Eleve vue="semaine" />; break;
      case 'ecran': vue = <EcranHall params={p} />; break;
      case 'qr': vue = <QrPortes />; break;
      case 'cap': vue = <CapReussite />; break;
      default: vue = <Aujourdhui />;
    }

  const aValider = ds ? ds.deplacements.filter((d) => d.statut === 'En attente').length : 0;
  const nouveaux = ds ? ds.signalements.filter((s) => !s.resolu && s.statut === 'Nouveau').length : 0;
  const sansBarre = ecran === 'deplacer' || ecran === 'ecran';

  return (
    <>
      {erreur && ecran !== 'connexion' && (
        <div role="alert" className="toast toast--haut">
          <Icon nom="attention" /> Connexion SharePoint impossible : <a href="#/connexion">détails</a>
        </div>
      )}
      {chargement && !ds ? (
        <section className="ecran ecran--chargement" aria-busy="true">
          <span className="bulle-chargement">
            <Icon nom="etincelle" taille={30} />
          </span>
          <p className="texte">Connexion à SharePoint…</p>
        </section>
      ) : (
        vue
      )}
      {!sansBarre && <Onglets actif={ecran} profil={profil} pastilles={{ validations: peutValider ? aValider : 0, technique: nouveaux }} />}
      {ecran !== 'ecran' && <MenuLateral actif={ecran} pastilles={{ validations: peutValider ? aValider : 0, technique: nouveaux }} />}
      <ApercuTeams />
      {ecran !== 'ecran' && <Bienvenue />}
      {toast && (
        <div role="status" className="toast">
          <Icon nom="coche" epaisseur={2.4} /> {toast}
        </div>
      )}
    </>
  );
}

function NonAutorise() {
  const { profil } = useStore();
  return (
    <section className="ecran">
      <div className="carte">
        <h1 className="titre-l">Cet écran n’est pas ouvert à ton espace</h1>
        <p className="texte">Il dépend de ton rôle dans la liste Roles du site SharePoint. Si c’est une erreur, demande à la direction de t’y ajouter.</p>
        <a className="bouton bouton--prim" href={`#/${descProfil(profil).accueil}`}>
          Revenir à l’accueil
        </a>
      </div>
    </section>
  );
}

export default function App() {
  // D'abord les réglages de l'école (onglet Teams, lien d'installation, appareil), puis les données.
  const { depart, oui, non } = useDepart();

  useEffect(() => {
    appliquerTheme(themeEnregistre());
  }, []);

  if (!depart)
    return (
      <section className="ecran ecran--chargement" aria-busy="true">
        <span className="bulle-chargement">
          <Icon nom="etincelle" taille={30} />
        </span>
      </section>
    );

  if (depart.etat === 'confirmer') return <ConfirmerEcole propose={depart.propose} actuels={depart.actuels} onOui={oui} onNon={non} />;

  return (
    <StoreProvider>
      <MoiProvider>
        <Coquille />
      </MoiProvider>
    </StoreProvider>
  );
}
