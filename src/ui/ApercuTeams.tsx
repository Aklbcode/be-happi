// Aperçu d'un message ou d'une réunion Teams (en démo, à la place d'ouvrir Teams pour de vrai).

import { useStore } from '../data/store';
import { Feuille } from './Feuille';
import { Icon } from './Icon';
import { dateLongue } from '../lib/calendar';

export function ApercuTeams() {
  const { apercuTeams: m, fermerApercuTeams, montrerToast } = useStore();
  if (!m) return null;
  const texte = m.type === 'teams-chat' ? m.message : m.contenu ?? '';
  const debut = m.type === 'teams-reunion' ? new Date(m.debut) : null;
  const fin = m.type === 'teams-reunion' ? new Date(m.fin) : null;
  const hm = (d: Date) => `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      montrerToast('Message copié');
    } catch {
      montrerToast('Copie impossible ici : sélectionne le texte');
    }
  }
  return (
    <Feuille ouverte onFermer={fermerApercuTeams} titre="Aperçu Teams">
      <div className="rangee">
        <span className="vignette vignette--teams">
          <Icon nom={m.type === 'teams-chat' ? 'message' : 'agenda'} />
        </span>
        <div className="pile grandit">
          <span className="petit">Aperçu · en vrai, Teams s’ouvre déjà rempli</span>
          <h2 className="titre-m">{m.type === 'teams-chat' ? (m.sujet ?? 'Nouveau message') : m.sujet}</h2>
        </div>
      </div>
      {debut && fin && (
        <p className="texte fort">
          {dateLongue(debut).replace(/^./, (x) => x.toUpperCase())}, de {hm(debut)} à {hm(fin)}
        </p>
      )}
      <div className="rangee enrouler" aria-label="Destinataires">
        {m.noms.map((n) => (
          <span key={n} className="puce puce--grise">
            {n}
          </span>
        ))}
      </div>
      {texte && <div className="bulle-teams">{texte}</div>}
      <div className="rangee">
        {texte && (
          <button className="bouton bouton--sec grandit" onClick={() => void copier()}>
            <Icon nom="copie" taille={18} /> Copier
          </button>
        )}
        <button className="bouton bouton--prim grandit" onClick={fermerApercuTeams}>
          Compris
        </button>
      </div>
      <p className="petit">Aucune permission en plus : Teams s’ouvre chez toi avec le message prêt, il ne reste qu’à appuyer sur Envoyer.</p>
    </Feuille>
  );
}
