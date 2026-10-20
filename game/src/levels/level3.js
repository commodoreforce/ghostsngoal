// Livello 3 · LA NAVE DEL CONTE. Unità: tile da 16 px.
// Il mondo è alto 20 righe: a terra (riga 18) si corre sulla spiaggia, sul porto e sul molo;
// sulla nave il ponte è più alto (riga 15) e sopra ci sono pennoni e coffa.
//
// A  Spiaggia di Cesenatico (0-92)   sabbia che rallenta, passerelle veloci, la marea, granchi e gabbiani
// B  Porto Canale (92-184)           le barche storiche che ondeggiano, meduse, marinai; la PIOVRA (168-184)
// C  Molo e faro (184-262)           tempesta, onde che scavalcano il molo a tempo, buchi nel molo
// D  La nave del Conte (262-352)     sartie e pennoni, topi dai boccaporti, l'equipaggio scheletro
// E  Il cassero di poppa (352-368)   il CONTE VAMPIRO

const T = 16;
const DECK = 15 * T;      // 240: il ponte della nave

export const LEVEL3 = {
  tilesW: 368,
  worldH: 320,
  groundRow: 18,
  music: 'level3',
  pitCause: 'sea',
  startX: 2.5,
  ground: [[0, 104], [113, 121], [130, 138], [148, 156], [164, 176], [182, 202], [205, 226], [229, 246], [249, 262]],
  // il canale e i buchi del molo: si cade in mare
  water: [[104, 113], [121, 130], [138, 148], [156, 164], [176, 182], [202, 205], [226, 229], [246, 249], [262, 264]],
  // passerelle di legno sulla sabbia: lì si corre a piena velocità
  boardwalks: [[5, 13], [23, 33], [45, 51], [61, 71], [81, 91]],
  pattini: [18.5, 40, 57.5, 76],
  lettini: [30, 68.5, 88],
  tower: 36,                      // torretta del bagnino (la piattaforma è in alto)
  umbrellas: [3, 9, 15, 21, 27, 33, 39, 44, 50, 55, 61, 67, 73, 79, 85, 90],
  crabs: [12, 21, 27, 35, 44, 53, 64, 73, 83],
  // le barche del Porto Canale: nel buco [a, b), con la barca n (0 lancia, 1 bragozzo, 2 trabaccolo)
  boats: [{ gap: [104, 113], n: 0 }, { gap: [121, 130], n: 1 }, { gap: [138, 148], n: 2 }, { gap: [156, 164], n: 0 }, { gap: [176, 182], n: 0, still: true }],
  sailors: [117, 134, 152, 214, 238, 256],
  bollards: [190, 199, 221, 241, 257],
  // onde che scavalcano il molo: [inizio, fine) e sfasamento nel ciclo
  surges: [{ a: 192, b: 197, ph: 0 }, { a: 208, b: 214, ph: 0.35 }, { a: 217, b: 223, ph: 0.7 }, { a: 232, b: 238, ph: 0.15 }, { a: 251, b: 257, ph: 0.55 }],
  // la nave
  ship: { from: 264, to: 368, deckY: DECK, gapFrom: 366 },
  // alberi: pennoni a 40, 80 e 120 px sopra il ponte (ci si arriva saltando, anche con Hubner)
  masts: [{ x: 280, yards: [40, 80, 120] }, { x: 306, yards: [40, 80, 120] }, { x: 332, yards: [40, 80] }],
  hatches: [292, 319, 343],
  shipCrates: [{ x: 274, item: 'shirt' }, { x: 299, item: 'seahorse' }, { x: 326, item: 'shirt' }, { x: 347, item: 'piadina' }],
  crates: [
    { x: 26, row: 17, item: 'shirt' },
    { x: 49, row: 17, item: 'seahorse' },
    { x: 87, row: 17, item: 'shirt' },
    { x: 125, row: 17, item: 'shirt' },
    { x: 151, row: 17, item: 'seahorse' },
    { x: 187, row: 17, item: 'shirt' },
    { x: 218, row: 17, item: 'shirt' },
    { x: 243, row: 17, item: 'seahorse' },
  ],
  pumpkins: [
    [7, 16], [9, 15], [11, 16], [24, 16], [26, 15], [28, 16], [35, 11], [36, 10], [37, 11], [46, 16], [48, 15], [50, 16],
    [62, 16], [64, 15], [66, 16], [68, 16], [82, 16], [84, 15], [86, 16],
    [107, 13], [109, 12], [124, 13], [126, 12], [141, 12], [143, 11], [145, 12], [159, 13],
    [194, 16], [196, 15], [210, 16], [212, 15], [234, 16], [236, 15], [253, 16], [255, 15],
    [284, 11], [285, 11], [310, 11], [311, 11], [280, 5], [306, 5], [336, 11],
  ],
  waves: [
    { at: 18, type: 'gull', n: 1 }, { at: 34, type: 'gull', n: 2 }, { at: 52, type: 'gull', n: 2 }, { at: 70, type: 'gull', n: 3 },
    { at: 60, type: 'ghost', n: 2 }, { at: 86, type: 'gull', n: 2 },
    { at: 112, type: 'gull', n: 2 }, { at: 128, type: 'bat', n: 2 }, { at: 146, type: 'gull', n: 2 }, { at: 160, type: 'ghost', n: 2 },
    { at: 196, type: 'gull', n: 2 }, { at: 212, type: 'ghost', n: 2 }, { at: 228, type: 'gull', n: 3 }, { at: 244, type: 'bat', n: 3 }, { at: 256, type: 'ghost', n: 2 },
    { at: 284, type: 'bat', n: 2 }, { at: 300, type: 'ghost', n: 2 }, { at: 316, type: 'bat', n: 3 }, { at: 334, type: 'ghost', n: 2 }, { at: 346, type: 'bat', n: 2 },
  ],
  zombieZones: [],
  sections: { beach: [0, 92], port: [92, 184], pier: [184, 262], ship: [262, 368] },
  octoArena: 167,           // la Piovra: arena di 16 tile, la banchina a sinistra e il canale (176-182)
  checkpoint: 188,          // all'inizio del molo
  swingAt: 259,             // in fondo al molo: la gomena per saltare sulla nave
  arena: 352,
  timeA: 300, timeB: 230,
};

export const L3_T = T;
