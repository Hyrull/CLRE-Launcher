// Téléchargements : Steam, GOG et Epic au même endroit.
// - « En cours » : une grande carte par téléchargement actif (progression, vitesse, temps restant).
// - « À suivre » : file d'attente, pauses et erreurs, avec leurs boutons.
// - « Terminés » : ce qui vient de finir, avec « Jouer ».
// - « Mises à jour prévues par Steam » : repliées, elles ne comptent pas comme des téléchargements.
// La page se dessine une fois, puis seuls les chiffres et les barres bougent à chaque relevé.
/* global state, api, esc, toast, render, renderSidebar, byId, fmtSize, fallbackBg, ICONS, VIEWS, sync, doAction */

const DL_STORE = { steam: 'Steam', gog: 'GOG', epic: 'Epic' };
const DONE_KEY = 'clre-dl-done';
state.downloads = state.downloads || [];
state.dlDone = (() => { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '[]').filter((x) => x.t > Date.now() - 86400e3); } catch { return []; } })();
const dlCancelled = new Set();

const dlLive = () => state.downloads.filter((d) => d.phase !== 'scheduled');
const dlScheduled = () => state.downloads.filter((d) => d.phase === 'scheduled');
// Compteur de la barre latérale : seulement ce qui télécharge ou attend vraiment
function dlCount() { return dlLive().length; }

function fmtEta(sec) {
  if (!isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return 'moins d’une minute';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

// « il y a 5 min », « il y a 2 h », « hier »
function fmtAgo(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `il y a ${h} h` : 'hier';
}
// Petites tailles : « 0 Mo » ne veut rien dire
const dlSize = (b) => (b && b < 1e6 ? 'moins de 1 Mo' : fmtSize(b));

function dlGame(d) { return byId(d.key) || { key: d.key, name: d.name, art: {}, store: d.store }; }
const dlArt = (g) => (g.art && (g.art.header || g.art.hero || g.art.cover)) || '';

// Texte d'état d'un téléchargement, sans les boutons
function dlLine(d) {
  const pct = Math.round((d.progress || 0) * 100);
  const size = d.total ? `${fmtSize(d.bytes || 0)} sur ${fmtSize(d.total)}` : d.remaining ? `${fmtSize(d.remaining)} restants` : '';
  switch (d.phase) {
    case 'downloading': {
      const eta = d.speed && d.remaining ? fmtEta(d.remaining / d.speed) : '';
      return [`${pct} %`, size, d.speed ? `${fmtSize(d.speed)}/s` : '', eta ? `reste ${eta}` : ''].filter(Boolean).join(' · ');
    }
    case 'installing':
      return d.store === 'gog' ? 'Installation… accepte l’autorisation de Windows si elle s’affiche'
        : d.store === 'epic' ? 'Finalisation de l’installation…' : 'Installation des fichiers…';
    case 'queued': return pct ? `En file d’attente · ${pct} %` : 'En file d’attente';
    case 'paused': return `En pause · ${pct} %${size ? ` · ${size}` : ''}`;
    case 'error': return d.error || 'Erreur';
    case 'scheduled': return d.remaining ? `${dlSize(d.remaining)} à télécharger` : 'Prévue';
    default: return '';
  }
}

function dlButtons(d) {
  if (d.store === 'steam') {
    // Mise à jour seulement prévue : steam://install ne fait rien sur un jeu installé, mais la vérification
    // des fichiers (steam://validate) télécharge la mise à jour en attente tout de suite.
    if (d.phase === 'scheduled') return `<button type="button" class="btn btn-ghost dl-btn" data-steam="steam://validate/${encodeURIComponent(d.key)}">Mettre à jour</button>`;
    return `<button type="button" class="btn btn-ghost dl-btn" data-steam="steam://open/downloads">Gérer dans Steam</button>`;
  }
  if (d.phase === 'installing') return '';
  const b = (act, label, cls = '') => `<button type="button" class="btn btn-ghost dl-btn ${cls}" data-act="dl-${act}" data-id="${esc(d.key)}">${label}</button>`;
  const main = d.phase === 'downloading' || d.phase === 'queued' ? b('pause', 'Pause')
    : b('resume', d.phase === 'error' ? 'Réessayer' : 'Reprendre');
  return main + b('cancel', 'Annuler', 'dl-cancel');
}

const dlKindLabel = (d) => (d.kind === 'update' ? 'Mise à jour' : 'Installation');
const dlChip = (d) => `<span class="dl-chip">${esc(DL_STORE[d.store] || '')}</span><span class="dl-kind">${dlKindLabel(d)}</span>`;
const dlBar = (d, big) => `<div class="dl-bar ${big ? 'big' : ''} ph-${d.phase}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((d.progress || 0) * 100)}"><div style="width:${Math.max(1.5, (d.progress || 0) * 100)}%"></div></div>`;

// Grande carte « En cours »
function dlHero(d) {
  const g = dlGame(d);
  const art = dlArt(g);
  return `<article class="dl-hero" data-dl="${esc(d.key)}">
    <button type="button" class="dl-hero-art" data-open="${esc(g.key)}" aria-label="Ouvrir la fiche de ${esc(g.name)}" style="background:${fallbackBg(g)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : ''}</button>
    <div class="dl-hero-body">
      <div class="dl-meta">${dlChip(d)}</div>
      <h2 class="dl-title">${esc(g.name || d.name)}</h2>
      ${dlBar(d, true)}
      <div class="dl-foot"><span class="dl-line num">${esc(dlLine(d))}</span><span class="dl-actions">${dlButtons(d)}</span></div>
    </div>
  </article>`;
}

// Ligne compacte (file d'attente, accueil)
function downloadRow(d) {
  const g = dlGame(d);
  const art = dlArt(g);
  return `<div class="dl-item ph-${d.phase}" data-dl="${esc(d.key)}">
    <button type="button" class="dl-thumb" data-open="${esc(g.key)}" aria-label="Ouvrir la fiche de ${esc(g.name)}" style="background:${fallbackBg(g)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : ''}</button>
    <div class="dl-item-body">
      <div class="dl-item-top"><span class="dl-name">${esc(g.name || d.name)}</span><span class="dl-meta">${dlChip(d)}</span></div>
      ${dlBar(d)}
      <span class="dl-line num">${esc(dlLine(d))}</span>
    </div>
    <span class="dl-actions">${dlButtons(d)}</span>
  </div>`;
}

function doneRow(x) {
  const g = byId(x.key) || { key: x.key, name: x.name, art: {} };
  const art = dlArt(g);
  return `<div class="dl-item dl-done">
    <button type="button" class="dl-thumb" data-open="${esc(g.key)}" aria-label="Ouvrir la fiche de ${esc(g.name)}" style="background:${fallbackBg(g)}">${art ? `<img src="${esc(art)}" alt="" loading="lazy">` : ''}</button>
    <div class="dl-item-body">
      <div class="dl-item-top"><span class="dl-name">${esc(g.name || x.name)}</span></div>
      <span class="dl-line">${x.kind === 'update' ? 'Mis à jour' : 'Installé'} ${esc(fmtAgo(x.t))}</span>
    </div>
    <span class="dl-actions">${g.installed ? `<button type="button" class="btn btn-light dl-btn" data-act="play" data-id="${esc(g.key)}">${ICONS.play}Jouer</button>` : ''}</span>
  </div>`;
}

// Étagère de l'accueil : seulement ce qui bouge vraiment
function downloadsShelf() {
  const list = dlLive().sort(dlOrder);
  if (!list.length) return '';
  return `<section class="stack">
    <div class="section-head"><h2 class="section">Téléchargements</h2><button type="button" class="link-btn" data-nav="downloads">Tout voir</button></div>
    <div class="dl-list">${list.slice(0, 3).map(downloadRow).join('')}</div>
  </section>`;
}

const PHASE_ORDER = { downloading: 0, installing: 1, error: 2, queued: 3, paused: 4, scheduled: 5 };
const dlOrder = (a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || (b.progress || 0) - (a.progress || 0);

VIEWS.downloads = () => {
  const live = dlLive().sort(dlOrder);
  const active = live.filter((d) => d.phase === 'downloading' || d.phase === 'installing');
  const next = live.filter((d) => !active.includes(d));
  const sched = dlScheduled();
  const speed = live.reduce((s, d) => s + (d.speed || 0), 0);
  const sub = [
    active.length ? `${active.length} en cours` : '',
    next.length ? `${next.length} à suivre` : '',
    speed ? `${fmtSize(speed)}/s` : '',
  ].filter(Boolean).join(' · ') || 'Rien ne télécharge en ce moment';
  const done = state.dlDone.slice(0, 6);
  const reinstall = games().filter((g) => !g.installed && g.lastPlayed && ['steam', 'epic', 'gog'].includes(g.store)).sort(byRecent).slice(0, 6);
  const section = (title, body, extra = '') => `<section class="stack dl-sec"><div class="section-head"><h2 class="section">${title}</h2>${extra}</div>${body}</section>`;
  return `<div class="toolbar"><div class="stack-6"><h1>Téléchargements</h1><span class="sub num" id="dl-sub">${esc(sub)}</span></div></div>
    ${active.length ? section('En cours', `<div class="dl-heroes">${active.map(dlHero).join('')}</div>`) : ''}
    ${!live.length ? `<div class="dl-empty"><span class="dl-empty-ic">${ICONS.download}</span><div><b>Aucun téléchargement</b><span>Installe un jeu depuis sa fiche : Steam, GOG et Epic s’affichent ici en direct.</span></div></div>` : ''}
    ${!live.length && reinstall.length ? section('À réinstaller ?', `<p class="section-sub">Joués ces derniers mois, plus sur ton disque</p><div class="grid">${reinstall.map((g) => coverCard(g)).join('')}</div>`) : ''}
    ${next.length ? section('À suivre', `<div class="dl-list">${next.map(downloadRow).join('')}</div>`) : ''}
    ${done.length ? section('Terminés', `<div class="dl-list">${done.map(doneRow).join('')}</div>`, '<button type="button" class="link-btn" data-act="dl-clear-done">Effacer</button>') : ''}
    ${sched.length ? `<details class="dl-sched"${state.dlSchedOpen ? ' open' : ''}>
      <summary><span>Mises à jour prévues par Steam</span><span class="dl-count num">${sched.length}</span></summary>
      <p class="dl-sched-note">Steam les télécharge tout seul, souvent la nuit ou au lancement du jeu. « Mettre à jour » la lance tout de suite : Steam vérifie d’abord les fichiers du jeu, ce qui prend un moment sur les gros jeux.</p>
      <div class="dl-list compact">${sched.map(downloadRow).join('')}</div>
      <button type="button" class="link-btn" data-steam="steam://open/downloads">Ouvrir les téléchargements de Steam</button>
    </details>` : ''}`;
};

// ---------- Actions ----------
const _doActionDl = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  const d = id ? state.downloads.find((x) => x.key === id) : null;
  const call = (k) => (d && d.store === 'gog' ? api[`gog${k}`] : api[`epic${k}`])(id);
  if (act === 'dl-pause') return call('Pause');
  if (act === 'dl-resume') return call('Resume');
  if (act === 'dl-cancel') {
    // Deux clics : le premier arme le bouton, le second annule (les fichiers téléchargés sont supprimés)
    if (!el.dataset.armed) {
      el.dataset.armed = '1';
      el.textContent = 'Confirmer ?';
      el.classList.add('armed');
      setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = 'Annuler'; el.classList.remove('armed'); } }, 3500);
      return undefined;
    }
    dlCancelled.add(id);
    toast(`${d ? d.name : 'Téléchargement'} annulé`);
    return call('Cancel');
  }
  if (act === 'dl-clear-done') { state.dlDone = []; saveDone(); return render({ quiet: true }); }
  return _doActionDl(act, id, el);
};
document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('dl-sched')) state.dlSchedOpen = e.target.open; }, true);

function saveDone() { try { localStorage.setItem(DONE_KEY, JSON.stringify(state.dlDone.slice(0, 12))); } catch { /* stockage indisponible */ } }

// ---------- Mise à jour en direct ----------
// Structure = quels téléchargements, dans quelle étape. Si elle ne change pas, on met juste à jour
// les barres et les textes, sans redessiner la page (pas de saut, pas de survol perdu).
const dlShape = (list) => list.map((d) => `${d.key}:${d.phase}`).sort().join('|');
let pendingDone = [];

function patchDownloads() {
  for (const d of state.downloads) {
    const pct = Math.round((d.progress || 0) * 100);
    document.querySelectorAll(`[data-dl="${CSS.escape(d.key)}"]`).forEach((row) => {
      const bar = row.querySelector('.dl-bar');
      if (bar) { bar.setAttribute('aria-valuenow', pct); bar.firstElementChild.style.width = `${Math.max(1.5, (d.progress || 0) * 100)}%`; }
      const line = row.querySelector('.dl-line');
      if (line) line.textContent = dlLine(d);
    });
    const cover = document.querySelector(`.card[data-open="${CSS.escape(d.key)}"] .cover-dl > div`);
    if (cover) cover.style.width = `${pct}%`;
  }
  const sub = document.getElementById('dl-sub');
  if (sub) {
    const live = dlLive();
    const active = live.filter((d) => d.phase === 'downloading' || d.phase === 'installing').length;
    const speed = live.reduce((s, d) => s + (d.speed || 0), 0);
    sub.textContent = [active ? `${active} en cours` : '', live.length - active ? `${live.length - active} à suivre` : '', speed ? `${fmtSize(speed)}/s` : ''].filter(Boolean).join(' · ') || 'Rien ne télécharge en ce moment';
  }
}

api.onDownloads((list) => {
  const before = state.downloads;
  state.downloads = list || [];
  // Ce qui a vraiment commencé et qui disparaît : terminé, sauf si on vient de l'annuler
  const gone = before.filter((d) => d.phase !== 'scheduled' && !state.downloads.some((x) => x.key === d.key));
  for (const d of gone) {
    if (dlCancelled.delete(d.key)) continue;
    pendingDone.push(d);
  }
  if (pendingDone.length) {
    const names = pendingDone.map((d) => d.name);
    toast(names.length === 1 ? `${names[0]} est prêt` : `${names.length} téléchargements terminés`);
    sync(true).then(() => {
      for (const d of pendingDone.splice(0)) {
        const g = byId(d.key);
        if (g && !g.installed) continue; // annulé côté Steam
        state.dlDone = [{ key: d.key, name: d.name, kind: d.kind, t: Date.now() }, ...state.dlDone.filter((x) => x.key !== d.key)];
      }
      saveDone();
      if (state.route.view === 'downloads') render({ quiet: true });
    });
  }
  const shapeChanged = dlShape(before) !== dlShape(state.downloads);
  if (shapeChanged && ['home', 'downloads'].includes(state.route.view)) render({ quiet: true });
  else {
    if (shapeChanged && state.lib) renderSidebar();
    patchDownloads();
  }
});
api.downloads().then((l) => { state.downloads = l || []; if (state.lib) render({ quiet: true }); });
