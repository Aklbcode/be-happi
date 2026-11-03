// La carte « À l'école aujourd'hui » de l'écran Aujourd'hui (rien à dire : pas de carte).

import { useMemo, useState } from 'react';
import type { Dataset } from '../data/types';
import { aLEcole } from '../logic/ecole';
import { nomAffiche } from '../logic/horaire';
import { JOURS_COURTS, deIso, jourSemaineIso } from '../lib/calendar';
import { Icon } from './Icon';

const court = (d: string) => {
  const x = deIso(d);
  return `${JOURS_COURTS[jourSemaineIso(d)].toLowerCase()}. ${x.getDate()}/${x.getMonth() + 1}`;
};

export function CarteAlEcole({ ds, date }: { ds: Dataset; date: string }) {
  const e = useMemo(() => aLEcole(ds, date), [ds, date]);
  const [tous, setTous] = useState(false);
  if (!e.aujourdhui.length && !e.sorties.length && !e.absents.length && !e.bientot.length) return null;
  const montres = tous ? e.absents : e.absents.slice(0, 6);
  return (
    <section className="carte ecole-jour pile pile--8" aria-label="À l’école">
      <h2 className="titre-s">À l’école aujourd’hui</h2>
      {e.aujourdhui.map((x) => (
        <p key={`${x.du}${x.titre}`} className="ecole-ligne">
          <Icon nom="calendrier" taille={18} />
          <span>
            <b>{x.titre}</b>
            {x.heure ? ` · ${x.heure}` : ''}
          </span>
        </p>
      ))}
      {e.sorties.map((s) => (
        <p key={s.titre} className="ecole-ligne">
          <Icon nom="drapeau" taille={18} />
          <span>
            <b>{s.titre}</b> · {s.classes.join(', ')}
            {s.au > date ? ` (jusqu’au ${court(s.au)})` : ''}
          </span>
        </p>
      ))}
      {e.absents.length > 0 && (
        <p className="ecole-ligne">
          <Icon nom="gens" taille={18} />
          <span>
            <b>{e.absents.length} profs absents</b> : {montres.map(nomAffiche).join(', ')}
            {e.absents.length > montres.length && (
              <>
                {' '}
                <button className="lien-action" onClick={() => setTous(true)}>
                  et {e.absents.length - montres.length} autres
                </button>
              </>
            )}
          </span>
        </p>
      )}
      {!e.aujourdhui.length && !e.sorties.length && !e.absents.length && <p className="petit">Rien de particulier aujourd’hui.</p>}
      {e.bientot.length > 0 && (
        <div className="ecole-bientot">
          {e.bientot.map((x) => (
            <p key={`${x.du}${x.titre}`} className="petit">
              <b>{court(x.du)}</b> · {x.titre}
              {x.heure ? ` (${x.heure})` : ''}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
