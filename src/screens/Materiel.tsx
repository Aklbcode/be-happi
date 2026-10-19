// Écran « Matériel » : racks de tablettes, PC portables, projecteurs mobiles… libres à l'heure choisie,
// réservés en un geste (mêmes noms et quantités que l'écran Matériel de Power Apps).

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { ChoixHeure, ChoixJour, prochainsJours } from '../ui/Choix';
import { dispoMateriel, libreSurPlage } from '../logic/materiel';
import { coursDuProf, nomAffiche } from '../logic/horaire';
import { JOURS_COURTS, deIso, estJourDeCours, jourSemaine, periode, situation } from '../lib/calendar';

export function Materiel({ params }: { params: URLSearchParams }) {
  const { ds, maintenant, aujourdhui, minutes, profil, reserverMateriel, annulerMateriel, montrerToast } = useStore();
  const jours = useMemo(() => prochainsJours(maintenant, 6), [maintenant]);
  const [date, setDate] = useState(params.get('date') ?? (estJourDeCours(maintenant) ? aujourdhui : jours[0]));
  const sit = situation(minutes);
  const [h, setH] = useState(Number(params.get('h')) || (date === aujourdhui ? Math.min(Math.max(sit.h, 1), 9) : 1));
  const [classeChoisie, setClasseChoisie] = useState('');
  const [envoi, setEnvoi] = useState<string | null>(null);
  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const moi = ds.moi.nom;
  const peutReserver = profil === 'prof' && !!moi;
  const dispo = dispoMateriel(ds, date, h);
  const mesClasses = [...new Set(ds.cours.filter((c) => c.prof === moi).flatMap((c) => c.classes))].sort();
  const classe = classeChoisie || coursDuProf(ds, moi, date).find((c) => c.h === h)?.classe || mesClasses[0] || '';
  const miennes = ds.materiel.filter((m) => m.prof === moi && m.date >= aujourdhui).sort((a, b) => a.date.localeCompare(b.date) || a.h - b.h);
  // Jusqu'où le matériel reste libre (pour réserver plusieurs heures d'affilée).
  const jusque = (rack: string) => {
    let f = h;
    while (f < 9 && libreSurPlage(ds, rack, date, h, f + 1)) f++;
    return f;
  };

  async function reserver(rack: string, fin: number) {
    setEnvoi(rack);
    try {
      for (let x = h; x <= fin; x++) await reserverMateriel({ date, h: x, rack, classe });
      montrerToast(`${rack} réservé ${fin > h ? `de H${h} à H${fin}` : `en H${h}`}`);
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <section className="ecran" aria-label="Matériel">
      <Entete titre="Matériel" sous="Tablettes, PC portables, projecteurs mobiles" retour="#/ecole" />
      <ChoixJour jours={jours} date={date} aujourdhui={aujourdhui} onChoisir={setDate} />
      <ChoixHeure h={h} onChoisir={setH} sous={(x) => `${dispoMateriel(ds, date, x).filter((d) => d.reste > 0).length}/${dispo.length}`} />
      {peutReserver && mesClasses.length > 0 && (
        <label className="rangee">
          <span className="petit">Pour la classe</span>
          <select className="champ champ--ligne champ--court" value={classe} onChange={(e) => setClasseChoisie(e.target.value)}>
            {mesClasses.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      )}
      <div className="grille-materiel">
        {dispo.map((d) => {
          const fin = d.reste ? jusque(d.rack.nom) : h;
          return (
            <article key={d.rack.nom} className={`carte carte--serree materiel${d.reste ? '' : ' materiel--pris'}`}>
              <div className="rangee">
                <span className="vignette">
                  <Icon nom={/tablette/i.test(d.rack.nom) ? 'tablette' : /projecteur/i.test(d.rack.nom) ? 'projecteur' : /pc/i.test(d.rack.nom) ? 'tv' : 'lien'} />
                </span>
                <span className="pile grandit">
                  <span className="titre-s">{d.rack.nom}</span>
                  <span className="petit">{d.rack.info}</span>
                </span>
              </div>
              <div className="jauge" aria-label={`${d.reste} sur ${d.rack.stock} disponible`}>
                {Array.from({ length: d.rack.stock }).map((_, i) => (
                  <i key={i} className={i < d.reste ? 'jauge-libre' : 'jauge-pris'} />
                ))}
              </div>
              <span className="petit">
                {d.reste ? `${d.reste} sur ${d.rack.stock} disponible${d.reste > 1 ? 's' : ''}` : `Pris : ${d.prises.map((p) => `${nomAffiche(p.prof)} (${p.classe})`).join(', ')}`}
              </span>
              {peutReserver && d.reste > 0 && (
                <div className="rangee">
                  <button className="bouton bouton--prim bouton--petit grandit" disabled={!!envoi} onClick={() => void reserver(d.rack.nom, h)}>
                    Réserver H{h}
                  </button>
                  {fin > h && (
                    <button className="bouton bouton--sec bouton--petit" disabled={!!envoi} onClick={() => void reserver(d.rack.nom, fin)}>
                      H{h} → H{fin}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="petit">H{h} · {periode(h).debut} – {periode(h).fin}</p>

      {peutReserver && (
        <section className="pile pile--8" aria-label="Mes réservations">
          <h2 className="titre-m">Mes réservations</h2>
          {!miennes.length && <p className="petit">Aucune réservation à venir.</p>}
          {miennes.map((m) => {
            const d = deIso(m.date);
            return (
              <div key={m.id ?? `${m.date}${m.h}${m.rack}`} className="carte carte--serree carte--ligne">
                <span className="pile grandit">
                  <span className="titre-s">{m.rack}</span>
                  <span className="petit">
                    {m.date === aujourdhui ? "Aujourd'hui" : `${JOURS_COURTS[jourSemaine(d)]} ${d.getDate()}/${d.getMonth() + 1}`} · H{m.h} · {m.classe}
                  </span>
                </span>
                <button className="bouton bouton--sec bouton--petit" onClick={() => void annulerMateriel(m).then(() => montrerToast('Réservation annulée'))}>
                  Annuler
                </button>
              </div>
            );
          })}
        </section>
      )}
    </section>
  );
}
