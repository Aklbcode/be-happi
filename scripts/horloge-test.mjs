// Pour les tests : une horloge réglée sur une date choisie (IPES_TEST_DATE=2027-01-09T10:31:00).
// La démo se joue « le prochain lundi de cours » : une semaine avec un congé ne ressemble pas à une
// semaine complète. Ce crochet permet de rejouer les tests à d'autres moments de l'année.
const fixe = process.env.IPES_TEST_DATE;
if (fixe) {
  const Vraie = Date;
  const base = new Vraie(fixe).getTime();
  const depart = Vraie.now();
  const maintenant = () => base + (Vraie.now() - depart);
  globalThis.Date = class extends Vraie {
    constructor(...a) {
      if (a.length === 0) super(maintenant());
      else super(...a);
    }
    static now() {
      return maintenant();
    }
  };
}
