// Animazioni condivise, create una volta sola all'accensione.
import { CHARACTERS, KITS, hasKits, texPrefix } from '../data/characters.js';

export function buildAnims(scene) {
  const a = scene.anims;
  // i fotogrammi che una texture non ha (grafica provvisoria) vengono saltati
  const mk = (key, tex, frames, rate, repeat = -1) => {
    if (a.exists(key)) a.remove(key);
    const t = scene.textures.exists(tex) ? scene.textures.get(tex) : null;
    const ok = frames.filter((f) => t && t.has(f));
    if (!ok.length) return;
    a.create({ key, frames: ok.map((f) => ({ key: tex, frame: f })), frameRate: rate, repeat });
  };
  mk('ghost_fly', 'ghost', ['gh0', 'gh1'], 4);
  // il pipistrello sbatte le ali: su, in mezzo, giù, in mezzo
  mk('bat_fly', 'bat', ['bat0', 'bat1', 'bat2', 'bat1'], 10);
  mk('zombie_rise', 'zombie', ['rise0', 'rise1', 'rise2'], 5, 0);
  mk('zombie_walk', 'zombie', ['walk0', 'walk1', 'walk2', 'walk3'], 5);
  mk('pumpkin_idle', 'pumpkin', ['pk0', 'pkb'], 3);
  mk('maz_idle', 'mazapegul', ['maz0', 'maz1'], 3);
  mk('maz_walk', 'mazapegul', ['mazWalk0', 'mazWalk1', 'mazWalk2', 'mazWalk3'], 7);
  mk('maz_laugh', 'mazfx', ['laugh0', 'laugh1'], 10);
  mk('count_fly', 'count', ['count0', 'count1'], 6);
  mk('pet_idle', 'petrosino', ['pet0', 'pet1'], 2);

  for (const c of CHARACTERS) {
    const vars = ['base', 'naked'];
    if (c.id === 'shpendi') vars.push('gold');
    if (c.id === 'ciofi') vars.push('mane', 'mane_naked');
    if (c.id === 'klinsmann') vars.push('hero', 'hero_naked');
    const kits = hasKits(c) ? KITS.map((k) => k.id) : ['home'];
    for (const kit of kits) for (const v of vars) {
      const tex = `${texPrefix(c.id, kit)}_${v}`;
      mk(`${tex}_idle`, tex, ['idle0', 'idle1'], 2);
      mk(`${tex}_run`, tex, ['run0', 'run1', 'run2', 'run3'], 10);
      mk(`${tex}_cheer`, tex, ['cheer0', 'cheer1'], 5);
      mk(`${tex}_ko`, tex, ['ko0', 'ko1'], 4, 0);
    }
  }
}
