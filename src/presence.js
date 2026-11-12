// Statut Discord : des phrases différentes selon le jeu (genre, progression, temps de jeu) qui tournent
// pendant la partie, et ce que tu fais dans le launcher quand tu n'es pas en jeu.
const STORE = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ubisoft: 'Ubisoft Connect', ea: 'EA app', xbox: 'Xbox', battlenet: 'Battle.net', riot: 'Riot', amazon: 'Amazon Games', itch: 'itch.io', custom: 'PC' };

// Phrases par genre, choisies d'après les tags Steam du jeu (noms en français)
const GENRES = [
  [/roguelike|roguelite|rogue-like/i, ['Encore une dernière run', 'Meurt, apprend, recommence', 'Cette run est la bonne']],
  [/battle royale/i, ['Vise le top 1', 'Saute du bus', 'Dernier cercle en vue']],
  [/fps|tir|shooter/i, ['En pleine fusillade', 'Vise la tête', 'Recharge à couvert']],
  [/grande stratégie|stratégie|4x|tactique/i, ['Prépare son prochain coup', 'Conquiert le monde, tranquillement', 'Réfléchit trois tours d’avance']],
  [/gestion|construction|bac à sable|automatisation|city builder|simulation/i, ['Optimise sa base', 'Construit quelque chose de grand', 'Encore une petite amélioration']],
  [/survie|fabrication/i, ['Survit tant bien que mal', 'Fabrique de quoi tenir la nuit', 'Cherche des ressources']],
  [/horreur/i, ['Joue les lumières éteintes', 'N’ose pas ouvrir cette porte', 'Garde son sang-froid']],
  [/course|sport|football|conduite/i, ['Au volant', 'Bat son record', 'Pied au plancher']],
  [/soulslike|difficile|impitoyable/i, ['Meurt pour la 47e fois', 'Apprend les patterns du boss', 'Ne lâche rien']],
  [/jeu de cartes|deckbuilding|cartes/i, ['Construit le deck parfait', 'Tire la bonne carte', 'Calcule son combo']],
  [/rpg|jeu de rôle/i, ['En pleine quête', 'Monte en niveau', 'Fouille chaque recoin']],
  [/monde ouvert|exploration|aventure/i, ['Explore le monde', 'Part à l’aventure', 'Se perd volontairement']],
  [/casse-tête|puzzle|réflexion/i, ['Se creuse la tête', 'A presque trouvé', 'Résout une énigme']],
  [/coop|multijoueur|jcj|en ligne/i, ['Joue avec l’équipe', 'En ligne', 'Porte l’équipe']],
  [/détente|casual|relaxant|mignon/i, ['Se détend', 'Prend son temps', 'Partie tranquille']],
  [/plateforme/i, ['Saute de plateforme en plateforme', 'Rate un saut, recommence']],
  [/rythme|musique/i, ['Garde le rythme', 'Vise le combo parfait']],
];

// Image accessible par Discord : les visuels Steam sont stockés en local, on prend leur adresse web
function webArt(g) {
  const appid = g.store === 'steam' ? g.appid : g.steamAppId;
  if (appid) return `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;
  return ['header', 'cover', 'hero'].map((k) => g.art[k]).find((u) => /^https:/.test(u || '')) || '';
}
// Logo de l'app : « logo » = image envoyée dans le portail développeur Discord (Rich Presence → Art Assets)
const LOGO = { small_image: 'logo', small_text: 'CLRE-Launcher' };
const fmtH = (min) => { const m = Math.round(min); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return h >= 100 || !r ? `${Math.round(m / 60)}h` : `${h}h${String(r).padStart(2, '0')}`; };
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

class Presence {
  constructor(discord, ctx) {
    this.discord = discord;
    this.ctx = ctx; // { settings, games, lib, local, howLong }
    this.mode = 'idle';
    this.i = 0;
    this.gameKey = null;
    this.gameStart = 0;
    this.browse = null;
    this.browseStart = Date.now();
    this.hiddenTimer = null;
    this.visible = true;
    this.last = '';
    this.timer = setInterval(() => { this.i++; this.push(); }, 40000);
  }
  enabled() { const st = this.ctx.settings(); return st.discordEnabled !== false && !!st.discordAppId; }

  // ---------- En jeu ----------
  gameLines(g) {
    const lines = [];
    const tags = (g.tags || []).map((t) => (this.ctx.lib() && this.ctx.lib().tagNames || {})[t] || '').filter(Boolean).join(' · ');
    const used = new Set();
    for (const [re, phrases] of GENRES) {
      if (re.test(tags) && !used.has(phrases)) { used.add(phrases); lines.push(...phrases.slice(0, 2)); }
      if (used.size >= 2) break;
    }
    if (g.ach && g.ach.total) lines.push(`Succès : ${g.ach.done}/${g.ach.total} (${Math.floor((g.ach.done / g.ach.total) * 100)} %)`);
    if (g.playtime >= 60) lines.push(`${fmtH(g.playtime)} au compteur`);
    else if (g.playtime < 30) lines.push('Découvre le jeu');
    const status = ((this.ctx.local() || {}).status || {})[g.key];
    if (status === 'done') lines.push('Déjà fini, y retourne pour le plaisir');
    if (status === 'playing') lines.push('Partie en cours, on avance');
    const hl = this.ctx.howLong && this.ctx.howLong(g.key);
    if (hl && hl.main) {
      const left = Math.round(hl.main / 60) - (g.playtime || 0);
      lines.push(left > 0 ? `Environ ${fmtH(left)} avant la fin de l’histoire` : 'A dépassé la durée de l’histoire');
    }
    if (!lines.length) lines.push(`Sur ${STORE[g.store] || 'PC'}`);
    return lines;
  }
  setGame(key) {
    if (key === this.gameKey) return;
    this.gameKey = key;
    this.gameStart = key ? Date.now() : 0;
    this.i = 0;
    this.push(true);
  }

  // ---------- Dans le launcher ----------
  setBrowse(ctx) { this.browse = ctx; this.push(); }
  setVisible(v) {
    clearTimeout(this.hiddenTimer);
    if (v) { if (!this.visible) this.browseStart = Date.now(); this.visible = true; this.push(); return; }
    // Fenêtre cachée : on garde le statut une minute, puis on l'efface (sauf en jeu)
    this.hiddenTimer = setTimeout(() => { this.visible = false; this.push(); }, 60000);
  }
  browseActivity() {
    const b = this.browse || { view: 'home' };
    const lib = this.ctx.lib();
    const all = this.ctx.games();
    const n = all.length;
    const inst = all.filter((g) => g.installed).length;
    const g = b.id ? all.find((x) => x.key === String(b.id)) : null;
    const big = (x) => { const u = x && webArt(x); return u ? { large_image: u, large_text: x.name, ...LOGO } : undefined; };
    const i = this.i;
    const V = {
      home: ['Choisit à quoi jouer', pick(['Hésite entre plusieurs jeux', `${inst} jeux prêts à lancer`, 'Regarde ce qu’il y a de bon ce soir'], i)],
      all: ['Parcourt sa bibliothèque', `${n} jeux, toutes plateformes`],
      installed: ['Regarde ses jeux installés', `${inst} jeux prêts à lancer`],
      favorites: ['Regarde ses favoris', `${all.filter((x) => x.favorite).length || ''} jeux préférés`.trim()],
      history: ['Se rappelle ses dernières parties', 'Historique de jeu'],
      search: ['Cherche un jeu', b.extra ? `« ${b.extra} »` : 'Dans sa bibliothèque'],
      journal: ['Feuillette son journal de joueur', 'Souvenirs de parties'],
      recap: ['Regarde son récap', b.extra || 'Temps de jeu de la période'],
      showcase: ['Admire sa vitrine de succès', b.extra || 'Ses succès les plus rares'],
      tags: ['Explore ses jeux par genre', b.extra || 'Tags Steam'],
      storage: ['Fait du rangement', 'Libère de la place sur ses disques'],
      saves: ['Vérifie ses sauvegardes', 'Rien ne se perd'],
      screenshots: ['Regarde ses captures', 'Les meilleurs moments'],
      downloads: ['Surveille ses téléchargements', b.extra || 'Bientôt prêt'],
      friends: ['Regarde qui est en ligne', 'Liste d’amis'],
      shop: ['Fait du lèche-vitrine', pick(['Sur le magasin Steam', 'Regarde les promos', 'Cherche son prochain jeu'], i)],
      wishlist: ['Regarde sa liste de souhaits', b.extra || 'En attendant les promos'],
      status: ['Organise sa progression', b.extra || 'À faire, en cours, terminé'],
      mycoll: ['Range ses jeux', b.extra ? `Collection « ${b.extra} »` : 'Ses collections'],
      collection: ['Range ses jeux', b.extra ? `Collection « ${b.extra} »` : 'Collections Steam'],
      store: ['Parcourt sa bibliothèque', b.extra ? `Ses jeux ${b.extra}` : `${n} jeux`],
    };
    if (b.couch) return { details: 'Mode canapé', state: 'Manette en main', assets: undefined };
    if (b.view === 'game' && g) {
      const lines = [`${fmtH(g.playtime || 0)} au compteur`, g.installed ? 'Hésite à le lancer' : 'Pense à l’installer'];
      if (g.ach && g.ach.total) lines.push(`Succès : ${g.ach.done}/${g.ach.total}`);
      return { details: `Regarde la fiche de ${g.name}`.slice(0, 120), state: pick(lines, i), assets: big(g) };
    }
    if (b.view === 'shopapp') return { details: `Regarde ${b.extra || 'un jeu'} sur le magasin`.slice(0, 120), state: b.price ? `${b.price}${b.discount ? ` · −${b.discount} %` : ''}` : 'Magasin Steam', assets: b.image ? { large_image: b.image, large_text: b.extra || 'Magasin', ...LOGO } : undefined };
    const [details, state] = V[b.view] || V.home;
    return { details, state: state || 'Dans le launcher', assets: undefined };
  }

  // ---------- Envoi ----------
  push(force) {
    if (!this.enabled()) { this.discord.set(null); return; }
    this.discord.connect(this.ctx.settings().discordAppId);
    let act = null;
    const g = this.gameKey ? this.ctx.games().find((x) => x.key === this.gameKey) : null;
    if (g) {
      const lines = this.gameLines(g);
      act = {
        details: g.name.slice(0, 120),
        state: pick(lines, this.i).slice(0, 120),
        timestamps: { start: this.gameStart },
        assets: webArt(g) ? { large_image: webArt(g), large_text: `${g.name} · ${STORE[g.store] || 'PC'}`, ...LOGO } : { large_image: 'logo', large_text: 'CLRE-Launcher' },
      };
      const appid = g.store === 'steam' ? g.appid : g.steamAppId;
      if (appid) act.buttons = [{ label: 'Voir le jeu sur Steam', url: `https://store.steampowered.com/app/${appid}` }];
    } else if (this.visible && this.ctx.settings().discordBrowse !== false) {
      const b = this.browseActivity();
      act = { details: b.details, state: b.state, timestamps: { start: this.browseStart }, assets: b.assets || { large_image: 'logo', large_text: 'CLRE-Launcher' } };
    }
    const sig = JSON.stringify(act);
    if (!force && sig === this.last) return;
    this.last = sig;
    // Discord limite à environ 5 mises à jour par 20 s : on regroupe les changements rapides
    clearTimeout(this.sendTimer);
    this.sendTimer = setTimeout(() => {
      this.discord.set(act);
      // Journal de test (dev) : PRESENCE_LOG=<fichier>
      if (process.env.PRESENCE_LOG) try { require('fs').appendFileSync(process.env.PRESENCE_LOG, `${new Date().toISOString()} ready=${this.discord.ready} ${sig}
`); } catch { /* rien */ }
    }, force ? 0 : 1500);
  }
  stop() { clearInterval(this.timer); this.discord.set(null); }
}

module.exports = { Presence };
