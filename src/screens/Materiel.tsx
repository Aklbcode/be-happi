// Écran « Matériel » : racks de tablettes, PC portables, projecteurs mobiles… libres à l'heure choisie,
// réservés en un geste (mêmes noms et quantités que l'écran Matériel de Power Apps).

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from '../ui/Icon';
import { ChoixJour, HeuresNeuf, prochainsJours } from '../ui/Choix';
import { dispoMateriel, libreSurPlage } from '../logic/materiel';
import { coursDuProf, nomAffiche } from '../logic/horaire';
import { JOURS_COURTS, creneauInitial, deIso, jourSemaine, reservationPossible } from '../lib/calendar';

export function Materiel({ params }: { params: URLSearchParams }) {
  const { ds, maintenant, aujourdhui, profil, reserverMateriel, annulerMateriel, montrerToast } = useStore();
  const jours = useMemo(() => prochainsJours(maintenant, 6), [maintenant]);
  // Après H9 : le prochain jour de cours. Depuis la fiche d'un cours : son jour, son heure, sa classe.
  const initial = creneauInitial(maintenant, params);
  const [date, setDate] = useState(initial.date);
  const [h, setH] = useState(initial.h);
  const [classeChoisie, setClasseChoisie] = useState(params.get('classe') ?? '');
  const [envoi, setEnvoi] = useState<string | null>(null);
  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const moi = ds.moi.nom;
  const peutReserver = profil === 'prof' && !!moi && reservationPossible(maintenant, date, h);
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
      await reserverMateriel({ date, h, rack, classe }, fin);
      montrerToast(`${rack} réservé ${fin > h ? `de H${h} à H${fin}` : `en H${h}`}`);
    } catch (e) {
      montrerToast(`Impossible : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <section className="ecran" aria-label="Matériel">
      <h1 className="visuellement-cache">Matériel</h1>
      <ChoixJour jours={jours} date={date} aujourdhui={aujourdhui} onChoisir={setDate} />
      <HeuresNeuf h={h} onChoisir={setH} compte={(x) => dispoMateriel(ds, date, x).filter((d) => d.reste > 0).length} legende="types de matériel libres" />

      <section className="carte liste-materiel" aria-label="Matériel à cette heure">
        {peutReserver && mesClasses.length > 0 && (
          <label className="rangee rangee--entre materiel-classe">
            <span className="petit">Pour la classe</span>
            <select className="champ champ--ligne champ--court" value={classe} onChange={(e) => setClasseChoisie(e.target.value)}>
              {mesClasses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        {dispo.map((d) => {
          const fin = d.reste ? jusque(d.rack.nom) : h;
          return (
            <div key={d.rack.nom} className={`materiel-ligne${d.reste ? '' : ' materiel-ligne--pris'}`}>
              <span className="vignette">
                <Icon nom={/tablette/i.test(d.rack.nom) ? 'tablette' : /projecteur/i.test(d.rack.nom) ? 'projecteur' : /pc/i.test(d.rack.nom) ? 'tv' : 'lien'} />
              </span>
              <span className="pile grandit" style={{ gap: 2, minWidth: 0 }}>
                <span className="titre-s">{d.rack.nom}</span>
                <span className="petit">
                  {d.reste
                    ? `${d.rack.info}${d.rack.stock > 1 ? ` · ${d.reste} sur ${d.rack.stock} libres` : ''}`
                    : `Pris par ${d.prises.map((p) => `${nomAffiche(p.prof)} (${p.classe})`).join(', ')}`}
                </span>
              </span>
              {peutReserver && d.reste > 0 && (
                <span className="materiel-actions">
                  <button className="bouton bouton--prim bouton--petit" disabled={!!envoi} onClick={() => void reserver(d.rack.nom, h)}>
                    Réserver
                  </button>
                  {fin > h && (
                    <button className="lien-action" disabled={!!envoi} onClick={() => void reserver(d.rack.nom, fin)}>
                      jusqu’à H{fin}
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </section>

      {profil === 'prof' && !!moi && (
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
                <button className="bouton bouton--sec bouton--petit" onClick={() => void annulerMateriel(m).then(() => montrerToast('Réservation annulée')).catch((e) => montrerToast(`Annulation impossible : ${e instanceof Error ? e.message : e}`))}>
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
