// Démarrage commun à Be Happi et à Décale : choisir les réglages de l'école (onglet Teams, lien
// d'installation, appareil) avant de charger les données. Chaque app affiche sa propre confirmation.

import { useEffect, useState } from 'react';
import { dansTeams } from './teams';
import { adopterReglages, indiceTeams, preparerReglages, refuserLien, type Depart } from './reglages';

declare const __DEMO_FORCEE__: boolean;

export function useDepart(): { depart: Depart | null; oui: () => void; non: () => void } {
  const [depart, setDepart] = useState<Depart | null>(() =>
    __DEMO_FORCEE__ ? { etat: 'pret' } : indiceTeams() ? null : preparerReglages(false),
  );

  useEffect(() => {
    if (depart) return;
    let actif = true;
    void dansTeams().then((teams) => {
      if (actif) setDepart(preparerReglages(teams));
    });
    return () => {
      actif = false;
    };
  }, [depart]);

  return {
    depart,
    oui: () => {
      if (depart?.etat !== 'confirmer') return;
      adopterReglages(depart.propose);
      setDepart({ etat: 'pret' });
    },
    non: () => {
      if (depart?.etat !== 'confirmer') return;
      refuserLien(depart.actuels);
      setDepart({ etat: 'pret' });
    },
  };
}
