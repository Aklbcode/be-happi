// Le panneau de droite (en bas sur téléphone) : le fil de l'heure regardée, ou la fiche de ce qu'on
// a choisi (un local, un prof, une classe), avec les actions sur place.

import { useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import type { Dataset, Profil } from '../data/types';
import { JOURS, PERIODES, jourSemaineIso, periode } from '../lib/calendar';
import { optionsPour } from '../logic/deplacements';
import { coursDuProf } from '../logic/horaire';
import { journeeClasse, journeeEleve, journeeProf, positionClasse, positionProf, profsLibres } from '../logic/ouest';
import { etatLocalA, nomCourt, type CasePlan, type EtatCase, type Fil, type Lentille } from './etat';

export type Choix = { type: 'local' | 'prof' | 'classe'; nom: string } | null;

interface Props {
  ds: Dataset;
  moi: string;
  profil: Profil;
  date: string;
  h: number;
  passe: boolean;
  plan: Map<string, CasePlan>;
  fil: Fil;
  choix: Choix;
  onChoix: (c: Choix) => void;
  onHeure: (h: number) => void;
  onLentille: (l: Lentille) => void;
}

const BATIMENT: Record<string, string> = { T: 'la tour (BT)', F: 'le grand bâtiment (BF)', C: 'côté rue Papleux (BC)', PR: 'les préfabriqués', Autres: 'hors des bâtiments' };
const ETAGE: Record<number, string> = { 0: 'rez', 1: '1er étage', 2: '2e étage' };

export function Panneau(p: Props) {
  const { choix } = p;
  return (
    <aside className="panneau" aria-label={choix ? `Fiche ${choix.nom}` : `Le fil de H${p.h}`}>
      {choix?.type === 'local' ? (
        <FicheLocal {...p} code={choix.nom} />
      ) : choix?.type === 'prof' ? (
        <FicheProf {...p} nom={choix.nom} />
      ) : choix?.type === 'classe' ? (
        <FicheClasse {...p} nom={choix.nom} />
      ) : (
        <FilHeure {...p} />
      )}
    </aside>
  );
}

function Entete({ titre, sous, onFermer }: { titre: ReactNode; sous?: ReactNode; onFermer?: () => void }) {
  return (
    <div className="panneau-tete">
      <div>
        <h2>{titre}</h2>
        {sous && <p className="discret">{sous}</p>}
      </div>
      {onFermer && (
        <button className="fermer" onClick={onFermer} aria-label="Fermer la fiche">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Un trait de craie de la couleur de l'état, devant une section du fil. */
function Section({ ton, titre, children }: { ton: 'bleu' | 'jaune' | 'rose' | 'lilas' | 'craie'; titre: ReactNode; children: ReactNode }) {
  return (
    <section className={`section section--${ton}`}>
      <h3>{titre}</h3>
      {children}
    </section>
  );
}

/** Les neuf heures d'une journée, en petites cases ; toucher une case y fait aller le temps. */
function Bande({ cases, h, onHeure }: { cases: { h: number; etat: EtatCase; titre: string }[]; h: number; onHeure: (h: number) => void }) {
  return (
    <ol className="bande" aria-label="La journée heure par heure">
      {cases.map((c) => (
        <li key={c.h}>
          <button className={`bande-case tuile--${c.etat}${c.h === h ? ' bande-case--actuelle' : ''}`} onClick={() => onHeure(c.h)} title={`H${c.h} : ${c.titre}`} aria-label={`H${c.h} : ${c.titre}`}>
            <span>H{c.h}</span>
          </button>
          <span className="bande-titre">{c.titre}</span>
        </li>
      ))}
    </ol>
  );
}

function plage(h: number): string {
  const x = periode(h);
  return `de ${x.debut} à ${x.fin}`;
}

// ------------------------------------------------------------------ le fil de l'heure

function FilHeure(p: Props) {
  const { ds, moi, profil, date, h, fil, passe, onChoix } = p;
  const { peutValider, classeEleve } = useStore();
  const eleve = profil === 'eleve';
  const [aide, setAide] = useState(false);
  const enAttente = ds.deplacements.filter((d) => d.statut === 'En attente').length;
  const avecVp = new Set(ds.locaux.filter((l) => l.vp || l.tbi || l.tv).map((l) => l.code));
  const libres = [...fil.libres].sort((a, b) => Number(avecVp.has(b)) - Number(avecVp.has(a)) || a.localeCompare(b, 'fr', { numeric: true }));
  const rien = !fil.etudes.length && !fil.absents.length && !fil.fermes.length && !fil.arrivees.length;

  return (
    <>
      <Entete titre={`En H${h}`} sous={plage(h)} />
      {eleve ? (
        <TaClasse ds={ds} classe={classeEleve} date={date} h={h} />
      ) : (
        <>
          {moi && profil === 'prof' && <Toi {...p} />}
          {fil.etudes.length > 0 && (
            <Section ton="jaune" titre={fil.etudes.length > 1 ? `${fil.etudes.length} classes à l’étude` : 'Une classe à l’étude'}>
              <ul className="liste">
                {fil.etudes.map((e) => (
                  <li key={`${e.classe}-${e.local}`}>
                    <button className="ligne-fil" onClick={() => onChoix({ type: 'classe', nom: e.classe.split(',')[0].trim() })}>
                      <b>{e.classe}</b>
                      <span>{e.matiere || 'cours'}, prévu en {e.local}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!passe && (
                <button className="btn btn--petit" onClick={() => setAide(!aide)} aria-expanded={aide}>
                  {aide ? 'Masquer les collègues libres' : 'Qui peut aider ?'}
                </button>
              )}
              {aide && <Aide ds={ds} date={date} h={h} etudes={fil.etudes} />}
            </Section>
          )}
          {fil.absents.length > 0 && (
            <Section ton="rose" titre={fil.absents.length > 1 ? `${fil.absents.length} absents` : 'Un absent'}>
              <div className="pastilles">
                {fil.absents.map((a) => (
                  <button key={a} className="pastille" onClick={() => onChoix({ type: 'prof', nom: a })}>
                    {nomCourt(a)}
                  </button>
                ))}
              </div>
            </Section>
          )}
          {fil.arrivees.length > 0 && (
            <Section ton="lilas" titre="Cours déplacés ici">
              <ul className="liste">
                {fil.arrivees.map((a) => (
                  <li key={`${a.classe}-${a.prof}`}>
                    <button className="ligne-fil" onClick={() => a.local && onChoix({ type: 'local', nom: a.local })}>
                      <b>{a.classe}</b>
                      <span>
                        avec {nomCourt(a.prof)}
                        {a.local ? ` en ${a.local}` : ''}
                        {a.enAttente ? ', à valider' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {fil.fermes.length > 0 && (
            <Section ton="rose" titre="Locaux fermés">
              <ul className="liste">
                {fil.fermes.map((f) => (
                  <li key={f.local}>
                    <button className="ligne-fil" onClick={() => onChoix({ type: 'local', nom: f.local })}>
                      <b>{f.local}</b>
                      <span>{f.titre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {peutValider && enAttente > 0 && (
            <Section ton="lilas" titre={enAttente > 1 ? `${enAttente} déplacements à valider` : 'Un déplacement à valider'}>
              <a className="btn btn--petit" href="../#/validations">
                Ouvrir les validations dans Be Happi
              </a>
            </Section>
          )}
          <Section ton="bleu" titre={`${fil.libres.length} locaux libres`}>
            <div className="pastilles">
              {libres.slice(0, 18).map((c) => (
                <button key={c} className={`pastille pastille--libre${avecVp.has(c) ? ' pastille--vp' : ''}`} onClick={() => onChoix({ type: 'local', nom: c })} title={avecVp.has(c) ? `${c}, avec projecteur ou écran` : c}>
                  {c}
                </button>
              ))}
              {libres.length > 18 && <span className="discret">et {libres.length - 18} autres</span>}
            </div>
            {avecVp.size > 0 && <p className="discret">Un point : projecteur ou écran.</p>}
          </Section>
          {rien && <p className="discret">Rien d’autre à signaler en H{h}.</p>}
        </>
      )}
    </>
  );
}

/** Pour un prof : où il est, et s'il peut avancer un cours dans cette heure. */
function Toi({ ds, moi, date, h, passe, onLentille }: Props) {
  const { proposer, montrerToast, aujourdhui, heureFinie } = useStore();
  const pos = positionProf(ds, moi, date, h);
  const options = useMemo(() => (passe ? [] : optionsPour(ds, moi, date, h, aujourdhui, heureFinie)), [ds, moi, date, h, passe, aujourdhui, heureFinie]);
  const o = options[0];
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer() {
    if (!o) return;
    setEnvoi(true);
    try {
      await proposer({ absent: o.absent, date: o.date, hVide: o.h, classe: o.classe, hOrigine: o.hO, dateOrigine: o.dateO });
      montrerToast('Déplacement proposé : l’éducateur le voit dans Be Happi et Power Apps.');
      setConfirmer(false);
    } catch (e) {
      montrerToast(`Impossible de proposer : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Section ton="craie" titre="Toi">
      <p className="phrase">{pos.statut === 'cours' ? `${pos.classe} en ${pos.local}${pos.note ? `, ${pos.note}` : ''}` : pos.texte}</p>
      <button className="btn btn--petit" onClick={() => onLentille('moi')}>
        Voir mon trajet du jour
      </button>
      {o && (
        <div className="occasion">
          <p className="phrase">
            {options.length > 1 ? `${options.length} de tes cours peuvent venir dans cette heure libérée.` : 'Un de tes cours peut venir dans cette heure libérée.'} Le plus avantageux : ta {o.classe} de{' '}
            {o.semaineSuivante ? 'la semaine prochaine, ' : ''}
            {JOURS[jourSemaineIso(o.dateO)]} H{o.hO}, en {o.local}.
          </p>
          {o.avantages[0] && <p className="discret">{o.avantages[0]}</p>}
          {confirmer ? (
            <div className="rang">
              <button className="btn btn--plein btn--petit" disabled={envoi} onClick={() => void envoyer()}>
                {envoi ? 'Envoi…' : 'Confirmer la proposition'}
              </button>
              <button className="btn btn--petit" onClick={() => setConfirmer(false)}>
                Annuler
              </button>
            </div>
          ) : (
            <button className="btn btn--jaune btn--petit" onClick={() => setConfirmer(true)}>
              Proposer ce déplacement
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

/** Les collègues libres à cette heure, avec un message Teams prêt. */
function Aide({ ds, date, h, etudes }: { ds: Dataset; date: string; h: number; etudes: Fil['etudes'] }) {
  const { ouvrirTeams } = useStore();
  const libres = profsLibres(ds, date, h).slice(0, 6);
  const quoi = etudes.map((e) => `${e.classe}${e.matiere ? ` (${e.matiere.toLowerCase()})` : ''}`).join(', ');
  if (!libres.length) return <p className="discret">Personne n’est libre à l’école à cette heure.</p>;
  return (
    <ul className="liste liste--aide">
      {libres.map((l) => {
        const email = ds.profs.find((x) => x.nom === l.prof)?.email;
        return (
          <li key={l.prof} className="rang">
            <span className="grandit">
              <b>{nomCourt(l.prof)}</b> <span className="discret">{l.texte}</span>
            </span>
            {email && (
              <button
                className="btn btn--petit"
                onClick={() =>
                  ouvrirTeams({
                    type: 'teams-chat',
                    emails: [email],
                    noms: [nomCourt(l.prof)],
                    message: `Bonjour ${nomCourt(l.prof)}, en H${h} (${plage(h)}) ${etudes.length > 1 ? 'ces classes sont' : 'cette classe est'} à l’étude : ${quoi}. Tu es libre à ce moment-là : pourrais-tu aider ?`,
                  })
                }
              >
                Message
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Pour un élève : sa classe à cette heure (sans nom de prof). */
function TaClasse({ ds, classe, date, h }: { ds: Dataset; classe: string; date: string; h: number }) {
  const { changerClasseEleve } = useStore();
  const classes = useMemo(() => [...new Set(ds.coursEleves.flatMap((c) => c.classes))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })), [ds]);
  const j = classe ? journeeEleve(ds, classe, date) : [];
  const ici = j.find((x) => x.h === h);
  return (
    <Section ton="craie" titre="Ta classe">
      <select className="choix" value={classe} onChange={(e) => changerClasseEleve(e.target.value)} aria-label="Ta classe">
        <option value="">Choisis ta classe</option>
        {classes.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      {classe && (
        <>
          <p className="phrase">{ici?.cours ? `${ici.cours.matiere} en ${ici.cours.local}` : 'Pas cours à cette heure.'}</p>
          {ici?.changements.map((c) => (
            <p key={c.titre} className="phrase phrase--jaune">
              {c.titre}
            </p>
          ))}
        </>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ les fiches

function FicheLocal({ ds, moi, profil, date, h, passe, onChoix, onHeure, code }: Props & { code: string }) {
  const { reserver, signaler, montrerToast } = useStore();
  const l = ds.locaux.find((x) => x.code === code);
  const etat = etatLocalA(ds, moi, code, date, h);
  const jour = PERIODES.map((x) => etatLocalA(ds, moi, code, date, x.h));
  const mesClasses = useMemo(() => [...new Set(ds.cours.filter((c) => c.prof === moi).flatMap((c) => c.classes))].sort(), [ds, moi]);
  const monCours = coursDuProf(ds, moi, date).find((c) => c.h === h);
  const [classe, setClasse] = useState('');
  const classeRes = classe || monCours?.classe || mesClasses[0] || '';
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const equipement = l ? [l.vp && 'Projecteur', l.tbi && 'Tableau interactif', l.tv && 'Écran', l.autre].filter(Boolean) : [];
  const reservable = profil === 'prof' && !!moi && !passe && (etat.etat === 'libre' || etat.etat === 'etude');
  const eleve = profil === 'eleve';

  async function faire(action: () => Promise<void>, ok: string) {
    setEnvoi(true);
    try {
      await action();
      montrerToast(ok);
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <>
      <Entete
        titre={code}
        sous={l ? `${l.type}${l.etage >= 0 ? `, ${ETAGE[l.etage] ?? ''}` : ''}, ${BATIMENT[l.batiment] ?? ''}` : undefined}
        onFermer={() => onChoix(null)}
      />
      {equipement.length > 0 && (
        <div className="pastilles">
          {equipement.map((e) => (
            <span key={String(e)} className="pastille pastille--fixe">
              {e}
            </span>
          ))}
        </div>
      )}
      {!eleve && (
        <>
          <p className={`phrase phrase--${etat.etat}`}>
            H{h} : {etat.detail}
          </p>
          <Bande cases={jour.map((c, i) => ({ h: i + 1, etat: c.etat, titre: c.etat === 'libre' ? 'libre' : c.classe ?? c.detail }))} h={h} onHeure={onHeure} />
        </>
      )}
      {reservable && (
        <div className="action">
          <label className="champ">
            <span>Pour</span>
            <select className="choix" value={classeRes} onChange={(e) => setClasse(e.target.value)}>
              {mesClasses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button className="btn btn--bleu" disabled={envoi || !classeRes} onClick={() => void faire(() => reserver({ date, h, local: code, classe: classeRes }), `${code} réservé en H${h} pour la ${classeRes}`)}>
            Réserver en H{h}
          </button>
        </div>
      )}
      {ouvert ? (
          <div className="action">
            <label className="champ champ--bloc">
              <span>Qu’est-ce qui ne va pas ?</span>
              <textarea className="zone" rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ex. : le projecteur ne s’allume plus" />
            </label>
            <label className="coche">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              <span>Le local est inutilisable (il sera fermé aux réservations)</span>
            </label>
            <div className="rang">
              <button
                className="btn btn--rose"
                disabled={envoi || texte.trim().length < 3}
                onClick={() =>
                  void faire(async () => {
                    await signaler(code, texte.trim(), urgent);
                    setOuvert(false);
                    setTexte('');
                  }, 'Signalement envoyé au service technique')
                }
              >
                Envoyer au service technique
              </button>
              <button className="btn" onClick={() => setOuvert(false)}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn--petit" onClick={() => setOuvert(true)}>
            Signaler un problème dans {code}
          </button>
        )}
    </>
  );
}

function FicheProf({ ds, date, h, onChoix, onHeure, nom }: Props & { nom: string }) {
  const { ouvrirTeams } = useStore();
  const pos = positionProf(ds, nom, date, h);
  const jour = journeeProf(ds, nom, date);
  const email = ds.profs.find((x) => x.nom === nom)?.email;
  const etatDe = (s: string): EtatCase => (s === 'cours' ? 'occupe' : s === 'absent' ? 'ferme' : s === 'conge' || s === 'pas-cours' ? 'conge' : 'libre');
  return (
    <>
      <Entete titre={nomCourt(nom)} sous="Sa journée, et son trajet sur le plan" onFermer={() => onChoix(null)} />
      <p className={`phrase phrase--${etatDe(pos.statut)}`}>
        H{h} : {pos.statut === 'cours' ? `${pos.classe} en ${pos.local}` : pos.texte.toLowerCase()}
      </p>
      <Bande cases={jour.map((x) => ({ h: x.h, etat: etatDe(x.statut), titre: x.statut === 'cours' ? `${x.classe} ${x.local ?? ''}` : x.texte.toLowerCase() }))} h={h} onHeure={onHeure} />
      {email && (
        <button className="btn btn--petit" onClick={() => ouvrirTeams({ type: 'teams-chat', emails: [email], noms: [nomCourt(nom)], message: `Bonjour ${nomCourt(nom)}, ` })}>
          Écrire sur Teams
        </button>
      )}
    </>
  );
}

function FicheClasse({ ds, profil, date, h, onChoix, onHeure, nom }: Props & { nom: string }) {
  const eleve = profil === 'eleve';
  const etatDe = (s: string): EtatCase => (s === 'cours' ? 'occupe' : s === 'etude' ? 'etude' : s === 'remediation' ? 'changement' : s === 'conge' ? 'conge' : 'libre');
  if (eleve) {
    const j = journeeEleve(ds, nom, date);
    return (
      <>
        <Entete titre={nom} sous="Ta journée, et ton trajet sur le plan" onFermer={() => onChoix(null)} />
        <Bande cases={PERIODES.map((x) => { const c = j.find((y) => y.h === x.h); return { h: x.h, etat: (c?.cours ? 'occupe' : 'libre') as EtatCase, titre: c?.cours ? `${c.cours.matiere} ${c.cours.local}` : 'pas cours' }; })} h={h} onHeure={onHeure} />
      </>
    );
  }
  const pos = positionClasse(ds, nom, date, h);
  const jour = journeeClasse(ds, nom, date);
  return (
    <>
      <Entete titre={nom} sous="Sa journée, et son trajet sur le plan" onFermer={() => onChoix(null)} />
      <p className={`phrase phrase--${etatDe(pos.statut)}`}>
        H{h} : {pos.statut === 'cours' ? `${pos.matiere || 'cours'} en ${pos.local}${pos.prof ? ` avec ${nomCourt(pos.prof)}` : ''}` : pos.texte}
        {pos.note ? ` (${pos.note})` : ''}
      </p>
      <Bande cases={jour.map((x) => ({ h: x.h, etat: etatDe(x.statut), titre: x.statut === 'cours' ? `${x.matiere ?? ''} ${x.local ?? ''}`.trim() : x.texte.toLowerCase() }))} h={h} onHeure={onHeure} />
    </>
  );
}
