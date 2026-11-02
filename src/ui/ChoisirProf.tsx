// Version Google Sheets : l'adresse Teams n'a pas été reconnue (pas de « prenom.nom@ », nom en double…).
// Le prof choisit son nom une seule fois ; le Sheet garde le lien entre son adresse et son nom.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { associer, choixEnAttente } from '../data/google';
import { nomAffiche } from '../logic/horaire';
import { Icon } from './Icon';

export function ChoisirProf() {
  const { recharger } = useStore();
  const choix = choixEnAttente();
  const [filtre, setFiltre] = useState('');
  const [nom, setNom] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const liste = useMemo(() => {
    const f = filtre.trim().toLowerCase();
    return (choix?.libres ?? []).filter((n) => !f || n.toLowerCase().includes(f));
  }, [choix, filtre]);
  if (!choix) return null;

  async function valider() {
    setEnvoi(true);
    setErreur('');
    try {
      await associer(nom);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEnvoi(false);
    }
  }

  return (
    <section className="ecran" aria-label="Qui es-tu ?">
      <div className="pile pile--12">
        <p className="sous-titre">Première ouverture</p>
        <h1 className="titre-xl">Qui es-tu ?</h1>
        <p className="texte">
          IPES App n’a pas reconnu l’adresse <b>{choix.mail}</b>. Choisis ton nom tel qu’il est écrit dans l’horaire : c’est à faire une seule fois.
        </p>
        <input className="champ" style={{ minHeight: 48 }} type="search" placeholder="Chercher ton nom" value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Chercher ton nom" />
        <div className="liste-choix" role="radiogroup" aria-label="Ton nom">
          {liste.slice(0, 40).map((n) => (
            <button key={n} className="ligne-choix" role="radio" aria-checked={nom === n} onClick={() => setNom(n)}>
              <span className="case-a-cocher" aria-hidden="true">{nom === n && <Icon nom="coche" taille={14} epaisseur={3} />}</span>
              <span className="fort">{nomAffiche(n)}</span>
            </button>
          ))}
          {!liste.length && <p className="texte">Aucun nom libre ne correspond. Demande à la personne qui gère IPES App.</p>}
        </div>
        {erreur && <p className="texte texte--alerte">{erreur}</p>}
        <button className="bouton bouton--prim" disabled={!nom || envoi} onClick={() => void valider()}>
          {envoi ? 'Un instant…' : nom ? `Je suis ${nomAffiche(nom)}` : 'Choisis ton nom'}
        </button>
        <p className="petit">Ton adresse sera reliée à ce nom. Une erreur ? La personne qui gère IPES App peut la corriger.</p>
      </div>
    </section>
  );
}
