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

// ---------------------------------------------------------------------------------------------
// Pacchetto unico delle immagini (vedi game/src/systems/pack.js): sprite e sfondi in un solo
// file, così il telefono fa una richiesta invece di ~170 (i server condivisi bloccano chi
// chiede troppi file al secondo). I file singoli restano lì come riserva.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = ['sprites', 'backgrounds'].flatMap((d) => (existsSync(join(dist, d)) ? walk(join(dist, d)) : []))
  .filter((p) => /\.(png|json)$/.test(p)).sort();
const index = {};
const chunks = [];
let off = 0;
for (const p of files) {
  const b = readFileSync(p);
  index[relative(dist, p).split('\\').join('/')] = [off, b.length];
  chunks.push(b); off += b.length;
}
const head = Buffer.from(JSON.stringify(index));
const len = Buffer.alloc(4); len.writeUInt32LE(head.length, 0);
const pack = Buffer.concat([len, head, ...chunks]);
const name = `assets.${createHash('sha1').update(pack).digest('hex').slice(0, 10)}.bin`;
rmSync(join(dist, 'pack'), { recursive: true, force: true });
mkdirSync(join(dist, 'pack'), { recursive: true });
writeFileSync(join(dist, 'pack', name), pack);
const htmlPath = join(dist, 'index.html');
const html = readFileSync(htmlPath, 'utf8').replace(/<meta name="gng-pack"[^>]*>\s*/g, '');
writeFileSync(htmlPath, html.replace('</head>', `  <meta name="gng-pack" content="./pack/${name}" />\n</head>`));
console.log(`Pacchetto immagini: ${files.length} file in pack/${name} (${Math.round(pack.length / 1024)} KB)`);
