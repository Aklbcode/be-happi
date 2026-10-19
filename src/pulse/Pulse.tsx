// Pulse : l'école sur un seul écran. Le temps est l'interface : on fait glisser la ligne de pouls
// (ou on la laisse défiler) et le plan des bâtiments, le fil et les trajets suivent.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { PROFILS } from '../data/profils';
import { JOURS, JOURS_COURTS, PERIODES, conge, deIso, estJourDeCours, iso, lundiDe, plusJoursIso, prochainJourDeCours } from '../lib/calendar';
import { coursDuProf } from '../logic/horaire';
import { opportunitesSemaine } from '../logic/deplacements';
import { etatPlan, filA, heureDe, momentDe, nomCourt, pouls, trajetClasse, trajetEleve, trajetProf, type Lentille } from './etat';
import { Plan } from './Plan';
import { Ligne } from './Ligne';
import { Panneau, type Choix } from './Panneau';
import { Commande } from './Commande';
import { Glyphe } from './Glyphe';
import { appliquerThemePulse, themePulse, type ThemePulse } from './theme';

const DEBUT = 505;
const FIN = 985;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const reduit = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Pulse() {
  const store = useStore();
  const { ds, demo, simulation, maintenant, aujourdhui, minutes: minutesReelles, heureFinie, profil, profils, changerProfil, classeEleve, erreur, toast } = store;
  const eleve = profil === 'eleve';
  const moi = ds?.moi.nom ?? '';

  // « Maintenant » : aujourd'hui s'il y a cours, sinon le prochain jour de cours, à 8h25.
  const ecole = estJourDeCours(maintenant);
  const jourDirect = ecole ? aujourdhui : iso(prochainJourDeCours(maintenant, false));
  const minutesDirect = ecole ? Math.min(Math.max(minutesReelles, DEBUT), FIN) : DEBUT;

  const [direct, setDirect] = useState(true);
  const [dateChoisie, setDateChoisie] = useState(jourDirect);
  const [minutesChoisies, setMinutesChoisies] = useState(minutesDirect);
  const date = direct ? jourDirect : dateChoisie;
  const minutes = direct ? minutesDirect : minutesChoisies;
  const h = heureDe(minutes);
  const moment = momentDe(minutes);
  const passe = date < aujourdhui || (date === aujourdhui && h <= heureFinie);

  const lentilles = useMemo<{ id: Lentille; nom: string }[]>(
    () =>
      eleve
        ? [{ id: 'classe', nom: 'Ma classe' }]
        : [
            { id: 'locaux', nom: 'Locaux' },
            { id: 'classes', nom: 'Classes' },
            { id: 'profs', nom: 'Profs' },
            ...(moi && profil === 'prof' ? [{ id: 'moi' as Lentille, nom: 'Mon trajet' }] : []),
          ],
    [eleve, moi, profil],
  );
  const [lentilleChoisie, setLentille] = useState<Lentille>('locaux');
  const lentille = lentilles.some((l) => l.id === lentilleChoisie) ? lentilleChoisie : lentilles[0].id;

  const [choix, setChoix] = useState<Choix>(null);
  const [commande, setCommande] = useState(false);
  const [joue, setJoue] = useState(false);
  const [theme, setTheme] = useState<ThemePulse>(themePulse);
  const [menu, setMenu] = useState(false);

  // Un élève ne voit que le trajet de sa classe : pas l'occupation des locaux ni les absences du personnel.
  const plan = useMemo(
    () => (!ds ? new Map() : eleve ? new Map(ds.locaux.map((l) => [l.code, { code: l.code, etat: 'occupe' as const, detail: l.type }])) : etatPlan(ds, moi, date, h)),
    [ds, eleve, moi, date, h],
  );
  const ligne = useMemo(() => (ds && !eleve ? pouls(ds, date) : []), [ds, eleve, date]);
  const fil = useMemo(() => (!ds ? null : eleve ? { etudes: [], absents: [], fermes: [], libres: [], arrivees: [] } : filA(ds, date, h, plan)), [ds, eleve, date, h, plan]);

  const trajet = useMemo(() => {
    if (!ds) return null;
    if (choix?.type === 'prof') return { etapes: trajetProf(ds, choix.nom, date), libelle: nomCourt(choix.nom) };
    if (choix?.type === 'classe') return { etapes: eleve ? trajetEleve(ds, choix.nom, date) : trajetClasse(ds, choix.nom, date), libelle: choix.nom };
    if (lentille === 'moi' && moi) return { etapes: trajetProf(ds, moi, date), libelle: 'ton trajet' };
    if (lentille === 'classe' && classeEleve) return { etapes: trajetEleve(ds, classeEleve, date), libelle: classeEleve };
    return null;
  }, [ds, choix, date, lentille, moi, classeEleve, eleve]);

  const enAvant = useMemo(() => (choix?.type === 'local' ? new Set([choix.nom]) : null), [choix]);

  // Repères de la ligne : mes heures de cours, et les heures libérées où je peux avancer un cours.
  const lundi = iso(lundiDe(deIso(date)));
  const opps = useMemo(() => (ds && moi && profil === 'prof' ? opportunitesSemaine(ds, moi, lundi, aujourdhui, heureFinie) : new Map()), [ds, moi, profil, lundi, aujourdhui, heureFinie]);
  const mesHeures = useMemo(() => (ds && moi && profil === 'prof' ? coursDuProf(ds, moi, date).map((c) => c.h) : []), [ds, moi, profil, date]);
  const occasions = useMemo(() => [...opps.values()].filter((o) => o.date === date && !o.passe).map((o) => o.h), [opps, date]);

  const aller = useCallback(
    (m: number) => {
      setDirect(false);
      setDateChoisie(date);
      setMinutesChoisies(m);
    },
    [date],
  );
  const allerHeure = useCallback((x: number) => aller(PERIODES[x - 1].dm + 1), [aller]);
  const montrer = (code: string | null, d: string, hh: number) => {
    setJoue(false);
    setDirect(false);
    setDateChoisie(d);
    setMinutesChoisies(PERIODES[Math.min(Math.max(hh, 1), 9) - 1].dm + 1);
    setChoix(code ? { type: 'local', nom: code } : null);
    if (!eleve) setLentille('locaux');
  };
  const revenir = () => {
    setDirect(true);
    setJoue(false);
  };

  // Défilement de la journée en accéléré (environ 14 s), case par case si l'appareil limite les animations.
  const minutesRef = useRef(minutes);
  minutesRef.current = minutes;
  useEffect(() => {
    if (!joue) return;
    setDirect(false);
    setDateChoisie(date);
    let m0 = minutesRef.current >= FIN - 1 ? DEBUT : minutesRef.current;
    if (reduit()) {
      const id = window.setInterval(() => {
        const suivante = PERIODES.find((p) => p.dm > m0);
        if (!suivante) {
          setMinutesChoisies(FIN);
          setJoue(false);
          return;
        }
        m0 = suivante.dm + 1;
        setMinutesChoisies(m0);
      }, 900);
      return () => window.clearInterval(id);
    }
    const duree = (14000 * (FIN - m0)) / (FIN - DEBUT);
    const t0 = performance.now();
    let raf = 0;
    const pas = (t: number) => {
      const m = m0 + ((t - t0) / duree) * (FIN - m0);
      if (m >= FIN) {
        setMinutesChoisies(FIN);
        setJoue(false);
        return;
      }
      setMinutesChoisies(m);
      raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [joue]);

  // Clavier : ⌘K ou / pour chercher, ← → pour changer d'heure, espace pour défiler, M pour maintenant.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const dansChamp = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !dansChamp)) {
        e.preventDefault();
        setCommande(true);
        return;
      }
      if (dansChamp || commande) return;
      if (e.key === 'Escape') setChoix(null);
      else if (e.key === 'ArrowRight' && !(e.target instanceof SVGElement)) allerHeure(Math.min(9, h + 1));
      else if (e.key === 'ArrowLeft' && !(e.target instanceof SVGElement)) allerHeure(Math.max(1, h - 1));
      else if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        setJoue((j) => !j);
      } else if (e.key === 'm' || e.key === 'M') revenir();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [allerHeure, commande, h]);

  if (!ds)
    return (
      <main className="attente" aria-busy={!erreur}>
        <Glyphe anime={!erreur} />
        {erreur && (
          <div className="attente-erreur">
            <p>Connexion à SharePoint impossible : {erreur}</p>
            <a className="btn" href="../#/connexion">
              Voir les détails dans Be Happi
            </a>
          </div>
        )}
      </main>
    );

  const jours = [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n));
  const dJour = deIso(date);
  const cg = conge(dJour);
  const hh = Math.floor(minutes / 60);
  const mm = String(Math.floor(minutes) % 60).padStart(2, '0');
  const p = PERIODES[h - 1];
  const reste = direct && ecole && moment.enCours ? Math.max(0, Math.round(p.fm - minutesReelles)) : null;
  const congeAujourdhui = !ecole ? conge(maintenant) : null;
  const nomEspace = PROFILS.find((x) => x.id === profil)?.nom ?? '';

  const changerJour = (d: string) => {
    setJoue(false);
    setDirect(false);
    setDateChoisie(d);
    setMinutesChoisies(minutes);
  };
  const changerSemaine = (n: number) => changerJour(plusJoursIso(date, 7 * n));

  return (
    <div className={`pulse${choix ? ' pulse--fiche' : ''}`}>
      <header className="barre">
        <a className="marque" href="./" aria-label="Pulse, revenir à maintenant" onClick={(e) => { e.preventDefault(); revenir(); setChoix(null); }}>
          <Glyphe taille={38} />
          <span>Pulse</span>
        </a>
        {(demo || simulation) && (
          <a className="mode" href="../#/connexion" title={demo ? 'Données inventées' : 'Tes données importées, sur cet appareil seulement'}>
            {demo ? 'Démo' : 'Simulation'}
          </a>
        )}
        <nav className="jours" aria-label="Jour regardé">
          <button className="pas" onClick={() => changerSemaine(-1)} aria-label="Semaine précédente">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          {jours.map((d, i) => {
            const c = conge(deIso(d));
            return (
              <button key={d} className={`jour${c ? ' jour--conge' : ''}${d === aujourdhui ? ' jour--auj' : ''}`} aria-pressed={d === date} onClick={() => changerJour(d)} title={c ? c.nom : undefined}>
                <span>{JOURS_COURTS[i + 1]}</span>
                <b>{deIso(d).getDate()}</b>
              </button>
            );
          })}
          <button className="pas" onClick={() => changerSemaine(1)} aria-label="Semaine suivante">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </nav>
        <button className="chercher" onClick={() => setCommande(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <span>Chercher ou demander</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="menu-zone">
          <button className="rond" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Réglages et espaces">
            {(ds.moi.prenom || ds.moi.nom || '?').charAt(0).toUpperCase()}
            {(ds.moi.nom || '').charAt(0).toUpperCase()}
          </button>
          {menu && (
            <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
              {profils.length > 1 && (
                <>
                  <p className="discret">Espace affiché</p>
                  <div className="pastilles">
                    {PROFILS.filter((x) => profils.includes(x.id)).map((x) => (
                      <button key={x.id} className="pastille" aria-pressed={x.id === profil} onClick={() => { changerProfil(x.id); setChoix(null); }}>
                        {x.nom}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="discret">Tableau</p>
              <div className="pastilles">
                {(['noir', 'blanc'] as ThemePulse[]).map((t) => (
                  <button key={t} className="pastille" aria-pressed={theme === t} onClick={() => { appliquerThemePulse(t); setTheme(t); }}>
                    {t === 'noir' ? 'Tableau noir' : 'Tableau blanc'}
                  </button>
                ))}
              </div>
              <a className="lien" href="../">
                Ouvrir Be Happi, la version classique
              </a>
              <button className="lien" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>
                Plein écran (télé du hall, réunion)
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="corps">
        <section className="scene" aria-label="L’école">
          <div className="instant">
            <p className="horloge" aria-label={`${hh} h ${mm}`}>
              <span>{String(hh).padStart(2, '0')}</span>
              <span className="horloge-sep">:</span>
              <span>{mm}</span>
            </p>
            <div className="instant-texte">
              <p className="instant-moment">
                {moment.texte}
                {reste !== null && <span className="discret"> encore {reste} min</span>}
              </p>
              <p className="instant-jour">
                {JOURS[jourDeSemaine(dJour)].replace(/^./, (x) => x.toUpperCase())} {dJour.getDate()} {MOIS[dJour.getMonth()]}
                {nomEspace && !eleve ? <span className="discret"> pour l’espace {nomEspace.toLowerCase()}</span> : null}
              </p>
            </div>
            {direct ? (
              ecole ? (
                <span className="direct">
                  <i aria-hidden="true" />
                  En direct
                </span>
              ) : null
            ) : (
              <button className="btn btn--direct" onClick={revenir}>
                Revenir à maintenant
              </button>
            )}
          </div>

          {congeAujourdhui && direct && <p className="bandeau">Aujourd’hui : {congeAujourdhui.nom.toLowerCase()}. Voici le prochain jour de cours.</p>}
          {cg && !direct && <p className="bandeau">{cg.nom} : pas de cours ce jour-là.</p>}

          <div className="lentilles" role="tablist" aria-label="Ce que montre le plan">
            {lentilles.map((l) => (
              <button key={l.id} role="tab" aria-selected={l.id === lentille} onClick={() => { setLentille(l.id); if (l.id !== 'locaux') setChoix(null); }}>
                {l.nom}
              </button>
            ))}
          </div>

          <Plan
            locaux={ds.locaux}
            plan={plan}
            lentille={lentille}
            h={h}
            choisi={choix?.type === 'local' ? choix.nom : null}
            enAvant={enAvant}
            trajet={trajet}
            onChoisir={(code) => setChoix(choix?.type === 'local' && choix.nom === code ? null : { type: 'local', nom: code })}
          />

          {eleve ? (
            <p className="discret">Ta classe, heure par heure : la ligne relie les locaux de la journée. Fais glisser le temps pour suivre.</p>
          ) : (
            <ul className="legende" aria-label="Légende">
              <li className="leg leg--libre">Libre</li>
              <li className="leg leg--etude">Classe sans prof</li>
              <li className="leg leg--changement">Réservé ou déplacé</li>
              <li className="leg leg--ferme">Fermé</li>
              {moi && <li className="leg leg--moi">Toi</li>}
            </ul>
          )}
        </section>

        {fil && (
          <Panneau
            ds={ds}
            moi={moi}
            profil={profil}
            date={date}
            h={h}
            passe={passe}
            plan={plan}
            fil={fil}
            choix={choix}
            onChoix={setChoix}
            onHeure={allerHeure}
            onLentille={(l) => {
              setChoix(null);
              setLentille(l);
            }}
          />
        )}
      </main>

      <Ligne
        minutes={minutes}
        onMinutes={(m) => {
          setJoue(false);
          aller(m);
        }}
        pouls={ligne}
        mesHeures={mesHeures}
        occasions={occasions}
        maintenant={!direct && date === aujourdhui && ecole ? minutesReelles : null}
        joue={joue}
        onJoue={setJoue}
      />

      {commande && (
        <Commande
          ds={ds}
          profil={profil}
          onChoix={(c) => {
            setChoix(c);
            setLentille(eleve ? 'classe' : 'locaux');
          }}
          onMontrer={montrer}
          onFermer={() => setCommande(false)}
        />
      )}
      {store.apercuTeams && <ApercuMessage />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

const jourDeSemaine = (d: Date): number => (d.getDay() + 6) % 7 + 1;

/** En démo et en simulation, un message Teams est seulement montré. */
function ApercuMessage() {
  const { apercuTeams: m, fermerApercuTeams } = useStore();
  if (!m) return null;
  const texte = m.type === 'teams-chat' ? m.message : (m.contenu ?? '');
  return (
    <div className="commande-voile" onClick={fermerApercuTeams}>
      <div className="commande apercu" role="dialog" aria-modal="true" aria-label="Aperçu du message Teams" onClick={(e) => e.stopPropagation()}>
        <h2>Message Teams, en aperçu</h2>
        <p className="discret">En vrai, Teams s’ouvre déjà rempli ; il ne reste qu’à envoyer.</p>
        <p className="discret">Pour : {m.noms.join(', ')}</p>
        <p className="phrase apercu-texte">{texte}</p>
        <button className="btn btn--plein" onClick={fermerApercuTeams}>
          Fermer
        </button>
      </div>
    </div>
  );
}
