// Écran « Absences » (secrétariat) : encoder une absence en voyant tout de suite son impact (cours,
// classes, pistes de récupération), puis gérer les absences du jour. Jamais de motif.

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import type { Absence } from '../data/types';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { Remarques } from '../ui/Remarques';
import { ChoixJour, prochainsJours } from '../ui/Choix';
import { impactAbsence } from '../logic/impact';
import { remarquesSecretariat } from '../logic/remarques';
import { nomAffiche } from '../logic/horaire';
import { sansAccents } from '../data/champs';
import { dateLongue, deIso, estJourDeCours, periode, plusJoursIso } from '../lib/calendar';

const HEURES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function Absences({ params }: { params: URLSearchParams }) {
  const { ds, maintenant, aujourdhui, encoderAbsences, modifierAbsence, supprimerAbsence, montrerToast, profil } = useStore();
  const jours = useMemo(() => prochainsJours(maintenant, 6), [maintenant]);
  const [date, setDate] = useState(params.get('date') ?? (estJourDeCours(maintenant) ? aujourdhui : jours[0]));
  const [prof, setProf] = useState('');
  const [texte, setTexte] = useState('');
  const [du, setDu] = useState(date);
  const [au, setAu] = useState(date);
  const [deH, setDeH] = useState(1);
  const [aH, setAH] = useState(9);
  const [envoi, setEnvoi] = useState(false);
  const peutEcrire = profil === 'secretariat' || profil === 'educateur';

  const tous = useMemo(() => (ds ? [...new Set([...ds.cours.map((c) => c.prof), ...ds.profs.map((p) => p.nom)])].sort() : []), [ds]);
  const propositions = texte && !prof ? tous.filter((p) => sansAccents(p).includes(sansAccents(texte))).slice(0, 6) : [];

  const apercu = useMemo(() => {
    if (!ds || !prof || au < du) return null;
    const lignes: Absence[] = [];
    for (let d = du; d <= au && lignes.length < 30; d = plusJoursIso(d, 1)) {
      if (!estJourDeCours(deIso(d))) continue;
      lignes.push({ prof, date: d, deH: d === du ? deH : 1, aH: d === au ? aH : 9 });
    }
    const deja = lignes.filter((l) => ds.absences.some((a) => a.prof === prof && a.date === l.date)).length;
    return { lignes, deja, impact: impactAbsence(ds, lignes) };
  }, [ds, prof, du, au, deH, aH]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const duJour = ds.absences.filter((a) => a.date === date).sort((a, b) => a.prof.localeCompare(b.prof));
  const remarques = date === aujourdhui ? remarquesSecretariat(ds, maintenant) : [];

  async function encoder() {
    if (!prof) return;
    setEnvoi(true);
    try {
      const r = await encoderAbsences(prof, du, au, deH, aH);
      montrerToast(
        r.jours
          ? `${nomAffiche(prof)} · ${r.jours} jour${r.jours > 1 ? 's' : ''} encodé${r.jours > 1 ? 's' : ''}${r.ignores ? ` (${r.ignores} déjà encodé${r.ignores > 1 ? 's' : ''})` : ''}`
          : `${nomAffiche(prof)} est déjà encodé·e pour ces jours`,
      );
      setProf('');
      setTexte('');
      setDeH(1);
      setAH(9);
    } catch (e) {
      montrerToast(`Impossible d'encoder : ${e instanceof Error ? e.message : e}`);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="ecran ecran--large" aria-label="Absences">
      <Entete titre="Absences" sous={dateLongue(deIso(date)).replace(/^./, (x) => x.toUpperCase())} />
      <ChoixJour
        jours={jours}
        date={date}
        aujourdhui={aujourdhui}
        onChoisir={(j) => {
          setDate(j);
          setDu(j);
          setAu(j);
        }}
      />
      <Remarques remarques={remarques} />

      <div className="grille-2">
        {peutEcrire && (
          <section className="carte" aria-label="Encoder une absence">
            <h2 className="titre-m">Encoder une absence</h2>
            {prof ? (
              <div className="rangee">
                <span className="puce puce--indigo puce--retirer">
                  {nomAffiche(prof)}
                  <button onClick={() => { setProf(''); setTexte(''); }} aria-label="Changer de collègue">
                    <Icon nom="fermer" taille={14} epaisseur={2.4} />
                  </button>
                </span>
              </div>
            ) : (
              <div className="recherche recherche--petite">
                <Icon nom="loupe" />
                <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Nom du collègue" aria-label="Nom du collègue absent" />
              </div>
            )}
            {propositions.length > 0 && (
              <div className="rangee enrouler">
                {propositions.map((p) => (
                  <button key={p} className="filtre" onClick={() => setProf(p)}>
                    {nomAffiche(p)}
                  </button>
                ))}
              </div>
            )}
            <div className="champs-2">
              <label className="pile">
                <span className="petit">Du</span>
                <input type="date" className="champ champ--ligne" value={du} onChange={(e) => { setDu(e.target.value); if (e.target.value > au) setAu(e.target.value); }} />
              </label>
              <label className="pile">
                <span className="petit">Au</span>
                <input type="date" className="champ champ--ligne" value={au} min={du} onChange={(e) => setAu(e.target.value)} />
              </label>
              <label className="pile">
                <span className="petit">{du === au ? 'De' : 'Le 1er jour, de'}</span>
                <select className="champ champ--ligne" value={deH} onChange={(e) => setDeH(Number(e.target.value))}>
                  {HEURES.map((h) => <option key={h} value={h}>H{h} · {periode(h).debut}</option>)}
                </select>
              </label>
              <label className="pile">
                <span className="petit">{du === au ? 'À (incluse)' : 'Le dernier jour, à'}</span>
                <select className="champ champ--ligne" value={aH} onChange={(e) => setAH(Number(e.target.value))}>
                  {HEURES.map((h) => <option key={h} value={h} disabled={du === au && h < deH}>H{h} · {periode(h).fin}</option>)}
                </select>
              </label>
            </div>

            {apercu && (
              <div className="impact" aria-live="polite">
                <span className="petit fort">Ce que ça change</span>
                {apercu.impact.heures ? (
                  <>
                    <p className="texte">
                      <b className="fort">{apercu.impact.heures} cours</b> sans prof, pour {apercu.impact.classes.length} classe{apercu.impact.classes.length > 1 ? 's' : ''} ({apercu.impact.classes.slice(0, 6).join(', ')}
                      {apercu.impact.classes.length > 6 ? '…' : ''}).{' '}
                      {apercu.impact.recuperables ? (
                        <>
                          <b className="fort">{apercu.impact.recuperables}</b> peuvent être récupérés par un déplacement de cours.
                        </>
                      ) : (
                        'Aucun collègue ne peut avancer un cours : ce sera de l’étude ou de la remédiation.'
                      )}
                    </p>
                    <ul className="lignes-reponse">
                      {apercu.impact.cours.slice(0, 6).map((c) => (
                        <li key={`${c.date}${c.h}`}>
                          <span className={`point-ton point-ton--${c.pistes.length ? 'indigo' : 'orange'}`} aria-hidden="true" />
                          <span className="pile grandit">
                            <span className="fort">
                              {apercu.lignes.length > 1 ? `${dateLongue(deIso(c.date))} · ` : ''}H{c.h} · {c.classe}
                            </span>
                            <span className="petit">{c.pistes.length ? `Pistes : ${c.pistes.slice(0, 3).map(nomAffiche).join(', ')}` : 'Pas de piste'}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="texte">Aucun cours à ces heures-là : rien ne change pour les classes.</p>
                )}
                {apercu.deja > 0 && <p className="petit">{apercu.deja} jour{apercu.deja > 1 ? 's' : ''} déjà encodé{apercu.deja > 1 ? 's' : ''} : modifie plutôt les heures dans la liste.</p>}
              </div>
            )}

            <button className="bouton bouton--prim" disabled={!prof || envoi || !apercu || apercu.lignes.length === apercu.deja} onClick={() => void encoder()}>
              {envoi ? 'Encodage…' : apercu && apercu.lignes.length > 1 ? `Encoder ${apercu.lignes.length - apercu.deja} jours` : 'Encoder l’absence'}
            </button>
            <p className="petit">Sans motif : Be Happi n’en demande jamais. Les jours de congé sont sautés.</p>
          </section>
        )}

        <section className="pile pile--12" aria-label="Absences du jour">
          <h2 className="titre-m">
            {duJour.length ? `${duJour.length} absent${duJour.length > 1 ? 's' : ''}` : 'Personne d’absent'} · {dateLongue(deIso(date))}
          </h2>
          {duJour.map((a) => (
            <LigneAbsence key={a.id ?? a.prof} a={a} peutEcrire={peutEcrire} modifier={modifierAbsence} supprimer={supprimerAbsence} />
          ))}
        </section>
      </div>
    </section>
  );
}

function LigneAbsence({ a, peutEcrire, modifier, supprimer }: { a: Absence; peutEcrire: boolean; modifier: (a: Absence, deH: number, aH: number) => Promise<void>; supprimer: (a: Absence) => Promise<void> }) {
  const { ds, montrerToast } = useStore();
  const [deH, setDeH] = useState(a.deH);
  const [aH, setAH] = useState(a.aH);
  const [confirmer, setConfirmer] = useState(false);
  if (!ds) return null;
  const imp = impactAbsence(ds, [a]);
  const change = deH !== a.deH || aH !== a.aH;
  return (
    <article className="carte carte--serree">
      <div className="rangee rangee--entre">
        <div className="pile">
          <span className="titre-s">{nomAffiche(a.prof)}</span>
          <span className="petit">
            {imp.heures ? `${imp.heures} cours · ${imp.classes.join(', ')}` : 'Pas de cours à ces heures'}
            {imp.recuperables ? ` · ${imp.recuperables} récupérable${imp.recuperables > 1 ? 's' : ''}` : ''}
          </span>
        </div>
        <span className="puce puce--rose">{a.deH === 1 && a.aH === 9 ? 'Journée' : `H${a.deH}–H${a.aH}`}</span>
      </div>
      {peutEcrire && (
        <div className="rangee enrouler">
          <select className="champ champ--ligne champ--court" value={deH} onChange={(e) => setDeH(Number(e.target.value))} aria-label="Première heure">
            {HEURES.map((h) => <option key={h} value={h}>De H{h}</option>)}
          </select>
          <select className="champ champ--ligne champ--court" value={aH} onChange={(e) => setAH(Number(e.target.value))} aria-label="Dernière heure">
            {HEURES.map((h) => <option key={h} value={h} disabled={h < deH}>À H{h}</option>)}
          </select>
          {change && (
            <button className="bouton bouton--prim bouton--petit" onClick={() => void modifier(a, deH, aH).then(() => montrerToast('Heures modifiées'))}>
              Enregistrer
            </button>
          )}
          {confirmer ? (
            <button className="bouton bouton--petit bouton--danger" onClick={() => void supprimer(a).then(() => montrerToast('Absence supprimée'))}>
              Confirmer la suppression
            </button>
          ) : (
            <button className="bouton bouton--sec bouton--petit" onClick={() => setConfirmer(true)} aria-label={`Supprimer l'absence de ${nomAffiche(a.prof)}`}>
              <Icon nom="poubelle" taille={16} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
