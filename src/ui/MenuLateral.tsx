// Sur ordinateur (écran large) : le menu à gauche remplace la barre d'onglets du bas. On y voit
// d'un coup les onglets de l'espace affiché, puis tous les services ouverts à la personne.

import type { Ecran } from '../lib/route';
import { useStore } from '../data/store';
import { peutOuvrir, profil as descProfil } from '../data/profils';
import { GROUPES } from '../screens/Ecole';
import { lien } from '../lib/route';
import { Icon } from './Icon';
import { initiales, useMoi } from './Moi';
import { Tour, TourTrait } from './Marque';

export function MenuLateral({ actif, pastilles = {} }: { actif: Ecran; pastilles?: Partial<Record<Ecran, number>> }) {
  const { ds, profil, profils } = useStore();
  const { ouvrir } = useMoi();
  const p = descProfil(profil);
  const dansOnglets = new Set(p.onglets.map((o) => o.ecran));
  const groupes = GROUPES.map((g) => ({
    ...g,
    services: g.services.filter(
      (s) => !dansOnglets.has(s.ecran) && peutOuvrir(s.ecran, profils) && !(profil === 'eleve' && s.ecran !== 'eleve' && s.ecran !== 'ecran' && s.ecran !== 'signaler'),
    ),
  })).filter((g) => g.services.length);
  const lienMenu = (ecran: Ecran, libelle: string, icone: string, href = `#/${ecran}`) => {
    const n = pastilles[ecran];
    return (
      <a key={ecran} href={href} className="menu-lien" aria-current={actif === ecran ? 'page' : undefined}>
        <Icon nom={icone} taille={20} />
        <span>{libelle}</span>
        {!!n && <span className="pastille">{n}</span>}
      </a>
    );
  };
  return (
    <aside className="menu-lateral" aria-label="Menu">
      <a className="menu-marque" href={`#/${p.accueil}`}>
        <Tour taille={38} />
        <span>
          <b>la tour</b>
          <small>IPES Tubize</small>
        </span>
      </a>
      <button className="menu-espace" onClick={ouvrir}>
        <Icon nom={p.icone} taille={20} />
        <span>
          <small>Espace</small>
          <b>{p.nom}</b>
        </span>
        {profils.length > 1 && <Icon nom="echange" taille={18} />}
      </button>
      <nav className="menu-nav">
        {p.onglets.map((o) => lienMenu(o.ecran, o.long ?? o.libelle, o.icone))}
        {profils.includes('prof') && profil !== 'eleve' && (
          <a href="./decale/" className="menu-lien">
            <Icon nom="echange" taille={20} />
            <span>Décale</span>
          </a>
        )}
        {groupes.map((g) => (
          <div key={g.titre} className="menu-groupe">
            <span className="menu-titre">{g.titre}</span>
            {g.services.map((s) => lienMenu(s.ecran, s.titre, s.icone, lien(s.ecran, s.params)))}
          </div>
        ))}
      </nav>
      <TourTrait largeur={110} />
      <button className="menu-moi" onClick={ouvrir}>
        <span className="menu-rond">{ds ? initiales(ds.moi.prenom, ds.moi.nom) : '…'}</span>
        <span>{ds?.moi.prenom || 'Moi'}</span>
      </button>
    </aside>
  );
}
