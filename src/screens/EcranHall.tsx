// Écran du hall (#/ecran) : sur la télé de l'accueil ou de la salle des profs, les changements du jour
// classe par classe, l'heure qu'il est et les locaux fermés. Sans nom de prof par défaut (?noms=1 pour
// les afficher, par exemple en salle des profs). Se remet à jour toutes les 5 minutes.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { sansNom } from '../logic/publication';
import { triClasse } from '../logic/ouest';
import { titreSignalement } from '../logic/happi';
import { qrSvg } from '../lib/qr';
import { lienApp } from '../lib/liens';
import { dateLongue, estJourDeCours, periode, prochainJourDeCours, iso, situation, deIso } from '../lib/calendar';
import type { Changement } from '../data/types';

export function EcranHall({ params }: { params: URLSearchParams }) {
  const { ds, demo, maintenant, minutes, recharger } = useStore();
  const avecNoms = params.get('noms') === '1';
  const liste = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (demo) return;
    const id = window.setInterval(recharger, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [demo, recharger]);

  // Si tout ne tient pas à l'écran, on fait défiler doucement, page par page.
  useEffect(() => {
    const id = window.setInterval(() => setPage((p) => p + 1), 9000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    const el = liste.current;
    if (!el || el.scrollHeight <= el.clientHeight + 4) return;
    const suivant = el.scrollTop + el.clientHeight * 0.85;
    el.scrollTo({ top: suivant >= el.scrollHeight - 4 ? 0 : suivant, behavior: 'smooth' });
  }, [page]);

  if (!ds) return <section className="hall"><p>Chargement…</p></section>;
  const qr = qrSvg(lienApp('eleve'), 200);
  const sit = situation(minutes);
  const jourCours = estJourDeCours(maintenant) && sit.h <= 9;
  const date = jourCours ? iso(maintenant) : iso(prochainJourDeCours(maintenant, false));
  const parClasse = new Map<string, Changement[]>();
  for (const c of ds.changements.filter((x) => x.date === date)) parClasse.set(c.classe, [...(parClasse.get(c.classe) ?? []), c]);
  const classes = [...parClasse.keys()].sort(triClasse);
  const fermes = ds.signalements.filter((s) => s.bloquant && !s.resolu && s.local);
  const heure = `${String(maintenant.getHours()).padStart(2, '0')}:${String(maintenant.getMinutes()).padStart(2, '0')}`;
  const hNow = jourCours && sit.h >= 1 && sit.h <= 9 ? sit.h : undefined;

  return (
    <section className="hall" aria-label="Écran du hall">
      <header className="hall-tete">
        <a className="hall-marque" href="#/" aria-label="Revenir à Be Happi">
          <span className="hall-logo" aria-hidden="true">
            <Icon nom="etincelle" taille={28} />
          </span>
          <span>
            <b>Be Happi</b>
            <small>IPES Tubize</small>
          </span>
        </a>
        <div className="hall-heure">
          <b>{heure}</b>
          <span>
            {dateLongue(deIso(date)).replace(/^./, (x) => x.toUpperCase())}
            {hNow ? ` · H${hNow} jusqu’à ${periode(hNow).fin}` : jourCours ? '' : ' · prochain jour de cours'}
          </span>
        </div>
      </header>

      <div className="hall-corps">
        <section className="hall-changements" aria-label="Changements du jour">
          <h1>
            Changements du jour <span>{classes.length ? `${classes.length} classe${classes.length > 1 ? 's' : ''}` : ''}</span>
          </h1>
          {!classes.length && <p className="hall-vide">Aucun changement publié. Bonne journée !</p>}
          <div className="hall-liste" ref={liste}>
            {classes.map((cl) => (
              <article key={cl} className="hall-classe">
                <b className="hall-code">{cl}</b>
                <ul>
                  {parClasse.get(cl)!.sort((a, b) => a.h - b.h).map((c) => (
                    <li key={`${c.h}${c.titre}`} className={hNow && c.h < hNow ? 'passe' : hNow === c.h ? 'maintenant' : ''}>
                      <span className="hall-h">H{c.h} · {periode(c.h).debut}</span>
                      <span>{avecNoms ? c.titre : sansNom(c)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
        <aside className="hall-cote" aria-label="À savoir">
          {fermes.length > 0 && (
            <section>
              <h2>Locaux fermés</h2>
              {fermes.map((s) => (
                <p key={s.id ?? s.local}>
                  <b>{s.local}</b> {titreSignalement(s.titre, s.local).toLowerCase()}
                </p>
              ))}
            </section>
          )}
          <section className="hall-qr">
            <h2>Ta classe sur ton téléphone</h2>
            <span className="hall-qr-code" dangerouslySetInnerHTML={{ __html: qr }} />
            <p>Scanne, choisis ta classe : les changements y arrivent dès qu’ils sont publiés.</p>
          </section>
        </aside>
      </div>
      <footer className="hall-pied">Changements publiés par le secrétariat · mis à jour automatiquement</footer>
    </section>
  );
}
