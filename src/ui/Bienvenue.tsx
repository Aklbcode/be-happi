// Accueil de la version 1.0, montré une seule fois : ce qui change, et (en démo) les six espaces à essayer.

import { useState } from 'react';
import { useStore } from '../data/store';
import { PROFILS } from '../data/profils';
import { Feuille } from './Feuille';
import { Icon } from './Icon';
import { useMoi } from './Moi';

const CLE = 'behappi-bienvenue-1.0';

function dejaVu(): boolean {
  try {
    return localStorage.getItem(CLE) === '1';
  } catch {
    // Stockage indisponible : on ne l'affiche pas à chaque ouverture.
    return true;
  }
}

function marquer() {
  try {
    localStorage.setItem(CLE, '1');
  } catch {
    /* rien */
  }
}

const NOUVEAUTES: { icone: string; titre: string; texte: string }[] = [
  { icone: 'etincelle', titre: 'Happi répond', texte: 'Où est un collègue ou une classe, un local libre, une heure commune… à l’écrit ou à la voix.' },
  { icone: 'pouls', titre: 'L’école en direct', texte: 'Les classes à l’étude heure par heure, qui peut aider, et un message Teams prêt.' },
  { icone: 'haut_parleur', titre: 'Les élèves à jour', texte: 'Absences encodées avec leur impact, publication élèves vérifiée, écran du hall.' },
  { icone: 'graphe', titre: 'Le tableau de bord', texte: 'Heures récupérées, classes touchées, locaux, signalements : la direction voit tout.' },
];

const NOUVEAUTES_ELEVE: { icone: string; titre: string; texte: string }[] = [
  { icone: 'chapeau', titre: 'Ta classe en direct', texte: 'Le cours en ce moment, le suivant, et combien de minutes il reste.' },
  { icone: 'haut_parleur', titre: 'Les changements du jour', texte: 'Étude, cours déplacé, changement de local : tu le vois dès que c’est publié.' },
  { icone: 'etincelle', titre: 'Happi répond', texte: 'Quand as-tu sciences ? Où est ta classe ? Demande-lui.' },
  { icone: 'agenda', titre: 'Ton horaire dans ton agenda', texte: 'Un bouton, et la semaine est dans ton téléphone.' },
];

export function Bienvenue() {
  const { ds, demo, profils } = useStore();
  const { ouvrir } = useMoi();
  const [ouverte, setOuverte] = useState(() => !dejaVu());
  if (!ouverte || !ds) return null;
  const fermer = () => {
    marquer();
    setOuverte(false);
  };
  const espaces = PROFILS.filter((p) => profils.includes(p.id));
  const liste = !demo && profils.length === 1 && profils[0] === 'eleve' ? NOUVEAUTES_ELEVE : NOUVEAUTES;
  return (
    <Feuille ouverte onFermer={fermer} titre="Bienvenue dans La Tour">
      <span className="bulle-chargement" aria-hidden="true">
        <Icon nom="etincelle" taille={30} />
      </span>
      <span className="sous-titre">La Tour · IPES Tubize</span>
      <h2 className="titre-l">Le cerveau de l’école, dans ta poche</h2>
      <ul className="nouveautes">
        {liste.map((n) => (
          <li key={n.titre}>
            <span className="vignette">
              <Icon nom={n.icone} />
            </span>
            <span className="pile">
              <b className="titre-s">{n.titre}</b>
              <span className="texte">{n.texte}</span>
            </span>
          </li>
        ))}
      </ul>
      {espaces.length > 1 && (
        <p className="texte">
          {demo ? 'Démo : six espaces à essayer, ' : 'Tes espaces : '}
          {espaces.map((p) => p.nom.toLowerCase()).join(', ')}.
        </p>
      )}
      <div className="rangee">
        {espaces.length > 1 && (
          <button
            className="bouton bouton--prim grandit"
            onClick={() => {
              fermer();
              ouvrir();
            }}
          >
            Choisir un espace
          </button>
        )}
        <button className={`bouton ${espaces.length > 1 ? 'bouton--sec' : 'bouton--prim grandit'}`} onClick={fermer}>
          C’est parti
        </button>
      </div>
    </Feuille>
  );
}
