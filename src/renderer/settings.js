// Réglages façon « Réglages Système » de macOS : catégories à gauche avec icônes, listes groupées à droite,
// interrupteurs, recherche. On réorganise la page existante (mêmes champs, même enregistrement).
/* global state, api, esc, openSettings, toast, doAction */

const PI = (d) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PREF_CATS = [
  { id: 'account', title: 'Compte Steam', color: '#0a84ff', icon: PI('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'), legends: [], intro: 'Ta bibliothèque est lue directement dans les fichiers de Steam. Rien à connecter.' },
  { id: 'general', title: 'Général', color: '#8e8e93', icon: PI('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'), legends: ['Système'], intro: 'Comment le launcher se comporte avec Windows.' },
  { id: 'look', title: 'Apparence', color: '#5e5ce6', icon: PI('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor"/>'), legends: ['Apparence', 'Effets'], intro: 'Thème, couleur d’accent, taille des jaquettes et effets visuels.' },
  { id: 'notif', title: 'Notifications', color: '#ff453a', icon: PI('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'), legends: ['Notifications Windows'], intro: 'Choisis ce qui mérite de t’interrompre.' },
  { id: 'ingame', title: 'En jeu', color: '#30d158', icon: PI('<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.5a2.6 2.6 0 0 0 4.7 1.8L8.5 15h7l1.8 1.9a2.6 2.6 0 0 0 4.7-1.8l-.7-6.5a4 4 0 0 0-4-3.6Z"/>'), legends: ['Infos en jeu', 'Performances'], intro: 'Infos par-dessus le jeu, rappel de pause et mesure des performances.' },
  { id: 'saves', title: 'Sauvegardes', color: '#40c8e0', icon: PI('<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>'), legends: ['Sauvegardes de jeux'], intro: 'Des copies de sécurité de tes sauvegardes, faites toutes seules.' },
  { id: 'discord', title: 'Discord', color: '#5865f2', icon: PI('<path d="M8 12h.01M16 12h.01"/><path d="M7.5 17.5 6 20c-2-.6-3.6-1.6-4.5-2.5C1.3 12 2.5 7 5 4.5 6.6 3.8 8 3.4 9 3.2l.8 1.6a14 14 0 0 1 4.4 0l.8-1.6c1 .2 2.4.6 4 1.3 2.5 2.5 3.7 7.5 3.5 13-1 .9-2.5 1.9-4.5 2.5l-1.5-2.5"/><path d="M6.5 16c3.5 1.5 7.5 1.5 11 0"/>'), legends: ['Statut Discord'], intro: 'Ce que tes amis voient sur ton profil quand tu joues.' },
  { id: 'data', title: 'Mises à jour et données', color: '#ff9f0a', icon: PI('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'), legends: ['Mises à jour du launcher', 'Mes données'], intro: 'Versions du launcher, export et import de tes données.' },
  { id: 'about', title: 'À propos', color: '#636366', icon: PI('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'), legends: [], intro: '' },
];
// Titres des lignes sans libellé
const ROW_TITLES = [
  [(el) => el.matches('.swatches'), 'Couleur d’accent'],
  [(el) => el.querySelector('[name="theme"]'), 'Thème'],
  [(el) => el.querySelector('[name="coverSize"]'), 'Taille des jaquettes'],
  [(el) => el.querySelector('#backup-dir'), 'Dossier des copies'],
  [(el) => el.querySelector('[name="updateRepo"]'), 'Dépôt GitHub'],
  [(el) => el.querySelector('#pm-path'), 'PresentMon (FPS)'],
  [(el) => el.querySelector('#export-data'), 'Tes données'],
  [(el) => el.matches('input[name="discordId"]'), 'Application Discord'],
];
let prefCat = 'account';

function buildPrefs(dlg) {
  const form = dlg.querySelector('#settings-form');
  if (!form || form.classList.contains('prefs-form')) return;
  form.classList.add('prefs-form');
  dlg.classList.add('prefs');
  dlg.addEventListener('close', () => dlg.classList.remove('prefs'), { once: true });
  const lib = state.lib;
  const user = lib && lib.user ? lib.user : { name: 'Joueur' };
  const initials = String(user.name || '?').slice(0, 1).toUpperCase();
  const nGames = lib ? lib.games.length : 0;

  // Pages
  const panes = {};
  const main = document.createElement('div');
  main.className = 'prefs-main';
  for (const c of PREF_CATS) {
    const p = document.createElement('section');
    p.className = 'prefs-pane';
    p.dataset.cat = c.id;
    p.innerHTML = `<header class="prefs-head"><span class="pref-tile" style="--t:${c.color}">${c.icon}</span><div><h2>${esc(c.title)}</h2>${c.intro ? `<p>${esc(c.intro)}</p>` : ''}</div></header>`;
    panes[c.id] = p;
    main.appendChild(p);
  }

  // Compte : tout ce qui est avant le premier fieldset
  const acc = document.createElement('div');
  acc.className = 'group';
  acc.insertAdjacentHTML('beforeend', `<div class="acc-card"><span class="acc-av">${esc(initials)}</span><div><b>${esc(user.name || 'Joueur')}</b><span>${nGames} jeux · toutes plateformes</span></div></div>`);
  const fieldsets = [...form.querySelectorAll(':scope > fieldset')];
  for (const n of [...form.children]) {
    if (n.tagName === 'FIELDSET' || n.classList.contains('m-actions')) continue;
    if (n.tagName === 'H2' || (n.tagName === 'P' && !n.className)) { n.remove(); continue; }
    if (n.classList.contains('note')) { (/Plateformes/.test(n.textContent) ? panes.about : panes.about).appendChild(n); continue; }
    acc.appendChild(n);
  }
  panes.account.appendChild(acc);

  // Chaque fieldset devient une liste groupée dans sa catégorie
  for (const fs of fieldsets) {
    const legend = fs.querySelector('legend');
    const name = legend ? legend.textContent.trim() : '';
    const cat = PREF_CATS.find((c) => c.legends.includes(name)) || PREF_CATS.find((c) => c.id === 'general');
    const group = document.createElement('div');
    group.className = 'group';
    if (cat.legends.length > 1) group.insertAdjacentHTML('beforeend', `<div class="group-title">${esc(name)}</div>`);
    if (legend) legend.remove();
    fs.classList.add('prefs-fs');
    group.appendChild(fs);
    panes[cat.id].appendChild(group);
  }
  // Mise en lignes : libellé à gauche, contrôle à droite, aide en dessous
  main.querySelectorAll('.prefs-fs, .prefs-pane[data-cat="account"] .group').forEach((box) => {
    for (const el of [...box.children]) {
      if (el.classList.contains('group-title') || el.classList.contains('acc-card') || el.classList.contains('row')) continue;
      if (el.tagName === 'SMALL') { const prev = el.previousElementSibling; if (prev && prev.classList.contains('row')) { el.classList.add('row-help'); prev.appendChild(el); } else el.classList.add('row-help', 'solo'); continue; }
      if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
      if (el.matches('label.check') || (el.tagName === 'LABEL' && !el.matches('.field, .field-row') && el.querySelector('input[type="checkbox"]'))) { el.removeAttribute('style'); el.classList.add('row', 'row-switch'); const input = el.querySelector('input'); if (input) { const span = document.createElement('span'); span.className = 'row-label'; while (input.nextSibling) span.appendChild(input.nextSibling); el.prepend(span); el.appendChild(input); } continue; }
      if (el.matches('label.field, label.field-row')) { el.classList.add('row'); const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (t) { const s = document.createElement('span'); s.className = 'row-label'; s.textContent = t.textContent.trim(); t.replaceWith(s); } const sm = el.querySelector('small'); if (sm) { sm.classList.add('row-help'); el.appendChild(sm); } continue; }
      if (el.classList.contains('note')) { el.classList.add('row-note'); continue; }
      const title = (ROW_TITLES.find(([test]) => test(el)) || [])[1];
      const row = document.createElement('div');
      row.className = 'row';
      el.replaceWith(row);
      if (title) row.insertAdjacentHTML('beforeend', `<span class="row-label">${esc(title)}</span>`);
      row.appendChild(el);
      el.classList.add('row-ctl');
    }
  });
  // À propos
  panes.about.insertAdjacentHTML('afterbegin', '');
  const about = document.createElement('div');
  about.className = 'group about-card';
  about.innerHTML = `<div class="about-logo"><svg width="72" height="72" viewBox="0 0 256 256" aria-hidden="true"><rect x="8" y="8" width="240" height="240" rx="56" fill="#e9a23b"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" opacity="0.4" transform="rotate(-14 128 130)"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" transform="rotate(3 128 130)"/><path d="M114 108 L150 130 L114 152 Z" fill="#f5f5f7" stroke="#f5f5f7" stroke-width="12" stroke-linejoin="round" transform="rotate(3 128 130)"/></svg></div>
    <h3>CLRE-Launcher</h3><span class="ver">Version <span class="app-ver"></span></span>
    <div class="about-stats"><div><b>${nGames}</b><span>jeux</span></div><div><b>${lib ? (lib.platforms || []).filter((p) => p.count).length : 0}</b><span>plateformes</span></div><div><b>${lib ? lib.games.filter((g) => g.installed).length : 0}</b><span>installés</span></div></div>
    <button type="button" class="btn btn-ghost" data-pref-act="onboarding">Revoir le guide de bienvenue</button>`;
  panes.about.insertBefore(about, panes.about.children[1] || null);
  api.appVersion && api.appVersion().then((v) => { dlg.querySelectorAll('.app-ver').forEach((s) => { s.textContent = v; }); }).catch(() => {});

  // Barre latérale
  const side = document.createElement('nav');
  side.className = 'prefs-side';
  side.innerHTML = `<label class="prefs-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="search" placeholder="Rechercher" id="prefs-q" autocomplete="off"></label>
    <button type="button" class="prefs-me" data-pref-cat="account"><span class="acc-av">${esc(initials)}</span><span><b>${esc(user.name || 'Joueur')}</b><small>Compte Steam</small></span></button>
    <div class="prefs-cats">${PREF_CATS.filter((c) => c.id !== 'account').map((c, i) => `${[1, 4, 7].includes(i) ? '<div class="prefs-gap"></div>' : ''}<button type="button" data-pref-cat="${c.id}"><span class="pref-tile" style="--t:${c.color}">${c.icon}</span><span>${esc(c.title)}</span></button>`).join('')}</div>`;

  // Pied de page
  const actions = form.querySelector('.m-actions');
  const footer = document.createElement('div');
  footer.className = 'prefs-foot';
  footer.innerHTML = '<span class="prefs-dirty">Modifications non enregistrées</span>';
  if (actions) {
    footer.appendChild(actions);
    const save = actions.querySelector('[type="submit"]');
    if (save) { save.textContent = 'Enregistrer'; save.removeAttribute('style'); save.className = 'btn btn-primary'; }
  }
  main.appendChild(footer);
  form.prepend(side);
  form.appendChild(main);

  const show = (id) => {
    prefCat = id;
    form.querySelectorAll('.prefs-pane').forEach((p) => p.classList.toggle('on', p.dataset.cat === id));
    side.querySelectorAll('[data-pref-cat]').forEach((b) => b.classList.toggle('on', b.dataset.prefCat === id));
    main.scrollTop = 0;
  };
  side.addEventListener('click', (e) => { const b = e.target.closest('[data-pref-cat]'); if (b) { e.preventDefault(); form.classList.remove('searching'); side.querySelector('#prefs-q').value = ''; show(b.dataset.prefCat); } });
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-pref-act]'); if (!b) return; e.preventDefault(); dlg.close(); doAction(b.dataset.prefAct); });
  // Recherche : affiche toutes les lignes qui correspondent, toutes catégories confondues
  side.querySelector('#prefs-q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    form.classList.toggle('searching', !!q);
    side.querySelectorAll('[data-pref-cat]').forEach((b) => b.classList.toggle('on', !q && b.dataset.prefCat === prefCat));
    form.querySelectorAll('.prefs-pane').forEach((p) => {
      let any = false;
      p.querySelectorAll('.row, .group-title').forEach((r) => {
        const hit = !q || r.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
        r.classList.toggle('miss', !hit);
        if (hit && q && r.classList.contains('row')) any = true;
      });
      p.classList.toggle('hit', any);
    });
    side.querySelectorAll('[data-pref-cat]').forEach((b) => b.classList.toggle('dim', !!q && !form.querySelector(`.prefs-pane[data-cat="${b.dataset.prefCat}"].hit`)));
    if (!q) show(prefCat);
  });
  // Indique qu'il reste quelque chose à enregistrer
  form.addEventListener('input', (e) => { if (e.target.id !== 'prefs-q') form.classList.add('dirty'); });
  form.addEventListener('change', (e) => { if (e.target.id !== 'prefs-q') form.classList.add('dirty'); });
  show(prefCat);
}

// eslint-disable-next-line no-global-assign
const _openSettingsP = openSettings;
// eslint-disable-next-line no-global-assign
openSettings = async function () {
  await _openSettingsP();
  try { buildPrefs(document.getElementById('settings')); } catch (e) { console.error('prefs', e && e.stack); }
};
// Le bouton du profil appelle la fonction d'origine : on le rebranche
document.getElementById('profile-btn').addEventListener('click', (e) => { e.stopImmediatePropagation(); openSettings(); }, true);
