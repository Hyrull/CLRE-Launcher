#!/usr/bin/env node
// Construit le catalogue des thèmes CLRE-Launcher : vérifie chaque dossier de themes/, en fait une
// archive dist/<id>.zip et écrit index.json (adresse de téléchargement + empreinte SHA-256).
//   node scripts/build.js           → vérifie et construit
//   node scripts/build.js --check   → vérifie seulement (pour les pull requests)
// Variables : REPO=propriétaire/dépôt (défaut : GITHUB_REPOSITORY), BRANCH (défaut : main)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeZip } = require('./zip');

const ROOT = path.resolve(__dirname, '..');
const THEMES = path.join(ROOT, 'themes');
const DIST = path.join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');
const REPO = process.env.REPO || process.env.GITHUB_REPOSITORY || 'jclementc/clre-themes';
const BRANCH = process.env.BRANCH || 'main';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

const API_VERSION = 1; // dernière version du contrat connue du launcher
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VAR_RE = /^--[a-z0-9-]{1,60}$/;
const ALLOWED = new Set(['.json', '.css', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.woff', '.woff2', '.ttf', '.otf', '.md', '.txt']);
const MAX_THEME = 5 * 1024 * 1024;

const errors = [];
const fail = (id, msg) => errors.push(`${id} : ${msg}`);

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) return [{ rel: path.relative(base, p), link: true }];
    return e.isDirectory() ? walk(p, base) : [{ rel: path.relative(base, p).split(path.sep).join('/'), abs: p }];
  });
}

function checkTheme(id) {
  const dir = path.join(THEMES, id);
  if (!ID_RE.test(id)) { fail(id, 'nom de dossier invalide (minuscules, chiffres, tirets)'); return null; }
  let m;
  try { m = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')); } catch (e) { fail(id, `theme.json illisible (${e.message})`); return null; }
  if (m.id !== id) fail(id, `"id" doit valoir "${id}" (le nom du dossier)`);
  for (const k of ['name', 'author', 'version', 'description']) if (typeof m[k] !== 'string' || !m[k].trim()) fail(id, `champ "${k}" manquant`);
  if (!/^\d+\.\d+\.\d+$/.test(String(m.version || ''))) fail(id, 'version au format 1.2.3');
  if (!Number.isInteger(m.apiVersion) || m.apiVersion < 1 || m.apiVersion > API_VERSION) fail(id, `apiVersion doit être entre 1 et ${API_VERSION}`);
  for (const [name, vars] of Object.entries(m.schemes || {})) {
    for (const [k, v] of Object.entries(vars || {})) {
      if (!VAR_RE.test(k)) fail(id, `jeu « ${name} » : nom de variable invalide ${k}`);
      if (typeof v !== 'string' || v.length > 400 || /[;{}<>\\]|\/\*|\*\//.test(v)) fail(id, `jeu « ${name} » : valeur refusée pour ${k}`);
    }
  }
  const files = walk(dir);
  let size = 0;
  for (const f of files) {
    if (f.link) { fail(id, `lien symbolique interdit : ${f.rel}`); continue; }
    if (!ALLOWED.has(path.extname(f.rel).toLowerCase())) fail(id, `type de fichier refusé : ${f.rel}`);
    size += fs.statSync(f.abs).size;
  }
  if (size > MAX_THEME) fail(id, `trop lourd (${(size / 1048576).toFixed(1)} Mo, 5 Mo au plus)`);
  if (!files.some((f) => f.rel === 'preview.png')) fail(id, 'preview.png manquant (aperçu 16:10, ex. 640×400)');
  // Pas de ressource distante dans le CSS, sauf Google Fonts (seul site autorisé par le launcher)
  for (const f of files.filter((x) => x.rel.endsWith('.css'))) {
    const css = fs.readFileSync(f.abs, 'utf8');
    for (const u of css.matchAll(/url\(\s*['"]?\s*(https?:)?\/\/([^/'")\s]+)/gi)) {
      if (u[2] !== 'fonts.googleapis.com') fail(id, `${f.rel} : ressource distante refusée (${u[2]})`);
    }
    if (/expression\s*\(|javascript:/i.test(css)) fail(id, `${f.rel} : contenu refusé`);
  }
  return { m, files: files.filter((f) => !f.link) };
}

const ids = fs.existsSync(THEMES) ? fs.readdirSync(THEMES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
const built = ids.map((id) => [id, checkTheme(id)]).filter(([, r]) => r);

if (errors.length) {
  console.error(`✗ ${errors.length} problème(s) :\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ ${built.length} thème(s) valides`);
if (CHECK) process.exit(0);

fs.mkdirSync(DIST, { recursive: true });
const index = { apiVersion: API_VERSION, themes: [] }; // sans date : pas de commit si rien n'a changé
for (const [id, { m, files }] of built) {
  // Ordre fixe et sans date : la même source donne toujours la même archive (et la même empreinte)
  const zip = writeZip(files.sort((a, b) => a.rel.localeCompare(b.rel)).map((f) => ({ name: `${id}/${f.rel}`, data: fs.readFileSync(f.abs) })));
  fs.writeFileSync(path.join(DIST, `${id}.zip`), zip);
  index.themes.push({
    id,
    name: m.name,
    author: m.author,
    version: m.version,
    description: m.description,
    apiVersion: m.apiVersion,
    preview: `${RAW}/themes/${id}/preview.png`,
    download: `${RAW}/dist/${id}.zip`,
    sha256: crypto.createHash('sha256').update(zip).digest('hex'),
  });
}
// Archives des thèmes retirés
for (const f of fs.readdirSync(DIST)) if (f.endsWith('.zip') && !ids.includes(f.slice(0, -4))) fs.rmSync(path.join(DIST, f));
fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`✓ index.json écrit (${index.themes.length} thème(s))`);
