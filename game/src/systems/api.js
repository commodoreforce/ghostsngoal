// Dialogo con il backend PHP. Il gioco resta giocabile anche se il server
// non risponde: classifica e sblocco semplicemente non sono disponibili.

const BASE = './api/';

async function call(path, body) {
  const opt = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(BASE + path, { ...opt, signal: ctrl.signal, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false, status: res.status, ...data };
  } catch (e) {
    return { ok: false, offline: true };
  } finally {
    clearTimeout(to);
  }
}

export const Api = {
  // ogni partita ottiene un gettone dal server: serve a verificare che il punteggio sia plausibile
  startRun: (character) => call('run.php', { action: 'start', character }),
  endRun: (token, payload) => call('run.php', { action: 'end', token, ...payload }),
  submitScore: (token, nickname) => call('score.php', { token, nickname }),
  leaderboard: (limit = 10) => call(`leaderboard.php?limit=${limit}`),
  unlock: (word) => call('unlock.php', { word }),
};

// sblocco di Hubner: resta sul dispositivo anche quando la parola cambia
export const Unlock = {
  has() { try { return localStorage.getItem('gng_tatanka') === '1'; } catch (e) { return false; } },
  set() { try { localStorage.setItem('gng_tatanka', '1'); } catch (e) { /* ignora */ } },
};

export const LocalBest = {
  get() { try { return parseInt(localStorage.getItem('gng_best') || '0', 10) || 0; } catch (e) { return 0; } },
  set(v) { try { if (v > this.get()) localStorage.setItem('gng_best', String(v)); } catch (e) { /* ignora */ } },
};
