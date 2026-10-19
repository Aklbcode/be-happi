// Écran « QR portes » : un QR code par local, à imprimer et coller sur la porte. Scanné avec le
// téléphone, il ouvre « Signaler » avec le local déjà rempli.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { qrSvg } from '../lib/qr';
import { BATIMENTS } from '../data/batiments';
import { lienApp } from '../lib/liens';

export function QrPortes() {
  const { ds, demo } = useStore();
  const [bat, setBat] = useState('F');
  const locaux = useMemo(() => (ds ? ds.locaux.filter((l) => l.batiment === bat) : []), [ds, bat]);
  const svgs = useMemo(() => locaux.map((l) => ({ code: l.code, svg: qrSvg(lienApp(`signaler?local=${encodeURIComponent(l.code)}`), 150) })), [locaux]);
  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  return (
    <section className="ecran ecran--large" aria-label="QR codes des portes">
      <Entete titre="QR portes" sous="À coller sur la porte de chaque local" retour="#/ecole" />
      <div className="sans-impression pile pile--12">
        <p className="texte">Un élève ou un prof voit un problème ? Il scanne le QR : « Signaler » s’ouvre avec le local rempli, et le signalement arrive chez le service technique.</p>
        {demo && (
          <span className="puce puce--demo puce--long">
            <Icon nom="attention" taille={16} /> Démo : ces codes ouvrent la démo. Imprime-les une fois l’école reliée : ils mèneront alors aux vraies données.
          </span>
        )}
        <div className="seg seg--auto" role="group" aria-label="Bâtiment">
          {BATIMENTS.map((b) => (
            <button key={b.code} aria-pressed={bat === b.code} onClick={() => setBat(b.code)}>
              {b.sigle === '+' ? 'Autres' : b.sigle}
            </button>
          ))}
        </div>
        <button className="bouton bouton--prim" onClick={() => window.print()}>
          <Icon nom="telecharger" taille={18} /> Imprimer les {locaux.length} QR codes
        </button>
      </div>
      <div className="planche-qr">
        {svgs.map((x) => (
          <figure key={x.code} className="etiquette-qr">
            <span className="etiquette-qr-code" dangerouslySetInnerHTML={{ __html: x.svg }} />
            <figcaption>
              <b>{x.code}</b>
              <span>Un problème ici ? Scanne-moi.</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
