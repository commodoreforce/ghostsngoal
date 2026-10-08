// Dopo la build del gioco copia il backend PHP dentro dist/,
// così dist/ è esattamente la cartella da pubblicare sul server.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const server = resolve(root, 'server');

cpSync(server, dist, {
  recursive: true,
  // config.php resta solo sul server: mai copiato né pubblicato
  filter: (src) => !src.endsWith('/config.php'),
});
if (existsSync(resolve(dist, 'config.php'))) rmSync(resolve(dist, 'config.php'));
console.log('Backend PHP copiato in dist/');
