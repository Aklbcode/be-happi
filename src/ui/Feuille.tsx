// Feuille qui monte du bas de l'écran (détails, choix).

import { useEffect, type ReactNode } from 'react';

export function Feuille({ ouverte, onFermer, titre, children }: { ouverte: boolean; onFermer: () => void; titre: string; children: ReactNode }) {
  useEffect(() => {
    if (!ouverte) return;
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [ouverte, onFermer]);

  if (!ouverte) return null;
  return (
    <>
      <div className="voile" onClick={onFermer} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={titre} className="feuille">
        <div className="feuille-interieur">
          <span className="poignee" aria-hidden="true" />
          {children}
        </div>
      </div>
    </>
  );
}
