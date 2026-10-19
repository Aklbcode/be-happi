// Un volet qui monte du bas (sur ordinateur : une fenêtre au centre) pour le détail d'une heure.

import { useEffect, useRef, type ReactNode } from 'react';
import { Icone } from './Icones';

export function Volet({ titre, sous, onFermer, children }: { titre: string; sous?: string; onFermer: () => void; children: ReactNode }) {
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    boite.current?.focus();
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    window.addEventListener('keydown', touche);
    return () => {
      window.removeEventListener('keydown', touche);
      avant?.focus?.();
    };
  }, [onFermer]);

  return (
    <div className="voile" onClick={onFermer}>
      <div ref={boite} tabIndex={-1} className="volet" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="volet-tete">
          <div>
            <h2>{titre}</h2>
            {sous && <p className="crayon">{sous}</p>}
          </div>
          <button className="rond" onClick={onFermer} aria-label="Fermer">
            <Icone nom="croix" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
