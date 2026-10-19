// Quelques icônes tracées comme au stylo (trait rond, 2 px).

type Nom = 'soleil' | 'lune' | 'coche' | 'moins' | 'point' | 'croix' | 'gauche' | 'droite' | 'retour' | 'horloge' | 'attention';

const TRACES: Record<Nom, JSX.Element> = {
  soleil: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  lune: <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" />,
  coche: <path d="M5 12.5l4.2 4.2L19 7" />,
  moins: <path d="M6 12h12" />,
  point: <circle cx="12" cy="12" r="2.6" />,
  croix: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  gauche: <path d="M14.5 6l-6 6 6 6" />,
  droite: <path d="M9.5 6l6 6-6 6" />,
  retour: <path d="M9 7H5v4M5.4 10.6A7.5 7.5 0 1 1 7 17.6" />,
  horloge: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  attention: (
    <>
      <path d="M12 4l9 15.5H3L12 4Z" />
      <path d="M12 10v4M12 17v.01" />
    </>
  ),
};

export function Icone({ nom, taille = 20 }: { nom: Nom; taille?: number }) {
  return (
    <svg className="icone" viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true" focusable="false">
      {TRACES[nom]}
    </svg>
  );
}
