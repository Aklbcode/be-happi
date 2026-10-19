// Partager Be Happi : QR code du lien d'installation (ouvre l'app reliée à l'école sur un autre
// appareil) et paquet Teams pour l'IT. Tout est fabriqué sur l'appareil, rien n'est publié.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { qrSvg } from '../lib/qr';
import { adresseApp } from '../lib/liens';
import { paquetTeams, telecharger } from '../lib/paquetTeams';
import type { ReglagesEcole } from '../lib/reglages';
import { Icon } from './Icon';

declare const __VERSION__: string;

/** Sur un téléphone ou une tablette (pas de QR code à scanner sur son propre écran). */
export const estMobile = (): boolean => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const TEXTE_QR =
  'Le plus simple : l’app Teams, où Be Happi est déjà. Sinon, scanne ce code avec l’appareil photo du téléphone : Be Happi s’ouvre relié à l’école, il reste à se connecter.';
export const TEXTE_QR_MOBILE = 'Envoie ce lien à un collègue : Be Happi s’ouvre relié à l’école, il reste à se connecter avec son compte de l’école.';

/** QR code + « Copier le lien » (ou « Partager » sur téléphone). */
export function QrInstallation({ lien, texte, texteMobile }: { lien: string; texte: string; texteMobile: string }) {
  const { montrerToast } = useStore();
  const [visible, setVisible] = useState(false);
  const svg = useMemo(() => {
    try {
      return qrSvg(lien, 160);
    } catch {
      return '';
    }
  }, [lien]);
  const mobile = estMobile();
  const partageable = mobile && typeof navigator.share === 'function';

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      montrerToast('Lien copié');
    } catch {
      setVisible(true);
    }
  }

  async function partager() {
    try {
      await navigator.share({ title: 'Be Happi', url: lien });
    } catch {
      /* partage annulé */
    }
  }

  return (
    <div className="installer">
      {svg && !mobile && <span className="installer-qr" role="img" aria-label="QR code du lien d’installation" dangerouslySetInnerHTML={{ __html: svg }} />}
      <div className="pile pile--8 grandit">
        <span className="texte">{mobile ? texteMobile : texte}</span>
        <div className="rangee enrouler">
          {partageable && (
            <button className="bouton bouton--prim bouton--petit" onClick={() => void partager()}>
              <Icon nom="partage" taille={16} /> Partager le lien
            </button>
          )}
          <button className="bouton bouton--sec bouton--petit" onClick={() => void copier()}>
            <Icon nom="copie" taille={16} /> Copier le lien
          </button>
        </div>
        {visible && (
          <input className="champ champ--ligne mono installer-lien" readOnly value={lien} onFocus={(e) => e.currentTarget.select()} aria-label="Lien d’installation" />
        )}
      </div>
    </div>
  );
}

/** Bouton qui fabrique et télécharge le paquet Teams relié à l'école. */
export function BoutonPaquetTeams({ ecole }: { ecole: ReglagesEcole }) {
  const [encours, setEncours] = useState(false);
  const [fait, setFait] = useState(false);
  const [erreur, setErreur] = useState('');

  async function fabriquer() {
    setEncours(true);
    setErreur('');
    try {
      telecharger(await paquetTeams({ url: adresseApp(), version: __VERSION__, ecole }), 'be-happi-teams.zip');
      setFait(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEncours(false);
    }
  }

  return (
    <div className="pile pile--8">
      <button className="bouton bouton--sec" onClick={() => void fabriquer()} disabled={encours}>
        <Icon nom="telecharger" taille={18} /> {encours ? 'Fabrication…' : 'Paquet Teams (.zip)'}
      </button>
      {erreur ? (
        <span className="petit texte--alerte">{erreur}</span>
      ) : (
        <span className="petit">
          {fait
            ? 'Téléchargé. À importer dans le centre d’administration Teams : Applications Teams → Gérer les applications → Charger une nouvelle application.'
            : 'Be Happi dans Teams, déjà relié à l’école, pour le personnel et les élèves. L’IT l’importe une fois.'}
        </span>
      )}
    </div>
  );
}
