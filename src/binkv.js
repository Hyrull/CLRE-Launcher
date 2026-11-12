// Lecteur du format KeyValues binaire de Steam (appcache/stats/*.bin).
function parseBinKV(buf) {
  let i = 0;
  const str = () => { const e = buf.indexOf(0, i); const s = buf.toString('utf8', i, e); i = e + 1; return s; };
  const obj = () => {
    const o = {};
    while (i < buf.length) {
      const t = buf[i++];
      if (t === 0x08 || t === 0x0b) return o;
      const k = str();
      if (t === 0x00) o[k] = obj();
      else if (t === 0x01) o[k] = str();
      else if (t === 0x02) { o[k] = buf.readInt32LE(i); i += 4; }
      else if (t === 0x03) { o[k] = buf.readFloatLE(i); i += 4; }
      else if (t === 0x04) { o[k] = buf.readUInt32LE(i); i += 4; }
      else if (t === 0x06) { o[k] = buf.readUInt32LE(i); i += 4; }
      else if (t === 0x07) { o[k] = Number(buf.readBigUInt64LE(i)); i += 8; }
      else if (t === 0x0a) { o[k] = Number(buf.readBigInt64LE(i)); i += 8; }
      else if (t === 0x05) { const e = buf.indexOf(Buffer.from([0, 0]), i); i = e + 2; }
      else throw new Error('binkv type ' + t + ' @' + i);
    }
    return o;
  };
  return obj();
}
module.exports = { parseBinKV };
