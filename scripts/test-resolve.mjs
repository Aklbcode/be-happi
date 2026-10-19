// Crochet de résolution : « ../lib/calendar » → « ../lib/calendar.ts ».
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// La connexion Microsoft (MSAL) est remplacée par tests/stubs/auth.ts : Graph est simulé dans les tests.
const AUTH_FACTICE = new URL('../tests/stubs/auth.ts', import.meta.url).href;

export async function resolve(specifier, context, next) {
  const relatif = specifier.startsWith('./') || specifier.startsWith('../');
  if (relatif && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.startsWith('file:')) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(specifier + ext, context.parentURL);
      if (existsSync(fileURLToPath(url))) {
        if (url.href.endsWith('/src/lib/auth.ts')) return next(AUTH_FACTICE, context);
        return next(url.href, context);
      }
    }
  }
  return next(specifier, context);
}
