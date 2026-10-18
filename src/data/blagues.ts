// Blagues courtes sur l'école, sans moquerie ni sous-entendu. Une par jour.
export const BLAGUES = [
  "Pourquoi le livre de maths est-il triste ? Parce qu'il a trop de problèmes.",
  "Pourquoi les poissons sont-ils si sages ? Parce qu'ils vivent en bancs.",
  "Quel est le comble pour un prof de géographie ? Perdre le nord.",
  "Quel est le comble pour un prof de chimie ? Ne pas avoir de réaction.",
  "Quel est le comble pour un prof de musique ? Ne pas avoir la note.",
  "Quel est le comble pour un prof d'histoire ? Ne pas avoir d'avenir.",
  "Quel est le comble pour un prof de sport ? Être à bout de souffle.",
  "Pourquoi la calculatrice est-elle si fiable ? Parce qu'on peut toujours compter sur elle.",
  "Que dit un 0 à un 8 ? « Jolie ceinture ! »",
  "Pourquoi l'élève apporte-t-il une échelle en classe ? Pour passer dans la classe supérieure.",
  "Quelle est la boisson préférée des profs de maths ? Le thé… orème.",
  "Pourquoi le tableau blanc est-il toujours zen ? Parce qu'il efface tout.",
  "Qu'est-ce qu'un prof sans café à 8h25 ? Un mystère que la science n'a pas encore résolu.",
  "Que dit un neutron quand on lui demande le prix d'un café ? « Pour vous, c'est sans charge. »",
  "Pourquoi les mitochondries sont-elles si populaires ? Elles ont toujours de l'énergie à revendre.",
  "Point commun entre un prof et un GPS ? Les deux disent « recalcul en cours » quand on ne suit pas les consignes.",
  "Pourquoi le journal de classe est-il toujours fatigué ? Il a trop de devoirs.",
  "Que fait un prof de maths quand il a froid ? Il se met dans un coin : il y fait 90 degrés.",
  "Pourquoi les profs de chimie aiment le vendredi ? Parce que le week-end, c'est la meilleure des solutions.",
  "Pourquoi la règle ne se dispute jamais ? Parce qu'elle reste toujours droite.",
  "Pourquoi l'ADN ne se perd jamais ? Parce qu'il a toujours son plan sur lui.",
  "Pourquoi le compas est-il si apprécié ? Parce qu'il tourne toujours rond.",
];

export function blagueDuJour(d: Date): string {
  const debut = new Date(2026, 0, 1);
  const n = Math.floor((d.getTime() - debut.getTime()) / 86400000);
  return BLAGUES[((n % BLAGUES.length) + BLAGUES.length) % BLAGUES.length];
}
