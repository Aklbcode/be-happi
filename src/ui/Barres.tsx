// Colonnes empilées semaine par semaine : heures récupérées (indigo, en bas) et heures à l'étude
// (orange, au-dessus) ; la hauteur totale = les heures sans prof. Infobulle au survol, au toucher et
// au clavier, et une vue en tableau pour tout lire sans survoler.

import { useState } from 'react';

export interface Colonne {
  libelle: string;
  detail: string;
  recup: number;
  etude: number;
  enCours?: boolean;
}

function graduations(max: number): number[] {
  const pas = max <= 8 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : 20;
  const haut = Math.max(pas, Math.ceil(max / pas) * pas);
  const t: number[] = [];
  for (let v = 0; v <= haut; v += pas) t.push(v);
  return t;
}

export function Barres({ colonnes, titre }: { colonnes: Colonne[]; titre: string }) {
  const [actif, setActif] = useState<number | null>(null);
  const [tableau, setTableau] = useState(false);
  const max = Math.max(1, ...colonnes.map((c) => c.recup + c.etude));
  const ticks = graduations(max);
  const haut = ticks[ticks.length - 1];
  const pct = (v: number) => `${(v / haut) * 100}%`;

  return (
    <figure className="graphe" aria-label={titre}>
      <div className="rangee rangee--entre">
        <div className="legende" aria-hidden={tableau}>
          <span><i className="carre carre--recup" /> récupérées</span>
          <span><i className="carre carre--etude" /> à l’étude</span>
        </div>
        <button className="lien-action" onClick={() => setTableau(!tableau)} aria-pressed={tableau}>
          {tableau ? 'Voir le graphique' : 'Voir en tableau'}
        </button>
      </div>
      {tableau ? (
        <table className="tableau">
          <thead>
            <tr>
              <th scope="col">Semaine</th>
              <th scope="col">Sans prof</th>
              <th scope="col">Récupérées</th>
              <th scope="col">Taux</th>
            </tr>
          </thead>
          <tbody>
            {colonnes.map((c) => (
              <tr key={c.libelle}>
                <th scope="row">{c.detail}{c.enCours ? ' (en cours)' : ''}</th>
                <td>{c.recup + c.etude} h</td>
                <td>{c.recup} h</td>
                <td>{c.recup + c.etude ? `${Math.round((c.recup / (c.recup + c.etude)) * 100)} %` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="graphe-cadre">
          <div className="graphe-axe-y" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ bottom: pct(t) }}>{t}</span>
            ))}
          </div>
          <div className="graphe-zone">
            {ticks.map((t) => (
              <i key={t} className="graphe-ligne" style={{ bottom: pct(t) }} aria-hidden="true" />
            ))}
            <div className="graphe-colonnes">
              {colonnes.map((c, i) => {
                const total = c.recup + c.etude;
                const taux = total ? Math.round((c.recup / total) * 100) : 0;
                return (
                  <button
                    key={c.libelle}
                    className={`graphe-col${actif === i ? ' graphe-col--actif' : ''}${c.enCours ? ' graphe-col--encours' : ''}`}
                    onPointerEnter={() => setActif(i)}
                    onPointerLeave={() => setActif((x) => (x === i ? null : x))}
                    onFocus={() => setActif(i)}
                    onBlur={() => setActif((x) => (x === i ? null : x))}
                    onClick={() => setActif(actif === i ? null : i)}
                    aria-label={`${c.detail} : ${total} heures sans prof, ${c.recup} récupérées (${taux} %)${c.enCours ? ', semaine en cours' : ''}`}
                  >
                    <span className="graphe-pile">
                      {c.etude > 0 && <span className={`graphe-seg graphe-seg--etude${c.recup === 0 ? ' graphe-seg--seul' : ''}`} style={{ height: pct(c.etude) }} />}
                      {c.recup > 0 && <span className={`graphe-seg graphe-seg--recup${c.etude === 0 ? ' graphe-seg--haut' : ''}`} style={{ height: pct(c.recup) }} />}
                    </span>
                    {actif === i && (
                      <span className={`bulle-graphe${i > colonnes.length / 2 ? ' bulle-graphe--gauche' : ''}`} role="tooltip">
                        <b>{taux} %</b>
                        <span>{c.detail}{c.enCours ? ' · en cours' : ''}</span>
                        <span><i className="trait trait--recup" />{c.recup} h récupérées</span>
                        <span><i className="trait trait--etude" />{c.etude} h à l’étude</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="graphe-axe-x" aria-hidden="true">
            {colonnes.map((c) => (
              <span key={c.libelle}>{c.libelle}</span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
