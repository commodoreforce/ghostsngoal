// Livello 1 · Notte al Manuzzi. Unità: tile da 16 px. Il terreno ha la superficie alla riga 13.
// Sezione A (0-119): fuori dallo stadio, nebbia e lapidi.
// Sezione B (120-239): in campo, riflettori che si spengono.
// Arena del boss (242-261).

export const LEVEL1 = {
  tilesW: 262,
  groundRow: 13,
  // tratti di terreno [inizio, fine) — gli spazi tra un tratto e l'altro sono buche
  ground: [[0, 34], [36, 58], [60, 96], [98, 152], [155, 196], [199, 262]],
  // blocchi di pietra pieni: x, riga superiore, larghezza (arrivano fino al terreno)
  blocks: [
    { x: 14, row: 11, w: 2 }, { x: 42, row: 12, w: 3 }, { x: 43, row: 11, w: 2 },
    { x: 68, row: 11, w: 2 }, { x: 70, row: 9, w: 2 }, { x: 104, row: 12, w: 2 },
    { x: 140, row: 11, w: 3 }, { x: 170, row: 12, w: 2 }, { x: 171, row: 10, w: 1 },
    { x: 210, row: 11, w: 2 }, { x: 228, row: 12, w: 3 },
  ],
  // assi sottili: ci si sale da sotto, giù + A per scendere
  planks: [
    { x: 24, row: 11, w: 4 }, { x: 47, row: 11, w: 2 }, { x: 50, row: 9, w: 5 }, { x: 74, row: 9, w: 3 },
    { x: 78, row: 7, w: 4 }, { x: 84, row: 11, w: 3 }, { x: 110, row: 11, w: 3 }, { x: 113, row: 9, w: 3 },
    { x: 150, row: 11, w: 6 }, { x: 157, row: 9, w: 3 }, { x: 160, row: 7, w: 4 }, { x: 180, row: 11, w: 3 },
    { x: 184, row: 9, w: 3 }, { x: 194, row: 11, w: 6 }, { x: 214, row: 11, w: 3 }, { x: 218, row: 9, w: 4 },
  ],
  graves: [6, 11, 19, 30, 39, 47, 56, 63, 75, 88, 93, 108, 116],
  bigGraves: [22, 52, 82, 100],
  lamps: [3, 27, 48, 66, 90, 110],
  // casse da rompere a pallonate (3 colpi)
  crates: [
    { x: 17, row: 12, item: 'pumpkinGold' },
    { x: 52, row: 8, item: 'seahorse' },
    { x: 61, row: 12, item: 'shirt' },
    { x: 94, row: 12, item: 'shirt' },
    { x: 143, row: 10, item: 'shirt' },
    { x: 162, row: 6, item: 'seahorse' },
    { x: 188, row: 12, item: 'shirt' },
    { x: 232, row: 12, item: 'piadina' },
  ],
  // zucche da raccogliere: archi sopra le buche e premi sulle piattaforme alte
  pumpkins: [
    [34, 10], [35, 9], [36, 10], [58, 10], [59, 9], [60, 10], [79, 6], [80, 6], [96, 10], [97, 9],
    [113, 7], [114, 7], [152, 9], [153, 8], [154, 9], [161, 5], [196, 9], [197, 8], [219, 7], [220, 7],
  ],
  // ondate a comparsa: quando il bordo destro dello schermo arriva alla tile `at`
  waves: [
    { at: 30, type: 'bat', n: 1 }, { at: 46, type: 'pumpkin', n: 1 }, { at: 62, type: 'bat', n: 2 },
    { at: 80, type: 'pumpkin', n: 2 }, { at: 100, type: 'bat', n: 2 },
    { at: 132, type: 'ghost', n: 2 }, { at: 150, type: 'pumpkin', n: 2 }, { at: 162, type: 'ghost', n: 2 },
    { at: 176, type: 'bat', n: 2 }, { at: 192, type: 'ghost', n: 2 }, { at: 204, type: 'pumpkin', n: 2 },
    { at: 216, type: 'ghost', n: 2 }, { at: 226, type: 'bat', n: 2 },
  ],
  // zombie che emergono dal terreno, a ritmo continuo, in questi tratti
  zombieZones: [
    { from: 6, to: 118, every: 4200, max: 2, sliders: 0.08 },
    { from: 126, to: 238, every: 4600, max: 2, sliders: 0.15 },
  ],
  goals: [124, 236],
  ledFrom: 126, ledTo: 234, ledStep: 6,
  checkpoint: 121,
  darkFrom: 124, darkTo: 240,
  arena: 242,
  timeA: 150, timeB: 180,
};
