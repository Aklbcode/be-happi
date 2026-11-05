// Écran « Où est ? » : un collègue, une classe ou un local, maintenant et sur toute la journée.
// Plus « qui est libre maintenant » pour demander un coup de main.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { ecranActif } from '../options';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { Regle, type TonRegle } from '../ui/Regle';
import { ChoixJour, HeuresNeuf, prochainsJours } from '../ui/Choix';
import { FeuilleAide } from '../ui/FeuilleAide';
import { journeeClasse, journeeLocal, journeeProf, profsLibres, rechercher, toutesLesClasses, triClasse, type Trouve } from '../logic/ouest';
import { nomAffiche } from '../logic/horaire';
import { MIDI, PERIODES, creneauInitial, periode, situation } from '../lib/calendar';
import { lien } from '../lib/route';

const CLE_RECENTS = 'behappi-ouest-recents';

function lireRecents(): Trouve[] {
  try {
    return JSON.parse(localStorage.getItem(CLE_RECENTS) ?? '[]') as Trouve[];
  } catch {
    return [];
  }
}

function retenir(t: Trouve) {
  try {
    const r = [t, ...lireRecents().filter((x) => x.nom !== t.nom)].slice(0, 6);
    localStorage.setItem(CLE_RECENTS, JSON.stringify(r));
  } catch {
    /* rien */
  }
}

export function OuEst({ params }: { params: URLSearchParams }) {
  const { ds, maintenant, aujourdhui, minutes, profil } = useStore();
  const jours = useMemo(() => prochainsJours(maintenant, 5), [maintenant]);
  // Après H9 (ou un jour sans cours) : le prochain jour de cours.
  const [date, setDate] = useState(() => creneauInitial(maintenant, params).date);
  const [texte, setTexte] = useState('');
  const [tousLibres, setTousLibres] = useState(false);
  const [hChoisie, setHChoisie] = useState<number | null>(null);
  const [aide, setAide] = useState<{ h: number; classe?: string } | null>(null);
  const q = params.get('q') ?? '';

  const choisi: Trouve | null = useMemo(() => {
    if (!ds || !q) return null;
    const exact = rechercher(ds, q, 20).find((t) => t.nom.toLowerCase() === q.toLowerCase());
    return exact ?? rechercher(ds, q, 1)[0] ?? null;
  }, [ds, q]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const resultats = texte ? rechercher(ds, texte, 8) : [];
  const sit = situation(minutes);
  const estAuj = date === aujourdhui;
  const hNow = estAuj && sit.h >= 1 && sit.h <= 9 ? sit.h : undefined;
  const ouvrir = (t: Trouve) => {
    retenir(t);
    setTexte('');
    window.location.hash = lien('ouest', { q: t.nom, date }).slice(1);
  };
  // Qui est libre : l'heure choisie, sinon l'heure en cours, sinon H1.
  const hLibre = hChoisie ?? hNow ?? 1;
  const sauf = profil === 'prof' ? [ds.moi.nom] : [];
  const libres = profsLibres(ds, date, hLibre, sauf);
  const parHeure = PERIODES.map((p) => profsLibres(ds, date, p.h, sauf).filter((l) => l.fourche).length);
  const recents = lireRecents();

  return (
    <section className="ecran" aria-label="Où est ?">
      {choisi ? <Entete titre="Où est ?" titreCache retour={lien('ouest')} droite={<span />} /> : <h1 className="visuellement-cache">Où est ?</h1>}

      <div className="recherche">
        <Icon nom="loupe" />
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Lambert, 3TQA, BF110…"
          aria-label="Chercher un collègue, une classe ou un local"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && resultats[0]) ouvrir(resultats[0]);
          }}
        />
        {texte && (
          <button className="rond rond--petit" onClick={() => setTexte('')} aria-label="Effacer">
            <Icon nom="fermer" taille={16} />
          </button>
        )}
      </div>
      {resultats.length > 0 && (
        <ul className="resultats" role="listbox" aria-label="Résultats">
          {resultats.map((t) => (
            <li key={`${t.type}${t.nom}`}>
              <button role="option" aria-selected="false" onClick={() => ouvrir(t)}>
                <span className="vignette">
                  <Icon nom={t.type === 'prof' ? 'gens' : t.type === 'classe' ? 'chapeau' : 'porte'} />
                </span>
                <span className="pile grandit">
                  <span className="fort">{t.type === 'prof' ? nomAffiche(t.nom) : t.nom}</span>
                  <span className="petit">{t.type === 'prof' ? 'Collègue' : t.type === 'classe' ? 'Classe' : 'Local'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {texte && !resultats.length && <p className="petit">Rien trouvé pour « {texte} ».</p>}

      {choisi ? (
        <>
          <ChoixJour jours={jours} date={date} aujourdhui={aujourdhui} onChoisir={setDate} />
          <Fiche t={choisi} date={date} hNow={hNow} onAide={(h, classe) => setAide({ h, classe })} />
        </>
      ) : (
        !texte && (
          <>
            {recents.length > 0 && (
              <section className="pile pile--8" aria-label="Recherches récentes">
                <h2 className="titre-s">Récemment</h2>
                <div className="rangee enrouler">
                  {recents.map((t) => (
                    <button key={t.nom} className="filtre" onClick={() => ouvrir(t)}>
                      {t.type === 'prof' ? nomAffiche(t.nom) : t.nom}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {ecranActif('collab') && (
              <a className="carte carte--lien carte--collab" href={lien('collab')}>
                <span className="vignette">
                  <Icon nom="agenda" />
                </span>
                <span className="pile grandit">
                  <span className="titre-s">Trouver une heure commune</span>
                  <span className="petit">Avec un ou plusieurs collègues, ou l’équipe d’une classe. La réunion Teams en un geste.</span>
                </span>
                <Icon nom="droite" />
              </a>
            )}

            <section className="carte pile pile--12" aria-label="Qui est libre ?">
              <h2 className="titre-m">Qui est libre ?</h2>
              <HeuresNeuf h={hLibre} onChoisir={setHChoisie} compte={(x) => parHeure[x - 1] ?? 0} legende="profs en fourche" />
              {(() => {
                const fourche = libres.filter((l) => l.fourche);
                const autres = libres.filter((l) => !l.fourche);
                const puce = (l: (typeof libres)[number], pale: boolean) => (
                  <button key={l.prof} className={`filtre${pale ? ' filtre--pale' : ''}`} onClick={() => ouvrir({ type: 'prof', nom: l.prof })}>
                    {nomAffiche(l.prof)}
                  </button>
                );
                return (
                  <>
                    <div className="pile pile--8">
                      <h3 className="petit fort">À l’école, en fourche · {fourche.length}</h3>
                      <div className="rangee enrouler" style={{ gap: 6 }}>
                        {fourche.map((l) => puce(l, false))}
                        {!fourche.length && <span className="petit">Personne en fourche à cette heure.</span>}
                      </div>
                    </div>
                    {autres.length > 0 && (
                      <div className="pile pile--8">
                        {tousLibres ? (
                          <>
                            <h3 className="petit fort">Pas encore arrivés ou déjà partis · {autres.length}</h3>
                            <div className="rangee enrouler" style={{ gap: 6 }}>{autres.map((l) => puce(l, true))}</div>
                          </>
                        ) : (
                          <button className="lien-action" style={{ alignSelf: 'flex-start' }} onClick={() => setTousLibres(true)}>
                            Voir aussi les {autres.length} pas encore arrivés ou déjà partis
                          </button>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
              {estAuj && hLibre >= (hNow ?? 1) && (
                <button className="bouton bouton--prim" style={{ alignSelf: 'flex-start' }} onClick={() => setAide({ h: hLibre })}>
                  <Icon nom="message" taille={18} /> Demander un coup de main
                </button>
              )}
            </section>
            <section className="pile pile--8" aria-label="Classes">
              <h2 className="titre-s">Les classes</h2>
              <div className="grille-classes">
                {toutesLesClasses(ds).sort(triClasse).map((c) => (
                  <button key={c} className="libre libre--classe" onClick={() => ouvrir({ type: 'classe', nom: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </section>
          </>
        )
      )}

      {aide && <FeuilleAide date={date} h={aide.h} classe={aide.classe} onFermer={() => setAide(null)} />}
    </section>
  );
}

function Fiche({ t, date, hNow, onAide }: { t: Trouve; date: string; hNow?: number; onAide: (h: number, classe?: string) => void }) {
  const { ds, ouvrirTeams, profil } = useStore();
  const [hVue, setHVue] = useState<number | null>(null);
  if (!ds) return null;

  // Un prof ne voit pas l'horaire complet d'un collègue : seulement où il est, heure par heure.
  if (t.type === 'prof' && profil === 'prof' && t.nom !== ds.moi.nom) {
    const h = hVue ?? hNow ?? 1;
    const p = journeeProf(ds, t.nom, date)[h - 1];
    const ton = p.statut === 'cours' ? 'indigo' : p.statut === 'absent' ? 'rose' : p.statut === 'fourche' ? 'pale' : 'vide';
    const email = ds.profs.find((x) => x.nom === t.nom)?.email;
    return (
      <section className="carte fiche" aria-label={`Où est ${nomAffiche(t.nom)}`}>
        <div className="rangee">
          <span className="rond rond--grand rond--nuit">{t.nom.slice(0, 2)}</span>
          <div className="pile grandit">
            <h2 className="titre-l">{nomAffiche(t.nom)}</h2>
            <span className={`statut statut--${ton}`}>
              {p.statut === 'cours' ? `En ${p.local || 'cours'}` : p.texte} · H{h} · {periode(h).debut}
            </span>
          </div>
        </div>
        <div className="heures-9" role="group" aria-label="Choisir l'heure">
          {PERIODES.map((x) => (
            <button key={x.h} aria-pressed={x.h === h} onClick={() => setHVue(x.h)}>
              <b>H{x.h}</b>
            </button>
          ))}
        </div>
        <div className="rangee enrouler">
          {email && (
            <button className="bouton bouton--prim bouton--petit" onClick={() => ouvrirTeams({ type: 'teams-chat', emails: [email], noms: [nomAffiche(t.nom)], message: `Bonjour ${nomAffiche(t.nom)}, ` })}>
              <Icon nom="message" taille={16} /> Écrire sur Teams
            </button>
          )}
          {ecranActif('collab') && (
            <a className="bouton bouton--sec bouton--petit" href={lien('collab', { p: `${ds.moi.nom}|${t.nom}` })}>
              <Icon nom="agenda" taille={16} /> Heure commune avec {nomAffiche(t.nom)}
            </a>
          )}
        </div>
      </section>
    );
  }

  if (t.type === 'prof') {
    const jour = journeeProf(ds, t.nom, date);
    const ton = (s: string): TonRegle => (s === 'cours' ? 'indigo' : s === 'absent' ? 'rose' : s === 'fourche' ? 'pale' : 'vide');
    const now = hNow ? jour[hNow - 1] : undefined;
    const email = ds.profs.find((p) => p.nom === t.nom)?.email;
    return (
      <section className="carte fiche" aria-label={`Journée de ${nomAffiche(t.nom)}`}>
        <div className="rangee">
          <span className="rond rond--grand rond--nuit">{t.nom.slice(0, 2)}</span>
          <div className="pile grandit">
            <h2 className="titre-l">{nomAffiche(t.nom)}</h2>
            {now && (
              <span className={`statut statut--${ton(now.statut)}`}>
                {now.statut === 'cours' ? `En ${now.local} avec la ${now.classe}` : now.texte} · H{hNow}
              </span>
            )}
          </div>
        </div>
        <Regle heures={jour.map((p) => ({ h: p.h, ton: p.note === 'local fermé' ? 'rose' : ton(p.statut), titre: `H${p.h} · ${p.texte}` }))} actuel={hNow} />
        <ListeJour lignes={jour.map((p) => ({ h: p.h, ton: p.note === 'local fermé' ? 'rose' : ton(p.statut), texte: p.statut === 'cours' ? `${p.classe} · ${p.local}${p.matiere ? ` · ${p.matiere}` : ''}${p.note ? ` (${p.note})` : ''}` : p.texte }))} actuel={hNow} />
        <div className="rangee enrouler">
          {email && (
            <button className="bouton bouton--prim bouton--petit" onClick={() => ouvrirTeams({ type: 'teams-chat', emails: [email], noms: [nomAffiche(t.nom)], message: `Bonjour ${nomAffiche(t.nom)}, ` })}>
              <Icon nom="message" taille={16} /> Écrire sur Teams
            </button>
          )}
        </div>
      </section>
    );
  }

  if (t.type === 'classe') {
    const jour = journeeClasse(ds, t.nom, date);
    const ton = (s: string): TonRegle => (s === 'cours' || s === 'remediation' ? 'indigo' : s === 'etude' ? 'orange' : 'vide');
    const now = hNow ? jour[hNow - 1] : undefined;
    const equipe = [...new Set(ds.cours.filter((c) => c.classes.includes(t.nom)).map((c) => c.prof))];
    return (
      <section className="carte fiche" aria-label={`Journée de la ${t.nom}`}>
        <div className="rangee">
          <span className="rond rond--grand rond--indigo">{t.nom}</span>
          <div className="pile grandit">
            <h2 className="titre-l">La {t.nom}</h2>
            {now && (
              <span className={`statut statut--${ton(now.statut)}`}>
                {now.statut === 'cours' ? `${now.matiere || 'Cours'} en ${now.local} avec ${nomAffiche(now.prof ?? '')}` : now.statut === 'remediation' ? `Remédiation en ${now.local}` : now.texte} · H{hNow}
              </span>
            )}
          </div>
        </div>
        <Regle heures={jour.map((p) => ({ h: p.h, ton: p.note === 'local fermé' ? 'rose' : ton(p.statut), titre: `H${p.h} · ${p.texte}` }))} actuel={hNow} />
        <ListeJour
          lignes={jour.map((p) => ({
            h: p.h,
            ton: p.note === 'local fermé' ? 'rose' : ton(p.statut),
            texte:
              p.statut === 'cours' || p.statut === 'remediation'
                ? `${p.matiere || 'Cours'} · ${p.local ?? ''}${p.prof ? ` · ${nomAffiche(p.prof)}` : ''}${p.note ? ` (${p.note})` : ''}`
                : p.statut === 'etude'
                  ? `Étude · ${p.matiere} sans prof (${nomAffiche(p.prof ?? '')} absent·e)${p.note && p.note !== 'prof absent' ? ` · ${p.note}` : ''}`
                  : p.texte,
            action: p.statut === 'etude' ? { libelle: 'Qui peut la prendre ?', faire: () => onAide(p.h, t.nom) } : undefined,
          }))}
          actuel={hNow}
        />
        {ecranActif('collab') && (
          <div className="rangee enrouler">
            <a className="bouton bouton--sec bouton--petit" href={lien('collab', { p: equipe.join('|') })}>
              <Icon nom="gens" taille={16} /> Réunir l’équipe ({equipe.length})
            </a>
          </div>
        )}
      </section>
    );
  }

  const jour = journeeLocal(ds, t.nom, date);
  const ton = (s: string): TonRegle => (s === 'libre' ? 'indigo' : s === 'indispo' ? 'rose' : s === 'moi' ? 'orange' : 'gris');
  const now = hNow ? jour[hNow - 1] : undefined;
  const local = ds.locaux.find((l) => l.code === t.nom);
  return (
    <section className="carte fiche" aria-label={`Occupation de ${t.nom}`}>
      <div className="rangee">
        <span className="rond rond--grand rond--indigo">
          <Icon nom="porte" />
        </span>
        <div className="pile grandit">
          <h2 className="titre-l">{t.nom}</h2>
          <span className="petit">{local?.type}{local?.vp ? ' · projecteur' : ''}{local?.tv ? ' · TV' : ''}</span>
          {now && <span className={`statut statut--${ton(now.etat)}`}>{now.etat === 'libre' ? 'Libre' : now.detail} · H{hNow}</span>}
        </div>
      </div>
      <Regle heures={jour.map((e, i) => ({ h: i + 1, ton: ton(e.etat), titre: `H${i + 1} · ${e.detail}` }))} actuel={hNow} />
      <ListeJour lignes={jour.map((e, i) => ({ h: i + 1, ton: ton(e.etat), texte: e.etat === 'libre' ? (i + 1 === MIDI ? 'Libre · temps de midi' : 'Libre') : e.detail }))} actuel={hNow} />
      <div className="rangee enrouler">
        {profil === 'prof' && (
          <a className="bouton bouton--prim bouton--petit" href={lien('locaux', { date, h: hNow ?? 1 })}>
            <Icon nom="porte" taille={16} /> Réserver un local
          </a>
        )}
        {ecranActif('signaler') && (
          <a className="bouton bouton--sec bouton--petit" href={lien('signaler', { local: t.nom })}>
            <Icon nom="outil" taille={16} /> Signaler un problème
          </a>
        )}
      </div>
    </section>
  );
}

function ListeJour({ lignes, actuel }: { lignes: { h: number; ton: TonRegle; texte: string; action?: { libelle: string; faire: () => void } }[]; actuel?: number }) {
  return (
    <ul className="lignes-jour lignes-jour--large">
      {lignes.map((l) => (
        <li key={l.h} className={l.h === actuel ? 'actuel' : ''}>
          <span className="mono">{periode(l.h).debut}</span>
          <span className={`point-ton point-ton--${l.ton === 'vide' ? 'gris' : l.ton}`} aria-hidden="true" />
          <span className="pile grandit">
            <span>{l.texte}</span>
            {l.action && (
              <button className="lien-action lien-action--ligne" onClick={l.action.faire}>
                {l.action.libelle}
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
