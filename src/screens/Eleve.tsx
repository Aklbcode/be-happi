// Vue élève : la journée et la semaine de sa classe, avec les changements publiés par le secrétariat.
// Aucune donnée du personnel : l'horaire des classes (sans nom de prof) et la liste Changements.

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { Feuille } from '../ui/Feuille';
import { Regle, type TonRegle } from '../ui/Regle';
import { journeeEleve, toutesLesClasses, triClasse } from '../logic/ouest';
import { calendrierIcs, joursDeCours, telecharger, type Evenement } from '../lib/ics';
import { JOURS, JOURS_COURTS, MIDI, PERIODES, RECRES, conge, dateLongue, deIso, estJourDeCours, iso, jourSemaine, jourSemaineIso, lundiDe, periode, plusJours, plusJoursIso, prochainJourDeCours, situation } from '../lib/calendar';

export function Eleve({ vue }: { vue: 'jour' | 'semaine' }) {
  const { ds, maintenant, aujourdhui, minutes, classeEleve, changerClasseEleve, montrerToast } = useStore();
  const [choix, setChoix] = useState(false);
  const classes = useMemo(() => (ds ? toutesLesClasses(ds).sort(triClasse) : []), [ds]);
  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const classe = classes.includes(classeEleve) ? classeEleve : '';
  const jourCours = estJourDeCours(maintenant) && situation(minutes).h <= 9;
  const date = jourCours ? aujourdhui : iso(prochainJourDeCours(maintenant, false));

  const choisir = (c: string) => {
    changerClasseEleve(c);
    setChoix(false);
  };

  const bouton = classe && (
    <button className="puce puce--indigo puce--bouton" onClick={() => setChoix(true)} aria-label={`Classe ${classe}, changer`}>
      {classe} <Icon nom="crayon" taille={14} />
    </button>
  );

  function exporter() {
    const evenements: Evenement[] = [];
    for (const d of joursDeCours(maintenant, 5)) {
      for (const x of journeeEleve(ds!, classe, d)) {
        if (!x.cours) continue;
        evenements.push({ uid: `${classe}-${d}-${x.h}`, date: d, hDebut: x.h, hFin: x.h, titre: x.cours.matiere || 'Cours', lieu: x.cours.local, description: `${classe} · H${x.h}` });
      }
    }
    telecharger(`horaire-${classe}.ics`, calendrierIcs(`Horaire ${classe}`, evenements));
    montrerToast('Agenda téléchargé : ouvre le fichier pour l’ajouter');
  }

  const selecteur = (
    <Feuille ouverte={choix || !classe} onFermer={() => setChoix(false)} titre="Choisir ma classe">
      <h2 className="titre-l">Ta classe</h2>
      <p className="texte">Be Happi s’en souvient sur cet appareil.</p>
      <div className="grille-classes">
        {classes.map((c) => (
          <button key={c} className="libre libre--classe" aria-pressed={c === classe} onClick={() => choisir(c)}>
            {c}
          </button>
        ))}
      </div>
    </Feuille>
  );

  if (!classe) {
    return (
      <section className="ecran" aria-label="Ma classe">
        <Entete titre="Ma classe" sous="Ton horaire et les changements du jour" />
        <p className="texte">Choisis ta classe pour voir ta journée.</p>
        {selecteur}
      </section>
    );
  }

  if (vue === 'semaine') return <Semaine classe={classe} bouton={bouton} selecteur={selecteur} exporter={exporter} />;

  const jour = journeeEleve(ds, classe, date);
  const sit = situation(minutes);
  const hNow = date === aujourdhui && sit.h >= 1 && sit.h <= 9 ? sit.h : undefined;
  const avec = jour.filter((x) => x.cours || x.changements.length);
  const changements = jour.flatMap((x) => x.changements);
  const ici = hNow ? jour[hNow - 1] : undefined;
  const ensuite = jour.find((x) => (hNow ? x.h > hNow : true) && (x.cours || x.changements.length));
  const ton = (x: (typeof jour)[number]): TonRegle => (x.changements.length ? 'orange' : x.cours ? 'indigo' : 'vide');
  const p = hNow ? periode(hNow) : null;
  const reste = p && sit.enCours ? p.fm - minutes : 0;

  return (
    <section className="ecran" aria-label="Ma classe">
      <Entete titre="Ma classe" sous={dateLongue(deIso(date)).replace(/^./, (x) => x.toUpperCase())} apres={bouton} />

      <section className="carte-nuit" aria-label="Maintenant">
        <span className="petit">{hNow ? `${sit.enCours ? 'Maintenant' : 'Tout de suite'} · H${hNow} · ${periode(hNow).debut}` : date === aujourdhui ? 'Aujourd’hui' : `Prochain jour de cours · ${dateLongue(deIso(date))}`}</span>
        {ici ? (
          <>
            <h2 className="titre-l" style={{ color: '#fff' }}>
              {ici.changements.length ? 'Changement' : ici.cours ? `${ici.cours.matiere} · ${ici.cours.local}` : 'Pas cours'}
            </h2>
            {ici.changements.map((c) => (
              <p key={c.titre} className="alerte-nuit">⚠ {c.titre}</p>
            ))}
            {reste > 0 && <p className="texte">Encore {reste} min</p>}
            {sit.enCours && p && (
              <div className="barre" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(100, ((minutes - p.dm) / (p.fm - p.dm)) * 100))}%` }} />
              </div>
            )}
          </>
        ) : (
          <h2 className="titre-l" style={{ color: '#fff' }}>
            {avec.length ? `De ${periode(avec[0].h).debut} à ${periode(avec[avec.length - 1].h).fin}` : 'Pas cours'}
          </h2>
        )}
        {ensuite && ensuite !== ici && (
          <div className="encart">
            <span className="vignette">
              <Icon nom="porte" />
            </span>
            <div className="pile grandit">
              <span className="petit" style={{ color: 'var(--nuit-texte-3)' }}>
                Ensuite · H{ensuite.h} · {periode(ensuite.h).debut}
              </span>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{ensuite.changements.length ? `⚠ ${ensuite.changements[0].titre}` : `${ensuite.cours?.matiere} · ${ensuite.cours?.local}`}</span>
            </div>
          </div>
        )}
      </section>

      <div className="carte">
        <div className="rangee rangee--entre">
          <h2 className="titre-m">Ta journée</h2>
          {changements.length > 0 ? <span className="puce puce--orange">{changements.length} changement{changements.length > 1 ? 's' : ''}</span> : <span className="puce puce--indigo">Aucun changement</span>}
        </div>
        <Regle heures={jour.map((x) => ({ h: x.h, ton: ton(x) }))} actuel={hNow} />
        <ol className="jour">
          {avec.map((x, i) => (
            <Fragment key={x.h}>
              <li>
                <span className="heure">{periode(x.h).debut}</span>
                <div className={`creneau${x.changements.length ? ' creneau--change' : ''}${x.h === MIDI && !x.changements.length ? ' creneau--midi' : ''}${x.h === hNow ? ' creneau--maintenant' : ''}`}>
                  <span className="pile grandit">
                    <span className="fort" style={{ color: 'inherit' }}>{x.cours?.matiere ?? 'Pas cours'}</span>
                    {x.changements.map((c) => (
                      <span key={c.titre} className="petit petit--change">⚠ {c.titre}</span>
                    ))}
                  </span>
                  {x.cours && <span className="local">{x.cours.local}</span>}
                </div>
              </li>
              {RECRES.includes(x.h) && i < avec.length - 1 && avec[i + 1].h > x.h && (
                <li>
                  <span />
                  <span className="pause">Récréation · {periode(x.h).fin}</span>
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      </div>

      <button className="bouton bouton--sec" onClick={exporter}>
        <Icon nom="agenda" taille={18} /> Mettre mon horaire dans mon agenda
      </button>
      <p className="petit">Les changements sont publiés par le secrétariat. En cas de doute, demande à l’éducateur.</p>
      {selecteur}
    </section>
  );
}

function Semaine({ classe, bouton, selecteur, exporter }: { classe: string; bouton: ReactNode; selecteur: ReactNode; exporter: () => void }) {
  const { ds, maintenant, aujourdhui } = useStore();
  const [decalage, setDecalage] = useState(0);
  if (!ds) return null;
  const base = jourSemaine(maintenant) >= 6 ? plusJours(maintenant, 8 - jourSemaine(maintenant)) : lundiDe(maintenant);
  const lundi = iso(plusJours(base, decalage * 7));
  const dates = [0, 1, 2, 3, 4].map((n) => plusJoursIso(lundi, n));
  const abrege = (m: string) => (m.length > 9 ? `${m.slice(0, 8)}.` : m);
  return (
    <section className="ecran" aria-label="Semaine de la classe">
      <Entete titre="Semaine" sous="Horaire de ta classe" apres={bouton} />
      <div className="rangee rangee--entre">
        <button className="rond" onClick={() => setDecalage(decalage - 1)} aria-label="Semaine précédente">
          <Icon nom="gauche" />
        </button>
        <span className="titre-s">
          {decalage === 0 ? 'Cette semaine' : decalage === 1 ? 'Semaine prochaine' : `Semaine du ${deIso(lundi).getDate()}/${deIso(lundi).getMonth() + 1}`}
        </span>
        <button className="rond" onClick={() => setDecalage(decalage + 1)} aria-label="Semaine suivante">
          <Icon nom="droite" />
        </button>
      </div>
      <div className="semaine-eleve" role="table" aria-label={`Horaire de la ${classe}`}>
        <span role="columnheader" />
        {dates.map((d) => (
          <span key={d} role="columnheader" className={`jour-entete${d === aujourdhui ? ' jour-entete--auj' : ''}`}>
            <b>{JOURS_COURTS[jourSemaineIso(d)]}</b>
            <span>{deIso(d).getDate()}</span>
          </span>
        ))}
        {PERIODES.map((p) => (
          <div key={p.h} role="row" className="semaine-eleve-ligne">
            <span role="rowheader" className="heure-col">
              <b>H{p.h}</b>
              <span>{p.debut}</span>
            </span>
            {dates.map((d) => {
              if (conge(deIso(d))) return <span key={d} role="cell" className="case case--conge" aria-label="Congé" />;
              const x = journeeEleve(ds, classe, d).find((y) => y.h === p.h);
              if (!x || (!x.cours && !x.changements.length)) return <span key={d} role="cell" className="case" />;
              return (
                <span key={d} role="cell" className={`case case--cours${x.changements.length ? ' case--change' : ''}`} title={x.changements.map((c) => c.titre).join(' · ') || undefined}>
                  <b>{x.changements.length ? '⚠' : ''}{abrege(x.cours?.matiere ?? 'Changement')}</b>
                  <span>{x.cours?.local}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="legende">
        <span><i className="carre carre--cours" /> cours</span>
        <span><i className="carre carre--orange" /> changement publié</span>
      </div>
      {(() => {
        const chg = ds.changements.filter((c) => c.classe === classe && dates.includes(c.date)).sort((a, b) => a.date.localeCompare(b.date) || a.h - b.h);
        return chg.length ? (
          <section className="carte" aria-label="Changements de la semaine">
            <h2 className="titre-s">Changements publiés</h2>
            {chg.map((c) => (
              <div key={`${c.date}${c.h}${c.titre}`} className="ligne-changement">
                <span className="mono">{JOURS[jourSemaineIso(c.date)].slice(0, 3)}. H{c.h}</span>
                <span className="grandit">⚠ {c.titre}</span>
              </div>
            ))}
          </section>
        ) : null;
      })()}
      <button className="bouton bouton--sec" onClick={exporter}>
        <Icon nom="agenda" taille={18} /> Mettre mon horaire dans mon agenda
      </button>
      {selecteur}
    </section>
  );
}
