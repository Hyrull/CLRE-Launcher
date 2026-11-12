// Tags du magasin Steam (Roguelike, Coop, Monde ouvert…) : noms en français et tags par jeu.
// Jeux Steam : lus dans appinfo.vdf. Autres jeux reliés à une fiche Steam : demandés une fois au magasin.
const fs = require('fs');
const { writeAtomic } = require('./fsutil');

class Tags {
  constructor(namesFile, cacheFile) {
    this.namesFile = namesFile;
    this.cacheFile = cacheFile;
    try { this.names = JSON.parse(fs.readFileSync(namesFile, 'utf8')); } catch { this.names = { t: 0, map: {} }; }
    try { this.cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { this.cache = {}; }
  }
  async loadNames() {
    if (this.names.t > Date.now() / 1000 - 30 * 86400 && Object.keys(this.names.map).length) return this.names.map;
    try {
      const r = await fetch('https://store.steampowered.com/tagdata/populartags/french');
      if (!r.ok) return this.names.map;
      const list = await r.json();
      this.names = { t: Date.now() / 1000, map: Object.fromEntries(list.map((x) => [x.tagid, x.name])) };
      writeAtomic(this.namesFile, JSON.stringify(this.names));
    } catch { /* hors ligne */ }
    return this.names.map;
  }
  // Applique les tags connus ; renvoie les jeux à compléter
  apply(games) {
    const todo = [];
    for (const g of games) {
      if (g.tags && g.tags.length) continue;
      const id = g.store === 'steam' ? g.appid : g.steamAppId;
      if (!id) continue;
      if (this.cache[id]) g.tags = this.cache[id];
      else todo.push(Number(id));
    }
    return [...new Set(todo)];
  }
  // Récupère les tags manquants, 40 jeux par requête. Renvoie true si quelque chose a changé.
  async fetchMissing(appids) {
    let changed = false;
    for (let i = 0; i < appids.length; i += 40) {
      const ids = appids.slice(i, i + 40);
      const input = { ids: ids.map((appid) => ({ appid })), context: { language: 'french', country_code: 'FR' }, data_request: { include_tag_count: 12 } };
      try {
        const r = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
        if (!r.ok) continue;
        for (const it of ((await r.json()).response || {}).store_items || []) {
          if (!it.appid) continue;
          this.cache[it.appid] = it.tagids || [];
          changed = true;
        }
        for (const id of ids) if (!this.cache[id]) { this.cache[id] = []; changed = true; } // pas de fiche : on ne redemande pas
      } catch { /* hors ligne */ }
    }
    if (changed) try { writeAtomic(this.cacheFile, JSON.stringify(this.cache)); } catch {}
    return changed;
  }
}

module.exports = { Tags };
