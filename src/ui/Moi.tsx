// La feuille « Moi » : qui je suis, l'espace affiché (prof, éducateur…), le thème, les raccourcis.
// En démo, tous les espaces sont ouverts pour faire le tour de l'app.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { PROFILS, profil as descProfil } from '../data/profils';
import type { Profil } from '../data/types';
import { Feuille } from './Feuille';
import { Icon } from './Icon';
import { aller, lien } from '../lib/route';
import { nomAffiche } from '../logic/horaire';
import { indiceTeams } from '../lib/reglages';
import { CeQuiCompte } from './CeQuiCompte';
import { ecranActif } from '../options';
import { googleActif } from '../data/google';
import { exporterAgenda } from '../logic/agenda';

const Ctx = createContext<{ ouvrir: () => void }>({ ouvrir: () => {} });

export const useMoi = () => useContext(Ctx);

type Theme = 'auto' | 'clair' | 'sombre';
const CLE_THEME = 'behappi-theme';

export function appliquerTheme(t: Theme) {
  try {
    if (t === 'auto') localStorage.removeItem(CLE_THEME);
    else localStorage.setItem(CLE_THEME, t);
  } catch {
    /* rien */
  }
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

/** Le thème affiché en ce moment est-il sombre ? (réglage, sinon celui de l'appareil) */
function estSombre(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === 'sombre' || t === 'dark') return true;
  if (t === 'clair' || t === 'light' || t === 'contraste') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Soleil / lune : passer du clair au sombre en un geste (pas dans Teams, qui impose son thème). */
/**
 * Les initiales : ouvrent « Moi » (espaces, thème, validations…). Sur l'écran d'accueil de chaque
 * espace, pour pouvoir toujours changer d'espace (ex. revenir de Secrétariat à Prof).
 */
export function BoutonMoi() {
  const { ds } = useStore();
  const { ouvrir } = useMoi();
  if (!ds) return null;
  return (
    <button onClick={ouvrir} className="rond rond--nuit" aria-label="Moi et mes espaces">
      {initiales(ds.moi.prenom, ds.moi.nom)}
    </button>
  );
}

export function BoutonTheme() {
  const [sombre, setSombre] = useState(estSombre);
  if (indiceTeams()) return null;
  return (
    <button
      className="rond rond--theme"
      aria-label={sombre ? 'Passer en thème clair' : 'Passer en thème sombre'}
      title={sombre ? 'Thème clair' : 'Thème sombre'}
      onClick={() => {
        appliquerTheme(sombre ? 'clair' : 'sombre');
        setSombre(!sombre);
      }}
    >
      <Icon nom={sombre ? 'soleil' : 'lune'} />
    </button>
  );
}

export function themeEnregistre(): Theme {
  try {
    const t = localStorage.getItem(CLE_THEME);
    return t === 'clair' || t === 'sombre' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function MoiProvider({ children }: { children: ReactNode }) {
  const [ouverte, setOuverte] = useState(false);
  const ouvrir = useCallback(() => setOuverte(true), []);
  return (
    <Ctx.Provider value={{ ouvrir }}>
      {children}
      <FeuilleMoi ouverte={ouverte} fermer={() => setOuverte(false)} />
    </Ctx.Provider>
  );
}

function FeuilleMoi({ ouverte, fermer }: { ouverte: boolean; fermer: () => void }) {
  const { ds, demo, profil, profils, changerProfil, peutVoirValidations, maintenant, montrerToast } = useStore();
  const [theme, setTheme] = useState<Theme>(themeEnregistre);
  if (!ds) return null;
  const nom = ds.moi.nom ? `${ds.moi.prenom} ${nomAffiche(ds.moi.nom)}` : ds.moi.prenom || 'Élève';
  const choisir = (p: Profil) => {
    changerProfil(p);
    fermer();
    aller(descProfil(p).accueil);
  };
  return (
    <Feuille ouverte={ouverte} onFermer={fermer} titre="Moi">
      <div className="rangee">
        <span className="rond rond--nuit rond--grand" aria-hidden="true">
          {initiales(ds.moi.prenom, ds.moi.nom)}
        </span>
        <div className="pile grandit">
          <h2 className="titre-l">{nom}</h2>
          <span className="petit">{demo ? 'Démo · données fictives' : ds.moi.email}</span>
        </div>
      </div>

      {profils.length > 1 && (
        <section className="pile pile--8" aria-label="Espace affiché">
          <h3 className="titre-s">{demo ? 'Essaie chaque espace' : 'Mes espaces'}</h3>
          <div className="espaces" role="radiogroup" aria-label="Espace">
            {PROFILS.filter((p) => profils.includes(p.id)).map((p) => (
              <button key={p.id} role="radio" aria-checked={p.id === profil} className="espace" onClick={() => choisir(p.id)}>
                <span className="vignette">
                  <Icon nom={p.icone} />
                </span>
                <span className="pile grandit">
                  <span className="titre-s">{p.nom}</span>
                  <span className="petit">{p.apport}</span>
                </span>
                {p.id === profil && <Icon nom="coche" taille={18} epaisseur={2.4} />}
              </button>
            ))}
          </div>
          {demo && <p className="petit">En vrai, chacun ne voit que ses espaces : ils viennent de la liste Roles et de l’horaire.</p>}
        </section>
      )}

      {peutVoirValidations && profil !== 'eleve' && (
        <a className="carte carte--lien" href={lien('validations')} onClick={fermer}>
          <span className="vignette" style={{ position: 'relative' }}>
            <Icon nom="echange" />
            {ds.deplacements.some((d) => d.statut === 'En attente') && (
              <span className="pastille">{ds.deplacements.filter((d) => d.statut === 'En attente').length}</span>
            )}
          </span>
          <span className="pile grandit">
            <span className="titre-s">Validations</span>
            <span className="petit">Les déplacements proposés par les profs</span>
          </span>
          <Icon nom="droite" />
        </a>
      )}

      {profils.includes('prof') && (
        <button
          className="carte carte--lien"
          onClick={() => {
            exporterAgenda(ds, maintenant);
            fermer();
            montrerToast('Agenda téléchargé : ouvre le fichier pour l’ajouter à Outlook');
          }}
        >
          <span className="vignette">
            <Icon nom="agenda" />
          </span>
          <span className="pile grandit">
            <span className="titre-s">Ajouter à mon agenda</span>
            <span className="petit">Mes cours des 4 prochaines semaines, dans Outlook ou sur le téléphone</span>
          </span>
          <Icon nom="droite" />
        </button>
      )}

      <Suggestion fermer={fermer} />

      {profils.includes('prof') && <CeQuiCompte />}

      <section className="pile pile--8" aria-label="Thème">
        <h3 className="titre-s">Thème</h3>
        <div className="seg" role="group" aria-label="Thème">
          {(['auto', 'clair', 'sombre'] as Theme[]).map((t) => (
            <button
              key={t}
              aria-pressed={theme === t}
              onClick={() => {
                setTheme(t);
                appliquerTheme(t);
              }}
            >
              {t === 'auto' ? 'Auto' : t === 'clair' ? 'Clair' : 'Sombre'}
            </button>
          ))}
        </div>
        <span className="petit">Dans Teams, IPES App suit le thème de Teams.</span>
      </section>

      <div className="liens-moi">
        <a href={lien('ecole')} onClick={fermer}>
          <Icon nom="grille" /> Tous les services
        </a>
        {ecranActif('ecran') && (
          <a href={lien('ecran')} onClick={fermer}>
            <Icon nom="tv" /> Écran du hall
          </a>
        )}
        {profil !== 'eleve' && !googleActif() && (
          <a href={lien('connexion')} onClick={fermer}>
            <Icon nom="lien" /> Connexion SharePoint
          </a>
        )}
      </div>
    </Feuille>
  );
}

export const initiales = (prenom: string, nom: string): string => `${(prenom || '?').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase();

/** « Une idée, une remarque ? » : envoyée à la personne qui gère l'app (onglet Suggestions du Sheet). */
function Suggestion({ fermer }: { fermer: () => void }) {
  const { demo, montrerToast } = useStore();
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState('Idée');
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  async function envoyer() {
    setEnvoi(true);
    try {
      if (!demo) await (await import('../data/sharepoint')).envoyerSuggestion(texte.trim(), type);
      setTexte('');
      setOuvert(false);
      fermer();
      montrerToast(demo ? 'Merci ! (démo : rien n’est envoyé)' : 'Merci ! C’est envoyé à la personne qui gère IPES App.');
    } catch (e) {
      montrerToast(`Impossible d’envoyer : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }
  if (!ouvert)
    return (
      <button className="carte carte--lien" onClick={() => setOuvert(true)}>
        <span className="vignette">
          <Icon nom="message" />
        </span>
        <span className="pile grandit">
          <span className="titre-s">Une idée, une remarque ?</span>
          <span className="petit">Dis-nous ce qui manque ou ce qui gêne</span>
        </span>
        <Icon nom="droite" />
      </button>
    );
  return (
    <section className="carte pile pile--8" aria-label="Une idée, une remarque ?">
      <h3 className="titre-s">Une idée, une remarque ?</h3>
      <div className="seg" role="group" aria-label="Type">
        {['Idée', 'Remarque', 'Problème'].map((t) => (
          <button key={t} aria-pressed={type === t} onClick={() => setType(t)}>
            {t}
          </button>
        ))}
      </div>
      <textarea className="champ" rows={4} maxLength={1000} placeholder="Écris ici…" value={texte} onChange={(e) => setTexte(e.target.value)} aria-label="Ton message" />
      <div className="rangee" style={{ gap: 8 }}>
        <button className="bouton bouton--prim grandit" disabled={envoi || texte.trim().length < 3} onClick={() => void envoyer()}>
          {envoi ? 'Envoi…' : 'Envoyer'}
        </button>
        <button className="bouton bouton--sec" onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
      <p className="petit">Seule la personne qui gère IPES App le lit.</p>
    </section>
  );
}

