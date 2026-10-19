// Le signe de Pulse : un battement, tracé à la craie.

export function Glyphe({ anime = false, taille = 40 }: { anime?: boolean; taille?: number }) {
  return (
    <svg className={`glyphe${anime ? ' glyphe--anime' : ''}`} viewBox="0 0 100 60" width={taille} height={(taille * 60) / 100} aria-hidden="true">
      <path d="M4 34h22l8-22 12 40 10-30 7 12h33" fill="none" stroke="var(--jaune)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" pathLength={100} />
      <circle cx="63" cy="34" r="5.5" fill="var(--bleu)" />
    </svg>
  );
}
