# Dispos

Sondage de dispos pour fixer la date d'un moment entre amis (dîner, soirée jeux, week-end…). Tout marche sans compte ; un compte Firebase, facultatif, donne les droits d'organisateur. Interface et textes en français.
Le fonctionnement pour l'utilisateur est décrit dans le README.

## Où en est le projet (12 novembre 2026)

- `develop` et la version de test portent la **refonte** de novembre 2026 : page découpée en fichiers, création en 3 étapes, clé d'organisation, jours réglés à part, réponse par appuis successifs. C'est la version de référence.
- `main` et la prod ont plusieurs versions de retard (première version avec serveur : ni comptes, ni code d'accès, ni agenda, ni refonte). Le passage en prod appliquera donc toutes les migrations d'un coup ; il n'a pas encore été demandé.
- Les sondages créés avant la refonte étaient des essais : pas de compatibilité à préserver pour eux (c'est pour cela que « Journée » est aussi imposée par le serveur).
- Reste à essayer sur la version de test avec un vrai compte, car impossible en local : la connexion Google et la comparaison avec Google Agenda (hachures et rappel au clic).
- Le projet s'appelait « On mange quand ? » et s'appelle maintenant **Dispos** ; domaine visé `dispos.day`, pas encore acheté ni branché sur le worker.
- Pistes notées, non faites : héberger les polices dans `public/` (elles viennent de Google Fonts alors que le pied de page dit « sans pistage ») ; tests automatiques de l'API et de la page (`npm test` ne couvre que les jetons et `shared.js`) ; décider si `.claude/launch.json` (serveurs locaux `dev` et `auth-local` pour l'aperçu) entre dans le dépôt.

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

`npm run db:local`, puis `npm run auth:local` (émulateur de connexion Firebase, port 9099) et `npm run dev` (http://localhost:8787, base locale dans `.wrangler/`). `npm test` teste la vérification des jetons et les règles partagées. Toujours tester en local avant de mettre à jour la version de test. Ne jamais créer de compte de test sur le vrai projet Firebase : en local, utiliser l'émulateur. L'émulateur oublie ses comptes à chaque redémarrage : la page se déconnecte alors toute seule (« Votre session a expiré »), il suffit de recréer un compte.

## Code

Aucune dépendance ni étape de build : `public/` est servi tel quel.

- `public/index.html` : la coquille (barre du haut, pied de page). `public/app.css` : les styles, couleurs en jetons CSS, thèmes clair et sombre. `public/app.js` : toute la page (accueil, création en 3 étapes, sondage, compte). `public/firebase.js` : branchement de Firebase Authentication.
- `public/shared.js` : les règles communes, importées **par la page et par le serveur** (ordre des moments, `MOMENT_HOURS`, `buildSlots`, `slotsKey`, date limite, noms affichés `SITE_NAME`, `FEED_NAME`, `DEFAULT_TITLE`). Ne jamais en recopier un morceau d'un côté ou de l'autre.
- `src/worker.js` : l'API `/api/polls` et `/api/me` (routes listées en tête du fichier) ; rend aussi la page pour toute adresse sans extension (`/`, `/nouveau`, `/s/<id>`, `/compte`, `/confidentialite`, `/exemple`) et, pour `/s/<id>`, glisse le nom du sondage dans l'aperçu du lien (jamais s'il a un code).
- `src/auth.js` : vérification des jetons Firebase (signature Google, projet, expiration). Les jetons non signés de l'émulateur ne sont acceptés qu'en local avec `AUTH_EMULATOR_LOCAL_ONLY=1`, que seul `npm run dev` fournit.
- `migrations/` : une migration par changement de base, jamais modifiée une fois appliquée en prod.

Ancien nom : les identifiants techniques gardent « on-mange-quand » / « omq ». Ne pas les renommer, ce qui circule déjà cesserait de marcher : mémoire du navigateur `on-mange-quand:…`, préfixe des empreintes de clés et de codes, en-tête `X-OMQ-Key`, cookie `omq_pin_`, UID des événements d'agenda. Le worker, les bases D1, le projet Firebase, le dépôt et `package.json` gardent aussi l'ancien nom (changer le worker changerait l'adresse de la prod).

Adresses : la page lit `location.pathname` (History API). Les anciens liens `/#<id>` sont renvoyés vers `/s/<id>`. Les liens internes sont absolus (`/app.js`, `/compte`), car la page est servie sous plusieurs chemins.

La page (`public/app.js`), ce qu'il faut savoir avant d'y toucher :
- Tout se redessine en HTML par gabarits ; les clics passent par un seul écouteur sur `document`, qui lit `data-act` (un `case` par action).
- Création : le brouillon (`draft`) garde les règles par jour de la semaine dans `m` et les jours réglés à part dans la table `o` (jour → moments, `0` = exclu). `draftPayload` les range en `x` (exclus) et `o` pour le serveur. Toucher un jour de l'aperçu ouvre un `<dialog>` (`openDay`) où l'on choisit ses moments. « Journée » et les autres moments s'excluent (`toggleBit`).
- Jours fériés : un encadré propose de les ouvrir à tous les moments du sondage s'ils tombent hors des jours choisis ou un jour où seule une partie des moments est proposée.
- Réponse : chaque appui fait tourner un créneau, pas dispo → dispo → si besoin → pas dispo (`NEXT_VALUE`, `tapValue`). Un jour de la semaine ou un moment entier tourne en bloc (`fillWhere`). À la souris, glisser applique la valeur du créneau de départ.
- Créneau déjà pris (agenda Google ou date choisie dans un autre sondage du compte, `conflictOf`) : hachures rouge pâle (`.pill.ans.busy`). S'y dire dispo affiche un rappel : une bulle accrochée au créneau à la souris (`showTip`), le message du bas de l'écran au doigt (`showToast`).
- Mémoire du navigateur : `on-mange-quand:v2` (sondages ouverts, prénom, clés d'organisation) et `on-mange-quand:theme`.

Réglages d'un sondage (`polls.config`, validés par `validateConfig`) :
- `t` nom, `n` précisions, `l` lieu, `ic` pictogramme (liste `ICONS` : on en ajoute à la fin, on n'en retire jamais).
- `s`, `e`, `m`, `x`, `o`, `a` fixent la liste des créneaux. `m` : pour chaque jour de la semaine, un bit par moment, dans l'ordre `Journée, Matin, Midi, Après-midi, Soir`. `o` : jours réglés à part dans l'aperçu, en paires `[jour, moments]` qui passent avant `m` (jour ajouté, jour férié ouvert en entier, moments différents ce jour-là). `a` : ancienne forme (jours ouverts à tous les moments du sondage), encore lue mais que la page n'écrit plus. « Journée » remplace les autres moments d'un jour, dans la page comme dans `validateConfig`. `slotsKey` permet au serveur de refuser une réponse faite sur une liste de créneaux périmée ; `a` et `o` n'y figurent que s'ils ne sont pas vides.
- `dl` date limite de réponse (jugée à l'heure de Paris, jour limite compris), `q` nombre minimum de personnes, `g` invités attendus, `r` invités indispensables (parmi `g`). Les champs facultatifs vides ne sont pas enregistrés.
- Une réponse est une chaîne avec un caractère par créneau (`0` pas dispo, `1` dispo, `2` si besoin).
- Le classement des créneaux (indispensables, minimum, créneaux passés) et les jours fériés (France métropolitaine, Pâques calculé) ne sont connus que de la page : le serveur ne voit que les réglages.

Droits (fonctions `accessOf` et `canEditAnswer` du serveur) :
- Sondage créé en étant connecté : il a un organisateur (`owner_uid`), qui seul choisit la date, modifie, clôture, supprime ou pose un code.
- Sondage créé sans compte : tout le monde répond et choisit la date. Le navigateur du créateur reçoit une fois une clé d'organisation (gardée dans son `localStorage`, envoyée en `X-OMQ-Key` ; la base n'en garde que l'empreinte, `polls.admin_key`) qui permet de modifier, clôturer, supprimer, ou de rattacher le sondage à un compte (`POST /api/polls/:id/claim`, la clé est alors effacée). Les sondages d'avant les clés n'en ont pas : leurs réglages ne changent plus.
- Une réponse donnée en étant connecté (`answers.uid`) n'est modifiable que par son auteur ou par qui gère le sondage ; une réponse sans compte, par tous.
- Sondage clôturé ou date limite passée : seul qui gère le sondage modifie encore les réponses.
- La page envoie le jeton Firebase en `Authorization: Bearer`.

Agenda : la comparaison avec Google Agenda se fait entièrement dans la page (Google Identity Services, accès `calendar.freebusy`, rien ne passe par le serveur) ; `GOOGLE_CLIENT_ID` est le client OAuth « Client Web 2 », réservé à l'agenda (ne pas le confondre avec le client créé par Firebase pour la connexion) ; réglages Google Cloud décrits dans le README. Le lien d'agenda (`feeds` : un jeton secret par compte) sert `/api/agenda/<jeton>.ics` sans connexion ; il liste les dates choisies des sondages où le compte organise ou a répondu dispo ou si besoin (`accountPolls`, même règle que les dates de `/api/me/polls`). Supprimer le compte efface son lien, et retire organisateur, clôture et code de ses sondages.

Code d'accès (`polls.pin`, en clair pour que l'organisateur le retrouve) : seul un organisateur connecté peut le poser. Sans lui, toute route `/api/polls/:id…` répond 403 `{ pin: true }`, sauf pour l'organisateur. `POST /api/polls/:id/pin` vérifie le code et pose un cookie HttpOnly `omq_pin_<id>` (empreinte du code, limité au chemin du sondage, donc valable aussi pour le fichier `.ics`). Les essais sont comptés dans `pin_tries` (5 par 15 minutes, par sondage et empreinte d'IP) avant la comparaison, pour que des essais en parallèle ne passent pas.

## Git

Les commits sont signés avec le pseudo GitHub et l'adresse e-mail anonyme de GitHub (configuration locale du dépôt), jamais avec l'adresse personnelle.
