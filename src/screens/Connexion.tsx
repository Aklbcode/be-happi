// Écran « Connexion » : état de la liaison avec SharePoint, diagnostic des listes, et la mise en
// service (relier l'app à l'école sans jamais écrire ses réglages dans le code public).

import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { config } from '../config';
import { lien } from '../lib/route';
import { adresseApp } from '../lib/liens';
import { dansTeams } from '../lib/teams';
import {
  adopterReglages,
  depuisLien,
  estGuid,
  lienInstallation,
  lireSite,
  oublierReglages,
  reglagesActuels,
  valides,
  type ReglagesEcole,
} from '../lib/reglages';
import { Entete } from '../ui/Entete';
import { BoutonPaquetTeams, QrInstallation, TEXTE_QR, TEXTE_QR_MOBILE } from '../ui/Installer';
import { AdresseSite } from '../ui/ConfirmerEcole';
import { PROFILS } from '../data/profils';
import type { DiagListe } from '../data/sharepoint';

type Diag = DiagListe[];

declare const __DEMO_FORCEE__: boolean;

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
        <>
          <div className="carte">
            <span className="puce puce--demo" style={{ alignSelf: 'flex-start' }}>Mode démo</span>
            <h2 className="titre-m">Données fictives</h2>
            <p className="texte">
              L’app tourne avec un horaire inventé. Pour les vraies données : l’IT enregistre l’application dans Microsoft Entra ID (étapes dans le README),
              puis les réglages se collent ci-dessous. Ils ne sont jamais écrits dans le code public.
            </p>
            {__DEMO_FORCEE__ && <p className="petit">Version de démonstration autonome : la mise en service se fait depuis l’app en ligne.</p>}
          </div>
          {!__DEMO_FORCEE__ && <MiseEnService />}
        </>
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

      {!demo && <Partage />}
    </section>
  );
}

const FORMAT_ID = 'Format attendu : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

function Champ(o: { libelle: string; aide: string; valeur: string; erreur: string; exemple: string; onChange: (v: string) => void }) {
  return (
    <label className="pile">
      <span className="petit fort">{o.libelle}</span>
      <input
        className="champ champ--ligne mono"
        value={o.valeur}
        placeholder={o.exemple}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        aria-invalid={!!o.erreur}
        onChange={(e) => o.onChange(e.target.value)}
      />
      <span className={`petit${o.erreur ? ' texte--alerte' : ''}`}>{o.erreur || o.aide}</span>
    </label>
  );
}

/** Les trois réglages de l'école → lien d'installation, QR code, paquet Teams. */
function MiseEnService() {
  const [tenant, setTenant] = useState('');
  const [client, setClient] = useState('');
  const [site, setSite] = useState('');
  const s = lireSite(site);
  const r: ReglagesEcole = { tenantId: tenant.trim().toLowerCase(), clientId: client.trim().toLowerCase(), siteHost: s?.siteHost ?? '', sitePath: s?.sitePath ?? '' };
  const memeId = !!r.tenantId && r.tenantId === r.clientId;
  const pret = valides(r) && !memeId;

  // Un lien d'installation reçu, collé dans n'importe quel champ, remplit les trois.
  const saisir = (valeur: string, poser: (v: string) => void) => {
    const recu = depuisLien(valeur);
    if (!recu) return poser(valeur);
    setTenant(recu.tenantId);
    setClient(recu.clientId);
    setSite(`https://${recu.siteHost}${recu.sitePath}`);
  };

  return (
    <div className="carte">
      <span className="puce puce--indigo" style={{ alignSelf: 'flex-start' }}>Mise en service</span>
      <h2 className="titre-m">Relier Be Happi à l’école</h2>
      <p className="texte">Les deux identifiants viennent de l’IT ; le site est celui des listes de l’app Power Apps. Tu as reçu un lien d’installation ? Colle-le dans le premier champ.</p>
      <Champ
        libelle="ID de l’annuaire (tenant)"
        aide="Entra ID → l’application → Vue d’ensemble"
        exemple="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        valeur={tenant}
        erreur={tenant.trim() && !estGuid(tenant) ? FORMAT_ID : ''}
        onChange={(v) => saisir(v, setTenant)}
      />
      <Champ
        libelle="ID d’application (client)"
        aide="Juste au-dessus, sur la même page"
        exemple="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        valeur={client}
        erreur={client.trim() && !estGuid(client) ? FORMAT_ID : memeId ? 'C’est le même que le tenant : prends l’« ID d’application (client) ».' : ''}
        onChange={(v) => saisir(v, setClient)}
      />
      <Champ
        libelle="Adresse du site SharePoint"
        aide="Copiée depuis le navigateur, même une page d’une liste"
        exemple="https://ecole.sharepoint.com/sites/BeHappi"
        valeur={site}
        erreur={site.trim() && !s ? 'Adresse attendue : https://….sharepoint.com/sites/…' : ''}
        onChange={(v) => saisir(v, setSite)}
      />

      {pret ? (
        <div className="pile pile--12 mise-en-service-prete">
          <p className="texte fort rangee rangee--haut">
            <Icon nom="coche" epaisseur={2.4} taille={18} />
            <span className="grandit adresse-site">
              Prêt pour <AdresseSite r={r} />
            </span>
          </p>
          <button
            className="bouton bouton--prim"
            onClick={() => {
              adopterReglages(r);
              window.location.reload();
            }}
          >
            Utiliser sur cet appareil
          </button>
          <BoutonPaquetTeams ecole={r} />
          <QrInstallation
            lien={lienInstallation(adresseApp(), r)}
            texte="Pour un téléphone : scanne ce code, ou envoie le lien. Il ne donne accès à rien sans compte Microsoft de l’école."
            texteMobile="Pour les autres téléphones : envoie ce lien. Il ne donne accès à rien sans compte Microsoft de l’école."
          />
        </div>
      ) : (
        <p className="petit">Rien n’est envoyé ni publié : le lien et le paquet sont fabriqués sur cet appareil.</p>
      )}
    </div>
  );
}

/** École reliée : le lien pour les téléphones, le paquet Teams, et oublier l'école sur cet appareil. */
function Partage() {
  const ecole = reglagesActuels();
  const [enTeams, setEnTeams] = useState(true);
  const [oublier, setOublier] = useState(false);
  useEffect(() => {
    void dansTeams().then(setEnTeams);
  }, []);
  if (!ecole) return null;
  return (
    <div className="carte">
      <span className="puce puce--indigo" style={{ alignSelf: 'flex-start' }}>Partager</span>
      <h2 className="titre-m">Be Happi sur un téléphone</h2>
      <QrInstallation lien={lienInstallation(adresseApp(), ecole)} texte={TEXTE_QR} texteMobile={TEXTE_QR_MOBILE} />
      <details className="replie">
        <summary>Pour l’IT : le paquet Teams</summary>
        <div className="pile pile--12">
          <BoutonPaquetTeams ecole={ecole} />
          <p className="petit">
            Site : <span className="mono adresse-site"><AdresseSite r={ecole} /></span>
          </p>
        </div>
      </details>
      {!enTeams &&
        (oublier ? (
          <div className="rangee enrouler">
            <span className="texte grandit">Oublier l’école sur cet appareil ? Les données copiées et la session seront effacées.</span>
            <button
              className="bouton bouton--sec bouton--petit"
              onClick={() => {
                oublierReglages();
                window.location.reload();
              }}
            >
              Oui, oublier
            </button>
            <button className="lien-action" onClick={() => setOublier(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button className="lien-action" onClick={() => setOublier(true)}>
            Oublier l’école sur cet appareil
          </button>
        ))}
    </div>
  );
}
