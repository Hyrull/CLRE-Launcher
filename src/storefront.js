// Magasin Steam dans le style du launcher : données publiques du magasin (aucun compte requis).
// L'achat se fait dans l'appli Steam ; ici on ne fait qu'afficher.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const CC = 'FR';
const cache = new Map();
async function cached(key, ttlSec, fn) {
  const hit = cache.get(key);
  if (hit && hit.t > Date.now() - ttlSec * 1000) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

const ASSET = (fmt, f) => (f ? 'https://shared.akamai.steamstatic.com/store_item_assets/' + fmt.replace('${FILENAME}', f) : '');
function mapItem(it) {
  const a = it.assets || {};
  const fmt = a.asset_url_format || `steam/apps/${it.appid}/\${FILENAME}`;
  const p = it.best_purchase_option || {};
  const r = ((it.reviews || {}).summary_filtered) || {};
  const rel = it.release || {};
  const free = !!(it.is_free || (it.basic_info && it.basic_info.is_free) || p.final_price_in_cents === '0');
  return {
    appid: it.appid, name: it.name || '',
    cover: ASSET(fmt, a.library_capsule_2x || a.library_capsule), capsule: ASSET(fmt, a.main_capsule), header: ASSET(fmt, a.header),
    hero: ASSET(fmt, a.library_hero_2x || a.library_hero), logo: ASSET(fmt, a.library_logo_2x || a.library_logo),
    price: free ? 'Gratuit' : p.formatted_final_price || '', original: p.formatted_original_price || '',
    discount: p.discount_pct || 0, discountEnd: Number(p.active_discounts && p.active_discounts[0] && p.active_discounts[0].discount_end_date) || 0,
    packageid: p.packageid || 0, bundleid: p.bundleid || 0, free,
    reviewPct: r.percent_positive || 0, reviewLabel: r.review_score_label || '', reviewCount: r.review_count || 0,
    release: Number(rel.steam_release_date || rel.original_release_date || 0), comingSoon: !!rel.is_coming_soon, releaseText: rel.custom_release_date_message || rel.coming_soon_display || '',
    tags: it.tagids || [], developer: (((it.basic_info || {}).developers || [])[0] || {}).name || '',
    short: (it.basic_info || {}).short_description || '',
  };
}
// Détails de plusieurs jeux (par lots de 50), mis en cache 30 min
const itemCache = new Map();
async function items(appids) {
  const ids = [...new Set(appids.map(Number).filter(Boolean))];
  const now = Date.now();
  const todo = ids.filter((id) => !itemCache.has(id) || itemCache.get(id).t < now - 30 * 60 * 1000);
  for (let i = 0; i < todo.length; i += 50) {
    const input = {
      ids: todo.slice(i, i + 50).map((appid) => ({ appid })),
      context: { language: 'french', country_code: CC },
      data_request: { include_assets: true, include_basic_info: true, include_release: true, include_reviews: true, include_tag_count: 10 },
    };
    try {
      const r = await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`);
      if (!r.ok) continue;
      for (const it of ((await r.json()).response || {}).store_items || []) if (it.appid && it.success === 1) itemCache.set(it.appid, { t: now, v: mapItem(it) });
    } catch { /* hors ligne */ }
  }
  return ids.map((id) => itemCache.get(id)).filter(Boolean).map((x) => x.v).filter((x) => x.name);
}

async function featured() {
  return cached('featured', 20 * 60, async () => {
    const r = await fetch(`https://store.steampowered.com/api/featuredcategories?cc=${CC}&l=french`);
    if (!r.ok) throw new Error(`Magasin Steam indisponible (HTTP ${r.status})`);
    const f = await r.json();
    const ids = (k) => ((f[k] || {}).items || []).map((x) => x.id);
    const all = await items(['specials', 'top_sellers', 'new_releases', 'coming_soon'].flatMap(ids));
    const by = new Map(all.map((x) => [x.appid, x]));
    const pick = (k) => [...new Set(ids(k))].map((id) => by.get(id)).filter(Boolean);
    return { specials: pick('specials'), top: pick('top_sellers'), fresh: pick('new_releases'), soon: pick('coming_soon') };
  });
}

// Recherche du magasin : texte, tags, promos, gratuits, tri. Renvoie { total, items }
const SORTS = { relevance: '', reviews: 'Reviews_DESC', release: 'Released_DESC', price: 'Price_ASC', name: 'Name_ASC' };
async function search({ term = '', tags = [], specials = false, free = false, sort = 'relevance', start = 0, count = 40 } = {}) {
  const q = new URLSearchParams({ query: '', start: String(start), count: String(count), infinite: '1', json: '1', cc: CC, l: 'french', category1: '998' });
  if (term) q.set('term', term);
  if (tags.length) q.set('tags', tags.join(','));
  if (specials) q.set('specials', '1');
  if (free) q.set('maxprice', 'free');
  if (SORTS[sort]) q.set('sort_by', SORTS[sort]);
  return cached('s:' + q.toString(), 15 * 60, async () => {
    const r = await fetch(`https://store.steampowered.com/search/results/?${q}`, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`Recherche indisponible (HTTP ${r.status})`);
    const j = await r.json();
    const ids = [...new Set([...String(j.results_html || '').matchAll(/data-ds-appid="(\d+)"/g)].map((m) => Number(m[1])))];
    const list = await items(ids);
    const by = new Map(list.map((x) => [x.appid, x]));
    return { total: j.total_count || 0, items: ids.map((id) => by.get(id)).filter(Boolean) };
  });
}

// Pour toi : les jeux les mieux notés dans tes tags favoris, que tu n'as pas
async function forYou(favTags, owned) {
  if (!favTags.length) return [];
  const own = new Set(owned.map(Number));
  const out = [];
  const seen = new Set();
  for (const pair of [favTags.slice(0, 2), favTags.slice(1, 3), [favTags[0]]]) {
    try {
      const r = await search({ tags: pair, sort: 'reviews', count: 50 });
      for (const x of r.items) if (!own.has(x.appid) && !seen.has(x.appid) && x.reviewPct >= 85 && !x.comingSoon) { seen.add(x.appid); out.push(x); }
    } catch { /* suivant */ }
    if (out.length >= 18) break;
  }
  return out.slice(0, 18);
}

module.exports = { featured, search, forYou, items };
