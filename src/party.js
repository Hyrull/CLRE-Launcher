// Soirées jeu entre amis : planification, rappels Windows et jeux en commun.
// Les soirées restent sur ce PC (prefs.json) ; l'invitation se copie pour l'envoyer où tu veux.
const ownedCache = new Map(); // steamid -> { t, appids | null }

// Jeux possédés par un ami (profil public requis), mis en cache une journée
async function ownedGames(apiKey, steamId) {
  const hit = ownedCache.get(steamId);
  if (hit && hit.t > Date.now() - 86400000) return hit.appids;
  let appids = null;
  try {
    const r = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&include_played_free_games=1&include_appinfo=0`);
    if (r.ok) {
      const g = ((await r.json()).response || {}).games;
      appids = Array.isArray(g) ? g.map((x) => String(x.appid)) : null; // null = profil privé
    }
  } catch { /* hors ligne */ }
  ownedCache.set(steamId, { t: Date.now(), appids });
  return appids;
}

// Jeux Steam que tu partages avec les amis choisis, les jeux multijoueur d'abord
async function commonGames(apiKey, friendIds, myGames, tagNames) {
  if (!apiKey) return { error: 'nokey' };
  const per = {};
  const privateIds = [];
  for (const id of friendIds) {
    const owned = await ownedGames(apiKey, id);
    if (!owned) { privateIds.push(id); continue; }
    per[id] = new Set(owned);
  }
  const visible = Object.keys(per);
  const multi = /multijoueur|coop|en ligne|jcj|massivement|battle royale|local/i;
  const games = myGames.filter((g) => g.store === 'steam').map((g) => {
    const withIds = visible.filter((id) => per[id].has(String(g.appid)));
    const tags = (g.tags || []).map((t) => tagNames[t] || '').join(' ');
    return { key: g.key, n: withIds.length, ids: withIds, multi: multi.test(tags) };
  }).filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || (b.multi - a.multi));
  return { games: games.slice(0, 40), privateIds, checked: visible.length };
}

class Parties {
  constructor(read, write, notify) {
    this.read = read; this.write = write; this.notify = notify;
    this.timer = setInterval(() => this.tick(), 30000);
    setTimeout(() => this.tick(), 5000);
  }
  list() { return (this.read().parties || []).sort((a, b) => a.time - b.time); }
  save(ev) {
    const p = this.read();
    const list = p.parties || [];
    const id = ev.id || Date.now().toString(36);
    const clean = { id, key: String(ev.key || ''), name: String(ev.name || ''), time: Number(ev.time) || Date.now(), friends: (ev.friends || []).slice(0, 30), note: String(ev.note || '').slice(0, 300), remind: Number(ev.remind ?? 15) };
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list[i] = { ...list[i], ...clean, notified: {} }; else list.push({ ...clean, notified: {} });
    p.parties = list;
    this.write(p);
    return clean;
  }
  remove(id) { const p = this.read(); p.parties = (p.parties || []).filter((x) => x.id !== id); this.write(p); return true; }
  // Rappel avant, puis « c'est l'heure » ; les soirées passées de plus de 2 jours sont nettoyées
  tick() {
    const p = this.read();
    const list = p.parties || [];
    const now = Date.now();
    let dirty = false;
    for (const ev of list) {
      ev.notified = ev.notified || {};
      const who = ev.friends && ev.friends.length ? ` avec ${ev.friends.map((f) => f.name).slice(0, 3).join(', ')}${ev.friends.length > 3 ? '…' : ''}` : '';
      if (ev.remind > 0 && !ev.notified.before && now >= ev.time - ev.remind * 60000 && now < ev.time) {
        ev.notified.before = true; dirty = true;
        this.notify(`Soirée ${ev.name} dans ${ev.remind} min`, `Prépare-toi${who}`, ev);
      }
      if (!ev.notified.start && now >= ev.time && now < ev.time + 3600000) {
        ev.notified.start = true; dirty = true;
        this.notify(`C’est l’heure : ${ev.name}`, `Ta soirée jeu commence${who}`, ev);
      }
    }
    const kept = list.filter((ev) => ev.time > now - 2 * 86400000);
    if (kept.length !== list.length) dirty = true;
    if (dirty) { p.parties = kept; this.write(p); }
  }
}

module.exports = { Parties, commonGames };
