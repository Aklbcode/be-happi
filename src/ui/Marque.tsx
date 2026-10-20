// La marque : la tour ronde de l'IPES (emblème de l'école), dessinée d'après le bâtiment — toit
// conique vert, corniche brique, couronne de fenêtres, corps en briques claires.

const CONE = '#2f5446';
const BRIQUE = '#b5532f';

export function Tour({ taille = 34, fond = '#f1e6d4' }: { taille?: number; fond?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={taille} height={taille} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill={fond} />
      <rect x="38" y="5" width="2.6" height="9" rx="1" fill={CONE} />
      <path d="M11 22.5 32 9.5l21 13q-21 4.5-42 0z" fill={CONE} />
      <path d="M10.5 22.4q21.5 5 43 0v2.8q-21.5 5-43 0z" fill={BRIQUE} />
      <path d="M13 25.6q19 4.2 38 0V31q-19 4.2-38 0z" fill="#ead9bc" />
      {[15.5, 20.7, 25.9, 31.1, 36.3, 41.5, 46.7].map((x) => (
        <rect key={x} x={x} y={x < 20 || x > 44 ? 26.6 : 27.4} width="2.6" height="3.6" rx="0.6" fill={CONE} />
      ))}
      <path d="M14 31q18 4 36 0v25q-18 4-36 0z" fill="#d6bd96" />
      <path d="M14 40q18 4 36 0M14 48q18 4 36 0" fill="none" stroke="#c2a479" strokeWidth="1.2" />
    </svg>
  );
}

/** La tour en filigrane, au trait (bas du menu). */
export function TourTrait({ largeur = 120 }: { largeur?: number }) {
  return (
    <svg viewBox="0 0 120 170" width={largeur} height={(largeur * 170) / 120} aria-hidden="true" focusable="false" className="tour-trait">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M70 6v18M14 50 60 20l46 30q-46 10-92 0z" />
        <path d="M12 50q48 11 96 0v6q-48 11-96 0zM16 58v16q44 10 88 0V58" />
        <path d="M18 74v90h84V74" />
      </g>
      <g stroke="currentColor" strokeWidth="1.2" opacity="0.6" fill="none">
        <path d="M18 100q42 10 84 0M18 128q42 10 84 0" />
        {[24, 36, 48, 60, 72, 84, 96].map((x) => (
          <path key={x} d={`M${x} 63v9`} />
        ))}
      </g>
    </svg>
  );
}
