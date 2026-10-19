// Écran « Pilotage » (éducateurs, secrétariat, direction) : l'école en direct. Les classes à l'étude
// heure par heure, ce qui est déjà récupéré, qui peut aider, les absents, les locaux fermés.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { Regle, type CaseRegle } from '../ui/Regle';
import { Remarques } from '../ui/Remarques';
import { FeuilleAide } from '../ui/FeuilleAide';
import { ChoixJour, prochainsJours } from '../ui/Choix';
import { bilanDuJour, resumeHeures } from '../logic/suivi';
import { coursSansProf, nomAffiche } from '../logic/horaire';
import { coursDansLocauxFermes, remarquesVieScolaire } from '../logic/remarques';
import { etatPublication } from '../logic/publication';
import { dateLongue, deIso, estJourDeCours, periode, situation } from '../lib/calendar';
import { lien } from '../lib/route';

export function Pilotage() {
  const { ds, maintenant, aujourdhui, minutes, heurePassee, peutValider } = useStore();
  const jours = useMemo(() => prochainsJours(maintenant, 5), [maintenant]);
  const [date, setDate] = useState(estJourDeCours(maintenant) ? aujourdhui : jours[0]);
  const sit = situation(minutes);
  const estAuj = date === aujourdhui;
  const hMaintenant = estAuj && sit.h >= 1 && sit.h <= 9 ? sit.h : undefined;
  const [h, setH] = useState<number>(hMaintenant ?? 1);
  const [aide, setAide] = useState<{ h: number; classe?: string; matiere?: string } | null>(null);

  const calc = useMemo(() => {
    if (!ds) return null;
    const bilan = bilanDuJour(ds, date);
    const parHeure = new Map<number, { etude: typeof bilan.heures; recup: typeof bilan.heures }>();
    for (let x = 1; x <= 9; x++) parHeure.set(x, { etude: bilan.heures.filter((y) => y.h === x && !y.recuperee), recup: bilan.heures.filter((y) => y.h === x && y.recuperee) });
    const absences = ds.absences.filter((a) => a.date === date).sort((a, b) => a.prof.localeCompare(b.prof));
    const fermes = coursDansLocauxFermes(ds, date, estAuj ? heurePassee : 0);
    const attente = ds.deplacements.filter((d) => d.statut === 'En attente').length;
    const pub = etatPublication(ds, date);
    // Les locaux fermés ont déjà leur carte plus bas : pas de doublon dans « Happi a remarqué ».
    const remarques = estAuj ? remarquesVieScolaire(ds, maintenant, heurePassee).filter((r) => r.id !== 'ferme') : [];
    return { bilan, parHeure, absences, fermes, attente, pub, remarques };
  }, [ds, date, estAuj, heurePassee, maintenant]);

  if (!ds || !calc) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const { bilan, parHeure, absences, fermes, attente, pub, remarques } = calc;
  const regle: CaseRegle[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => {
    const e = parHeure.get(x)!;
    const passe = estAuj && x < (hMaintenant ?? (sit.h > 9 ? 10 : 0));
    return {
      h: x,
      ton: e.etude.length ? (passe ? 'gris' : 'orange') : e.recup.some((y) => !y.enAttente) ? 'indigo' : e.recup.length ? 'pale' : 'vide',
      compte: e.etude.length || undefined,
      titre: `H${x} · ${e.etude.length} à l'étude, ${e.recup.length} récupérée${e.recup.length > 1 ? 's' : ''}${e.recup.some((y) => y.enAttente) ? ' (dont à valider)' : ''}`,
    };
  });
  const sel = parHeure.get(h)!;
  const sansProfMaintenant = hMaintenant ? coursSansProf(ds, date, hMaintenant) : [];
  const d = deIso(date);

  return (
    <section className="ecran ecran--large" aria-label="Pilotage">
      <Entete titre="Pilotage" sous={dateLongue(d).replace(/^./, (x) => x.toUpperCase())} />
      <ChoixJour jours={jours} date={date} aujourdhui={aujourdhui} onChoisir={(j) => { setDate(j); setH(j === aujourdhui && hMaintenant ? hMaintenant : 1); }} />

      <div className="grille-2">
        <section className="carte-nuit" aria-label="Maintenant">
          <div className="rangee rangee--entre">
            <span className="petit">{hMaintenant ? `Maintenant · H${hMaintenant} · jusqu’à ${periode(hMaintenant).fin}` : estAuj ? (sit.h > 9 ? 'Les cours sont finis' : 'Avant les cours') : `Prévu ${dateLongue(d)}`}</span>
            {hMaintenant && (
              <span className="rangee petit">
                <span className="point point--vivant" /> en direct
              </span>
            )}
          </div>
          {hMaintenant ? (
            <>
              <h2 className="chiffre-heros">
                {sansProfMaintenant.length}
                <small>{sansProfMaintenant.length > 1 ? ' classes à l’étude' : sansProfMaintenant.length === 1 ? ' classe à l’étude' : ' classe à l’étude : tout est couvert'}</small>
              </h2>
              {sansProfMaintenant.length > 0 && (
                <div className="rangee enrouler">
                  {sansProfMaintenant.map((c) => (
                    <button key={c.id} className="puce puce--nuit-claire" onClick={() => setAide({ h: hMaintenant, classe: c.classes[0], matiere: c.matiere })}>
                      {c.classe} · {c.matiere || 'cours'}
                    </button>
                  ))}
                </div>
              )}
              <button className="bouton bouton--blanc" onClick={() => setAide({ h: hMaintenant })}>
                <span className="rangee">
                  <Icon nom="gens" /> Qui est libre maintenant ?
                </span>
                <Icon nom="droite" />
              </button>
            </>
          ) : (
            <h2 className="chiffre-heros">
              {bilan.aLEtude}
              <small> heure{bilan.aLEtude > 1 ? 's' : ''} de classe à l’étude prévue{bilan.aLEtude > 1 ? 's' : ''}</small>
            </h2>
          )}
          <p className="texte">
            {bilan.absents.length ? `${bilan.absents.length} collègue${bilan.absents.length > 1 ? 's' : ''} absent${bilan.absents.length > 1 ? 's' : ''}` : 'Personne d’absent'} ·{' '}
            {bilan.heures.length ? `${resumeHeures(bilan.heures, false)} sur ${bilan.heures.length}` : 'aucune heure sans prof'}
          </p>
        </section>

        <section className="carte" aria-label="La journée heure par heure">
          <div className="rangee rangee--entre">
            <h2 className="titre-m">Heure par heure</h2>
            <span className="petit">Touche une heure</span>
          </div>
          <Regle heures={regle} actuel={hMaintenant} choisie={h} onChoisir={setH} etiquette="Classes à l'étude par heure" />
          <div className="legende">
            <span><i className="carre carre--orange" /> à l’étude</span>
            <span><i className="carre carre--pale" /> proposée</span>
            <span><i className="carre carre--indigo" /> récupérée</span>
          </div>
          <h3 className="titre-s">
            H{h} · {periode(h).debut} – {periode(h).fin}
          </h3>
          {!sel.etude.length && !sel.recup.length && <p className="petit">Aucune classe sans prof à cette heure.</p>}
          {sel.etude.map((x) => (
            <div key={`e${x.classe}`} className="ligne-statut">
              <span className="point-ton point-ton--orange" aria-hidden="true" />
              <span className="pile grandit">
                <span className="fort">{x.classe} à l’étude</span>
                <span className="petit">{nomAffiche(x.absent)} absent·e</span>
              </span>
              <button className="bouton bouton--petit bouton--pale" onClick={() => setAide({ h, classe: x.classe })}>
                Qui peut la prendre ?
              </button>
            </div>
          ))}
          {sel.recup.map((x) => {
            const dep = ds.deplacements.find((y) => y.date === date && y.hVide === h && y.classe.split(',').map((k) => k.trim()).includes(x.classe));
            const remed = ds.reservations.find((r) => r.date === date && r.h === h && r.classe.startsWith(x.classe));
            return (
              <div key={`r${x.classe}`} className="ligne-statut">
                <span className={`point-ton point-ton--${x.enAttente ? 'pale' : 'indigo'}`} aria-hidden="true" />
                <span className="pile grandit">
                  <span className="fort">{x.classe} {x.enAttente ? 'bientôt récupérée' : 'récupérée'}</span>
                  <span className="petit">
                    {dep ? `${nomAffiche(dep.prof)} avance un cours${dep.statut === 'En attente' ? ' (à valider)' : ''}` : remed ? `Remédiation avec ${nomAffiche(remed.prof)} · ${remed.local}` : 'Réservation'}
                  </span>
                </span>
              </div>
            );
          })}
        </section>
      </div>

      <Remarques remarques={remarques} />

      <div className="grille-2">
        <section className="carte" aria-label="Absents">
          <h2 className="titre-m">Absents · {absences.length}</h2>
          {!absences.length && <p className="petit">Personne n’est noté absent.</p>}
          {absences.map((a) => (
            <a key={a.id ?? a.prof} className="ligne-statut ligne-statut--lien" href={lien('ouest', { q: a.prof, date })}>
              <span className="point-ton point-ton--rose" aria-hidden="true" />
              <span className="pile grandit">
                <span className="fort">{nomAffiche(a.prof)}</span>
                <span className="petit">{a.deH === 1 && a.aH === 9 ? 'Toute la journée' : `De H${a.deH} à H${a.aH}`}</span>
              </span>
              <Icon nom="droite" taille={18} />
            </a>
          ))}
          <a className="lien-action" href={lien('absences', { date })}>Encoder une absence</a>
        </section>

        <section className="pile pile--12">
          {attente > 0 && (
            <a className="carte carte--lien" href={lien('validations')}>
              <span className="vignette" style={{ position: 'relative' }}>
                <Icon nom="echange" />
                <span className="pastille">{attente}</span>
              </span>
              <span className="pile grandit">
                <span className="titre-s">{attente > 1 ? `${attente} déplacements à valider` : 'Un déplacement à valider'}</span>
                <span className="petit">{peutValider ? 'Revérifiés en direct avant ta décision' : 'Lecture seule'}</span>
              </span>
              <Icon nom="droite" />
            </a>
          )}
          <a className={`carte carte--lien${pub.dejaPublie && !pub.aJour ? ' carte--alerte' : ''}`} href={lien('publier')}>
            <span className="vignette">
              <Icon nom="haut_parleur" />
            </span>
            <span className="pile grandit">
              <span className="titre-s">
                {!pub.dejaPublie ? (pub.calcule.length ? 'Rien n’est encore publié pour les élèves' : 'Rien à publier pour les élèves') : pub.aJour ? 'Élèves à jour' : 'Élèves pas à jour'}
              </span>
              <span className="petit">
                {pub.dejaPublie && !pub.aJour ? `${pub.nouveaux.length + pub.retires.length} changement${pub.nouveaux.length + pub.retires.length > 1 ? 's' : ''} depuis la publication` : `${pub.calcule.length} ligne${pub.calcule.length > 1 ? 's' : ''} pour les classes`}
              </span>
            </span>
            <Icon nom="droite" />
          </a>
          {fermes.map((f) => (
            <div key={f.local} className="carte carte--alerte">
              <div className="rangee">
                <span className="vignette vignette--rose">
                  <Icon nom="porte" />
                </span>
                <span className="pile grandit">
                  <span className="titre-s">{f.local} fermé</span>
                  <span className="petit">{f.titre}</span>
                </span>
              </div>
              <span className="texte">Cours prévus : {f.cours.map((c) => `H${c.h} ${c.classe} (${nomAffiche(c.prof)})`).join(', ')}.</span>
              <a className="lien-action" href={lien('infos', { local: f.local })}>Prévenir avec une info du jour</a>
            </div>
          ))}
        </section>
      </div>

      {aide && <FeuilleAide date={date} h={aide.h} classe={aide.classe} matiere={aide.matiere} onFermer={() => setAide(null)} />}
    </section>
  );
}
