'use strict';
/* Story récap en 16:9 : un bilan de la période façon « rétrospective de l'année ».
   Chaque page a sa palette franche, une typographie géante qui monte mot par mot et des formes animées.
   Exportable en image (page en cours) ou en vidéo 1920×1080. Chargé après features3.js. */
/* global state, api, esc, byId, toast, fmtDur, recapRange, ICONS */

// ---------- Données de la période ----------
function periodData(sessions, from, to) {
  const list = (Array.isArray(sessions) ? sessions : []).filter((s) => s.end > from && s.start < to);
  const dur = (s) => Math.min(s.end, to) - Math.max(s.start, from);
  const total = list.reduce((a, s) => a + dur(s), 0);
  const byGame = {}, count = {}, byDay = {};
  for (const s of list) {
    byGame[s.key] = (byGame[s.key] || 0) + dur(s);
    count[s.key] = (count[s.key] || 0) + 1;
    const day = new Date(s.start * 1000); day.setHours(0, 0, 0, 0);
    byDay[day.getTime()] = (byDay[day.getTime()] || 0) + dur(s);
  }
  const top = Object.entries(byGame).sort((a, b) => b[1] - a[1]);
  const days = new Set(list.map((s) => new Date(s.start * 1000).toDateString()));
  const wd = [0, 0, 0, 0, 0, 0, 0]; const hours = [0, 0, 0, 0];
  for (const s of list) { const t = new Date(s.start * 1000); wd[t.getDay()] += dur(s); hours[Math.floor(t.getHours() / 6)] += dur(s); }
  const longest = list.reduce((a, s) => (!a || dur(s) > dur(a) ? s : a), null);
  const peak = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  const firstEver = {};
  for (const s of sessions) if (!firstEver[s.key] || s.start < firstEver[s.key]) firstEver[s.key] = s.start;
  const discovered = Object.keys(byGame).filter((k) => firstEver[k] >= from);
  return { list, total, top, count, days, wd, hours, longest, longestDur: longest ? dur(longest) : 0, peak: peak ? { t: Number(peak[0]), secs: peak[1] } : null, discovered };
}

function persona(d, prevTotal) {
  const avg = d.list.length ? d.total / d.list.length : 0;
  const share = d.top.length ? d.top[0][1] / d.total : 0;
  const slot = d.hours.indexOf(Math.max(...d.hours));
  if (slot === 0 && d.hours[0] > d.total * 0.35) return ['Le noctambule', 'Tu joues quand tout le monde dort. Le serveur te connaît par ton prénom.'];
  if (slot === 1 && d.hours[1] > d.total * 0.35) return ['Le lève-tôt', 'Une partie avant tout le reste. Le café peut attendre.'];
  if (share > 0.6) return ['Le fidèle', `Un jeu, une passion : ${Math.round(share * 100)} % de ton temps sur le même.`];
  if (avg > 2.5 * 3600) return ['Le marathonien', `Des sessions de ${fmtDur(avg)} en moyenne. Pense à t’hydrater.`];
  if (d.top.length >= 6) return ['L’explorateur', `${d.top.length} jeux différents. Tu ne tiens pas en place.`];
  if (prevTotal && d.total > prevTotal * 1.5) return ['En pleine forme', 'Bien plus de jeu que la période d’avant. C’est ta saison.'];
  if (d.days.size <= 2) return ['Le joueur du dimanche', 'Peu de jours, mais bien remplis.'];
  return ['Le régulier', 'Un peu chaque jour : la meilleure façon de jouer.'];
}

// ---------- Mise en page ----------
// Palette de chaque page : fond, texte, couleur forte, couleur secondaire
const STORY_PAL = {
  intro: { bg: '#0b0b0f', fg: '#f5f5f7', a: '#c6f432', b: '#7b5cff' },
  total: { bg: '#ff4f2b', fg: '#1a0805', a: '#ffd23f', b: '#1a0805' },
  top: { bg: '#0b0b0f', fg: '#f5f5f7', a: '#c6f432', b: '#ff9de2' },
  rank: { bg: '#1b1fff', fg: '#f5f5f7', a: '#ff9de2', b: '#c6f432' },
  rhythm: { bg: '#ffd23f', fg: '#14110a', a: '#ff4f2b', b: '#1b1fff' },
  ach: { bg: '#0e3b2c', fg: '#f5f5f7', a: '#c6f432', b: '#ffd23f' },
  fresh: { bg: '#ff9de2', fg: '#1d0a16', a: '#1b1fff', b: '#ff4f2b' },
  persona: { bg: '#7b5cff', fg: '#f5f5f7', a: '#c6f432', b: '#ff9de2' },
  outro: { bg: '#0b0b0f', fg: '#f5f5f7', a: '#c6f432', b: '#ff9de2' },
};
const palStyle = (p, extra = '') => `--bg:${p.bg};--fg:${p.fg};--a:${p.a};--b:${p.b};${extra}`;
// Titre découpé en mots : chaque mot monte depuis un masque, l'un après l'autre
const kinetic = (text, delay = 0, step = 90) => String(text).split(/\s+/).filter(Boolean)
  .map((w, i) => `<span class="w-m"><span style="--d:${delay + i * step}ms">${esc(w)}</span></span>`).join(' ');
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const STORY_LOGO = '<svg viewBox="0 0 256 256" aria-hidden="true"><rect x="8" y="8" width="240" height="240" rx="56" fill="#e9a23b"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" opacity="0.4" transform="rotate(-14 128 130)"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" transform="rotate(3 128 130)"/><path d="M114 108 L150 130 L114 152 Z" fill="#f5f5f7" stroke="#f5f5f7" stroke-width="12" stroke-linejoin="round" transform="rotate(3 128 130)"/></svg>';
const gameOf = (k) => byId(k) || { name: k, art: {} };

function storySlides(c) {
  const { d, range, kind, top, tint, achs, rare, pName, pText, diff } = c;
  const P = STORY_PAL;
  const period = { week: 'de la semaine', month: 'du mois', year: 'de l’année' }[state.recap.mode] || 'de la période';
  const hh = Math.floor(d.total / 3600), mm = Math.round((d.total % 3600) / 60);
  const wdNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const slotNames = ['la nuit', 'le matin', 'l’après-midi', 'le soir'];
  const slotShort = ['Nuit', 'Matin', 'Après-midi', 'Soir'];
  const bestDay = d.wd.indexOf(Math.max(...d.wd));
  const bestSlot = d.hours.indexOf(Math.max(...d.hours));
  const topSecs = d.top[0][1];
  const pct = Math.round((topSecs / d.total) * 100);
  const films = Math.floor(d.total / 7200);
  const slides = [];

  // 1. Ouverture : un mur de jaquettes qui défile derrière le titre
  const covers = d.top.map(([k]) => gameOf(k).art.cover).filter(Boolean);
  const fill = (arr, n) => (arr.length ? Array.from({ length: n }, (_, i) => arr[i % arr.length]) : []);
  const row = (urls, dir) => `<div class="w-row ${dir}"><div class="w-track">${[...urls, ...urls].map((u) => `<img src="${esc(u)}" alt="">`).join('')}</div></div>`;
  slides.push(`<div class="w w-intro" style="${palStyle(P.intro)}">
    ${covers.length ? `<div class="w-wall">${row(fill(covers, 8), 'l')}${row(fill([...covers].reverse(), 8), 'r')}${row(fill(covers.slice(1).concat(covers.slice(0, 1)), 8), 'l')}</div>` : ''}
    <div class="w-wall-veil"></div><i class="w-blob w-blob-a"></i><i class="w-blob w-blob-b"></i>
    <div class="w-copy">
      <p class="w-kick r1">${esc(kind)} en jeu</p>
      <h1 class="w-mega">${kinetic(range.label, 250, 110)}</h1>
      <p class="w-lede r3">Prêt ? On rembobine.</p>
    </div>
    <p class="w-brand r4">${STORY_LOGO}CLRE-Launcher</p>
  </div>`);

  // 2. Le temps total, en énorme
  const band = Array(8).fill(`Temps de jeu <i>✦</i> ${esc(range.label)} <i>✦</i> `).join('');
  slides.push(`<div class="w w-total" style="${palStyle(P.total)}">
    <div class="w-band"><div class="w-band-track">${band}${band}</div></div>
    <i class="w-sun"></i>
    <div class="w-copy">
      <p class="w-kick r1">Tu as joué</p>
      <h1 class="w-giant r2"><span data-count="${hh}">0</span><em>h${mm ? String(mm).padStart(2, '0') : ''}</em></h1>
      <p class="w-lede r3">${films >= 2 ? `L’équivalent de ${films} films d’affilée.` : hh >= 1 ? 'Assez pour finir quelques beaux moments.' : 'Peu de temps, mais bien employé.'}</p>
      <div class="w-stats r4">
        <div><b data-count="${d.list.length}">0</b><span>${d.list.length > 1 ? 'sessions' : 'session'}</span></div>
        <div><b data-count="${d.days.size}">0</b><span>${d.days.size > 1 ? 'jours de jeu' : 'jour de jeu'}</span></div>
        <div><b data-count="${d.top.length}">0</b><span>${d.top.length > 1 ? 'jeux' : 'jeu'}</span></div>
      </div>
      ${diff != null ? `<p class="w-pill r5">${diff >= 0 ? '+' : ''}${diff} % par rapport à la période d’avant</p>` : ''}
    </div>
  </div>`);

  // 3. Le jeu numéro un
  slides.push(`<div class="w w-top" style="${palStyle(P.top, `--t:${tint}`)}">
    <div class="w-art">${top.art.hero || top.art.header ? `<img src="${esc(top.art.hero || top.art.header)}" alt="">` : ''}<div class="w-art-tint"></div></div>
    ${top.art.cover ? `<img class="w-cover" src="${esc(top.art.cover)}" alt="">` : ''}
    <div class="w-copy">
      <p class="w-kick r1">Ton jeu ${period}</p>
      <h1 class="w-title">${kinetic(top.name, 250, 70)}</h1>
      <div class="w-ring r3"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bgc" cx="60" cy="60" r="52"/><circle class="fgc" cx="60" cy="60" r="52" style="--p:${pct}"/></svg>
        <span><b><span data-count="${pct}">0</span> %</b><small>de ton temps de jeu</small></span></div>
      <p class="w-lede r4">${fmtDur(topSecs)} en ${plural(d.count[d.top[0][0]] || 1, 'session', 'sessions')}.</p>
    </div>
  </div>`);

  // 4. Le classement
  if (d.top.length > 1) {
    const n = Math.min(5, d.top.length);
    slides.push(`<div class="w w-rank" style="${palStyle(P.rank)}">
      <span class="w-ghost" aria-hidden="true">1</span><i class="w-spark s1"></i>
      <div class="w-copy"><p class="w-kick r1">Ton top ${n}</p><h1 class="w-title">${kinetic('Les jeux qui ont tout pris', 250, 70)}</h1></div>
      <ol class="w-list">${d.top.slice(0, n).map(([k, s], i) => { const g = gameOf(k); return `<li style="--i:${i}"><span class="n">${i + 1}</span>${g.art.cover ? `<img src="${esc(g.art.cover)}" alt="">` : '<span class="ph"></span>'}<span class="nm"><b>${esc(g.name)}</b><span class="bar"><i style="--w:${(s / topSecs) * 100}%"></i></span></span><span class="tm">${fmtDur(s)}</span></li>`; }).join('')}</ol>
    </div>`);
  }

  // 5. Le rythme : jour et moment préférés
  const maxWd = Math.max(...d.wd, 1);
  const peakTxt = d.peak ? `Ton plus gros jour : le ${new Date(d.peak.t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}, ${fmtDur(d.peak.secs)}.` : '';
  const lg = d.longest ? byId(d.longest.key) : null;
  slides.push(`<div class="w w-rhythm" style="${palStyle(P.rhythm)}">
    <div class="w-copy">
      <p class="w-kick r1">Ton moment préféré</p>
      <h1 class="w-mega">${kinetic(`Le ${wdNames[bestDay]},`, 200)}<br><span class="w-hl">${kinetic(slotNames[bestSlot], 450)}</span></h1>
      ${peakTxt ? `<p class="w-lede r3">${esc(peakTxt)}</p>` : ''}
      ${lg ? `<p class="w-note r4">Plus longue session : ${fmtDur(d.longestDur)} sur ${esc(lg.name)}.</p>` : ''}
    </div>
    <div class="w-chart r2">
      <div class="w-week">${[1, 2, 3, 4, 5, 6, 0].map((i, k) => `<span class="${i === bestDay ? 'on' : ''}"><i style="--h:${(d.wd[i] / maxWd) * 100}%;--i:${k}"></i><b>${'DLMMJVS'[i]}</b></span>`).join('')}</div>
      <div class="w-slots">${[0, 1, 2, 3].map((i) => `<span class="${i === bestSlot ? 'on' : ''}"><b>${Math.round((d.hours[i] / (d.total || 1)) * 100)} %</b>${slotShort[i]}</span>`).join('')}</div>
    </div>
  </div>`);

  // 6. Les succès
  if (achs.length) {
    const games = new Set(achs.map((a) => a.game)).size;
    // Grille adaptée au nombre d'icônes : peu d'icônes = grandes icônes
    const icons = (c.achIcons || achs.map((a) => a.icon)).slice(0, 24);
    const cols = icons.length <= 3 ? Math.max(1, icons.length) : icons.length <= 8 ? 4 : 6;
    slides.push(`<div class="w w-ach" style="${palStyle(P.ach)}">
      <div class="w-copy">
        <p class="w-kick r1">Succès débloqués</p>
        <h1 class="w-giant r2"><span data-count="${achs.length}">0</span></h1>
        <p class="w-lede r3">Sur ${plural(games, 'jeu', 'jeux')}. Chacun mérité.</p>
        ${rare ? `<div class="w-rare r4">${(c.achIcons || []).includes(rare.icon) ? `<img src="${esc(rare.icon)}" alt="">` : ''}<span><em>${rare.global <= 25 ? 'Le plus rare' : 'Ton succès le plus rare'}</em><b>${esc(rare.name)}</b><small>${esc(rare.game)} · ${String(Math.round(rare.global * 10) / 10).replace('.', ',')} % des joueurs l’ont</small></span></div>` : ''}
      </div>
      ${icons.length && icons.length < 4 ? '<i class="w-spark s2"></i><i class="w-spark s3"></i>' : ''}${icons.length ? `<div class="w-icons" style="--cols:${cols};--sz:${cols <= 3 ? 12 : cols === 4 ? 8.4 : 6}">${icons.map((u, i) => `<img src="${esc(u)}" alt="" style="--i:${i}">`).join('')}</div>` : '<i class="w-spark s1"></i><i class="w-spark s2"></i>'}
    </div>`);
  }

  // 7. Les découvertes
  if (d.discovered.length) {
    const list = d.discovered.map((k) => gameOf(k)).filter((g) => g.art.cover).slice(0, 5);
    slides.push(`<div class="w w-fresh" style="${palStyle(P.fresh)}">
      <div class="w-copy">
        <p class="w-kick r1">Nouveaux venus</p>
        <h1 class="w-giant r2"><span data-count="${d.discovered.length}">0</span></h1>
        <p class="w-lede r3">${d.discovered.length > 1 ? 'jeux lancés pour la première fois.' : 'jeu lancé pour la première fois.'} De nouvelles histoires.</p>
      </div>
      <div class="w-fan">${list.map((g, i) => { const k = i - (list.length - 1) / 2; return `<img src="${esc(g.art.cover)}" alt="" style="--i:${i};--x:${k * 7}cqw;--y:${Math.abs(k) * 1.8}cqw;--r:${k * 8}deg">`; }).join('')}</div>
    </div>`);
  }

  // 8. Le profil
  slides.push(`<div class="w w-persona" style="${palStyle(P.persona)}">
    <div class="w-echo" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<span style="--i:${i}">${esc(pName)}</span>`).join('')}</div>
    <i class="w-spark s1"></i><i class="w-spark s2"></i><i class="w-spark s3"></i>
    <div class="w-copy w-center">
      <p class="w-kick r1">Ton profil de joueur</p>
      <h1 class="w-mega">${kinetic(pName, 300, 120)}</h1>
      <p class="w-lede r3">${esc(pText)}</p>
    </div>
  </div>`);

  // 9. Le résumé, à partager
  slides.push(`<div class="w w-outro" style="${palStyle(P.outro)}">
    <i class="w-blob w-blob-a"></i>
    <div class="w-copy">
      <p class="w-kick r1">${esc(range.label)}</p>
      <h1 class="w-title">${kinetic('À la prochaine.', 250)}</h1>
      <p class="w-lede r3">Garde ce résumé : image ou vidéo, avec les boutons sous la story.</p>
    </div>
    <div class="w-card r2">
      <div class="w-card-head">${top.art.cover ? `<img src="${esc(top.art.cover)}" alt="">` : ''}<div><p class="lbl">${esc(kind)} en jeu</p><p class="big">${fmtDur(d.total)}</p></div></div>
      <div class="w-card-grid">
        <div><p class="lbl">Top jeux</p><ol>${d.top.slice(0, 5).map(([k]) => `<li>${esc(gameOf(k).name)}</li>`).join('')}</ol></div>
        <div><p class="lbl">Profil</p><p class="mid">${esc(pName)}</p><p class="lbl">Moment préféré</p><p class="mid">${esc(`${wdNames[bestDay][0].toUpperCase()}${wdNames[bestDay].slice(1)}, ${slotNames[bestSlot]}`)}</p>${achs.length ? `<p class="lbl">Succès</p><p class="mid">${achs.length}</p>` : ''}</div>
      </div>
      <div class="w-card-foot"><span>${STORY_LOGO}CLRE-Launcher</span><span>${esc(range.label)}</span></div>
    </div>
  </div>`);
  return slides;
}

// ---------- Ouverture ----------
async function openStory() {
  const sessions = await api.sessions();
  const range = recapRange();
  const from = range.from.getTime() / 1000, to = range.to.getTime() / 1000;
  const d = periodData(sessions, from, to);
  if (!d.list.length) return toast(`Rien à raconter pour ${range.label.toLowerCase()}`);
  const prev = periodData(sessions, from - (to - from), from);
  const achs = await api.achRarity(await api.achPeriod(from, to)).catch(() => []);
  const rare = achs.filter((a) => a.global != null).sort((a, b) => a.global - b.global)[0];
  const [pName, pText] = persona(d, prev.total);
  const kind = { week: 'Ta semaine', month: 'Ton mois', year: 'Ton année' }[state.recap.mode] || 'Ta période';
  const top = gameOf(d.top[0][0]);
  const tintRgb = await api.artColor(top.art.cover || top.art.header).catch(() => null);
  const tint = tintRgb ? `rgb(${tintRgb.join(',')})` : '#7b5cff';
  const diff = prev.total ? Math.round(((d.total - prev.total) / prev.total) * 100) : null;
  toast('Préparation de ta story…');
  // Icônes de succès réellement disponibles (certaines manquent sur le serveur de Steam)
  const loads = (u) => new Promise((r) => { if (!u) return r(false); const im = new Image(); const t = setTimeout(() => r(false), 3000); im.onload = () => { clearTimeout(t); r(true); }; im.onerror = () => { clearTimeout(t); r(false); }; im.src = u; });
  const iconUrls = [...new Set(achs.map((a) => a.icon).filter(Boolean))].slice(0, 24);
  const okIcons = await Promise.all(iconUrls.map(loads));
  const achIcons = iconUrls.filter((_, i) => okIcons[i]);
  const slides = storySlides({ d, range, kind, top, tint, achs, rare, pName, pText, diff, achIcons });
  // Précharge les images pour qu'elles soient prêtes à l'apparition de chaque page (et dans la vidéo)
  const urls = [...new Set([...slides.join('').matchAll(/src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))];
  await Promise.race([Promise.all(urls.map((u) => new Promise((r) => { const im = new Image(); im.onload = im.onerror = r; im.src = u; }))), new Promise((r) => setTimeout(r, 4000))]);
  storyPlayer(slides, range.file);
}

// ---------- Lecteur ----------
function storyPlayer(slides, file) {
  const el = document.createElement('div');
  el.className = 'story';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Story récap');
  el.innerHTML = `<div class="story-stage" id="story-stage">
      <div class="story-bars">${slides.map(() => '<span><i></i></span>').join('')}</div>
      ${slides.map((s, i) => `<div class="story-slide" data-i="${i}">${s}</div>`).join('')}
      <button type="button" class="story-nav prev" aria-label="Page précédente"></button><button type="button" class="story-nav next" aria-label="Page suivante"></button>
    </div>
    <div class="story-tools">
      <button type="button" class="btn btn-glass" data-story="video">${ICONS.download || ''}Exporter en vidéo</button>
      <button type="button" class="btn btn-glass" data-story="png">Image de cette page</button>
      <button type="button" class="btn btn-glass" data-story="close">Fermer</button>
    </div>`;
  document.body.appendChild(el);
  // Une image qui ne charge pas disparaît au lieu de laisser un trou (jaquette ou icône manquante)
  el.querySelectorAll('.story-stage img').forEach((im) => im.addEventListener('error', () => im.remove(), { once: true }));
  const DUR = 6500;
  const stage = el.querySelector('#story-stage');
  const pages = [...el.querySelectorAll('.story-slide')];
  let i = -1, timer = null, recording = null;
  const bars = [...el.querySelectorAll('.story-bars i')];
  const show = (n) => {
    if (n >= slides.length) { if (recording) return recording.stop(); clearTimeout(timer); return; }
    i = Math.max(0, n);
    pages.forEach((s, k) => s.classList.toggle('active', k === i));
    // Les barres de progression prennent la couleur du texte de la page (lisibles sur fond clair ou foncé)
    const w = pages[i].querySelector('.w');
    stage.style.setProperty('--bar', (w && w.style.getPropertyValue('--fg')) || '#fff');
    bars.forEach((b, k) => { b.style.transition = 'none'; b.style.width = k < i ? '100%' : '0%'; });
    requestAnimationFrame(() => requestAnimationFrame(() => { bars[i].style.transition = `width ${DUR}ms linear`; bars[i].style.width = '100%'; }));
    pages[i].querySelectorAll('[data-count]').forEach((c) => countUp(c));
    clearTimeout(timer);
    timer = setTimeout(() => show(i + 1), DUR);
  };
  const close = () => { clearTimeout(timer); document.removeEventListener('keydown', onKey, true); el.classList.remove('on'); setTimeout(() => el.remove(), 300); };
  const onKey = (e) => {
    if (recording) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(i + 1); }
    if (e.key === 'ArrowLeft') show(i - 1);
  };
  document.addEventListener('keydown', onKey, true);
  el.querySelector('.prev').onclick = () => !recording && show(i - 1);
  el.querySelector('.next').onclick = () => !recording && show(i + 1);
  el.querySelector('.story-tools').onclick = async (e) => {
    const b = e.target.closest('[data-story]');
    if (!b || recording) return;
    if (b.dataset.story === 'close') return close();
    if (b.dataset.story === 'png') { const r = stage.getBoundingClientRect(); const f = await api.capture({ x: r.x, y: r.y, width: r.width, height: r.height }, `${file}-${i + 1}`); if (f) toast('Image enregistrée'); return; }
    if (b.dataset.story === 'video') {
      try { recording = await recordStory(el, () => show(0), (saved) => { recording = null; el.classList.remove('recording'); if (saved) toast('Vidéo enregistrée'); }, file); } catch (err) { recording = null; el.classList.remove('recording'); toast(`Export impossible : ${err.message}`); }
    }
  };
  requestAnimationFrame(() => { el.classList.add('on'); show(0); });
}

function countUp(c) {
  const target = parseFloat(String(c.dataset.count).replace(',', '.'));
  const dec = String(c.dataset.count).includes(',');
  const t0 = performance.now() + 300;
  const step = (t) => {
    const k = Math.max(0, Math.min(1, (t - t0) / 1600));
    const e = 1 - Math.pow(1 - k, 4);
    const v = target * e;
    c.textContent = dec ? String(Math.round(v * 10) / 10).replace('.', ',') : String(Math.round(v));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Filme la fenêtre, recadre la story en 1920×1080 et l'encode (MP4 si possible, sinon WebM)
async function recordStory(el, restart, done, file) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
  const v = document.createElement('video');
  v.muted = true; v.srcObject = stream; await v.play();
  const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  // Pas d'« avc1.640028 » (H.264 High 4.0) : Chromium le dit pris en charge mais n'en sort aucune image.
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) { stream.getTracks().forEach((t) => t.stop()); throw new Error('aucun format vidéo disponible'); }
  const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 14e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let raf = 0;
  const stage = el.querySelector('#story-stage');
  const draw = () => {
    const r = stage.getBoundingClientRect();
    const sx = v.videoWidth / window.innerWidth, sy = v.videoHeight / window.innerHeight;
    ctx.drawImage(v, r.x * sx, r.y * sy, r.width * sx, r.height * sy, 0, 0, 1920, 1080);
    raf = requestAnimationFrame(draw);
  };
  el.classList.add('recording');
  toast('Enregistrement de la story… laisse la fenêtre ouverte');
  draw();
  rec.start(500);
  restart();
  return {
    stop: () => {
      rec.onstop = async () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mime });
        // Une vidéo vide ne doit pas être proposée à l'enregistrement : on prévient à la place
        if (!blob.size) { toast('Export impossible : la vidéo est vide'); done(null); return; }
        const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
        try { done(await api.saveVideo(await blob.arrayBuffer(), file, ext)); } catch (err) { toast(`Export impossible : ${err.message}`); done(null); }
      };
      setTimeout(() => rec.stop(), 400);
    },
  };
}
