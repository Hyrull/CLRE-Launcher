// Mesure des performances pendant une session : CPU, GPU, mémoire vidéo, RAM (compteurs Windows,
// indépendants de la langue), températures si LibreHardwareMonitor tourne, FPS si PresentMon est fourni.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SAMPLER = `
$ErrorActionPreference='SilentlyContinue'
$total = (Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize
while ($true) {
  $c = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
  $g = (Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -Filter "Name LIKE '%engtype_3D'" | Measure-Object UtilizationPercentage -Sum).Sum
  $v = (Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | Measure-Object DedicatedUsage -Sum).Sum
  $free = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
  $ct = $null; $gt = $null
  $s = Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -Filter "SensorType='Temperature'"
  if ($s) {
    $ct = ($s | Where-Object { $_.Identifier -like '*cpu*' -and ($_.Name -like '*Package*' -or $_.Name -like '*Tctl*' -or $_.Name -like '*Core (Tctl/Tdie)*') } | Select-Object -First 1).Value
    $gt = ($s | Where-Object { $_.Identifier -like '*gpu*' -and ($_.Name -like '*Core*' -or $_.Name -like '*Edge*' -or $_.Name -eq 'GPU') } | Select-Object -First 1).Value
  }
  [Console]::Out.WriteLine((@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); cpu = $c; gpu = [math]::Min(100, [math]::Round($g)); vram = [math]::Round($v / 1MB); ram = [math]::Round(($total - $free) / 1KB); cpuT = $ct; gpuT = $gt } | ConvertTo-Json -Compress))
  Start-Sleep -Seconds 4
}`;

class Perf {
  constructor(dir, getPresentMon) {
    this.dir = dir;
    this.getPresentMon = getPresentMon;
    this.runs = new Map(); // key -> { proc, pm, samples, frames, start }
  }
  start(key, processNames = []) {
    if (this.runs.has(key)) return;
    const run = { start: Math.floor(Date.now() / 1000), samples: [], frameMs: [], proc: null, pm: null };
    this.runs.set(key, run);
    try {
      run.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SAMPLER], { windowsHide: true });
      let buf = '';
      run.proc.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          try {
            const s = JSON.parse(line);
            if (run.frameMs.length) { const ms = run.frameMs.reduce((a, b) => a + b, 0) / run.frameMs.length; s.fps = Math.round(1000 / ms); s.low = Math.round(1000 / percentile(run.frameMs, 0.99)); run.frameMs = []; if (run.onSample) run.onSample(); }
            run.samples.push(s);
          } catch { /* ligne partielle */ }
        }
      });
      run.proc.on('error', () => {});
    } catch { /* PowerShell indisponible */ }
    // FPS : PresentMon (outil Intel open source) si l'utilisateur l'a indiqué. Sans filtre de processus :
    // on garde l'application qui affiche le plus d'images (le jeu), quel que soit son exécutable.
    const pmExe = this.getPresentMon && this.getPresentMon();
    if (pmExe && fs.existsSync(pmExe)) {
      try {
        const args = ['--output_stdout', '--stop_existing_session', '--no_console_stats', '--v1_metrics'];
        if (processNames[0]) args.unshift('--process_name', processNames[0]);
        run.pm = spawn(pmExe, args, { windowsHide: true });
        let head = null; let col = -1; let app = -1; let buf = '';
        const perApp = new Map();
        run.pm.stdout.on('data', (d) => {
          buf += d;
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            const cells = line.split(',');
            if (!head) { head = cells; col = cells.findIndex((c) => /^(MsBetweenPresents|msBetweenPresents|FrameTime)$/.test(c)); app = cells.findIndex((c) => /^(Application|ProcessName)$/i.test(c)); continue; }
            const v = Number(cells[col]);
            const name = (cells[app] || '').toLowerCase();
            if (col < 0 || !(v > 0 && v < 1000) || IGNORE.test(name)) continue;
            if (!perApp.has(name)) perApp.set(name, []);
            perApp.get(name).push(v);
          }
          let best = null;
          for (const [, arr] of perApp) if (!best || arr.length > best.length) best = arr;
          if (best) { run.frameMs = best; }
        });
        run.onSample = () => perApp.clear();
        run.pm.on('error', () => {});
      } catch { /* PresentMon refusé (droits administrateur ?) */ }
    }
  }
  stop(key, name) {
    const run = this.runs.get(key);
    if (!run) return null;
    this.runs.delete(key);
    try { run.proc && run.proc.kill(); } catch {}
    try { run.pm && run.pm.kill(); } catch {}
    const end = Math.floor(Date.now() / 1000);
    if (end - run.start < 60 || run.samples.length < 3) return null;
    const out = { key, name, start: run.start, end, samples: run.samples };
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(path.join(this.dir, `${safe(key)}_${run.start}.json`), JSON.stringify(out));
    } catch { /* disque */ }
    return out;
  }
  stopAll() { for (const k of [...this.runs.keys()]) this.stop(k, k); }
  list(key) {
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => f.startsWith(safe(key) + '_')); } catch { return []; }
    return files.sort().reverse().slice(0, 12).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
  }
}
const IGNORE = /^(dwm|clre-launcher|electron|explorer|chrome|msedge|firefox|discord|steamwebhelper|epicgameslauncher|searchhost|textinputhost|shellexperiencehost|startmenuexperiencehost|applicationframehost)\.exe$/;
const safe = (k) => String(k).replace(/[^\w.-]+/g, '_');
function percentile(arr, p) { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))] || 16.7; }

module.exports = { Perf };
