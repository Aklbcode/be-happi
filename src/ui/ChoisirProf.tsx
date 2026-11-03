// Version Google Sheets : l'adresse Teams n'a pas été reconnue (pas de « prenom.nom@ », nom en double…).
// Le prof cherche son nom (3 lettres au moins) et le choisit une seule fois ; le Sheet garde le lien
// entre son adresse et son nom. La liste complète du personnel n'est jamais envoyée.

import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { associer, chercherNom, choixEnAttente } from '../data/google';
import { nomAffiche } from '../logic/horaire';
import { Icon } from './Icon';

export function ChoisirProf() {
  const { recharger } = useStore();
  const choix = choixEnAttente();
  const [filtre, setFiltre] = useState('');
  const [liste, setListe] = useState<string[]>([]);
  const [cherche, setCherche] = useState(false);
  const [nom, setNom] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Recherche au fil de la frappe (une demande après une courte pause).
  useEffect(() => {
    const t = filtre.trim();
    if (t.length < 3) {
      setListe([]);
      return;
    }
    let actif = true;
    const id = window.setTimeout(() => {
      setCherche(true);
      chercherNom(t)
        .then((noms) => actif && setListe(noms))
        .catch((e) => actif && setErreur(e instanceof Error ? e.message : String(e)))
        .finally(() => actif && setCherche(false));
    }, 350);
    return () => {
      actif = false;
      window.clearTimeout(id);
    };
  }, [filtre]);

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

  const court = filtre.trim().length < 3;
  return (
    <section className="ecran" aria-label="Qui es-tu ?">
      <div className="pile pile--12">
        <p className="sous-titre">Première ouverture</p>
        <h1 className="titre-xl">Qui es-tu ?</h1>
        <p className="texte">
          IPES App n’a pas reconnu l’adresse <b>{choix.mail}</b>. Tape ton nom tel qu’il est écrit dans l’horaire, puis choisis-le : c’est à faire une seule fois.
        </p>
        <input className="champ" style={{ minHeight: 48 }} type="search" autoComplete="off" placeholder="Ton nom (3 lettres au moins)" value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Ton nom" />
        <div className="liste-choix" role="radiogroup" aria-label="Ton nom" aria-busy={cherche}>
          {liste.map((n) => (
            <button key={n} className="ligne-choix" role="radio" aria-checked={nom === n} onClick={() => setNom(n)}>
              <span className="case-a-cocher" aria-hidden="true">{nom === n && <Icon nom="coche" taille={14} epaisseur={3} />}</span>
              <span className="fort">{nomAffiche(n)}</span>
            </button>
          ))}
          {!court && !cherche && !liste.length && <p className="texte">Aucun nom libre ne correspond. Vérifie l’orthographe, ou demande à la personne qui gère IPES App.</p>}
          {cherche && <p className="petit">Recherche…</p>}
        </div>
        {erreur && <p className="texte texte--alerte">{erreur}</p>}
        <button className="bouton bouton--prim" disabled={!nom || envoi} onClick={() => void valider()}>
          {envoi ? 'Un instant…' : nom ? `Je suis ${nomAffiche(nom)}` : 'Choisis ton nom'}
        </button>
        <p className="petit">Ton adresse sera reliée à ce nom. Une erreur ? La personne qui gère IPES App peut la corriger dans le Google Sheet (onglet Profs, colonne Email).</p>
      </div>
    </section>
  );
}
