// Mods Steam Workshop installés : steamapps/workshop/appworkshop_<appid>.acf de chaque bibliothèque,
// noms et images via l'API publique GetPublishedFileDetails.
const path = require('path');
const { readVdf, get, libraryFolders } = require('./steam');

const names = new Map();

async function workshopMods(steamPath, appid) {
  const items = [];
  for (const folder of libraryFolders(steamPath)) {
    const acf = get(readVdf(path.join(folder, 'steamapps', 'workshop', `appworkshop_${appid}.acf`)), 'AppWorkshop');
    const installed = get(acf, 'WorkshopItemsInstalled') || {};
    for (const [id, it] of Object.entries(installed)) {
      items.push({ id, size: Number(it.size || 0), updated: Number(it.timeupdated || 0), dir: path.join(folder, 'steamapps', 'workshop', 'content', String(appid), id) });
    }
  }
  const missing = items.filter((i) => !names.has(i.id));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const body = new URLSearchParams({ itemcount: String(batch.length) });
    batch.forEach((b, k) => body.append(`publishedfileids[${k}]`, b.id));
    try {
      const r = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', { method: 'POST', body });
      const list = r.ok ? (((await r.json()).response || {}).publishedfiledetails || []) : [];
      for (const d of list) names.set(d.publishedfileid, { title: d.title || `Mod ${d.publishedfileid}`, preview: d.preview_url || '', subs: d.lifetime_subscriptions || 0 });
    } catch { /* hors ligne : on affichera l'identifiant */ }
  }
  return items.map((i) => ({ ...i, ...(names.get(i.id) || { title: `Mod ${i.id}`, preview: '' }) })).sort((a, b) => b.size - a.size);
}

module.exports = { workshopMods };
