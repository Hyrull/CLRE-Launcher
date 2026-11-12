// Lecture / écriture sûres des fichiers de données.
// - writeAtomic : écrit dans un .tmp puis le renomme. Un crash pendant l'écriture laisse
//   l'ancien fichier intact, et la version précédente est gardée en .bak.
// - readJsonSafe : si le fichier est illisible, il est mis de côté (.corrupt-<date>) au lieu
//   d'être écrasé à la prochaine écriture, et on repart de la copie .bak quand elle existe.
const fs = require('fs');
const path = require('path');

function renameRetry(from, to) {
  // Sous Windows, un antivirus ou l'indexeur peut tenir le fichier ouvert un court instant.
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; } catch (e) {
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      const until = Date.now() + 30 * (i + 1);
      while (Date.now() < until) { /* attente courte */ }
    }
  }
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`); } catch { /* pas grave */ }
  renameRetry(tmp, file);
}

const writeJsonAtomic = (file, value, pretty = false) => writeAtomic(file, JSON.stringify(value, null, pretty ? 2 : 0));

function readJsonSafe(file, fallback) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code !== 'ENOENT') return fallback;
    // Fichier absent : un crash a pu survenir entre la copie .bak et le renommage.
    try { return JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')); } catch { return fallback; }
  }
  try { return JSON.parse(txt); } catch { /* fichier abîmé */ }
  try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* rien */ }
  try { return JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')); } catch { return fallback; }
}

module.exports = { writeAtomic, writeJsonAtomic, readJsonSafe };
