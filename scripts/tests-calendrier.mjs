// Rejoue tous les tests à plusieurs moments de l'année scolaire (semaine complète, semaine avec un
// jour de congé, veille de vacances…) : un test ne doit pas dépendre du jour où on le lance.
// Lancer : npm run test:calendrier
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const DATES = ['2026-11-05', '2026-11-14', '2026-11-21', '2026-11-28', '2026-12-12', '2026-12-19', '2027-01-09', '2027-02-06', '2027-02-13', '2027-03-27', '2027-04-24', '2027-05-15', '2027-06-26'];
const tests = readdirSync('tests').filter((f) => f.endsWith('.test.ts')).map((f) => `tests/${f}`);
let rate = 0;
for (const date of DATES) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings=ExperimentalWarning', '--import', './scripts/horloge-test.mjs', '--import', './scripts/test-hooks.mjs', '--test', ...tests],
    { env: { ...process.env, IPES_TEST_DATE: `${date}T10:31:00` }, encoding: 'utf8' },
  );
  const rates = (r.stdout.match(/^not ok .*$/gm) ?? []).filter((l) => !/^not ok \d+ - tests\//.test(l));
  console.log(`${date} : ${r.status === 0 ? 'tout passe' : `${rates.length} test(s) en échec`}`);
  rates.forEach((l) => console.log(`  ${l}`));
  if (r.status !== 0) rate++;
}
process.exit(rate ? 1 : 0);
