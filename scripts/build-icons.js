// Génère les icônes PNG + .ico depuis assets/logo*.svg (logo 3 « Pile de jaquettes »).
// Lancer avec : electron scripts/build-icons.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets');
const svg = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
// Chaque taille utilise la variante dessinée pour elle (moins de détails en petit)
const sizes = [[16, 'logo-16.svg'], [20, 'logo-16.svg'], [24, 'logo-32.svg'], [32, 'logo-32.svg'], [40, 'logo-32.svg'], [48, 'logo.svg'], [64, 'logo.svg'], [128, 'logo.svg'], [256, 'logo.svg'], [512, 'logo.svg']];

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  const pngs = {};
  for (const [size, file] of sizes) {
    const dataUrl = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = ${size}; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, ${size}, ${size}); res(c.toDataURL('image/png')); };
      img.onerror = rej;
      img.src = 'data:image/svg+xml;base64,${Buffer.from(svg(file)).toString('base64')}';
    })`);
    pngs[size] = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(dir, `icon-${size}.png`), pngs[size]);
  }
  // Barre des tâches Windows : tray.png (16) + tray@2x.png (32)
  fs.copyFileSync(path.join(dir, 'icon-16.png'), path.join(dir, 'tray.png'));
  fs.copyFileSync(path.join(dir, 'icon-32.png'), path.join(dir, 'tray@2x.png'));

  // .ico avec des images PNG embarquées (16 → 256)
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoSizes.length, 4);
  const entries = [];
  let offset = 6 + 16 * icoSizes.length;
  for (const s of icoSizes) {
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[s].length, 8); e.writeUInt32LE(offset, 12);
    offset += pngs[s].length;
    entries.push(e);
  }
  fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([header, ...entries, ...icoSizes.map((s) => pngs[s])]));
  console.log('icônes générées dans', dir);
  app.quit();
});
