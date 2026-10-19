// Pendant les tests, pas de connexion Microsoft : un jeton factice suffit (Graph est simulé).
export async function jeton(): Promise<string> {
  return 'jeton-de-test';
}
