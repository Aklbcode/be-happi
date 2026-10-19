// La feuille « Moi » : qui je suis, l'espace affiché (prof, éducateur…), le thème, les raccourcis.
// En démo, tous les espaces sont ouverts pour faire le tour de l'app.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useStore } from '../data/store';
import { PROFILS } from '../data/profils';
import type { Profil } from '../data/types';
import { Feuille } from './Feuille';
import { Icon } from './Icon';
import { aller, lien } from '../lib/route';
import { nomAffiche } from '../logic/horaire';
import { indiceTeams } from '../lib/reglages';

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
  const { ds, demo, profil, profils, changerProfil } = useStore();
  const [theme, setTheme] = useState<Theme>(themeEnregistre);
  if (!ds) return null;
  const nom = ds.moi.nom ? `${ds.moi.prenom} ${nomAffiche(ds.moi.nom)}` : ds.moi.prenom || 'Élève';
  const choisir = (p: Profil) => {
    changerProfil(p);
    fermer();
    aller(PROFILS.find((x) => x.id === p)!.accueil);
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
        <span className="petit">Dans Teams, Be Happi suit le thème de Teams.</span>
      </section>

      <div className="liens-moi">
        <a href={lien('ecole')} onClick={fermer}>
          <Icon nom="grille" /> Tous les services
        </a>
        <a href={lien('ecran')} onClick={fermer}>
          <Icon nom="tv" /> Écran du hall
        </a>
        {profil !== 'eleve' && (
          <a href={lien('connexion')} onClick={fermer}>
            <Icon nom="lien" /> Connexion SharePoint
          </a>
        )}
      </div>
    </Feuille>
  );
}

export const initiales = (prenom: string, nom: string): string => `${(prenom || '?').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase();
