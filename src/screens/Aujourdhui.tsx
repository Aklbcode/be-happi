// Écran « Aujourd'hui » : ce qui se passe maintenant, la meilleure suggestion, la journée, les infos.

import { useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { Feuille } from '../ui/Feuille';
import { coursDuProf, coursSansProf, nomAffiche, peutPrendre, type CoursJour } from '../logic/horaire';
import { heureLibre, optionsPour, type OptionDeplacement } from '../logic/deplacements';
import { etatLocal } from '../logic/occupation';
import { JOURS, MIDI, RECRES, conge, dateLongue, estJourDeCours, jourSemaineIso, periode, prochainJourDeCours, situation, iso } from '../lib/calendar';
import { blagueDuJour } from '../data/blagues';
import { lien } from '../lib/route';
import { moment, suiviDuProf } from '../logic/suivi';
import { remarquesProf } from '../logic/remarques';
import { Remarques } from '../ui/Remarques';
import { useMoi } from '../ui/Moi';

const ICONES_INFO: Record<string, string> = { Info: 'note', Retard: 'horloge', 'Éducateur absent': 'gens', 'Changement de local': 'porte' };

type Ligne =
  | { type: 'cours'; h: number; c: CoursJour; style: string; droite: string }
  | { type: 'libre'; h: number; style: string; texte: string; nb: number }
  | { type: 'pause'; libelle: string };

export function Aujourdhui() {
  const { ds, demo, maintenant, aujourdhui, minutes, heureFinie, heurePassee, reserver, montrerToast, peutValider } = useStore();
  const { ouvrir: ouvrirMoi } = useMoi();
  const [remedOuverte, setRemedOuverte] = useState(false);
  const [suggestionCachee, setSuggestionCachee] = useState(false);
  const [infoDemo, setInfoDemo] = useState(false);

  const calc = useMemo(() => {
    if (!ds) return null;
    const moi = ds.moi.nom;
    const jourCours = estJourDeCours(maintenant);
    const mesCours = jourCours ? coursDuProf(ds, moi, aujourdhui, true) : [];
    const sit = situation(minutes);
    const finieEff = sit.enCours ? sit.h : heureFinie;
    const coursMaintenant = sit.enCours ? mesCours.find((c) => c.h === sit.h) : undefined;
    const prochain = mesCours.find((c) => (sit.enCours ? c.h > sit.h : c.h >= sit.h));
    const libreMaintenant = jourCours && sit.enCours && !coursMaintenant && heureLibre(ds, moi, aujourdhui, sit.h);
    const aLEtude = libreMaintenant
      ? coursSansProf(ds, aujourdhui, sit.h).filter((c) => c.prof !== moi && c.classes.some((cl) => peutPrendre(ds, moi, cl)))
      : [];

    const optionsParHeure = new Map<number, OptionDeplacement[]>();
    let meilleure: OptionDeplacement | null = null;
    if (jourCours) {
      for (let h = Math.max(finieEff + 1, 1); h <= 9; h++) {
        const opts = optionsPour(ds, moi, aujourdhui, h, aujourdhui, finieEff);
        if (opts.length) optionsParHeure.set(h, opts);
        for (const o of opts) if (!meilleure || o.score > meilleure.score) meilleure = o;
      }
    }
    if (meilleure && meilleure.score < 2) meilleure = null;

    const lignes: Ligne[] = [];
    if (mesCours.length) {
      const hs = mesCours.map((c) => c.h);
      const debut = Math.min(...hs, sit.enCours ? sit.h : 9);
      const fin = Math.max(...hs);
      for (let h = debut; h <= fin; h++) {
        const c = mesCours.find((x) => x.h === h);
        const passe = h <= heureFinie && !(sit.enCours && h === sit.h);
        const actuel = sit.enCours && h === sit.h;
        if (c) {
          let style = '';
          let droite = `H${h}`;
          if (c.deplace && c.deplace.statut === 'Validé') { style = 'creneau--deplace'; droite = 'déplacé ici'; }
          else if (c.deplace) { style = 'creneau--attente'; droite = 'en attente'; }
          else if (passe) style = 'creneau--passe';
          else if (actuel) { style = 'creneau--maintenant'; droite = 'en cours'; }
          else if (h === MIDI) { style = 'creneau--midi'; droite = 'H5 · temps de midi'; }
          if (h === fin && !c.deplace && !passe && !actuel && h !== MIDI) droite = `fin ${periode(h).fin}`;
          lignes.push({ type: 'cours', h, c, style, droite });
        } else {
          const nb = optionsParHeure.get(h)?.length ?? 0;
          if (actuel) lignes.push({ type: 'libre', h, style: 'creneau--maintenant', texte: 'Libre · maintenant', nb: 0 });
          else if (nb && !passe) lignes.push({ type: 'libre', h, style: 'creneau--possible', texte: `Libre · ${nb > 1 ? `${nb} cours peuvent venir` : `${optionsParHeure.get(h)![0].classe} peut venir`}`, nb });
          else lignes.push({ type: 'libre', h, style: passe ? 'creneau--passe' : '', texte: h === MIDI ? 'Temps de midi' : 'Libre', nb: 0 });
        }
        if (RECRES.includes(h) && h < fin) lignes.push({ type: 'pause', libelle: `Récréation · ${periode(h).fin}` });
      }
    }

    const prochainJour = prochainJourDeCours(maintenant, false);
    const premierDemain = coursDuProf(ds, moi, iso(prochainJour))[0];
    const suivi = suiviDuProf(ds, moi, aujourdhui);
    const aValider = ds.deplacements.filter((d) => d.statut === 'En attente').length;
    const infos = ds.infos.filter((i) => i.date === aujourdhui);
    const remarques = remarquesProf(ds, moi, maintenant, heurePassee);
    return { moi, jourCours, mesCours, sit, coursMaintenant, prochain, libreMaintenant, aLEtude, meilleure, lignes, prochainJour, premierDemain, suivi, aValider, infos, remarques };
  }, [ds, maintenant, aujourdhui, minutes, heureFinie, heurePassee]);

  if (!ds || !calc) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const { jourCours, mesCours, sit, coursMaintenant, prochain, libreMaintenant, aLEtude, meilleure, lignes, prochainJour, premierDemain, suivi, aValider, infos, remarques } = calc;
  const initiales = `${ds.moi.prenom.charAt(0)}${ds.moi.nom.charAt(0)}`.toUpperCase();

  async function prendre(cl: string, localPrevu: string) {
    const h = sit.h;
    const local = etatLocal(ds!, calc!.moi, localPrevu, aujourdhui, h).etat === 'libre'
      ? localPrevu
      : ds!.locaux.find((l) => l.type === 'Classe' && etatLocal(ds!, calc!.moi, l.code, aujourdhui, h).etat === 'libre')?.code ?? localPrevu;
    try {
      await reserver({ date: aujourdhui, h, local, classe: `${cl} · remédiation`, note: 'remédiation' });
      setRemedOuverte(false);
      montrerToast(`C'est noté : la ${cl} te rejoint en ${local}`);
    } catch (e) {
      montrerToast(`Impossible d'enregistrer : ${e instanceof Error ? e.message : e}`);
    }
  }

  let carte: ReactNode;
  if (!jourCours) {
    const c = conge(maintenant);
    carte = (
      <CarteNuit surtitre="Aujourd'hui" titre={c ? c.nom : "Pas cours aujourd'hui"} texte={`Reprise ${dateLongue(prochainJour)}`}>
        {premierDemain && <Encart icone="porte" haut={`Premier cours · H${premierDemain.h} · ${periode(premierDemain.h).debut}`} bas={`${premierDemain.classe} · ${premierDemain.local}`} />}
      </CarteNuit>
    );
  } else if (sit.h === 0) {
    carte = (
      <CarteNuit surtitre="Avant les cours" titre="Les cours commencent à 8h25" texte={mesCours.length ? `${mesCours.length} cours aujourd'hui` : "Pas de cours pour toi aujourd'hui"}>
        {prochain && <Encart icone="porte" haut={`Premier cours · H${prochain.h} · ${periode(prochain.h).debut}`} bas={`${prochain.classe} · ${prochain.local}`} />}
      </CarteNuit>
    );
  } else if (sit.enCours) {
    const p = periode(sit.h);
    const reste = p.fm - minutes;
    const avance = Math.max(0, Math.min(100, ((minutes - p.dm) / (p.fm - p.dm)) * 100));
    carte = (
      <CarteNuit
        surtitre={`Maintenant · H${sit.h} · ${String(Math.floor(minutes / 60))}h${String(minutes % 60).padStart(2, '0')}`}
        titre={coursMaintenant ? `${coursMaintenant.classe} · ${coursMaintenant.local}` : libreMaintenant ? 'Heure libre' : 'Pas de cours pour toi'}
        texte={`Encore ${reste} min · jusqu'à ${p.fin}`}
        vivant
        avance={avance}
      >
        {prochain && <Encart icone="porte" haut={`Ensuite · H${prochain.h} · ${periode(prochain.h).debut}`} bas={`${prochain.classe} · ${prochain.local}`} />}
        {aLEtude.length > 0 && (
          <button className="bouton bouton--blanc" onClick={() => setRemedOuverte(true)}>
            <span className="rangee">
              <Icon nom="livre" />
              {aLEtude.length > 1 ? `${aLEtude.length} classes à l'étude : prends-en une` : `La ${aLEtude[0].classe} est à l'étude : prends-la`}
            </span>
            <Icon nom="droite" />
          </button>
        )}
      </CarteNuit>
    );
  } else if (sit.h >= 10 || (mesCours.length && sit.h > Math.max(...mesCours.map((c) => c.h)))) {
    carte = (
      <CarteNuit surtitre="Fin de journée" titre="Ta journée est finie" texte={`Prochain jour de cours : ${dateLongue(prochainJour)}`}>
        {premierDemain && <Encart icone="porte" haut={`Premier cours · H${premierDemain.h} · ${periode(premierDemain.h).debut}`} bas={`${premierDemain.classe} · ${premierDemain.local}`} />}
      </CarteNuit>
    );
  } else {
    carte = (
      <CarteNuit surtitre="Pause" titre={RECRES.includes(sit.h - 1) ? 'Récréation' : 'Entre deux heures'} texte={`Reprise à ${periode(sit.h).debut}`}>
        {prochain && <Encart icone="porte" haut={`Ensuite · H${prochain.h} · ${periode(prochain.h).debut}`} bas={`${prochain.classe} · ${prochain.local}`} />}
      </CarteNuit>
    );
  }

  return (
    <section className="ecran" aria-label="Aujourd'hui">
      <header className="entete">
        <div className="pile grandit">
          <p className="sous-titre">{dateLongue(maintenant).replace(/^./, (x) => x.toUpperCase())}</p>
          <h1 className="titre-xl">Bonjour {ds.moi.prenom || 'à toi'}</h1>
        </div>
        <div className="rangee">
          {demo && (
            <button className="puce puce--demo" onClick={() => setInfoDemo(true)}>
              Démo
            </button>
          )}
          <button onClick={ouvrirMoi} className="rond rond--nuit" aria-label="Moi et mes espaces">
            {initiales}
          </button>
        </div>
      </header>

      {carte}

      {peutValider && aValider > 0 && (
        <a className="carte" href={lien('validations')} style={{ flexDirection: 'row', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <span className="vignette" style={{ position: 'relative' }}>
            <Icon nom="echange" />
            <span className="pastille">{aValider}</span>
          </span>
          <span className="pile grandit">
            <span className="titre-s">{aValider > 1 ? `${aValider} déplacements à valider` : 'Un déplacement à valider'}</span>
            <span className="petit">Revérifiés en direct : prof, classes, local</span>
          </span>
          <Icon nom="droite" />
        </a>
      )}

      {meilleure && !suggestionCachee && (
        <section className="carte" aria-label="Suggestion de déplacement">
          <div className="rangee">
            <span className="puce puce--orange">
              <Icon nom="echange" taille={16} epaisseur={2} />
              Déplacement possible
            </span>
          </div>
          <h2 className="titre-m">
            Ta {meilleure.classe} est libre à {periode(meilleure.h).debut}
          </h2>
          <p className="texte">
            {nomAffiche(meilleure.absent)} est absent·e en H{meilleure.h}. Avance ton cours de{' '}
            <strong className="fort">
              {meilleure.semaineSuivante ? `${JOURS[jourSemaineIso(meilleure.dateO)]} prochain` : JOURS[jourSemaineIso(meilleure.dateO)]} H{meilleure.hO}
            </strong>{' '}
            : {meilleure.avantages[0].charAt(0).toLowerCase() + meilleure.avantages[0].slice(1)}.
          </p>
          <div className="rangee enrouler">
            {meilleure.avantages.slice(1, 3).map((a) => (
              <span key={a} className="puce puce--indigo puce--long">
                <Icon nom="coche" taille={15} epaisseur={2.2} />
                {a}
              </span>
            ))}
          </div>
          <div className="rangee">
            <a className="bouton bouton--prim grandit" href={lien('deplacer', { date: meilleure.date, h: meilleure.h, o: meilleure.cle })}>
              Voir et proposer
            </a>
            <button className="bouton bouton--sec" onClick={() => setSuggestionCachee(true)}>
              Plus tard
            </button>
          </div>
        </section>
      )}

      {suivi.length > 0 && (
        <section className="carte" aria-label="Tes propositions">
          <h2 className="titre-s">Tes propositions</h2>
          {suivi.map((x, i) => (
            <div key={i} className="suivi">
              <div className="rangee rangee--entre">
                <span className={`puce ${x.statut === 'Validé' ? 'puce--indigo' : x.statut === 'Refusé' ? 'puce--rose' : 'puce--orange'}`}>{x.statut}</span>
                {x.quand && <span className="petit">{moment(x.quand)}</span>}
              </div>
              <span className="texte" style={{ color: 'var(--encre)' }}>
                <strong className="fort">{x.classe}</strong> · {x.trajet}
                {x.local ? ` · local ${x.local}` : ''}
              </span>
              {x.statut === 'En attente' && <span className="petit">L'éducateur la voit dans Be Happi et dans Power Apps.</span>}
              {x.commentaire && (
                <span className="texte">
                  « {x.commentaire} »{x.par ? ` · ${x.par}` : ''}
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      <Remarques remarques={remarques} />

      {lignes.length > 0 && (
        <section aria-label="Ta journée" className="pile pile--12">
          <div className="rangee rangee--entre">
            <h2 className="titre-m">Ta journée</h2>
            <a href={lien('horaire')} className="petit fort" style={{ color: 'var(--indigo-encre)', textDecoration: 'none' }}>
              Voir la semaine
            </a>
          </div>
          <ol className="jour">
            {lignes.map((l, i) =>
              l.type === 'pause' ? (
                <li key={`p${i}`}>
                  <span />
                  <span className="pause">{l.libelle}</span>
                </li>
              ) : (
                <li key={`h${l.h}`}>
                  <span className="heure">{periode(l.h).debut}</span>
                  {l.type === 'cours' ? (
                    <div className={`creneau ${l.style}`}>
                      {l.style === 'creneau--passe' && <Icon nom="coche" taille={16} epaisseur={2.2} />}
                      {l.style === 'creneau--maintenant' && <span className="point point--vivant" />}
                      <span className="fort" style={{ color: 'inherit' }}>{l.c.classe}</span>
                      <span className="local">{l.c.local}</span>
                      <span className="droite">{l.droite}</span>
                    </div>
                  ) : l.nb > 0 ? (
                    <a className={`creneau ${l.style}`} href={lien('deplacer', { date: aujourdhui, h: l.h })}>
                      <Icon nom="echange" taille={16} epaisseur={2} />
                      <span>{l.texte}</span>
                      <span className="droite" style={{ color: 'inherit' }}>H{l.h}</span>
                    </a>
                  ) : (
                    <div className={`creneau ${l.style}`} style={l.style ? undefined : { background: 'transparent', borderStyle: 'dashed' }}>
                      {l.style === 'creneau--maintenant' && <span className="point point--vivant" />}
                      <span style={{ color: l.style ? 'inherit' : 'var(--discret)' }}>{l.texte}</span>
                      <span className="droite">H{l.h}</span>
                    </div>
                  )}
                </li>
              ),
            )}
          </ol>
        </section>
      )}

      <section className="pile pile--12" aria-label="Infos du jour">
        <div className="rangee rangee--entre">
          <h2 className="titre-m">Infos du jour</h2>
          <a href={lien('infos')} className="petit fort" style={{ color: 'var(--indigo-encre)', textDecoration: 'none' }}>
            Toutes les infos
          </a>
        </div>
        {!infos.length && <p className="petit">Aucune info publiée aujourd’hui.</p>}
        {infos.map((info, i) => (
          <div key={info.id ?? i} className="carte carte--info">
            <span className="vignette">
              <Icon nom={ICONES_INFO[info.categorie] ?? 'note'} />
            </span>
            <div className="pile grandit">
              <span className="petit">{info.categorie}</span>
              <span className="titre-s">{info.titre}</span>
            </div>
          </div>
        ))}
        <div className="carte carte--grise">
          <span className="petit fort">Blague du jour</span>
          <p className="texte" style={{ color: 'var(--encre)' }}>{blagueDuJour(maintenant)}</p>
        </div>
      </section>

      <Feuille ouverte={remedOuverte} onFermer={() => setRemedOuverte(false)} titre="Classes à l'étude">
        <h2 className="titre-l">Remédiation au lieu de l'étude</h2>
        <p className="texte">Ces classes n'ont pas de prof en H{sit.h}. Prends-en une pour une heure de remédiation dans ta matière.</p>
        {aLEtude.map((c) => (
          <div key={c.id} className="carte" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <span className="vignette" style={{ background: 'var(--nuit)', color: '#fff', width: 52, height: 52, fontFamily: 'var(--police-titre)', fontWeight: 800 }}>
              {c.classe}
            </span>
            <div className="pile grandit">
              <span className="titre-s">Cours prévu : {c.matiere || 'cours'}</span>
              <span className="petit">{nomAffiche(c.prof)} est absent·e · local {c.local}</span>
            </div>
            <button className="bouton bouton--prim bouton--petit" onClick={() => void prendre(c.classe, c.local)}>
              Je la prends
            </button>
          </div>
        ))}
        <p className="petit">Tu vois les classes de ton degré et des degrés inférieurs.</p>
      </Feuille>

      <Feuille ouverte={infoDemo} onFermer={() => setInfoDemo(false)} titre="Mode démo">
        <h2 className="titre-l">Mode démo</h2>
        <p className="texte">
          Tu regardes la vraie app avec des données fictives : un lundi type, avec des collègues absents, des heures libérées et un local en panne. Les noms des collègues sont inventés.
        </p>
        <p className="texte">
          Six espaces à essayer : prof, éducateur, secrétariat, direction, service technique et élève. Chacun voit d’abord ce qui le concerne.
        </p>
        <p className="texte">Dès que l'école aura activé la connexion, l'app lira directement les listes SharePoint (horaires, absences, réservations…).</p>
        <div className="rangee">
          <button
            className="bouton bouton--prim grandit"
            onClick={() => {
              setInfoDemo(false);
              ouvrirMoi();
            }}
          >
            Essayer un autre espace
          </button>
          <button className="bouton bouton--sec" onClick={() => setInfoDemo(false)}>
            Compris
          </button>
        </div>
      </Feuille>
    </section>
  );
}

function CarteNuit({ surtitre, titre, texte, vivant, avance, children }: { surtitre: string; titre: string; texte: string; vivant?: boolean; avance?: number; children?: ReactNode }) {
  return (
    <section className="carte-nuit" aria-label={surtitre}>
      <div className="rangee rangee--entre">
        <span className="mono petit" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>{surtitre}</span>
        {vivant && (
          <span className="rangee petit">
            <span className="point point--vivant" /> en direct
          </span>
        )}
      </div>
      <div className="pile">
        <h2 className="titre-l" style={{ color: '#fff' }}>{titre}</h2>
        <p className="texte">{texte}</p>
      </div>
      {avance !== undefined && (
        <div className="barre" aria-hidden="true">
          <span style={{ width: `${avance}%` }} />
        </div>
      )}
      {children}
    </section>
  );
}

function Encart({ icone, haut, bas }: { icone: 'porte'; haut: string; bas: string }) {
  return (
    <div className="encart">
      <span className="vignette">
        <Icon nom={icone} />
      </span>
      <div className="pile grandit">
        <span className="petit" style={{ color: 'var(--nuit-texte-3)' }}>{haut}</span>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{bas}</span>
      </div>
    </div>
  );
}
