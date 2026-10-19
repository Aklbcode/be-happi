// Écran « À traiter » (service technique) : les signalements, ce qui ferme un local d'abord, avec les
// cours touchés aujourd'hui ; prendre en charge, répondre, marquer résolu (comme Power Apps).

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { Signalement } from '../data/types';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { Remarques } from '../ui/Remarques';
import { remarquesTechnique, coursDansLocauxFermes } from '../logic/remarques';
import { titreSignalement } from '../logic/happi';
import { moment } from '../logic/suivi';
import { deIso } from '../lib/calendar';
import { lien } from '../lib/route';

export function Technique() {
  const { ds, maintenant, aujourdhui, profil } = useStore();
  const [vue, setVue] = useState<'ouverts' | 'resolus'>('ouverts');
  const remarques = useMemo(() => (ds ? remarquesTechnique(ds, maintenant) : []), [ds, maintenant]);
  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const ordre = (s: Signalement) => (s.bloquant ? 0 : s.statut === 'Nouveau' ? 1 : 2);
  const ouverts = ds.signalements.filter((s) => !s.resolu).sort((a, b) => ordre(a) - ordre(b) || (b.le ?? b.depuis).localeCompare(a.le ?? a.depuis));
  const resolus = ds.signalements.filter((s) => s.resolu);
  const liste = vue === 'ouverts' ? ouverts : resolus;
  const fermes = coursDansLocauxFermes(ds, aujourdhui);
  const peutTraiter = profil === 'technique';

  return (
    <section className="ecran" aria-label="Signalements à traiter">
      <Entete titre="À traiter" sous="Signalements des locaux" />
      <Remarques remarques={remarques} />
      <div className="seg" role="group" aria-label="Filtre">
        <button aria-pressed={vue === 'ouverts'} onClick={() => setVue('ouverts')}>En cours · {ouverts.length}</button>
        <button aria-pressed={vue === 'resolus'} onClick={() => setVue('resolus')}>Résolus · {resolus.length}</button>
      </div>
      {!liste.length && <p className="texte">{vue === 'ouverts' ? 'Rien à traiter. Bravo !' : 'Aucun signalement résolu pour l’instant.'}</p>}
      {liste.map((s) => (
        <CarteSignalement key={s.id ?? s.titre} s={s} cours={fermes.find((f) => f.local === s.local)?.cours ?? []} peutTraiter={peutTraiter} />
      ))}
      <a className="carte carte--lien" href={lien('qr')}>
        <span className="vignette">
          <Icon nom="qr" />
        </span>
        <span className="pile grandit">
          <span className="titre-s">QR codes pour les portes</span>
          <span className="petit">Un problème ? On scanne, on décrit, c’est envoyé ici.</span>
        </span>
        <Icon nom="droite" />
      </a>
    </section>
  );
}

function age(s: Signalement, aujourdhui: string): string {
  if (s.le) return moment(s.le);
  const j = Math.round((deIso(aujourdhui).getTime() - deIso(s.depuis).getTime()) / 86400000);
  return j <= 0 ? "aujourd'hui" : `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

function CarteSignalement({ s, cours, peutTraiter }: { s: Signalement; cours: { h: number; classe: string; prof: string }[]; peutTraiter: boolean }) {
  const { aujourdhui, traiterSignalement, montrerToast } = useStore();
  const [mot, setMot] = useState(s.reponse ?? '');
  const [envoi, setEnvoi] = useState(false);
  const agir = async (statut: string) => {
    setEnvoi(true);
    try {
      await traiterSignalement(s, statut, mot.trim() !== (s.reponse ?? '') ? mot.trim() : undefined);
      montrerToast(statut === 'Résolu' ? `${s.local || 'Signalement'} : résolu` : statut === 'En cours' ? `${s.local || 'Signalement'} : pris en charge` : 'Signalement rouvert');
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <article className={`carte${s.bloquant && !s.resolu ? ' carte--alerte' : ''}`}>
      <div className="rangee rangee--haut">
        <span className={`code-local${s.bloquant && !s.resolu ? ' code-local--rose' : ''}`}>{s.local || '—'}</span>
        <div className="pile grandit">
          <h2 className="titre-s">{titreSignalement(s.titre, s.local)}</h2>
          <span className="petit">
            {age(s, aujourdhui)}
            {s.auteur ? ` · ${s.auteur}` : ''}
          </span>
        </div>
        <span className={`puce ${s.resolu ? 'puce--indigo' : s.statut === 'En cours' ? 'puce--orange' : 'puce--grise'}`}>{s.statut}</span>
      </div>
      {s.bloquant && !s.resolu && (
        <p className="texte texte--alerte">
          <Icon nom="attention" taille={16} /> Local inutilisable
          {cours.length ? ` · aujourd’hui : ${cours.map((c) => `H${c.h} ${c.classe}`).join(', ')}` : ''}
        </p>
      )}
      {s.reponse && !peutTraiter && <p className="texte">« {s.reponse} »</p>}
      {peutTraiter && (
        <>
          <input className="champ champ--ligne" value={mot} onChange={(e) => setMot(e.target.value)} placeholder="Un mot pour la personne (ex. pièce commandée)" maxLength={140} aria-label="Réponse du service technique" />
          <div className="rangee">
            {!s.resolu && s.statut !== 'En cours' && (
              <button className="bouton bouton--sec grandit" disabled={envoi} onClick={() => void agir('En cours')}>
                Je prends
              </button>
            )}
            {!s.resolu && s.statut === 'En cours' && mot.trim() !== (s.reponse ?? '') && (
              <button className="bouton bouton--sec grandit" disabled={envoi} onClick={() => void agir('En cours')}>
                Envoyer le mot
              </button>
            )}
            {!s.resolu ? (
              <button className="bouton bouton--prim grandit" disabled={envoi} onClick={() => void agir('Résolu')}>
                <Icon nom="coche" taille={18} epaisseur={2.4} /> Résolu
              </button>
            ) : (
              <button className="bouton bouton--sec grandit" disabled={envoi} onClick={() => void agir('En cours')}>
                Rouvrir
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}
