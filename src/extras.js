// Données en plus de la bibliothèque : sessions, téléchargements, captures, actus, succès, amis,
// liste de souhaits et disques. Tout est lu en local ou via les API Steam publiques ;
// succès et amis demandent la clé Web API.
const fs = require('fs');
const path = require('path');
const { readVdf, get, libraryFolders } = require('./steam');

const now = () => Math.floor(Date.now() / 1000);

// ---------- Sessions de jeu ----------
class Sessions {
  constructor(file) {
    this.file = file;
    try { this.list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.list = []; }
    if (!Array.isArray(this.list)) this.list = [];
    this.open = new Map(); // key -> session en cours
  }
  save() { try { fs.writeFileSync(this.file, JSON.stringify(this.list)); } catch { /* disque plein ? */ } }
  // Appelé à chaque relevé avec les clés des jeux qui tournent.
  tick(runningKeys, names) {
    const t = now();
    let dirty = false;
    for (const key of runningKeys) {
      let s = this.open.get(key);
      if (!s) { s = { key, name: names[key] || key, start: t, end: t }; this.list.push(s); this.open.set(key, s); }
      s.end = t;
      dirty = true;
    }
    for (const [key, s] of this.open) {
      if (runningKeys.includes(key)) continue;
      s.end = t;
      this.open.delete(key);
      dirty = true;
    }
    // On ne garde pas les sessions de moins d'une minute (lancements ratés)
    this.list = this.list.filter((s) => this.open.has(s.key) && s === this.open.get(s.key) || s.end - s.start >= 60);
    if (dirty) this.save();
  }
  totals() {
    const out = {};
    for (const s of this.list) {
      const o = out[s.key] || (out[s.key] = { seconds: 0, last: 0 });
      o.seconds += s.end - s.start;
      o.last = Math.max(o.last, s.end);
    }
    return out;
  }
}

// ---------- Téléchargements Steam ----------
function steamDownloads(steamPath) {
  if (!steamPath) return [];
  const out = [];
  for (const folder of libraryFolders(steamPath)) {
    const dir = path.join(folder, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      const st = get(readVdf(path.join(dir, f)), 'AppState');
      if (!st) continue;
      const toDl = Number(st.BytesToDownload || 0), dl = Number(st.BytesDownloaded || 0);
      const toSt = Number(st.BytesToStage || 0), stg = Number(st.BytesStaged || 0);
      const flags = Number(st.StateFlags || 0);
      const pending = (toDl > dl) || (toSt > stg) || (flags & 2) !== 0;
      if (!pending) continue;
      const total = toDl + toSt;
      out.push({
        key: String(st.appid), name: st.name,
        progress: total ? (dl + stg) / total : 0,
        remaining: Math.max(0, total - dl - stg),
        active: (flags & 1024) !== 0 || (flags & 1048576) !== 0,
      });
    }
  }
  return out;
}

// ---------- Captures Steam ----------
function steamScreenshots(steamPath, accountId, appid) {
  const dir = path.join(steamPath, 'userdata', String(accountId), '760', 'remote', String(appid), 'screenshots');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)); } catch { return []; }
  const url = (p) => 'steamart://local/' + encodeURIComponent(p);
  return files.map((f) => {
    const full = path.join(dir, f);
    const thumb = path.join(dir, 'thumbnails', f);
    let t = 0;
    try { t = Math.floor(fs.statSync(full).mtimeMs / 1000); } catch { /* rien */ }
    return { url: url(full), thumb: fs.existsSync(thumb) ? url(thumb) : url(full), file: full, time: t };
  }).sort((a, b) => b.time - a.time);
}

function screenshotApps(steamPath, accountId) {
  const dir = path.join(steamPath, 'userdata', String(accountId), '760', 'remote');
  try { return fs.readdirSync(dir).filter((d) => /^\d+$/.test(d)); } catch { return []; }
}

// ---------- Actus ----------
const cache = new Map();
async function cached(key, ttlSec, fn) {
  const hit = cache.get(key);
  if (hit && hit.t > now() - ttlSec) return hit.v;
  const v = await fn();
  cache.set(key, { t: now(), v });
  return v;
}

function cleanText(s) {
  return String(s || '')
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, '')
    .replace(/\[\/?[^\]]+\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function news(appid, count = 5) {
  return cached(`news:${appid}:${count}`, 1800, async () => {
    const r = await fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=${count}&maxlength=600&format=json`);
    if (!r.ok) throw new Error(`Actus indisponibles (HTTP ${r.status})`);
    const items = ((await r.json()).appnews || {}).newsitems || [];
    // On écarte les relais de presse dans des alphabets que l'interface n'affiche pas (cyrillique, asiatique)
    const foreign = /[Ѐ-ӿ぀-ヿ一-鿿가-힯]/;
    return items
      .filter((n) => !foreign.test(n.title) && !foreign.test(n.contents || ''))
      .map((n) => ({ title: n.title, url: n.url, date: n.date, feed: n.feedlabel, text: cleanText(n.contents).slice(0, 320), official: n.feed_type === 1 }));
  });
}

// ---------- Succès (clé requise) ----------
async function achievements(apiKey, steamId, appid) {
  if (!apiKey) return { error: 'nokey' };
  return cached(`ach:${appid}`, 300, async () => {
    const base = 'https://api.steampowered.com';
    const [pr, sr, gr] = await Promise.all([
      fetch(`${base}/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&appid=${appid}&l=french`),
      fetch(`${base}/ISteamUserStats/GetSchemaForGame/v2/?key=${encodeURIComponent(apiKey)}&appid=${appid}&l=french`),
      fetch(`${base}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`),
    ]);
    const player = pr.ok ? (await pr.json()).playerstats : null;
    if (!player || player.success === false) {
      return { error: player && player.error ? player.error : `Succès indisponibles (HTTP ${pr.status})` };
    }
    const schema = sr.ok ? ((((await sr.json()).game || {}).availableGameStats || {}).achievements || []) : [];
    const global = gr.ok ? ((((await gr.json()).achievementpercentages || {}).achievements) || []) : [];
    const pct = Object.fromEntries(global.map((a) => [a.name, Number(a.percent)]));
    const sch = Object.fromEntries(schema.map((a) => [a.name, a]));
    const list = (player.achievements || []).map((a) => {
      const s = sch[a.apiname] || {};
      return {
        id: a.apiname, name: a.name || s.displayName || a.apiname, description: a.description || s.description || '',
        achieved: a.achieved === 1, unlocked: a.unlocktime || 0, hidden: s.hidden === 1,
        icon: a.achieved === 1 ? s.icon : s.icongray, global: pct[a.apiname] ?? null,
      };
    });
    return { list, done: list.filter((a) => a.achieved).length, total: list.length };
  });
}

// ---------- Amis (clé requise) ----------
async function friends(apiKey, steamId) {
  if (!apiKey) return { error: 'nokey' };
  return cached('friends', 60, async () => {
    const base = 'https://api.steampowered.com/ISteamUser';
    const fr = await fetch(`${base}/GetFriendList/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&relationship=friend`);
    if (fr.status === 401) return { error: 'Ta liste d’amis est privée : rends-la visible dans tes paramètres de confidentialité Steam' };
    if (!fr.ok) return { error: `Amis indisponibles (HTTP ${fr.status})` };
    const ids = (((await fr.json()).friendslist || {}).friends || []).map((f) => f.steamid);
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const r = await fetch(`${base}/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${ids.slice(i, i + 100).join(',')}`);
      if (!r.ok) continue;
      for (const p of ((await r.json()).response || {}).players || []) {
        out.push({ id: p.steamid, name: p.personaname, avatar: p.avatarmedium, state: p.personastate || 0, gameId: p.gameid ? String(p.gameid) : '', game: p.gameextrainfo || '', lastOff: p.lastlogoff || 0, url: p.profileurl });
      }
    }
    return { list: out };
  });
}

// ---------- Liste de souhaits + promos (sans clé) ----------
async function wishlist(steamId) {
  return cached('wishlist', 900, async () => {
    const r = await fetch(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamId}`);
    if (!r.ok) return { error: `Liste de souhaits indisponible (HTTP ${r.status})` };
    const items = ((await r.json()).response || {}).items || [];
    if (!items.length) return { list: [] };
    const out = [];
    for (let i = 0; i < items.length; i += 100) {
      const input = { ids: items.slice(i, i + 100).map((w) => ({ appid: w.appid })), context: { language: 'french', country_code: 'FR' }, data_request: { include_assets: true } };
      const r2 = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      if (!r2.ok) continue;
      for (const it of ((await r2.json()).response || {}).store_items || []) {
        if (!it.name) continue;
        const a = it.assets || {};
        const fmt = a.asset_url_format || `steam/apps/${it.appid}/\${FILENAME}`;
        const p = it.best_purchase_option || {};
        const w = items.find((x) => x.appid === it.appid) || {};
        out.push({
          appid: it.appid, name: it.name, added: w.date_added || 0,
          header: a.header ? 'https://shared.akamai.steamstatic.com/store_item_assets/' + fmt.replace('${FILENAME}', a.header) : '',
          price: p.formatted_final_price || (it.is_free ? 'Gratuit' : ''),
          original: p.formatted_original_price || '',
          discount: Number(p.discount_pct || 0),
          comingSoon: !!it.is_coming_soon || (!p.formatted_final_price && !it.is_free),
        });
      }
    }
    return { list: out.sort((a, b) => b.discount - a.discount || b.added - a.added) };
  });
}

// ---------- Disques ----------
function disks(games) {
  const roots = new Map();
  for (const g of games) {
    if (!g.installed || !g.installDir) continue;
    const root = path.parse(g.installDir).root.toUpperCase();
    if (!roots.has(root)) roots.set(root, { root, games: 0, used: 0 });
    const d = roots.get(root);
    d.games++;
    d.used += g.sizeOnDisk || 0;
  }
  return [...roots.values()].map((d) => {
    try {
      const s = fs.statfsSync(d.root);
      return { ...d, total: s.blocks * s.bsize, free: s.bavail * s.bsize };
    } catch { return { ...d, total: 0, free: 0 }; }
  }).sort((a, b) => a.root.localeCompare(b.root));
}

module.exports = { Sessions, steamDownloads, steamScreenshots, screenshotApps, news, achievements, friends, wishlist, disks };
