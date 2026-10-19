# Be Happi

L'app de l'IPES Tubize pour toute l'école : profs, éducateurs, secrétariat, direction, service technique et élèves. Elle tourne dans Teams (onglet personnel) et sur téléphone (à installer depuis le navigateur), et travaille sur les mêmes listes SharePoint que l'app Power Apps.

**En ligne : https://aklbcode.github.io/be-happi/** (mode démo tant que la connexion SharePoint n'est pas réglée).

## Version 1.0 : six espaces

Chacun voit d'abord ce qui le concerne. Les espaces viennent de la liste **Roles** et de l'horaire ; en démo, les six sont ouverts (bouton « Démo » ou rond en haut à droite).

| Espace | Onglets | Ce qu'il apporte |
|---|---|---|
| **Prof** | Aujourd'hui · Horaire · Happi · Locaux · École | Ta journée en direct, les déplacements de cours qui te font gagner du temps, la remédiation au lieu de l'étude, les locaux libres, le matériel, l'export agenda. |
| **Éducateur** | Pilotage · Où est ? · Happi · Valider · École | L'école en direct : classes à l'étude heure par heure, qui est libre pour aider (message Teams prêt), absents, locaux fermés, validations revérifiées. |
| **Secrétariat** | Absences · Élèves · Happi · Infos · École | Encoder une absence en voyant tout de suite son impact (cours, classes, pistes de récupération), publier pour les élèves, infos du jour. |
| **Direction** | Tableau · Pilotage · Happi · Où est ? · École | Heures récupérées (déplacements et remédiation), tendance, semaine par semaine, classes les plus touchées, occupation des locaux, signalements. |
| **Technique** | À traiter · Locaux · Happi · QR portes · École | Les signalements, ce qui ferme un local et bloque des cours d'abord ; prise en charge, réponse, résolu ; QR codes à coller sur les portes. |
| **Élève** | Ma classe · Semaine · Happi · Signaler · École | Sa classe maintenant et ensuite, la semaine, les changements publiés, l'horaire dans l'agenda. Aucune donnée du personnel. |

### Les services

- **Happi**, l'assistant : « Où est la 6TQA ? », « un local avec projecteur libre en H4 », « trouve un créneau avec l'équipe de la 3TQA », « qui peut faire une remédiation avec la 2SA jeudi en H4 ? », « mon prochain cours »… Au clavier ou à la voix (selon le navigateur). Il répond avec les données de l'école et propose des actions (réserver, message ou réunion Teams, signaler). Sans IA en ligne : rien ne sort de Microsoft 365. Aux élèves, il ne parle que de leur classe.
- **Happi a remarqué** : trois constats au plus, utiles à chaque espace (temps à gagner, fourche avec un local calme, classe qui perd des heures, local fermé avec des cours prévus, élèves pas à jour, tendance du taux de récupération…).
- **Où est ?** : un collègue, une classe ou un local, maintenant et sur la journée ; qui est libre maintenant.
- **Collab** : les heures communes de plusieurs collègues sur deux semaines (groupes déduits de l'horaire : équipe d'une classe, profs d'une matière), puis la réunion Teams et le local en un geste.
- **Déplacements de cours** : suggestions, proposition, validation revérifiée en direct, suivi pour le prof, message Teams après la décision.
- **Absences** (secrétariat) : une ligne par jour comme Power Apps, sans motif (toujours « Non précisé »), avec l'impact calculé avant d'enregistrer.
- **Publication élèves** : mêmes textes que le bouton « Publier pour les élèves » de Power Apps ; Be Happi dit quand elle n'est plus à jour, et annonce la remédiation au lieu de « étude ».
- **Infos du jour**, **Signaler** (avec QR code sur chaque porte), **Matériel** (racks de tablettes, PC portables, projecteurs…), **Locaux libres** rangés comme sur le terrain.
- **Écran du hall** (`#/ecran`) : pour la télé de l'accueil, les changements du jour classe par classe, sans nom de prof (`?noms=1` pour les afficher en salle des profs), les locaux fermés et un QR code vers la vue élève.
- **Agenda** : l'horaire des prochaines semaines en fichier .ics (Outlook, Google Agenda, téléphone).
- **Hors ligne** : l'app s'ouvre même sans réseau (dernière version chargée), les données se mettent à jour dès que la connexion revient.

### Règles des déplacements

- Seul un prof qui a la même classe et qui est libre peut avancer un de ses cours dans l'heure libérée. Comme dans Power Apps, les classes doivent être **exactement** celles du cours libéré (« 5GA, 5GD » ↔ « 5GA, 5GD »).
- Classement : l'avantage du prof d'abord (arriver plus tard, partir plus tôt), puis la classe ; pénalité si sa journée s'allonge (ou s'il n'avait pas cours ce jour-là).
- D'abord la semaine ; la semaine suivante seulement s'il n'y a rien dans la semaine. H5 (temps de midi) n'est jamais une cible.
- Les mêmes contrôles servent aux suggestions et à la validation : heure à venir, hors H5, collègue toujours absent, prof libre, classes libres, cours de départ toujours là, local disponible (sinon un autre local libre est choisi et réservé à la validation).
- Une proposition refusée n'est pas reproposée telle quelle. Un prof du 1er degré ne prend pas de classe du 2e ou du 3e degré.

## Données

L'app lit et écrit directement les listes SharePoint de l'app Power Apps : Horaires, Profs, Absences, Réservations, Deplacements, Infos, Signalements, Roles, Materiel, Changements, HorairesEleves (+ « Decisions », facultative). Les deux apps peuvent tourner en même temps. Les données restent dans Microsoft 365 : le navigateur parle à Microsoft Graph avec le compte de la personne connectée, et SharePoint applique ses droits habituels.

**Ce que Be Happi écrit, et comme Power Apps**

| Liste | Quand | Colonnes |
|---|---|---|
| Réservations | réserver un local, remédiation, local changé à la validation | Title (prof), DateRes, Heure, Local, Classe, Absent (facultative) |
| Deplacements | proposer ; valider (Statut = « Validé ») ; refuser = supprimer la ligne | comme Power Apps |
| Absences | secrétariat | Title (prof), DateAbs, DeH, AH, Motif = « Non précisé » (facultative) |
| Infos | secrétariat, éducateurs, direction | Title, DateInfo, Categorie (Info, Retard, Éducateur absent, Changement de local) |
| Signalements | tout le monde ; le service technique change le statut | Title (le local au début du texte), Urgence (« Urgente » / « Normale », facultative), Statut (Nouveau, En cours, Résolu), Reponse (facultative) |
| Materiel | réserver un rack | Title (prof), DateRes, Heure, Rack, Classe |
| Changements | « Publier pour les élèves » : les lignes du jour sont retirées puis réécrites | Title, DateChg, Heure, Classe, TypeChg |
| Decisions | journal des validations et refus (facultative) | voir plus bas |

**Colonne facultative « Reponse »** (Signalements, texte) : si elle existe, le service technique peut laisser un mot que la personne qui a signalé voit dans l'app.

**Compatibilité avec Power Apps**

- Statuts de la liste Deplacements : « En attente » puis « Validé ». Power Apps ne connaît pas « Refusé » : un refus **supprime la ligne**, comme le bouton « Annuler » de Power Apps ; le motif va dans le journal (liste « Decisions »).
- Avant de décider, Be Happi relit la proposition : si quelqu'un l'a déjà traitée dans Power Apps, rien n'est écrasé.
- « Publier pour les élèves » donne le même résultat dans les deux apps (mêmes textes, mêmes colonnes) ; la dernière publication remplace la précédente.

**Qui voit quoi** : les espaces viennent de la liste **Roles** (Éducateur, Secrétariat, Direction, Technique… réglables dans `config.roles`) et de l'horaire (prof). Une personne qui n'est ni dans l'horaire ni dans Roles est vue comme **élève** : l'app ne charge alors que l'horaire des classes (HorairesEleves), les changements publiés et ses propres signalements. C'est un confort d'affichage : **la vraie protection reste celle de SharePoint**. Les élèves ne doivent pas avoir accès en lecture aux listes du personnel (Profs, Horaires, Absences, Réservations, Deplacements, Infos, Roles, Decisions) : à vérifier dans les autorisations du site.

**Liste facultative « Decisions »** (journal des décisions et motif des refus). Sans elle, valider et refuser fonctionnent, mais le prof ne voit pas le motif d'un refus. À créer sur le même site, avec ces colonnes, **écrites exactement ainsi** (sans accent ni espace, pour que les noms internes correspondent) :

| Colonne | Type | Contenu |
|---|---|---|
| Title (existe déjà) | texte | classe(s) |
| Statut | texte | Validé ou Refusé |
| Commentaire | plusieurs lignes de texte | le mot de l'éducateur |
| Collegue | texte | prof qui a proposé |
| Absent | texte | collègue absent |
| DateDep | date | jour de l'heure libérée |
| HeureVide | nombre | heure libérée |
| DateOrigine | date | jour du cours de départ |
| HeureOrigine | nombre | heure du cours de départ |
| Local | texte | local attribué s'il a changé |

L'écran **École → Connexion → Vérifier les listes** contrôle toutes les listes et colonnes, propose le nom interne probable quand il ne correspond pas, et montre les espaces reconnus pour la personne connectée.

Sans réglages, l'app démarre en **mode démo** (données fictives, noms inventés, adresses en `@ecole.example`) ; les messages et réunions Teams y sont montrés en aperçu au lieu d'ouvrir Teams.

Ce dépôt est public et ne contient aucune donnée personnelle : la démo utilise un horaire et des noms inventés, et les seules données de l'école présentes sont la liste des locaux et leur équipement. Les identifiants `tenantId` et `clientId` ne sont pas des secrets (une app web les affiche forcément).

## Réglages (`src/config.ts`)

| Réglage | Exemple | Qui le fournit |
|---|---|---|
| `tenantId` | identifiant du tenant | IT |
| `clientId` | identifiant de l'app Entra ID | IT |
| `siteHost` | `ecole.sharepoint.com` | site SharePoint des listes |
| `sitePath` | `/sites/BeHappi` | site SharePoint des listes |
| `permissionSharePoint` | `Sites.ReadWrite.All` ou `Sites.Selected` | IT (voir plus bas) |

Les noms de colonnes se règlent dans `config.champs`, les rôles dans `config.roles`.

## Ce que l'IT doit faire (une fois)

1. **Enregistrer l'application** dans Microsoft Entra ID (*Inscriptions d'applications*) :
   - type de compte : ce tenant uniquement ;
   - plateforme **Application monopage (SPA)** avec deux URI de redirection : `https://aklbcode.github.io/be-happi/` et `brk-multihub://aklbcode.github.io` (connexion dans Teams) ;
   - autorisations Microsoft Graph **déléguées** : `User.Read` et `Sites.ReadWrite.All` (consentement administrateur conseillé pour éviter la question à chaque personne).
2. **Importer le paquet Teams** `be-happi-teams.zip` dans le centre d'administration Teams (*Gérer les applications → Charger*), puis le rendre disponible.
3. Vérifier que les élèves n'ont **pas** accès en lecture aux listes du personnel (voir « Qui voit quoi »).

Les messages et réunions Teams passent par des **liens Teams** (la conversation ou la réunion s'ouvre déjà remplie, la personne n'a plus qu'à envoyer) : aucune autorisation supplémentaire.

### Option plus restreinte : `Sites.Selected`

Avec `Sites.ReadWrite.All`, l'app peut ouvrir tous les sites que la personne connectée peut déjà ouvrir. Avec `Sites.Selected` (délégué), elle n'ouvre **que le site Be Happi**, et jamais plus que les droits de la personne connectée. C'est plus sûr, mais l'IT a une étape en plus :

1. donner l'autorisation déléguée `Sites.Selected` (au lieu de `Sites.ReadWrite.All`) et le consentement administrateur ;
2. ouvrir le site à l'app, avec le rôle `write` : `POST https://graph.microsoft.com/v1.0/sites/{id-du-site}/permissions` avec `{"roles": ["write"], "grantedToIdentities": [{"application": {"id": "<clientId>", "displayName": "Be Happi"}}]}` ;
3. dans `src/config.ts` : `permissionSharePoint: 'Sites.Selected'`.

À tester avec **Vérifier les listes** ; si la lecture des listes échoue, revenir à `Sites.ReadWrite.All`. Référence : [annonce Microsoft](https://devblogs.microsoft.com/microsoft365dev/?p=18597).

## Développement

```bash
npm install
npm run dev          # en local
npm test             # tests du moteur et du « cerveau » (sans dépendance, Node 22)
npm run build        # version en ligne (dist/)
npm run build:demo   # démo autonome en un seul fichier (dist-demo/)
python3 scripts/teams_zip.py https://aklbcode.github.io/be-happi/   # paquet Teams
```

Organisation du code : `src/logic/` (règles et calculs, testés : horaire, déplacements, occupation, suivi, Où est, Collab, impact d'une absence, publication élèves, statistiques, matériel, Happi, constats), `src/data/` (types, démo, lecture et écriture SharePoint, état de l'app, espaces), `src/screens/` (un fichier par écran), `src/ui/` (éléments communs), `src/lib/` (calendrier, connexion, Teams, agenda .ics, QR codes).

La mise en ligne est automatique : chaque modification envoyée sur la branche `main` est testée puis publiée sur GitHub Pages (voir `.github/workflows/deploy.yml`). Si un test échoue, rien n'est publié. Sur les autres branches, `.github/workflows/verif.yml` teste et construit sans publier.
