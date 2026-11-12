// Installation des jeux GOG sans GOG Galaxy.
// Connexion : la page de connexion officielle de GOG s'ouvre dans une fenêtre du launcher (identifiants
// publics du client Galaxy, comme Heroic ou Lutris). Le jeton est chiffré par Windows (safeStorage).
// Installation : on télécharge l'installateur hors-ligne du jeu (le même que sur gog.com) puis on le
// lance en mode silencieux. Il s'enregistre dans le registre GOG, donc la synchro le voit tout seul.
const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const { BrowserWindow, safeStorage } = require('electron');

const CLIENT_ID = '46899977096215655';
const CLIENT_SECRET = '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9';
const REDIRECT = 'https://embed.gog.com/on_login_success?origin=client';
const EMBED = 'https://embed.gog.com';
const OWNED_TTL = 10 * 60e3;
const UPDATE_TTL = 6 * 3600e3;

const sizeOf = (s) => {
  const m = String(s || '').replace(',', '.').match(/([\d.]+)\s*([KMGT]?B)/i);
  if (!m) return 0;
  return Number(m[1]) * ({ B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[m[2].toUpperCase()] || 1);
};
const safeName = (s) => String(s).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim() || 'Jeu';
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

class Gog {
  constructor({ dataDir, getDir, onChange, onDone }) {
    this.authFile = path.join(dataDir, 'gog-auth.bin');
    this.queueFile = path.join(dataDir, 'gog-queue.json');
    this.updatesFile = path.join(dataDir, 'gog-updates.json');
    try { this.updates = JSON.parse(fs.readFileSync(this.updatesFile, 'utf8')) || {}; } catch { this.updates = {}; }
    this.getDir = getDir;
    this.onChange = onChange || (() => {});
    this.onDone = onDone || (() => {});
    this.auth = this.readAuth();
    this.owned = null;
    this.ownedAt = 0;
    this.jobs = [];
    this.current = null; // { job, abort }
    try {
      // Les téléchargements interrompus (launcher fermé) reprennent en pause
      this.jobs = JSON.parse(fs.readFileSync(this.queueFile, 'utf8')).map((j) => ({ ...j, state: j.state === 'error' ? 'error' : 'paused', speed: 0 }));
    } catch { this.jobs = []; }
    // Installations marquées en échec alors que le jeu est bien là : on les retire et on nettoie
    this.jobs = this.jobs.filter((j) => {
      if (!(j.installDir && Gog.installed(j.installDir, j.id))) return true;
      try { fs.rmSync(j.dlDir, { recursive: true, force: true }); } catch { /* rien */ }
      return false;
    });
  }

  // ---------- Compte ----------
  readAuth() {
    try {
      const buf = fs.readFileSync(this.authFile);
      const txt = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
      return JSON.parse(txt);
    } catch { return null; }
  }
  writeAuth(a) {
    this.auth = a;
    if (!a) { try { fs.unlinkSync(this.authFile); } catch { /* déjà absent */ } return; }
    const txt = JSON.stringify(a);
    fs.writeFileSync(this.authFile, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(txt) : Buffer.from(txt));
  }
  status() {
    return { connected: !!this.auth, username: (this.auth && this.auth.username) || '', dir: this.getDir() };
  }

  async tokenRequest(params) {
    const q = new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params });
    const r = await fetch(`https://auth.gog.com/token?${q}`);
    if (!r.ok) throw new Error(`GOG a refusé la connexion (HTTP ${r.status})`);
    const j = await r.json();
    if (!j.access_token) throw new Error('Réponse de GOG inattendue');
    return { access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in || 3600) * 1000 - 60e3, userId: j.user_id };
  }

  async token() {
    if (!this.auth) throw Object.assign(new Error('Connecte ton compte GOG'), { code: 'nologin' });
    if (Date.now() < this.auth.expires) return this.auth.access;
    try {
      const t = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.auth.refresh });
      this.writeAuth({ ...this.auth, ...t });
      return t.access;
    } catch (e) {
      if (/HTTP 4\d\d/.test(e.message)) { this.writeAuth(null); throw Object.assign(new Error('Ta connexion GOG a expiré, reconnecte-toi'), { code: 'nologin' }); }
      throw e;
    }
  }

  async api(url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${await this.token()}` } });
    if (!r.ok) throw new Error(`GOG indisponible (HTTP ${r.status})`);
    return r.json();
  }

  authUrl() {
    return `https://auth.gog.com/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&layout=client2`;
  }

  // Fin de connexion commune : le code vient de la fenêtre intégrée ou de l'adresse collée après le navigateur
  async finishLogin(code) {
    const t = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT });
    this.writeAuth(t);
    let username = '';
    try { username = (await this.api(`${EMBED}/userData.json`)).username || ''; } catch { /* pas grave */ }
    this.writeAuth({ ...t, username });
    this.owned = null;
    return this.status();
  }

  // Connexion dans le navigateur : on accepte l'adresse finale entière ou juste le code
  loginWithPasted(text) {
    const s = String(text || '').trim();
    let code = '';
    try { code = new URL(s).searchParams.get('code') || ''; } catch { code = /^[\w-]{20,}$/.test(s) ? s : ''; }
    if (!code) throw new Error('Colle l’adresse complète de la page GOG affichée après la connexion');
    return this.finishLogin(code);
  }

  login(parent) {
    return new Promise((resolve, reject) => {
      const w = new BrowserWindow({
        parent, modal: !!parent, width: 520, height: 720, autoHideMenuBar: true, title: 'Connexion à GOG',
        webPreferences: { partition: 'gog-login', contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      let done = false;
      const check = async (url) => {
        if (done || !String(url).startsWith('https://embed.gog.com/on_login_success')) return;
        done = true;
        const code = new URL(url).searchParams.get('code');
        w.destroy();
        if (!code) return reject(new Error('Connexion GOG annulée'));
        try { resolve(await this.finishLogin(code)); } catch (e) { reject(e); }
      };
      for (const ev of ['will-redirect', 'will-navigate', 'did-navigate']) w.webContents.on(ev, (_e, url) => check(url));
      // Les connexions externes (Facebook, Discord…) s'ouvrent dans une fenêtre surgissante : on la laisse s'ouvrir.
      // Google refuse les fenêtres intégrées : pour lui, il faut passer par le navigateur.
      w.webContents.setWindowOpenHandler(({ url }) => (/^https:\/\//.test(url)
        ? { action: 'allow', overrideBrowserWindowOptions: { parent: w, width: 520, height: 680, autoHideMenuBar: true, webPreferences: { partition: 'gog-login', sandbox: true } } }
        : { action: 'deny' }));
      w.webContents.on('did-create-window', (child) => {
        for (const ev of ['will-redirect', 'will-navigate', 'did-navigate']) child.webContents.on(ev, (_e, url) => check(url));
      });
      w.on('closed', () => { if (!done) { done = true; reject(new Error('Connexion GOG annulée')); } });
      w.loadURL(this.authUrl());
    });
  }

  logout() { this.writeAuth(null); this.owned = null; return this.status(); }

  // ---------- Bibliothèque ----------
  // Jeux Windows possédés sur le compte : [{ id, title }]. Garde le dernier résultat en cas d'échec.
  async ownedGames() {
    if (!this.auth) return [];
    if (this.owned && Date.now() - this.ownedAt < OWNED_TTL) return this.owned;
    try {
      const out = [];
      for (let page = 1, pages = 1; page <= pages && page <= 50; page++) {
        const j = await this.api(`${EMBED}/account/getFilteredProducts?mediaType=1&sortBy=title&page=${page}`);
        pages = j.totalPages || 1;
        for (const p of j.products || []) if (p.worksOn && p.worksOn.Windows) out.push({ id: String(p.id), title: p.title });
      }
      this.owned = out;
      this.ownedAt = Date.now();
    } catch { /* hors ligne : on garde l'ancienne liste */ }
    return this.owned || [];
  }

  async installerFiles(id) {
    const d = await this.api(`${EMBED}/account/gameDetails/${id}.json`);
    // GOG renvoie une liste vide quand le jeu n'est pas sur le compte connecté
    if (Array.isArray(d) || !d.title) throw new Error(`Ce jeu n’est pas sur ton compte GOG${this.auth && this.auth.username ? ` (${this.auth.username})` : ''}`);
    const pickWin = (downloads) => {
      const langs = (downloads || []).filter((x) => Array.isArray(x) && x[1] && (x[1].windows || []).length);
      const pick = langs.find(([l]) => /fran/i.test(l)) || langs.find(([l]) => /english/i.test(l)) || langs[0];
      return pick ? pick[1].windows : [];
    };
    const base = pickWin(d.downloads);
    if (!base.length) throw new Error('Pas d’installateur Windows pour ce jeu');
    // Groupe 0 : le jeu ; groupes suivants : les DLC possédés, installés dans le même dossier
    const files = base.map((f) => ({ url: f.manualUrl, size: sizeOf(f.size), name: f.name, group: 0 }));
    (d.dlcs || []).forEach((dlc, i) => {
      for (const f of pickWin(dlc.downloads)) files.push({ url: f.manualUrl, size: sizeOf(f.size), name: dlc.title || f.name, group: i + 1 });
    });
    return { title: d.title, version: base[0].version || '', dlcs: (d.dlcs || []).length, files };
  }

  // ---------- Mises à jour ----------
  // On compare le build installé (registre GOG) avec le dernier build public, et la version installée avec
  // celle de l'installateur hors-ligne : on ne propose une mise à jour que si l'installateur téléchargeable
  // est vraiment différent de ce qui est installé.
  updateFlag(id) { const u = this.updates[String(id)]; return !!(u && u.update); }

  async checkUpdates(games) {
    if (!this.auth) return false;
    let changed = false;
    for (const g of games) {
      const id = String(g.platformId);
      const c = this.updates[id];
      if (!g.buildId || (c && c.buildId === g.buildId && Date.now() - c.t < UPDATE_TTL)) continue;
      try {
        const b = await (await fetch(`https://content-system.gog.com/products/${id}/os/windows/builds?generation=2`)).json();
        const latest = (b.items || []).find((x) => !x.branch);
        let update = false;
        if (latest && String(latest.build_id) !== String(g.buildId)) {
          const info = await this.installerFiles(id).catch(() => null);
          update = !!(info && info.version && info.version !== g.ver);
        }
        if (!!(c && c.update) !== update) changed = true;
        this.updates[id] = { t: Date.now(), buildId: g.buildId, update };
      } catch { /* hors ligne */ }
    }
    try { fs.writeFileSync(this.updatesFile, JSON.stringify(this.updates)); } catch { /* rien */ }
    return changed;
  }

  // ---------- File de téléchargement ----------
  list() {
    return this.jobs.map((j) => {
      const total = j.total || 1;
      return {
        key: j.key, name: j.name, store: 'gog', phase: j.state, error: j.error || '',
        progress: j.state === 'installing' ? 1 : Math.min(1, j.bytes / total),
        remaining: Math.max(0, total - j.bytes), active: j.state === 'downloading' || j.state === 'installing', speed: j.speed || 0,
      };
    });
  }
  save() {
    try { fs.writeFileSync(this.queueFile, JSON.stringify(this.jobs.map(({ speed, ...j }) => j), null, 2)); } catch { /* rien */ }
    this.onChange();
  }

  async enqueue(id, name, opts = {}) {
    id = String(id);
    const key = `gog:${id}`;
    const ex = this.jobs.find((j) => j.key === key);
    if (ex) { if (ex.state !== 'downloading' && ex.state !== 'installing') { ex.state = 'queued'; ex.error = ''; this.save(); this.next(); } return { queued: true, dir: ex.installDir }; }
    const info = await this.installerFiles(id);
    const root = this.getDir();
    const total = info.files.reduce((s, f) => s + f.size, 0);
    fs.mkdirSync(root, { recursive: true });
    const free = (() => { try { const s = fs.statfsSync(root); return s.bavail * s.bsize; } catch { return null; } })();
    // Installateur + jeu installé : il faut environ deux fois la taille
    const need = total * (opts.installDir ? 1.1 : 2.1);
    if (free != null && total && free < need) throw new Error(`Pas assez de place sur ${path.parse(root).root} : il faut environ ${Math.ceil(need / 1e9)} Go`);
    const title = name || info.title;
    const job = {
      key, id, name: title, state: 'queued', error: '', bytes: 0, total, update: !!opts.installDir,
      dlDir: path.join(root, '.clre-downloads', id), installDir: opts.installDir || path.join(root, safeName(title)),
      files: info.files.map((f) => ({ ...f, done: false, got: 0 })),
    };
    this.jobs.push(job);
    this.save();
    this.next();
    return { queued: true, dir: job.installDir };
  }

  pause(key) {
    const j = this.jobs.find((x) => x.key === key);
    if (!j || j.state === 'installing') return;
    if (this.current && this.current.job === j) this.current.abort.abort();
    j.state = 'paused'; j.speed = 0;
    this.save();
  }
  resume(key) {
    const j = this.jobs.find((x) => x.key === key);
    if (!j || j.state === 'downloading' || j.state === 'installing') return;
    j.state = 'queued'; j.error = '';
    this.save();
    this.next();
  }
  cancel(key) {
    const j = this.jobs.find((x) => x.key === key);
    if (!j || j.state === 'installing') return;
    if (this.current && this.current.job === j) this.current.abort.abort();
    this.jobs = this.jobs.filter((x) => x !== j);
    try { fs.rmSync(j.dlDir, { recursive: true, force: true }); } catch { /* rien */ }
    this.save();
    this.next();
  }

  next() {
    if (this.current) return;
    const j = this.jobs.find((x) => x.state === 'queued');
    if (!j) return;
    const abort = new AbortController();
    this.current = { job: j, abort };
    this.run(j, abort.signal)
      .catch((e) => {
        if (abort.signal.aborted) return; // pause ou annulation
        j.state = 'error'; j.error = e.message; j.speed = 0;
      })
      .finally(() => {
        // Annulé pendant le travail : on nettoie ce qui a pu être recréé entre-temps
        if (!this.jobs.includes(j)) { try { fs.rmSync(j.dlDir, { recursive: true, force: true }); } catch { /* rien */ } }
        this.current = null; this.save(); this.next();
      });
  }

  async run(j, signal) {
    j.state = 'downloading';
    this.save();
    fs.mkdirSync(j.dlDir, { recursive: true });
    for (const f of j.files) {
      if (f.done) continue;
      await this.download(j, f, signal);
      f.done = true;
      this.save();
    }
    j.state = 'installing'; j.speed = 0;
    this.save();
    // Un installateur par groupe (jeu puis DLC) : le premier .exe du groupe, les .bin l'accompagnent
    const groups = [...new Set(j.files.map((f) => f.group || 0))];
    const setups = groups.map((gr) => j.files.filter((f) => (f.group || 0) === gr).map((f) => f.path).find((p) => /\.exe$/i.test(p))).filter(Boolean);
    if (!setups.length) throw new Error('Installateur introuvable dans le téléchargement');
    await this.install(setups, j.installDir, j.id);
    try { fs.rmSync(j.dlDir, { recursive: true, force: true }); } catch { /* rien */ }
    this.jobs = this.jobs.filter((x) => x !== j);
    if (j.update) {
      this.updates[j.id] = { t: Date.now(), buildId: '', update: false };
      try { fs.writeFileSync(this.updatesFile, JSON.stringify(this.updates)); } catch { /* rien */ }
    }
    this.onDone(j);
  }

  async download(j, f, signal) {
    const t = await this.token();
    const head = { Authorization: `Bearer ${t}` };
    // Le lien GOG redirige vers le CDN ; le nom du fichier est dans l'adresse finale
    const have = f.path && fs.existsSync(f.path) ? fs.statSync(f.path).size : 0;
    const r = await fetch(`${EMBED}${f.url}`, { headers: have ? { ...head, Range: `bytes=${have}-` } : head, signal });
    if (!r.ok) throw new Error(`Téléchargement refusé par GOG (HTTP ${r.status})`);
    const partial = r.status === 206;
    if (!f.path) f.path = path.join(j.dlDir, safeName(decodeURIComponent(path.basename(new URL(r.url).pathname))) || `setup-${j.id}.exe`);
    const len = Number(r.headers.get('content-length') || 0);
    const start = partial ? have : 0;
    if (len) {
      // La vraie taille remplace l'estimation (« 1.2 GB ») dans le total
      j.total += start + len - f.size;
      f.size = start + len;
    }
    j.bytes += start - f.got;
    f.got = start;
    let last = Date.now(), lastBytes = j.bytes;
    const count = new Transform({
      transform: (chunk, _enc, cb) => {
        f.got += chunk.length; j.bytes += chunk.length;
        const now = Date.now();
        if (now - last > 1000) { j.speed = ((j.bytes - lastBytes) * 1000) / (now - last); last = now; lastBytes = j.bytes; this.onChange(); }
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(r.body), count, fs.createWriteStream(f.path, { flags: partial ? 'a' : 'w' }), { signal });
  }

  // L'installateur GOG (Inno Setup) demande les droits administrateur : Windows affiche sa fenêtre d'autorisation.
  // Un jeu GOG installé contient toujours goggame-<id>.info : c'est la vraie preuve de réussite.
  // Certains installateurs finissent avec un code non nul (ex. 0xC000013A) alors que tout s'est bien passé.
  static installed(dir, id) { return fs.existsSync(path.join(dir, `goggame-${id}.info`)); }

  // Lance un script PowerShell avec les droits administrateur : une seule autorisation Windows pour tout le script.
  // Renvoie le code de sortie (1223 = autorisation refusée).
  static elevated(script) {
    const inner = Buffer.from(script, 'utf16le').toString('base64');
    const ps = `$ErrorActionPreference='Stop'; try { $p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand',${psQuote(inner)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { exit 1223 }`;
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true }, (err) => resolve(err ? err.code : 0));
    });
  }

  async install(setups, dir, id) {
    const args = `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /NOICONS /DIR="${dir}"`;
    const script = setups.map((s) => `$p = Start-Process -FilePath ${psQuote(s)} -ArgumentList ${psQuote(args)} -Wait -PassThru; if ($null -eq $first) { $first = $p.ExitCode }`).join('\n') + '\nexit $first';
    const code = await Gog.elevated(script);
    if (Gog.installed(dir, id) || !code) return;
    throw new Error(code === 1223 ? 'Installation annulée : Windows n’a pas eu l’autorisation' : `L’installateur a échoué (code ${code})`);
  }

  // Désinstallation sans GOG Galaxy : désinstalleurs Inno du jeu et des DLC (unins000.exe, unins001.exe…),
  // puis on retire du registre GOG les entrées restantes du jeu et de ses DLC.
  async uninstall(dir, id) {
    id = String(id);
    let unins = [];
    try { unins = fs.readdirSync(dir).filter((f) => /^unins\d+\.exe$/i.test(f)).sort().reverse(); } catch { /* dossier absent */ }
    const info = path.join(dir, `goggame-${id}.info`);
    const reg = `if (-not (Test-Path -LiteralPath ${psQuote(info)})) { Get-ChildItem 'HKLM:\\SOFTWARE\\WOW6432Node\\GOG.com\\Games' -ErrorAction SilentlyContinue | Where-Object { $v = Get-ItemProperty -LiteralPath $_.PSPath; $v.gameID -eq '${id}' -or $v.dependsOn -eq '${id}' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }`;
    if (!unins.length) {
      if (fs.existsSync(info)) throw new Error('Désinstalleur GOG introuvable dans le dossier du jeu');
      await Gog.elevated(reg); // dossier déjà supprimé à la main : on nettoie juste le registre
      return;
    }
    const script = [...unins.map((u) => `Start-Process -FilePath ${psQuote(path.join(dir, u))} -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -Wait`), reg].join('\n');
    const code = await Gog.elevated(script);
    if (fs.existsSync(info)) throw new Error(code === 1223 ? 'Désinstallation annulée : Windows n’a pas eu l’autorisation' : 'La désinstallation a échoué');
    try { if (!fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { /* rien */ }
  }
}

module.exports = { Gog };
