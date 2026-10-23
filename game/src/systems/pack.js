// Tutte le immagini del gioco in UN solo file (dist/pack/assets.<impronta>.bin, creato da
// scripts/postbuild.mjs). Il telefono fa una richiesta sola invece di ~170: i server condivisi
// bloccano con un "403 Forbidden" chi chiede troppi file in un secondo (protezioni anti-attacco),
// e sulle reti mobili molte persone escono con lo stesso indirizzo.
// Formato: 4 byte (lunghezza dell'indice JSON) + indice {percorso: [inizio, lunghezza]} + dati.
// Se il pacchetto non arriva, il gioco carica i file uno per uno come prima.
const urls = new Map();

export const Pack = {
  has: (path) => urls.has(path),
  url: (path) => urls.get(path),
  size: () => urls.size,

  async load(onProgress) {
    const meta = document.querySelector('meta[name="gng-pack"]');
    const src = meta && meta.content;
    if (!src) return false;
    try {
      const r = await fetch(src, { cache: 'force-cache' });
      if (!r.ok || !r.body) return false;
      const total = Number(r.headers.get('content-length')) || 0;
      const reader = r.body.getReader();
      const parts = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        if (total && onProgress) onProgress(Math.min(1, got / total));
      }
      const buf = new Uint8Array(got);
      let o = 0;
      for (const p of parts) { buf.set(p, o); o += p.length; }
      const n = new DataView(buf.buffer).getUint32(0, true);
      const index = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + n)));
      const base = 4 + n;
      for (const [path, [start, len]] of Object.entries(index)) {
        const type = path.endsWith('.json') ? 'application/json' : 'image/png';
        urls.set(path, URL.createObjectURL(new Blob([buf.subarray(base + start, base + start + len)], { type })));
      }
      return true;
    } catch (e) {
      urls.clear();
      return false;
    }
  },
};

// './sprites/x.png?v=1' -> 'sprites/x.png'
export const packKey = (url) => String(url).replace(/^\.\//, '').replace(/[?#].*$/, '');
