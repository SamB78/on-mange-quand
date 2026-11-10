# On mange quand ?

Sondage de dispos sans compte pour fixer la date d'un repas entre amis. Interface et textes en français.
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

`npm run db:local`, puis `npm run dev` (http://localhost:8787, base locale dans `.wrangler/`). Toujours tester en local avant de mettre à jour la version de test.

## Code

- `public/index.html` : toute la page (HTML, CSS, JS), sans dépendance ni étape de build. Couleurs en jetons CSS, thèmes clair et sombre.
- `src/worker.js` : sert la page et l'API `/api/polls` (route listée en tête du fichier).
- `migrations/` : une migration par changement de base, jamais modifiée une fois appliquée en prod.

Règles partagées par la page et le serveur, à garder identiques des deux côtés :
- L'ordre des moments (`Journée, Matin, Midi, Après-midi, Soir`) fixe l'ordre des créneaux et les bits des réglages.
- `MOMENT_HOURS` : horaires indicatifs pour l'agenda, heure de Paris.
- La liste des créneaux se calcule à partir de `s`, `e`, `m`, `x` ; une réponse est une chaîne avec un caractère par créneau (`0` pas dispo, `1` dispo, `2` si besoin). `slotsKey` permet au serveur de refuser une réponse faite sur une liste de créneaux périmée.

Droits : les réponses sont modifiables par tous. Seul l'organisateur (en-tête `x-admin-token`, dont le serveur ne garde que l'empreinte) choisit la date finale, modifie les réglages ou supprime le sondage. Les sondages sans `admin_hash`, créés avant cette fonction, restent ouverts à tous.

## Git

Les commits sont signés avec le pseudo GitHub et l'adresse e-mail anonyme de GitHub (configuration locale du dépôt), jamais avec l'adresse personnelle.
