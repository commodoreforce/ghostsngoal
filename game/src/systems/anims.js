// Animazioni condivise, create una volta sola all'accensione.
import { CHARACTERS } from '../data/characters.js';

export function buildAnims(scene) {
  const a = scene.anims;
  const mk = (key, tex, frames, rate, repeat = -1) => {
    if (a.exists(key)) a.remove(key);
    a.create({ key, frames: frames.map((f) => ({ key: tex, frame: f })), frameRate: rate, repeat });
  };
  mk('ghost_fly', 'ghost', ['gh0', 'gh1'], 4);
  mk('bat_fly', 'bat', ['bat0', 'bat1'], 6.67);
  mk('zombie_rise', 'zombie', ['rise0', 'rise1', 'rise2'], 6, 0);
  mk('zombie_walk', 'zombie', ['walk0', 'walk1'], 4);
  mk('pumpkin_idle', 'pumpkin', ['pk0', 'pk1'], 3);
  mk('ref_idle', 'referee', ['ref0', 'ref1'], 3);
  mk('count_fly', 'count', ['count0', 'count1'], 6);

  for (const c of CHARACTERS) {
    const vars = ['base', 'naked'];
    if (c.id === 'shpendi') vars.push('gold');
    if (c.id === 'ciofi') vars.push('mane', 'mane_naked');
    if (c.id === 'klinsmann') vars.push('hero', 'hero_naked');
    for (const v of vars) {
      const tex = `pl_${c.id}_${v}`;
      mk(`${tex}_idle`, tex, ['idle0', 'idle1'], 2);
      mk(`${tex}_run`, tex, ['run0', 'run1', 'run2', 'run3'], 10);
      mk(`${tex}_cheer`, tex, ['cheer0', 'cheer1'], 5);
      mk(`${tex}_ko`, tex, ['ko0', 'ko1'], 4, 0);
    }
  }
}
