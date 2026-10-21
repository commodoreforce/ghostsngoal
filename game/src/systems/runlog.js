// La "scatola nera" della partita: all'inizio il server dà un gettone e una chiave segreta,
// a ogni nuovo livello e alla fine il gioco manda punteggio e uccisioni firmati con quella chiave.
// Il server segna l'ora di ogni passaggio con il suo orologio: così sa quanto è durato davvero
// ogni livello e quanti punti ci si sono fatti, e un punteggio inventato non torna.
import { Api } from './api.js';
import { Run } from './state.js';

let chain = Promise.resolve();
let token = null;
let key = null;
let seq = 0;
let lastLevel = 1;

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function sign(msg) {
  try {
    if (!key || !(window.crypto && crypto.subtle)) return '';
    const raw = new Uint8Array(key.match(/../g).map((h) => parseInt(h, 16)));
    const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
  } catch (e) { return ''; }
}

export const RunLog = {
  // inizio partita: la richiesta del gettone parte subito, il resto si mette in fila dietro
  begin(extra) {
    token = null; key = null; seq = 0; lastLevel = 1;
    chain = Api.startRun(Run.character, extra).then((r) => {
      if (r && r.ok && r.token) { token = r.token; key = r.key || null; Run.token = r.token; }
    }).catch(() => {});
  },

  // si entra in una tappa nuova, 1..9 = (campionato-1)*3 + livello (le ripartenze dal checkpoint non contano)
  level(n) {
    if (n <= lastLevel) return;
    lastLevel = n;
    const score = Run.score, kills = Run.stats.kills;   // fotografia di adesso, non di quando parte la richiesta
    chain = chain.then(async () => {
      if (!token) return;
      seq++;
      const sig = await sign(`${token}|${seq}|${n}|${score}|${kills}`);
      await Api.progress({ token, seq, level: n, score, kills, sig });
    }).catch(() => {});
  },

  // CONTINUE: si manda il punteggio di prima dell'azzeramento; da qui il server riparte da zero
  cont(stage) {
    const score = Run.score, kills = Run.stats.kills;
    chain = chain.then(async () => {
      if (!token) return;
      seq++;
      const sig = await sign(`${token}|${seq}|cont|${stage}|${score}|${kills}`);
      await Api.progress({ token, seq, level: stage, score, kills, sig, cont: 1 });
    }).catch(() => {});
  },

  // fine partita: aspetta che i passaggi precedenti siano arrivati, poi chiude
  end(payload) {
    const p = { ...payload };
    const kills = Run.stats.kills;
    return chain.then(async () => {
      if (!token) return { ok: false, offline: true };
      seq++;
      const stage = (Math.min(3, p.loop || 1) - 1) * 3 + p.level;
      const sig = await sign(`${token}|${seq}|end|${p.score}|${stage}|${p.cleared ? 1 : 0}|${kills}`);
      return Api.endRun(token, { ...p, seq, sig });
    });
  },
};
