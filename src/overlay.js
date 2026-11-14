// Infos en jeu : petite fenêtre transparente, toujours au-dessus, qui laisse passer les clics.
// Visible par-dessus les jeux en plein écran fenêtré (sans bordure) ; un plein écran exclusif la masque.
const path = require('path');
const { BrowserWindow, screen } = require('electron');

const W = 340;
const H = 132;
class Overlay {
  constructor() { this.win = null; this.timer = null; this.closeTimer = null; this.visible = false; }
  ensure() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const area = screen.getPrimaryDisplay().workArea;
    this.win = new BrowserWindow({
      width: W, height: H, x: area.x + area.width - W - 24, y: area.y + 24,
      frame: false, transparent: true, resizable: false, movable: false, focusable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'overlay-preload.js') },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true);
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
    this.win.on('closed', () => { this.win = null; this.visible = false; });
    return this.win;
  }
  // info : { game, start, message } — message = rappel de pause
  show(info, ms = 0) {
    clearTimeout(this.closeTimer);
    const w = this.ensure();
    const send = () => w.webContents.send('overlay', info);
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
    w.showInactive();
    w.setAlwaysOnTop(true, 'screen-saver');
    this.visible = true;
    clearTimeout(this.timer);
    if (ms) this.timer = setTimeout(() => this.hide(), ms);
  }
  hide() {
    clearTimeout(this.timer);
    // Après le fondu, la fenêtre est fermée (et non cachée) : son processus de rendu ne reste pas en mémoire
    if (this.win && !this.win.isDestroyed()) { this.win.webContents.send('overlay', null); clearTimeout(this.closeTimer); this.closeTimer = setTimeout(() => this.destroy(), 220); }
    this.visible = false;
  }
  toggle(info) { if (this.visible) this.hide(); else this.show(info); }
  destroy() { clearTimeout(this.closeTimer); if (this.win && !this.win.isDestroyed()) this.win.destroy(); }
}
module.exports = { Overlay };
