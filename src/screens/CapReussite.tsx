// Cap Réussite : une remédiation au lieu de l'étude.
// - Prof : ses heures en fourche où des élèves à l'étude attendent (demande, ou échec au bulletin), sa feuille.
// - Élève : ses heures d'étude, « je suis disponible » dans une matière, ce qu'il a demandé.
// - Vie scolaire et direction : où sont les élèves en remédiation aujourd'hui, la feuille de prestations.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { Resultat, SeanceCR } from '../data/types';
import { Entete } from '../ui/Entete';
import { Feuille } from '../ui/Feuille';
import { Icon } from '../ui/Icon';
import { JOURS, deIso, dureeTxt, jourSemaineIso, periode } from '../lib/calendar';
import { telecharger } from '../lib/ics';
import { lien } from '../lib/route';
import { nomAffiche } from '../logic/horaire';
import { toutesLesClasses } from '../logic/ouest';
import {
  MINUTES_SEANCE, demandesEleve, etudesEleve, famille, feuilleCsv, matieresClasse, matieresDe, moisDisponibles, nomMois,
  occasionsProf, poidsOccasion, seances, totauxMois, type Occasion, type Seance,
} from '../logic/capreussite';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function quand(date: string, h: number, aujourdhui: string): string {
  const d = deIso(date);
  const jour = date === aujourdhui ? "Aujourd'hui" : `${capital(JOURS[jourSemaineIso(date)])} ${d.getDate()}/${d.getMonth() + 1}`;
  return `${jour} · H${h} · ${periode(h).debut}`;
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function CapReussite() {
  const { ds, profil } = useStore();
  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  if (profil === 'eleve') return <VueEleve />;
  if (profil === 'prof') return <VueProf />;
  return <VueSuivi />;
}

/** La liste n'existe pas encore sur le site : on l'explique au lieu d'échouer. */
function SansListe() {
  return (
    <div className="carte carte--grise">
      <span className="titre-s">Cap Réussite n’est pas encore activé</span>
      <p className="texte">La liste « CapReussite » n’existe pas sur le site SharePoint. Dès que l’IT l’aura créée (voir la notice), tout fonctionnera ici.</p>
    </div>
  );
}

// ——— Prof ———

type OngletProf = 'prendre' | 'seances' | 'feuille';

function VueProf() {
  const { ds, demo, aujourdhui, heurePassee, heureFinie } = useStore();
  const [onglet, setOnglet] = useState<OngletProf>('prendre');
  const [ouverte, setOuverte] = useState<Occasion | null>(null);
  const moi = ds!.moi.nom;
  const sansListe = !demo && ds!.absentes.includes('capReussite');
  const sansBulletins = !demo && ds!.absentes.includes('resultats');
  const occasions = useMemo(
    () => occasionsProf(ds!, moi, aujourdhui, heurePassee).sort((a, b) => a.date.localeCompare(b.date) || a.h - b.h),
    [ds, moi, aujourdhui, heurePassee],
  );
  const mes = useMemo(() => seances(ds!, aujourdhui, heureFinie).filter((s) => s.prof === moi), [ds, moi, aujourdhui, heureFinie]);
  const aVenir = mes.filter((s) => !s.faite);
  const attendent = occasions.reduce((n, o) => n + o.demandes.length, 0);

  return (
    <section className="ecran" aria-label="Cap Réussite">
      <Entete titre="Cap Réussite" sous="Une remédiation au lieu de l’étude" />
      <div className="seg" role="group" aria-label="Afficher">
        <button aria-pressed={onglet === 'prendre'} onClick={() => setOnglet('prendre')}>À prendre{attendent ? ` · ${attendent}` : ''}</button>
        <button aria-pressed={onglet === 'seances'} onClick={() => setOnglet('seances')}>Mes séances{aVenir.length ? ` · ${aVenir.length}` : ''}</button>
        <button aria-pressed={onglet === 'feuille'} onClick={() => setOnglet('feuille')}>Ma feuille</button>
      </div>

      {sansListe && <SansListe />}

      {onglet === 'prendre' && (
        <>
          <p className="texte">Tes heures de fourche où des élèves sont à l’étude. Ceux qui se sont dits disponibles dans ta matière d’abord.</p>
          {occasions.length === 0 && (
            <div className="carte carte--grise">
              <span className="titre-s">Rien à prendre ces jours-ci</span>
              <p className="texte">Aucune heure d’étude ne tombe dans tes fourches des 5 prochains jours de cours. Dès qu’une absence est encodée ou qu’un élève se dit disponible, ça apparaît ici.</p>
            </div>
          )}
          {occasions.map((o) => (
            <button key={`${o.date}-${o.h}`} className="carte carte--lien carte--colonne" style={{ gap: 6 }} onClick={() => setOuverte(o)} disabled={sansListe}>
              <span className="rangee rangee--entre">
                <span className="sous-titre">{quand(o.date, o.h, aujourdhui)}</span>
                {poidsOccasion(o) >= 3 && <span className="puce puce--orange">Demandé</span>}
              </span>
              <span className="titre-s">
                {[
                  o.demandes.length ? `${pluriel(o.demandes.length, 'élève')} disponible${o.demandes.length > 1 ? 's' : ''}` : '',
                  o.echecs.length ? `${o.echecs.length} en difficulté` : '',
                  !o.demandes.length && !o.echecs.length ? `${pluriel(o.classes.length, 'classe')} à l’étude` : '',
                ].filter(Boolean).join(' · ')}
              </span>
              <span className="petit">
                {[...new Set([...o.demandes.map((d) => d.classe), ...o.echecs.map((e) => e.resultat.classe), ...o.classes.map((c) => c.classe)])].join(', ')} · tu es en fourche
              </span>
            </button>
          ))}
          {sansBulletins && <p className="petit">Les élèves en échec seront proposés quand la liste « Resultats » (export des bulletins) sera disponible.</p>}
        </>
      )}

      {onglet === 'seances' && <MesSeances liste={aVenir} />}
      {onglet === 'feuille' && <FeuilleProf liste={mes} />}

      {ouverte && <PrendreFeuille occasion={ouverte} onFermer={() => setOuverte(null)} />}
    </section>
  );
}

function PrendreFeuille({ occasion: o, onFermer }: { occasion: Occasion; onFermer: () => void }) {
  const { ds, aujourdhui, prendreRemediation, montrerToast, ouvrirTeams } = useStore();
  const moi = ds!.moi.nom;
  const mesMatieres = matieresDe(ds!, moi);
  const cleE = (r: Resultat) => `${r.eleve}|${r.classe}|${r.matiere}`;
  const [demandes, setDemandes] = useState<SeanceCR[]>(o.demandes);
  const [echecs, setEchecs] = useState<string[]>([]);
  const [classe, setClasse] = useState<string>('');
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<{ local: string; mails: string[]; noms: string[] } | null>(null);
  const echecsChoisis = o.echecs.map((e) => e.resultat).filter((r) => echecs.includes(cleE(r)));
  const nb = demandes.length + echecsChoisis.length;
  // La matière : celle des demandes, sinon celle de mes cours la plus proche des élèves choisis.
  const matiere =
    demandes[0]?.matiere ??
    echecsChoisis[0]?.matiere ??
    mesMatieres.find((m) => o.classes.some((c) => c.classe === classe && famille(c.matiere) === famille(m))) ??
    mesMatieres[0] ??
    '';

  const basculer = <T,>(liste: T[], x: T, poser: (l: T[]) => void) => poser(liste.includes(x) ? liste.filter((y) => y !== x) : [...liste, x]);

  async function prendre() {
    setEnvoi(true);
    try {
      const local = await prendreRemediation({ date: o.date, h: o.h, matiere, demandes: classe ? [] : demandes, echecs: classe ? [] : echecsChoisis, classes: classe ? [classe] : [] });
      const eleves = classe ? [] : [...demandes.map((d) => ({ mail: d.eleveMail, nom: d.eleve ?? '' })), ...echecsChoisis.map((r) => ({ mail: r.eleveMail, nom: r.eleve }))];
      setFait({ local, mails: eleves.map((e) => e.mail ?? '').filter(Boolean), noms: eleves.map((e) => e.nom) });
      montrerToast(classe ? `C’est noté : la ${classe} te rejoint en ${local}` : `C’est noté : ${pluriel(nb, 'élève')} en ${local}`);
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  if (fait) {
    return (
      <Feuille ouverte onFermer={onFermer} titre="Séance prise">
        <span className="sous-titre">{quand(o.date, o.h, aujourdhui)}</span>
        <h2 className="titre-l">C’est noté, en {fait.local}</h2>
        <p className="texte">Le local est réservé et la séance est ajoutée à ta feuille de prestations ({MINUTES_SEANCE} min).</p>
        {fait.mails.length > 0 && (
          <button
            className="bouton bouton--prim"
            onClick={() =>
              ouvrirTeams({
                type: 'teams-chat',
                emails: fait.mails,
                noms: fait.noms,
                sujet: 'Cap Réussite',
                message: `Bonjour, je te prends en remédiation (${matiere.toLowerCase()}) ${quand(o.date, o.h, aujourdhui).toLowerCase()}, en ${fait.local}, au lieu de l’étude. À tout à l’heure !`,
              })
            }
          >
            <Icon nom="message" taille={18} /> Prévenir {fait.mails.length > 1 ? `les ${fait.mails.length} élèves` : 'l’élève'} sur Teams
          </button>
        )}
        {!fait.mails.length && <p className="petit">La classe sera annoncée « remédiation » à la prochaine publication pour les élèves.</p>}
        <button className="bouton bouton--sec" onClick={onFermer}>Fermer</button>
      </Feuille>
    );
  }

  return (
    <Feuille ouverte onFermer={onFermer} titre="Prendre en remédiation">
      <span className="sous-titre">{quand(o.date, o.h, aujourdhui)}</span>
      <h2 className="titre-l">Qui prends-tu ?</h2>

      {o.demandes.length > 0 && (
        <>
          <span className="petit fort">Ils se sont dits disponibles</span>
          <div className="liste-choix" role="group" aria-label="Élèves disponibles">
            {o.demandes.map((d) => {
              const on = !classe && demandes.includes(d);
              return (
                <button key={d.id ?? `${d.eleveMail}`} className="ligne-choix" role="checkbox" aria-checked={on} onClick={() => { setClasse(''); basculer(demandes, d, setDemandes); }}>
                  <span className="case-a-cocher" aria-hidden="true">{on && <Icon nom="coche" taille={14} epaisseur={3} />}</span>
                  <span className="pile grandit">
                    <span className="fort">{d.eleve}</span>
                    <span className="petit">{d.classe} · {d.matiere}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {o.echecs.length > 0 && (
        <>
          <span className="petit fort">Proposés par l’app : en difficulté dans ta matière</span>
          <div className="liste-choix" role="group" aria-label="Élèves en difficulté">
            {o.echecs.map((e) => {
              const on = !classe && echecs.includes(cleE(e.resultat));
              return (
                <button key={cleE(e.resultat)} className="ligne-choix" role="checkbox" aria-checked={on} onClick={() => { setClasse(''); basculer(echecs, cleE(e.resultat), setEchecs); }}>
                  <span className="case-a-cocher" aria-hidden="true">{on && <Icon nom="coche" taille={14} epaisseur={3} />}</span>
                  <span className="pile grandit">
                    <span className="fort">{e.resultat.eleve}</span>
                    <span className="petit">{e.resultat.classe} · {e.texte}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {o.classes.length > 0 && (
        <>
          <span className="petit fort">Ou une classe entière à l’étude</span>
          <div className="liste-choix" role="radiogroup" aria-label="Classes à l'étude">
            {o.classes.map((c) => (
              <button key={c.classe} className="ligne-choix" role="radio" aria-checked={classe === c.classe} onClick={() => setClasse(classe === c.classe ? '' : c.classe)}>
                <span className="case-a-cocher" aria-hidden="true">{classe === c.classe && <Icon nom="coche" taille={14} epaisseur={3} />}</span>
                <span className="pile grandit">
                  <span className="fort">{c.classe}</span>
                  <span className="petit">Cours prévu : {c.matiere || 'cours'}{c.mienne ? ' · ta classe' : ''}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <button className="bouton bouton--prim" disabled={envoi || (!classe && !nb)} onClick={() => void prendre()}>
        {envoi ? 'Un instant…' : classe ? `Prendre la ${classe}` : nb ? `Prendre ${nb > 1 ? `ces ${nb} élèves` : 'cet élève'}` : 'Choisis qui tu prends'}
      </button>
      <p className="petit">La Tour réserve un local libre près de tes cours et note la séance sur ta feuille. Des élèves seuls ne changent rien pour le reste de leur classe, qui reste à l’étude.</p>
    </Feuille>
  );
}

function MesSeances({ liste }: { liste: Seance[] }) {
  const { aujourdhui, annulerSeance, montrerToast } = useStore();
  if (!liste.length)
    return (
      <div className="carte carte--grise">
        <span className="titre-s">Aucune séance prévue</span>
        <p className="texte">Prends des élèves dans « À prendre » : la séance apparaît ici jusqu’à ce qu’elle soit donnée.</p>
      </div>
    );
  return (
    <>
      {liste.map((s) => (
        <div key={s.cle} className="carte">
          <span className="sous-titre">{quand(s.date, s.h, aujourdhui)} · {s.local}</span>
          <span className="titre-s">{s.classeEntiere ? `La ${s.classes.join(', ')}` : s.eleves.map((e) => e.nom).join(', ')}</span>
          <span className="petit">{s.matiere}{s.classeEntiere ? ' · classe entière' : ` · ${s.classes.join(', ')}`}</span>
          <div className="rangee">
            <button
              className="bouton bouton--sec bouton--petit"
              onClick={async () => {
                try {
                  await annulerSeance(s);
                  montrerToast('Séance annulée, le local est libéré');
                } catch (e) {
                  montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
                }
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function FeuilleProf({ liste }: { liste: Seance[] }) {
  const { ds, aujourdhui, montrerToast } = useStore();
  const mois = moisDisponibles(liste, aujourdhui);
  const [m, setM] = useState(mois[0]);
  const du = liste.filter((s) => s.date.startsWith(m));
  const faites = du.filter((s) => s.faite);
  const minutes = faites.reduce((n, s) => n + s.minutes, 0);
  const eleves = faites.reduce((n, s) => n + s.eleves.length, 0);
  return (
    <>
      <div className="rangee" style={{ flexWrap: 'wrap' }}>
        {mois.slice(0, 4).map((x) => (
          <button key={x} className="choix" aria-pressed={x === m} onClick={() => setM(x)}>{capital(nomMois(x))}</button>
        ))}
      </div>
      <div className="carte">
        <span className="sous-titre">Feuille de prestations · {nomMois(m)}</span>
        <span className="titre-l">{faites.length ? `${dureeTxt(minutes)} de remédiation` : 'Rien de donné ce mois-ci'}</span>
        <span className="petit">{pluriel(faites.length, 'séance')} donnée{faites.length > 1 ? 's' : ''}{eleves ? ` · ${pluriel(eleves, 'élève')} aidé${eleves > 1 ? 's' : ''}` : ''}{du.length > faites.length ? ` · ${du.length - faites.length} prévue${du.length - faites.length > 1 ? 's' : ''}` : ''}</span>
        <p className="petit">Elle se remplit toute seule à chaque séance prise. La direction voit la même.</p>
      </div>
      {du.length > 0 && (
        <div className="pile pile--8" aria-label="Séances du mois">
          {du.map((s) => (
            <div key={s.cle} className="carte carte--compacte">
              <span className="rangee rangee--entre">
                <span className="fort">{quand(s.date, s.h, aujourdhui)}</span>
                <span className={`puce ${s.faite ? 'puce--indigo' : 'puce--grise'}`}>{s.faite ? 'donnée' : 'prévue'}</span>
              </span>
              <span className="petit">{s.matiere} · {s.classeEntiere ? `${s.classes.join(', ')} entière` : `${pluriel(s.eleves.length, 'élève')} (${s.classes.join(', ')})`} · {s.local}</span>
            </div>
          ))}
        </div>
      )}
      <button
        className="bouton bouton--sec"
        disabled={!du.length}
        onClick={() => {
          telecharger(`cap-reussite-${nomAffiche(ds!.moi.nom).toLowerCase()}-${m}.csv`, feuilleCsv(du), 'text/csv;charset=utf-8');
          montrerToast('Feuille téléchargée (s’ouvre dans Excel)');
        }}
      >
        <Icon nom="telecharger" taille={18} /> Télécharger pour Excel
      </button>
    </>
  );
}

// ——— Élève ———

function VueEleve() {
  const { ds, demo, aujourdhui, heurePassee, classeEleve, mailEleve, dispoRemediation, annulerDispo, montrerToast } = useStore();
  const [ouverte, setOuverte] = useState<{ date: string; h: number } | null>(null);
  const classes = useMemo(() => toutesLesClasses(ds!), [ds]);
  const classe = classes.includes(classeEleve) ? classeEleve : '';
  const sansListe = !demo && ds!.absentes.includes('capReussite');
  const heures = etudesEleve(ds!, classe, mailEleve, aujourdhui, heurePassee);
  const historique = demandesEleve(ds!, mailEleve).filter((x) => !heures.some((h) => h.moi === x));
  const matieres = matieresClasse(ds!, classe);

  async function inscrire(matiere: string) {
    if (!ouverte) return;
    try {
      await dispoRemediation({ classe, date: ouverte.date, h: ouverte.h, matiere });
      setOuverte(null);
      montrerToast(`C’est noté : les profs de ${matiere.toLowerCase()} le voient`);
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <section className="ecran" aria-label="Cap Réussite">
      <Entete titre="Cap Réussite" sous="Une remédiation au lieu de l’étude" />
      {sansListe && <SansListe />}
      {!classe ? (
        <div className="carte">
          <span className="titre-s">Choisis d’abord ta classe</span>
          <a className="bouton bouton--prim" href={lien('eleve')}>Choisir ma classe</a>
        </div>
      ) : (
        <>
          <p className="texte">Tu es à l’étude ? Dis-toi disponible dans une matière : un prof libre à cette heure peut te prendre pour t’aider.</p>
          {heures.length === 0 && (
            <div className="carte carte--grise">
              <span className="titre-s">Pas d’étude annoncée pour la {classe}</span>
              <p className="texte">Dès que l’école publie une heure d’étude pour ta classe, tu peux t’y inscrire ici.</p>
            </div>
          )}
          {heures.map((x) => (
            <div key={`${x.date}-${x.h}`} className="carte">
              <span className="sous-titre">{quand(x.date, x.h, aujourdhui)} · étude</span>
              {!x.moi && (
                <>
                  <span className="titre-s">Heure d’étude pour la {classe}</span>
                  <button className="bouton bouton--prim" disabled={sansListe} onClick={() => setOuverte({ date: x.date, h: x.h })}>
                    Je suis disponible
                  </button>
                </>
              )}
              {x.moi?.statut === 'Disponible' && (
                <>
                  <span className="titre-s">Disponible en {x.moi.matiere.toLowerCase()}</span>
                  <span className="statut statut--orange">En attente d’un prof</span>
                  <div className="rangee">
                    <button
                      className="bouton bouton--sec bouton--petit"
                      onClick={async () => {
                        try {
                          await annulerDispo(x.moi!);
                          montrerToast('Inscription retirée');
                        } catch (e) {
                          montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
                        }
                      }}
                    >
                      Retirer
                    </button>
                  </div>
                </>
              )}
              {x.moi?.statut === 'Prise' && (
                <>
                  <span className="titre-s">Remédiation en {x.moi.matiere.toLowerCase()}</span>
                  <span className="statut statut--indigo"><Icon nom="coche" taille={16} /> Avec {nomAffiche(x.moi.prof ?? '')} · local {x.moi.local}</span>
                </>
              )}
            </div>
          ))}
          {historique.length > 0 && (
            <>
              <h2 className="titre-m">Tes demandes</h2>
              {historique.slice(0, 8).map((x) => (
                <div key={x.id ?? `${x.date}-${x.h}`} className="carte carte--compacte">
                  <span className="rangee rangee--entre">
                    <span className="fort">{quand(x.date, x.h, aujourdhui)}</span>
                    <span className={`puce ${x.statut === 'Prise' ? 'puce--indigo' : 'puce--grise'}`}>{x.statut === 'Prise' ? 'faite' : x.statut === 'Annulée' ? 'retirée' : 'pas prise'}</span>
                  </span>
                  <span className="petit">{x.matiere}{x.statut === 'Prise' && x.prof ? ` · avec ${nomAffiche(x.prof)}` : ''}</span>
                </div>
              ))}
            </>
          )}
          <p className="petit">Ton inscription est vue par les profs de la matière et la vie scolaire. Tes résultats ne sont jamais affichés aux autres élèves.</p>
        </>
      )}

      <Feuille ouverte={!!ouverte} onFermer={() => setOuverte(null)} titre="Je suis disponible">
        {ouverte && <span className="sous-titre">{quand(ouverte.date, ouverte.h, aujourdhui)}</span>}
        <h2 className="titre-l">Dans quelle matière ?</h2>
        <div className="grille-classes">
          {matieres.map((m) => (
            <button key={m} className="libre libre--classe" onClick={() => void inscrire(m)}>{m}</button>
          ))}
        </div>
        {!matieres.length && <p className="texte">L’horaire de ta classe n’est pas encore chargé.</p>}
      </Feuille>
    </section>
  );
}

// ——— Vie scolaire et direction ———

function VueSuivi() {
  const { ds, profil, aujourdhui, heureFinie, montrerToast } = useStore();
  const prestations = profil === 'direction' || profil === 'secretariat';
  const [onglet, setOnglet] = useState<'jour' | 'feuille'>('jour');
  const toutes = useMemo(() => seances(ds!, aujourdhui, heureFinie), [ds, aujourdhui, heureFinie]);
  const duJour = toutes.filter((s) => s.date === aujourdhui);
  const attente = (ds!.capReussite ?? []).filter((x) => x.statut === 'Disponible' && x.date === aujourdhui && x.h > heureFinie);
  const mois = moisDisponibles(toutes, aujourdhui);
  const [m, setM] = useState(mois[0]);
  const totaux = totauxMois(toutes, m);
  const sansListe = ds!.absentes.includes('capReussite');

  return (
    <section className="ecran" aria-label="Cap Réussite">
      <Entete titre="Cap Réussite" sous="Remédiations pendant l’étude" />
      {prestations && (
        <div className="seg" role="group" aria-label="Afficher">
          <button aria-pressed={onglet === 'jour'} onClick={() => setOnglet('jour')}>Aujourd’hui</button>
          <button aria-pressed={onglet === 'feuille'} onClick={() => setOnglet('feuille')}>Prestations</button>
        </div>
      )}
      {sansListe && <SansListe />}

      {(onglet === 'jour' || !prestations) && (
        <>
          <span className="petit fort">Où sont les élèves en remédiation</span>
          {duJour.length === 0 && <p className="texte">Aucune remédiation aujourd’hui.</p>}
          {duJour.map((s) => (
            <div key={s.cle} className="carte carte--compacte">
              <span className="rangee rangee--entre">
                <span className="fort">H{s.h} · {periode(s.h).debut} · {s.local}</span>
                <span className={`puce ${s.faite ? 'puce--grise' : 'puce--indigo'}`}>{nomAffiche(s.prof)}</span>
              </span>
              <span className="petit">
                {s.matiere} · {s.classeEntiere ? `la ${s.classes.join(', ')} entière` : `${s.eleves.map((e) => `${e.nom} (${e.classe})`).join(', ')}`}
              </span>
            </div>
          ))}
          {attente.length > 0 && (
            <div className="carte carte--grise">
              <span className="titre-s">{pluriel(attente.length, 'élève')} attend{attente.length > 1 ? 'ent' : ''} encore un prof</span>
              <span className="petit">{attente.map((x) => `${x.eleve} (${x.classe}, H${x.h}, ${x.matiere.toLowerCase()})`).join(' · ')}</span>
            </div>
          )}
        </>
      )}

      {prestations && onglet === 'feuille' && (
        <>
          <div className="rangee" style={{ flexWrap: 'wrap' }}>
            {mois.slice(0, 4).map((x) => (
              <button key={x} className="choix" aria-pressed={x === m} onClick={() => setM(x)}>{capital(nomMois(x))}</button>
            ))}
          </div>
          <div className="carte">
            <span className="sous-titre">Feuille de prestations · {nomMois(m)}</span>
            <span className="titre-l">{dureeTxt(totaux.reduce((n, t) => n + t.minutes, 0)) } données</span>
            <span className="petit">{pluriel(totaux.length, 'prof')} · {pluriel(totaux.reduce((n, t) => n + t.faites, 0), 'séance')} · remplie automatiquement à chaque séance prise</span>
          </div>
          {totaux.map((t) => (
            <div key={t.prof} className="carte carte--compacte">
              <span className="rangee rangee--entre">
                <span className="fort">{nomAffiche(t.prof)}</span>
                <span className="fort">{dureeTxt(t.minutes)}</span>
              </span>
              <span className="petit">
                {pluriel(t.faites, 'séance')}{t.eleves ? ` · ${pluriel(t.eleves, 'élève')} aidé${t.eleves > 1 ? 's' : ''}` : ''}{t.prevues ? ` · ${t.prevues} prévue${t.prevues > 1 ? 's' : ''}` : ''}
              </span>
            </div>
          ))}
          {!totaux.length && <p className="texte">Aucune séance ce mois-ci.</p>}
          <button
            className="bouton bouton--sec"
            disabled={!totaux.length}
            onClick={() => {
              telecharger(`cap-reussite-${m}.csv`, feuilleCsv(toutes.filter((s) => s.date.startsWith(m))), 'text/csv;charset=utf-8');
              montrerToast('Feuille téléchargée (s’ouvre dans Excel)');
            }}
          >
            <Icon nom="telecharger" taille={18} /> Télécharger pour Excel
          </button>
          <p className="petit">Le fichier compte les heures et le nombre d’élèves, sans leurs noms ni leurs résultats.</p>
        </>
      )}
    </section>
  );
}
