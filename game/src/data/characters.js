// Personaggi: statistiche (scala 1-5, Hubner sfonda a 6), abilità sempre attiva e boost.
// I colori servono solo agli sprite provvisori: con gli sprite veri restano
// come palette di riferimento per le varianti (oro, senza maglia).

export const CHARACTERS = [
  {
    id: 'shpendi', name: 'CRISTIAN SHPENDI', short: 'SHPENDI', number: '9',
    nick: { it: 'RE MIDA', en: 'KING MIDAS' },
    stats: { speed: 4, jump: 3, shot: 4, boost: 3 },
    passive: { it: 'FIUTO DEL GOL: 3 PALLONI IN CAMPO', en: 'GOAL SENSE: 3 BALLS ON SCREEN' },
    boost: { it: 'MIDA: PALLONI D\'ORO', en: 'MIDAS: GOLDEN BALLS' },
    look: { skin: '#e9b48a', hair: '#2b1b12', hairStyle: 'short', beard: false },
  },
  {
    id: 'ciofi', name: 'ANDREA CIOFI', short: 'CIOFI', number: '15',
    nick: { it: 'IL CAPITANO', en: 'THE CAPTAIN' },
    stats: { speed: 3, jump: 3, shot: 3, boost: 5 },
    passive: { it: 'SCIVOLATA: GIÙ + A IN CORSA', en: 'SLIDE TACKLE: DOWN + A' },
    boost: { it: 'CHIOMA DEL CAPITANO', en: 'CAPTAIN\'S MANE' },
    look: { skin: '#e2a982', hair: '#3a2416', hairStyle: 'short', beard: true },
  },
  {
    id: 'klinsmann', name: 'JONATHAN KLINSMANN', short: 'KLINSMANN', number: '33',
    nick: { it: 'CAPITAN AMERICA', en: 'CAPTAIN AMERICA' },
    stats: { speed: 3, jump: 5, shot: 2, boost: 4 },
    passive: { it: 'PARATA: B AL MOMENTO GIUSTO', en: 'SAVE: B AT THE RIGHT TIME' },
    boost: { it: 'CAPITAN ROMAGNA', en: 'CAPTAIN ROMAGNA' },
    look: { skin: '#f0c19c', hair: '#c9a15a', hairStyle: 'short', beard: false, keeper: true },
    // le maglie da portiere: rossa (la prima), gialla, viola
    kitNames: { home: { it: 'ROSSA', en: 'RED' }, away: { it: 'GIALLA', en: 'YELLOW' }, third: { it: 'VIOLA', en: 'PURPLE' } },
  },
  {
    id: 'diamanti', name: 'ALESSANDRO DIAMANTI', short: 'DIAMANTI', number: '',
    nick: { it: 'IL MISTER', en: 'THE GAFFER' },
    stats: { speed: 3, jump: 3, shot: 5, boost: 3 },
    passive: { it: 'MANCINO: TIRI A EFFETTO', en: 'LEFT FOOT: CURLING SHOTS' },
    boost: { it: 'GOOD VIBES', en: 'GOOD VIBES' },
    look: { skin: '#d9a07a', hair: '#1d1612', hairStyle: 'slick', beard: true, coach: true },
  },
  {
    id: 'hubner', name: 'DARIO HUBNER', short: 'HUBNER', number: '',
    nick: { it: 'TATANKA', en: 'TATANKA' },
    stats: { speed: 2, jump: 2, shot: 6, boost: 3 },
    passive: { it: 'TESTA DURA: NESSUN RINCULO', en: 'HARD HEAD: NO KNOCKBACK' },
    boost: { it: 'TATANKA: DIVENTA BISONTE', en: 'TATANKA: BISON FORM' },
    look: { skin: '#e0a47e', hair: '#5a4a3a', hairStyle: 'bald', beard: false, moustache: true, retro: true },
    // le tre maglie storiche di Tatanka
    kitNames: { home: { it: 'CLASSICA', en: 'CLASSIC' }, away: { it: 'STELLE', en: 'STARS' }, third: { it: 'STELLE BLU', en: 'BLUE STARS' } },
    hidden: true,
  },
];

// Le tre maglie 2026-27. I colori qui sono PROVVISORI: vanno sostituiti con quelli ufficiali.
// Con gli sprite veri le maglie si ottengono cambiando i colori in codice (un solo set di disegni).
export const KITS = [
  { id: 'home', it: 'CASA', en: 'HOME' },
  { id: 'away', it: 'TRASFERTA', en: 'AWAY' },
  { id: 'third', it: 'TERZA', en: 'THIRD' },
];
export const KIT_COLORS = {
  home: { shirt: '#f4f4f0', shirtSh: '#c9c9d2', trim: '#16161c', shorts: '#16161c', sock: '#f4f4f0', sockBand: '#16161c', gk: '#2d2d36', gkSh: '#1d1d24', gkTrim: '#ff7a1a' },
  away: { shirt: '#18181e', shirtSh: '#0a0a0e', trim: '#c8943f', shorts: '#16161c', sock: '#18181e', sockBand: '#c8943f', gk: '#ffd23f', gkSh: '#c98a12', gkTrim: '#16161c' },
  third: { shirt: '#285ade', shirtSh: '#183ab2', trim: '#f4f4f0', shorts: '#183ab2', sock: '#285ade', sockBand: '#f4f4f0', gk: '#8a4ad0', gkSh: '#5a2a8a', gkTrim: '#16161c' },
};
// il Mister ha sempre la tuta; gli altri scelgono tra tre maglie (Hubner tra le sue tre storiche)
export const hasKits = (c) => !c.look.coach;
export const kitName = (c, kit, lang) => (c.kitNames && c.kitNames[kit] ? c.kitNames[kit][lang] : KITS.find((k) => k.id === kit)[lang]);
export const texPrefix = (id, kit) => (!kit || kit === 'home' ? `pl_${id}` : `pl_${id}_${kit}`);

export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

// Tradurre le barre in numeri di gioco
export function tuning(c) {
  const s = c.stats;
  return {
    runSpeed: 62 + s.speed * 12,          // px/s
    jumpVel: -(252 + s.jump * 17),        // px/s
    ballSpeed: 170 + s.shot * 14,
    ballDamage: s.shot >= 5 ? 2 : 1,
    maxBalls: c.id === 'shpendi' ? 3 : 2,
    boostTime: 8000 + s.boost * 1000,     // ms
  };
}
