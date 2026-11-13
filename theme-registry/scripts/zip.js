// Lecture et écriture de fichiers .zip, sans dépendance (méthodes « stocké » et « deflate »).
// Sert aux thèmes : on ne lit que des archives petites, entièrement en mémoire.
const zlib = require('zlib');

const crc32 = (buf) => (typeof zlib.crc32 === 'function' ? zlib.crc32(buf) >>> 0 : null);

// Renvoie [{ name, data }] ; lève une erreur si l'archive est invalide ou dépasse les limites.
function readZip(buf, { maxEntries = 500, maxTotal = 50 * 1024 * 1024 } = {}) {
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin (commentaire ≤ 64 Ko)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Archive .zip illisible');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > maxEntries) throw new Error('Archive trop grosse (trop de fichiers)');
  const out = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Archive .zip abîmée');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString(flags & 0x800 ? 'utf8' : 'latin1').replace(/\\/g, '/');
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/')) continue; // dossier
    if (flags & 1) throw new Error('Archive chiffrée non prise en charge');
    total += usize;
    if (total > maxTotal) throw new Error('Archive trop grosse');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error('Archive .zip abîmée');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.slice(start, start + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(usize, 1) });
    else throw new Error(`Compression non prise en charge (${method})`);
    if (data.length !== usize) throw new Error('Archive .zip abîmée');
    const c = crc32(data);
    if (c !== null && c !== crc) throw new Error(`Fichier abîmé dans l'archive : ${name}`);
    out.push({ name, data });
  }
  return out;
}

// files : [{ name, data }] → Buffer d'une archive .zip
function writeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const deflated = zlib.deflateRawSync(f.data, { level: 9 });
    const stored = deflated.length >= f.data.length;
    const body = stored ? f.data : deflated;
    const crc = crc32(f.data);
    if (crc === null) throw new Error('zlib.crc32 indisponible (Node 20.15+ requis)');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(stored ? 0 : 8, 8); head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18); head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(name.length, 26);
    locals.push(head, name, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x800, 8);
    cd.writeUInt16LE(stored ? 0 : 8, 10); cd.writeUInt32LE(0, 12); cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(f.data.length, 24); cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

module.exports = { readZip, writeZip };
