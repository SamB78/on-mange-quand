# On mange quand ?

Sondage de dispos pour fixer la date d'un repas. Tout fonctionne sans compte ; un compte, facultatif, donne les droits d'organisateur.

- **Prod : https://on-mange-quand.on-mange-quand.workers.dev**
- **Test : https://on-mange-quand-test.on-mange-quand.workers.dev** (sa propre base, pour essayer les nouveautés)

## Comment ça marche

1. On choisit la période, les moments (journée, matin, midi, après-midi, soir) et les jours possibles, puis on crée le sondage. Les **jours fériés** de la période sont signalés : s'ils tombent en dehors des jours choisis (en semaine quand on a choisi « Week-end », par exemple), on peut les ajouter d'un geste. Si on est connecté, on devient l'**organisateur** et on peut protéger le lien par un **code d'accès** (4 à 6 chiffres).
2. On envoie le lien au groupe, une seule fois (et le code, s'il y en a un).
3. Chacun entre son prénom, coche ses créneaux (une fois = dispo, deux fois = si besoin) et peut laisser un petit mot.
4. Le meilleur créneau s'affiche en haut. Une fois la date choisie, chacun peut l'ajouter à son agenda.

### Comptes

Connexion par e-mail et mot de passe ou avec Google, gérée par Firebase Authentication. Le compte est facultatif : il sert à organiser, à protéger ses réponses et à retrouver ses sondages (« Mon compte »). La page « Confidentialité » explique ce qui est conservé, et « Supprimer mon compte » détache le compte de ses sondages avant de l'effacer.

### Qui peut faire quoi

| | Sondage créé sans compte | Sondage avec organisateur |
|---|---|---|
| Ouvrir le sondage | tout le monde, avec le lien | avec le lien, plus le code s'il y en a un ; l'organisateur toujours, sans code |
| Répondre | tout le monde | tout le monde (sauf s'il est clôturé) |
| Modifier une réponse | tout le monde | une réponse donnée sans compte : tout le monde ; avec un compte : son auteur et l'organisateur |
| Choisir la date finale | tout le monde | l'organisateur |
| Modifier les réglages, clôturer, supprimer | personne | l'organisateur |
| Ajouter, changer ou retirer le code d'accès | personne | l'organisateur |

Les sondages créés avant l'arrivée des comptes sont des sondages sans organisateur.

### Code d'accès

Réservé aux organisateurs connectés, pour qu'un code ne puisse pas être perdu : l'organisateur le retrouve sur la page du sondage. Une fois le bon code saisi, le navigateur garde un cookie propre au sondage ; si l'organisateur change le code, chacun doit saisir le nouveau. Après 5 essais en 15 minutes depuis une même adresse IP, les essais sont bloqués jusqu'à la fin de ces 15 minutes.

## Organisation du code

| Chemin | Rôle |
|---|---|
| `public/index.html` | La page (HTML, CSS et JavaScript, sans dépendance) |
| `src/worker.js` | Le serveur : sert la page et l'API (`/api/polls`, `/api/me`) |
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

La page s'ouvre sur http://localhost:8787 avec une base de données locale. En local, la connexion passe par l'émulateur : les comptes créés n'existent que sur l'ordinateur. `npm test` lance les tests de la vérification des connexions.

## Brancher Firebase

Le projet Firebase se renseigne à deux endroits : `CONFIG` dans le module en bas de `public/index.html` (valeurs publiques du bloc `firebaseConfig`) et `FIREBASE_PROJECT_ID` dans `wrangler.jsonc` (prod et test). Tant qu'ils sont vides, l'app fonctionne sans comptes. Chaque adresse du site doit figurer dans les « Domaines autorisés » de Firebase Authentication.

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
