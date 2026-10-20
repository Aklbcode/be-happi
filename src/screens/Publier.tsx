// Écran « Élèves » (secrétariat, éducateurs) : ce que chaque classe doit savoir aujourd'hui, si la
// publication est à jour, et « Publier pour les élèves » (mêmes textes que Power Apps, sans motif).

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { ChoixJour, prochainsJours } from '../ui/Choix';
import { etatPublication } from '../logic/publication';
import { triClasse } from '../logic/ouest';
import { dateLongue, deIso, estJourDeCours, periode } from '../lib/calendar';
import type { Changement } from '../data/types';

export function Publier() {
  const { ds, maintenant, aujourdhui, publier, montrerToast, profil } = useStore();
  const jours = useMemo(() => prochainsJours(maintenant, 5), [maintenant]);
  const [date, setDate] = useState(estJourDeCours(maintenant) ? aujourdhui : jours[0]);
  const [envoi, setEnvoi] = useState(false);
  const e = useMemo(() => (ds ? etatPublication(ds, date) : null), [ds, date]);
  if (!ds || !e) return <section className="ecran"><p className="texte">Chargement…</p></section>;

  const parClasse = new Map<string, Changement[]>();
  for (const c of e.calcule) parClasse.set(c.classe, [...(parClasse.get(c.classe) ?? []), c]);
  const classes = [...parClasse.keys()].sort(triClasse);
  const cle = (c: Changement) => `${c.classe}|${c.h}|${c.titre}`;
  const nouveaux = new Set(e.nouveaux.map(cle));
  const peutPublier = profil === 'secretariat' || profil === 'educateur';
  const etat = !e.dejaPublie ? (e.calcule.length ? 'jamais' : 'rien') : e.aJour ? 'ok' : 'perime';

  async function lancer() {
    setEnvoi(true);
    try {
      const n = await publier(date);
      montrerToast(`${n} changement${n > 1 ? 's' : ''} publié${n > 1 ? 's' : ''} pour les élèves`);
    } catch (err) {
      montrerToast(`Publication impossible : ${err instanceof Error ? err.message : err}`);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="ecran" aria-label="Publication pour les élèves">
      <Entete titre="Élèves" sous="Ce que chaque classe voit dans son app" />
      <ChoixJour jours={jours} date={date} aujourdhui={aujourdhui} onChoisir={setDate} />

      <section className={`carte-etat carte-etat--${etat}`} aria-live="polite">
        <span className="vignette">
          <Icon nom={etat === 'ok' || etat === 'rien' ? 'coche' : 'haut_parleur'} />
        </span>
        <div className="pile grandit">
          <h2 className="titre-m">
            {etat === 'ok' ? 'Les élèves sont à jour' : etat === 'rien' ? 'Rien à publier' : etat === 'jamais' ? 'Pas encore publié' : 'Les élèves ne sont pas à jour'}
          </h2>
          <p className="texte">
            {etat === 'perime'
              ? `${e.nouveaux.length} nouveauté${e.nouveaux.length > 1 ? 's' : ''}${e.retires.length ? ` et ${e.retires.length} ligne${e.retires.length > 1 ? 's' : ''} à retirer` : ''} depuis la dernière publication.`
              : etat === 'jamais'
                ? `${e.calcule.length} changement${e.calcule.length > 1 ? 's' : ''} à annoncer ${date === aujourdhui ? "aujourd'hui" : dateLongue(deIso(date))}.`
                : etat === 'ok'
                  ? `${e.publie.length} ligne${e.publie.length > 1 ? 's' : ''} publiée${e.publie.length > 1 ? 's' : ''}. La Tour vous prévient dès que quelque chose change.`
                  : 'Pas de prof absent, pas de déplacement, pas de changement de local.'}
          </p>
        </div>
      </section>

      {peutPublier && etat !== 'ok' && etat !== 'rien' && (
        <button className="bouton bouton--prim bouton--grand" disabled={envoi} onClick={() => void lancer()}>
          <Icon nom="haut_parleur" /> {envoi ? 'Publication…' : etat === 'perime' ? 'Republier pour les élèves' : 'Publier pour les élèves'}
        </button>
      )}

      {e.retires.length > 0 && (
        <section className="carte" aria-label="Lignes qui disparaîtront">
          <h2 className="titre-s">Ne sera plus annoncé</h2>
          {e.retires.map((c) => (
            <p key={cle(c)} className="texte texte--barre">
              {c.classe} · H{c.h} · {c.titre}
            </p>
          ))}
        </section>
      )}

      <section className="pile pile--12" aria-label="Aperçu par classe">
        <h2 className="titre-m">Comme les élèves le voient</h2>
        {!classes.length && <p className="petit">Aucun changement ce jour-là.</p>}
        {classes.map((cl) => (
          <article key={cl} className="carte carte--serree">
            <div className="rangee">
              <span className="rond rond--indigo rond--classe">{cl}</span>
              <span className="petit">{parClasse.get(cl)!.length} changement{parClasse.get(cl)!.length > 1 ? 's' : ''}</span>
            </div>
            {parClasse.get(cl)!.map((c) => (
              <div key={cle(c)} className="ligne-changement">
                <span className="mono">H{c.h} · {periode(c.h).debut}</span>
                <span className="grandit">⚠ {c.titre}</span>
                {e.dejaPublie && nouveaux.has(cle(c)) && <span className="puce puce--orange">Nouveau</span>}
              </div>
            ))}
          </article>
        ))}
      </section>
      <p className="petit">
        Même résultat que le bouton « Publier pour les élèves » de Power Apps : les deux apps peuvent publier. La Tour annonce en plus les remédiations au lieu de « étude ».
      </p>
    </section>
  );
}
