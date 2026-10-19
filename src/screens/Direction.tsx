// Écran « Tableau de bord » (direction) : les heures sans prof et celles récupérées, semaine par semaine,
// les classes les plus touchées, les collègues qui récupèrent des heures, l'occupation des locaux.
// Mêmes indicateurs que l'écran Direction de Power Apps, plus la remédiation et la tendance.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { Barres, type Colonne } from '../ui/Barres';
import { Remarques } from '../ui/Remarques';
import { statsPeriode, statsSignalements } from '../logic/stats';
import { joursDeCoursAvant, remarquesDirection } from '../logic/remarques';
import { nomAffiche } from '../logic/horaire';
import { deIso, estJourDeCours, iso, lundiDe, plusJoursIso } from '../lib/calendar';
import { lien } from '../lib/route';

type Periode = '4' | '8' | 'annee';
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function Direction() {
  const { ds, maintenant, aujourdhui } = useStore();
  const [periode, setPeriode] = useState<Periode>('8');
  const [toutesClasses, setToutesClasses] = useState(false);

  const calc = useMemo(() => {
    if (!ds) return null;
    const rentree = `${maintenant.getMonth() >= 7 ? maintenant.getFullYear() : maintenant.getFullYear() - 1}-08-25`;
    const lundiCourant = iso(lundiDe(maintenant));
    // En semaines de cours : les semaines de congé ne comptent pas.
    let du = rentree;
    if (periode !== 'annee') {
      du = lundiCourant;
      for (let k = 0, garde = 0; k < Number(periode) - 1 && garde < 60; garde++) {
        du = plusJoursIso(du, -7);
        if ([0, 1, 2, 3, 4].some((n) => estJourDeCours(deIso(plusJoursIso(du, n))))) k++;
      }
    }
    const s = statsPeriode(ds, du, aujourdhui);
    // La période d'avant, du même nombre de jours de cours, pour la tendance.
    let nbJours = 0;
    for (let d = du; d <= aujourdhui; d = plusJoursIso(d, 1)) if (estJourDeCours(deIso(d))) nbJours++;
    const p = joursDeCoursAvant(du, nbJours);
    const avant = statsPeriode(ds, p.du, p.au);
    const sig = statsSignalements(ds, aujourdhui);
    return { s, avant, sig, remarques: remarquesDirection(ds, maintenant), lundiCourant };
  }, [ds, periode, maintenant, aujourdhui]);

  if (!ds || !calc) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const { s, avant, sig, remarques, lundiCourant } = calc;
  const taux = Math.round(s.taux * 100);
  const diff = avant.heures >= 5 ? taux - Math.round(avant.taux * 100) : null;
  const colonnes: Colonne[] = s.semaines.map((w) => {
    const d = deIso(w.lundi);
    return {
      libelle: `${d.getDate()}/${d.getMonth() + 1}`,
      detail: `Semaine du ${d.getDate()} ${MOIS[d.getMonth()]}`,
      recup: w.recuperees,
      etude: w.sansProf - w.recuperees,
      enCours: w.lundi === lundiCourant,
    };
  });
  const classes = toutesClasses ? s.parClasse : s.parClasse.slice(0, 6);
  const maxClasse = Math.max(1, ...s.parClasse.map((c) => c.perdues));
  const occupes = s.occupation.slice(0, 5);
  const calmes = [...s.occupation].reverse().filter((o) => o.taux < 0.34);

  return (
    <section className="ecran ecran--large" aria-label="Tableau de bord">
      <Entete titre="Tableau de bord" sous="Heures sans prof, récupération, locaux" />

      <div className="seg seg--auto" role="group" aria-label="Période">
        <button aria-pressed={periode === '4'} onClick={() => setPeriode('4')}>4 semaines</button>
        <button aria-pressed={periode === '8'} onClick={() => setPeriode('8')}>8 semaines</button>
        <button aria-pressed={periode === 'annee'} onClick={() => setPeriode('annee')}>Depuis la rentrée</button>
      </div>

      <div className="grille-2 grille-2--heros">
        <section className="carte heros-stat" aria-label="Heures récupérées">
          <span className="petit fort">Heures de cours récupérées</span>
          <p className="chiffre-geant">
            {s.heures ? taux : '—'}
            <small>{s.heures ? ' %' : ''}</small>
          </p>
          <p className="texte">
            {s.heures ? `${s.parDeplacement + s.parRemediation} heures sur ${s.heures} sans prof ont été données quand même.` : 'Aucune heure sans prof sur la période.'}
          </p>
          {diff !== null && (
            <span className={`tendance ${diff >= 0 ? 'tendance--hausse' : 'tendance--baisse'}`}>
              <Icon nom={diff >= 0 ? 'etincelle' : 'attention'} taille={15} /> {diff >= 0 ? `+${diff}` : diff} points par rapport à la période d’avant
            </span>
          )}
        </section>
        <div className="tuiles-stat">
          <div className="tuile-stat">
            <span className="petit">Jours-prof d’absence</span>
            <b>{s.joursProf}</b>
          </div>
          <div className="tuile-stat">
            <span className="petit">Heures sans prof</span>
            <b>{s.heures}</b>
          </div>
          <div className="tuile-stat">
            <span className="petit">Par déplacement</span>
            <b>{s.parDeplacement}</b>
          </div>
          <div className="tuile-stat">
            <span className="petit">En remédiation</span>
            <b>{s.parRemediation}</b>
          </div>
        </div>
      </div>

      <section className="carte" aria-label="Semaine par semaine">
        <div className="pile">
          <h2 className="titre-m">Semaine par semaine</h2>
          <span className="petit">Hauteur : heures de cours sans prof. En indigo, celles qui ont été récupérées.</span>
        </div>
        {colonnes.length ? <Barres colonnes={colonnes} titre="Heures sans prof et heures récupérées par semaine" /> : <p className="petit">Pas encore de données.</p>}
      </section>

      <Remarques remarques={remarques} />

      <div className="grille-2">
        <section className="carte" aria-label="Classes les plus touchées">
          <div className="pile">
            <h2 className="titre-m">Classes les plus touchées</h2>
            <span className="petit">Heures sans prof sur la période, dont récupérées</span>
          </div>
          <ul className="barres-h">
            {classes.map((c) => (
              <li key={c.classe}>
                <span className="barres-h-nom">{c.classe}</span>
                <span className="barres-h-piste" aria-hidden="true">
                  <span className="barres-h-recup" style={{ width: `${(c.recuperees / maxClasse) * 100}%` }} />
                  <span className="barres-h-etude" style={{ width: `${((c.perdues - c.recuperees) / maxClasse) * 100}%` }} />
                </span>
                <span className="barres-h-val">
                  {c.perdues} h · {c.recuperees} réc.
                </span>
              </li>
            ))}
          </ul>
          {s.parClasse.length > 6 && (
            <button className="lien-action" onClick={() => setToutesClasses(!toutesClasses)}>
              {toutesClasses ? 'Moins' : `Les ${s.parClasse.length} classes`}
            </button>
          )}
        </section>

        <section className="carte" aria-label="Ils récupèrent des heures">
          <div className="pile">
            <h2 className="titre-m">Ils récupèrent des heures</h2>
            <span className="petit">Déplacements validés et remédiations données</span>
          </div>
          <ul className="lignes-reponse">
            {s.parCollegue.slice(0, 7).map((c) => (
              <li key={c.prof}>
                <span className="point-ton point-ton--indigo" aria-hidden="true" />
                <span className="pile grandit">
                  <span className="fort">{nomAffiche(c.prof)}</span>
                  <span className="petit">
                    {[c.deplacements ? `${c.deplacements} déplacement${c.deplacements > 1 ? 's' : ''}` : '', c.remediations ? `${c.remediations} remédiation${c.remediations > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <b className="mono">{c.deplacements + c.remediations}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grille-2">
        <section className="carte" aria-label="Occupation des locaux">
          <div className="pile">
            <h2 className="titre-m">Occupation des locaux</h2>
            <span className="petit">Heures de cours sur 45 par semaine (horaire habituel)</span>
          </div>
          <ul className="barres-h">
            {occupes.map((o) => (
              <li key={o.local}>
                <span className="barres-h-nom">{o.local}</span>
                <span className="barres-h-piste" aria-hidden="true">
                  <span className="barres-h-recup" style={{ width: `${o.taux * 100}%` }} />
                </span>
                <span className="barres-h-val">{Math.round(o.taux * 100)} %</span>
              </li>
            ))}
          </ul>
          <p className="texte">
            {calmes.length} {calmes.length > 1 ? 'locaux sont libres' : 'local est libre'} plus des deux tiers du temps
            {calmes.length ? ` (${calmes.slice(0, 5).map((o) => o.local).join(', ')}${calmes.length > 5 ? '…' : ''})` : ''}.
          </p>
        </section>

        <a className="carte carte--lien carte--colonne" href={lien('technique')} aria-label="Signalements">
          <div className="rangee">
            <span className={`vignette${sig.bloquants ? ' vignette--rose' : ''}`}>
              <Icon nom="outil" />
            </span>
            <span className="pile grandit">
              <span className="titre-m">Signalements</span>
              <span className="petit">{sig.ouverts} en cours · {sig.resolus} résolus</span>
            </span>
            <Icon nom="droite" />
          </div>
          {sig.bloquants > 0 && <span className="puce puce--rose">{sig.bloquants} {sig.bloquants > 1 ? 'locaux fermés' : 'local fermé'}</span>}
          {sig.plusVieux && <span className="texte">Le plus ancien : {sig.plusVieux.local || '—'}, ouvert depuis {sig.plusVieux.jours} jour{sig.plusVieux.jours > 1 ? 's' : ''}.</span>}
        </a>
      </div>
    </section>
  );
}
