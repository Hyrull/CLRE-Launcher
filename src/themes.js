// Thèmes du launcher : un dossier par thème, avec un theme.json, un CSS facultatif et ses fichiers.
// - Thèmes intégrés : src/themes/<id>/   - Thèmes de la communauté : <userData>/themes/<id>/
// Un thème ne contient que du CSS et des fichiers statiques : aucun JavaScript n'est exécuté.
// Ses fichiers sont servis par le protocole clre-theme://<id>/<chemin>, limité au dossier du thème.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { readJsonSafe } = require('./fsutil');
const { readZip } = require('./zip');

const API_VERSION = 1;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VAR_RE = /^--[a-z0-9-]{1,60}$/;
const SERVED = new Set(['.css', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.woff', '.woff2', '.ttf', '.otf']);
const MIME = { '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const DEFAULT_ID = 'graphite';
// Fichiers acceptés dans une archive de thème (le reste est ignoré à l'installation)
const ARCHIVE_OK = new Set([...SERVED, '.json', '.md', '.txt']);
// Le catalogue et les archives ne viennent que de GitHub (dépôt public du catalogue)
const CATALOG_HOSTS = new Set(['raw.githubusercontent.com', 'github.com', 'objects.githubusercontent.com', 'codeload.github.com', 'release-assets.githubusercontent.com']);
const CATALOG_TTL = 10 * 60e3;

// Comparaison de versions : « 1.2.10 » est plus récent que « 1.2.9 »
function newer(a, b) {
  const pa = String(a || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
const slug = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function fetchLimited(fetchFn, url, maxBytes) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !CATALOG_HOSTS.has(u.hostname)) throw new Error(`Adresse refusée : ${u.hostname}`);
  const res = await fetchFn(u.href, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  if (res.url && !CATALOG_HOSTS.has(new URL(res.url).hostname)) throw new Error('Redirection refusée');
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error('Fichier trop gros');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('Fichier trop gros');
  return { buf, type: res.headers.get('content-type') || '' };
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Une valeur de variable ne doit pas pouvoir sortir de la déclaration ni de la balise <style>.
const safeValue = (v) => typeof v === 'string' && v.length <= 400 && !/[;{}<>\\]|\/\*|\*\//.test(v);

function cleanVars(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) if (VAR_RE.test(k) && safeValue(v)) out[k] = v.trim();
  return out;
}

// Lit et valide un theme.json. Renvoie null si le dossier n'est pas un thème.
function readManifest(dir, id, builtin) {
  const raw = readJsonSafe(path.join(dir, 'theme.json'), null);
  if (!raw || typeof raw !== 'object') return null;
  const apiVersion = Number(raw.apiVersion) || 1;
  const schemes = {};
  if (raw.schemes && typeof raw.schemes === 'object') {
    for (const [name, vars] of Object.entries(raw.schemes).slice(0, 24)) {
      const n = str(name, 40);
      if (n) schemes[n] = cleanVars(vars);
    }
  }
  if (!Object.keys(schemes).length) schemes.default = {};
  const options = (Array.isArray(raw.options) ? raw.options : []).slice(0, 16)
    .filter((o) => o && ID_RE.test(String(o.id || '')) && o.type === 'toggle')
    .map((o) => ({ id: o.id, type: 'toggle', label: str(o.label, 60) || o.id, default: !!o.default }));
  const css = str(raw.css, 120) || (fs.existsSync(path.join(dir, 'theme.css')) ? 'theme.css' : '');
  const preview = str(raw.preview, 120) || (fs.existsSync(path.join(dir, 'preview.png')) ? 'preview.png' : '');
  return {
    id, builtin,
    name: str(raw.name, 60) || id,
    author: str(raw.author, 60),
    version: str(raw.version, 20),
    description: str(raw.description, 200),
    apiVersion,
    compatible: apiVersion <= API_VERSION,
    colorScheme: raw.colorScheme === 'light' ? 'light' : 'dark',
    // Matière de fenêtre de Windows 11 (Mica, Acrylique, Mica à onglets) ; ignorée ailleurs
    windowMaterial: ['mica', 'acrylic', 'tabbed'].includes(raw.windowMaterial) ? raw.windowMaterial : 'none',
    // Un jeu de couleurs peut changer le mode clair/sombre : { "Sombre": "dark" }
    schemeColorSchemes: Object.fromEntries(Object.entries(raw.schemeColorSchemes && typeof raw.schemeColorSchemes === 'object' ? raw.schemeColorSchemes : {})
      .filter(([, v]) => v === 'light' || v === 'dark').map(([k, v]) => [str(k, 40), v])),
    schemes, options,
    css: css && SERVED.has(path.extname(css).toLowerCase()) ? css : '',
    preview,
  };
}

class Themes {
  constructor({ builtinDir, userDir, getPrefs, setPrefs, safeMode, fetch: fetchFn, catalogUrl, materialSupported }) {
    this.builtinDir = builtinDir;
    this.materialSupported = !!materialSupported; // Mica & co : Windows 11 22H2 et plus
    this.fetch = fetchFn;
    this.catalogUrl = catalogUrl; // () => adresse du index.json du catalogue
    this.catalogCache = null;
    this.rev = 0;
    this.watcher = null;
    this.userDir = userDir;
    this.getPrefs = getPrefs; // () => { theme, scheme, options }
    this.setPrefs = setPrefs;
    this.safeMode = !!safeMode;
    try { fs.mkdirSync(userDir, { recursive: true }); } catch { /* lecture seule : pas de thèmes perso */ }
  }

  // Dossier d'un thème : un thème perso du même id remplace le thème intégré.
  dirOf(id) {
    if (!ID_RE.test(String(id))) return null;
    for (const [root, builtin] of [[this.userDir, false], [this.builtinDir, true]]) {
      const d = path.join(root, id);
      if (fs.existsSync(path.join(d, 'theme.json'))) return { dir: d, builtin };
    }
    return null;
  }

  list() {
    const seen = new Map();
    for (const [root, builtin] of [[this.builtinDir, true], [this.userDir, false]]) {
      let names = [];
      try { names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { continue; }
      for (const id of names) {
        if (!ID_RE.test(id)) continue;
        const m = readManifest(path.join(root, id), id, builtin);
        if (m) seen.set(id, m);
      }
    }
    return [...seen.values()].sort((a, b) => (a.id === DEFAULT_ID ? -1 : b.id === DEFAULT_ID ? 1 : a.name.localeCompare(b.name, 'fr')));
  }

  // Ce que la page applique au démarrage : le CSS à charger et les variables du jeu de couleurs.
  active() {
    const p = this.getPrefs() || {};
    const base = { id: DEFAULT_ID, scheme: 'default', vars: {}, css: '', options: [], colorScheme: 'dark', windowMaterial: 'none', safeMode: this.safeMode };
    if (this.safeMode) return base;
    const found = this.dirOf(p.theme || DEFAULT_ID);
    const m = found && readManifest(found.dir, p.theme || DEFAULT_ID, found.builtin);
    if (!m || !m.compatible) return base;
    const scheme = m.schemes[p.scheme] ? p.scheme : Object.keys(m.schemes)[0];
    const chosen = p.options && typeof p.options === 'object' ? p.options : {};
    return {
      id: m.id,
      scheme,
      // Le premier jeu de couleurs (ou « default ») sert de base aux autres, qui n'en changent qu'une partie.
      vars: { ...(m.schemes.default || m.schemes[Object.keys(m.schemes)[0]] || {}), ...m.schemes[scheme] },
      // ?v= change à chaque modification du dossier : la page recharge la feuille (rechargement à chaud)
      css: m.css ? `clre-theme://${m.id}/${m.css}${this.rev ? `?v=${this.rev}` : ''}` : '',
      options: m.options.filter((o) => (o.id in chosen ? !!chosen[o.id] : o.default)).map((o) => o.id),
      colorScheme: m.schemeColorSchemes[scheme] || m.colorScheme,
      windowMaterial: this.materialSupported ? m.windowMaterial : 'none',
      safeMode: false,
    };
  }

  set({ id, scheme, options } = {}) {
    if (!this.dirOf(id)) throw new Error('Thème introuvable');
    const prev = this.getPrefs() || {};
    const sameTheme = prev.theme === id;
    this.setPrefs({
      theme: id,
      scheme: str(scheme, 40) || (sameTheme ? prev.scheme : '') || '',
      options: options && typeof options === 'object' ? Object.fromEntries(Object.entries(options).filter(([k]) => ID_RE.test(k)).map(([k, v]) => [k, !!v])) : (sameTheme ? prev.options : {}) || {},
    });
    this.safeMode = false;
    return this.active();
  }

  reset() { this.setPrefs({ theme: DEFAULT_ID, scheme: '', options: {} }); this.safeMode = false; }

  // ---------- Rechargement à chaud : on surveille le dossier du thème actif ----------
  watch(onChange) {
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    if (onChange) this.onChange = onChange;
    const found = !this.safeMode && this.dirOf((this.getPrefs() || {}).theme || DEFAULT_ID);
    if (!found || !this.onChange) return;
    let t = null;
    try {
      // Chemin long réel : sous Windows, surveiller un chemin court (CLMENT~1) fait planter libuv
      this.watcher = fs.watch(fs.realpathSync.native(found.dir), { recursive: true }, () => {
        clearTimeout(t);
        t = setTimeout(() => { this.rev++; this.onChange(this.active()); }, 150);
      });
      this.watcher.on('error', () => { if (this.watcher) this.watcher.close(); this.watcher = null; });
    } catch { this.watcher = null; }
  }

  // ---------- Installation depuis une archive .zip ----------
  // Le thème peut être à la racine de l'archive ou dans un seul dossier (cas des .zip de GitHub).
  installZip(buf, { expectedId, sourceName } = {}) {
    const entries = readZip(buf);
    const manifestEntry = entries
      .filter((e) => /(^|\/)theme\.json$/.test(e.name))
      .sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
    if (!manifestEntry) throw new Error('Pas de theme.json dans l’archive');
    const prefix = manifestEntry.name.slice(0, -'theme.json'.length);
    let manifest;
    try { manifest = JSON.parse(manifestEntry.data.toString('utf8')); } catch { throw new Error('theme.json illisible'); }
    const id = ID_RE.test(String(manifest.id || '')) ? manifest.id : slug(manifest.name || prefix.replace(/\/$/, '').split('/').pop() || sourceName);
    if (!ID_RE.test(id)) throw new Error('Identifiant de thème invalide');
    if (expectedId && id !== expectedId) throw new Error('L’archive ne correspond pas au thème attendu');
    if (fs.existsSync(path.join(this.builtinDir, id))) throw new Error(`« ${id} » est le nom d’un thème intégré`);

    // Extraction dans un dossier temporaire, puis remplacement de l'ancienne version d'un coup
    const tmp = path.join(this.userDir, `.install-${id}-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      for (const e of entries) {
        if (!e.name.startsWith(prefix)) continue;
        const rel = e.name.slice(prefix.length);
        if (!rel || rel.split('/').some((seg) => !seg || seg === '..' || seg === '.' || /[:<>|?*"]/.test(seg))) continue;
        if (!ARCHIVE_OK.has(path.extname(rel).toLowerCase())) continue;
        const dest = path.resolve(tmp, rel);
        if (!dest.startsWith(path.resolve(tmp) + path.sep)) continue;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, e.data);
      }
      if (!readManifest(tmp, id, false)) throw new Error('theme.json invalide');
      const final = path.join(this.userDir, id);
      const active = (this.getPrefs() || {}).theme === id;
      if (active && this.watcher) { this.watcher.close(); this.watcher = null; } // libère le dossier sous Windows
      const old = fs.existsSync(final) ? `${final}.old-${Date.now()}` : null;
      if (old) fs.renameSync(final, old);
      fs.renameSync(tmp, final);
      if (old) fs.rmSync(old, { recursive: true, force: true });
      if (this.catalogCache) this.catalogCache.at = 0;
      if (active) { this.rev++; this.watch(); }
      return readManifest(final, id, false);
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
  }

  // Dossier d'un thème de la communauté à supprimer ; les intégrés ne se suppriment pas.
  removeDir(id) {
    const found = this.dirOf(id);
    if (!found || found.builtin) throw new Error('Ce thème ne peut pas être supprimé');
    if ((this.getPrefs() || {}).theme === id) this.reset();
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    return found.dir;
  }

  // ---------- Catalogue de la communauté (index.json d'un dépôt GitHub public) ----------
  async catalog({ force } = {}) {
    const url = this.catalogUrl ? this.catalogUrl() : '';
    if (!url) return { url: '', themes: [], error: 'Aucun catalogue configuré' };
    if (!force && this.catalogCache && this.catalogCache.url === url && Date.now() - this.catalogCache.at < CATALOG_TTL) return this.decorate(this.catalogCache);
    const { buf } = await fetchLimited(this.fetch, url, 1024 * 1024);
    let raw;
    try { raw = JSON.parse(buf.toString('utf8')); } catch { throw new Error('Catalogue illisible'); }
    const themes = (Array.isArray(raw.themes) ? raw.themes : []).slice(0, 300)
      .filter((t) => t && ID_RE.test(String(t.id || '')) && /^[a-f0-9]{64}$/.test(String(t.sha256 || '')) && typeof t.download === 'string')
      .map((t) => ({
        id: t.id,
        name: str(t.name, 60) || t.id,
        author: str(t.author, 60),
        version: str(t.version, 20),
        description: str(t.description, 200),
        apiVersion: Number(t.apiVersion) || 1,
        download: t.download,
        sha256: t.sha256,
        previewUrl: typeof t.preview === 'string' ? t.preview : '',
        preview: '',
      }));
    // Les aperçus passent par le launcher (data:) : la page n'a pas le droit de charger d'images distantes.
    await Promise.all(themes.map(async (t) => {
      if (!t.previewUrl) return;
      try {
        const { buf: img, type } = await fetchLimited(this.fetch, t.previewUrl, 1024 * 1024);
        const mime = /^image\/(png|jpeg|webp|gif)/.exec(type);
        if (mime) t.preview = `data:${mime[0]};base64,${img.toString('base64')}`;
      } catch { /* aperçu manquant : pas grave */ }
    }));
    this.catalogCache = { url, at: Date.now(), themes };
    return this.decorate(this.catalogCache);
  }

  decorate(cache) {
    const installed = new Map(this.list().map((t) => [t.id, t]));
    return {
      url: cache.url,
      themes: cache.themes.map(({ download, sha256, previewUrl, ...t }) => {
        const mine = installed.get(t.id);
        return { ...t, compatible: t.apiVersion <= API_VERSION, installed: !!mine && !mine.builtin, builtin: !!(mine && mine.builtin), update: !!mine && !mine.builtin && newer(t.version, mine.version) };
      }),
    };
  }

  async installFromCatalog(id) {
    const c = this.catalogCache && this.catalogCache.themes.find((t) => t.id === id);
    if (!c) throw new Error('Thème absent du catalogue');
    if (c.apiVersion > API_VERSION) throw new Error('Ce thème demande une version plus récente du launcher');
    const { buf } = await fetchLimited(this.fetch, c.download, 20 * 1024 * 1024);
    const sum = crypto.createHash('sha256').update(buf).digest('hex');
    if (sum !== c.sha256) throw new Error('Archive altérée : son empreinte ne correspond pas au catalogue');
    return this.installZip(buf, { expectedId: id });
  }

  // Fichier demandé par clre-theme://<id>/<chemin> ; null si refusé.
  resolve(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const found = this.dirOf(u.hostname);
    if (!found) return null;
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const ext = path.extname(rel).toLowerCase();
    if (!SERVED.has(ext)) return null;
    let file;
    try {
      // Chemins réels : un lien symbolique ne doit pas faire sortir du dossier du thème.
      // (Thèmes intégrés : ils sont dans l'archive de l'app, sans lien possible.)
      const real = (f) => (found.builtin ? path.resolve(f) : fs.realpathSync(f));
      const root = real(found.dir);
      file = real(path.resolve(found.dir, rel));
      if (!file.toLowerCase().startsWith(root.toLowerCase() + path.sep) || !fs.statSync(file).isFile()) return null;
    } catch { return null; }
    return { file, type: MIME[ext] };
  }
}

module.exports = { Themes, API_VERSION, DEFAULT_ID, readManifest, ID_RE };
