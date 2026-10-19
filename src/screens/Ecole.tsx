// Écran « École » : tous les services ouverts à la personne, rangés par usage, et l'espace affiché.

import { useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { useMoi } from '../ui/Moi';
import { Feuille } from '../ui/Feuille';
import { QrInstallation, TEXTE_QR, TEXTE_QR_MOBILE, estMobile } from '../ui/Installer';
import { adresseApp } from '../lib/liens';
import { lienInstallation, reglagesActuels } from '../lib/reglages';
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
  const [telephone, setTelephone] = useState(false);
  const p = descProfil(profil);
  const ecole = demo ? null : reglagesActuels();
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

      <a className="carte carte--lien carte--pulse" href="./pulse/">
        <span className="vignette vignette--nuit" aria-hidden="true">
          <svg viewBox="0 0 100 60" width="30" height="18">
            <path d="M4 34h22l8-22 12 40 10-30 7 12h33" fill="none" stroke="#F2CF63" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="pile grandit">
          <span className="titre-s">Pulse</span>
          <span className="petit">Toute l’école sur un plan : fais glisser le temps, tout se met à jour</span>
        </span>
        <Icon nom="droite" />
      </a>

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

      {ecole && !estMobile() && (
        <button className="carte carte--lien" onClick={() => setTelephone(true)}>
          <span className="vignette">
            <Icon nom="qr" />
          </span>
          <span className="pile grandit">
            <span className="titre-s">Be Happi sur ton téléphone</span>
            <span className="petit">Un QR code à scanner, déjà relié à l’école</span>
          </span>
          <Icon nom="droite" />
        </button>
      )}

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

      {ecole && (
        <Feuille ouverte={telephone} onFermer={() => setTelephone(false)} titre="Be Happi sur ton téléphone">
          <h2 className="titre-l">Sur ton téléphone</h2>
          <QrInstallation lien={lienInstallation(adresseApp(), ecole)} texte={TEXTE_QR} texteMobile={TEXTE_QR_MOBILE} />
          <button className="bouton bouton--sec" onClick={() => setTelephone(false)}>
            Fermer
          </button>
        </Feuille>
      )}
    </section>
  );
}
