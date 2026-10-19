// Chercher ou demander (⌘K) : un local, un prof, une classe — ou une question à Happi.
// Choisir un résultat le met en avant sur le plan, avec son trajet de la journée.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import type { Dataset, Profil } from '../data/types';
import { rechercher } from '../logic/ouest';
import { repondre, suggestionsPour, type Action, type Reponse } from '../logic/happi';
import { nomCourt } from './etat';
import type { Choix } from './Panneau';

interface Props {
  ds: Dataset;
  profil: Profil;
  onChoix: (c: Choix) => void;
  /** Montrer un local (ou tout le plan) à un jour et une heure. */
  onMontrer: (code: string | null, date: string, h: number) => void;
  onFermer: () => void;
}

export function Commande({ ds, profil, onChoix, onMontrer, onFermer }: Props) {
  const { maintenant, heurePassee, classeEleve, aujourdhui, ouvrirTeams, signaler, montrerToast } = useStore();
  const [q, setQ] = useState('');
  const [reponse, setReponse] = useState<Reponse | null>(null);
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const eleve = profil === 'eleve';

  useEffect(() => {
    champ.current?.focus();
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onFermer]);

  // Un élève ne cherche ni ne voit le personnel.
  const trouves = useMemo(() => (q.trim() ? rechercher(ds, q, 7).filter((t) => !(eleve && t.type === 'prof')) : []), [ds, q, eleve]);
  const suggestions = suggestionsPour(profil).slice(0, 4);

  function demander(question: string) {
    setQ(question);
    setReponse(repondre(question, { ds, moi: ds.moi.nom, profil, maintenant, heurePassee, classeEleve: classeEleve || undefined }));
  }

  function choisir(i: number) {
    const t = trouves[i];
    if (t) {
      onChoix({ type: t.type, nom: t.nom });
      onFermer();
    } else if (q.trim()) demander(q.trim());
  }

  async function agir(a: Action) {
    try {
      if (a.type === 'lien' && a.href.startsWith('#/locaux')) {
        // Les locaux libres se voient ici même, sur le plan, à l'heure demandée.
        const q = new URLSearchParams(a.href.split('?')[1] ?? '');
        onMontrer(null, q.get('date') ?? aujourdhui, Number(q.get('h') ?? 1));
        onFermer();
      } else if (a.type === 'lien') window.location.href = a.href.startsWith('#') ? `../${a.href}` : a.href;
      else if (a.type === 'teams-chat') ouvrirTeams({ type: 'teams-chat', emails: a.emails, noms: a.noms, message: a.message, sujet: a.sujet });
      else if (a.type === 'teams-reunion') ouvrirTeams({ type: 'teams-reunion', sujet: a.sujet, debut: a.debut, fin: a.fin, emails: a.emails, noms: a.noms, contenu: a.contenu });
      else if (a.type === 'reserver-local') {
        // On montre le local sur le plan : la fiche propose de le réserver, en un geste confirmé.
        onMontrer(a.local, a.date, a.h);
        onFermer();
      } else if (a.type === 'signaler') {
        await signaler(a.local, a.texte, a.urgent);
        montrerToast('Signalement envoyé au service technique');
      } else if (a.type === 'question') demander(a.texte);
      else if (a.type === 'reserver-materiel') window.location.href = `../#/materiel`;
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <div className="commande-voile" onClick={onFermer}>
      <div className="commande" role="dialog" aria-modal="true" aria-label="Chercher ou demander" onClick={(e) => e.stopPropagation()}>
        <form
          className="commande-champ"
          onSubmit={(e) => {
            e.preventDefault();
            choisir(actif);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <input
            ref={champ}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setReponse(null);
              setActif(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActif(Math.min(actif + 1, trouves.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActif(Math.max(actif - 1, 0));
              }
            }}
            placeholder={eleve ? 'Une classe, un local, ou une question' : 'Un local, un prof, une classe, ou une question'}
            aria-label="Chercher ou demander"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Échap</kbd>
        </form>

        {!q.trim() && (
          <div className="commande-suggestions">
            <p className="discret">Par exemple</p>
            <div className="pastilles">
              {suggestions.map((s) => (
                <button key={s} className="pastille" onClick={() => demander(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {q.trim() && !reponse && (
          <ul className="commande-resultats" role="listbox">
            {trouves.map((t, i) => (
              <li key={`${t.type}-${t.nom}`} role="option" aria-selected={i === actif}>
                <button className={i === actif ? 'actif' : ''} onMouseEnter={() => setActif(i)} onClick={() => choisir(i)}>
                  <span className={`type type--${t.type}`}>{t.type === 'prof' ? 'Prof' : t.type === 'classe' ? 'Classe' : 'Local'}</span>
                  <b>{t.type === 'prof' ? nomCourt(t.nom) : t.nom}</b>
                  <span className="discret">{t.type === 'local' ? 'Voir sur le plan' : 'Voir son trajet du jour'}</span>
                </button>
              </li>
            ))}
            <li role="option" aria-selected={actif === trouves.length}>
              <button className={actif === trouves.length ? 'actif' : ''} onMouseEnter={() => setActif(trouves.length)} onClick={() => demander(q.trim())}>
                <span className="type type--happi">Happi</span>
                <b>Demander « {q.trim()} »</b>
              </button>
            </li>
          </ul>
        )}

        {reponse && (
          <div className="commande-reponse" aria-live="polite">
            <p className="phrase">{reponse.texte}</p>
            {reponse.blocs.map((b, i) =>
              b.type === 'lignes' ? (
                <div key={i} className="bloc">
                  {b.titre && <h3>{b.titre}</h3>}
                  <ul className="liste">
                    {b.lignes.slice(0, 8).map((l, j) => (
                      <li key={j}>
                        {l.action ? (
                          <button className="ligne-fil" onClick={() => void agir(l.action!)}>
                            <b>{l.titre}</b>
                            {l.sous && <span>{l.sous}</span>}
                          </button>
                        ) : (
                          <div className="ligne-fil">
                            <b>{l.titre}</b>
                            {l.sous && <span>{l.sous}</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : b.type === 'journee' ? (
                <div key={i} className="bloc">
                  <h3>{b.titre}</h3>
                  <ul className="liste">
                    {b.heures.map((x) => (
                      <li key={x.h} className={x.actuel ? 'actuel' : ''}>
                        <div className="ligne-fil">
                          <b>H{x.h}</b>
                          <span>{x.texte}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div key={i} className="bloc">
                  {b.titre && <h3>{b.titre}</h3>}
                  <div className="pastilles">
                    {b.puces.map((x, j) => (
                      <button key={j} className="pastille" onClick={() => x.action && void agir(x.action)} disabled={!x.action}>
                        {x.texte}
                      </button>
                    ))}
                  </div>
                </div>
              ),
            )}
            {reponse.actions.length > 0 && (
              <div className="rang rang--enrouler">
                {reponse.actions.slice(0, 3).map((a, i) => (
                  <button key={i} className={`btn btn--petit${i === 0 ? ' btn--plein' : ''}`} onClick={() => void agir(a)}>
                    {a.libelle}
                  </button>
                ))}
              </div>
            )}
            {reponse.suggestions.length > 0 && (
              <div className="pastilles">
                {reponse.suggestions.slice(0, 3).map((s) => (
                  <button key={s} className="pastille" onClick={() => demander(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
