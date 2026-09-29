/**
 * NEURAL STRIKE — local career stats.
 *
 * Persists to localStorage now; structured so a cloud account can replace the
 * store later (swap load/save for a fetch without touching the callers). Fed by
 * the authoritative `stats:result` event the match ceremony emits.
 */
const KEY = 'ns_stats_v1';

const EMPTY = {
  games: 0,
  kills: 0,
  deaths: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  bestGame: 0,
  playtimeMs: 0,
};

export class CareerStats {
  constructor() {
    this._matchStart = 0;
    this._listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...EMPTY, ...JSON.parse(raw) };
    } catch {}
    return { ...EMPTY };
  }

  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
    for (const fn of this._listeners) {
      try { fn(data); } catch {}
    }
  }

  reset() {
    this.save({ ...EMPTY });
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  attach(events) {
    if (!events?.on) return;
    events.on('match:start', () => { this._matchStart = performance.now(); });
    events.on('stats:result', (r) => this.record(r || {}));
  }

  record(r) {
    const s = this.load();
    s.games += 1;
    s.kills += Number(r.kills) || 0;
    s.deaths += Number(r.deaths) || 0;
    if (r.win) s.wins += 1;
    else if (String(r.verdict || '').toLowerCase().includes('draw')) s.draws += 1;
    else s.losses += 1;
    s.bestGame = Math.max(s.bestGame, Number(r.kills) || 0);
    if (this._matchStart) {
      s.playtimeMs += Math.max(0, performance.now() - this._matchStart);
      this._matchStart = 0;
    }
    this.save(s);
  }

  /** Derived, display-ready view. */
  view() {
    const s = this.load();
    const kd = s.deaths > 0 ? (s.kills / s.deaths) : s.kills;
    const totalWL = s.wins + s.losses;
    const winRate = totalWL > 0 ? Math.round((s.wins / totalWL) * 100) : 0;
    return { ...s, kd: kd.toFixed(2), winRate, playtime: fmtDuration(s.playtimeMs) };
  }
}

export function fmtDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const sec = total % 60;
  return `${m}m ${sec}s`;
}
