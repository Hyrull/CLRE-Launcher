// Lit le manifeste Ludusavi (YAML, ~17 Mo) hors du processus principal et ne garde
// que les entrées des jeux de la bibliothèque, avec leurs chemins Windows.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const yaml = require('js-yaml');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const { file, games } = workerData; // games: [{ key, name, steamId, gogId }]
const manifest = yaml.load(fs.readFileSync(file, 'utf8'), { json: true });
const bySteam = new Map(), byGog = new Map(), byName = new Map();
for (const [name, e] of Object.entries(manifest)) {
  if (!e || typeof e !== 'object') continue;
  if (e.steam && e.steam.id) bySteam.set(String(e.steam.id), name);
  if (e.gog && e.gog.id) byGog.set(String(e.gog.id), name);
  byName.set(norm(name), name);
}

const out = {};
for (const g of games) {
  const name = (g.steamId && bySteam.get(String(g.steamId))) || (g.gogId && byGog.get(String(g.gogId))) || byName.get(norm(g.name));
  if (!name) continue;
  const e = manifest[name];
  const files = [];
  for (const [pattern, info] of Object.entries(e.files || {})) {
    const when = (info && info.when) || [];
    const windows = !when.length || when.some((w) => !w.os || w.os === 'windows');
    if (!windows) continue;
    const tags = (info && info.tags) || [];
    files.push({ pattern, tags });
  }
  const registry = Object.keys(e.registry || {}).length > 0;
  if (files.length || registry) out[g.key] = { name, files, registry, cloud: e.cloud || {} };
}
parentPort.postMessage(out);
