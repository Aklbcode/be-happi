// La marque : la tour ronde de l'IPES (emblème de l'école), dessinée simplement, et son nom écrit à la main.

export function Tour({ taille = 34, fond = '#173f35', trait = '#e2efb6' }: { taille?: number; fond?: string; trait?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={taille} height={taille} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill={fond} />
      <path d="M19 15h5v4h4.5v-4h7v4H40v-4h5v10l-3 3v24H22V28l-3-3z" fill={trait} />
      <path d="M28.5 52v-8a3.5 3.5 0 0 1 7 0v8z" fill={fond} />
      <path d="M30 32.5a2 2 0 0 1 4 0V37h-4z" fill={fond} />
      <path d="M22 28q10 3.5 20 0M22 41q10 3.5 20 0" fill="none" stroke={fond} strokeWidth="1.6" />
    </svg>
  );
}

/** La tour en filigrane, au trait (bas du menu). */
export function TourTrait({ largeur = 120 }: { largeur?: number }) {
  return (
    <svg viewBox="0 0 120 160" width={largeur} height={(largeur * 160) / 120} aria-hidden="true" focusable="false" className="tour-trait">
      <path d="M22 6h14v12h12V6h24v12h12V6h14v28l-8 8v112H30V42l-8-8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M30 42q30 10 60 0M30 78q30 10 60 0M30 114q30 10 60 0" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
      <path d="M52 154v-22a8 8 0 0 1 16 0v22M55 64a5 5 0 0 1 10 0v10H55zM55 98a5 5 0 0 1 10 0v8H55z" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
