// Version Google Sheets : un rôle (secrétariat, éducateurs, direction) n'est accepté que depuis un
// appareil approuvé dans le Sheet (onglet Appareils). Ici, la personne n'a que ce rôle : rien à
// montrer tant que ce n'est pas fait. La personne qui gère l'app a été prévenue par mail.

import { useState } from 'react';
import { useStore } from '../data/store';
import { Icon } from './Icon';

export function AppareilAApprouver() {
  const { recharger } = useStore();
  const [essai, setEssai] = useState(false);
  return (
    <section className="ecran" aria-label="Appareil à approuver">
      <div className="pile pile--12">
        <p className="sous-titre">Nouvel appareil</p>
        <h1 className="titre-xl">Cet appareil doit être approuvé</h1>
        <p className="texte">
          Ton rôle dans IPES App (secrétariat, éducateur, direction) permet d’encoder et de valider. Par sécurité, il n’est accepté que depuis un appareil
          approuvé une fois.
        </p>
        <p className="texte">La personne qui gère IPES App a été prévenue. Dès que c’est fait, touche « Réessayer ».</p>
        <button
          className="bouton bouton--prim"
          disabled={essai}
          onClick={() => {
            setEssai(true);
            recharger();
            window.setTimeout(() => setEssai(false), 4000);
          }}
        >
          <Icon nom="horloge" taille={18} /> {essai ? 'Un instant…' : 'Réessayer'}
        </button>
      </div>
    </section>
  );
}
