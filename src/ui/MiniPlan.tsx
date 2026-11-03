// Mini-carte de l'IPES (décorative mais parlante) : elle explique l'ordre des colonnes de l'écran
// Locaux. PR au nord le long des terrains, BC à l'ouest (rue Papleux), BF au milieu, en équerre avec
// le BT et sa tour à l'est (chaussée de Mons). Dessin maison, nord en haut, formes un peu épaissies pour rester lisibles.

export function MiniPlan() {
  return (
    <svg
      className="mini-plan"
      viewBox="10 -8 350 262"
      role="img"
      aria-label="Plan de l'école : les PR au nord le long des terrains, BC à l'ouest rue Papleux, BF au milieu, BT et sa tour à l'est chaussée de Mons"
    >
      <path className="mp-rue" d="M24 -10 L60 256" />
      <path className="mp-rue mp-rue--large" d="M190 262 L380 104" />
      <rect className="mp-herbe" x="232" y="8" width="96" height="54" rx="9" transform="rotate(-12 280 35)" />
      <polygon className="mp-bat" points="73,62 67,30 193,3 199,35" />
      <polygon className="mp-bat" points="51,85 93,75 121,195 79,205" />
      {/* BF et BT en équerre, la tour dans l'angle. */}
      <polygon className="mp-bat" points="143,85 219,176 193,198 117,107" />
      <polygon className="mp-bat" points="224,217 310,146 290,122 204,194" />
      <circle className="mp-tour" cx="205" cy="207" r="25" />
      <text className="mp-txt" x="133" y="33">PR</text>
      <text className="mp-txt" x="86" y="140">BC</text>
      <text className="mp-txt" x="166" y="140">BF</text>
      <text className="mp-txt mp-txt--tour" x="205" y="208">BT</text>
    </svg>
  );
}
