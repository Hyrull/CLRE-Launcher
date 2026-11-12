// Journal de jeu (sessions, succès débloqués, captures) et vitrine des succès rares.
const fs = require('fs');
const { readJsonSafe, writeJsonAtomic } = require('./fsutil');
const gameinfo = require('./gameinfo');
const extras = require('./extras');

// Succès débloqués de tous les jeux Steam, lus en local
function unlockedAchievements(lib, games) {
  const out = [];
  if (!lib || !lib.steamPath || !lib.user || !lib.user.accountId) return out;
  for (const g of games) {
    if (g.store !== 'steam' || !g.ach || !g.ach.done) continue;
    const a = gameinfo.localAchievements(lib.steamPath, lib.user.accountId, g.appid);
    if (!a) continue;
    for (const x of a.list) if (x.achieved) out.push({ key: g.key, appid: g.appid, game: g.name, id: x.id, name: x.name, description: x.description, icon: x.icon, t: x.unlocked || 0, total: a.total });
  }
  return out;
}

function buildJournal(lib, games, sessions, onlyKey) {
  const list = onlyKey ? games.filter((g) => g.key === onlyKey) : games;
  const events = [];
  for (const s of sessions) if (!onlyKey || s.key === onlyKey) events.push({ type: 'session', key: s.key, t: s.start, end: s.end });
  for (const a of unlockedAchievements(lib, list)) if (a.t) events.push({ type: 'ach', key: a.key, t: a.t, name: a.name, icon: a.icon, id: a.id, appid: a.appid });
  if (lib && lib.steamPath && lib.user && lib.user.accountId) {
    const apps = onlyKey ? list.filter((g) => g.store === 'steam').map((g) => g.appid) : extras.screenshotApps(lib.steamPath, lib.user.accountId);
    for (const appid of apps) {
      for (const s of extras.steamScreenshots(lib.steamPath, lib.user.accountId, appid)) events.push({ type: 'shot', key: String(appid), t: s.time, thumb: s.thumb, url: s.url });
    }
  }
  return events.filter((e) => e.t > 0).sort((a, b) => b.t - a.t).slice(0, 6000);
}

// Pourcentages mondiaux mis en cache 7 jours (un appel public par jeu)
class Rarity {
  constructor(file) { this.file = file; this.db = readJsonSafe(file, {}); this.busy = null; }
  save() { try { writeJsonAtomic(this.file, this.db); } catch {} }
  async percents(appids) {
    const now = Date.now() / 1000;
    const todo = appids.filter((id) => !this.db[id] || this.db[id].t < now - 7 * 86400);
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const id = todo[i++];
        const p = await gameinfo.globalPercents(id);
        this.db[id] = { t: now, p };
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (todo.length) this.save();
    return Object.fromEntries(appids.map((id) => [id, (this.db[id] || {}).p || {}]));
  }
  async showcase(lib, games) {
    const un = unlockedAchievements(lib, games);
    const pct = await this.percents([...new Set(un.map((a) => a.appid))]);
    for (const a of un) a.global = pct[a.appid][a.id] ?? null;
    const rated = un.filter((a) => a.global != null);
    const perfect = games.filter((g) => g.ach && g.ach.total && g.ach.done === g.ach.total).map((g) => g.key);
    return {
      total: un.length,
      games: new Set(un.map((a) => a.key)).size,
      perfect,
      rarest: rated.sort((a, b) => a.global - b.global).slice(0, 30),
      under5: rated.filter((a) => a.global < 5).length,
    };
  }
}

module.exports = { buildJournal, unlockedAchievements, Rarity };
