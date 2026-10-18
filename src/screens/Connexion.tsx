// Écran « Connexion » : état de la liaison avec SharePoint et diagnostic des listes.

import { useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { config, sharepointConfigure } from '../config';
import { lien } from '../lib/route';

type Diag = { liste: string; trouvee: boolean; nb: number; colonnes: string[] }[];

export function Connexion() {
  const { ds, demo, chargement, erreur, recharger } = useStore();
  const [diag, setDiag] = useState<Diag | null>(null);
  const [diagErreur, setDiagErreur] = useState<string | null>(null);
  const [encours, setEncours] = useState(false);

  async function lancer() {
    setEncours(true);
    setDiagErreur(null);
    try {
      const sp = await import('../data/sharepoint');
      setDiag(await sp.diagnostic());
    } catch (e) {
      setDiagErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEncours(false);
    }
  }

  return (
    <section className="ecran" aria-label="Connexion">
      <div className="rangee">
        <a className="rond" href={lien('ecole')} aria-label="Retour">
          <Icon nom="gauche" />
        </a>
        <h1 className="titre-l">Connexion</h1>
      </div>

      {demo ? (
        <div className="carte">
          <span className="puce puce--demo" style={{ alignSelf: 'flex-start' }}>Mode démo</span>
          <h2 className="titre-m">Données fictives</h2>
          <p className="texte">
            L'app fonctionne avec un horaire inventé. Pour lire les vraies listes SharePoint de l'école, il faut que l'IT enregistre l'application
            (identifiant du tenant et de l'app) et indiquer l'adresse du site SharePoint.
          </p>
          <ul className="texte" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Tenant : {config.tenantId ? 'renseigné' : 'à fournir par l’IT'}</li>
            <li>Application : {config.clientId ? 'renseignée' : 'à fournir par l’IT'}</li>
            <li>Site SharePoint : {config.siteHost ? `${config.siteHost}${config.sitePath}` : 'à indiquer'}</li>
          </ul>
          {sharepointConfigure() && <p className="petit">Réglages présents : cette version de démo est forcée.</p>}
        </div>
      ) : (
        <div className="carte">
          <span className="puce puce--indigo" style={{ alignSelf: 'flex-start' }}>SharePoint</span>
          <h2 className="titre-m">{chargement ? 'Chargement…' : erreur ? 'Problème de connexion' : 'Connecté'}</h2>
          {erreur && <p className="texte" style={{ color: 'var(--rose-encre)' }}>{erreur}</p>}
          {ds && !erreur && (
            <p className="texte">
              {ds.moi.email} · reconnu comme <strong className="fort">{ds.moi.nom || '(nom introuvable dans la liste Profs)'}</strong> · {ds.cours.length} lignes d'horaire, {ds.absences.length} absences
            </p>
          )}
          <div className="rangee enrouler">
            <button className="bouton bouton--sec bouton--petit" onClick={recharger}>
              <Icon nom="recharger" taille={16} /> Recharger
            </button>
            <button className="bouton bouton--prim bouton--petit" onClick={() => void lancer()} disabled={encours}>
              {encours ? 'Analyse…' : 'Vérifier les listes'}
            </button>
          </div>
          {diagErreur && <p className="texte" style={{ color: 'var(--rose-encre)' }}>{diagErreur}</p>}
          {diag && (
            <div className="pile pile--8">
              {diag.map((d) => (
                <div key={d.liste} className="carte carte--grise" style={{ padding: 12, gap: 6 }}>
                  <span className="titre-s">
                    {d.trouvee ? '✔' : '✖'} {d.liste}
                  </span>
                  <span className="petit mono" style={{ wordBreak: 'break-word' }}>{d.trouvee ? d.colonnes.join(' · ') : 'Liste introuvable'}</span>
                </div>
              ))}
              <p className="petit">Fais une capture de cet écran et envoie-la : les noms de colonnes servent à régler l'app.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
