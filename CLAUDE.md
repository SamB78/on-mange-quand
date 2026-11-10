# On mange quand ?

Sondage de dispos pour fixer la date d'un repas entre amis. Tout marche sans compte ; un compte Firebase, facultatif, donne les droits d'organisateur. Interface et textes en français.
Le fonctionnement pour l'utilisateur est décrit dans le README.

## Environnements : ne jamais toucher la prod sans demande explicite

| | Branche | Adresse | Base D1 |
|---|---|---|---|
| Prod | `main` | https://on-mange-quand.on-mange-quand.workers.dev | `on-mange-quand` |
| Test | `develop` | https://on-mange-quand-test.on-mange-quand.workers.dev | `on-mange-quand-test` |

- La prod est utilisée par de vrais groupes. On ne déploie pas en prod, on ne modifie pas sa base et on ne pousse pas sur `main` sans que l'utilisateur le demande clairement.
- Chaque nouveauté part de `develop` sur une branche `feature/…`, revient dans `develop`, puis s'essaie sur la version de test.
- Passer en prod : fusionner `develop` dans `main`, puis `npm run db:remote` **avant** `npm run deploy`, car le nouveau code lit des colonnes qui doivent déjà exister.
- `npm run deploy` et `npm run db:remote` passent par `scripts/garde-fou-prod.mjs` : ils refusent hors de `main` ou avec des modifications non commitées. Ne jamais contourner avec `npx wrangler deploy`.
- Version de test : `npm run db:test`, puis `npm run deploy:test`. Toute commande wrangler visant le test porte `--env test`.
- GitHub Pages sert `docs/` depuis `main` (ancienne adresse : renvoi vers la prod, plus l'ancienne version où le sondage tient dans le lien).

## Tester en local

`npm run db:local`, puis `npm run auth:local` (émulateur de connexion Firebase, port 9099) et `npm run dev` (http://localhost:8787, base locale dans `.wrangler/`). `npm test` teste la vérification des jetons. Toujours tester en local avant de mettre à jour la version de test. Ne jamais créer de compte de test sur le vrai projet Firebase : en local, utiliser l'émulateur.

## Code

- `public/index.html` : toute la page (HTML, CSS, JS), sans dépendance ni étape de build. Couleurs en jetons CSS, thèmes clair et sombre.
- `src/worker.js` : sert la page et l'API `/api/polls` et `/api/me` (routes listées en tête du fichier).
- `src/auth.js` : vérification des jetons Firebase (signature Google, projet, expiration). Les jetons non signés de l'émulateur ne sont acceptés qu'en local avec `AUTH_EMULATOR_LOCAL_ONLY=1`, que seul `npm run dev` fournit.
- `migrations/` : une migration par changement de base, jamais modifiée une fois appliquée en prod.

Règles partagées par la page et le serveur, à garder identiques des deux côtés :
- L'ordre des moments (`Journée, Matin, Midi, Après-midi, Soir`) fixe l'ordre des créneaux et les bits des réglages.
- `MOMENT_HOURS` : horaires indicatifs pour l'agenda, heure de Paris.
- La liste des créneaux se calcule à partir de `s`, `e`, `m`, `x` et `a` (jours ajoutés hors des jours de la semaine choisis, en pratique des jours fériés, avec tous les moments du sondage ; absent des anciens sondages) ; une réponse est une chaîne avec un caractère par créneau (`0` pas dispo, `1` dispo, `2` si besoin). `slotsKey` permet au serveur de refuser une réponse faite sur une liste de créneaux périmée ; `a` n'y figure que s'il n'est pas vide.
- Les jours fériés (France métropolitaine, Pâques calculé) ne sont connus que de la page : le serveur ne voit que `a`.

Droits (fonctions `isOwner` et `canEditAnswer` du serveur) : un sondage créé en étant connecté a un organisateur (`owner_uid`), qui seul choisit la date, modifie, clôture ou supprime. Une réponse donnée en étant connecté (`answers.uid`) n'est modifiable que par son auteur ou l'organisateur ; une réponse sans compte, par tous. Un sondage sans organisateur (créé sans compte, ou d'avant les comptes) reste ouvert à tous, sauf réglages et suppression. La page envoie le jeton Firebase en `Authorization: Bearer`.

Code d'accès (`polls.pin`, en clair pour que l'organisateur le retrouve) : seul un organisateur connecté peut le poser. Sans lui, toute route `/api/polls/:id…` répond 403 `{ pin: true }`, sauf pour l'organisateur. `POST /api/polls/:id/pin` vérifie le code et pose un cookie HttpOnly `omq_pin_<id>` (empreinte du code, limité au chemin du sondage, donc valable aussi pour le fichier `.ics`). Les essais sont comptés dans `pin_tries` (5 par 15 minutes, par sondage et empreinte d'IP) avant la comparaison, pour que des essais en parallèle ne passent pas.

## Git

Les commits sont signés avec le pseudo GitHub et l'adresse e-mail anonyme de GitHub (configuration locale du dépôt), jamais avec l'adresse personnelle.
