// Écran « École » : tous les services ouverts à la personne, rangés par usage, et l'espace affiché.

import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { useMoi } from '../ui/Moi';
import { profil as descProfil, peutOuvrir } from '../data/profils';
import { lien, type Ecran } from '../lib/route';

declare const __VERSION__: string;

interface Service {
  ecran: Ecran;
  titre: string;
  sous: string;
  icone: string;
  params?: Record<string, string>;
}

const GROUPES: { titre: string; services: Service[] }[] = [
  {
    titre: 'Au quotidien',
    services: [
      { ecran: 'horaire', titre: 'Mon horaire', sous: 'La semaine, les heures libérées', icone: 'calendrier' },
      { ecran: 'locaux', titre: 'Locaux libres', sous: 'Rangés comme sur le terrain', icone: 'porte' },
      { ecran: 'materiel', titre: 'Matériel', sous: 'Tablettes, PC, projecteurs', icone: 'tablette' },
      { ecran: 'ouest', titre: 'Où est ?', sous: 'Un collègue, une classe, un local', icone: 'loupe' },
      { ecran: 'collab', titre: 'Collab', sous: 'Une heure commune pour se réunir', icone: 'agenda' },
      { ecran: 'signaler', titre: 'Signaler', sous: 'Un problème dans un local', icone: 'outil' },
    ],
  },
  {
    titre: 'Vie scolaire',
    services: [
      { ecran: 'pilotage', titre: 'Pilotage', sous: 'L’école en direct, heure par heure', icone: 'pouls' },
      { ecran: 'validations', titre: 'Validations', sous: 'Les déplacements proposés', icone: 'echange' },
      { ecran: 'absences', titre: 'Absences', sous: 'Encoder et voir l’impact', icone: 'gens' },
      { ecran: 'publier', titre: 'Publication élèves', sous: 'Ce que voient les classes', icone: 'haut_parleur' },
      { ecran: 'infos', titre: 'Infos du jour', sous: 'Pour tous les profs', icone: 'note' },
    ],
  },
  {
    titre: 'Direction et technique',
    services: [
      { ecran: 'direction', titre: 'Tableau de bord', sous: 'Heures récupérées, classes, locaux', icone: 'graphe' },
      { ecran: 'technique', titre: 'Signalements', sous: 'À traiter, du plus urgent au moins', icone: 'outil' },
      { ecran: 'qr', titre: 'QR portes', sous: 'À imprimer pour chaque local', icone: 'qr' },
    ],
  },
  {
    titre: 'Pour tout le monde',
    services: [
      { ecran: 'eleve', titre: 'Vue élève', sous: 'Ce que voit une classe', icone: 'chapeau' },
      { ecran: 'ecran', titre: 'Écran du hall', sous: 'Pour la télé de l’accueil', icone: 'tv' },
    ],
  },
];

export function Ecole() {
  const { ds, demo, profil, profils } = useStore();
  const { ouvrir } = useMoi();
  const p = descProfil(profil);
  return (
    <section className="ecran" aria-label="École">
      <Entete titre="École" sous="Tous les services" />

      <button className="carte carte--lien carte--espace" onClick={ouvrir}>
        <span className="vignette vignette--nuit">
          <Icon nom={p.icone} />
        </span>
        <span className="pile grandit">
          <span className="petit">Espace affiché</span>
          <span className="titre-s">{p.nom}</span>
          <span className="petit">{demo ? 'Démo : essaie les 6 espaces (prof, éducateur, secrétariat, direction, technique, élève)' : p.apport}</span>
        </span>
        {profils.length > 1 && <span className="puce puce--indigo">Changer</span>}
      </button>

      {GROUPES.map((g) => {
        const services = g.services.filter((s) => peutOuvrir(s.ecran, profils) && !(profil === 'eleve' && s.ecran !== 'eleve' && s.ecran !== 'ecran' && s.ecran !== 'signaler'));
        if (!services.length) return null;
        return (
          <section key={g.titre} className="pile pile--8" aria-label={g.titre}>
            <h2 className="titre-s">{g.titre}</h2>
            <div className="tuiles">
              {services.map((s) => (
                <a key={s.ecran} className="tuile" href={lien(s.ecran, s.params)}>
                  <span className="vignette">
                    <Icon nom={s.icone} />
                  </span>
                  <span className="pile">
                    <span className="titre-s" style={{ fontSize: 15 }}>{s.titre}</span>
                    <span className="petit">{s.sous}</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        );
      })}

      {profil !== 'eleve' && (
        <a className="carte carte--lien" href={lien('connexion')}>
          <span className="vignette">
            <Icon nom="lien" />
          </span>
          <span className="pile grandit">
            <span className="titre-s">Connexion à SharePoint</span>
            <span className="petit">{demo ? 'Mode démo · données fictives' : `Connecté · ${ds?.moi.email ?? ''}`}</span>
          </span>
          <Icon nom="droite" />
        </a>
      )}

      <p className="petit" style={{ textAlign: 'center' }}>Be Happi · version {__VERSION__} · IPES Tubize</p>
    </section>
  );
}
