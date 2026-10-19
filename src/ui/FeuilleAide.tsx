// « Qui peut aider ? » : les collègues libres à cette heure (déjà à l'école d'abord), et un message
// Teams prêt pour leur demander de prendre une classe en remédiation ou de donner un coup de main.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Feuille } from './Feuille';
import { Icon } from './Icon';
import { profsLibres } from '../logic/ouest';
import { nomAffiche, peutPrendre } from '../logic/horaire';
import { JOURS, jourSemaineIso, periode } from '../lib/calendar';

export function FeuilleAide({ date, h, classe, matiere, onFermer }: { date: string; h: number; classe?: string; matiere?: string; onFermer: () => void }) {
  const { ds, aujourdhui, ouvrirTeams, profil } = useStore();
  const moi = profil === 'prof' ? ds?.moi.nom ?? '' : '';
  const libres = useMemo(() => {
    if (!ds) return [];
    let l = profsLibres(ds, date, h, moi ? [moi] : []);
    if (classe) l = l.filter((x) => peutPrendre(ds, x.prof, classe));
    const connait = (p: string) => (classe ? ds.cours.some((c) => c.prof === p && c.classes.includes(classe)) : false);
    return l
      .map((x) => ({ ...x, connait: connait(x.prof) }))
      .sort((a, b) => Number(b.connait) - Number(a.connait) || Number(b.fourche) - Number(a.fourche) || a.prof.localeCompare(b.prof));
  }, [ds, date, h, classe, moi]);
  const [choisis, setChoisis] = useState<string[]>(() => libres.filter((x) => x.fourche).slice(0, 4).map((x) => x.prof));
  if (!ds) return null;
  const quand = `${date === aujourdhui ? 'aujourd’hui' : JOURS[jourSemaineIso(date)]} en H${h} (${periode(h).debut})`;
  const message = classe
    ? `Bonjour, la ${classe} n'a pas de prof ${quand}${matiere ? ` (${matiere.toLowerCase()})` : ''}. Quelqu'un pourrait-il la prendre en remédiation ? Merci !`
    : `Bonjour, j'aurais besoin d'un coup de main ${quand}. Quelqu'un est disponible ? Merci !`;
  const email = (p: string) => ds.profs.find((x) => x.nom === p)?.email;
  const ecrire = (profs: string[]) => {
    const avec = profs.filter((p) => email(p));
    if (!avec.length) return;
    ouvrirTeams({ type: 'teams-chat', emails: avec.map((p) => email(p)!), noms: avec.map(nomAffiche), message, sujet: classe ? `Remédiation ${classe} · H${h}` : `Coup de main · H${h}` });
  };
  const basculer = (p: string) => setChoisis((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));

  return (
    <Feuille ouverte onFermer={onFermer} titre="Qui peut aider ?">
      <span className="sous-titre">{classe ? `La ${classe} sans prof · ${quand}` : `Coup de main · ${quand}`}</span>
      <h2 className="titre-l">{libres.length ? `${libres.length} collègue${libres.length > 1 ? 's' : ''} libre${libres.length > 1 ? 's' : ''}` : 'Personne de libre'}</h2>
      {classe && <p className="texte">Ceux qui connaissent la {classe} d’abord. Les profs du 1er degré ne prennent pas les classes du 2e et du 3e.</p>}
      <div className="liste-choix" role="group" aria-label="Collègues à contacter">
        {libres.slice(0, 12).map((x) => (
          <button key={x.prof} className="ligne-choix" role="checkbox" aria-checked={choisis.includes(x.prof)} onClick={() => basculer(x.prof)}>
            <span className="case-a-cocher" aria-hidden="true">
              {choisis.includes(x.prof) && <Icon nom="coche" taille={14} epaisseur={3} />}
            </span>
            <span className="pile grandit">
              <span className="fort">{nomAffiche(x.prof)}</span>
              <span className="petit">{[x.connait ? `connaît la ${classe}` : '', x.texte].filter(Boolean).join(' · ')}</span>
            </span>
            {x.fourche && <span className="puce puce--indigo">à l’école</span>}
          </button>
        ))}
      </div>
      <button className="bouton bouton--prim" disabled={!choisis.length} onClick={() => ecrire(choisis)}>
        <Icon nom="message" taille={18} /> {choisis.length > 1 ? `Écrire aux ${choisis.length} sur Teams` : 'Écrire sur Teams'}
      </button>
      <p className="petit">Le message est prêt : « {message} »</p>
    </Feuille>
  );
}
