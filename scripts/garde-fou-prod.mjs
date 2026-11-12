// Garde-fou : la prod (code et base) ne se met à jour que depuis main, sans modification en cours.
// Lancé par « npm run deploy » et « npm run db:remote » avant la commande Cloudflare.
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function stop(message) {
  console.error(`\nProd non modifiée : ${message}\n`);
  process.exit(1);
}

let branch;
let pending;
try {
  branch = run('git rev-parse --abbrev-ref HEAD');
  pending = run('git status --porcelain');
} catch {
  stop('impossible de lire l’état de git. Lancez la commande depuis le dossier du projet.');
}

if (branch !== 'main') {
  stop(`vous êtes sur la branche « ${branch} ». La prod ne se met à jour que depuis main.\nPour la version de test : npm run db:test puis npm run deploy:test`);
}
if (pending) {
  stop('des modifications ne sont pas commitées. Commitez-les ou annulez-les d’abord, pour que la prod corresponde exactement à main.');
}

console.log('Branche main, rien en cours : mise à jour de la prod.');
