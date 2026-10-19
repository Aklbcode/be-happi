// Écran « Signaler » (tout le monde, élèves compris) : un problème dans un local en dix secondes.
// Le QR code collé sur la porte ouvre cet écran avec le local déjà rempli.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { estMien } from '../logic/remarques';
import { titreSignalement } from '../logic/happi';
import { moment } from '../logic/suivi';
import { sansAccents } from '../data/champs';

const TYPES = ['Projecteur ou écran', 'Électricité', 'Chauffage', 'Informatique', 'Mobilier', 'Fuite d’eau', 'Fenêtre ou store', 'Propreté', 'Autre'];

export function Signaler({ params }: { params: URLSearchParams }) {
  const { ds, demo, profil, signaler, montrerToast } = useStore();
  const [brut, setLocal] = useState(params.get('local') ?? '');
  const [cherche, setCherche] = useState('');
  const [type, setType] = useState('');
  const [texte, setTexte] = useState(params.get('texte') ?? '');
  const [urgent, setUrgent] = useState(params.get('urgent') === '1');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState<string | null>(null);

  const propositions = useMemo(() => {
    if (!ds || !cherche) return [];
    const q = sansAccents(cherche);
    return ds.locaux.filter((l) => sansAccents(l.code).includes(q)).slice(0, 8);
  }, [ds, cherche]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  // « bf110 » dans l'adresse → BF110 tel qu'il est écrit dans la liste des locaux.
  const local = ds.locaux.find((l) => sansAccents(l.code) === sansAccents(brut))?.code ?? brut;
  const miens = ds.signalements.filter((s) => (demo && profil === 'eleve' ? s.auteur === 'Élève (démo)' : estMien(ds, s)));
  const pret = !!local && (!!texte.trim() || !!type);

  async function envoyer() {
    setEnvoi(true);
    try {
      const contenu = [type && type !== 'Autre' ? type : '', texte.trim()].filter(Boolean).join(' : ');
      await signaler(local, contenu || 'Problème', urgent);
      setEnvoye(local);
      montrerToast('Signalement envoyé au service technique');
      setTexte('');
      setType('');
      setUrgent(false);
    } catch (e) {
      montrerToast(`Envoi impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="ecran" aria-label="Signaler un problème">
      <Entete titre="Signaler" sous="Un problème dans un local" />

      {envoye ? (
        <section className="carte-etat carte-etat--ok" role="status">
          <span className="vignette">
            <Icon nom="coche" />
          </span>
          <div className="pile grandit">
            <h2 className="titre-m">Envoyé, merci !</h2>
            <p className="texte">Le service technique voit le signalement pour {envoye}. Tu suivras sa réponse ici.</p>
            <button className="lien-action" onClick={() => setEnvoye(null)}>
              Signaler autre chose
            </button>
          </div>
        </section>
      ) : (
        <section className="carte" aria-label="Nouveau signalement">
          <h2 className="titre-s">Où ?</h2>
          {local ? (
            <div className="rangee">
              <span className="code-local">{local}</span>
              <button className="lien-action" onClick={() => setLocal('')}>
                Changer
              </button>
            </div>
          ) : (
            <>
              <div className="recherche recherche--petite">
                <Icon nom="porte" />
                <input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="BF110, PR003…" aria-label="Local" />
              </div>
              {propositions.length > 0 && (
                <div className="rangee enrouler">
                  {propositions.map((l) => (
                    <button key={l.code} className="filtre" onClick={() => { setLocal(l.code); setCherche(''); }}>
                      {l.code}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <h2 className="titre-s">Quoi ?</h2>
          <div className="rangee enrouler" role="radiogroup" aria-label="Type de problème">
            {TYPES.map((t) => (
              <button key={t} role="radio" aria-checked={type === t} className="filtre" aria-pressed={type === t} onClick={() => setType(type === t ? '' : t)}>
                {t}
              </button>
            ))}
          </div>
          <textarea className="champ" rows={3} maxLength={220} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Décris en quelques mots (ex. ne s’allume plus)" aria-label="Description du problème" />
          <button className="ligne-choix" role="switch" aria-checked={urgent} onClick={() => setUrgent(!urgent)}>
            <span className={`interrupteur${urgent ? ' interrupteur--on' : ''}`} aria-hidden="true" />
            <span className="pile grandit">
              <span className="fort">Le local est inutilisable</span>
              <span className="petit">Fuite, danger, plus de courant… Le local sera fermé aux réservations.</span>
            </span>
          </button>
          <button className="bouton bouton--prim" disabled={!pret || envoi} onClick={() => void envoyer()}>
            <Icon nom="envoyer" taille={18} /> {envoi ? 'Envoi…' : 'Envoyer au service technique'}
          </button>
        </section>
      )}

      <section className="pile pile--8" aria-label="Mes signalements">
        <h2 className="titre-m">Mes signalements</h2>
        {!miens.length && <p className="petit">Tu n’as encore rien signalé.</p>}
        {miens.map((s) => (
          <article key={s.id ?? s.titre} className="carte carte--serree">
            <div className="rangee rangee--haut">
              <span className="code-local">{s.local || '—'}</span>
              <div className="pile grandit">
                <span className="titre-s">{titreSignalement(s.titre, s.local)}</span>
                <span className="petit">{s.le ? moment(s.le) : s.depuis}</span>
              </div>
              <span className={`puce ${s.resolu ? 'puce--indigo' : s.statut === 'En cours' ? 'puce--orange' : 'puce--grise'}`}>{s.statut}</span>
            </div>
            {s.reponse && <p className="texte">Service technique : « {s.reponse} »</p>}
          </article>
        ))}
      </section>
    </section>
  );
}
