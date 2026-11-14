// Outil de dev : capture des écrans de l'app (LAUNCHER_SNAP=<dossier> npm start)
// SNAP_W / SNAP_H : taille de la fenêtre. SNAP_ROUTES : liste JSON de [nom, route] à capturer.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT = [
  ['1-home', { view: 'home' }],
  ['2-home-scroll', { view: 'home' }, 1100],
  ['3-all', { view: 'all' }],
  ['4-history', { view: 'history' }],
  ['5-wishlist', { view: 'wishlist' }],
  ['6-storage', { view: 'storage' }],
  ['7-screens', { view: 'screenshots' }],
  ['8-downloads', { view: 'downloads' }],
  ['9-friends', { view: 'friends' }],
  ['10-game-news', { view: 'game', id: '2379780', tab: 'news' }],
  ['11-game-shots', { view: 'game', id: '250900', tab: 'shots' }],
  ['12-game-overview', { view: 'game', id: '250900' }, 600],
  ['13-gog', { view: 'store', id: 'gog' }],
];

module.exports = (win, outDir) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code, true); // true : comme un clic (export vidéo, presse-papiers)
  if (process.env.SNAP_W) win.setContentSize(+process.env.SNAP_W, +process.env.SNAP_H);
  win.webContents.setBackgroundThrottling(false); // sinon les captures d'une fenêtre masquée sont en retard
  win.webContents.once('did-finish-load', async () => {
    fs.mkdirSync(outDir, { recursive: true });
    win.webContents.on('console-message', ({ level, message }) => { if (level === 'warning' || level === 'error') fs.appendFileSync(path.join(outDir, 'console.log'), message + '\n'); });
    if (process.env.SNAP_THEME) require('electron').nativeTheme.themeSource = process.env.SNAP_THEME;
    await wait(3500);
    const routes = process.env.SNAP_ROUTES ? JSON.parse(process.env.SNAP_ROUTES) : DEFAULT;
    for (const [name, route, scroll, pre] of routes) {
      if (pre) await js(pre);
      const res = await js(`(() => { try { go(${JSON.stringify(route)}); document.querySelector("#content").scrollTo(0, ${scroll || 0}); return state.route.view + " ok"; } catch (e) { return "ERR " + e.stack; } })()`);
      fs.appendFileSync(path.join(outDir, 'log.txt'), `${name}: ${res}\n`);
      await wait(2500);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
    }
    app.quit();
  });
};
