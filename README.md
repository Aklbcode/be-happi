# Be Happi

L'app de l'IPES Tubize pour les profs : ton horaire, les locaux libres en direct, et les déplacements de cours possibles quand un collègue est absent. Elle tourne dans Teams (onglet personnel) et sur téléphone (à installer depuis le navigateur).

**En ligne : https://aklbcode.github.io/be-happi/** (mode démo tant que la connexion SharePoint n'est pas réglée).

## Ce que fait la version 0.1

- **Aujourd'hui** : ce qui se passe maintenant, la meilleure suggestion de déplacement, ta journée, les infos.
- **Horaire** : la semaine, avec les heures libérées et les flèches des cours qui peuvent y venir. Vues « une classe » et « un local ».
- **Déplacer un cours** : les options classées (avantage pour le prof d'abord), puis la proposition.
- **Locaux** : le plan par étage, l'état en direct, la réservation.
- **Remédiation au lieu de l'étude** : les classes sans prof pendant ta fourche.

Règle des déplacements : seul un prof qui a la même classe et qui est libre peut avancer un de ses cours dans l'heure libérée. On cherche d'abord dans la semaine ; la semaine suivante n'est proposée que s'il n'y a rien dans la semaine. Chaque proposition est validée par un humain.

## Données

L'app lit et écrit directement les listes SharePoint déjà utilisées par l'app Power Apps (Horaires, Profs, Absences, Réservations, Deplacements, Infos, Signalements). Les deux apps peuvent donc tourner en même temps. Les données restent dans Microsoft 365 : le navigateur parle à Microsoft Graph avec le compte de la personne connectée, et SharePoint applique ses droits habituels.

Sans réglages, l'app démarre en **mode démo** (données fictives, noms inventés).

Ce dépôt est public et ne contient aucune donnée personnelle : la démo utilise un horaire et des noms inventés, et les seules données de l'école présentes sont la liste des locaux et leur équipement. Les identifiants `tenantId` et `clientId` ne sont pas des secrets (une app web les affiche forcément).

## Réglages (`src/config.ts`)

| Réglage | Exemple | Qui le fournit |
|---|---|---|
| `tenantId` | identifiant du tenant | IT |
| `clientId` | identifiant de l'app Entra ID | IT |
| `siteHost` | `ecole.sharepoint.com` | site SharePoint des listes |
| `sitePath` | `/sites/BeHappi` | site SharePoint des listes |

Les noms de colonnes se règlent dans `config.champs`. L'écran **École → Connexion → Vérifier les listes** affiche les colonnes réellement trouvées.

## Ce que l'IT doit faire (une fois)

1. **Enregistrer l'application** dans Microsoft Entra ID (*Inscriptions d'applications*) :
   - type de compte : ce tenant uniquement ;
   - plateforme **Application monopage (SPA)** avec deux URI de redirection : `https://aklbcode.github.io/be-happi/` et `brk-multihub://aklbcode.github.io` (connexion dans Teams) ;
   - autorisations Microsoft Graph **déléguées** : `User.Read` et `Sites.ReadWrite.All` (consentement administrateur conseillé pour éviter la question à chaque prof).
2. **Importer le paquet Teams** `be-happi-teams.zip` dans le centre d'administration Teams (*Gérer les applications → Charger*), puis le rendre disponible aux profs.

## Développement

```bash
npm install
npm run dev          # en local
npm run build        # version en ligne (dist/)
npm run build:demo   # démo autonome en un seul fichier (dist-demo/)
python3 scripts/teams_zip.py https://aklbcode.github.io/be-happi/   # paquet Teams
```

La mise en ligne est automatique : chaque modification envoyée sur la branche `main` est publiée sur GitHub Pages (voir `.github/workflows/deploy.yml`).
