// L'écran de Décale : ce que tu peux gagner, ta semaine avant/après, le plan à proposer, tes
// demandes et toutes les heures libérées de tes classes (avec le pourquoi).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { Deplacement } from '../data/types';
import { JOURS, JOURS_COURTS, conge, deIso, dureeTxt, jourSemaineIso, periode, plusJoursIso } from '../lib/calendar';
import { coursDuProf, nomAffiche } from '../logic/horaire';
import { moment as quandTxt } from '../logic/suivi';
import {
  PRIORITES_DEFAUT,
  accroche,
  accrocheEffets,
  bilanDemandes,
  effetsSeul,
  gainTexte,
  heuresLiberees,
  horizon,
  meilleursPlans,
  occasions,
  phrasesJour,
  planDe,
  semaines,
  titrePlan,
  urgence,
  verifierPlan,
  vontEnsemble,
  type HeureLiberee,
  type Occasion,
  type Phrase,
  type Priorites,
} from './moteur';
import { Semaine, type Vue } from './Semaine';
import { Volet } from './Volet';
import { Icone } from './Icones';
import { appliquerTheme, themeChoisi, themeSysteme, type ThemeDecale } from './theme';

const CLE_PRIORITES = 'decale-priorites';

function lirePriorites(): Priorites {
  try {
    const p = JSON.parse(localStorage.getItem(CLE_PRIORITES) ?? 'null');
    if (p && typeof p.finTot === 'boolean' && typeof p.debutTard === 'boolean' && typeof p.fourches === 'boolean') return p;
  } catch {
    /* rien */
  }
  return PRIORITES_DEFAUT;
}

const jc = (date: string) => `${JOURS_COURTS[jourSemaineIso(date)].toLowerCase()}. ${deIso(date).getDate()}`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const trajet = (o: { dateO: string; hO: number; date: string; h: number }) => `${jc(o.dateO)} H${o.hO} → ${jc(o.date)} H${o.h}`;

type VoletOuvert =
  | { type: 'trou'; date: string; h: number }
  | { type: 'cours'; date: string; h: number }
  | { type: 'retirer'; d: Deplacement }
  | { type: 'probleme'; textes: string[] }
  | null;

export function Decale() {
  const store = useStore();
  const { ds, demo, simulation, aujourdhui, heurePassee, minutes, proposer, retirer, decider, montrerToast, toast, erreur, peutValider } = store;
  const [semaine, setSemaine] = useState<0 | 1>(0);
  const [vue, setVue] = useState<Vue>('avant');
  const [prios, setPrios] = useState<Priorites>(lirePriorites);
  const [choix, setChoix] = useState(0);
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [ajouts, setAjouts] = useState<Occasion[]>([]);
  const [volet, setVolet] = useState<VoletOuvert>(null);
  const [envoi, setEnvoi] = useState(false);
  const [theme, setTheme] = useState<ThemeDecale>(() => themeChoisi() ?? themeSysteme());

  useEffect(() => {
    appliquerTheme(theme, false);
  }, [theme]);

  const moi = ds?.moi.nom ?? '';
  const prof = !!ds && ds.cours.some((c) => c.prof === moi);
  const joursH = useMemo(() => horizon(aujourdhui), [aujourdhui]);
  const occ = useMemo(() => (ds && prof ? occasions(ds, moi, joursH, aujourdhui, heurePassee) : []), [ds, prof, moi, joursH, aujourdhui, heurePassee]);
  const plans = useMemo(() => (ds && prof ? meilleursPlans(ds, moi, occ, prios) : []), [ds, prof, moi, occ, prios]);
  const clesPlans = plans.map((p) => p.cle).join('|');

  // Les plans changent (une demande envoyée, une absence de plus) : on repart du meilleur.
  useEffect(() => {
    setChoix(0);
    setExclus(new Set());
    setAjouts([]);
  }, [clesPlans]);

  const base = plans[choix] ?? null;
  const sel = useMemo(() => [...(base?.deplacements ?? []).filter((o) => !exclus.has(o.cle)), ...ajouts], [base, exclus, ajouts]);
  const plan = useMemo(() => (ds ? planDe(ds, moi, sel, prios) : null), [ds, moi, sel, prios]);
  const modifie = exclus.size > 0 || ajouts.length > 0;
  const heures = useMemo(() => (ds && prof ? heuresLiberees(ds, moi, joursH, aujourdhui, heurePassee, occ, plan) : []), [ds, prof, moi, joursH, aujourdhui, heurePassee, occ, plan]);

  const [s1, s2] = semaines(aujourdhui);
  const lundi = semaine === 0 ? s1 : s2;
  const jours = [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n));
  const cleJours = jours.join();
  const cours = useMemo(() => new Map(cleJours.split(',').map((d) => [d, ds && prof ? coursDuProf(ds, moi, d, true) : []])), [ds, prof, moi, cleJours]);
  const origine = useMemo(
    () => new Map(cleJours.split(',').map((d) => [d, ds && !conge(deIso(d)) ? ds.cours.filter((c) => c.prof === moi && c.jour === jourSemaineIso(d)).map((c) => c.h) : []])),
    [ds, moi, cleJours],
  );
  const demandesSemaine = useMemo(
    () => (ds ? ds.deplacements.filter((d) => d.prof === moi && d.statut !== 'Refusé' && (cleJours.includes(d.dateOrigine) || cleJours.includes(d.date))) : []),
    [ds, moi, cleJours],
  );
  const acquis = useMemo(() => (ds && prof ? bilanDemandes(ds, moi, joursH) : []), [ds, prof, moi, joursH]);
  const trousSemaine = heures.filter((x) => jours.includes(x.date) && x.etat !== 'non');
  const planTouche = (l: string) => sel.some((o) => [o.date, o.dateO].some((d) => d >= l && d < plusJoursIso(l, 7)));

  const changerPrios = (p: Priorites) => {
    setPrios(p);
    try {
      localStorage.setItem(CLE_PRIORITES, JSON.stringify(p));
    } catch {
      /* rien */
    }
  };

  const basculerTheme = () => {
    const t = theme === 'veillee' ? 'cahier' : 'veillee';
    setTheme(t);
    appliquerTheme(t, true);
  };

  const ajouter = useCallback(
    (o: Occasion) => {
      // Ce qui entre en conflit (même cours de départ ou même heure d'arrivée) sort du plan.
      const gene = sel.filter((x) => !vontEnsemble(x, o));
      setExclus((e) => new Set([...e, ...gene.filter((x) => base?.deplacements.some((y) => y.cle === x.cle)).map((x) => x.cle)].filter((k) => k !== o.cle)));
      setAjouts((a) => [...a.filter((x) => !gene.includes(x)), ...(base?.deplacements.some((y) => y.cle === o.cle) ? [] : [o])]);
      setVolet(null);
      setVue('avant');
    },
    [sel, base],
  );

  const enlever = useCallback(
    (o: Occasion) => {
      if (ajouts.some((x) => x.cle === o.cle)) setAjouts((a) => a.filter((x) => x.cle !== o.cle));
      else setExclus((e) => new Set([...e, o.cle]));
    },
    [ajouts],
  );

  const remettre = useCallback((o: Occasion) => setExclus((e) => new Set([...e].filter((k) => k !== o.cle))), []);

  async function proposerPlan() {
    if (!ds || !plan) return;
    const problemes = verifierPlan(ds, moi, plan, aujourdhui, heurePassee);
    if (problemes.length) {
      setVolet({ type: 'probleme', textes: problemes });
      return;
    }
    setEnvoi(true);
    let n = 0;
    try {
      for (const o of plan.deplacements) {
        await proposer({ absent: o.absent, date: o.date, hVide: o.h, classe: o.classe, hOrigine: o.hO, dateOrigine: o.dateO });
        n++;
      }
      montrerToast(n > 1 ? `${n} demandes envoyées. L’éducateur valide, sa réponse arrive ici.` : 'Demande envoyée. L’éducateur valide, sa réponse arrive ici.');
      setVue('avant');
    } catch (e) {
      montrerToast(`${n ? `${n} envoyée${n > 1 ? 's' : ''}, puis ` : ''}impossible d’enregistrer : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  if (!ds)
    return (
      <main className="attente" aria-busy={!erreur}>
        <p className="marque">Décale</p>
        {erreur ? (
          <>
            <p>Connexion à SharePoint impossible : {erreur}</p>
            <a className="bouton" href="../#/connexion">
              Voir les détails dans Be Happi
            </a>
          </>
        ) : (
          <p className="crayon">Chargement de ton horaire…</p>
        )}
      </main>
    );

  const prenom = ds.moi.prenom || nomAffiche(moi);

  if (!prof)
    return (
      <main className="attente">
        <p className="marque">Décale</p>
        <p>Décale est fait pour les profs qui ont un horaire : ton nom n’est pas dans la liste Horaires.</p>
        <a className="bouton" href="../">
          Ouvrir Be Happi
        </a>
      </main>
    );

  const congeEnCours = conge(deIso(aujourdhui));
  const dejaGagne = accrocheEffets(acquis);
  const enAttente = ds.deplacements.some((d) => d.prof === moi && d.statut === 'En attente' && d.date >= aujourdhui);
  const possibles = heures.filter((x) => x.etat === 'possible').length;
  const urgent = plan?.deplacements.map((o) => ({ o, reste: urgence(o.date, o.h, aujourdhui, minutes) })).find((x) => x.reste !== null);
  const n = plan?.deplacements.length ?? 0;

  return (
    <div className="decale">
      <header className="entete">
        <div className="entete-gauche">
          <p className="marque">Décale</p>
          <p className="crayon qui">
            {prenom}
            {(demo || simulation) && (
              <a className="pastille" href="../#/connexion" title={demo ? 'Données inventées : relie l’app à ton école dans Be Happi' : 'Copie locale des vraies données'}>
                {demo ? 'Démo' : 'Simulation'}
              </a>
            )}
          </p>
        </div>
        <div className="entete-droite">
          <button className="rond" onClick={basculerTheme} aria-label={theme === 'veillee' ? 'Passer au papier clair' : 'Passer au papier sombre'}>
            <Icone nom={theme === 'veillee' ? 'soleil' : 'lune'} />
          </button>
          <a className="lien-discret" href="../">
            Be Happi
          </a>
        </div>
      </header>

      <main className="page">
        <section className="colonne-semaine" aria-label="Ta semaine">
          <div className="accroche">
            {congeEnCours && <p className="crayon">{congeEnCours.nom} : Décale regarde déjà la rentrée.</p>}
            {plan ? (
              <>
                <h1>{accroche(plan)}.</h1>
                <p className="sous-titre">
                  {plan.gain - plan.perte > 0 ? (
                    <>
                      <span className="main gain">{gainTexte(plan)}</span> gagnées, en {n} déplacement{n > 1 ? 's' : ''}
                      {plan.perte > 0 ? ` (dont ${dureeTxt(plan.perte)} de plus ailleurs)` : ''}.
                    </>
                  ) : (
                    <>
                      En {n} déplacement{n > 1 ? 's' : ''}, sans rien perdre.
                    </>
                  )}
                </p>
              </>
            ) : dejaGagne ? (
              <>
                <h1>Avec tes demandes : {dejaGagne.charAt(0).toLowerCase() + dejaGagne.slice(1)}.</h1>
                <p className="sous-titre">
                  {enAttente ? 'L’éducateur doit encore valider : tu le vois dans « Tes demandes ».' : 'Validé.'} Rien d’autre à gagner pour l’instant.
                </p>
              </>
            ) : (
              <>
                <h1>{possibles ? 'Rien à gagner pour l’instant.' : 'Rien à décaler pour l’instant.'}</h1>
                <p className="sous-titre">
                  {possibles
                    ? `${possibles} heure${possibles > 1 ? 's' : ''} libérée${possibles > 1 ? 's' : ''} de tes classes, mais les prendre allongerait tes journées. Le détail est plus bas.`
                    : 'Dès qu’un collègue de tes classes est noté absent, Décale calcule ici ce que tu peux y gagner.'}
                </p>
              </>
            )}
          </div>

          {plans.length > 1 && (
            <div className="plans" role="radiogroup" aria-label="Plans possibles">
              {plans.map((p, i) => (
                <button
                  key={p.cle}
                  role="radio"
                  aria-checked={i === choix}
                  className={`plan-choix${i === choix ? ' plan-choix--actif' : ''}`}
                  onClick={() => {
                    setChoix(i);
                    setExclus(new Set());
                    setAjouts([]);
                  }}
                >
                  <b>{titrePlan(p)}</b>
                  <span className="main gain">{p.gain - p.perte > 0 ? gainTexte(p) : 'pour tes élèves'}</span>
                </button>
              ))}
            </div>
          )}

          <div className="commandes">
            <div className="bascule" role="group" aria-label="Voir la semaine">
              <button aria-pressed={vue === 'avant'} onClick={() => setVue('avant')}>
                Maintenant
              </button>
              <button aria-pressed={vue === 'apres'} onClick={() => setVue('apres')} disabled={!plan}>
                Après le plan
              </button>
            </div>
            <div className="semaines" role="group" aria-label="Semaine">
              {[s1, s2].map((l, i) => (
                <button key={l} aria-pressed={semaine === i} onClick={() => setSemaine(i as 0 | 1)}>
                  {i === 0 ? 'Cette semaine' : `Semaine du ${deIso(l).getDate()}`}
                  {planTouche(l) && <span className="point-plan" aria-label=" (le plan y touche)" />}
                </button>
              ))}
            </div>
          </div>

          <Semaine
            jours={jours}
            aujourdhui={aujourdhui}
            heurePassee={heurePassee}
            cours={cours}
            origine={origine}
            demandes={demandesSemaine}
            trous={trousSemaine}
            plan={sel}
            vue={vue}
            onTrou={(date, h) => setVolet({ type: 'trou', date, h })}
            onCours={(date, h) => setVolet({ type: 'cours', date, h })}
          />
          <p className="legende crayon">
            <span className="leg leg--cours" /> tes cours <span className="leg leg--trou" /> heures libérées de tes classes <span className="leg leg--gagne" /> temps gagné
          </p>
        </section>

        <section className="colonne-plan" aria-label="Le plan">
          {plan && (
            <div className="bloc-plan">
              <h2>
                {n > 1 ? `Les ${n} déplacements` : 'Le déplacement'}
                {modifie && (
                  <button
                    className="lien-discret"
                    onClick={() => {
                      setExclus(new Set());
                      setAjouts([]);
                    }}
                  >
                    Revenir au plan proposé
                  </button>
                )}
              </h2>
              <ul className="deplacements">
                {[...(base?.deplacements ?? []), ...ajouts].map((o) => {
                  const garde = sel.some((x) => x.cle === o.cle);
                  return (
                    <li key={o.cle} className={garde ? '' : 'ecarte'}>
                      <div>
                        <b>
                          {o.classe} : {trajet(o)}
                        </b>
                        <span className="crayon">
                          à la place du cours de {nomAffiche(o.absent)}, local {o.local}
                          {o.localChange ? ` (${o.localPrevu} est pris)` : ''}
                        </span>
                      </div>
                      {garde ? (
                        <button className="lien-discret" onClick={() => enlever(o)} aria-label={`Retirer ${o.classe} ${trajet(o)} du plan`}>
                          Pas celui-ci
                        </button>
                      ) : (
                        <button className="lien-discret" onClick={() => remettre(o)}>
                          Remettre
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <h3>Ce que ça change</h3>
              <Phrases phrases={plan.effets.flatMap(phrasesJour)} />
              {plan.classes.length > 0 && (
                <>
                  <h3>Pour tes classes</h3>
                  <Phrases phrases={plan.classes.map((c) => ({ texte: c.texte, signe: c.signe }))} />
                </>
              )}
              {urgent && (
                <p className="note">
                  <Icone nom="horloge" taille={18} /> {capital(JOURS[jourSemaineIso(urgent.o.date)])} H{urgent.o.h}, c’est aujourd’hui, dans {dureeTxt(urgent.reste!)} : l’éducateur doit valider vite.
                </p>
              )}
              <div className="envoyer">
                <button className="bouton bouton--plein" disabled={envoi || !n} onClick={() => void proposerPlan()}>
                  {envoi ? 'Envoi…' : n > 1 ? `Proposer ces ${n} déplacements` : 'Proposer ce déplacement'}
                </button>
                <p className="crayon petit">L’éducateur valide chaque demande, dans Be Happi ou Power Apps. Tant qu’elle attend, tu peux la retirer.</p>
              </div>
            </div>
          )}

          <Demandes
            onRetirer={(d) => setVolet({ type: 'retirer', d })}
            onValiderDemo={
              demo
                ? async (d) => {
                    try {
                      await decider(d, 'Validé', '');
                      montrerToast('Validée (démo) : c’est ce que fait l’éducateur.');
                    } catch (e) {
                      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
                    }
                  }
                : undefined
            }
          />

          <section className="bloc-section" aria-labelledby="titre-prios">
            <h2 id="titre-prios">Ce qui compte pour toi</h2>
            <div className="prios">
              {(
                [
                  ['finTot', 'Finir plus tôt'],
                  ['debutTard', 'Commencer plus tard'],
                  ['fourches', 'Moins de fourches'],
                ] as const
              ).map(([k, libelle]) => (
                <button key={k} className="prio" aria-pressed={prios[k]} onClick={() => changerPrios({ ...prios, [k]: !prios[k] })}>
                  {prios[k] && <Icone nom="coche" taille={16} />}
                  {libelle}
                </button>
              ))}
            </div>
            <p className="crayon petit">Décale ne propose jamais un plan où tu perds au change, ni un jour de cours en plus.</p>
          </section>

          <Heures heures={heures} onOuvrir={(x) => setVolet({ type: 'trou', date: x.date, h: x.h })} />

          {peutValider && (
            <p className="crayon petit">
              Des demandes de collègues attendent peut-être ta validation :{' '}
              <a className="lien" href="../#/validations">
                Validations dans Be Happi
              </a>
            </p>
          )}
          <p className="crayon petit pied">Mêmes règles que Power Apps : exactement les mêmes classes, prof libre, jamais H5. Les demandes vont dans la liste Deplacements.</p>
        </section>
      </main>

      {plan && n > 0 && (
        <div className="barre-envoi" aria-hidden={volet !== null}>
          <span>
            <b className="main gain">{plan.gain - plan.perte > 0 ? gainTexte(plan) : ''}</b> {titrePlan(plan)}
          </span>
          <button className="bouton bouton--plein" disabled={envoi} onClick={() => void proposerPlan()}>
            {envoi ? 'Envoi…' : n > 1 ? `Proposer (${n})` : 'Proposer'}
          </button>
        </div>
      )}

      {volet?.type === 'trou' && (
        <VoletTrou date={volet.date} h={volet.h} heures={heures} sel={sel} onAjouter={ajouter} onEnlever={enlever} onFermer={() => setVolet(null)} />
      )}
      {volet?.type === 'cours' && (
        <VoletCours
          date={volet.date}
          h={volet.h}
          occ={occ}
          sel={sel}
          onAjouter={ajouter}
          onEnlever={enlever}
          onRetirer={(d) => setVolet({ type: 'retirer', d })}
          onFermer={() => setVolet(null)}
        />
      )}
      {volet?.type === 'retirer' && (
        <Volet titre="Retirer ta demande ?" sous={`${volet.d.classe} : ${jc(volet.d.dateOrigine)} H${volet.d.hOrigine} → ${jc(volet.d.date)} H${volet.d.hVide}`} onFermer={() => setVolet(null)}>
          <p>La demande disparaît de la liste, comme avec « Annuler » dans Power Apps. Ton cours reste à sa place.</p>
          <div className="rang">
            <button
              className="bouton bouton--plein"
              onClick={async () => {
                const d = volet.d;
                setVolet(null);
                try {
                  await retirer(d);
                  montrerToast('Demande retirée.');
                } catch (e) {
                  montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
                }
              }}
            >
              Retirer la demande
            </button>
            <button className="bouton" onClick={() => setVolet(null)}>
              Garder
            </button>
          </div>
        </Volet>
      )}
      {volet?.type === 'probleme' && (
        <Volet titre="Le plan ne passe plus" sous="Quelque chose a changé depuis le calcul" onFermer={() => setVolet(null)}>
          <ul className="phrases">
            {volet.textes.map((t) => (
              <li key={t} className="perte">
                <Icone nom="attention" taille={18} />
                {t}
              </li>
            ))}
          </ul>
          <button className="bouton" onClick={() => setVolet(null)}>
            Compris
          </button>
        </Volet>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Phrases({ phrases }: { phrases: Phrase[] }) {
  return (
    <ul className="phrases">
      {phrases.map((p, i) => (
        <li key={i} className={`ph-${p.signe}`}>
          <Icone nom={p.signe === 'gain' ? 'coche' : p.signe === 'perte' ? 'moins' : 'point'} taille={18} />
          {p.texte}
        </li>
      ))}
    </ul>
  );
}

function Demandes({ onRetirer, onValiderDemo }: { onRetirer: (d: Deplacement) => void; onValiderDemo?: (d: Deplacement) => void }) {
  const { ds, aujourdhui } = useStore();
  if (!ds) return null;
  const moi = ds.moi.nom;
  const attente = ds.deplacements.filter((d) => d.prof === moi && d.statut === 'En attente' && d.date >= aujourdhui).sort((a, b) => a.date.localeCompare(b.date) || a.hVide - b.hVide);
  const validees = ds.deplacements.filter((d) => d.prof === moi && d.statut !== 'En attente' && d.date >= aujourdhui).sort((a, b) => a.date.localeCompare(b.date) || a.hVide - b.hVide);
  const depuis = plusJoursIso(aujourdhui, -7);
  const refus = ds.decisions.filter((x) => x.statut === 'Refusé' && x.prof === moi && (x.le.slice(0, 10) >= depuis || x.date >= aujourdhui));
  const t = (d: { dateOrigine: string; hOrigine: number; date: string; hVide: number }) => `${jc(d.dateOrigine)} H${d.hOrigine} → ${jc(d.date)} H${d.hVide}`;
  return (
    <section className="bloc-section" aria-labelledby="titre-demandes">
      <h2 id="titre-demandes">Tes demandes</h2>
      {!attente.length && !validees.length && !refus.length ? (
        <p className="crayon">Aucune demande en cours.</p>
      ) : (
        <ul className="demandes">
          {attente.map((d) => (
            <li key={d.id ?? t(d)}>
              <span className="etat etat--attente">En attente</span>
              <div>
                <b>
                  {d.classe} : {t(d)}
                </b>
                <span className="crayon">Proposée {quandTxt(d.creeLe) || 'récemment'}</span>
              </div>
              <div className="rang">
                {onValiderDemo && (
                  <button className="lien-discret" onClick={() => onValiderDemo(d)}>
                    Faire valider (démo)
                  </button>
                )}
                <button className="lien-discret" onClick={() => onRetirer(d)}>
                  Retirer
                </button>
              </div>
            </li>
          ))}
          {validees.map((d) => (
            <li key={d.id ?? t(d)}>
              <span className="etat etat--valide">Validé</span>
              <div>
                <b>
                  {d.classe} : {t(d)}
                </b>
                <span className="crayon">{d.modifiePar ? `Par ${d.modifiePar}` : 'Confirmé'}</span>
              </div>
            </li>
          ))}
          {refus.map((x, i) => (
            <li key={`r-${i}`}>
              <span className="etat etat--refuse">Refusé</span>
              <div>
                <b>
                  {x.classe} : {t(x)}
                </b>
                <span className="crayon">{x.commentaire ? `« ${x.commentaire} »` : `Par ${x.par}`}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ETATS: Record<HeureLiberee['etat'], string> = {
  plan: 'Dans ton plan',
  possible: 'Possible',
  toi: 'Ta demande',
  prise: 'Reprise',
  non: 'Pas pour toi',
};

function Heures({ heures, onOuvrir }: { heures: HeureLiberee[]; onOuvrir: (x: HeureLiberee) => void }) {
  const parJour = new Map<string, HeureLiberee[]>();
  for (const x of heures) parJour.set(x.date, [...(parJour.get(x.date) ?? []), x]);
  return (
    <section className="bloc-section" aria-labelledby="titre-heures">
      <h2 id="titre-heures">Les heures libérées de tes classes</h2>
      {!heures.length ? (
        <p className="crayon">Aucune pour l’instant, sur deux semaines.</p>
      ) : (
        [...parJour].map(([date, xs]) => (
          <div key={date} className="jour-heures">
            <h3>
              {capital(JOURS[jourSemaineIso(date)])} {deIso(date).getDate()}
            </h3>
            <ul className="heures">
              {xs.map((x) => (
                <li key={x.cle}>
                  <button onClick={() => onOuvrir(x)}>
                    <span className="h">
                      <b>H{x.h}</b>
                      <span>{periode(x.h).debut}</span>
                    </span>
                    <span className="quoi">
                      <b>{x.classe}</b>
                      <span className="crayon">cours de {nomAffiche(x.absent)}</span>
                    </span>
                    <span className={`etat etat--${x.etat}`}>{x.etat === 'prise' ? `Reprise par ${x.par}` : ETATS[x.etat]}</span>
                    {x.raison && x.etat !== 'prise' && <span className="raison crayon">{x.raison}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function VoletTrou({
  date,
  h,
  heures,
  sel,
  onAjouter,
  onEnlever,
  onFermer,
}: {
  date: string;
  h: number;
  heures: HeureLiberee[];
  sel: Occasion[];
  onAjouter: (o: Occasion) => void;
  onEnlever: (o: Occasion) => void;
  onFermer: () => void;
}) {
  const ici = heures.filter((x) => x.date === date && x.h === h);
  const p = periode(h);
  return (
    <Volet titre={`${capital(JOURS[jourSemaineIso(date)])} ${deIso(date).getDate()}, H${h}`} sous={`${p.debut} à ${p.fin}, heure libérée`} onFermer={onFermer}>
      {!ici.length && <p className="crayon">Pas d’heure libérée de tes classes ici.</p>}
      {ici.map((x) => (
        <div key={x.cle} className="volet-bloc">
          <p>
            <b>{x.classe}</b>, cours de {x.matiere.toLowerCase()} de {nomAffiche(x.absent)} (absent·e), local {x.local}.
          </p>
          {x.raison && !x.options.length && <p className="crayon">{x.raison}</p>}
          {x.options.map((o) => (
            <OptionVolet key={o.cle} titre={`Ton cours de ${jc(o.dateO)} H${o.hO}`} o={o} dans={sel.some((y) => y.cle === o.cle)} onAjouter={onAjouter} onEnlever={onEnlever} />
          ))}
        </div>
      ))}
    </Volet>
  );
}

function VoletCours({
  date,
  h,
  occ,
  sel,
  onAjouter,
  onEnlever,
  onRetirer,
  onFermer,
}: {
  date: string;
  h: number;
  occ: Occasion[];
  sel: Occasion[];
  onAjouter: (o: Occasion) => void;
  onEnlever: (o: Occasion) => void;
  onRetirer: (d: Deplacement) => void;
  onFermer: () => void;
}) {
  const { ds } = useStore();
  if (!ds) return null;
  const c = coursDuProf(ds, ds.moi.nom, date, true).find((x) => x.h === h);
  const p = periode(h);
  const vers = occ.filter((o) => o.dateO === date && o.hO === h);
  const demande = c?.deplace ? ds.deplacements.find((d) => d.prof === ds.moi.nom && d.date === date && d.hVide === h && d.dateOrigine === c.deplace!.date && d.hOrigine === c.deplace!.h) : undefined;
  return (
    <Volet titre={`${c?.classe ?? 'Cours'}, ${JOURS[jourSemaineIso(date)]} ${deIso(date).getDate()} H${h}`} sous={`${p.debut} à ${p.fin}${c?.local ? `, local ${c.local}` : ''}`} onFermer={onFermer}>
      {demande ? (
        <div className="volet-bloc">
          <p>
            Ce cours vient de {jc(demande.dateOrigine)} H{demande.hOrigine} : {demande.statut === 'Validé' ? 'déplacement validé.' : 'demande en attente de l’éducateur.'}
          </p>
          {demande.statut === 'En attente' && (
            <button className="bouton" onClick={() => onRetirer(demande)}>
              Retirer la demande
            </button>
          )}
        </div>
      ) : !vers.length ? (
        <p className="crayon">Ce cours ne peut aller dans aucune heure libérée pour l’instant.</p>
      ) : (
        <>
          <p>Il peut aller :</p>
          {vers.map((o) => (
            <OptionVolet key={o.cle} titre={`${jc(o.date)} H${o.h}, à la place de ${nomAffiche(o.absent)}`} o={o} dans={sel.some((y) => y.cle === o.cle)} onAjouter={onAjouter} onEnlever={onEnlever} />
          ))}
        </>
      )}
    </Volet>
  );
}

/** Un déplacement possible, dans un volet : ce qu'il change pour toi, et l'ajouter au plan. */
function OptionVolet({ titre, o, dans, onAjouter, onEnlever }: { titre: string; o: Occasion; dans: boolean; onAjouter: (o: Occasion) => void; onEnlever: (o: Occasion) => void }) {
  const { ds } = useStore();
  if (!ds) return null;
  const phrases = effetsSeul(ds, ds.moi.nom, o);
  const coute = phrases.length > 0 && phrases.every((p) => p.signe === 'perte');
  return (
    <div className="option">
      <div>
        <b>{titre}</b>
        {phrases.length ? <Phrases phrases={phrases} /> : <p className="crayon">Rien ne change pour toi : seulement pour la classe.</p>}
      </div>
      {dans ? (
        <button className="bouton" onClick={() => onEnlever(o)}>
          Retirer du plan
        </button>
      ) : (
        <button className={`bouton${coute ? '' : ' bouton--plein'}`} onClick={() => onAjouter(o)}>
          {coute ? 'Ajouter quand même' : 'Ajouter au plan'}
        </button>
      )}
    </div>
  );
}
