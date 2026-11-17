// Réticule en jeu : petite fenêtre transparente, toujours au-dessus, qui laisse passer les clics,
// centrée sur la zone d'affichage de la fenêtre du jeu (bonne en fenêtré, et sur le bon écran
// quand il y en a plusieurs). Faute de la trouver : centre de l'écran où se trouve la souris.
// Rien n'est injecté dans le jeu. Comme les infos en jeu, un plein écran exclusif la masque.
const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { normalize, extent } = require('./renderer/crosshair-draw');
const { gameRect } = require('./winrect');

class Crosshair {
  constructor() { this.win = null; this.style = null; this.visible = false; this.center = null; this.names = []; this.seek = 0; this.timers = []; }
  // Centre visé, en pixels CSS (DIP) : celui de la fenêtre du jeu si on l'a trouvée, sinon celui de l'écran sous la souris
  target() {
    if (this.center) return this.center;
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return { x: d.bounds.x + d.bounds.width / 2, y: d.bounds.y + d.bounds.height / 2, scale: d.scaleFactor };
  }
  // Fenêtre carrée de taille paire, pour que son centre tombe pile sur le centre visé
  place(win, style) {
    const c = this.target();
    const side = Math.max(16, 2 * Math.ceil((extent(style) + 4) / (c.scale || 1)));
    win.setBounds({ x: Math.round(c.x - side / 2), y: Math.round(c.y - side / 2), width: side, height: side });
  }
  // Cherche la fenêtre du jeu maintenant, puis encore un peu plus tard (le jeu peut changer de taille en démarrant)
  locate() {
    const id = ++this.seek;
    this.timers.forEach(clearTimeout);
    const once = async () => {
      const r = await gameRect(this.names);
      if (id !== this.seek || !this.visible || !r) return;
      const dip = process.platform === 'win32' ? screen.screenToDipRect(null, r) : r;
      const d = screen.getDisplayMatching(dip);
      this.center = { x: dip.x + dip.width / 2, y: dip.y + dip.height / 2, scale: d.scaleFactor };
      if (this.win && !this.win.isDestroyed()) this.place(this.win, this.style);
    };
    once();
    this.timers = [4000, 12000].map((ms) => setTimeout(once, ms));
  }
  ensure() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    this.win = new BrowserWindow({
      width: 64, height: 64, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, backgroundColor: '#00000000', enableLargerThanScreen: false,
      webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'crosshair-preload.js'), backgroundThrottling: false },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true);
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadFile(path.join(__dirname, 'renderer', 'crosshair.html'));
    this.win.on('closed', () => { this.win = null; this.visible = false; });
    return this.win;
  }
  send() {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const go = () => w.webContents.send('crosshair', this.style);
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go); else go();
  }
  // names : exécutables du jeu, pour trouver sa fenêtre (sinon : fenêtre au premier plan)
  show(style, names) {
    const fresh = !this.visible;
    this.style = normalize(style);
    if (names) this.names = names;
    if (fresh) this.center = null;
    const w = this.ensure();
    this.place(w, this.style);
    this.send();
    w.showInactive();
    w.setAlwaysOnTop(true, 'screen-saver');
    this.visible = true;
    if (fresh) this.locate();
  }
  // Nouveaux réglages : appliqués tout de suite si le réticule est affiché
  update(style) { if (this.visible) this.show(style); }
  // Partie relancée ou fenêtre déplacée : on recherche la fenêtre du jeu
  relocate(names) { if (names) this.names = names; if (this.visible) { this.center = null; this.locate(); } }
  // Fermée plutôt que cachée : aucun processus de rendu ne reste en mémoire quand on n'en a pas besoin
  hide() { this.visible = false; this.seek++; this.timers.forEach(clearTimeout); this.timers = []; this.center = null; if (this.win && !this.win.isDestroyed()) this.win.destroy(); }
  destroy() { this.hide(); }
}
module.exports = { Crosshair };
