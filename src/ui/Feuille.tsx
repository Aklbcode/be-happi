// Feuille qui monte du bas de l'écran (détails, choix). Une vraie boîte de dialogue : Échap la ferme,
// le focus y reste et revient ensuite au bouton d'origine, les lecteurs d'écran l'annoncent.

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function Feuille({ ouverte, onFermer, titre, children }: { ouverte: boolean; onFermer: () => void; titre: string; children: ReactNode }) {
  const boite = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = boite.current;
    if (!ouverte || !dialog) return;
    const origine = document.activeElement;
    if (!dialog.open) dialog.showModal?.();
    return () => {
      if (dialog.open) dialog.close?.();
      if (origine instanceof HTMLElement && origine.isConnected) origine.focus();
    };
  }, [ouverte]);

  if (!ouverte) return null;
  // Rendue à la racine de la page : un écran animé (transform) ne doit pas l'emporter avec lui.
  return createPortal(
    <dialog
      ref={boite}
      aria-label={titre}
      className="feuille"
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      onClick={(e) => {
        // Un toucher sur le voile (en dehors de la feuille) la ferme.
        const d = boite.current;
        if (!d || e.target !== d) return;
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onFermer();
      }}
    >
      <div className="feuille-interieur">
        <span className="poignee" aria-hidden="true" />
        <button type="button" className="fermer-feuille" aria-label={`Fermer · ${titre}`} onClick={onFermer}>
          <Icon nom="fermer" taille={16} />
        </button>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
