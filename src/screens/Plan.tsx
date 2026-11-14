// Écran « Plan du jour » (éducateurs, secrétariat, direction) : à partir des absences, les
// déplacements à proposer aux profs pour toute l'école (src/logic/planEcole.ts). On prévient le prof
// par Teams (message prêt), il propose dans son horaire, et l'éducateur valide, comme toujours.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { prochainsJours } from '../ui/Choix';
import { nomAffiche } from '../logic/horaire';
import { gainProf, messagePlan, planEcole, textePlan, trajetPlan, type MouvementPlan, type PlanEcole, type PlanProf } from '../logic/planEcole';
import { JOURS, JOURS_COURTS, deIso, dureeTxt, jourSemaineIso, periode } from '../lib/calendar';
import { lien } from '../lib/route';

const CLE_PREVENUS = 'ipes-plan-prevenus';
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Les profs déjà prévenus depuis cet appareil (une semaine au plus) : lot de déplacements → date et heure. */
function lirePrevenus(): Record<string, string> {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_PREVENUS) ?? '{}') as Record<string, string>;
    const limite = Date.now() - 7 * 86400000;
    return Object.fromEntries(Object.entries(brut).filter(([, quand]) => new Date(quand).getTime() > limite));
  } catch {
    return {};
  }
}

const cleLot = (p: PlanProf): string => p.mouvements.map((m) => m.cle).join(' ');

export function Plan() {
  const { ds, aujourdhui, heurePassee, ouvrirTeams, montrerToast } = useStore();
  const [portee, setPortee] = useState<2 | 5>(2);
  const [plan, setPlan] = useState<PlanEcole | null>(null);
  const [prevenus, setPrevenus] = useState<Record<string, string>>(lirePrevenus);

  // Aujourd'hui (s'il reste des heures) et les jours de cours suivants.
  const fini = heurePassee >= 9;
  const jours = useMemo(
    () => prochainsJours(deIso(aujourdhui), portee + 1).filter((d) => d > aujourdhui || !fini).slice(0, portee),
    [aujourdhui, fini, portee],
  );
  const cleJours = jours.join(',');

  // Le calcul peut prendre une seconde un jour chargé : on affiche d'abord l'écran.
  // Quand seules les données changent (relecture, écriture), l'ancien plan reste affiché en attendant.
  useEffect(() => setPlan(null), [cleJours]);
  useEffect(() => {
    if (!ds) return;
    const id = window.setTimeout(() => setPlan(planEcole(ds, cleJours.split(','), aujourdhui, heurePassee)), 30);
    return () => window.clearTimeout(id);
  }, [ds, cleJours, aujourdhui, heurePassee]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;

  const jour = (date: string) => (date === aujourdhui ? 'aujourd’hui' : `${JOURS[jourSemaineIso(date)]} ${deIso(date).getDate()}`);
  const periodeTxt = jours.length > 2 ? `Jusqu’à ${jour(jours[jours.length - 1])}` : jours.map(jour).join(' et ').replace(/^./, (x) => x.toUpperCase());

  const noter = (p: PlanProf) => {
    const suite = { ...prevenus, [cleLot(p)]: new Date().toISOString() };
    setPrevenus(suite);
    try {
      localStorage.setItem(CLE_PREVENUS, JSON.stringify(suite));
    } catch {
      /* stockage indisponible : pas grave */
    }
  };
  const copier = async (texte: string, dit: string) => {
    try {
      await navigator.clipboard.writeText(texte);
      montrerToast(dit);
    } catch {
      montrerToast('Copie impossible sur cet appareil');
    }
  };
  const ecrire = (p: PlanProf) => {
    const message = messagePlan(p, aujourdhui);
    if (p.email) ouvrirTeams({ type: 'teams-chat', emails: [p.email], noms: [nomAffiche(p.prof)], message });
    else void copier(message, 'Message copié');
    noter(p);
  };
  const quandPrevenu = (p: PlanProf): string | null => {
    const q = prevenus[cleLot(p)];
    if (!q) return null;
    const d = new Date(q);
    return `${d.toISOString().slice(0, 10) === aujourdhui ? '' : `${JOURS_COURTS[jourSemaineIso(q.slice(0, 10))].toLowerCase()}. `}${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const b = plan?.bilan;
  const aPrevenir = plan ? plan.profs.filter((p) => !prevenus[cleLot(p)]).length : 0;

  return (
    <section className="ecran ecran--large" aria-label="Plan du jour">
      <Entete titre="Plan du jour" sous={periodeTxt} retour={lien('pilotage')} />

      <div className="defile-x" role="group" aria-label="Jours regardés">
        <button className="choix" aria-pressed={portee === 2} onClick={() => setPortee(2)}>
          2 jours
        </button>
        <button className="choix" aria-pressed={portee === 5} onClick={() => setPortee(5)}>
          5 jours
        </button>
      </div>

      <section className="carte-nuit" aria-label="Le plan en bref" aria-busy={!plan}>
        {!plan || !b ? (
          <p className="texte">Calcul du plan pour toute l’école…</p>
        ) : b.sansProf === 0 ? (
          <>
            <h2 className="chiffre-heros">
              0<small> heure sans prof à reprendre</small>
            </h2>
            <p className="texte">Rien à proposer : aucune absence à venir sur ces jours, ou tout est déjà repris.</p>
          </>
        ) : (
          <>
            <h2 className="chiffre-heros">
              {b.reprises}
              <small> {b.reprises > 1 ? 'heures de classe à reprendre' : 'heure de classe à reprendre'} sur {b.sansProf} sans prof</small>
            </h2>
            {b.reprises > 0 ? (
              <p className="texte">
                {b.sansEchange === b.reprises ? 'Toutes' : `${b.sansEchange} sur ${b.reprises}`} sans heure libre ailleurs en échange
                {b.minutesProfs > 0 ? ` · les profs y gagnent ${dureeTxt(b.minutesProfs)} en tout` : ''} · {pluriel(plan.profs.length, 'prof')} à prévenir
              </p>
            ) : (
              <p className="texte">Aucun prof ne peut avancer un cours sans y perdre. Pour ces heures : une remédiation, depuis Pilotage.</p>
            )}
          </>
        )}
      </section>

      {plan && plan.profs.length > 0 && (
        <>
          <p className="texte">
            Tu préviens le prof, il propose le déplacement dans son horaire, tu valides. Personne n’y perd : pas de jour de cours en plus, pas de journée plus
            longue, pas de fourche en plus.
          </p>
          <div className="grille-2">
            {plan.profs.map((p) => {
              const prevenu = quandPrevenu(p);
              return (
                <section key={p.prof} className="carte" aria-label={`Pour ${nomAffiche(p.prof)}`}>
                  <div className="rangee rangee--entre">
                    <h2 className="titre-m">{nomAffiche(p.prof)}</h2>
                    {p.gain > 0 ? <span className="puce puce--indigo">gagne {gainProf(p)}</span> : <span className="puce puce--grise">pour la classe</span>}
                  </div>
                  <div>
                    {p.mouvements.map((m) => (
                      <LigneMouvement key={m.cle} m={m} jour={jour} />
                    ))}
                  </div>
                  {p.phrases.length > 0 && <p className="texte">{p.phrases.map((x) => x.texte).join('. ')}.</p>}
                  <div className="rangee enrouler">
                    <button className={`bouton bouton--petit ${prevenu ? 'bouton--sec' : 'bouton--prim'}`} onClick={() => ecrire(p)}>
                      <Icon nom={p.email ? 'message' : 'copie'} taille={18} /> {p.email ? (prevenu ? 'Réécrire sur Teams' : 'Proposer sur Teams') : 'Copier le message'}
                    </button>
                    {prevenu && (
                      <span className="rangee petit">
                        <Icon nom="coche" taille={16} epaisseur={2.4} /> Prévenu·e à {prevenu}
                      </span>
                    )}
                    {!p.email && !prevenu && <span className="petit">Pas encore d’adresse Teams pour ce prof</span>}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="rangee enrouler">
            <button className="bouton bouton--sec bouton--petit" onClick={() => void copier(textePlan(plan), 'Plan copié')}>
              <Icon nom="copie" taille={18} /> Copier tout le plan
            </button>
            <span className="petit">
              {aPrevenir ? `${pluriel(aPrevenir, 'prof')} encore à prévenir` : 'Tout le monde est prévenu'} · {pluriel(plan.examines, 'déplacement')} possible{plan.examines > 1 ? 's' : ''} examiné{plan.examines > 1 ? 's' : ''}
              {plan.exact ? '' : ' · journée chargée : le meilleur plan trouvé'}
            </span>
          </div>
        </>
      )}

      {plan && plan.restent.length > 0 && (
        <section className="carte" aria-label="Ce qui reste à l'étude">
          <div className="rangee rangee--entre">
            <h2 className="titre-m">Restent à l’étude · {plan.restent.length}</h2>
            <a className="lien-action" href={lien('pilotage')}>
              Qui peut les prendre ?
            </a>
          </div>
          {jours.map((d) => {
            const duJour = plan.restent.filter((x) => x.date === d);
            if (!duJour.length) return null;
            const heures = [...new Set(duJour.map((x) => x.h))].sort((x, y) => x - y);
            return (
              <div key={d} className="ligne-statut">
                <span className="point-ton point-ton--orange" aria-hidden="true" />
                <span className="pile grandit">
                  <span className="fort">{jour(d).replace(/^./, (x) => x.toUpperCase())}</span>
                  <span className="petit">{heures.map((h) => `H${h} : ${duJour.filter((x) => x.h === h).map((x) => x.classe).join(', ')}`).join(' · ')}</span>
                </span>
              </div>
            );
          })}
        </section>
      )}
    </section>
  );
}

function LigneMouvement({ m, jour }: { m: MouvementPlan; jour: (date: string) => string }) {
  const o = m.option;
  const gagne = m.classes.some((c) => c.signe === 'gain');
  return (
    <div className="ligne-statut">
      <span className={`point-ton point-ton--${gagne ? 'indigo' : 'pale'}`} style={{ alignSelf: 'flex-start', marginTop: 6 }} aria-hidden="true" />
      <span className="pile grandit">
        <span className="fort">
          {o.classe} · {trajetPlan(m)}
        </span>
        <span className="petit">
          {jour(o.date).replace(/^./, (x) => x.toUpperCase())} à {periode(o.h).debut}, à la place de {nomAffiche(o.absent)}
          {m.local ? ` · ${m.local}${m.localChange ? ' (autre local)' : ''}` : ''}
        </span>
        {m.classes.map((c) => (
          <span key={c.classe} className="petit">
            {c.texte}
          </span>
        ))}
        {m.domino && <span className="petit">Coup de pouce : {m.domino.texte}</span>}
      </span>
    </div>
  );
}
