// Petit générateur de QR code (mode octet, correction M, versions 1 à 10), sans dépendance.
// Assez pour une adresse Be Happi collée sur la porte d'un local (#/signaler?local=BF110).

/** Blocs de correction M : [codes de correction par bloc, [nombre de blocs, octets de données par bloc]…]. */
const BLOCS_M: [number, [number, number][]][] = [
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [22, [[2, 38], [2, 39]]],
  [22, [[3, 36], [2, 37]]],
  [26, [[4, 43], [1, 44]]],
];

const ALIGNEMENTS: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// Corps de Galois GF(256), polynôme primitif x^8 + x^4 + x^3 + x^2 + 1.
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generateur(degre: number): number[] {
  let g = [1];
  for (let i = 0; i < degre; i++) {
    const n = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      n[j] ^= g[j];
      n[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = n;
  }
  return g;
}

function correction(donnees: number[], degre: number): number[] {
  const g = generateur(degre);
  const reste = [...donnees, ...new Array<number>(degre).fill(0)];
  for (let i = 0; i < donnees.length; i++) {
    const c = reste[i];
    if (c === 0) continue;
    for (let j = 0; j < g.length; j++) reste[i + j] ^= mul(g[j], c);
  }
  return reste.slice(donnees.length);
}

/** 15 bits d'information de format (correction M = 00, masque 0–7). */
function bitsFormat(masque: number): number {
  const donnee = (0b00 << 3) | masque;
  let reste = donnee;
  for (let i = 0; i < 10; i++) reste = (reste << 1) ^ ((reste >>> 9) * 0x537);
  return ((donnee << 10) | reste) ^ 0x5412;
}

/** 18 bits d'information de version (versions 7 et plus). */
function bitsVersion(version: number): number {
  let reste = version;
  for (let i = 0; i < 12; i++) reste = (reste << 1) ^ ((reste >>> 11) * 0x1f25);
  return (version << 12) | reste;
}

/** Matrice du QR code (true = module foncé). */
export function qrCode(texte: string): boolean[][] {
  const octets = Array.from(new TextEncoder().encode(texte));
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const [, blocs] = BLOCS_M[v - 1];
    const capacite = blocs.reduce((s, [n, d]) => s + n * d, 0);
    const bits = 4 + (v < 10 ? 8 : 16) + octets.length * 8;
    if (bits <= capacite * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error('Texte trop long pour le QR code');
  const [ecParBloc, blocs] = BLOCS_M[version - 1];
  const capacite = blocs.reduce((s, [n, d]) => s + n * d, 0);

  // Flux de bits : mode octet, longueur, données, terminateur, remplissage.
  const bits: number[] = [];
  const pousser = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  pousser(0b0100, 4);
  pousser(octets.length, version < 10 ? 8 : 16);
  octets.forEach((o) => pousser(o, 8));
  pousser(0, Math.min(4, capacite * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const donnees: number[] = [];
  for (let i = 0; i < bits.length; i += 8) donnees.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; donnees.length < capacite; p++) donnees.push(p % 2 ? 0x11 : 0xec);

  // Blocs, correction, entrelacement.
  const blocsDonnees: number[][] = [];
  let k = 0;
  for (const [n, d] of blocs) for (let i = 0; i < n; i++) blocsDonnees.push(donnees.slice(k, (k += d)));
  const blocsEc = blocsDonnees.map((b) => correction(b, ecParBloc));
  const flux: number[] = [];
  const maxD = Math.max(...blocsDonnees.map((b) => b.length));
  for (let i = 0; i < maxD; i++) for (const b of blocsDonnees) if (i < b.length) flux.push(b[i]);
  for (let i = 0; i < ecParBloc; i++) for (const b of blocsEc) flux.push(b[i]);

  const taille = version * 4 + 17;
  const m: (boolean | null)[][] = Array.from({ length: taille }, () => new Array<boolean | null>(taille).fill(null));
  const reserve: boolean[][] = Array.from({ length: taille }, () => new Array<boolean>(taille).fill(false));
  const poser = (r: number, c: number, v: boolean) => {
    m[r][c] = v;
    reserve[r][c] = true;
  };

  // Motifs de repérage (coins) et séparateurs.
  for (const [r0, c0] of [[0, 0], [0, taille - 7], [taille - 7, 0]]) {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= taille || cc >= taille) continue;
        const dans = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const fonce = dans && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        poser(rr, cc, fonce);
      }
  }
  // Motifs d'alignement.
  const pos = ALIGNEMENTS[version - 1];
  for (const r of pos)
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === taille - 7) || (r === taille - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) poser(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  // Lignes de synchronisation.
  for (let i = 8; i < taille - 8; i++) {
    if (!reserve[6][i]) poser(6, i, i % 2 === 0);
    if (!reserve[i][6]) poser(i, 6, i % 2 === 0);
  }
  // Module foncé et zones d'information de format (remplies plus tard).
  poser(taille - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!reserve[8][i]) poser(8, i, false);
    if (!reserve[i][8]) poser(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    poser(8, taille - 1 - i, false);
    if (!reserve[taille - 1 - i][8]) poser(taille - 1 - i, 8, false);
  }
  // Information de version (à partir de la version 7).
  if (version >= 7) {
    const v = bitsVersion(version);
    for (let i = 0; i < 18; i++) {
      const b = ((v >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const c = (i % 3) + taille - 11;
      poser(a, c, b);
      poser(c, a, b);
    }
  }

  // Placement des données en zigzag.
  const tousBits: number[] = [];
  flux.forEach((o) => {
    for (let i = 7; i >= 0; i--) tousBits.push((o >> i) & 1);
  });
  let idx = 0;
  let monte = true;
  for (let col = taille - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let n = 0; n < taille; n++) {
      const r = monte ? taille - 1 - n : n;
      for (const c of [col, col - 1]) {
        if (reserve[r][c]) continue;
        m[r][c] = idx < tousBits.length ? tousBits[idx++] === 1 : false;
      }
    }
    monte = !monte;
  }

  // Choix du masque : le moins pénalisé.
  const masques: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  const avecFormat = (masque: number): boolean[][] => {
    const g = m.map((ligne, r) => ligne.map((v, c) => (!reserve[r][c] && masques[masque](r, c) ? !v : !!v)));
    const f = bitsFormat(masque);
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    // Première copie, autour du repère en haut à gauche.
    for (let i = 0; i <= 5; i++) g[i][8] = bit(i);
    g[7][8] = bit(6);
    g[8][8] = bit(7);
    g[8][7] = bit(8);
    for (let i = 9; i < 15; i++) g[8][14 - i] = bit(i);
    // Seconde copie, près des deux autres repères.
    for (let i = 0; i < 8; i++) g[8][taille - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) g[taille - 15 + i][8] = bit(i);
    g[taille - 8][8] = true;
    return g;
  };

  let meilleur: boolean[][] | null = null;
  let score = Infinity;
  for (let k2 = 0; k2 < 8; k2++) {
    const g = avecFormat(k2);
    const p = penalite(g);
    if (p < score) {
      score = p;
      meilleur = g;
    }
  }
  return meilleur!;
}

function penalite(g: boolean[][]): number {
  const n = g.length;
  let p = 0;
  // N1 : suites de 5 modules ou plus de la même couleur.
  for (let r = 0; r < n; r++) {
    for (const ligne of [g[r], g.map((x) => x[r])]) {
      let suite = 1;
      for (let i = 1; i < n; i++) {
        if (ligne[i] === ligne[i - 1]) suite++;
        else {
          if (suite >= 5) p += suite - 2;
          suite = 1;
        }
      }
      if (suite >= 5) p += suite - 2;
    }
  }
  // N2 : carrés 2 × 2.
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) p += 3;
  // N3 : motifs qui ressemblent aux repères.
  const motif = [true, false, true, true, true, false, true];
  for (let r = 0; r < n; r++)
    for (let c = 0; c + 7 <= n; c++) {
      for (const ligne of [g[r], g.map((x) => x[r])]) {
        if (!motif.every((v, i) => ligne[c + i] === v)) continue;
        const avant = c >= 4 && [1, 2, 3, 4].every((i) => !ligne[c - i]);
        const apres = c + 11 <= n && [7, 8, 9, 10].every((i) => !ligne[c + i]);
        if (avant || apres) p += 40;
      }
    }
  // N4 : proportion de modules foncés.
  const fonces = g.flat().filter(Boolean).length;
  p += Math.floor(Math.abs((fonces * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

/** Le QR code en SVG (avec la marge blanche réglementaire de 4 modules). */
export function qrSvg(texte: string, taillePx = 160): string {
  const g = qrCode(texte);
  const n = g.length + 8;
  let d = '';
  g.forEach((ligne, r) => ligne.forEach((v, c) => {
    if (v) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${taillePx}" height="${taillePx}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#0f1630"/></svg>`;
}
