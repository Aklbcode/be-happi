// Écran « Locaux » : plan du site (BC, BF, BT et sa tour, PR), façade du bâtiment choisi étage
// par étage, état en direct, réservation.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { Feuille } from '../ui/Feuille';
import { etatLocal, libreJusque, type EtatLocal } from '../logic/occupation';
import { coursDuProf } from '../logic/horaire';
import { JOURS_COURTS, PERIODES, deIso, estJourDeCours, iso, jourSemaineIso, periode, prochainJourDeCours, situation } from '../lib/calendar';
import type { Local } from '../data/types';
import { BATIMENTS, batiment, nomEtage, type CodeBatiment } from '../data/batiments';
import { PlanSite } from '../ui/PlanSite';

const NOM_ETAT: Record<EtatLocal, string> = { libre: 'libre', occupe: 'occupé', moi: 'à toi', indispo: 'indisponible' };

export function Locaux({ params }: { params: URLSearchParams }) {
  const { ds, maintenant, aujourdhui, minutes, reserver, montrerToast } = useStore();
  const dateDefaut = estJourDeCours(maintenant) ? aujourdhui : iso(prochainJourDeCours(maintenant, false));
  const date = params.get('date') ?? dateDefaut;
  const sit = situation(minutes);
  const hDefaut = Number(params.get('h')) || (date === aujourdhui ? Math.min(Math.max(sit.h, 1), 9) : 1);
  const [h, setH] = useState(hDefaut);
  const [batChoisi, setBatChoisi] = useState<CodeBatiment | null>(null);
  const [filtres, setFiltres] = useState({ vp: false, tbi: false, tv: false, pratique: false });
  const [choisi, setChoisi] = useState<string | null>(null);
  const [classeChoisie, setClasseChoisie] = useState('');
  const [enCours, setEnCours] = useState(false);

  const moi = ds?.moi.nom ?? '';
  const libresParHeure = useMemo(() => {
    if (!ds) return [] as number[];
    return PERIODES.map((p) => ds.locaux.filter((l) => l.type === 'Classe' && etatLocal(ds, moi, l.code, date, p.h).etat === 'libre').length);
  }, [ds, moi, date]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;

  const garde = (l: Local) =>
    (!filtres.vp || l.vp) && (!filtres.tbi || l.tbi) && (!filtres.tv || l.tv) && (!filtres.pratique || /labo|informatique|atelier|cuisine/i.test(l.type));
  const libresParBat: Record<string, number> = {};
  for (const l of ds.locaux) {
    if (garde(l) && etatLocal(ds, moi, l.code, date, h).etat === 'libre') libresParBat[l.batiment] = (libresParBat[l.batiment] ?? 0) + 1;
  }
  // Par défaut : le bâtiment de mon cours à cette heure, sinon celui qui a le plus de locaux libres.
  const monCoursIci = coursDuProf(ds, moi, date).find((c) => c.h === h);
  const batDuCours = ds.locaux.find((l) => l.code === monCoursIci?.local)?.batiment as CodeBatiment | undefined;
  const batLePlusLibre = (['T', 'F', 'C', 'PR'] as CodeBatiment[]).reduce((a, b) => ((libresParBat[b] ?? 0) > (libresParBat[a] ?? 0) ? b : a), 'T' as CodeBatiment);
  const bat = batiment(batChoisi ?? batDuCours ?? batLePlusLibre);
  const sallesBat = ds.locaux.filter((l) => l.batiment === bat.code);
  const nbLibres = libresParBat[bat.code] ?? 0;
  const nbGardes = sallesBat.filter(garde).length;

  const local = choisi ? ds.locaux.find((l) => l.code === choisi) ?? null : null;
  const info = local ? etatLocal(ds, moi, local.code, date, h) : null;
  const fin = local && info?.etat === 'libre' ? libreJusque(ds, moi, local.code, date, h) : h;
  const mesClasses = [...new Set(ds.cours.filter((c) => c.prof === moi).flatMap((c) => c.classes))].sort();
  const monCours = coursDuProf(ds, moi, date).find((c) => c.h === h);
  const classeRes = classeChoisie || monCours?.classe || mesClasses[0] || '';
  const d = deIso(date);

  async function reserverPlage(jusque: number) {
    if (!local) return;
    setEnCours(true);
    try {
      for (let x = h; x <= jusque; x++) await reserver({ date, h: x, local: local.code, classe: classeRes });
      montrerToast(`${local.code} réservé ${jusque > h ? `de H${h} à H${jusque}` : `en H${h}`} pour la ${classeRes}`);
      setChoisi(null);
    } catch (e) {
      montrerToast(`Impossible de réserver : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="ecran ecran--large" aria-label="Locaux">
      <header className="rangee rangee--entre">
        <h1 className="titre-xl">Locaux</h1>
        <span className="puce puce--grise">
          <Icon nom="calendrier" taille={16} />
          {JOURS_COURTS[jourSemaineIso(date)]}. {d.getDate()}/{d.getMonth() + 1}
        </span>
      </header>

      <div className="pile pile--8">
        <span className="petit">
          Disponibilités · <strong className="fort">H{h} · {periode(h).debut} – {periode(h).fin}</strong>
        </span>
        <div className="defile-x" role="group" aria-label="Choisir l'heure">
          {PERIODES.map((p, i) => (
            <button key={p.h} className="choix" aria-pressed={p.h === h} onClick={() => setH(p.h)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.05 }}>
              <span>H{p.h}</span>
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{libresParHeure[i]} libres</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rangee enrouler" role="group" aria-label="Filtres">
        {(
          [
            ['vp', 'Projecteur'],
            ['tbi', 'TBI'],
            ['tv', 'TV'],
            ['pratique', 'Labo, info, atelier'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className="filtre" aria-pressed={filtres[k]} onClick={() => setFiltres({ ...filtres, [k]: !filtres[k] })}>
            {filtres[k] && <Icon nom="coche" taille={14} epaisseur={2.6} />}
            {l}
          </button>
        ))}
      </div>

      <section className="carte" aria-label="Plan de l'école" style={{ gap: 10 }}>
        <div className="rangee rangee--entre">
          <h2 className="titre-s">Plan de l'école</h2>
          <span className="petit">chiffre = locaux libres en H{h}</span>
        </div>
        <PlanSite libres={libresParBat} choisi={bat.code} heure={h} onChoisir={(b) => setBatChoisi(b)} />
        <div className="choix-bat" role="group" aria-label="Autres locaux">
          <button className="filtre" aria-pressed={bat.code === 'Autres'} onClick={() => setBatChoisi('Autres')}>
            {BATIMENTS[4].nom} · {libresParBat.Autres ?? 0} libre{(libresParBat.Autres ?? 0) > 1 ? 's' : ''}
          </button>
        </div>
      </section>

      <section className="carte" aria-label={bat.code === 'Autres' ? 'Autres locaux' : `Bâtiment ${bat.sigle}`}>
        <div className="rangee">
          <span className="vignette" aria-hidden="true" style={bat.code === 'T' ? { background: 'var(--nuit)', color: '#fff' } : undefined}>
            {bat.code === 'T' ? <Icon nom="tour" taille={24} /> : <span style={{ fontFamily: 'var(--police-titre)', fontWeight: 800 }}>{bat.sigle}</span>}
          </span>
          <div className="pile grandit">
            <h2 className="titre-m">{bat.code === 'Autres' ? bat.nom : `${bat.sigle} · ${bat.nom}`}</h2>
            <span className="petit">
              {bat.repere} · <strong className="fort">{nbLibres}</strong> libre{nbLibres > 1 ? 's' : ''} sur {nbGardes} en H{h}
            </span>
          </div>
        </div>

        <div className={`facade${bat.code === 'PR' ? ' facade--pr' : bat.code === 'Autres' ? ' facade--autres' : ''}`}>
          {bat.code !== 'PR' && bat.code !== 'Autres' && <div className="facade-toit" aria-hidden="true" />}
          {bat.etages.map((et) => {
            const salles = sallesBat.filter((l) => (bat.code === 'Autres' ? true : l.etage === et));
            if (!salles.length) return null;
            return (
              <div key={et} className="niveau">
                {bat.code !== 'Autres' && <span className="niveau-nom">{nomEtage(et, bat.code)}</span>}
                <div className="bloc-salles" role="group" aria-label={bat.code === 'Autres' ? 'Autres locaux' : `${bat.sigle}, ${nomEtage(et, bat.code)}`}>
                  {salles.map((l) => {
                    const e = etatLocal(ds, moi, l.code, date, h);
                    const court = l.code.replace(/^B[TFC]/, '').replace(/^PR/, '');
                    return (
                      <button
                        key={l.code}
                        className={`salle salle--${e.etat}${garde(l) ? '' : ' salle--attenue'}`}
                        aria-pressed={choisi === l.code}
                        aria-label={`${l.code}, ${NOM_ETAT[e.etat]} en H${h}`}
                        title={`${l.code} · ${e.detail}`}
                        onClick={() => setChoisi(l.code)}
                        style={bat.code === 'Autres' ? { fontSize: 12, fontFamily: 'var(--police)', padding: '0 6px', height: 'auto', minHeight: 46 } : undefined}
                      >
                        {bat.code === 'Autres' ? l.code : court}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {bat.code !== 'Autres' && <div className="sol-ligne" aria-hidden="true" />}

        <div className="legende">
          <span><i className="carre" style={{ background: 'var(--indigo-pale)', border: '1px solid var(--indigo-moyen)' }} />Libre</span>
          <span><i className="carre" style={{ background: 'var(--passe)' }} />Occupé</span>
          <span><i className="carre" style={{ background: 'var(--orange-bouton)' }} />À toi</span>
          <span><i className="carre" style={{ background: 'repeating-linear-gradient(135deg, var(--hachure) 0 3px, var(--surface-2) 3px 6px)', border: '1px solid var(--trait)' }} />Indisponible</span>
        </div>
      </section>

      <Feuille ouverte={!!local} onFermer={() => setChoisi(null)} titre={local ? `Local ${local.code}` : 'Local'}>
        {local && info && (
          <>
            <div className="rangee rangee--entre">
              <div className="pile">
                <h2 className="titre-l">{local.code}</h2>
                <span className="petit">
                  {local.type}
                  {local.etage >= 0 && local.batiment !== 'PR' ? ` · ${local.etage === 0 ? 'rez' : `${local.etage}${local.etage === 1 ? 'er' : 'e'} étage`}` : ''}
                  {local.batiment !== 'Autres' ? ` · ${batiment(local.batiment).sigle} (${batiment(local.batiment).nom.toLowerCase()})` : ''}
                </span>
              </div>
              <span className={`puce ${info.etat === 'libre' ? 'puce--indigo' : info.etat === 'moi' ? 'puce--orange' : 'puce--grise'}`}>
                {info.etat === 'libre' ? (fin > h ? `Libre H${h} → H${fin}` : `Libre en H${h}`) : info.detail}
              </span>
            </div>
            <div className="rangee enrouler">
              {local.vp && <span className="puce puce--grise"><Icon nom="projecteur" taille={15} /> Projecteur</span>}
              {local.tbi && <span className="puce puce--grise"><Icon nom="coche" taille={15} /> TBI</span>}
              {local.tv && <span className="puce puce--grise"><Icon nom="coche" taille={15} /> TV</span>}
              {local.autre && <span className="puce puce--grise">{local.autre}</span>}
              {!local.vp && !local.tbi && !local.tv && !local.autre && <span className="petit">Équipement non renseigné</span>}
            </div>
            {info.etat === 'libre' && (
              <>
                <label className="pile">
                  <span className="petit">Pour quelle classe ?</span>
                  <select className="bouton bouton--sec" value={classeRes} onChange={(e) => setClasseChoisie(e.target.value)}>
                    {mesClasses.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <div className="rangee">
                  <button className="bouton bouton--prim grandit" disabled={enCours} onClick={() => void reserverPlage(h)}>
                    Réserver H{h}
                  </button>
                  {fin > h && (
                    <button className="bouton bouton--sec" disabled={enCours} onClick={() => void reserverPlage(fin)}>
                      H{h} → H{fin}
                    </button>
                  )}
                </div>
              </>
            )}
            {info.etat === 'indispo' && <p className="texte">Ce local a été signalé et ne peut pas être réservé tant que le service technique n'a pas terminé.</p>}
          </>
        )}
      </Feuille>
    </section>
  );
}
