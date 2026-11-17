// Zone d'affichage (sans bordure ni barre de titre) de la fenêtre d'un jeu, en pixels réels de l'écran.
// Cherche d'abord la plus grande fenêtre visible des processus du jeu, sinon la fenêtre au premier plan.
// Passe par PowerShell (API Windows user32) : rien à compiler ni à installer, ~1 s par appel.
const { execFile } = require('child_process');

const CS = `
using System; using System.Runtime.InteropServices;
public static class ClreWin {
  [DllImport("user32.dll")] static extern IntPtr SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  struct RECT { public int L, T, R, B; }
  struct POINT { public int X, Y; }
  // Sans ça, avec un agrandissement Windows différent de 100 %, les tailles renvoyées seraient mises à l'échelle
  public static void Dpi() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { } }
  static string Rect(IntPtr h) {
    RECT r; POINT p = new POINT();
    if (h == IntPtr.Zero || IsIconic(h) || !GetClientRect(h, out r) || !ClientToScreen(h, ref p)) return "";
    return p.X + "," + p.Y + "," + (r.R - r.L) + "," + (r.B - r.T);
  }
  public static string Find(int[] pids) {
    IntPtr best = IntPtr.Zero; long area = 0;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, (int)pid) < 0 || !IsWindowVisible(h) || IsIconic(h)) return true;
      RECT r; if (!GetClientRect(h, out r)) return true;
      long a = (long)(r.R - r.L) * (r.B - r.T);
      if (a > area) { area = a; best = h; }
      return true;
    }, IntPtr.Zero);
    return Rect(best);
  }
  public static string Fore(int self) {
    IntPtr h = GetForegroundWindow(); uint pid; GetWindowThreadProcessId(h, out pid);
    return pid == (uint)self ? "" : Rect(h);
  }
}`;

function run(script) {
  return new Promise((resolve) => {
    const enc = Buffer.from(script, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, timeout: 8000 }, (err, out) => resolve(err ? '' : String(out).trim()));
  });
}

// names : exécutables du jeu (« fortniteclient-win64-shipping.exe »). Renvoie { x, y, width, height } ou null.
async function gameRect(names = [], selfPid = process.pid) {
  const procs = names.map((n) => String(n).replace(/\.exe$/i, '').replace(/[^\w.\- ]/g, '')).filter(Boolean);
  const script = `Add-Type -TypeDefinition @'\n${CS}\n'@\n[ClreWin]::Dpi()\n`
    + `$ids = @(${procs.map((p) => `'${p}'`).join(',') || "''"} | ForEach-Object { if ($_) { Get-Process -Name $_ -ErrorAction SilentlyContinue } } | ForEach-Object { [int]$_.Id })\n`
    + `$r = ''; if ($ids.Count) { $r = [ClreWin]::Find([int[]]$ids) }\n`
    + `if (-not $r) { $r = [ClreWin]::Fore(${Number(selfPid) || 0}) }\n$r`;
  const m = (await run(script)).match(/^(-?\d+),(-?\d+),(\d+),(\d+)$/m);
  if (!m) return null;
  const [x, y, width, height] = m.slice(1).map(Number);
  // Une petite fenêtre au premier plan (lanceur, notification) n'est pas le jeu
  return width >= 640 && height >= 400 ? { x, y, width, height } : null;
}
module.exports = { gameRect };
