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

// tipo di dispositivo, solo per le statistiche (nessun dato personale)
export function deviceKind() {
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

// da dove arriva il visitatore: solo il nome del sito (instagram.com, facebook.com...) o il parametro utm_source
function source() {
  try {
    const utm = new URLSearchParams(location.search).get('utm_source');
    if (utm) return utm.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
    if (!document.referrer) return '';
    const host = new URL(document.referrer).hostname.replace(/^www\./, '').replace(/^(l|lm|m)\./, '');
    return host === location.hostname ? '' : host.slice(0, 60);
  } catch (e) { return ''; }
}

// il fuso orario del telefono (es. Europe/Rome): il server ne ricava solo il paese, niente posizione
function tz() {
  try { return (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 40); } catch (e) { return ''; }
}

export const Api = {
  legal: (lang) => call(`legal.php?lang=${lang}`),
  visit: (lang) => call('visit.php', { device: deviceKind(), lang, source: source(), tz: tz() }),
  // ogni partita ottiene un gettone dal server: serve a verificare che il punteggio sia plausibile
  startRun: (character, extra = {}) => call('run.php', { action: 'start', character, device: deviceKind(), tz: tz(), ...extra }),
  progress: (body) => call('run.php', { action: 'progress', ...body }),
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
