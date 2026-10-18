// Écran « Locaux » : tous les locaux libres à l'heure choisie, sur une seule page, rangés comme
// sur le terrain. Les PR en haut (au nord, le long des terrains de sport), puis trois colonnes
// d'ouest en est : BC (rue Papleux), BF (au milieu), BT (chaussée de Mons), avec les étages
// alignés (2e, 1er, rez). Sport, atelier et cuisines en bas. Toucher un local pour le réserver.

import { Fragment, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { Feuille } from '../ui/Feuille';
import { etatLocal, libreJusque } from '../logic/occupation';
import { coursDuProf } from '../logic/horaire';
import { JOURS_COURTS, PERIODES, deIso, estJourDeCours, iso, jourSemaineIso, periode, prochainJourDeCours, situation } from '../lib/calendar';
import type { Local } from '../data/types';
import { batiment, nomEtage, type CodeBatiment } from '../data/batiments';

/** D'ouest en est, comme sur le terrain. */
const COLONNES: CodeBatiment[] = ['C', 'F', 'T'];
const ETAGES = [2, 1, 0];

type Filtres = { vp: boolean; tbi: boolean; tv: boolean; pratique: boolean };

const garde = (f: Filtres) => (l: Local) =>
  (!f.vp || l.vp) && (!f.tbi || l.tbi) && (!f.tv || l.tv) && (!f.pratique || /labo|informatique|atelier|cuisine/i.test(l.type));

/** « BF201 » → « 201 » (le bâtiment est déjà dans la colonne). */
const court = (l: Local) => (l.batiment === 'Autres' ? l.code : l.code.replace(/^B[TFC]/, '').replace(/^PR/, ''));

export function Locaux({ params }: { params: URLSearchParams }) {
  const { ds, maintenant, aujourdhui, minutes, reserver, montrerToast } = useStore();
  const dateDefaut = estJourDeCours(maintenant) ? aujourdhui : iso(prochainJourDeCours(maintenant, false));
  const date = params.get('date') ?? dateDefaut;
  const sit = situation(minutes);
  const hDefaut = Number(params.get('h')) || (date === aujourdhui ? Math.min(Math.max(sit.h, 1), 9) : 1);
  const [h, setH] = useState(hDefaut);
  const [filtres, setFiltres] = useState<Filtres>({ vp: false, tbi: false, tv: false, pratique: false });
  const [choisi, setChoisi] = useState<string | null>(null);
  const [classeChoisie, setClasseChoisie] = useState('');
  const [enCours, setEnCours] = useState(false);

  const moi = ds?.moi.nom ?? '';
  // Locaux libres (avec les filtres) pour chaque heure de la journée.
  const libresParHeure = useMemo(() => {
    if (!ds) return [] as Local[][];
    const ok = garde(filtres);
    return PERIODES.map((p) => ds.locaux.filter((l) => ok(l) && etatLocal(ds, moi, l.code, date, p.h).etat === 'libre'));
  }, [ds, moi, date, filtres]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;

  const libres = libresParHeure[h - 1] ?? [];
  const dans = (b: CodeBatiment, etage?: number) => libres.filter((l) => l.batiment === b && (etage === undefined || l.etage === etage));

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

  const salles = (liste: Local[], large = false) =>
    liste.length ? (
      <div className={`salles-libres${large ? ' salles-libres--large' : ''}`}>
        {liste.map((l) => (
          <button key={l.code} className="libre" onClick={() => setChoisi(l.code)} aria-label={`${l.code}, libre en H${h}`}>
            {court(l)}
          </button>
        ))}
      </div>
    ) : (
      <span className="aucun" aria-label="aucun local libre">—</span>
    );

  return (
    <section className="ecran ecran--large" aria-label="Locaux">
      <header className="rangee rangee--entre">
        <h1 className="titre-xl">Locaux</h1>
        <span className="puce puce--grise">
          <Icon nom="calendrier" taille={16} />
          {JOURS_COURTS[jourSemaineIso(date)]}. {d.getDate()}/{d.getMonth() + 1}
        </span>
      </header>

      <div className="defile-x" role="group" aria-label="Choisir l'heure">
        {PERIODES.map((p, i) => (
          <button key={p.h} className="choix" aria-pressed={p.h === h} onClick={() => setH(p.h)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.05 }}>
            <span>H{p.h}</span>
            <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{libresParHeure[i]?.length ?? 0} libres</span>
          </button>
        ))}
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

      <section className="carte carte--serree" aria-label="Locaux libres">
        <div className="rangee rangee--entre">
          <h2 className="titre-m">{libres.length > 1 ? `${libres.length} locaux libres` : libres.length === 1 ? '1 local libre' : 'Aucun local libre'}</h2>
          <span className="petit fort">
            H{h} · {periode(h).debut} – {periode(h).fin}
          </span>
        </div>

        {/* Au nord, le long des terrains de sport. */}
        <div className="bande">
          <span className="bande-tete">
            <b>PR</b> préfabriqués, le long des terrains
          </span>
          {salles(dans('PR'))}
        </div>

        {/* D'ouest (rue Papleux) en est (chaussée de Mons), étages alignés. */}
        <div className="campus" role="table" aria-label="Locaux libres par bâtiment et par étage">
          <span role="columnheader" />
          {COLONNES.map((b) => (
            <div key={b} className="campus-tete" role="columnheader">
              <b>
                {b === 'T' && <Icon nom="tour" taille={15} epaisseur={2} />}
                {batiment(b).sigle}
              </b>
              <small>{b === 'C' ? 'rue Papleux' : b === 'F' ? 'au milieu' : 'ch. de Mons'}</small>
            </div>
          ))}
          {ETAGES.map((e) => (
            <Fragment key={e}>
              <span className="campus-etage" role="rowheader">{nomEtage(e, 'F')}</span>
              {COLONNES.map((b) => (
                <div key={b} className="campus-case" role="cell" aria-label={`${batiment(b).sigle}, ${nomEtage(e, 'F')}`}>
                  {salles(dans(b, e))}
                </div>
              ))}
            </Fragment>
          ))}
        </div>

        <div className="bande">
          <span className="bande-tete">
            <b>+</b> sport, atelier, cuisines
          </span>
          {salles(dans('Autres'), true)}
        </div>

        <p className="petit">{libres.length ? 'Touche un local pour le réserver.' : 'Aucun local libre à cette heure avec ces filtres.'}</p>
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
                  {local.batiment !== 'Autres' ? ` · ${batiment(local.batiment).sigle} (${batiment(local.batiment).repere})` : ''}
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
