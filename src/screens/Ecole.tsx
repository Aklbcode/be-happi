// Écran « École » : tous les services, ce qui est prêt et ce qui arrive.

import { useStore } from '../data/store';
import { Icon, type NomIcone } from '../ui/Icon';
import { lien } from '../lib/route';

declare const __VERSION__: string;

const TUILES: { titre: string; sous: string; icone: NomIcone; href?: string; phase?: string }[] = [
  { titre: 'Mon horaire', sous: 'Semaine, classes, locaux', icone: 'calendrier', href: lien('horaire') },
  { titre: 'Locaux', sous: 'Plan en direct, réserver', icone: 'porte', href: lien('locaux') },
  { titre: 'Remédiation', sous: "Au lieu de l'étude", icone: 'livre', href: lien('aujourdhui') },
  { titre: 'Où est ?', sous: 'Un collègue, une classe', icone: 'loupe', phase: 'Phase 2' },
  { titre: 'Collab', sous: 'Créneaux communs', icone: 'gens', phase: 'Phase 2' },
  { titre: 'Signaler', sous: 'QR sur la porte', icone: 'outil', phase: 'Phase 2' },
  { titre: 'Notes de service', sous: '« J’ai lu » sans papier', icone: 'note', phase: 'Phase 2' },
  { titre: 'Surveillances', sous: 'Examens, échanges', icone: 'oeil', phase: 'Phase 3' },
];

export function Ecole() {
  const { ds, demo, peutVoirValidations } = useStore();
  const enAttente = ds ? ds.deplacements.filter((d) => d.statut === 'En attente').length : 0;
  return (
    <section className="ecran" aria-label="École">
      <header className="rangee rangee--entre">
        <h1 className="titre-xl">École</h1>
        {demo && <span className="puce puce--demo">Démo</span>}
      </header>

      {peutVoirValidations && (
        <a className="carte" href={lien('validations')} style={{ flexDirection: 'row', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <span className="vignette" style={{ position: 'relative' }}>
            <Icon nom="echange" />
            {enAttente > 0 && <span className="pastille">{enAttente}</span>}
          </span>
          <span className="pile grandit">
            <span className="titre-s">Validations</span>
            <span className="petit">
              {enAttente ? `${enAttente} déplacement${enAttente > 1 ? 's' : ''} à valider` : 'Rien à valider'}
              {demo ? ' · essaie le rôle éducateur' : ''}
            </span>
          </span>
          <Icon nom="droite" />
        </a>
      )}

      <div className="tuiles">
        {TUILES.map((t) =>
          t.href ? (
            <a key={t.titre} className="tuile" href={t.href}>
              <span className="vignette"><Icon nom={t.icone} /></span>
              <span className="pile">
                <span className="titre-s" style={{ fontSize: 15 }}>{t.titre}</span>
                <span className="petit">{t.sous}</span>
              </span>
            </a>
          ) : (
            <div key={t.titre} className="tuile tuile--bientot" aria-disabled="true">
              <span className="etiquette puce puce--grise" style={{ height: 24, fontSize: 12 }}>{t.phase}</span>
              <span className="vignette"><Icon nom={t.icone} /></span>
              <span className="pile">
                <span className="titre-s" style={{ fontSize: 15 }}>{t.titre}</span>
                <span className="petit">{t.sous}</span>
              </span>
            </div>
          ),
        )}
      </div>

      <a className="carte" href={lien('connexion')} style={{ flexDirection: 'row', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
        <span className="vignette"><Icon nom="lien" /></span>
        <span className="pile grandit">
          <span className="titre-s">Connexion à SharePoint</span>
          <span className="petit">{demo ? 'Mode démo · données fictives' : `Connecté · ${ds?.moi.email ?? ''}`}</span>
        </span>
        <Icon nom="droite" />
      </a>

      <p className="petit" style={{ textAlign: 'center' }}>Be Happi · version {__VERSION__} · IPES Tubize</p>
    </section>
  );
}
