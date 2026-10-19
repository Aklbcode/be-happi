// Écran « Happi » : poser une question comme à un collègue (au clavier ou à la voix) et recevoir une
// réponse branchée sur les listes de l'école, avec des actions prêtes (Teams, réserver, signaler).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { Regle, type TonRegle } from '../ui/Regle';
import { Remarques } from '../ui/Remarques';
import { repondre, suggestionsPour, type Action, type Bloc, type Reponse } from '../logic/happi';
import { remarquesDirection, remarquesProf, remarquesSecretariat, remarquesTechnique, remarquesVieScolaire, type Remarque } from '../logic/remarques';
import { periode } from '../lib/calendar';

interface Message {
  id: number;
  de: 'moi' | 'happi';
  texte: string;
  reponse?: Reponse;
}

// La conversation reste le temps de la session (on peut aller voir un écran et revenir).
let memoire: Message[] = [];
let suivant = 1;

type Reconnaissance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function reconnaissance(): Reconnaissance | null {
  const w = window as unknown as { SpeechRecognition?: new () => Reconnaissance; webkitSpeechRecognition?: new () => Reconnaissance };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export function Happi({ params }: { params: URLSearchParams }) {
  const store = useStore();
  const { ds, maintenant, heurePassee, profil, classeEleve, reserver, reserverMateriel, ouvrirTeams, montrerToast } = store;
  const [messages, setMessages] = useState<Message[]>(memoire);
  const [texte, setTexte] = useState('');
  const [pense, setPense] = useState(false);
  const [ecoute, setEcoute] = useState(false);
  const reco = useRef<Reconnaissance | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  const voixPossible = useMemo(() => typeof window !== 'undefined' && !!reconnaissance(), []);
  const moi = profil === 'prof' ? ds?.moi.nom ?? '' : '';

  const remarques: Remarque[] = useMemo(() => {
    if (!ds) return [];
    if (profil === 'prof') return remarquesProf(ds, ds.moi.nom, maintenant, heurePassee);
    if (profil === 'educateur') return remarquesVieScolaire(ds, maintenant, heurePassee);
    if (profil === 'secretariat') return remarquesSecretariat(ds, maintenant);
    if (profil === 'direction') return remarquesDirection(ds, maintenant);
    if (profil === 'technique') return remarquesTechnique(ds, maintenant);
    return [];
  }, [ds, profil, maintenant, heurePassee]);

  useEffect(() => {
    memoire = messages;
    fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pense]);

  function ajouter(m: Omit<Message, 'id'>) {
    setMessages((x) => [...x, { ...m, id: suivant++ }]);
  }

  function demander(question: string) {
    const q = question.trim();
    if (!q || !ds) return;
    ajouter({ de: 'moi', texte: q });
    setTexte('');
    setPense(true);
    const r = repondre(q, { ds, moi, profil, maintenant, heurePassee, classeEleve: classeEleve || undefined });
    window.setTimeout(() => {
      setPense(false);
      ajouter({ de: 'happi', texte: r.texte, reponse: r });
    }, 380);
  }

  // Question passée dans l'adresse (#/happi?q=…) : depuis « Happi a remarqué » ou un autre écran.
  const dejaPosee = useRef(false);
  useEffect(() => {
    const q = params.get('q');
    if (q && ds && !dejaPosee.current) {
      dejaPosee.current = true;
      demander(q);
      window.history.replaceState(null, '', '#/happi');
    }
  }, [ds]);

  async function agir(a: Action) {
    try {
      if (a.type === 'lien') window.location.hash = a.href.replace(/^#/, '');
      else if (a.type === 'question') demander(a.texte);
      else if (a.type === 'teams-chat' || a.type === 'teams-reunion') ouvrirTeams(a);
      else if (a.type === 'reserver-local') {
        await reserver({ date: a.date, h: a.h, local: a.local, classe: a.classe });
        montrerToast(`${a.local} réservé en H${a.h}`);
        ajouter({ de: 'happi', texte: `C'est réservé : ${a.local} en H${a.h} (${periode(a.h).debut})${a.classe ? ` pour la ${a.classe}` : ''}. Le local apparaît comme pris pour tout le monde.` });
      } else if (a.type === 'reserver-materiel') {
        await reserverMateriel({ date: a.date, h: a.h, rack: a.rack, classe: a.classe });
        montrerToast(`${a.rack} réservé en H${a.h}`);
        ajouter({ de: 'happi', texte: `C'est noté : ${a.rack} pour toi en H${a.h}${a.classe ? ` (${a.classe})` : ''}.` });
      } else if (a.type === 'signaler') {
        const p = new URLSearchParams({ local: a.local, texte: a.texte, ...(a.urgent ? { urgent: '1' } : {}) });
        window.location.hash = `/signaler?${p.toString()}`;
      }
    } catch (e) {
      ajouter({ de: 'happi', texte: `Je n'ai pas pu le faire : ${e instanceof Error ? e.message : e}` });
    }
  }

  function parler() {
    if (ecoute) {
      reco.current?.stop();
      return;
    }
    const r = reconnaissance();
    if (!r) return;
    reco.current = r;
    r.lang = 'fr-BE';
    r.interimResults = true;
    r.continuous = false;
    let dernier = '';
    r.onresult = (e) => {
      dernier = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>).map((x) => x[0].transcript).join(' ');
      setTexte(dernier);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed') montrerToast('Micro refusé : autorise-le dans le navigateur');
    };
    r.onend = () => {
      setEcoute(false);
      if (dernier.trim()) demander(dernier);
    };
    setEcoute(true);
    r.start();
  }

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const vide = messages.length === 0;
  const suggestions = suggestionsPour(profil);

  return (
    <section className="ecran ecran--happi" aria-label="Happi">
      <Entete titre="Happi" sous={profil === 'eleve' ? 'Ta classe, tes cours' : 'Ton assistant d’école'} />

      {vide && (
        <>
          <div className="carte-nuit happi-accueil">
            <span className="bulle-chargement bulle-chargement--petite" aria-hidden="true">
              <Icon nom="etincelle" taille={22} />
            </span>
            <h2 className="titre-l" style={{ color: '#fff' }}>
              {ds.moi.prenom && profil !== 'eleve' ? `${ds.moi.prenom}, que veux-tu savoir ?` : 'Que veux-tu savoir ?'}
            </h2>
            <p className="texte">
              {profil === 'eleve'
                ? 'Où est ta classe, quand tu as un cours, ce qui change aujourd’hui.'
                : 'Où est un collègue ou une classe, un local libre, une heure commune pour se réunir, qui peut aider… Écris ou parle, comme à un collègue.'}
            </p>
          </div>
          <div className="suggestions" aria-label="Exemples de questions">
            {suggestions.map((s) => (
              <button key={s} className="suggestion" onClick={() => demander(s)}>
                {s}
              </button>
            ))}
          </div>
          <Remarques remarques={remarques} />
        </>
      )}

      <div className="fil" aria-live="polite">
        {messages.map((m) =>
          m.de === 'moi' ? (
            <p key={m.id} className="bulle-moi">
              {m.texte}
            </p>
          ) : (
            <div key={m.id} className="bulle-happi">
              <span className="avatar-happi" aria-hidden="true">
                <Icon nom="etincelle" taille={16} />
              </span>
              <div className="pile pile--8 grandit">
                <p className="texte texte--fort">{m.texte}</p>
                {m.reponse?.blocs.map((b, i) => <BlocReponse key={i} bloc={b} agir={agir} />)}
                {!!m.reponse?.actions.length && (
                  <div className="rangee enrouler">
                    {m.reponse.actions.map((a, i) => (
                      <button key={i} className={`bouton bouton--petit ${i === 0 && a.type !== 'lien' ? 'bouton--prim' : 'bouton--sec'}`} onClick={() => void agir(a)}>
                        {iconeAction(a) && <Icon nom={iconeAction(a)!} taille={16} />}
                        {a.libelle}
                      </button>
                    ))}
                  </div>
                )}
                {!!m.reponse?.suggestions.length && (
                  <div className="suggestions suggestions--petites">
                    {m.reponse.suggestions.map((s) => (
                      <button key={s} className="suggestion" onClick={() => demander(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {pense && (
          <div className="bulle-happi" aria-label="Happi réfléchit">
            <span className="avatar-happi" aria-hidden="true">
              <Icon nom="etincelle" taille={16} />
            </span>
            <span className="points" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        <div ref={fin} />
      </div>

      <form
        className="saisie"
        onSubmit={(e) => {
          e.preventDefault();
          demander(texte);
        }}
      >
        <input
          className="saisie-champ"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={ecoute ? 'Je t’écoute…' : 'Pose ta question…'}
          aria-label="Ta question"
          enterKeyHint="send"
        />
        {voixPossible && (
          <button type="button" className={`rond${ecoute ? ' rond--ecoute' : ''}`} onClick={parler} aria-label={ecoute ? 'Arrêter la dictée' : 'Dicter la question'} aria-pressed={ecoute}>
            <Icon nom="micro" />
          </button>
        )}
        <button type="submit" className="rond rond--indigo" aria-label="Envoyer" disabled={!texte.trim()}>
          <Icon nom="envoyer" />
        </button>
      </form>
    </section>
  );
}

function iconeAction(a: Action): string | null {
  if (a.type === 'teams-chat') return 'message';
  if (a.type === 'teams-reunion') return 'agenda';
  if (a.type === 'reserver-local') return 'porte';
  if (a.type === 'reserver-materiel') return 'tablette';
  if (a.type === 'signaler') return 'outil';
  return null;
}

const TON: Record<string, TonRegle> = { indigo: 'indigo', orange: 'orange', rose: 'rose', gris: 'gris' };

function BlocReponse({ bloc, agir }: { bloc: Bloc; agir: (a: Action) => void }) {
  const [tout, setTout] = useState(false);
  if (bloc.type === 'journee') {
    const utiles = bloc.heures.filter((h) => h.ton !== 'gris');
    const visibles = tout ? bloc.heures : utiles.length ? utiles : bloc.heures;
    return (
      <div className="bloc-reponse">
        <span className="petit fort">{bloc.titre}</span>
        <Regle heures={bloc.heures.map((h) => ({ h: h.h, ton: TON[h.ton] }))} actuel={bloc.heures.find((h) => h.actuel)?.h} />
        <ul className="lignes-jour">
          {visibles.map((h) => (
            <li key={h.h} className={h.actuel ? 'actuel' : ''}>
              <span className="mono">H{h.h}</span>
              <span className={`point-ton point-ton--${h.ton}`} aria-hidden="true" />
              <span>{h.texte}</span>
            </li>
          ))}
        </ul>
        {utiles.length > 0 && utiles.length < bloc.heures.length && (
          <button className="lien-action" onClick={() => setTout(!tout)}>
            {tout ? 'Moins' : 'Toute la journée'}
          </button>
        )}
      </div>
    );
  }
  if (bloc.type === 'lignes') {
    return (
      <div className="bloc-reponse">
        {bloc.titre && <span className="petit fort">{bloc.titre}</span>}
        <ul className="lignes-reponse">
          {bloc.lignes.map((l, i) => (
            <li key={i}>
              <span className={`point-ton point-ton--${l.ton ?? 'gris'}`} aria-hidden="true" />
              <span className="pile grandit">
                <span className="fort">{l.titre}</span>
                {l.sous && <span className="petit">{l.sous}</span>}
                {l.action && (
                  <button className="lien-action lien-action--ligne" onClick={() => agir(l.action!)}>
                    {l.action.libelle}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="bloc-reponse">
      {bloc.titre && <span className="petit fort">{bloc.titre}</span>}
      <div className="rangee enrouler" style={{ gap: 6 }}>
        {bloc.puces.map((p, i) =>
          p.action ? (
            <button key={i} className="puce-action" onClick={() => agir(p.action!)} title={p.action.libelle}>
              {p.texte}
            </button>
          ) : (
            <span key={i} className="puce puce--grise">
              {p.texte}
            </span>
          ),
        )}
      </div>
      {bloc.puces.some((p) => p.action) && <span className="petit">Touche un local pour le réserver.</span>}
    </div>
  );
}
