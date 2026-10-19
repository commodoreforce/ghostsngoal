// Livello 2 · LA NEBBIA DEL SAVIO. Unità: tile da 16 px.
// Il mondo è più alto dello schermo (26 righe): si parte in basso, lungo il Savio, e si finisce
// in cima alla Via delle Scalette, sul belvedere del Monte (riga 13, come il terreno del livello 1).
//
// A  Ponte Vecchio (0-96)      argine del Savio: buche d'acqua con le botti, pescatori scheletro, civette
// B  Piazza del Popolo (96-176) la fontana Masini (si sale sui gradini), lavandaie, anguille, MEZZANOTTE
// C  Biblioteca Malatestiana (176-252) al buio con le candele, libri volanti incatenati (checkpoint)
// D  Via delle Scalette (252-312) la salita a gradoni, lupi mannari che scendono di corsa
// E  Belvedere del Monte (316-332) arena dell'Azdora

const T = 16;

// la scalinata: larghezza di ogni gradone, dal più basso (riga 24) al più alto (riga 14);
// ogni tre gradini un pianerottolo, come la Via delle Scalette vera
const STEPS = [3, 3, 3, 7, 3, 3, 3, 7, 3, 3, 3];
const STAIRS_X = 256;
const stairs = [];
{
  let x = STAIRS_X;
  STEPS.forEach((w, i) => { stairs.push({ x, row: 24 - i, w }); x += w; });
}
const TOP_X = STAIRS_X + STEPS.reduce((a, b) => a + b, 0);   // 297: da qui si è in cima (riga 13)

export const LEVEL2 = {
  tilesW: 332,
  worldH: 416,          // 26 righe
  groundRow: 25,        // il terreno in basso (lungo il Savio, in piazza, in biblioteca)
  topRow: 13,           // il belvedere
  music: 'level2',
  pitCause: 'river',
  startX: 2.5,
  // tratti di terreno [inizio, fine) alla riga 25; i buchi sono il Savio
  ground: [[0, 18], [21, 40], [44, 62], [67, 80], [85, STAIRS_X]],
  water: [[18, 21], [40, 44], [62, 67], [80, 85]],
  // botti che galleggiano nei buchi (affondano se ci si resta sopra)
  barrels: [19.5, 41.2, 42.9, 63.4, 65.6, 81.4, 83.6],
  stairs,
  topFrom: TOP_X,
  // assi: pontili sul fiume, banchi della biblioteca
  planks: [
    { x: 27, row: 22, w: 4 }, { x: 49, row: 21, w: 3 }, { x: 53, row: 19, w: 3 }, { x: 71, row: 22, w: 4 }, { x: 89, row: 22, w: 3 },
    { x: 186, row: 22, w: 4 }, { x: 194, row: 20, w: 3 }, { x: 203, row: 22, w: 4 }, { x: 212, row: 20, w: 4 }, { x: 222, row: 22, w: 4 },
    { x: 230, row: 19, w: 3 }, { x: 238, row: 22, w: 4 },
  ],
  fountain: 121,          // centro della fontana Masini (tile)
  lamps: [6, 24, 46, 70, 93, 262, 274, 287, 302],
  owls: [24, 46, 70, 274, 302],              // civette sui lampioni
  fishermen: [14, 35, 57, 77, 94],
  candles: [188, 196, 205, 214, 224, 232, 240],
  crates: [
    { x: 10, row: 24, item: 'pumpkinGold' },
    { x: 33, row: 24, item: 'shirt' },
    { x: 55, row: 18, item: 'seahorse' },
    { x: 87, row: 24, item: 'shirt' },
    { x: 104, row: 24, item: 'shirt' },
    { x: 141, row: 24, item: 'seahorse' },
    { x: 168, row: 24, item: 'shirt' },
    { x: 199, row: 24, item: 'shirt' },
    { x: 231, row: 18, item: 'pumpkinGold' },
    { x: 246, row: 24, item: 'piadina' },
    { x: 271, row: 20, item: 'shirt' },
    { x: 285, row: 16, item: 'seahorse' },
    { x: 305, row: 12, item: 'shirt' },
  ],
  pumpkins: [
    [17, 22], [19, 21], [21, 22], [40, 21], [42, 20], [44, 21], [62, 21], [64, 20], [66, 21], [80, 21], [82, 20], [84, 21],
    [50, 20], [54, 18], [108, 22], [110, 21], [112, 22], [130, 22], [132, 21], [134, 22],
    [195, 19], [196, 19], [213, 19], [214, 19], [231, 17],
    [264, 20], [276, 17], [288, 14], [296, 13],
  ],
  // ondate: quando il bordo destro dello schermo arriva alla tile `at`
  waves: [
    { at: 30, type: 'bat', n: 1 }, { at: 60, type: 'bat', n: 2 }, { at: 88, type: 'bat', n: 2 },
    { at: 104, type: 'washer', n: 1 }, { at: 116, type: 'washer', n: 1 }, { at: 136, type: 'washer', n: 2 },
    { at: 150, type: 'washer', n: 1 }, { at: 158, type: 'bat', n: 2 },
    { at: 190, type: 'book', n: 2 }, { at: 200, type: 'book', n: 3 }, { at: 208, type: 'ghost', n: 2 },
    { at: 216, type: 'book', n: 3 }, { at: 226, type: 'book', n: 2 }, { at: 232, type: 'ghost', n: 2 }, { at: 242, type: 'book', n: 3 },
    { at: 262, type: 'wolf', n: 1 }, { at: 276, type: 'wolf', n: 1 }, { at: 284, type: 'bat', n: 2 },
    { at: 292, type: 'wolf', n: 1 }, { at: 304, type: 'bat', n: 2 },
  ],
  zombieZones: [],
  sections: {
    ponte: [0, 96], piazza: [96, 176], library: [176, 252], scalette: [252, 312], belvedere: [312, 332],
  },
  libraryDoor: 177,
  libraryExit: 252,
  midnight: 158,          // passando davanti al Comune scocca la mezzanotte
  checkpoint: 180,        // dentro la Malatestiana
  arena: 316,
  timeA: 220, timeB: 210,
};

export const L2_T = T;
