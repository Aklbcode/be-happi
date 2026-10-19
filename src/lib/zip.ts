// Archive .zip minimale, sans dépendance : fichiers « stockés » (sans compression), assez pour le
// paquet Teams (un manifeste et deux icônes). Lisible par Windows, macOS, Teams et tout outil zip.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Somme de contrôle CRC-32 (celle du format zip). */
export function crc32(donnees: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < donnees.length; i++) c = TABLE[(c ^ donnees[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface FichierZip {
  nom: string;
  donnees: Uint8Array;
}

/** Assemble les fichiers en une archive .zip. */
export function archiveZip(fichiers: FichierZip[], date = new Date()): Uint8Array {
  const encodeur = new TextEncoder();
  const heure = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const jour = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const morceaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let decalage = 0;

  for (const f of fichiers) {
    const nom = encodeur.encode(f.nom);
    const crc = crc32(f.donnees);
    const taille = f.donnees.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // en-tête local
    local.setUint16(4, 10, true); // version nécessaire : 1.0 (stocké)
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true); // méthode : stocké
    local.setUint16(10, heure, true);
    local.setUint16(12, jour, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, taille, true);
    local.setUint32(22, taille, true);
    local.setUint16(26, nom.length, true);
    local.setUint16(28, 0, true);
    morceaux.push(new Uint8Array(local.buffer), nom, f.donnees);

    const entree = new DataView(new ArrayBuffer(46));
    entree.setUint32(0, 0x02014b50, true); // entrée du répertoire central
    entree.setUint16(4, 20, true); // créé avec : 2.0
    entree.setUint16(6, 10, true);
    entree.setUint16(8, 0x0800, true);
    entree.setUint16(10, 0, true);
    entree.setUint16(12, heure, true);
    entree.setUint16(14, jour, true);
    entree.setUint32(16, crc, true);
    entree.setUint32(20, taille, true);
    entree.setUint32(24, taille, true);
    entree.setUint16(28, nom.length, true);
    entree.setUint32(42, decalage, true); // où commence l'en-tête local
    central.push(new Uint8Array(entree.buffer), nom);

    decalage += 30 + nom.length + taille;
  }

  const tailleCentral = central.reduce((s, b) => s + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); // fin du répertoire central
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, decalage, true);

  const tout = [...morceaux, ...central, new Uint8Array(fin.buffer)];
  const sortie = new Uint8Array(tout.reduce((s, b) => s + b.length, 0));
  let i = 0;
  for (const b of tout) {
    sortie.set(b, i);
    i += b.length;
  }
  return sortie;
}
