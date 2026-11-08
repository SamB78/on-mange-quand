# On mange quand ?

Sondage de dispos sans compte pour fixer la date d'un repas.

- **Prod : https://on-mange-quand.on-mange-quand.workers.dev**
- **Test : https://on-mange-quand-test.on-mange-quand.workers.dev** (sa propre base, pour essayer les nouveautés)

## Comment ça marche

1. L'organisateur choisit la période, les moments (journée, matin, midi, après-midi, soir) et les jours possibles, puis crée le sondage.
2. Il reçoit deux liens : celui du groupe, à envoyer une seule fois, et son **lien organisateur**, à garder pour lui.
3. Chacun entre son prénom, coche ses créneaux (une fois = dispo, deux fois = si besoin) et peut laisser un petit mot.
4. Le meilleur créneau s'affiche en haut. L'organisateur le valide ; chacun peut alors l'ajouter à son agenda.

Personne ne crée de compte.

### Qui peut faire quoi

| | Participant | Organisateur |
|---|---|---|
| Répondre | oui | oui |
| Modifier ou supprimer une réponse (en touchant le prénom) | oui, toutes | oui, toutes |
| Choisir la date finale | non | oui |
| Modifier les réglages, supprimer le sondage | non | oui |

Le lien organisateur fonctionne sur n'importe quel appareil. Le serveur n'en garde qu'une empreinte : s'il est perdu, il ne peut pas être retrouvé.

Les sondages créés avant l'arrivée du lien organisateur n'ont pas d'organisateur : tout le monde garde tous les droits dessus.

## Organisation du code

| Chemin | Rôle |
|---|---|
| `public/index.html` | La page (HTML, CSS et JavaScript, sans dépendance) |
| `src/worker.js` | Le serveur : sert la page et l'API `/api/polls` |
| `migrations/` | Structure de la base de données (Cloudflare D1) |
| `wrangler.jsonc` | Configuration Cloudflare, prod et test |
| `docs/` | Ancienne adresse GitHub Pages : renvoi vers la nouvelle, et l'ancienne version (sondage enregistré dans le lien) |

## Tester sur son ordinateur

```bash
npm install
npm run db:local
npm run dev
```

La page s'ouvre sur http://localhost:8787 avec une base de données locale.

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

`wrangler login` ne sert qu'une fois par ordinateur. `db:remote` n'est utile que lorsqu'un nouveau fichier apparaît dans `migrations/`, et doit toujours passer **avant** `deploy` : le nouveau code lit des colonnes qui doivent déjà exister.
