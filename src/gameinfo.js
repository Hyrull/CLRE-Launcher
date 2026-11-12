// Succès Steam lus en local (sans clé API), durée pour finir (HowLongToBeat) et notes.
const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('./fsutil');
const { parseBinKV } = require('./binkv');

const ICON = (appid, f) => (f ? `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${appid}/${f}` : '');
const loc = (o) => (o && typeof o === 'object' ? o.french || o.english || Object.values(o).find((v) => typeof v === 'string' && v) || '' : o || '');

// ---------- Succès : appcache/stats ----------
const schemaCache = new Map(); // appid -> { mtime, bits }
function readSchema(dir, appid) {
  const f = path.join(dir, `UserGameStatsSchema_${appid}.bin`);
  let st; try { st = fs.statSync(f); } catch { return null; }
  const hit = schemaCache.get(appid);
  if (hit && hit.mtime === st.mtimeMs) return hit.bits;
  let bits = [];
  try {
    const kv = parseBinKV(fs.readFileSync(f));
    const root = kv[String(appid)] || kv[Object.keys(kv)[0]] || {};
    for (const [statId, s] of Object.entries(root.stats || {})) {
      for (const [bit, b] of Object.entries((s && s.bits) || {})) {
        const d = b.display || {};
        bits.push({ statId, bit: Number(bit), id: b.name, name: loc(d.name) || b.name, description: loc(d.desc), hidden: Number(d.hidden) === 1, icon: ICON(appid, d.icon), iconGray: ICON(appid, d.icon_gray) });
      }
    }
  } catch { bits = []; }
  schemaCache.set(appid, { mtime: st.mtimeMs, bits });
  return bits;
}
function readUser(dir, accountId, appid) {
  try { return (parseBinKV(fs.readFileSync(path.join(dir, `UserGameStats_${accountId}_${appid}.bin`))).cache) || {}; } catch { return {}; }
}
function localAchievements(steamPath, accountId, appid) {
  const dir = path.join(steamPath, 'appcache', 'stats');
  const bits = readSchema(dir, appid);
  if (!bits) return null;
  const user = readUser(dir, accountId, appid);
  const list = bits.map((b) => {
    const s = user[b.statId] || {};
    const achieved = (((s.data >>> 0) >>> b.bit) & 1) === 1;
    const unlocked = Number(((s.AchievementTimes || {})[b.bit]) || 0);
    return { id: b.id, name: b.name, description: b.description, hidden: b.hidden, achieved, unlocked, icon: achieved ? b.icon : b.iconGray || b.icon };
  });
  return { list, done: list.filter((a) => a.achieved).length, total: list.length };
}
// Compteurs pour toute la bibliothèque (jaquettes, listes)
function achievementSummaries(steamPath, accountId, appids) {
  const out = {};
  if (!steamPath || !accountId) return out;
  for (const id of appids) {
    const a = localAchievements(steamPath, accountId, id);
    if (a && a.total) out[id] = { done: a.done, total: a.total };
  }
  return out;
}
async function globalPercents(appid) {
  try {
    const r = await fetch(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`);
    if (!r.ok) return {};
    const list = ((await r.json()).achievementpercentages || {}).achievements || [];
    return Object.fromEntries(list.map((a) => [a.name, Number(a.percent)]));
  } catch { return {}; }
}

// ---------- HowLongToBeat (pas d'API officielle : on passe par la recherche du site) ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const HL = 'https://howlongtobeat.com';
let token = null;
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[™®©]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
async function hltbToken(force) {
  if (token && !force) return token;
  const r = await fetch(`${HL}/api/search/site/init?t=${Date.now()}`, { headers: { 'User-Agent': UA, Referer: HL + '/' } });
  if (!r.ok) throw new Error(`HowLongToBeat indisponible (HTTP ${r.status})`);
  token = (await r.json()).token;
  return token;
}
async function hltbSearch(name, retry = true) {
  const t = await hltbToken();
  const body = {
    searchType: 'games', searchTerms: norm(name).split(' ').filter(Boolean), searchPage: 1, size: 8,
    searchOptions: { games: { userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main', rangeTime: { min: 0, max: 0 }, gameplay: { perspective: '', flow: '', genre: '', difficulty: '' }, rangeYear: { min: '', max: '' }, modifier: '' }, users: { sortCategory: 'postcount' }, lists: { sortCategory: 'follows' }, filter: '', sort: 0, randomizer: 0 },
    useCache: true,
  };
  const r = await fetch(`${HL}/api/search/site`, { method: 'POST', headers: { 'User-Agent': UA, Referer: HL + '/', Origin: HL, 'Content-Type': 'application/json', 'x-auth-token': t }, body: JSON.stringify(body) });
  if (r.status === 403 && retry) { await hltbToken(true); return hltbSearch(name, false); }
  if (!r.ok) throw new Error(`HowLongToBeat indisponible (HTTP ${r.status})`);
  return (await r.json()).data || [];
}
function pick(name, list) {
  const n = norm(name);
  return list.find((x) => norm(x.game_name) === n) || list.find((x) => norm(x.game_alias || '').split(' ').join(' ') === n)
    || list.find((x) => norm(x.game_name).startsWith(n) || n.startsWith(norm(x.game_name))) || list[0] || null;
}
class HowLong {
  constructor(file) { this.file = file; this.db = readJsonSafe(file, {}); }
  save() { try { writeJsonAtomic(this.file, this.db); } catch {} }
  async get(key, name) {
    const hit = this.db[key];
    const now = Date.now() / 1000;
    if (hit && hit.t > now - (hit.v ? 30 : 7) * 86400) return hit.v;
    // Nom nettoyé : sans « Edition », « Remastered »… quand la recherche exacte ne donne rien
    let list = await hltbSearch(name);
    if (!list.length) { const short = name.replace(/[:\-–].*$/, '').replace(/\b(game of the year|goty|definitive|deluxe|complete|enhanced|remastered|edition)\b/gi, '').trim(); if (short && short !== name) list = await hltbSearch(short); }
    const m = pick(name, list);
    const v = m ? {
      id: m.game_id, name: m.game_name, main: m.comp_main || 0, plus: m.comp_plus || 0, full: m.comp_100 || 0,
      score: m.review_score || 0, url: `${HL}/game/${m.game_id}`,
    } : null;
    this.db[key] = { t: now, v };
    this.save();
    return v;
  }
}

// ---------- Jeux offerts sur l'Epic Games Store (API publique du magasin) ----------
let freeCache = { t: 0, v: null };
async function epicFree() {
  if (freeCache.v && Date.now() - freeCache.t < 3 * 3600 * 1000) return freeCache.v;
  const hosts = ['store-site-backend-static-ipv4.ak.epicgames.com', 'store-site-backend-static.epicgames.com'];
  let j = null;
  for (const h of hosts) {
    try { const r = await fetch(`https://${h}/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR`); if (r.ok) { j = await r.json(); break; } } catch { /* hôte suivant */ }
  }
  if (!j) throw new Error('Epic Games Store injoignable');
  const now = Date.now();
  const els = (((j.data || {}).Catalog || {}).searchStore || {}).elements || [];
  const free = (offers) => ((offers || [])[0] || {}).promotionalOffers || [];
  const out = [];
  for (const x of els) {
    const p = x.promotions || {};
    const cur = free(p.promotionalOffers).find((o) => o.discountSetting && o.discountSetting.discountPercentage === 0 && Date.parse(o.startDate) <= now && Date.parse(o.endDate) > now);
    const next = free(p.upcomingPromotionalOffers).find((o) => o.discountSetting && o.discountSetting.discountPercentage === 0);
    if (!cur && !next) continue;
    const img = (t) => ((x.keyImages || []).find((k) => k.type === t) || {}).url || '';
    const slug = (x.productSlug && x.productSlug.replace(/\/home$/, '')) || ((x.catalogNs || {}).mappings || [])[0]?.pageSlug || ((x.offerMappings || [])[0] || {}).pageSlug || '';
    out.push({
      id: x.id, name: x.title, now: !!cur, start: Date.parse((cur || next).startDate) / 1000, end: Date.parse((cur || next).endDate) / 1000,
      cover: img('OfferImageTall') || img('Thumbnail'), wide: img('OfferImageWide'),
      price: x.price && x.price.totalPrice ? x.price.totalPrice.fmtPrice.originalPrice : '',
      url: slug ? `https://store.epicgames.com/fr/p/${slug}` : 'https://store.epicgames.com/fr/free-games',
    });
  }
  freeCache = { t: Date.now(), v: out };
  return out;
}

module.exports = { localAchievements, achievementSummaries, globalPercents, HowLong, epicFree };
