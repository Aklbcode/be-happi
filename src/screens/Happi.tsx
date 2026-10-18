// Écran « Happi » : l'assistant arrive en phase 3. Aperçu de ce qu'il saura faire.

import { Icon } from '../ui/Icon';

const EXEMPLES = [
  'Trouve-moi 50 min cette semaine avec les profs de sciences du DI',
  'Où est la 6TQA maintenant ?',
  'Quels locaux avec projecteur sont libres en H4 ?',
  'Qui peut faire une remédiation avec la 2SA jeudi en H4 ?',
];

export function Happi() {
  return (
    <section className="ecran" aria-label="Happi">
      <header className="rangee">
        <span className="rond rond--nuit" aria-hidden="true">
          <Icon nom="etincelle" taille={24} />
        </span>
        <div className="pile">
          <h1 className="titre-xl">Happi</h1>
          <span className="petit">Ton assistant d'école, branché sur les horaires</span>
        </div>
      </header>

      <div className="carte-nuit">
        <span className="puce" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', alignSelf: 'flex-start' }}>Arrive en phase 3</span>
        <h2 className="titre-l" style={{ color: '#fff' }}>Pose ta question comme à un collègue.</h2>
        <p className="texte">
          Happi lira les mêmes données que l'app (horaires, absences, locaux) et proposera des actions : créer une réunion Teams, réserver un local,
          demander un déplacement. Il ne décide jamais à ta place.
        </p>
      </div>

      <div className="pile pile--8">
        <span className="surtitre">Exemples de questions</span>
        {EXEMPLES.map((e) => (
          <div key={e} className="carte" style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
            <Icon nom="message" />
            <span className="texte grandit" style={{ color: 'var(--encre)' }}>{e}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
