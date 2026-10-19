// Écran « Déplacer un cours » : choisir l'option, voir ce qui se passe ensuite, proposer.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { optionsPour, type OptionDeplacement } from '../logic/deplacements';
import { coursSansProf, nomAffiche } from '../logic/horaire';
import { JOURS, deIso, jourSemaineIso, periode, situation } from '../lib/calendar';
import { lien } from '../lib/route';
import { useMoi } from '../ui/Moi';

export function Deplacer({ params }: { params: URLSearchParams }) {
  const { ouvrir: ouvrirPreferences } = useMoi();
  const { ds, aujourdhui, minutes, heureFinie, proposer, montrerToast, demo } = useStore();
  const date = params.get('date') ?? aujourdhui;
  const h = Number(params.get('h') ?? 0);
  const sit = situation(minutes);
  const finieEff = sit.enCours ? sit.h : heureFinie;

  const calculees = useMemo(() => (ds ? optionsPour(ds, ds.moi.nom, date, h, aujourdhui, finieEff) : []), [ds, date, h, aujourdhui, finieEff]);
  const [choix, setChoix] = useState<string | null>(params.get('o'));
  const [faite, setFaite] = useState<OptionDeplacement | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const envoye = !!faite;
  const options = faite ? [faite] : calculees;

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const sel = faite ?? options.find((o) => o.cle === choix) ?? options[0];
  const vacants = coursSansProf(ds, date, h);
  const absents = [...new Set(vacants.map((v) => nomAffiche(v.prof)))];
  const classesLiberees = [...new Set(vacants.flatMap((v) => v.classes))];
  const jour = JOURS[jourSemaineIso(date)];
  const d = deIso(date);

  async function envoyer() {
    if (!sel) return;
    setEnvoi(true);
    try {
      const retenue = sel;
      await proposer({ absent: sel.absent, date: sel.date, hVide: sel.h, classe: sel.classe, hOrigine: sel.hO, dateOrigine: sel.dateO });
      setFaite(retenue);
      montrerToast(demo ? 'Proposé ! (démo) Va la valider : École → Validations' : 'Proposé ! L’éducateur la voit dans Be Happi et Power Apps.');
    } catch (e) {
      montrerToast(`Impossible d'enregistrer : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  const etapes = [
    { t: 'Tu proposes', d: 'Maintenant, en un geste. Prof, classes et local sont vérifiés.', fait: envoye },
    { t: 'L’éducateur valide ou refuse', d: 'Il voit ta demande dans Be Happi et dans Power Apps ; tout est revérifié avant sa décision.', fait: false },
    { t: 'Tu vois sa réponse', d: 'Sur l’écran Aujourd’hui, avec son mot en cas de refus.', fait: false },
    {
      t: `Le local ${sel?.local ?? ''} est pour toi`,
      d: `Ton horaire et celui de ${sel && sel.classes.length > 1 ? 'tes classes' : 'la classe'} se mettent à jour ; le secrétariat publie le changement pour les élèves.`,
      fait: false,
    },
  ];

  return (
    <section className="ecran" aria-label="Déplacer un cours" style={{ paddingBottom: 150 }}>
      <div className="rangee rangee--entre">
        <a className="rond" href={lien('horaire')} aria-label="Retour à l'horaire">
          <Icon nom="gauche" />
        </a>
        <span className="titre-s">Heure libérée</span>
        <span style={{ width: 44 }} />
      </div>

      <button className="bouton bouton--sec" onClick={ouvrirPreferences}>Mes préférences de déplacement</button>

      <div className="pile pile--8">
        <span className="surtitre mono">
          {jour} {d.getDate()} · H{h} · {periode(h).debut} – {periode(h).fin}
        </span>
        {faite ? (
          <>
            <h1 className="titre-xl">{faite.classe} : proposition envoyée</h1>
            <p className="texte">{nomAffiche(faite.absent)} est absent·e en H{h}. Tu avances ton cours de {JOURS[jourSemaineIso(faite.dateO)]} H{faite.hO}.</p>
          </>
        ) : (
          <>
            <h1 className="titre-xl">{classesLiberees.length ? `${classesLiberees.join(', ')} sans prof` : 'Heure libérée'}</h1>
            <p className="texte">
              {absents.length ? `${absents.join(', ')} ${absents.length > 1 ? 'sont absents' : 'est absent·e'}. ` : ''}
              Choisis le cours que tu veux avancer ici.
            </p>
          </>
        )}
      </div>

      {options.length === 0 ? (
        <div className="carte">
          <h2 className="titre-m">Plus de déplacement possible ici</h2>
          <p className="texte">L’heure est passée, déjà prise, sans cours compatible, ou tes préférences filtrent les possibilités. Tu peux les ajuster ci-dessus.</p>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Options de déplacement" className="pile pile--12">
          <h2 className="titre-m">
            {options.length > 1 ? `${options.length} options, la meilleure d'abord` : 'Une option'}
            {options[0].semaineSuivante ? ' · semaine prochaine' : ''}
          </h2>
          {options.map((o) => (
            <button key={o.cle} role="radio" aria-checked={sel?.cle === o.cle} className="option" disabled={envoye} onClick={() => setChoix(o.cle)}>
              <span className="radio" aria-hidden="true" />
              <span className="pile grandit" style={{ gap: 8 }}>
                <span className="rangee rangee--entre">
                  <span className="titre-s">
                    {o.classe} · {o.semaineSuivante ? `${JOURS[jourSemaineIso(o.dateO)]} ${deIso(o.dateO).getDate()}` : o.memeJour ? "aujourd'hui" : JOURS[jourSemaineIso(o.dateO)]} H{o.hO} → ici
                  </span>
                  {o.meilleur && <span className="puce puce--indigo">Le plus avantageux</span>}
                  {o.semaineSuivante && <span className="puce" style={{ background: 'var(--sarcelle)', color: '#fff' }}>S+1</span>}
                </span>
                <span className="rangee enrouler" style={{ gap: 6 }}>
                  {o.controles
                    .filter((c) => c.cle === 'prof' || c.cle === 'classes' || c.cle === 'local')
                    .map((c) => (
                      <span key={c.cle} className="puce puce--ok" title={c.detail}>
                        <Icon nom="coche" taille={14} epaisseur={2.4} />
                        {c.libelle}
                        {c.cle === 'local' && o.localChange ? ` (${o.localPrevu} pris)` : ''}
                      </span>
                    ))}
                </span>
                {o.avantages.map((a) => (
                  <span key={a} className="avantage">
                    <Icon nom={a.startsWith('Attention') ? 'attention' : 'coche'} taille={16} epaisseur={2.2} />
                    {a}
                  </span>
                ))}
                <span className="titre-s">{o.gainNetMinutes > 0 ? `${o.gainNetMinutes} min de présence en moins` : o.gainNetMinutes < 0 ? `${-o.gainNetMinutes} min de présence en plus` : 'Temps de présence inchangé'} · total des journées concernées</span>
                {o.raisonsPersonnelles.map((raison) => <span className="petit" key={raison}>{raison}</span>)}
              </span>
            </button>
          ))}
        </div>
      )}

      {options.length > 0 && (
        <section className="pile pile--12" aria-label="Ce qui se passe ensuite">
          <h2 className="titre-m">Ce qui se passe ensuite</h2>
          <ol className="etapes carte">
            {etapes.map((e, i) => (
              <li key={i}>
                <span className={`num${e.fait ? ' num--fait' : ''}`}>{e.fait ? <Icon nom="coche" taille={15} epaisseur={2.6} /> : i + 1}</span>
                <span className="pile">
                  <span className="titre-s" style={{ fontSize: 15 }}>{e.t}</span>
                  <span className="petit">{e.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {options.length > 0 && sel && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 35, background: 'var(--surface)', borderTop: '1px solid var(--trait)', padding: '12px 18px calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            {envoye ? (
              <div role="status" className="rangee">
                <span className="rond" style={{ background: 'var(--indigo)', color: 'var(--sur-indigo)', borderColor: 'transparent' }}>
                  <Icon nom="coche" epaisseur={2.6} />
                </span>
                <span className="pile grandit">
                  <span className="titre-s">Proposé !</span>
                  <span className="petit">{demo ? 'Démo : valide-la toi-même dans École → Validations.' : 'L’éducateur la voit dans Be Happi et Power Apps.'}</span>
                </span>
                <a className="bouton bouton--pale bouton--petit" href={lien('aujourdhui')}>OK</a>
              </div>
            ) : (
              <button className="bouton bouton--prim bouton--plein" disabled={envoi} onClick={() => void envoyer()}>
                {envoi ? 'Envoi…' : `Proposer : ${sel.classe} ${JOURS[jourSemaineIso(sel.dateO)].slice(0, 3)}. H${sel.hO} → ${jour.slice(0, 3)}. H${sel.h}`}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
