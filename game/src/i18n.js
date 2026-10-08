// Testi in italiano e inglese. DAIBURDEL non si traduce mai.
const STRINGS = {
  it: {
    pressStart: 'PREMI START',
    pressStartSub: 'CUORE BIANCONERO',
    credits: '© 2026 CESENA FC',
    plays: 'PARTITE GIOCATE',
    hiscores: 'I MIGLIORI BURDÈL',
    choose: 'SCEGLI IL TUO CAMPIONE',
    speed: 'VELOCITÀ', jump: 'SALTO', shot: 'TIRO', boost: 'BOOST',
    locked: 'BLOCCATO',
    magicPrompt: 'INSERISCI LA PAROLA MAGICA',
    magicHint: 'SCRIVI E PREMI START',
    magicWrong: 'PAROLA SBAGLIATA',
    magicTooMany: 'TROPPI TENTATIVI. RIPROVA PIÙ TARDI',
    magicOffline: 'SERVER NON RAGGIUNGIBILE',
    unlocked: 'SBLOCCATO!',
    kidnapped: 'HANNO RAPITO PETROSINO!',
    intro1: 'NOTTE DI HALLOWEEN.',
    intro2: 'IL MAGAZZINO DEL MANUZZI.',
    intro3: 'SENZA PETROSINO, DOMENICA SI GIOCA SENZA MAGLIE.',
    level1: 'LIVELLO 1', level1Name: 'NOTTE AL MANUZZI',
    ready: 'PRONTI?', go: 'VIA!',
    time: 'TEMPO', score: 'PUNTI', hi: 'RECORD',
    checkpoint: 'CHECKPOINT',
    timeUp: 'TEMPO SCADUTO',
    gameOver: 'GAME OVER',
    bonusTime: 'BONUS TEMPO', bonusAcc: 'PRECISIONE', bonusNoHit: 'SENZA UN GRAFFIO',
    total: 'TOTALE',
    enterName: 'INSERISCI IL TUO NOME',
    nameHint: '↑↓ LETTERA   ←→ SPOSTA|B CANCELLA   START OK',
    newRecord: 'NUOVO RECORD!',
    rank: 'POSIZIONE',
    nameRejected: 'NOME NON VALIDO, RIPROVA',
    sending: 'INVIO IN CORSO...',
    toBeContinued: 'CONTINUA NEL LIVELLO 2...',
    demoEnd: 'FINE DELLA DEMO · LIVELLI 2 E 3 IN ARRIVO',
    paused: 'PAUSA',
    combo: 'COMBO',
    shirt: 'MAGLIA!',
    oneUp: '1UP',
    boostGo: 'BOOST!',
    lang: 'ENGLISH',
  },
  en: {
    pressStart: 'PRESS START',
    pressStartSub: 'BLACK & WHITE HEART',
    credits: '© 2026 CESENA FC',
    plays: 'GAMES PLAYED',
    hiscores: 'TOP BURDÈL',
    choose: 'CHOOSE YOUR CHAMPION',
    speed: 'SPEED', jump: 'JUMP', shot: 'SHOT', boost: 'BOOST',
    locked: 'LOCKED',
    magicPrompt: 'ENTER THE MAGIC WORD',
    magicHint: 'TYPE IT AND PRESS START',
    magicWrong: 'WRONG WORD',
    magicTooMany: 'TOO MANY TRIES. TRY LATER',
    magicOffline: 'SERVER UNREACHABLE',
    unlocked: 'UNLOCKED!',
    kidnapped: 'PETROSINO HAS BEEN KIDNAPPED!',
    intro1: 'HALLOWEEN NIGHT.',
    intro2: 'THE MANUZZI KIT ROOM.',
    intro3: 'WITHOUT PETROSINO, SUNDAY\'S MATCH HAS NO KITS.',
    level1: 'STAGE 1', level1Name: 'NIGHT AT THE MANUZZI',
    ready: 'READY?', go: 'GO!',
    time: 'TIME', score: 'SCORE', hi: 'HI',
    checkpoint: 'CHECKPOINT',
    timeUp: 'TIME UP',
    gameOver: 'GAME OVER',
    bonusTime: 'TIME BONUS', bonusAcc: 'ACCURACY', bonusNoHit: 'NOT A SCRATCH',
    total: 'TOTAL',
    enterName: 'ENTER YOUR NAME',
    nameHint: '↑↓ LETTER   ←→ MOVE|B DELETE   START OK',
    newRecord: 'NEW RECORD!',
    rank: 'RANK',
    nameRejected: 'NAME NOT ALLOWED, TRY AGAIN',
    sending: 'SENDING...',
    toBeContinued: 'TO BE CONTINUED IN STAGE 2...',
    demoEnd: 'END OF DEMO · STAGES 2 AND 3 COMING',
    paused: 'PAUSE',
    combo: 'COMBO',
    shirt: 'SHIRT!',
    oneUp: '1UP',
    boostGo: 'BOOST!',
    lang: 'ITALIANO',
  },
};

let lang = 'it';
try {
  const saved = localStorage.getItem('gng_lang');
  if (saved) lang = saved;
  else if (!(navigator.language || 'it').toLowerCase().startsWith('it')) lang = 'en';
} catch (e) { /* ignora */ }

export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('gng_lang', l); } catch (e) { /* ignora */ }
  document.documentElement.lang = l;
}
export const t = (k) => (STRINGS[lang] && STRINGS[lang][k]) || STRINGS.it[k] || k;
