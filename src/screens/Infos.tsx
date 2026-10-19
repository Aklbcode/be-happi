// Écran « Infos du jour » : les infos courtes visibles par tous les profs (mêmes catégories que
// Power Apps). Le secrétariat et les éducateurs les publient ; un local fermé propose déjà le texte.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { Info } from '../data/types';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { ChoixJour, prochainsJours } from '../ui/Choix';
import { coursDansLocauxFermes } from '../logic/remarques';
import { etatLocal } from '../logic/occupation';
import { dateLongue, deIso, estJourDeCours } from '../lib/calendar';

const CATEGORIES = ['Info', 'Retard', 'Éducateur absent', 'Changement de local'] as const;
const EXEMPLES: Record<string, string> = {
  Info: 'Ex. Conseils de classe : le planning est dans ton casier',
  Retard: 'Ex. M. X arrive en H3 · bus 115 en retard',
  'Éducateur absent': 'Ex. Éducateur du 1er degré absent : bureau du BT',
  'Changement de local': 'Ex. BC207 remplacé par BF105 toute la journée',
};
const ICONES: Record<string, string> = { Info: 'note', Retard: 'horloge', 'Éducateur absent': 'gens', 'Changement de local': 'porte' };

const CLE_LUES = 'behappi-infos-lues';
function lues(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLE_LUES) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function Infos({ params }: { params: URLSearchParams }) {
  const { ds, maintenant, aujourdhui, profil, publierInfo, supprimerInfo, montrerToast } = useStore();
  const jours = useMemo(() => prochainsJours(maintenant, 5), [maintenant]);
  const peutEcrire = profil === 'secretariat' || profil === 'educateur' || profil === 'direction';
  const local = params.get('local') ?? '';

  // Un local fermé : texte proposé avec un local libre aux mêmes heures.
  const proposition = useMemo(() => {
    if (!ds || !local) return '';
    const f = coursDansLocauxFermes(ds, aujourdhui).find((x) => x.local === local);
    if (!f) return `${local} fermé aujourd'hui`;
    const ref = ds.locaux.find((l) => l.code === local);
    const remplacant = ds.locaux
      .filter((l) => l.code !== local && (l.type === ref?.type || l.type === 'Classe') && (!ref || l.batiment === ref.batiment))
      .find((l) => f.cours.every((c) => etatLocal(ds, '', l.code, aujourdhui, c.h).etat === 'libre'));
    return `${local} fermé (${f.titre.toLowerCase()})${remplacant ? ` : les cours vont en ${remplacant.code}` : ''} · ${f.cours.map((c) => `H${c.h} ${c.classe}`).join(', ')}`;
  }, [ds, local, aujourdhui]);

  const [categorie, setCategorie] = useState<string>(local ? 'Changement de local' : 'Info');
  const [date, setDate] = useState(estJourDeCours(maintenant) ? aujourdhui : jours[0]);
  const [texte, setTexte] = useState(proposition);
  const [envoi, setEnvoi] = useState(false);
  const [dejaLues, setDejaLues] = useState<string[]>(lues);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const aVenir = ds.infos.filter((i) => i.date >= (estJourDeCours(maintenant) ? aujourdhui : jours[0])).sort((a, b) => a.date.localeCompare(b.date) || a.categorie.localeCompare(b.categorie));
  const parJour = new Map<string, Info[]>();
  for (const i of aVenir) parJour.set(i.date, [...(parJour.get(i.date) ?? []), i]);

  async function envoyer() {
    if (!texte.trim()) return;
    setEnvoi(true);
    try {
      await publierInfo({ date, categorie, titre: texte.trim() });
      montrerToast('Info publiée pour tous les profs');
      setTexte('');
    } catch (e) {
      montrerToast(`Impossible de publier : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  const marquer = (i: Info) => {
    const id = i.id ?? `${i.date}|${i.titre}`;
    const n = dejaLues.includes(id) ? dejaLues.filter((x) => x !== id) : [...dejaLues, id];
    setDejaLues(n);
    try {
      localStorage.setItem(CLE_LUES, JSON.stringify(n.slice(-200)));
    } catch {
      /* rien */
    }
  };

  return (
    <section className="ecran" aria-label="Infos du jour">
      <Entete titre="Infos" sous="Visibles par tous les profs" />

      {peutEcrire && (
        <section className="carte" aria-label="Publier une info">
          <h2 className="titre-m">Publier une info</h2>
          <div className="rangee enrouler" role="radiogroup" aria-label="Catégorie">
            {CATEGORIES.map((c) => (
              <button key={c} role="radio" aria-checked={categorie === c} className="filtre" aria-pressed={categorie === c} onClick={() => setCategorie(c)}>
                <Icon nom={ICONES[c]} taille={15} /> {c}
              </button>
            ))}
          </div>
          <ChoixJour jours={jours} date={date} aujourdhui={aujourdhui} onChoisir={setDate} />
          <textarea className="champ" rows={3} maxLength={200} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={EXEMPLES[categorie]} aria-label="Texte de l'info" />
          <button className="bouton bouton--prim" disabled={!texte.trim() || envoi} onClick={() => void envoyer()}>
            {envoi ? 'Publication…' : 'Publier l’info'}
          </button>
          <p className="petit">Pas de motif d’absence ni d’information médicale dans les infos.</p>
        </section>
      )}

      {!aVenir.length && <p className="texte">Aucune info pour les prochains jours.</p>}
      {[...parJour.entries()].map(([jour, infos]) => (
        <section key={jour} className="pile pile--8" aria-label={`Infos du ${dateLongue(deIso(jour))}`}>
          <h2 className="titre-s">{jour === aujourdhui ? "Aujourd'hui" : dateLongue(deIso(jour)).replace(/^./, (x) => x.toUpperCase())}</h2>
          {infos.map((i) => {
            const id = i.id ?? `${i.date}|${i.titre}`;
            const lue = dejaLues.includes(id);
            return (
              <article key={id} className={`carte carte--info${lue ? ' carte--lue' : ''}`}>
                <span className="vignette">
                  <Icon nom={ICONES[i.categorie] ?? 'note'} />
                </span>
                <div className="pile grandit">
                  <span className="petit">{i.categorie}</span>
                  <span className="titre-s">{i.titre}</span>
                </div>
                {peutEcrire ? (
                  <button className="rond rond--petit" onClick={() => void supprimerInfo(i).then(() => montrerToast('Info retirée'))} aria-label="Retirer cette info">
                    <Icon nom="poubelle" taille={16} />
                  </button>
                ) : (
                  <button className={`bouton bouton--petit ${lue ? 'bouton--pale' : 'bouton--sec'}`} onClick={() => marquer(i)} aria-pressed={lue}>
                    {lue ? <><Icon nom="coche" taille={15} epaisseur={2.4} /> Lu</> : 'J’ai lu'}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </section>
  );
}
