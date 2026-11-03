// Mini-carte de l'IPES (décorative mais parlante) : elle explique l'ordre des colonnes de l'écran
// Locaux. PR au nord le long des terrains, BC à l'ouest (rue Papleux), le BT et sa tour à l'est
// (chaussée de Mons), le BF en équerre à l'autre bout du BT. Dessin maison, nord en haut, formes un peu épaissies pour rester lisibles.

export function MiniPlan() {
  return (
    <svg
      className="mini-plan"
      viewBox="10 -8 350 262"
      role="img"
      aria-label="Plan de l'école : les PR au nord le long des terrains, BC à l'ouest rue Papleux, BT et sa tour à l'est chaussée de Mons, BF en équerre à l'autre bout du BT"
    >
      <path className="mp-rue" d="M24 -10 L60 256" />
      <path className="mp-rue mp-rue--large" d="M190 262 L380 104" />
      <rect className="mp-herbe" x="128" y="102" width="64" height="40" rx="8" transform="rotate(-40 160 122)" />
      <polygon className="mp-bat" points="73,62 67,30 193,3 199,35" />
      <polygon className="mp-bat" points="51,85 93,75 121,195 79,205" />
      {/* BT le long de la chaussée, la tour au bout ; BF en équerre à l'autre bout. */}
      <polygon className="mp-bat" points="235,41 303,122 277,144 209,63" />
      <polygon className="mp-bat" points="224,211 302,146 282,123 204,188" />
      <circle className="mp-tour" cx="205" cy="207" r="25" />
      <text className="mp-txt" x="133" y="33">PR</text>
      <text className="mp-txt" x="86" y="140">BC</text>
      <text className="mp-txt" x="256" y="92">BF</text>
      <text className="mp-txt mp-txt--tour" x="205" y="208">BT</text>
    </svg>
  );
}
