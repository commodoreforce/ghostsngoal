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
    boost: { it: 'BISONTE: TIRO DI FUOCO', en: 'BISON: FIRE SHOT' },
    look: { skin: '#e0a47e', hair: '#5a4a3a', hairStyle: 'bald', beard: false, moustache: true, retro: true },
    hidden: true,
  },
];

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
