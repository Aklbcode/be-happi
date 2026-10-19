import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { usePreferences } from '../data/preferences';
import { iso, lundiDe } from '../lib/calendar';
import { PREFERENCES_DEFAUT, type ChoixHeure } from '../logic/preferences';

export function PreferencesDeplacements() {
  const { ds, demo, simulation, maintenant, montrerToast } = useStore();
  const preferences = usePreferences(ds?.moi.email || ds?.moi.nom || '', demo ? 'demo' : simulation ? 'simulation' : 'ecole', iso(lundiDe(maintenant)));
  const [choix, setChoix] = useState(preferences.choix);
  const [temporaire, setTemporaire] = useState(preferences.temporaire);
  useEffect(() => { setChoix(preferences.choix); setTemporaire(preferences.temporaire); }, [preferences.choix, preferences.temporaire]);
  const enregistrer = (valeur = choix) => {
    const persistant = preferences.enregistrer(valeur, temporaire);
    montrerToast(persistant ? 'Préférences appliquées sur cet appareil.' : 'Préférences appliquées pour cette session ; le stockage est indisponible.');
  };
  return (
    <details className="carte preferences-deplacements">
      <summary className="titre-s">Mes préférences de déplacement</summary>
      <form className="pile pile--12" onSubmit={(e) => { e.preventDefault(); enregistrer(); }}>
        <p className="petit">Choisis les déplacements qui te conviennent. Ces choix ne changent pas ton horaire : tu proposes, l’école valide.</p>
        {(['premiere', 'derniere'] as const).map((cle) => (
          <label className="pile pile--8" key={cle}>
            <span className="titre-s">{cle === 'premiere' ? 'Première heure (H1)' : 'Dernière heure (H9)'}</span>
            <select value={choix[cle]} onChange={(e) => setChoix({ ...choix, [cle]: e.target.value as ChoixHeure })}>
              <option value="neutre">Pas de préférence</option>
              <option value="preferer">Je préfère donner cours à cette heure</option>
              <option value="eviter">À éviter si possible</option>
              <option value="indisponible">Je suis indisponible à cette heure</option>
            </select>
          </label>
        ))}
        {([
          ['compacter', 'Privilégier les journées avec moins de fourches'],
          ['jourLibre', 'Ne pas proposer une venue sur une journée sans engagement'],
          ['echanges', 'Afficher aussi les échanges sans réduction de mon temps de présence'],
          ['stabilite', 'Privilégier les déplacements dans la même journée'],
        ] as const).map(([cle, texte]) => (
          <label className="rangee" key={cle}>
            <input type="checkbox" checked={choix[cle]} onChange={(e) => setChoix({ ...choix, [cle]: e.target.checked })} />
            <span>{texte}</span>
          </label>
        ))}
        <label className="pile pile--8">
          <span className="titre-s">Durée de ces choix</span>
          <select value={temporaire ? 'semaine' : 'habituel'} onChange={(e) => setTemporaire(e.target.value === 'semaine')}>
            <option value="habituel">Mes préférences habituelles</option>
            <option value="semaine">Cette semaine seulement</option>
          </select>
        </label>
        <p className="petit">Les choix de cette semaine expirent lundi. Les indisponibilités filtrent les nouvelles propositions ; elles ne suppriment aucun cours ni aucune demande déjà envoyée. Aucune préférence n’est déduite automatiquement d’un refus.</p>
        <div className="rangee enrouler">
          <button className="bouton bouton--prim" type="submit">Appliquer mes choix</button>
          <button className="bouton bouton--sec" type="button" onClick={() => { setChoix({ ...PREFERENCES_DEFAUT }); enregistrer(PREFERENCES_DEFAUT); }}>Réinitialiser ces choix</button>
        </div>
        <p className="petit">Préférences conservées sur cet appareil, séparées entre ton compte, la démo et la simulation.</p>
      </form>
    </details>
  );
}
