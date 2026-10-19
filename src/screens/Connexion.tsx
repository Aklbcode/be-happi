// Écran « Connexion » : état de la liaison avec SharePoint et diagnostic des listes.

import { useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { config, sharepointConfigure } from '../config';
import { lien } from '../lib/route';
import { Entete } from '../ui/Entete';
import { PROFILS } from '../data/profils';
import type { DiagListe } from '../data/sharepoint';

type Diag = DiagListe[];

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
      <Entete titre="Connexion" sous="SharePoint de l’école" retour={lien('ecole')} />

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
            <>
              <p className="texte">
                {ds.moi.email} · reconnu comme <strong className="fort">{ds.moi.nom || '(nom introuvable dans la liste Profs)'}</strong> · {ds.cours.length} lignes d'horaire, {ds.absences.length} absences
              </p>
              <p className="texte">
                Espaces ouverts : <strong className="fort">{(ds.moi.profils ?? []).map((p) => PROFILS.find((x) => x.id === p)?.nom ?? p).join(', ') || 'aucun'}</strong>
                {(ds.moi.roles ?? []).length ? ` (liste Roles : ${(ds.moi.roles ?? []).join(', ')})` : ' (aucun rôle dans la liste Roles)'}
              </p>
              {ds.absentes.length > 0 && (
                <p className="petit">Listes pas encore créées sur le site : {ds.absentes.map((k) => (config.listes as Record<string, string>)[k] ?? k).join(', ')}. Les écrans qui en dépendent restent vides.</p>
              )}
            </>
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
              {(() => {
                const aRegler = diag.filter((d) => (!d.trouvee && !d.facultative) || (d.trouvee && d.manquantes.length > 0)).length;
                return (
                  <p className="texte fort">
                    {aRegler === 0 ? '✔ Toutes les listes et colonnes attendues sont là.' : `${aRegler} liste(s) à régler.`}
                  </p>
                );
              })()}
              {diag.map((d) => {
                const ok = d.trouvee && d.manquantes.length === 0;
                const facultativeAbsente = !d.trouvee && d.facultative;
                return (
                  <div key={d.liste} className="carte carte--grise" style={{ padding: 12, gap: 6 }}>
                    <span className="titre-s">
                      {ok ? '✔' : facultativeAbsente ? 'ⓘ' : '✖'} {d.liste}
                    </span>
                    {facultativeAbsente && <span className="petit">Facultative, pas encore créée : elle garde le journal des décisions et le motif des refus (voir README).</span>}
                    {!d.trouvee && !d.facultative && <span className="petit">Liste introuvable sur ce site</span>}
                    {d.manquantes.map((m) => (
                      <span key={m.attendu} className="petit" style={{ color: 'var(--rose-encre)' }}>
                        Colonne manquante : <span className="mono">{m.attendu}</span>
                        {m.piste ? <> · nom interne trouvé : <span className="mono">{m.piste}</span></> : null}
                      </span>
                    ))}
                    {d.trouvee && (
                      <span className="petit mono" style={{ wordBreak: 'break-word' }}>{d.colonnes.join(' · ')}</span>
                    )}
                  </div>
                );
              })}
              <p className="petit">S'il y a des ✖, fais une capture de cet écran et envoie-la : l'app sera réglée en quelques minutes.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
