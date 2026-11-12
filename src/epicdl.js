// Installation des jeux Epic sans le Epic Games Launcher, avec Legendary (outil open-source, GPLv3,
// https://github.com/legendary-gl/legendary). Le launcher le télécharge une fois depuis GitHub, vérifie
// son empreinte SHA-256, puis le pilote en ligne de commande. Legendary garde ses données dans
// %APPDATA%\launcher\legendary, séparées d'une éventuelle installation de Legendary ou de Heroic.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { BrowserWindow } = require('electron');

const LEGENDARY = {
  version: '0.21.1',
  url: 'https://github.com/legendary-gl/legendary/releases/download/0.21.1/legendary_windows_x64.exe',
  sha256: '6be77857dc0a6dd33ea7442ce8b5291944ec6da53757f81ca95b57ce794baf5b',
};
// Page de connexion Epic qui finit sur une réponse JSON contenant « authorizationCode »
const REDIRECT = 'https://www.epicgames.com/id/api/redirect?clientId=34a02cf8f4414e29b15921876da36f9a&responseType=code';
const AUTH_URL = `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(REDIRECT)}`;
const OWNED_TTL = 15 * 60e3;
const UPDATE_TTL = 6 * 3600e3;
const MIB = 1024 * 1024;

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

class EpicDl {
  constructor({ dataDir, getDir, onChange, onDone }) {
    this.bin = path.join(dataDir, 'tools', `legendary-${LEGENDARY.version}.exe`);
    this.cfg = path.join(dataDir, 'legendary');
    this.ownedFile = path.join(dataDir, 'epic-owned.json');
    this.queueFile = path.join(dataDir, 'epic-queue.json');
    this.getDir = getDir;
    this.onChange = onChange || (() => {});
    this.onDone = onDone || (() => {});
    this.owned = null;
    this.ownedAt = 0;
    this.refreshing = null;
    this.updates = new Set();
    this.updatesAt = 0;
    this.checking = null;
    try { this.owned = JSON.parse(fs.readFileSync(this.ownedFile, 'utf8')); } catch { this.owned = null; }
    this.current = null; // { job, child }
    try {
      this.jobs = JSON.parse(fs.readFileSync(this.queueFile, 'utf8')).map((j) => ({ ...j, state: j.state === 'error' ? 'error' : 'paused', speed: 0 }));
    } catch { this.jobs = []; }
    // Déjà installés (launcher fermé au mauvais moment) : rien à reprendre
    const inst = this.installedMap();
    this.jobs = this.jobs.filter((j) => j.update || !inst[j.appName]);
  }

  // ---------- Legendary ----------
  hasBin() { return fs.existsSync(this.bin); }

  async ensureBin() {
    if (this.hasBin()) return;
    const r = await fetch(LEGENDARY.url, { headers: { 'User-Agent': 'CLRE-Launcher' } });
    if (!r.ok) throw new Error(`Impossible de télécharger Legendary (HTTP ${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    const sum = crypto.createHash('sha256').update(buf).digest('hex');
    if (sum !== LEGENDARY.sha256) throw new Error('Le fichier Legendary téléchargé ne correspond pas à la version attendue');
    fs.mkdirSync(path.dirname(this.bin), { recursive: true });
    fs.writeFileSync(this.bin + '.part', buf);
    fs.renameSync(this.bin + '.part', this.bin);
  }

  env() {
    fs.mkdirSync(this.cfg, { recursive: true });
    return { ...process.env, LEGENDARY_CONFIG_PATH: this.cfg, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
  }

  spawnLeg(args, onLine) {
    const child = spawn(this.bin, args, { env: this.env(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const errLines = [];
    let rest = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => {
      const lines = (rest + d).split(/\r?\n/);
      rest = lines.pop();
      for (const l of lines) { errLines.push(l); if (errLines.length > 200) errLines.shift(); if (onLine) onLine(l); }
    });
    const done = new Promise((resolve) => {
      child.on('error', (e) => resolve({ code: -1, out, err: [e.message] }));
      child.on('close', (code) => { if (rest) errLines.push(rest); resolve({ code, out, err: errLines }); });
    });
    return { child, done };
  }

  async leg(args) {
    await this.ensureBin();
    return this.spawnLeg(args).done;
  }

  static lastError(err) {
    const l = [...err].reverse().find((x) => /\b(ERROR|CRITICAL|FATAL)\b/.test(x)) || [...err].reverse().find((x) => x.trim()) || '';
    return l.replace(/^\[[^\]]+\]\s*(ERROR|CRITICAL|FATAL|INFO|WARNING):\s*/, '').trim();
  }

  // ---------- Compte ----------
  user() { try { return JSON.parse(fs.readFileSync(path.join(this.cfg, 'user.json'), 'utf8')); } catch { return null; } }
  status() {
    const u = this.user();
    return { connected: !!u, username: (u && u.displayName) || '', dir: this.getDir(), hasTool: this.hasBin() };
  }
  authUrl() { return AUTH_URL; }

  async finishLogin(code) {
    const r = await this.leg(['auth', '--code', code]);
    if (r.code !== 0 || !this.user()) throw new Error(EpicDl.lastError(r.err) || 'Connexion Epic refusée');
    this.owned = null; this.ownedAt = 0;
    return this.status();
  }

  // On accepte la réponse JSON complète, l'adresse, ou juste le code
  loginWithPasted(text) {
    const s = String(text || '').trim();
    let code = '';
    try { code = JSON.parse(s).authorizationCode || ''; } catch { /* pas du JSON */ }
    if (!code) code = (s.match(/authorizationCode["'\s:=]+([0-9a-f]{32})/i) || [])[1] || (/^"?[0-9a-f]{32}"?$/i.test(s) ? s.replace(/"/g, '') : '');
    if (!code) throw new Error('Colle le texte affiché par la page Epic après la connexion (il contient « authorizationCode »)');
    return this.finishLogin(code);
  }

  async login(parent) {
    await this.ensureBin(); // avant la fenêtre : une erreur de téléchargement s'affiche tout de suite
    return new Promise((resolve, reject) => {
      const w = new BrowserWindow({
        parent, modal: !!parent, width: 520, height: 760, autoHideMenuBar: true, title: 'Connexion à Epic Games',
        webPreferences: { partition: 'epic-login', contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      let done = false;
      const grab = async () => {
        const url = w.webContents.getURL();
        if (done || !url.startsWith('https://www.epicgames.com/id/api/redirect')) return;
        let code = '';
        try { code = JSON.parse(await w.webContents.executeJavaScript('document.body.innerText')).authorizationCode || ''; } catch { /* page pas prête */ }
        if (!code) return;
        done = true;
        w.destroy();
        try { resolve(await this.finishLogin(code)); } catch (e) { reject(e); }
      };
      w.webContents.on('did-finish-load', grab);
      w.webContents.on('did-navigate', () => setTimeout(grab, 300));
      w.webContents.setWindowOpenHandler(({ url }) => (/^https:\/\//.test(url)
        ? { action: 'allow', overrideBrowserWindowOptions: { parent: w, width: 520, height: 680, autoHideMenuBar: true, webPreferences: { partition: 'epic-login', sandbox: true } } }
        : { action: 'deny' }));
      w.on('closed', () => { if (!done) { done = true; reject(new Error('Connexion Epic annulée')); } });
      w.loadURL(AUTH_URL);
    });
  }

  async logout() {
    if (this.hasBin()) await this.leg(['auth', '--delete']);
    try { fs.unlinkSync(path.join(this.cfg, 'user.json')); } catch { /* déjà absent */ }
    this.owned = null;
    try { fs.unlinkSync(this.ownedFile); } catch { /* rien */ }
    return this.status();
  }

  // ---------- Bibliothèque ----------
  // Jeux possédés, d'après Legendary. Rend tout de suite la dernière liste connue et rafraîchit en fond.
  ownedGames(onFresh) {
    if (!this.user() || !this.hasBin()) return [];
    if (Date.now() - this.ownedAt > OWNED_TTL && !this.refreshing) {
      this.refreshing = this.leg(['list', '--json']).then((r) => {
        if (r.code !== 0) return;
        const list = JSON.parse(r.out).map((g) => {
          const m = g.metadata || {};
          const attrs = m.customAttributes || {};
          return {
            appName: g.app_name, title: g.app_title, namespace: m.namespace || '', catalogItemId: m.id || '',
            developer: m.developer || '',
            keyImages: (m.keyImages || []).filter((k) => /^(DieselGameBoxTall|OfferImageTall|Thumbnail|DieselGameBox|OfferImageWide|Featured|DieselGameBoxLogo)$/.test(k.type)).map(({ type, url }) => ({ type, url })),
            thirdParty: !!(attrs.ThirdPartyManagedApp && attrs.ThirdPartyManagedApp.value) || !!(attrs.partnerLinkType && attrs.partnerLinkType.value),
          };
        });
        const changed = JSON.stringify(list) !== JSON.stringify(this.owned);
        this.owned = list;
        this.ownedAt = Date.now();
        try { fs.writeFileSync(this.ownedFile, JSON.stringify(list)); } catch { /* rien */ }
        if (changed && onFresh) onFresh();
      }).catch(() => {}).finally(() => { this.refreshing = null; });
    }
    return this.owned || [];
  }

  // Mises à jour des jeux installés par le launcher : Legendary compare la version installée à celle d'Epic
  needsUpdate(appName) { return this.updates.has(appName); }
  checkUpdates(onChange) {
    if (!this.user() || !this.hasBin() || !Object.keys(this.installedMap()).length) return;
    if (this.checking || Date.now() - this.updatesAt < UPDATE_TTL) return;
    this.checking = this.leg(['list-installed', '--check-updates', '--tsv']).then((r) => {
      if (r.code !== 0) return;
      const next = new Set();
      const rows = r.out.split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
      const head = rows.shift() || [];
      const iApp = head.indexOf('App name'), iUpd = head.indexOf('Update available');
      for (const row of rows) if (row[iUpd] === 'True') next.add(row[iApp]);
      const changed = [...next].sort().join('|') !== [...this.updates].sort().join('|');
      this.updates = next;
      this.updatesAt = Date.now();
      if (changed && onChange) onChange();
    }).catch(() => {}).finally(() => { this.checking = null; });
  }

  installedMap() { try { return JSON.parse(fs.readFileSync(path.join(this.cfg, 'installed.json'), 'utf8')) || {}; } catch { return {}; } }
  isInstalled(appName) { return !!this.installedMap()[appName]; }

  // Lancement par Legendary : il fournit au jeu les paramètres de connexion Epic
  launch(appName) {
    if (!this.hasBin()) return;
    const child = spawn(this.bin, ['launch', appName], { env: this.env(), windowsHide: true, detached: true, stdio: 'ignore' });
    child.unref();
  }

  async uninstall(appName) {
    const r = await this.leg(['-y', 'uninstall', appName]);
    if (r.code !== 0 || this.isInstalled(appName)) throw new Error(EpicDl.lastError(r.err) || 'Désinstallation impossible');
  }

  // ---------- File de téléchargement ----------
  list() {
    return this.jobs.map((j) => ({
      key: j.key, name: j.name, store: 'epic', phase: j.state, error: j.error || '',
      progress: j.state === 'installing' ? 1 : j.progress || 0,
      remaining: j.dlSize ? Math.max(0, j.dlSize * (1 - (j.progress || 0))) : 0,
      active: j.state === 'downloading' || j.state === 'installing', speed: j.speed || 0,
    }));
  }
  save() {
    try { fs.writeFileSync(this.queueFile, JSON.stringify(this.jobs.map(({ speed, ...j }) => j), null, 2)); } catch { /* rien */ }
    this.onChange();
  }

  async enqueue(appName, name, opts = {}) {
    if (!this.user()) throw Object.assign(new Error('Connecte ton compte Epic'), { code: 'nologin' });
    await this.ensureBin();
    const o = (this.owned || []).find((x) => x.appName === appName);
    if (o && o.thirdParty) throw new Error('Ce jeu s’installe par un autre launcher (Ubisoft Connect ou EA app)');
    const key = `epic:${appName}`;
    const ex = this.jobs.find((j) => j.key === key);
    if (ex) { if (ex.state !== 'downloading' && ex.state !== 'installing') { ex.state = 'queued'; ex.error = ''; this.save(); this.next(); } return { queued: true }; }
    const root = this.getDir();
    fs.mkdirSync(root, { recursive: true });
    this.jobs.push({ key, appName, name: name || (o && o.title) || appName, state: 'queued', error: '', progress: 0, dlSize: 0, installPath: '', base: root, update: !!opts.update });
    this.save();
    this.next();
    return { queued: true };
  }

  kill(child) { if (child && child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {}); }

  pause(key) {
    const j = this.jobs.find((x) => x.key === key);
    if (!j || j.state === 'installing') return;
    if (this.current && this.current.job === j) { j.stopping = true; this.kill(this.current.child); }
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
    const running = this.current && this.current.job === j;
    if (running) { j.stopping = true; this.kill(this.current.child); }
    this.jobs = this.jobs.filter((x) => x !== j);
    const clean = () => {
      if (j.update || this.isInstalled(j.appName)) return;
      try { if (j.installPath && j.installPath.toLowerCase().startsWith(String(j.base || '').toLowerCase())) fs.rmSync(j.installPath, { recursive: true, force: true }); } catch { /* rien */ }
      try { fs.rmSync(path.join(this.cfg, 'tmp', `${j.appName}.resume`), { force: true }); } catch { /* rien */ }
    };
    if (running) this.current.done.then(() => setTimeout(clean, 500)); else clean();
    this.save();
    this.next();
  }

  next() {
    if (this.current) return;
    const j = this.jobs.find((x) => x.state === 'queued');
    if (!j) return;
    j.stopping = false;
    j.state = 'downloading';
    this.save();
    let lastTick = 0;
    const onLine = (l) => {
      let m;
      if ((m = l.match(/Install path: (.+)$/))) j.installPath = m[1].trim();
      else if ((m = l.match(/Download size: ([\d.]+) MiB/))) j.dlSize = Number(m[1]) * MIB;
      else if ((m = l.match(/= Progress: ([\d.]+)%/))) j.progress = Number(m[1]) / 100;
      else if ((m = l.match(/\+ Download\s+- ([\d.]+) MiB\/s/))) j.speed = Number(m[1]) * MIB;
      else if (/Finished installation process|Download size is 0/.test(l)) { j.state = 'installing'; j.speed = 0; }
      if (Date.now() - lastTick > 1000) { lastTick = Date.now(); this.onChange(); }
    };
    const args = j.update ? ['-y', 'update', j.appName, '--skip-sdl'] : ['-y', 'install', j.appName, '--base-path', j.base || this.getDir(), '--skip-sdl'];
    const { child, done } = this.spawnLeg(args, onLine);
    this.current = { job: j, child, done };
    done.then(async (r) => {
      if (j.stopping) return; // pause ou annulation
      const inst = this.installedMap()[j.appName];
      if (r.code === 0 && inst) {
        j.state = 'installing'; j.speed = 0; this.onChange();
        if (j.update) this.updates.delete(j.appName);
        await this.prereqs(inst).catch(() => { /* le jeu marche souvent sans, on n'échoue pas pour ça */ });
        this.jobs = this.jobs.filter((x) => x !== j);
        this.onDone(j);
      } else {
        j.state = 'error'; j.speed = 0;
        j.error = EpicDl.lastError(r.err) || `Legendary a échoué (code ${r.code})`;
      }
    }).finally(() => { this.current = null; this.save(); this.next(); });
  }

  // Composants requis par le jeu (Visual C++, DirectX…) : Legendary les saute en mode silencieux,
  // on les lance nous-mêmes avec l'autorisation administrateur de Windows.
  prereqs(inst) {
    const p = inst.prereq_info;
    if (!p || !p.path || p.installed) return Promise.resolve();
    const exe = path.join(inst.install_path, p.path);
    if (!fs.existsSync(exe)) return Promise.resolve();
    const ps = `$ErrorActionPreference='Stop'; try { $p = Start-Process -FilePath ${psQuote(exe)} ${p.args ? `-ArgumentList ${psQuote(p.args)}` : ''} -WorkingDirectory ${psQuote(path.dirname(exe))} -Verb RunAs -Wait -PassThru; exit $p.ExitCode } catch { exit 1223 }`;
    return new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true }, () => resolve());
    });
  }
}

module.exports = { EpicDl, LEGENDARY };
