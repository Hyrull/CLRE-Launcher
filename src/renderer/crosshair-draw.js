// Dessin du réticule, partagé par la fenêtre en jeu (crosshair.html) et l'aperçu des réglages.
// Les tailles sont en pixels réels de l'écran (comme les réticules des jeux), pas en pixels CSS :
// un réticule de 2 px reste net à 125 % ou 150 % d'agrandissement Windows.
(function () {
  const DEFAULTS = { shape: 'cross', color: '#3cff6e', size: 8, thickness: 2, gap: 4, outline: 1, dot: false, opacity: 1 };
  const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
  function normalize(s) {
    s = { ...DEFAULTS, ...(s || {}) };
    return {
      shape: ['cross', 't', 'dot', 'circle'].includes(s.shape) ? s.shape : 'cross',
      color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : DEFAULTS.color,
      size: clamp(s.size, 1, 40, DEFAULTS.size),
      thickness: clamp(s.thickness, 1, 10, DEFAULTS.thickness),
      gap: clamp(s.gap, 0, 30, DEFAULTS.gap),
      outline: clamp(s.outline, 0, 3, DEFAULTS.outline),
      dot: !!s.dot,
      opacity: Math.min(1, Math.max(0.1, Number(s.opacity) || 1)),
    };
  }
  // Rectangles du réticule autour de (0, 0), en pixels entiers : [x, y, largeur, hauteur]
  function rects(s) {
    const t = s.thickness;
    const a = -Math.floor(t / 2);
    const out = [];
    if (s.shape === 'cross' || s.shape === 't') {
      const g = s.gap; const L = s.size;
      out.push([g + Math.ceil(t / 2), a, L, t]); // droite
      out.push([-(g + Math.floor(t / 2)) - L, a, L, t]); // gauche
      out.push([a, g + Math.ceil(t / 2), t, L]); // bas
      if (s.shape === 'cross') out.push([a, -(g + Math.floor(t / 2)) - L, t, L]); // haut
    }
    if (s.shape === 'dot' || s.dot) out.push([a, a, t, t]);
    return out;
  }
  // Demi-largeur occupée, pour dimensionner la fenêtre
  function extent(s) {
    s = normalize(s);
    const r = s.shape === 'circle' ? s.size + s.thickness : s.shape === 'dot' ? s.thickness : s.gap + s.size + s.thickness;
    return r + s.outline + 2;
  }
  function draw(canvas, style, dpr) {
    const s = normalize(style);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = dpr || 1; // aperçu agrandi : chaque pixel du réticule devient k pixels
    const cx = Math.floor(canvas.width / 2 / k) * k;
    const cy = Math.floor(canvas.height / 2 / k) * k;
    canvas.style.opacity = String(s.opacity);
    ctx.imageSmoothingEnabled = false;
    const box = ([x, y, w, h], o, col) => { ctx.fillStyle = col; ctx.fillRect(cx + (x - o) * k, cy + (y - o) * k, (w + 2 * o) * k, (h + 2 * o) * k); };
    if (s.shape === 'circle') {
      const ring = (lw, col) => { ctx.strokeStyle = col; ctx.lineWidth = lw * k; ctx.beginPath(); ctx.arc(cx, cy, s.size * k, 0, Math.PI * 2); ctx.stroke(); };
      if (s.outline) ring(s.thickness + 2 * s.outline, '#000');
      ring(s.thickness, s.color);
      if (s.dot) { const d = rects({ ...s, shape: 'dot' }); if (s.outline) d.forEach((r) => box(r, s.outline, '#000')); d.forEach((r) => box(r, 0, s.color)); }
      return;
    }
    const list = rects(s);
    if (s.outline) list.forEach((r) => box(r, s.outline, '#000'));
    list.forEach((r) => box(r, 0, s.color));
  }
  const api = { DEFAULTS, normalize, extent, draw };
  if (typeof window !== 'undefined') window.CrosshairDraw = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
