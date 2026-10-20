// Écran « Collab » : trouver une heure commune à plusieurs collègues sur deux semaines, puis créer
// la réunion Teams en un geste (et réserver un local libre pour l'occasion).

import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Entete } from '../ui/Entete';
import { Icon } from '../ui/Icon';
import { Feuille } from '../ui/Feuille';
import { bornes, creneauxCommuns, groupes, noms, plage, type Creneau } from '../logic/collab';
import { nomAffiche } from '../logic/horaire';
import { etatLocal } from '../logic/occupation';
import { rechercher, toutesLesClasses } from '../logic/ouest';
import { MIDI, dateLongue, deIso, lundiDe, plusJours } from '../lib/calendar';

export function Collab({ params }: { params: URLSearchParams }) {
  const { ds, maintenant, heurePassee, profil, ouvrirTeams, reserver, montrerToast } = useStore();
  const moi = profil === 'prof' ? ds?.moi.nom ?? '' : '';
  const initiaux = (params.get('p') ?? '').split('|').filter(Boolean);
  const [profs, setProfs] = useState<string[]>(() => [...new Set(initiaux.length ? initiaux : moi ? [moi] : [])]);
  const [tolerance, setTolerance] = useState(0);
  const [aLEcole, setALEcole] = useState(false);
  const [semaineProchaine, setSemaineProchaine] = useState(false);
  const [texte, setTexte] = useState('');
  const [ouvert, setOuvert] = useState<Creneau | null>(null);
  const [sujet, setSujet] = useState('Réunion');

  const gs = useMemo(() => (ds && moi ? groupes(ds, moi) : []), [ds, moi]);
  const creneaux = useMemo(() => {
    if (!ds) return [];
    const depuis = semaineProchaine ? plusJours(lundiDe(maintenant), 7) : maintenant;
    return creneauxCommuns(ds, profs, depuis, semaineProchaine ? 0 : heurePassee, { tolerance, aLEcole });
  }, [ds, profs, tolerance, aLEcole, semaineProchaine, maintenant, heurePassee]);

  if (!ds) return <section className="ecran"><p className="texte">Chargement…</p></section>;
  const resultats = texte ? rechercher(ds, texte, 8).filter((t) => t.type === 'prof' || t.type === 'classe') : [];
  const ajouter = (p: string[]) => setProfs((x) => [...new Set([...x, ...p])]);
  const retirer = (p: string) => setProfs((x) => x.filter((y) => y !== p));
  const equipe = (cl: string) => [...new Set(ds.cours.filter((c) => c.classes.includes(cl)).map((c) => c.prof))];
  const email = (p: string) => ds.profs.find((x) => x.nom === p)?.email;

  // Un local libre sur toute la plage, pour se réunir.
  const localPour = (c: Creneau): string | undefined =>
    ds.locaux
      .filter((l) => l.type === 'Classe')
      .find((l) => {
        for (let h = c.hDebut; h <= c.hFin; h++) if (h !== MIDI && etatLocal(ds, moi, l.code, c.date, h).etat !== 'libre') return false;
        return true;
      })?.code;

  return (
    <section className="ecran" aria-label="Collab">
      <Entete titre="Collab" sous="Une heure commune pour se réunir" retour="#/ecole" />

      <section className="carte" aria-label="Participants">
        <h2 className="titre-s">Avec qui ?</h2>
        <div className="rangee enrouler">
          {profs.map((p) => (
            <span key={p} className="puce puce--indigo puce--retirer">
              {p === moi ? 'Moi' : nomAffiche(p)}
              <button onClick={() => retirer(p)} aria-label={`Retirer ${nomAffiche(p)}`}>
                <Icon nom="fermer" taille={14} epaisseur={2.4} />
              </button>
            </span>
          ))}
          {!profs.length && <span className="petit">Ajoute au moins deux personnes.</span>}
        </div>
        <div className="recherche recherche--petite">
          <Icon nom="plus" />
          <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ajouter un collègue ou l’équipe d’une classe" aria-label="Ajouter un collègue ou une équipe" />
        </div>
        {resultats.length > 0 && (
          <ul className="resultats">
            {resultats.map((t) => (
              <li key={`${t.type}${t.nom}`}>
                <button
                  onClick={() => {
                    ajouter(t.type === 'prof' ? [t.nom] : equipe(t.nom));
                    setTexte('');
                  }}
                >
                  <span className="vignette">
                    <Icon nom={t.type === 'prof' ? 'gens' : 'chapeau'} />
                  </span>
                  <span className="pile grandit">
                    <span className="fort">{t.type === 'prof' ? nomAffiche(t.nom) : `Équipe de la ${t.nom}`}</span>
                    <span className="petit">{t.type === 'prof' ? 'Collègue' : `${equipe(t.nom).length} profs`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {(gs.length > 0 || !moi) && (
          <div className="defile-x" aria-label="Groupes">
            {(gs.length ? gs : toutesLesClasses(ds).slice(0, 8).map((cl) => ({ id: cl, nom: `Équipe de la ${cl}`, profs: equipe(cl) }))).map((g) => (
              <button key={g.id} className="filtre" onClick={() => ajouter(g.profs)}>
                {g.nom} · {g.profs.length}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="rangee enrouler">
        <div className="seg seg--auto" role="group" aria-label="Présence">
          <button aria-pressed={tolerance === 0} onClick={() => setTolerance(0)}>Tout le monde</button>
          <button aria-pressed={tolerance === 1} onClick={() => setTolerance(1)}>Un absent toléré</button>
        </div>
        <button className="filtre" aria-pressed={aLEcole} onClick={() => setALEcole(!aLEcole)}>
          {aLEcole && <Icon nom="coche" taille={14} epaisseur={2.6} />} Déjà à l’école
        </button>
        <button className="filtre" aria-pressed={semaineProchaine} onClick={() => setSemaineProchaine(!semaineProchaine)}>
          {semaineProchaine && <Icon nom="coche" taille={14} epaisseur={2.6} />} À partir de lundi prochain
        </button>
      </div>

      <section className="pile pile--8" aria-label="Heures communes">
        {profs.length >= 2 && (
          <h2 className="titre-m">
            {creneaux.length ? `${creneaux.length} possibilité${creneaux.length > 1 ? 's' : ''}` : 'Aucune heure commune'}
            <span className="petit"> · sur 2 semaines</span>
          </h2>
        )}
        {profs.length >= 2 && !creneaux.length && (
          <p className="texte">Essaie « Un absent toléré », ou retire quelqu’un. Le temps de midi n’est jamais proposé.</p>
        )}
        {creneaux.slice(0, 12).map((c, i) => (
          <button key={`${c.date}${c.hDebut}`} className={`creneau-commun${i === 0 ? ' creneau-commun--meilleur' : ''}`} onClick={() => setOuvert(c)}>
            <span className="pile grandit">
              <span className="titre-s">{dateLongue(deIso(c.date)).replace(/^./, (x) => x.toUpperCase())}</span>
              <span className="mono petit">{plage(c)}</span>
              <span className="petit">{c.manquants.length ? `Sans ${noms(c.manquants)}` : c.dansLaJournee ? 'Tout le monde est déjà à l’école' : 'Tout le monde est libre'}</span>
            </span>
            {i === 0 && <span className="puce puce--orange">Le mieux</span>}
            <Icon nom="droite" />
          </button>
        ))}
      </section>

      {ouvert && (
        <Feuille ouverte onFermer={() => setOuvert(null)} titre="Heure commune">
          <span className="sous-titre">{dateLongue(deIso(ouvert.date)).replace(/^./, (x) => x.toUpperCase())}</span>
          <h2 className="titre-l">{plage(ouvert)}</h2>
          <p className="texte">
            {noms(ouvert.presents)}
            {ouvert.manquants.length ? ` · sans ${noms(ouvert.manquants)}` : ''}
          </p>
          <label className="pile pile--8">
            <span className="titre-s">Sujet</span>
            <input className="champ champ--ligne" value={sujet} onChange={(e) => setSujet(e.target.value)} maxLength={80} />
          </label>
          {(() => {
            const local = localPour(ouvert);
            const { debut, fin } = bornes(ouvert);
            const avec = ouvert.presents.filter((p) => p !== moi && email(p));
            return (
              <>
                <button
                  className="bouton bouton--prim"
                  disabled={!avec.length}
                  onClick={() =>
                    ouvrirTeams({
                      type: 'teams-reunion',
                      sujet,
                      debut: debut.toISOString(),
                      fin: fin.toISOString(),
                      emails: avec.map((p) => email(p)!),
                      noms: avec.map(nomAffiche),
                      contenu: `Heure commune trouvée par La Tour${local ? ` · local ${local}` : ''}.`,
                    })
                  }
                >
                  <Icon nom="agenda" taille={18} /> Créer la réunion Teams
                </button>
                {local && moi && (
                  <button
                    className="bouton bouton--sec"
                    onClick={async () => {
                      for (let h = ouvert.hDebut; h <= ouvert.hFin; h++) if (h !== MIDI) await reserver({ date: ouvert.date, h, local, classe: '—' });
                      montrerToast(`${local} réservé pour la réunion`);
                    }}
                  >
                    <Icon nom="porte" taille={18} /> Réserver {local} pour la réunion
                  </button>
                )}
              </>
            );
          })()}
          <p className="petit">La réunion s’ouvre dans Teams avec les participants, l’heure et le sujet : il ne reste qu’à envoyer l’invitation.</p>
        </Feuille>
      )}
    </section>
  );
}
