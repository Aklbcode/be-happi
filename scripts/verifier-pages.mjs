// Après « npm run build » : chaque page (Be Happi, Décale) charge bien ses fichiers.
// Vérifie que les adresses relatives des <script>, <link> et icônes existent dans dist/.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const racine = process.argv[2] ?? 'dist';
const pages = [];
const parcourir = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) parcourir(p);
    else if (n.endsWith('.html')) pages.push(p);
  }
};
parcourir(racine);

let erreurs = 0;
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const liens = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#|mailto:)/.test(u));
  for (const u of liens) {
    const cible = join(dirname(page), u.split(/[?#]/)[0]);
    const ok = existsSync(cible);
    if (!ok) erreurs++;
    console.log(`${ok ? 'ok ' : 'MANQUE'} ${relative(racine, page)} → ${u}`);
  }
}
if (!pages.some((p) => p.endsWith(join('decale', 'index.html')))) {
  console.log('MANQUE decale/index.html');
  erreurs++;
}
if (erreurs) {
  console.error(`${erreurs} fichier(s) introuvable(s)`);
  process.exit(1);
}
console.log(`${pages.length} page(s) vérifiée(s)`);
