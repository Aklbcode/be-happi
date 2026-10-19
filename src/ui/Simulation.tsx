// Simuler sur les vraies données sans connexion : les listes exportées de SharePoint (CSV) sont
// déposées ici et restent sur cet appareil. Rien n'est publié ni envoyé.

import { useEffect, useMemo, useState } from 'react';
import { config } from '../config';
import { arreterSimulation, demarrerSimulation, infoSimulation, lireCsv, listePourFichier, versListe, type EtatSimulation } from '../data/simulation';
import { Icon } from './Icon';

interface Fichier {
  nom: string;
  liste: string | null;
  lignes: string[][];
}

const NOMS_LISTES = Object.values(config.listes);

/** « camille.moreau@… » → « Camille ». */
const prenomDe = (mail: string): string => {
  const p = mail.trim().split('@')[0].split(/[._-]/)[0];
  return p.charAt(0).toUpperCase() + p.slice(1);
};

/** Import des fichiers CSV et lancement (en démo). */
export function ImporterSimulation() {
  const [fichiers, setFichiers] = useState<Fichier[]>([]);
  const [mail, setMail] = useState('');
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState('');

  async function lire(liste: FileList | null) {
    if (!liste) return;
    const lus = await Promise.all(
      [...liste].map(async (f) => ({ nom: f.name, liste: listePourFichier(f.name), lignes: lireCsv(await f.text()) })),
    );
    setFichiers((avant) => [...avant.filter((a) => !lus.some((l) => l.nom === a.nom)), ...lus]);
  }

  // Les adresses connues (listes Profs et Roles), pour choisir « qui je suis ».
  const adresses = useMemo(() => {
    const sortie = new Set<string>();
    for (const f of fichiers) {
      if (f.liste !== config.listes.profs && f.liste !== config.listes.roles) continue;
      for (const ligne of f.lignes.slice(1)) for (const c of ligne) if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c.trim())) sortie.add(c.trim().toLowerCase());
    }
    return [...sortie].sort();
  }, [fichiers]);

  const reconnus = fichiers.filter((f) => f.liste);
  const horaire = reconnus.some((f) => f.liste === config.listes.horaires);
  const pret = horaire && /@/.test(mail);

  async function lancer() {
    setEncours(true);
    setErreur('');
    try {
      const etat: EtatSimulation = { listes: {}, moi: { givenName: prenomDe(mail), mail: mail.trim().toLowerCase() }, importeLe: new Date().toISOString() };
      reconnus.forEach((f, i) => {
        etat.listes[f.liste!] = versListe(`L${i + 1}`, f.lignes);
      });
      await demarrerSimulation(etat);
      window.location.reload();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      setEncours(false);
    }
  }

  return (
    <div className="carte">
      <span className="puce puce--indigo" style={{ alignSelf: 'flex-start' }}>Simulation</span>
      <h2 className="titre-m">Essayer avec les vraies données</h2>
      <p className="texte">
        Sans connexion, en attendant l’IT. Dans SharePoint, ouvre chaque liste → <b className="fort">Exporter → Exporter au format CSV</b>, puis dépose les fichiers ici.
        Ils restent <b className="fort">sur cet appareil</b> : rien n’est publié ni envoyé, personne d’autre n’y a accès.
      </p>
      <label className="bouton bouton--sec">
        <Icon nom="plus" taille={18} /> Choisir les fichiers CSV
        <input type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => void lire(e.target.files)} />
      </label>
      {fichiers.length > 0 && (
        <ul className="liste-fichiers">
          {fichiers.map((f) => (
            <li key={f.nom}>
              <span className={f.liste ? 'fort' : 'petit'}>{f.liste ? '✔' : '?'} {f.nom}</span>
              <span className="petit">{Math.max(0, f.lignes.length - 1)} ligne{f.lignes.length - 1 > 1 ? 's' : ''}</span>
              <select
                className="champ champ--ligne champ--court"
                value={f.liste ?? ''}
                aria-label={`Liste pour ${f.nom}`}
                onChange={(e) => setFichiers((tous) => tous.map((x) => (x.nom === f.nom ? { ...x, liste: e.target.value || null } : x)))}
              >
                <option value="">Ignorer</option>
                {NOMS_LISTES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {fichiers.length > 0 && !horaire && <p className="petit texte--alerte">Il faut au moins la liste {config.listes.horaires}.</p>}
      {fichiers.length > 0 && (
        <label className="pile">
          <span className="petit fort">Ton adresse de l’école (pour te retrouver dans l’horaire)</span>
          <input className="champ champ--ligne" type="email" list="adresses-simulation" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="prenom.nom@…" autoComplete="email" />
          <datalist id="adresses-simulation">
            {adresses.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
      )}
      {erreur && <p className="petit texte--alerte">{erreur}</p>}
      {fichiers.length > 0 && (
        <button className="bouton bouton--prim" disabled={!pret || encours} onClick={() => void lancer()}>
          {encours ? 'Préparation…' : 'Lancer la simulation'}
        </button>
      )}
      <p className="petit">Réserver, valider, publier… tout marche, mais seulement dans cette copie : SharePoint et Power Apps ne changent pas.</p>
    </div>
  );
}

/** Simulation en cours : ce qui est chargé, et l'arrêter (efface la copie). */
export function SimulationEnCours() {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof infoSimulation>>>(null);
  useEffect(() => {
    void infoSimulation().then(setInfo);
  }, []);
  return (
    <div className="carte">
      <span className="puce puce--demo" style={{ alignSelf: 'flex-start' }}>Simulation</span>
      <h2 className="titre-m">Vraies données, sur cet appareil seulement</h2>
      <p className="texte">
        Aucune connexion : les listes importées restent dans ce navigateur. Ce que tu fais ici ne change ni SharePoint ni Power Apps. Les messages Teams sont seulement montrés en aperçu.
      </p>
      {info && (
        <p className="petit">
          Importé le {new Date(info.importeLe).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })} · tu es {info.moi} · {info.listes.map(([n, k]) => `${n} (${k})`).join(', ')}
        </p>
      )}
      <button
        className="bouton bouton--sec"
        onClick={() =>
          void arreterSimulation().then(() => {
            window.location.hash = '#/connexion';
            window.location.reload();
          })
        }
      >
        Arrêter et effacer la copie de cet appareil
      </button>
    </div>
  );
}
