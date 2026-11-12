// Soirées jeu entre amis : planifier, retrouver les jeux en commun, rappels, invitation à copier.
/* global state, api, VIEWS, ICONS, esc, render, go, load, loading, emptyBox, byId, games, toast, toastUndo, modal, doAction,
   gamePanels, tagName */

Object.assign(ICONS, { party: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9.5 15 1.8 1.8L15 13"/></svg>' });
state.cache.parties = undefined;
const partyList = () => { const p = load('parties', null, () => api.partyList()); return Array.isArray(p) ? p : p === 'loading' ? 'loading' : []; };
api.onPartiesChanged(() => { delete state.cache.parties; render({ quiet: true }); });
const refreshParties = () => { delete state.cache.parties; render({ quiet: true }); };

const MULTI = /multijoueur|coop|en ligne|jcj|massivement|battle royale/i;
const isMulti = (g) => MULTI.test((g.tags || []).map((t) => tagName(t)).join(' '));
const pad2 = (n) => String(n).padStart(2, '0');
function whenText(t) {
  const d = new Date(t);
  const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffD = Math.round((day(d) - day(now)) / 86400000);
  const h = `${d.getHours()}h${d.getMinutes() ? pad2(d.getMinutes()) : ''}`;
  const label = diffD === 0 ? 'Ce soir' : diffD === 1 ? 'Demain' : diffD > 1 && diffD < 7 ? d.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (c) => c.toUpperCase()) : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${diffD === 0 && d.getHours() < 18 ? 'Aujourd’hui' : label} à ${h}`;
}
function countdown(t) {
  const ms = t - Date.now();
  if (ms <= 0) return ms > -3 * 3600000 ? 'En cours' : 'Terminée';
  const m = Math.round(ms / 60000);
  if (m < 60) return `dans ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `dans ${h}h`;
  return `dans ${Math.round(h / 24)} jours`;
}
function inviteText(ev) {
  const g = byId(ev.key);
  const d = new Date(ev.time);
  const date = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const appid = g && (g.store === 'steam' ? g.appid : g.steamAppId);
  return `Soirée ${ev.name} ${date} à ${d.getHours()}h${d.getMinutes() ? pad2(d.getMinutes()) : ''}. Tu viens ?${ev.note ? `\n${ev.note}` : ''}${appid ? `\nhttps://store.steampowered.com/app/${appid}` : ''}`;
}
async function copyInvite(ev) {
  try { await navigator.clipboard.writeText(inviteText(ev)); toast('Invitation copiée · colle-la sur Discord ou Steam'); } catch { toast('Impossible de copier l’invitation'); }
}

function partyCard(ev, big) {
  const g = byId(ev.key);
  const img = g ? g.art.hero || g.art.header : '';
  const live = ev.time <= Date.now() && ev.time > Date.now() - 3 * 3600000;
  const friends = ev.friends || [];
  return `<article class="party-card ${big ? 'big' : ''} ${live ? 'live' : ''}">
    ${img ? `<img class="pc-bg" src="${esc(img)}" alt="">` : ''}<div class="pc-shade"></div>
    <div class="pc-body">
      <span class="pc-when">${live ? '<span class="lamp live"></span>' : ''}${esc(whenText(ev.time))} · ${esc(countdown(ev.time))}</span>
      <h3>${esc(ev.name)}</h3>
      ${friends.length ? `<div class="pc-friends">${friends.slice(0, 6).map((f) => (f.avatar ? `<img src="${esc(f.avatar)}" alt="" title="${esc(f.name)}">` : `<span title="${esc(f.name)}">${esc(f.name.slice(0, 1).toUpperCase())}</span>`)).join('')}<em>${esc(friends.map((f) => f.name).slice(0, 3).join(', '))}${friends.length > 3 ? ` et ${friends.length - 3} autre${friends.length > 4 ? 's' : ''}` : ''}</em></div>` : '<div class="pc-friends"><em>Invite tes amis avec l’invitation à copier</em></div>'}
      ${ev.note ? `<p class="pc-note">${esc(ev.note)}</p>` : ''}
      <div class="actions">
        ${g && g.installed ? `<button type="button" class="btn ${live ? 'btn-primary' : 'btn-glass'}" data-act="play" data-id="${esc(g.key)}">${ICONS.play}Jouer</button>` : g ? `<button type="button" class="btn btn-glass" data-act="install" data-id="${esc(g.key)}">${ICONS.download}Installer</button>` : ''}
        <button type="button" class="btn btn-glass" data-party-copy="${esc(ev.id)}">Copier l’invitation</button>
        <button type="button" class="btn btn-glass btn-sq" data-party-edit="${esc(ev.id)}" aria-label="Modifier" title="Modifier"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button type="button" class="btn btn-glass btn-sq" data-party-del="${esc(ev.id)}" aria-label="Supprimer" title="Supprimer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
      </div>
    </div></article>`;
}

VIEWS.party = () => {
  const list = partyList();
  const head = `<div class="toolbar"><div class="stack-6"><h1>Soirées jeu</h1><span class="sub">Planifie une partie avec tes amis : rappel avant, invitation à copier</span></div><button type="button" class="btn btn-primary" data-act="party-plan">${ICONS.plus || ''}Planifier une soirée</button></div>`;
  if (list === 'loading') return head + loading();
  const now = Date.now();
  const next = list.filter((e) => e.time > now - 3 * 3600000);
  if (!next.length) {
    const ideas = games().filter((g) => g.installed && isMulti(g)).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)).slice(0, 6);
    return head + `<div class="party-empty"><div class="pe-ic">${ICONS.party}</div><h2>Aucune soirée prévue</h2><p>Choisis un jeu, une heure et tes amis. Le launcher te prévient avant et te prépare l’invitation.</p>
      <button type="button" class="btn btn-primary" data-act="party-plan">Planifier une soirée</button></div>
      ${ideas.length ? `<section class="stack"><h2 class="section">Des idées, parmi tes jeux multijoueur installés</h2><div class="grid">${ideas.map((g) => `<button type="button" class="card" data-act="party-plan" data-id="${esc(g.key)}"><div class="cover"><img src="${esc(g.art.cover)}" alt="" loading="lazy"></div><span class="t">${esc(g.name)}</span><span class="s">Planifier une soirée</span></button>`).join('')}</div></section>` : ''}`;
  }
  return head + `<div class="party-list">${next.map((e, i) => partyCard(e, i === 0)).join('')}</div>`;
};

// ---------- Planificateur ----------
let friendsCache = null;
async function openPlanner(key, editId) {
  const ev = editId ? (partyList() || []).find((e) => e.id === editId) : null;
  const g0 = byId(key || (ev && ev.key));
  const base = ev ? new Date(ev.time) : (() => { const d = new Date(); d.setHours(21, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; })();
  const dateVal = `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
  const timeVal = `${pad2(base.getHours())}:${pad2(base.getMinutes())}`;
  const all = games().slice().sort((a, b) => (isMulti(b) - isMulti(a)) || (b.lastPlayed || 0) - (a.lastPlayed || 0));
  const hasKey = !!(state.lib && state.lib.hasApiKey);
  const chosen = new Map((ev ? ev.friends : []).map((f) => [f.id || f.name, f]));
  modal(`<div class="planner">
    <h2>${ev ? 'Modifier la soirée' : 'Planifier une soirée jeu'}</h2>
    <label class="field">Jeu<input name="game" list="pl-games" value="${esc(g0 ? g0.name : (ev ? ev.name : ''))}" placeholder="Choisis un jeu de ta bibliothèque" required autocomplete="off"></label>
    <datalist id="pl-games">${all.map((g) => `<option value="${esc(g.name)}">${isMulti(g) ? 'Multijoueur' : ''}</option>`).join('')}</datalist>
    <div class="pl-row"><label class="field">Jour<input type="date" name="date" value="${dateVal}" required></label><label class="field">Heure<input type="time" name="time" value="${timeVal}" required></label>
      <label class="field">Rappel<select name="remind">${[[0, 'Aucun'], [10, '10 min avant'], [15, '15 min avant'], [30, '30 min avant'], [60, '1 h avant']].map(([v, l]) => `<option value="${v}" ${Number(ev ? ev.remind : 15) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="field"><span>Avec qui</span>
      ${hasKey ? '<div class="pl-friends" id="pl-friends"><div class="skeleton" style="height:56px"></div></div>' : `<input name="names" value="${esc((ev ? ev.friends : []).map((f) => f.name).join(', '))}" placeholder="Prénoms séparés par des virgules"><small>Ajoute ta clé Steam Web API dans les réglages pour choisir parmi tes amis Steam et trouver vos jeux en commun</small>`}
    </div>
    ${hasKey ? '<div class="pl-common" id="pl-common"></div>' : ''}
    <label class="field">Note (facultatif)<input name="note" maxlength="200" value="${esc(ev ? ev.note : '')}" placeholder="Ex. : on finit la campagne, vocal sur Discord"></label>
    <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-primary">${ev ? 'Enregistrer' : 'Planifier'}</button></div></div>`,
  async (dlg, form) => {
    dlg.classList.add('planner-dlg');
    dlg.addEventListener('close', () => dlg.classList.remove('planner-dlg'), { once: true });
    if (hasKey) {
      const box = form.querySelector('#pl-friends');
      const common = form.querySelector('#pl-common');
      if (!friendsCache) friendsCache = await api.friends().catch(() => ({ error: 'Amis indisponibles' }));
      const fl = friendsCache && friendsCache.list ? friendsCache.list.slice().sort((a, b) => (b.state > 0) - (a.state > 0) || a.name.localeCompare(b.name)) : [];
      if (!fl.length) box.innerHTML = `<small>${esc((friendsCache && friendsCache.error) || 'Aucun ami trouvé')}</small>`;
      else {
        box.innerHTML = fl.map((f) => `<button type="button" class="pl-friend ${chosen.has(f.id) ? 'on' : ''}" data-fid="${esc(f.id)}"><img src="${esc(f.avatar)}" alt=""><span>${esc(f.name)}</span>${f.state ? '<i class="on"></i>' : ''}</button>`).join('');
        box.onclick = (e) => {
          const b = e.target.closest('[data-fid]');
          if (!b) return;
          const f = fl.find((x) => x.id === b.dataset.fid);
          if (chosen.has(f.id)) chosen.delete(f.id); else chosen.set(f.id, { id: f.id, name: f.name, avatar: f.avatar });
          b.classList.toggle('on', chosen.has(f.id));
          findCommon();
        };
      }
      let seq = 0;
      const findCommon = async () => {
        const ids = [...chosen.keys()].filter((k) => /^\d{17}$/.test(k));
        if (!ids.length) { common.innerHTML = ''; return; }
        const n = ++seq;
        common.innerHTML = '<span class="pl-k">Vos jeux en commun</span><div class="skeleton" style="height:40px"></div>';
        const r = await api.partyCommon(ids);
        if (n !== seq) return;
        if (!r || r.error) { common.innerHTML = ''; return; }
        const priv = r.privateIds.length ? `<small>${r.privateIds.length} ami${r.privateIds.length > 1 ? 's ont' : ' a'} une bibliothèque privée : leurs jeux ne sont pas pris en compte</small>` : '';
        common.innerHTML = `<span class="pl-k">Vos jeux en commun${r.checked > 1 ? ` (avec tous : ${r.games.filter((x) => x.n === r.checked).length})` : ''}</span>
          ${r.games.length ? `<div class="pl-chips">${r.games.slice(0, 16).map((x) => { const g = byId(x.key); return g ? `<button type="button" class="tag-toggle ${x.n === r.checked ? 'all' : ''}" data-pick="${esc(g.name)}" title="${x.n}/${r.checked} amis l’ont">${esc(g.name)}${x.multi ? ' · multi' : ''}</button>` : ''; }).join('')}</div>` : '<small>Aucun jeu Steam en commun trouvé</small>'}${priv}`;
      };
      common.onclick = (e) => { const b = e.target.closest('[data-pick]'); if (b) form.elements.game.value = b.dataset.pick; };
      findCommon();
    }
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const name = String(f.get('game') || '').trim();
      const g = games().find((x) => x.name.toLowerCase() === name.toLowerCase());
      const [y, mo, d] = String(f.get('date')).split('-').map(Number);
      const [h, mi] = String(f.get('time')).split(':').map(Number);
      const time = new Date(y, mo - 1, d, h, mi).getTime();
      const friends = hasKey ? [...chosen.values()] : String(f.get('names') || '').split(',').map((x) => x.trim()).filter(Boolean).map((n) => ({ name: n }));
      const saved = await api.partySave({ id: ev && ev.id, key: g ? g.key : '', name: g ? g.name : name, time, friends, note: String(f.get('note') || ''), remind: Number(f.get('remind')) });
      dlg.close();
      refreshParties();
      if (state.route.view !== 'party') go({ view: 'party' });
      toastUndo(`Soirée ${saved.name} planifiée · ${whenText(saved.time).toLowerCase()}`, () => { api.partyRemove(saved.id).then(refreshParties); });
    };
  });
}

// ---------- Actions et clics ----------
const _doAction7 = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  if (act === 'party-plan') return openPlanner(id);
  return _doAction7(act, id, el);
};
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-party-copy],[data-party-edit],[data-party-del]');
  if (!t) return;
  e.stopPropagation();
  const list = partyList() || [];
  const ev = list.find((x) => x.id === (t.dataset.partyCopy || t.dataset.partyEdit || t.dataset.partyDel));
  if (!ev) return;
  if (t.dataset.partyCopy) return copyInvite(ev);
  if (t.dataset.partyEdit) return openPlanner(ev.key, ev.id);
  await api.partyRemove(ev.id);
  refreshParties();
  toastUndo(`Soirée ${ev.name} supprimée`, () => api.partySave({ ...ev, id: undefined }).then(refreshParties));
}, true);

// La prochaine soirée s'affiche sur l'accueil (dans les 48 h)
const _render7 = render;
// eslint-disable-next-line no-global-assign
render = function (opts) {
  _render7(opts);
  if (state.route.view !== 'home') return;
  const list = partyList();
  if (!Array.isArray(list)) return;
  const next = list.find((e) => e.time > Date.now() - 3 * 3600000 && e.time < Date.now() + 48 * 3600000);
  const hero = document.getElementById('home-hero');
  if (!next || !hero || document.getElementById('home-party')) return;
  hero.insertAdjacentHTML('afterend', `<section class="stack" id="home-party"><div class="section-head"><h2 class="section">Ta prochaine soirée</h2><button type="button" class="link-btn" data-nav="party">Toutes les soirées</button></div>${partyCard(next, false)}</section>`);
};

// Panneau sur la fiche des jeux multijoueur
const _gamePanels7 = gamePanels;
// eslint-disable-next-line no-global-assign
gamePanels = function (g) {
  const html = _gamePanels7(g);
  if (!isMulti(g)) return html;
  const next = (partyList() || []).filter && (partyList() || []).find((e) => e.key === g.key && e.time > Date.now() - 3 * 3600000);
  return `<section class="panel"><h2>Soirée jeu</h2>${next ? `<p class="small">${esc(whenText(next.time))} · ${esc(countdown(next.time))}</p><div class="actions"><button type="button" class="btn btn-ghost" data-party-copy="${esc(next.id)}">Copier l’invitation</button><button type="button" class="btn btn-ghost" data-nav="party">Voir</button></div>` : `<p class="small">Joue à ${esc(g.name)} avec tes amis : choisis une heure, le launcher te prévient.</p><button type="button" class="btn btn-ghost" data-act="party-plan" data-id="${esc(g.key)}">${ICONS.party}Planifier une soirée</button>`}</section>` + html;
};
