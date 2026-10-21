// Stato della partita in corso, condiviso fra le scene.
import { LocalBest } from './api.js';
import { Cheat } from './cheat.js';

const newStats = () => ({ shots: 0, hits: 0, kills: 0, deaths: 0, boosts: 0, pumpkins: 0, crates: 0,
  killsBy: { zombie: 0, bat: 0, pumpkin: 0, ghost: 0, boss: 0, fisher: 0, owl: 0, eel: 0, washer: 0, wolf: 0, book: 0, azdora: 0, crab: 0, gull: 0, jelly: 0, sailor: 0, rat: 0, octopus: 0, count: 0 } });

// I tre "campionati": si gioca la Serie BKT, chi la finisce sale in Serie A (il gioco vero, punti x2),
// chi finisce anche quella va in Champions League (punti x3). Stessi nemici, cambia quanto picchiano.
//   proj      velocità dei proiettili nemici
//   walk      velocità di camminata/volo dei nemici
//   bossDmg   quanto fa male un pallone al boss (più alto = boss più corto)
//   enemyHp   colpi in più per abbattere i nemici normali
//   invuln    millisecondi di invulnerabilità dopo aver perso la maglia
//   timer     tempo del livello
//   pitShirt  cadendo in una buca si perde la maglia invece della vita
export const LEAGUES = {
  1: { key: 'bkt', pts: 1, proj: 0.78, walk: 0.85, bossDmg: 1.35, enemyHp: 0, invuln: 3000, timer: 1.3, pitShirt: true, color: '#7fd06a' },
  2: { key: 'a', pts: 2, proj: 1, walk: 1, bossDmg: 1, enemyHp: 0, invuln: 2200, timer: 1, pitShirt: false, color: '#9fe8ff' },
  3: { key: 'ucl', pts: 3, proj: 1.18, walk: 1.12, bossDmg: 0.8, enemyHp: 1, invuln: 1600, timer: 0.85, pitShirt: false, color: '#ffd23f' },
};
export const league = () => LEAGUES[Math.min(3, Math.max(1, Run.loop || 1))];

export const EXTRA_LIFE_AT = [20000, 60000];
export const EXTRA_LIFE_EVERY = 100000;

export const Run = {
  character: 'shpendi',
  kit: 'home',
  score: 0,
  lives: 3,
  level: 1,
  loop: 1,
  saved: false,
  continues: 0,
  token: null,
  startedAt: 0,
  nextLife: EXTRA_LIFE_AT[0],
  lifeIdx: 0,
  levelReached: 1,
  deathCause: null,
  cheat: false,
  stats: newStats(),

  reset(character, kit = 'home') {
    this.character = character;
    this.kit = kit;
    this.score = 0; this.lives = 3; this.level = 1; this.loop = 1;
    this.saved = false;      // il Magazziniere Petrosino è stato salvato davvero (finale della Serie A)
    this.continues = 0;
    this.token = null; this.startedAt = Date.now();
    this.nextLife = EXTRA_LIFE_AT[0]; this.lifeIdx = 0; this.levelReached = 1;
    this.deathCause = null;
    this.stats = newStats();
    this.cheat = Cheat.on;   // partita di prova: niente classifica
  },

  // restituisce true se il punteggio ha fatto guadagnare una vita
  add(points) {
    this.score += Math.round(points * league().pts);
    if (this.score >= this.nextLife) {
      this.lives++;
      this.lifeIdx++;
      this.nextLife = this.lifeIdx < EXTRA_LIFE_AT.length ? EXTRA_LIFE_AT[this.lifeIdx] : this.nextLife + EXTRA_LIFE_EVERY;
      return true;
    }
    return false;
  },

  // tappa assoluta 1..9: (campionato-1)*3 + livello (serve al controllo anti-furbi)
  get stage() { return (Math.min(3, this.loop) - 1) * 3 + this.level; },

  // CONTINUE: come in sala giochi, si riparte dal checkpoint con 3 vite ma il punteggio torna a zero
  continueGame() {
    this.continues++;
    this.score = 0; this.lives = 3;
    this.nextLife = EXTRA_LIFE_AT[0]; this.lifeIdx = 0;
  },

  // campionato successivo: si ricomincia dal livello 1, punteggio e vite restano
  nextLeague() {
    this.loop = Math.min(3, this.loop + 1);
    this.level = 1; this.levelReached = 1;
  },

  hiScore(remoteTop = 0) { return Math.max(LocalBest.get(), remoteTop, this.score); },
};
