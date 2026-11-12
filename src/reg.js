// Lecture du registre Windows avec les accents intacts.
// reg.exe écrit dans la page de code de la console (850 sur un Windows français) : lu en UTF-8,
// « C:\Users\Clément » devient « C:\Users\Cl�ment » et le dossier est introuvable.
// On le lance donc derrière « chcp 65001 » pour qu'il écrive en UTF-8.
const { execFile, execFileSync } = require('child_process');

function regArgs(key, args) {
  const parts = [key, ...args];
  // Les clés sont des constantes du launcher ; on refuse tout caractère spécial pour cmd.exe.
  if (parts.some((p) => /["&|<>^%\r\n]/.test(p))) throw new Error(`Clé de registre invalide : ${key}`);
  return [`/d /s /c "chcp 65001 >nul & reg query ${parts.map((p) => `"${p}"`).join(' ')}"`];
}
const REG_OPTS = { windowsVerbatimArguments: true, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 };

function regQuery(key, args = [], opts = {}) {
  return execFileSync('cmd.exe', regArgs(key, args), { ...REG_OPTS, ...opts });
}

// Version asynchrone : pour les grosses lectures (/s), qui gèleraient l'interface pendant plus d'une seconde.
function regQueryAsync(key, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    let a;
    try { a = regArgs(key, args); } catch (e) { reject(e); return; }
    execFile('cmd.exe', a, { ...REG_OPTS, timeout: 20000, ...opts }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

// À placer en tête d'un script PowerShell dont on lit la sortie.
const PS_UTF8 = '[Console]::OutputEncoding = [Text.Encoding]::UTF8\n';

// Charge une plateforme sans que son échec n'emporte les autres.
function safeLoad(name, fn) {
  try { const r = fn(); return Array.isArray(r) ? r : []; } catch (e) { console.warn(`${name} : lecture impossible :`, e.message); return []; }
}

module.exports = { regQuery, regQueryAsync, PS_UTF8, safeLoad };
