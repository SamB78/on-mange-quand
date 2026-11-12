# Dispos

Sondage de dispos pour fixer la date d'un dîner, d'une soirée jeux ou d'un week-end entre amis. Tout fonctionne sans compte ; un compte, facultatif, donne les droits d'organisateur.

- **Prod : https://on-mange-quand.on-mange-quand.workers.dev**
- **Test : https://on-mange-quand-test.on-mange-quand.workers.dev** (sa propre base, pour essayer les nouveautés)

## Comment ça marche

1. **Créer**, en trois étapes : le programme (nom, pictogramme, lieu), les créneaux, les options.
   - Les créneaux se décrivent par des **règles** plutôt que par une liste de dates : une période, puis une formule toute faite (« Soirs de semaine », « Week-end », « Aprèm du week-end »…) ou sa propre grille jour par jour (« le soir en semaine, midi et soir le week-end », « seulement les mardis et jeudis »). Dans l'aperçu en calendrier, toucher un jour ouvre le choix de ses moments : l'exclure, l'ajouter s'il est hors des règles, ou lui donner d'autres créneaux que la règle (« Journée » remplace les autres moments) ; les **jours fériés** de la période sont signalés et s'ouvrent d'un geste à tous les moments, qu'ils tombent hors des jours choisis ou un jour où seul le soir est proposé.
   - Options, toutes facultatives : les **invités attendus** (la page dit qui n'a pas encore répondu), les **indispensables** (les créneaux où l'un d'eux n'est pas dispo sont écartés), une **date limite de réponse** et, avec un compte, un **code d'accès** (4 à 6 chiffres).
2. **Partager** le lien `/s/<identifiant>`, une seule fois (et le code, s'il y en a un). L'aperçu du lien dans WhatsApp ou iMessage porte le nom du sondage.
3. **Répondre** : on choisit son prénom, puis on « peint » ses créneaux sur le calendrier (dispo, si besoin, pas dispo ; à la souris on peut glisser, et un jour de la semaine remplit toute sa colonne). On peut laisser un petit mot. Les créneaux déjà pris sont signalés : ceux de son **agenda Google** (bouton « Comparer avec mon agenda Google ») et, avec un compte, les dates déjà choisies dans ses autres sondages.
4. **Décider** : le meilleur créneau s'affiche en haut, suivi du classement et d'un calendrier où chaque créneau est d'autant plus foncé qu'il réunit de monde. Toucher un créneau montre qui est dispo ; toucher une personne montre ses dispos. Une fois la date choisie, chacun l'ajoute à son agenda. Avec un compte, un **lien d'agenda** personnel (« Mon compte ») ajoute tout seul chaque date choisie.

L'accueil liste les sondages ouverts sur l'appareil et, une fois connecté, ceux du compte. `/exemple` montre un sondage fictif où tout peut s'essayer.

### Comptes

Connexion par e-mail et mot de passe ou avec Google, gérée par Firebase Authentication. Le compte est facultatif : il sert à garder la main sur ses sondages, à protéger ses réponses et à tout retrouver sur ses appareils. La page « Confidentialité » explique ce qui est conservé, et « Supprimer mon compte » détache le compte de ses sondages avant de l'effacer.

### Qui peut faire quoi

| | Sondage créé sans compte | Sondage avec organisateur |
|---|---|---|
| Ouvrir le sondage | tout le monde, avec le lien | avec le lien, plus le code s'il y en a un ; l'organisateur toujours, sans code |
| Répondre | tout le monde (sauf s'il est clôturé ou la date limite passée) | pareil |
| Modifier une réponse | donnée sans compte : tout le monde ; avec un compte : son auteur | pareil, et l'organisateur, même clôturé |
| Choisir la date finale | tout le monde | l'organisateur |
| Modifier les réglages, clôturer, rouvrir, supprimer | tout le monde, avec le lien | l'organisateur, depuis tous ses appareils |
| Devenir l'organisateur | toute personne connectée (bloc « Organisation », avec confirmation) | — |
| Ajouter, changer ou retirer le code d'accès | personne | l'organisateur |

Sans compte, tout le monde est à égalité : c'est simple et rien ne se perd en changeant d'appareil ou de navigateur. Pour garder la main, il suffit de se connecter et de **rattacher le sondage à son compte** (bloc « Organisation ») : on en devient le seul organisateur. Comme toute personne connectée peut le faire tant que le sondage n'a pas d'organisateur, la page demande confirmation. Un sondage clôturé, ou dont la date limite est passée, ne prend plus de réponses : sans organisateur, n'importe qui peut le rouvrir ou repousser la date.

### Code d'accès

Réservé aux organisateurs connectés, pour qu'un code ne puisse pas être perdu : l'organisateur le retrouve sur la page du sondage. Une fois le bon code saisi, le navigateur garde un cookie propre au sondage ; si l'organisateur change le code, chacun doit saisir le nouveau. Après 5 essais en 15 minutes depuis une même adresse IP, les essais sont bloqués jusqu'à la fin de ces 15 minutes.

### Agenda

- **Comparer avec mon agenda Google** : Google ne donne au navigateur que les plages occupées de l'agenda principal, sur la période du sondage. La comparaison se fait dans le navigateur, rien n'est envoyé au serveur. Un créneau est « pris » si une plage occupée chevauche ses horaires indicatifs (8 h – 23 h pour « Journée »).
- **Lien d'agenda** : une adresse secrète par compte (`/api/agenda/<jeton>.ics`) à ajouter une fois dans Google Agenda, Apple Calendrier ou Outlook. Elle contient les dates choisies des sondages que le compte organise, ou où il a répondu dispo (ou si besoin) à la date retenue. On peut la changer ou la désactiver dans « Mon compte ». Google Agenda la relit toutes les quelques heures.

## Organisation du code

| Chemin | Rôle |
|---|---|
| `public/index.html` | La coquille de la page |
| `public/app.css` | Les styles (thèmes clair et sombre) |
| `public/app.js` | Toute la page : accueil, création, sondage, compte (sans dépendance) |
| `public/shared.js` | Les règles des créneaux, lues par la page **et** par le serveur |
| `public/firebase.js` | Le branchement de la connexion Firebase |
| `src/worker.js` | Le serveur : l'API (`/api/polls`, `/api/me`) et l'aperçu des liens |
| `public/fonts/` | Les polices (Bricolage Grotesque, Instrument Sans, licence OFL), servies par le site |
| `src/auth.js` | Vérification des jetons de connexion Firebase |
| `tests/` | Tests (`npm test`) |
| `firebase.json` | Réglages de l'émulateur de connexion local |
| `migrations/` | Structure de la base de données (Cloudflare D1) |
| `wrangler.jsonc` | Configuration Cloudflare, prod et test |
| `scripts/garde-fou-prod.mjs` | Bloque toute mise à jour de la prod en dehors de `main` |
| `docs/` | Ancienne adresse GitHub Pages : renvoi vers la nouvelle, et l'ancienne version (sondage enregistré dans le lien) |

## Branches

| Branche | Rôle | En ligne sur |
|---|---|---|
| `main` | ce qui tourne en prod | la prod |
| `develop` | les nouveautés réunies, avant la prod | la version de test |
| `feature/…` | une nouveauté en cours, partie de `develop` | — |

Une nouveauté part de `develop` sur sa propre branche, y revient une fois prête, et s'essaie sur la version de test. Pour passer en prod, on fusionne `develop` dans `main`.

## Tester sur son ordinateur

```bash
npm install
npm run db:local
npm run auth:local    # dans un premier terminal : émulateur de connexion Firebase
npm run dev           # dans un second terminal
```

La page s'ouvre sur http://localhost:8787 avec une base de données locale. En local, la connexion passe par l'émulateur : les comptes créés n'existent que sur l'ordinateur. `npm test` lance les tests (vérification des connexions, règles des créneaux, en-têtes de sécurité).

## Brancher Firebase

Le projet Firebase se renseigne à deux endroits : `CONFIG` dans `public/firebase.js` (valeurs publiques du bloc `firebaseConfig`) et `FIREBASE_PROJECT_ID` dans `wrangler.jsonc` (prod et test). Tant qu'ils sont vides, l'app fonctionne sans comptes. Chaque adresse du site doit figurer dans les « Domaines autorisés » de Firebase Authentication.

## Brancher l'agenda Google

Le bouton « Comparer avec mon agenda Google » utilise un client OAuth à part, **Client Web 2** (`GOOGLE_CLIENT_ID` dans `public/app.js` ; vide = bouton masqué). Le client « Web client (auto created by Google Service) » sert à la connexion Firebase : ne pas toucher à son code secret. Celui de Client Web 2 ne sert à rien, la page n'utilise que l'identifiant. Dans la [console Google Cloud](https://console.cloud.google.com/) du projet `on-mange-quand-5a00a` :

1. **API et services → Bibliothèque** : **Google Calendar API** activée.
2. **Google Auth Platform → Accès aux données** : niveau d'accès `https://www.googleapis.com/auth/calendar.freebusy` (lecture des disponibilités seulement). Google le range parmi les accès non sensibles : pas d'écran « application non validée », pas de limite de 100 personnes.
3. **Google Auth Platform → Clients → Client Web 2 → Origines JavaScript autorisées** : `https://on-mange-quand-test.on-mange-quand.workers.dev`, `https://on-mange-quand.on-mange-quand.workers.dev` et `http://localhost:8787`.

## Mettre en ligne la version de test

```bash
npm run db:test
npm run deploy:test
```

## Mettre en ligne la prod

```bash
npx wrangler login
npm run db:remote
npm run deploy
```

Depuis `main` uniquement, sans modification en cours : sinon le garde-fou arrête la commande avant qu'elle ne touche la prod. Passez toujours par `npm run …`, jamais directement par `npx wrangler deploy`, qui contourne le garde-fou.

`wrangler login` ne sert qu'une fois par ordinateur. `db:remote` n'est utile que lorsqu'un nouveau fichier apparaît dans `migrations/`, et doit toujours passer **avant** `deploy` : le nouveau code lit des colonnes qui doivent déjà exister.
