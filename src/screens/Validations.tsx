// Écran « Validations » (éducateur, secrétariat) : le bilan du jour, les propositions à valider
// revérifiées en direct, et le journal des décisions.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { Deplacement } from '../data/types';
import { Icon } from '../ui/Icon';
import { Feuille } from '../ui/Feuille';
import { Entete } from '../ui/Entete';
import { analyserProposition, type Analyse, type Controle } from '../logic/deplacements';
import { memeDeplacement, nomAffiche } from '../logic/horaire';
import { aPrevenir, bilanDuJour, journal, moment, resumeHeures, trajet } from '../logic/suivi';
import { dateLongue, periode } from '../lib/calendar';

/** Les contrôles montrés en pastilles (les autres n'apparaissent que s'ils bloquent). */
const PRINCIPAUX: Controle['cle'][] = ['absent', 'prof', 'classes', 'local'];

export function Validations() {
  const { ds, demo, maintenant, aujourdhui, heurePassee, decider, peutValider, peutVoirValidations, changerProfil, ouvrirTeams } = useStore();
  // Instantané de la proposition ouverte : après la décision, elle quitte la liste mais la feuille reste.
  const [ouverte, setOuverte] = useState<{ d: Deplacement; a: Analyse } | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState<'Validé' | 'Refusé' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<{ statut: 'Validé' | 'Refusé'; d: Deplacement; local?: string; journalOk: boolean } | null>(null);

  const calc = useMemo(() => {
    if (!ds) return null;
    const attente = ds.deplacements
      .filter((d) => d.statut === 'En attente')
      .map((d) => ({ d, a: analyserProposition(ds, d, aujourdhui, heurePassee) }))
      .sort((x, y) => Number(y.a.verif.ok) - Number(x.a.verif.ok) || x.d.date.localeCompare(y.d.date) || x.d.hVide - y.d.hVide);
    return { attente, bilan: bilanDuJour(ds, aujourdhui), decisions: journal(ds, aujourdhui) };
  }, [ds, aujourdhui, heurePassee]);

  if (!ds || !calc) return <section className="ecran"><p className="texte">Chargement…</p></section>;

  if (!peutVoirValidations) {
    return (
      <section className="ecran" aria-label="Validations">
        <Entete titre="Validations" sous="Déplacements de cours proposés" />
        <div className="carte">
          <h2 className="titre-m">Réservé aux éducateurs</h2>
          <p className="texte">
            Cet écran sert à valider les déplacements proposés par les profs. Il s'ouvre aux personnes notées « Secrétariat » ou « Éducateur » dans la
            liste Roles (et en lecture à la direction).
          </p>
        </div>
      </section>
    );
  }

  const { attente, bilan, decisions } = calc;
  // Tant qu'elle attend, on affiche l'analyse à jour ; ensuite, l'instantané.
  const sel = ouverte ? attente.find((x) => memeDeplacement(x.d, ouverte.d)) ?? ouverte : null;
  const motifOk = commentaire.trim().length >= 3;

  function ouvrir(d: Deplacement, a: Analyse) {
    setOuverte({ d, a });
    setCommentaire('');
    setErreur(null);
    setFait(null);
  }

  async function agir(statut: 'Validé' | 'Refusé') {
    if (!sel) return;
    setEnvoi(statut);
    setErreur(null);
    try {
      const r = await decider(sel.d, statut, commentaire);
      setFait({ statut, d: sel.d, local: r.local, journalOk: r.journalOk });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(null);
    }
  }

  const fermer = () => {
    setOuverte(null);
    setFait(null);
  };

  return (
    <section className="ecran" aria-label="Validations">
      <Entete titre="Validations" sous="Déplacements de cours proposés" />

      {demo && !peutValider && (
        <div className="carte carte--grise" style={{ gap: 10 }}>
          <span className="petit">Dans cet espace, tu vois les propositions sans pouvoir décider.</span>
          <button className="bouton bouton--prim bouton--petit" onClick={() => changerProfil('educateur')}>
            Passer dans l’espace Éducateur pour décider
          </button>
        </div>
      )}

      <section className="carte-nuit" aria-label="Le point du jour">
        <span className="mono petit" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>Le point · {dateLongue(maintenant)}</span>
        <h2 className="titre-l" style={{ color: '#fff' }}>
          {attente.length ? `${attente.length} proposition${attente.length > 1 ? 's' : ''} à valider` : 'Rien à valider'}
        </h2>
        <p className="texte">
          {bilan.absents.length ? `${bilan.absents.length} collègue${bilan.absents.length > 1 ? 's' : ''} absent${bilan.absents.length > 1 ? 's' : ''} aujourd'hui · ` : 'Personne d’absent aujourd’hui · '}
          {resumeHeures(bilan.heures)}
        </p>
        {bilan.heures.length > 0 && (
          <div className="defile-x" style={{ margin: '0 -20px', padding: '2px 20px' }}>
            {bilan.heures.map((x, i) => (
              <span key={i} className="puce" style={{ background: x.recuperee ? 'rgba(124,128,255,0.28)' : 'rgba(255,255,255,0.1)', color: '#fff', flex: 'none' }}>
                H{x.h} · {x.classe} · {x.enAttente ? 'à valider' : x.recuperee ? 'récupérée' : 'étude'}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="pile pile--12" aria-label="À valider">
        <h2 className="titre-m">À valider</h2>
        {attente.length === 0 && (
          <div className="carte">
            <p className="texte">Aucune proposition en attente. Les profs proposent depuis Be Happi ou Power Apps : elles arrivent ici.</p>
          </div>
        )}
        {attente.map(({ d, a }) => (
          <article key={d.id ?? trajet(d)} className="carte" aria-label={`${d.classe}, ${nomAffiche(d.prof)}`}>
            <div className="rangee rangee--entre">
              {a.verif.ok ? <span className="puce puce--orange">En attente</span> : <span className="puce puce--rose"><Icon nom="attention" taille={15} /> À revoir</span>}
              {d.creeLe && <span className="petit">proposé {moment(d.creeLe)}</span>}
            </div>
            <div className="pile">
              <h3 className="titre-m">{d.classe} · {nomAffiche(d.prof)}</h3>
              <span className="texte">
                {trajet(d)} ({periode(d.hVide).debut}) · {nomAffiche(d.absent)} absent·e
              </span>
            </div>
            <Pastilles controles={a.verif.controles} />
            {a.avantages.length > 0 && (
              <div className="pile" style={{ gap: 6 }}>
                {a.avantages.slice(0, 3).map((t) => (
                  <span key={t} className="avantage">
                    <Icon nom={t.startsWith('Attention') ? 'attention' : 'coche'} taille={16} epaisseur={2.2} />
                    {t}
                  </span>
                ))}
              </div>
            )}
            <button className={`bouton ${a.verif.ok ? 'bouton--prim' : 'bouton--sec'}`} onClick={() => ouvrir(d, a)}>
              {peutValider ? (a.verif.ok ? 'Examiner et décider' : 'Voir pourquoi et refuser') : 'Voir le détail'}
            </button>
          </article>
        ))}
      </section>

      <section className="pile pile--12" aria-label="Décisions récentes">
        <h2 className="titre-m">Décisions récentes</h2>
        {!ds.journal && (
          <div className="carte carte--grise">
            <span className="petit">
              Le motif des refus n'est pas encore gardé : il faut créer la liste facultative « Decisions » sur le site SharePoint (colonnes dans le
              README). En attendant, seules les validations apparaissent ici.
            </span>
          </div>
        )}
        {decisions.length === 0 && <p className="petit">Pas encore de décision.</p>}
        {decisions.map((x, i) => (
          <div key={x.id ?? i} className="carte" style={{ gap: 8, padding: 14 }}>
            <div className="rangee rangee--entre">
              <span className={`puce ${x.statut === 'Validé' ? 'puce--indigo' : 'puce--rose'}`}>{x.statut}</span>
              <span className="petit">{[x.par, moment(x.le)].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="titre-s">
              {x.classe} · {nomAffiche(x.prof)}
            </span>
            <span className="petit">
              {trajet(x)}
              {x.local ? ` · local ${x.local}` : ''}
            </span>
            {x.commentaire && <span className="texte">« {x.commentaire} »</span>}
          </div>
        ))}
      </section>

      <Feuille ouverte={!!sel} onFermer={fermer} titre="Examiner la proposition">
        {sel && (
          <>
            <span className="surtitre">Proposition de {nomAffiche(sel.d.prof)}</span>
            <h2 className="titre-l">
              {sel.d.classe} : {trajet(sel.d)}
            </h2>
            <p className="texte">
              {sel.a.verif.controles.find((c) => c.cle === 'absent')?.ok
                ? `${nomAffiche(sel.d.absent)} est absent·e en H${sel.d.hVide} (${periode(sel.d.hVide).debut} – ${periode(sel.d.hVide).fin}).`
                : `Proposée quand ${nomAffiche(sel.d.absent)} était noté·e absent·e en H${sel.d.hVide} (${periode(sel.d.hVide).debut} – ${periode(sel.d.hVide).fin}).`}
              {sel.a.matiere ? ` Cours : ${sel.a.matiere}.` : ''}
            </p>

            <h3 className="titre-s">Contrôles, revérifiés maintenant</h3>
            <ul className="controles">
              {sel.a.verif.controles.map((c) => (
                <li key={c.cle} className={c.ok ? '' : 'controle--ko'}>
                  <Icon nom={c.ok ? 'coche' : 'fermer'} taille={16} epaisseur={2.4} />
                  <span>
                    <b>{c.libelle}</b>
                    {c.detail ? ` · ${c.detail}` : ''}
                  </span>
                </li>
              ))}
            </ul>

            {sel.a.avantages.length > 0 && (
              <>
                <h3 className="titre-s">Pour {nomAffiche(sel.d.prof)}</h3>
                {sel.a.avantages.map((t) => (
                  <span key={t} className="avantage">
                    <Icon nom={t.startsWith('Attention') ? 'attention' : 'coche'} taille={16} epaisseur={2.2} />
                    {t}
                  </span>
                ))}
              </>
            )}

            {fait ? (
              <div className="carte carte--grise" role="status">
                <span className="titre-s">
                  {fait.statut === 'Validé' ? `Validé${fait.local ? ` · local ${fait.local} réservé` : ''}` : 'Refusé : la proposition est retirée'}
                </span>
                <span className="petit fort">Ensuite</span>
                {aPrevenir(fait.d, fait.statut).map((p) => (
                  <span key={p.qui} className="avantage">
                    <Icon nom={p.auto ? 'coche' : 'horloge'} taille={16} epaisseur={2.2} />
                    <span>
                      <b>{p.qui}</b> {p.comment}
                    </span>
                  </span>
                ))}
                {!fait.journalOk && <span className="petit">Décision appliquée, mais pas notée au journal (liste « Decisions » : colonne manquante ?).</span>}
                <div className="rangee enrouler">
                  {(() => {
                    const qui = fait.statut === 'Validé' ? [fait.d.prof, fait.d.absent] : [fait.d.prof];
                    const avec = qui.filter((p) => ds.profs.some((x) => x.nom === p && x.email));
                    if (!avec.length) return null;
                    const message =
                      fait.statut === 'Validé'
                        ? `Bonjour, le déplacement de la ${fait.d.classe} est validé : ${trajet(fait.d)} (${periode(fait.d.hVide).debut})${fait.local ? `, local ${fait.local}` : ''}.${commentaire.trim() ? ` ${commentaire.trim()}` : ''}`
                        : `Bonjour ${nomAffiche(fait.d.prof)}, ta proposition pour la ${fait.d.classe} (${trajet(fait.d)}) n'est pas retenue : ${commentaire.trim()}`;
                    return (
                      <button
                        className="bouton bouton--sec bouton--petit"
                        onClick={() =>
                          ouvrirTeams({
                            type: 'teams-chat',
                            emails: avec.map((p) => ds.profs.find((x) => x.nom === p)!.email!),
                            noms: avec.map(nomAffiche),
                            message,
                            sujet: `Déplacement ${fait.d.classe}`,
                          })
                        }
                      >
                        <Icon nom="message" taille={16} /> Prévenir sur Teams
                      </button>
                    );
                  })()}
                  {fait.statut === 'Validé' && (
                    <a className="bouton bouton--sec bouton--petit" href="#/publier" onClick={fermer}>
                      <Icon nom="haut_parleur" taille={16} /> Publier pour les élèves
                    </a>
                  )}
                </div>
                <button className="bouton bouton--prim" onClick={fermer}>OK</button>
              </div>
            ) : peutValider ? (
              <>
                <label className="pile pile--8">
                  <span className="titre-s">Un mot pour {nomAffiche(sel.d.prof)}</span>
                  <textarea
                    className="champ"
                    rows={3}
                    maxLength={250}
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    placeholder={sel.a.verif.ok ? 'Facultatif pour valider, obligatoire pour refuser' : 'Explique pourquoi (obligatoire pour refuser)'}
                  />
                </label>
                {erreur && (
                  <p className="texte" role="alert" style={{ color: 'var(--rose-encre)' }}>
                    {erreur}
                  </p>
                )}
                <div className="rangee">
                  <button className="bouton bouton--sec grandit" disabled={!motifOk || !!envoi} onClick={() => void agir('Refusé')}>
                    {envoi === 'Refusé' ? 'Envoi…' : 'Refuser'}
                  </button>
                  <button className="bouton bouton--prim grandit" disabled={!sel.a.verif.ok || !!envoi} onClick={() => void agir('Validé')}>
                    {envoi === 'Validé' ? 'Envoi…' : 'Valider'}
                  </button>
                </div>
                <span className="petit">
                  {!motifOk ? 'Pour refuser, écris au moins quelques mots : le prof les verra. ' : ''}
                  {sel.a.verif.ok
                    ? sel.a.verif.localChange
                      ? `En validant, le local ${sel.a.verif.local} est réservé à la place de ${sel.a.verif.localPrevu}.`
                      : 'Tout est revérifié juste avant d’enregistrer.'
                    : 'Un contrôle bloque : cette proposition ne peut plus être validée telle quelle.'}
                </span>
              </>
            ) : (
              <p className="petit">{demo ? 'Passe dans l’espace Éducateur (bouton en haut de l’écran) pour décider.' : 'Lecture seule : la décision revient à l’éducateur ou au secrétariat.'}</p>
            )}
          </>
        )}
      </Feuille>
    </section>
  );
}


function Pastilles({ controles }: { controles: Controle[] }) {
  const visibles = controles.filter((c) => PRINCIPAUX.includes(c.cle) || !c.ok);
  return (
    <div className="rangee enrouler" style={{ gap: 6 }}>
      {visibles.map((c) => (
        <span key={c.cle} className={`puce ${c.ok ? 'puce--ok' : 'puce--ko'}`} title={c.detail}>
          <Icon nom={c.ok ? 'coche' : 'fermer'} taille={14} epaisseur={2.4} />
          {c.libelle}
          {c.cle === 'local' && c.ok && c.detail ? ' (changé)' : ''}
        </span>
      ))}
    </div>
  );
}

