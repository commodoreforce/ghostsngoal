// Stato della partita in corso, condiviso fra le scene.
import { LocalBest } from './api.js';

export const EXTRA_LIFE_AT = [20000, 60000];
export const EXTRA_LIFE_EVERY = 100000;

export const Run = {
  character: 'shpendi',
  score: 0,
  lives: 3,
  level: 1,
  loop: 1,
  token: null,
  startedAt: 0,
  nextLife: EXTRA_LIFE_AT[0],
  lifeIdx: 0,
  levelReached: 1,
  deathCause: null,
  stats: { shots: 0, hits: 0, kills: 0, deaths: 0, boosts: 0 },

  reset(character) {
    this.character = character;
    this.score = 0; this.lives = 3; this.level = 1; this.loop = 1;
    this.token = null; this.startedAt = Date.now();
    this.nextLife = EXTRA_LIFE_AT[0]; this.lifeIdx = 0; this.levelReached = 1;
    this.deathCause = null;
    this.stats = { shots: 0, hits: 0, kills: 0, deaths: 0, boosts: 0 };
  },

  // restituisce true se il punteggio ha fatto guadagnare una vita
  add(points) {
    this.score += Math.round(points * (this.loop > 1 ? 2 : 1));
    if (this.score >= this.nextLife) {
      this.lives++;
      this.lifeIdx++;
      this.nextLife = this.lifeIdx < EXTRA_LIFE_AT.length ? EXTRA_LIFE_AT[this.lifeIdx] : this.nextLife + EXTRA_LIFE_EVERY;
      return true;
    }
    return false;
  },

  hiScore(remoteTop = 0) { return Math.max(LocalBest.get(), remoteTop, this.score); },
};
