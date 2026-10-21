// La cartolina del record da condividere: pixel art vera (disegnata piccola e ingrandita 4 volte
// senza sfumature), con il ritratto del personaggio, il punteggio, la posizione in classifica e il
// posto dove si è arrivati. Due formati: storia (1080x1920) e post (1080x1350).
// Su telefono si apre il menu di condivisione del sistema (Instagram, WhatsApp, Facebook...);
// da computer l'immagine si scarica e il link si copia.
import { charById } from '../data/characters.js';
import { getLang } from '../i18n.js';

const FONT = '"Press Start 2P"';
const SCALE = 4;
export const CARD = { story: [270, 480], post: [270, 338] };

const T = {
  it: { pre: 'CESENA FC PRESENTA', best: 'IL MIO RECORD', rank: 'IN CLASSIFICA', lvl: 'LIVELLO', saved: 'HO SALVATO IL MAGAZZINIERE\nPETROSINO!',
    dare: 'BATTIMI SE CI RIESCI!', play: 'GIOCA ANCHE TU', places: { 1: 'NOTTE AL MANUZZI', 2: 'LA NEBBIA DEL SAVIO', 3: 'LA NAVE DEL CONTE' } },
  en: { pre: 'CESENA FC PRESENTS', best: 'MY HIGH SCORE', rank: 'ON THE LEADERBOARD', lvl: 'STAGE', saved: 'I SAVED PETROSINO\nTHE KIT MAN!',
    dare: 'BEAT ME IF YOU CAN!', play: 'PLAY NOW', places: { 1: 'NIGHT AT THE MANUZZI', 2: 'THE SAVIO FOG', 3: "THE COUNT'S SHIP" } },
};

// testo a pixel pieni: si disegna, poi ogni pixel o c'è o non c'è (niente bordi sfumati)
function pixText(ctx, s, x, y, { size = 8, color = '#f4f4f0', align = 'left', stroke = null, shadow = null } = {}) {
  const m = document.createElement('canvas');
  const mc = m.getContext('2d');
  mc.font = `${size}px ${FONT}`;
  const w = Math.ceil(mc.measureText(s).width) + 4;
  const h = size + 4;
  m.width = w; m.height = h;
  mc.font = `${size}px ${FONT}`;
  mc.textBaseline = 'top';
  mc.fillStyle = '#fff';
  mc.fillText(s, 2, 2);
  const d = mc.getImageData(0, 0, w, h);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = d.data[i * 4 + 3] > 110 ? 1 : 0;
  const x0 = Math.round(align === 'center' ? x - (w - 4) / 2 : align === 'right' ? x - (w - 4) : x) - 2;
  const y0 = Math.round(y) - 2;
  const paint = (dx, dy, col) => {
    ctx.fillStyle = col;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (mask[yy * w + xx]) ctx.fillRect(x0 + xx + dx, y0 + yy + dy, 1, 1);
  };
  if (shadow) paint(1, 1, shadow);
  if (stroke) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) paint(dx, dy, stroke);
  paint(0, 0, color);
  return w - 4;
}

function frameOf(scene, key, frame) {
  if (!scene.textures.exists(key)) return null;
  const tex = scene.textures.get(key);
  const f = frame !== undefined && tex.has(frame) ? tex.get(frame) : tex.get();
  return { img: f.source.image, x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
}

function blit(ctx, fr, x, y, s = 1, flip = false) {
  if (!fr) return;
  ctx.save();
  if (flip) { ctx.translate(Math.round(x) + fr.w * s, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w * s, fr.h * s); }
  else ctx.drawImage(fr.img, fr.x, fr.y, fr.w, fr.h, Math.round(x), Math.round(y), fr.w * s, fr.h * s);
  ctx.restore();
}

// il posto dove si è arrivati, in fondo alla cartolina
function placeLayers(level, cleared) {
  if (level >= 3) return [['l3_beach_sky', 120, 20], ['l3_beach', 120, 0]];
  if (level === 2) return [['l2_piazza_sky', 160, 10], ['l2_piazza', 360, 0]];
  return [['l1_inside0', 60, 0]];
}

export function drawCard(scene, kind, data) {
  const [w, h] = CARD[kind];
  const L = T[getLang()] || T.it;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const ch = charById(data.character);
  const story = kind === 'story';

  // cielo notturno a bande, come i fondali a 16 bit
  const bands = ['#07050f', '#0b0820', '#100c2c', '#161238', '#1d1744', '#251d50'];
  const bh = Math.ceil(h * 0.62 / bands.length);
  bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i * bh, w, bh); });
  ctx.fillStyle = '#251d50'; ctx.fillRect(0, bh * bands.length, w, h);
  // stelle e luna
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 70; i++) { ctx.fillStyle = rnd() < 0.3 ? '#f4f4f0' : '#8a86b8'; ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.6), 1, 1); }
  const mx = w - 30, my = story ? 118 : 92;
  ctx.fillStyle = '#fff2c8'; ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8d8a8'; ctx.fillRect(mx - 5, my - 3, 3, 3); ctx.fillRect(mx + 3, my + 4, 4, 2); ctx.fillRect(mx + 1, my - 7, 2, 2);

  // il posto raggiunto, in basso, sfumato a bande verso il cielo
  const placeH = story ? 190 : 120;
  const py = h - placeH;
  for (const [key, cx, cy] of placeLayers(data.level, data.cleared)) {
    const fr = frameOf(scene, key);
    if (!fr) continue;
    const srcY = Math.max(0, fr.h - placeH - cy);
    ctx.drawImage(fr.img, fr.x + cx, fr.y + srcY, w, Math.min(placeH, fr.h - srcY), 0, py, w, Math.min(placeH, fr.h - srcY));
  }
  for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(7,5,15,${0.85 - i * 0.14})`; ctx.fillRect(0, py + i * 4, w, 4); }
  ctx.fillStyle = 'rgba(7,5,15,0.55)'; ctx.fillRect(0, py + 24, w, placeH - 24);

  // pipistrelli e zucche
  const bat = frameOf(scene, 'bat', 'bat1');
  [[w - 50, story ? 70 : 40, false], [w - 66, story ? 168 : 128, true], [30, story ? 150 : 158, true]].forEach(([x, y, f]) => blit(ctx, bat, x, y, 1, f));

  // titolo
  let y = story ? 16 : 10;
  pixText(ctx, L.pre, w / 2, y, { size: 8, color: '#9a96c8', align: 'center' });
  y += 13;
  pixText(ctx, "GHOSTS 'N GOALS", w / 2, y, { size: 16, color: '#f4f4f0', align: 'center', stroke: '#ff7a1a', shadow: '#000' });
  y += story ? 30 : 26;

  // lo scudetto del Cesena: nella storia grande sotto il titolo, nel post piccolo accanto al ritratto
  const crest = frameOf(scene, 'crest');
  if (crest && story) {
    blit(ctx, crest, Math.round(w / 2 - crest.w / 2), y);
    y += crest.h + 14;
  }

  // ritratto nella cornice (oro se ha salvato Petrosino)
  const ps = 2;
  const pf = frameOf(scene, `portrait_${ch.id}`);
  const pw = (pf ? pf.w : 64) * ps;
  const px = Math.round(w / 2 - pw / 2);
  const gold = data.cleared;
  ctx.fillStyle = '#000'; ctx.fillRect(px - 6, y - 6, pw + 12, pw + 12);
  ctx.fillStyle = gold ? '#ffd23f' : '#ff7a1a'; ctx.fillRect(px - 4, y - 4, pw + 8, pw + 8);
  ctx.fillStyle = gold ? '#a0700a' : '#8a3a08'; ctx.fillRect(px - 2, y - 2, pw + 4, pw + 4);
  ctx.fillStyle = '#120c22'; ctx.fillRect(px, y, pw, pw);
  blit(ctx, pf, px, y, ps);
  // nel post lo scudetto sta a sinistra del ritratto, a misura piena
  if (crest && !story) blit(ctx, crest, Math.max(2, Math.round((px - 6) / 2 - crest.w / 2)), y + Math.round(pw / 2 - crest.h / 2));

  // nome del personaggio su una targhetta
  const nameY = y + pw + 4;
  ctx.fillStyle = '#000'; ctx.fillRect(px - 6, nameY, pw + 12, 13);
  pixText(ctx, ch.short, w / 2, nameY + 3, { size: 8, color: gold ? '#ffd23f' : '#f4f4f0', align: 'center' });
  y = nameY + (story ? 26 : 18);

  if (data.nickname) { pixText(ctx, data.nickname, w / 2, y, { size: 8, color: '#9fe8ff', align: 'center', shadow: '#000' }); y += story ? 14 : 12; }
  pixText(ctx, L.best, w / 2, y, { size: 8, color: '#ff3b3b', align: 'center', shadow: '#000' });
  y += 11;
  pixText(ctx, String(Math.max(0, Math.floor(data.score))).padStart(7, '0'), w / 2, y, { size: 16, color: '#ffd23f', align: 'center', stroke: '#000' });
  y += story ? 22 : 21;
  if (data.rank) { pixText(ctx, `#${data.rank} ${L.rank}`, w / 2, y, { size: 8, color: '#f4f4f0', align: 'center', stroke: '#000' }); y += 13; }
  const place = data.cleared ? L.saved : `${L.lvl} ${data.level} · ${L.places[data.level] || ''}`;
  place.split('\n').forEach((ln, i) => pixText(ctx, ln, w / 2, y + i * 11, { size: 8, color: data.cleared ? '#7fd06a' : '#c8c4e8', align: 'center', stroke: '#000' }));
  y += (story ? 22 : 15) + (place.split('\n').length - 1) * 11;

  // la sfida
  const dareY = story ? h - 70 : h - 50;
  ctx.fillStyle = '#000'; ctx.fillRect(10, dareY - 5, w - 20, 19);
  ctx.fillStyle = '#ff7a1a'; ctx.fillRect(10, dareY - 5, w - 20, 1); ctx.fillRect(10, dareY + 13, w - 20, 1);
  pixText(ctx, L.dare, w / 2, dareY, { size: 8, color: '#ffd23f', align: 'center' });
  // zucche ai lati della sfida
  const pk = frameOf(scene, 'pumpkinItem');
  blit(ctx, pk, 2, dareY - 4); blit(ctx, pk, w - 16, dareY - 4);

  // in fondo: dove giocare
  const fy = h - (story ? 40 : 26);
  pixText(ctx, L.play, w / 2, fy, { size: 8, color: '#c8c4e8', align: 'center', stroke: '#000' });
  pixText(ctx, data.host, w / 2, fy + 11, { size: 8, color: '#f4f4f0', align: 'center', stroke: '#000' });
  if (story) pixText(ctx, '#DAIBURDEL', w / 2, fy + 24, { size: 8, color: '#ff7a1a', align: 'center', stroke: '#000' });

  // ingrandimento finale 4x senza sfumature
  const out = document.createElement('canvas');
  out.width = w * SCALE; out.height = h * SCALE;
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = false;
  o.drawImage(c, 0, 0, w * SCALE, h * SCALE);
  return out;
}

export function cardBlob(scene, kind, data) {
  const cv = drawCard(scene, kind, data);
  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

// condivide la storia (o il post): menu di sistema se c'è, altrimenti scarica l'immagine e copia il link
// (l'immagine si prepara prima del tocco: il menu di condivisione va aperto subito, dentro il gesto)
export async function shareRecord(scene, data, kind = 'story', ready = null) {
  const L = T[getLang()] || T.it;
  const blob = ready || await cardBlob(scene, kind, data);
  const file = new File([blob], `ghostsngoals-${data.score}.png`, { type: 'image/png' });
  const text = `${L.best}: ${data.score} · ${L.dare} #DAIBURDEL`;
  const url = data.url;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text} ${url}` });
      return 'shared';
    }
    if (navigator.share) { await navigator.share({ text, url }); return 'shared-link'; }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancel';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { await navigator.clipboard.writeText(`${text} ${url}`); } catch (e) { /* niente appunti */ }
  return 'downloaded';
}
