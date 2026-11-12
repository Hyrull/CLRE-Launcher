// Plateformes supplémentaires : Xbox / Game Pass PC, Battle.net, Riot, Amazon Games, itch.io.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { PS_UTF8, safeLoad, regQueryAsync } = require('./reg');

const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
function base(store, id, name, extra = {}) {
  return {
    key: `${store}:${id}`, store, platformId: String(id), name, developer: '', publisher: '',
    installed: true, needsUpdate: false, sizeOnDisk: 0, installDir: '', library: '',
    playtime: 0, lastPlayed: 0, releaseDate: 0, reviewPct: 0, controller: '', moods: [],
    favorite: false, hidden: false, processNames: [], art: { cover: '', hero: '', logo: '', header: '' },
    ...extra,
  };
}

// Programmes installés (clés Uninstall, 32 et 64 bits, machine et utilisateur)
// Les trois lectures tournent en parallèle et sans bloquer ; le résultat est gardé 5 minutes,
// car Steam déclenche des synchros bien plus souvent que l'on installe un programme.
let uninstallCache = { t: 0, list: null };
async function uninstallEntries() {
  if (uninstallCache.list && Date.now() - uninstallCache.t < 5 * 60 * 1000) return uninstallCache.list;
  const roots = ['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall', 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'];
  const texts = await Promise.all(roots.map((r) => regQueryAsync(r, ['/s']).catch(() => '')));
  const out = [];
  for (const txt of texts) {
    let cur = null;
    for (const line of txt.split(/\r?\n/)) {
      if (/^HKEY_/.test(line)) { cur = { _key: line.trim() }; out.push(cur); continue; }
      const m = line.match(/^\s{4}(.+?)\s{4}REG_\w+\s{4}(.*)$/);
      if (m && cur) cur[m[1]] = m[2].trim();
    }
  }
  uninstallCache = { t: Date.now(), list: out };
  return out;
}

// ---------- Battle.net ----------
const BNET_CODES = { wow: 'WoW', wow_classic: 'WoWC', pro: 'Pro', fenris: 'Fen', osi: 'OSI', hs_beta: 'WTCG', s2: 'S2', s1: 'S1', heroes: 'Hero', d3: 'D3', odin: 'ODIN', w3: 'W3', wlby: 'WLBY', zeus: 'ZEUS', viper: 'VIPR', lazarus: 'LAZR', fore: 'FORE', auks: 'AUKS', rtro: 'RTRO', anbs: 'ANBS', gryphon: 'GRY', spot: 'SPOT', aqua: 'AQUA' };
function loadBattleNet(entries) {
  const client = entries.find((e) => /--uid=battle\.net\b/i.test(e.UninstallString || ''));
  const clientExe = client && client.InstallLocation ? path.join(client.InstallLocation, 'Battle.net.exe') : '';
  return entries.filter((e) => /Blizzard Uninstaller/i.test(e.UninstallString || '') && !/--uid=battle\.net\b/i.test(e.UninstallString || '')).map((e) => {
    const uid = ((e.UninstallString.match(/--uid=([\w-]+)/) || [])[1] || '').toLowerCase();
    const code = BNET_CODES[uid] || BNET_CODES[uid.replace(/_.*$/, '')] || '';
    const dir = e.InstallLocation || '';
    return base('battlenet', uid || e.DisplayName, e.DisplayName, { installed: exists(dir), installDir: dir, library: dir ? path.dirname(dir) : '', bnetCode: code, bnetExe: exists(clientExe) ? clientExe : '' });
  });
}

// ---------- Amazon Games ----------
function loadAmazon(entries) {
  return entries.filter((e) => /Amazon Game Remover/i.test(e.UninstallString || '')).map((e) => {
    const id = (e.UninstallString.match(/-p\s+([\w.-]+)/) || [])[1] || e.DisplayName;
    const dir = e.InstallLocation || '';
    return base('amazon', id, e.DisplayName, { installed: exists(dir), installDir: dir, library: dir ? path.dirname(dir) : '' });
  });
}

// ---------- Riot ----------
const RIOT = {
  league_of_legends: ['League of Legends', ['leagueclient.exe', 'league of legends.exe']],
  valorant: ['VALORANT', ['valorant-win64-shipping.exe', 'valorant.exe']],
  bacon: ['Legends of Runeterra', ['lor.exe']],
  lion: ['2XKO', ['2xko.exe', '2xko-win64-shipping.exe']],
};
function loadRiot() {
  const pd = process.env.ProgramData || 'C:\\ProgramData';
  const meta = path.join(pd, 'Riot Games', 'Metadata');
  let client = '';
  try {
    const j = JSON.parse(fs.readFileSync(path.join(pd, 'Riot Games', 'RiotClientInstalls.json'), 'utf8'));
    client = [j.rc_default, j.rc_live].find(exists) || '';
  } catch { /* client absent */ }
  if (!client && exists('C:\\Riot Games\\Riot Client\\RiotClientServices.exe')) client = 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe';
  let dirs = [];
  try { dirs = fs.readdirSync(meta); } catch { return []; }
  const games = [];
  for (const d of dirs) {
    const m = d.match(/^([a-z_]+)\.live$/);
    if (!m || !RIOT[m[1]]) continue;
    const yaml = path.join(meta, d, `${d}.product_settings.yaml`);
    if (!exists(yaml)) continue; // pas installé
    let dir = '';
    try { dir = ((fs.readFileSync(yaml, 'utf8').match(/product_install_full_path:\s*"([^"]+)"/) || [])[1] || '').replace(/\//g, '\\'); } catch { /* rien */ }
    const [name, procs] = RIOT[m[1]];
    // Le dossier peut rester après une désinstallation : on vérifie aussi le client Riot
    games.push(base('riot', m[1], name, { installed: exists(dir) && !!client, installDir: dir, library: dir ? path.dirname(dir) : '', riotClient: client, processNames: procs }));
  }
  return games;
}

// ---------- itch.io ----------
function loadItch() {
  const apps = path.join(process.env.APPDATA || '', 'itch', 'apps');
  let dirs = [];
  try { dirs = fs.readdirSync(apps, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return []; }
  const games = [];
  for (const d of dirs) {
    const dir = path.join(apps, d.name);
    let r = null;
    try { r = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, '.itch', 'receipt.json.gz'))).toString('utf8')); } catch { continue; }
    const game = (r && r.game) || {};
    let exe = '';
    try {
      const walk = (p, depth) => {
        for (const f of fs.readdirSync(p, { withFileTypes: true })) {
          if (f.isFile() && /\.exe$/i.test(f.name) && !/unins|crash|setup|redist|vc_|dxsetup|ue4prereq/i.test(f.name)) return path.join(p, f.name);
        }
        if (depth < 2) for (const f of fs.readdirSync(p, { withFileTypes: true })) if (f.isDirectory() && f.name !== '.itch') { const x = walk(path.join(p, f.name), depth + 1); if (x) return x; }
        return '';
      };
      exe = walk(dir, 0);
    } catch { /* rien */ }
    games.push(base('itch', game.id || d.name, game.title || d.name, {
      installDir: dir, library: apps, exe, workingDir: exe ? path.dirname(exe) : dir,
      processNames: exe ? [path.basename(exe).toLowerCase()] : [],
      customCover: game.stillCoverUrl || game.coverUrl || '',
    }));
  }
  return games;
}

// ---------- Xbox / Game Pass PC (paquets avec MicrosoftGame.config) ----------
const PS_XBOX = PS_UTF8 + `
$ErrorActionPreference='SilentlyContinue'
$out = foreach ($p in Get-AppxPackage) {
  if ($p.IsFramework -or $p.SignatureKind -eq 'System') { continue }
  $cfg = Join-Path $p.InstallLocation 'MicrosoftGame.config'
  if (-not (Test-Path $cfg)) { continue }
  [xml]$x = Get-Content -Raw $cfg
  $app = (Get-AppxPackageManifest $p).Package.Applications.Application | Select-Object -First 1
  [pscustomobject]@{
    pfn = $p.PackageFamilyName; appId = $app.Id; dir = $p.InstallLocation
    name = $x.Game.ShellVisuals.DefaultDisplayName; publisher = $x.Game.ShellVisuals.PublisherDisplayName
    exe = ($x.Game.ExecutableList.Executable | Select-Object -First 1).Name; storeId = $x.Game.StoreId
  }
}
ConvertTo-Json -Compress @($out)`;
let xboxCache = { t: 0, list: [] };
function loadXbox() {
  return new Promise((resolve) => {
    if (Date.now() - xboxCache.t < 10 * 60 * 1000) return resolve(xboxCache.list);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_XBOX], { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      let raw = [];
      try { raw = JSON.parse(stdout || '[]'); } catch { raw = []; }
      if (!Array.isArray(raw)) raw = [raw];
      const list = raw.filter((x) => x && x.pfn && x.appId && x.name && !/^ms-resource:/i.test(x.name)).map((x) => base('xbox', x.pfn, x.name, {
        installDir: x.dir, library: x.dir ? path.dirname(x.dir) : '', publisher: x.publisher || '',
        aumid: `${x.pfn}!${x.appId}`, storeId: x.storeId || '',
        processNames: x.exe ? [path.basename(String(x.exe)).toLowerCase()] : [],
      }));
      xboxCache = { t: Date.now(), list };
      resolve(list);
    });
  });
}

async function loadMorePlatforms() {
  const xboxP = loadXbox().catch(() => []); // PowerShell (lent) en parallèle du registre
  let entries = [];
  try { entries = await uninstallEntries(); } catch (e) { console.warn('Registre (programmes installés) illisible :', e.message); }
  const sync = [...safeLoad('Battle.net', () => loadBattleNet(entries)), ...safeLoad('Amazon', () => loadAmazon(entries)), ...safeLoad('Riot', loadRiot), ...safeLoad('itch.io', loadItch)];
  return [...sync, ...await xboxP];
}

module.exports = { loadMorePlatforms };
