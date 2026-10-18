// Lance les tests sans dépendance : Node retire les types TypeScript (type stripping)
// et ce petit crochet ajoute l'extension « .ts » aux imports relatifs du code de l'app.
import { register } from 'node:module';

register('./test-resolve.mjs', import.meta.url);
