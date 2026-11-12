// Intégrations système : statut Discord, raccourcis Bureau, mise à jour du launcher.
const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');
const { spawn } = require('child_process');

// ---------- Statut Discord (Rich Presence via le canal local de l'app Discord) ----------
class Discord {
  constructor() { this.sock = null; this.ready = false; this.clientId = ''; this.pending = null; this.nonce = 0; }

  frame(op, data) {
    const json = Buffer.from(JSON.stringify(data));
    const h = Buffer.alloc(8);
    h.writeInt32LE(op, 0); h.writeInt32LE(json.length, 4);
    return Buffer.concat([h, json]);
  }

  connect(clientId) {
    if (!clientId) { this.close(); return; }
    if (this.sock && this.clientId === clientId) return;
    this.close();
    this.clientId = clientId;
    const tryPipe = (i) => {
      if (i > 9) return;
      const sock = net.createConnection(`\\\\?\\pipe\\discord-ipc-${i}`);
      sock.once('error', () => tryPipe(i + 1));
      sock.once('connect', () => {
        this.sock = sock;
        sock.on('error', () => this.close());
        sock.on('close', () => { this.sock = null; this.ready = false; });
        sock.on('data', (buf) => {
          // Réponse du handshake : Discord est prêt à recevoir l'activité
          if (!this.ready && buf.length >= 8 && buf.readInt32LE(0) === 1) {
            this.ready = true;
            if (this.pending !== null) this.set(this.pending);
          }
        });
        sock.write(this.frame(0, { v: 1, client_id: clientId }));
      });
    };
    tryPipe(0);
  }

  set(activity) {
    this.pending = activity;
    if (!this.sock || !this.ready) return;
    this.sock.write(this.frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: activity || undefined }, nonce: String(++this.nonce) }));
  }

  close() {
    if (this.sock) { try { this.sock.destroy(); } catch { /* rien */ } }
    this.sock = null; this.ready = false;
  }
}

// ---------- Raccourcis Bureau ----------
function launcherTarget(app) {
  if (app.isPackaged) return { target: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, prefix: '' };
  return { target: process.execPath, prefix: `"${app.getAppPath()}" ` };
}

function createShortcut(app, shell, g) {
  const { target, prefix } = launcherTarget(app);
  const name = g.name.replace(/[<>:"/\\|?*]/g, '').trim();
  const file = path.join(app.getPath('desktop'), `${name}.lnk`);
  const icon = g.clientIcon || (g.exe && fs.existsSync(g.exe) ? g.exe : target);
  const ok = shell.writeShortcutLink(file, 'create', {
    target, args: `${prefix}--play=${g.key}`, icon, iconIndex: 0,
    description: `Lancer ${g.name} avec CLRE-Launcher`, cwd: path.dirname(target),
  });
  if (!ok) throw new Error('Windows a refusé la création du raccourci');
  return file;
}

// ---------- Mise à jour du launcher (GitHub Releases) ----------
const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; }
  return false;
};

async function checkUpdate(repo, current) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) return { error: 'Indique le dépôt GitHub au format propriétaire/nom' };
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CLRE-Launcher' } });
  if (r.status === 404) return { error: 'Aucune version publiée sur ce dépôt' };
  if (!r.ok) return { error: `GitHub indisponible (HTTP ${r.status})` };
  const rel = await r.json();
  const asset = (rel.assets || []).find((a) => /\.exe$/i.test(a.name));
  return { latest: rel.tag_name, current, available: newer(rel.tag_name, current) && !!asset, url: asset && asset.browser_download_url, notes: (rel.body || '').slice(0, 600), name: rel.name || rel.tag_name };
}

async function downloadUpdate(url, exePath) {
  if (!/^https:\/\/(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)\//.test(url)) throw new Error('Adresse de téléchargement inattendue');
  const r = await fetch(url, { headers: { 'User-Agent': 'CLRE-Launcher' } });
  if (!r.ok) throw new Error(`Téléchargement impossible (HTTP ${r.status})`);
  const tmp = exePath.replace(/\.exe$/i, '.update.exe');
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  return tmp;
}

// Remplace l'exe portable une fois le launcher fermé, puis le relance.
function installUpdate(tmp, exePath) {
  const cmd = path.join(os.tmpdir(), 'clre-update.cmd');
  fs.writeFileSync(cmd, [
    '@echo off',
    `:wait`,
    `tasklist /fi "PID eq ${process.pid}" | find "${process.pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)`,
    `move /y "${tmp}" "${exePath}" >nul`,
    `start "" "${exePath}"`,
    `del "%~f0"`,
  ].join('\r\n'));
  spawn('cmd.exe', ['/c', cmd], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

module.exports = { Discord, createShortcut, checkUpdate, downloadUpdate, installUpdate };
