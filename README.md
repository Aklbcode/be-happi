# Be Happi

L'app de l'IPES Tubize pour les profs : ton horaire, les locaux libres en direct, et les déplacements de cours possibles quand un collègue est absent. Elle tourne dans Teams (onglet personnel) et sur téléphone (à installer depuis le navigateur).

**En ligne : https://aklbcode.github.io/be-happi/** (mode démo tant que la connexion SharePoint n'est pas réglée).

## Ce que fait la version 0.2

- **Aujourd'hui** : ce qui se passe maintenant, la meilleure suggestion de déplacement, ta journée, les infos, et le **suivi de tes propositions** (en attente, validées, refusées avec le mot de l'éducateur).
- **Horaire** : la semaine, avec les heures libérées et les flèches des cours qui peuvent y venir. Vues « une classe » et « un local ».
- **Déplacer un cours** : les options classées (avantage pour le prof d'abord), avec les contrôles visibles (prof libre, classes libres, local), puis la proposition.
- **Validations** (éducateur, secrétariat ; lecture pour la direction) : le point du jour (absents, heures récupérées ou à l'étude), les propositions **revérifiées en direct**, Valider / Refuser (un mot obligatoire pour refuser), le journal des décisions et qui prévenir ensuite.
- **Locaux** : le plan par étage, l'état en direct, la réservation.
- **Remédiation au lieu de l'étude** : les classes sans prof pendant ta fourche.

En démo, l'écran **École → Validations** permet de jouer l'éducateur : propose un déplacement en « Prof », puis valide-le en « Éducateur ».

### Règles des déplacements

- Seul un prof qui a la même classe et qui est libre peut avancer un de ses cours dans l'heure libérée. Comme dans Power Apps, les classes doivent être **exactement** celles du cours libéré : un cours groupé « 5GA, 5GD » va dans une heure libérée « 5GA, 5GD », pas dans une heure de la 5GA seule, et inversement (sinon « Publier pour les élèves » annoncerait le cours à une classe qui reste à l'étude).
- Classement : l'avantage du prof d'abord (arriver plus tard, partir plus tôt), puis la classe ; pénalité si sa journée s'allonge (ou s'il n'avait pas cours ce jour-là).
- D'abord la semaine ; la semaine suivante seulement s'il n'y a rien dans la semaine. H5 (temps de midi) n'est jamais une cible.
- Les mêmes contrôles servent aux suggestions et à la validation : heure à venir, hors H5, collègue toujours absent, prof libre (cours, absence, réservation), classes libres, cours de départ toujours là, local disponible. Si le local de l'heure libérée est pris (réservation, panne, autre déplacement), un autre local libre est choisi et réservé à la validation.
- Une proposition refusée n'est pas reproposée telle quelle.

## Données

L'app lit et écrit directement les listes SharePoint déjà utilisées par l'app Power Apps (Horaires, Profs, Absences, Réservations, Deplacements, Infos, Signalements, Roles). Les deux apps peuvent donc tourner en même temps. Les données restent dans Microsoft 365 : le navigateur parle à Microsoft Graph avec le compte de la personne connectée, et SharePoint applique ses droits habituels.

**Compatibilité avec Power Apps**

- Statuts de la liste Deplacements : « En attente » puis « Validé », comme Power Apps.
- Power Apps ne connaît pas de statut « Refusé » : tout ce qui n'est pas « En attente » y compte comme confirmé (et serait publié aux élèves). Un refus **supprime donc la ligne**, exactement comme le bouton « Annuler » de Power Apps. Le motif va dans le journal (liste « Decisions » ci-dessous).
- Avant de décider, Be Happi relit la proposition : si quelqu'un l'a déjà traitée dans Power Apps, rien n'est écrasé.
- Les élèves sont prévenus comme aujourd'hui : bouton « Publier pour les élèves » de l'écran Secrétariat (Power Apps).

**Qui peut valider** : les adresses notées « Secrétariat » ou « Éducateur » dans la liste **Roles** (réglable dans `config.roles`), « Direction » en lecture. C'est un confort d'affichage : la vraie protection reste celle de SharePoint (qui peut modifier la liste Deplacements), comme pour Power Apps.

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

L'écran **École → Connexion → Vérifier les listes** contrôle toutes les colonnes et propose le nom interne probable quand il ne correspond pas.

Sans réglages, l'app démarre en **mode démo** (données fictives, noms inventés).

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
   - autorisations Microsoft Graph **déléguées** : `User.Read` et `Sites.ReadWrite.All` (consentement administrateur conseillé pour éviter la question à chaque prof).
2. **Importer le paquet Teams** `be-happi-teams.zip` dans le centre d'administration Teams (*Gérer les applications → Charger*), puis le rendre disponible aux profs.

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
npm test             # tests du moteur (sans dépendance, Node 22)
npm run build        # version en ligne (dist/)
npm run build:demo   # démo autonome en un seul fichier (dist-demo/)
python3 scripts/teams_zip.py https://aklbcode.github.io/be-happi/   # paquet Teams
```

La mise en ligne est automatique : chaque modification envoyée sur la branche `main` est testée puis publiée sur GitHub Pages (voir `.github/workflows/deploy.yml`). Si un test échoue, rien n'est publié. Sur les autres branches, `.github/workflows/verif.yml` teste et construit sans publier.
