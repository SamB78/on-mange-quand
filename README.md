# On mange quand ?

Sondage de dispos sans compte pour fixer la date d'un repas.

**Adresse : https://on-mange-quand.on-mange-quand.workers.dev**

## Comment ça marche

1. L'organisateur choisit la période, les moments (journée, matin, midi, après-midi, soir) et les jours possibles, puis crée le sondage.
2. Il envoie le lien au groupe, une seule fois.
3. Chacun entre son prénom et coche ses créneaux : une fois = dispo, deux fois = si besoin.
4. Le meilleur créneau s'affiche en haut ; n'importe qui peut le valider.

Personne ne crée de compte. Toute personne qui a le lien d'un sondage peut le lire et le modifier.

## Organisation du code

| Chemin | Rôle |
|---|---|
| `public/index.html` | La page (HTML, CSS et JavaScript, sans dépendance) |
| `src/worker.js` | Le serveur : sert la page et l'API `/api/polls` |
| `migrations/` | Structure de la base de données (Cloudflare D1) |
| `wrangler.jsonc` | Configuration Cloudflare |
| `docs/` | Ancienne adresse GitHub Pages : renvoi vers la nouvelle, et l'ancienne version (sondage enregistré dans le lien) |

## Tester sur son ordinateur

```bash
npm install
npm run db:local
npm run dev
```

La page s'ouvre sur http://localhost:8787 avec une base de données locale.

## Mettre en ligne

```bash
npx wrangler login
npm run db:remote
npm run deploy
```

`wrangler login` ne sert qu'une fois par ordinateur. `db:remote` n'est utile que lorsqu'un nouveau fichier apparaît dans `migrations/`.
