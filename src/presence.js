// Statut Discord : des phrases différentes selon le jeu (genre, progression, temps de jeu) qui tournent
// pendant la partie, et ce que tu fais dans le launcher quand tu n'es pas en jeu.
const STORE = { steam: 'Steam', epic: 'Epic Games', gog: 'GOG', ubisoft: 'Ubisoft Connect', ea: 'EA app', xbox: 'Xbox', battlenet: 'Battle.net', riot: 'Riot', amazon: 'Amazon Games', itch: 'itch.io', custom: 'PC' };

// Phrases par genre, choisies d'après les tags Steam du jeu (noms en français)
// Les genres les plus précis passent en premier (un roguelike est souvent aussi « action »).
const GENRES = [
  [/roguelike|roguelite|rogue-like/i, ['Encore une dernière run', 'Meurt, apprend, recommence', 'Cette run est la bonne', 'Tente un nouveau build', 'Une run de plus, promis', 'Prie pour un bon objet']],
  [/battle royale/i, ['Vise le top 1', 'Saute du bus', 'Dernier cercle en vue', 'Fouille le premier bâtiment', 'Reste dans la zone', 'Joue le top 10 tranquille']],
  [/soulslike|souls-like|difficile|impitoyable/i, ['Meurt pour la 47e fois', 'Apprend les patterns du boss', 'Ne lâche rien', 'Respire avant le boss', 'Récupère ses âmes perdues', 'Roule au bon moment']],
  [/horreur|psychologique/i, ['Joue les lumières éteintes', 'N’ose pas ouvrir cette porte', 'Garde son sang-froid', 'A entendu un bruit', 'Avance à pas de loup', 'Ne regarde pas derrière lui']],
  [/fps|tir|shooter/i, ['En pleine fusillade', 'Vise la tête', 'Recharge à couvert', 'Tient la position', 'Cherche le meilleur angle', 'Enchaîne les éliminations']],
  [/grande stratégie|4x/i, ['Conquiert le monde, tranquillement', 'Négocie une alliance douteuse', 'Encore un tour', 'Prépare une guerre éclair', 'Redessine la carte du monde', 'Gère son empire']],
  [/stratégie|tactique|\bstr\b/i, ['Prépare son prochain coup', 'Réfléchit trois tours d’avance', 'Place ses unités', 'Tente une manœuvre risquée', 'Monte une stratégie imparable']],
  [/city builder|ville/i, ['Construit sa ville', 'Règle les embouteillages', 'Ajoute un nouveau quartier', 'Surveille le budget de la ville', 'Rend ses habitants heureux']],
  [/automatisation|usine/i, ['Agrandit son usine', 'Optimise sa chaîne de production', 'Démêle des tapis roulants', 'L’usine doit grandir']],
  [/course|conduite|automobile/i, ['Au volant', 'Bat son record', 'Pied au plancher', 'Prend la corde', 'Attaque le dernier virage', 'Règle sa voiture']],
  [/gestion|construction|colonie/i, ['Optimise sa base', 'Construit quelque chose de grand', 'Encore une petite amélioration', 'Fait tourner la boutique', 'Range tout au millimètre', 'Planifie le prochain agrandissement']],
  [/bac à sable|modable/i, ['Laisse parler sa créativité', 'Teste une idée farfelue', 'Construit n’importe quoi, avec talent', 'Invente ses propres règles']],
  [/survie|fabrication/i, ['Survit tant bien que mal', 'Fabrique de quoi tenir la nuit', 'Cherche des ressources', 'Renforce son abri', 'Surveille sa faim', 'Prépare l’expédition']],
  [/^vr$|réalité virtuelle/i, ['Casque VR sur la tête', 'En réalité virtuelle', 'Fait attention aux murs']],
  [/humour|mèmes|comédie/i, ['Rigole bien', 'Ne prend rien au sérieux', 'Fait n’importe quoi, avec style']],
  [/sport|football|basket/i, ['En plein match', 'Monte une équipe de rêve', 'Joue les prolongations', 'Vise la victoire', 'Prépare sa tactique']],
  [/jeu de cartes|deckbuilding|cartes/i, ['Construit le deck parfait', 'Tire la bonne carte', 'Calcule son combo', 'Mélange le paquet', 'Tente une combo improbable']],
  [/rpg|jeu de rôle/i, ['En pleine quête', 'Monte en niveau', 'Fouille chaque recoin', 'Parle à tous les PNJ', 'Optimise son équipement', 'Suit la quête principale… ou pas']],
  [/metroidvania/i, ['Cherche le passage secret', 'Revient avec un nouveau pouvoir', 'Complète la carte']],
  [/monde ouvert|exploration|aventure/i, ['Explore le monde', 'Part à l’aventure', 'Se perd volontairement', 'Suit un point d’intérêt', 'Admire le paysage', 'Grimpe tout en haut']],
  [/histoire|narratif|riche en histoire/i, ['Suit l’histoire', 'Veut savoir la suite', 'Lit tous les dialogues', 'Vit un moment fort']],
  [/casse-tête|puzzle|réflexion/i, ['Se creuse la tête', 'A presque trouvé', 'Résout une énigme', 'Tente une solution farfelue', 'Refuse de regarder la soluce']],
  [/coop|multijoueur|jcj|en ligne|massivement/i, ['Joue avec l’équipe', 'En ligne', 'Porte l’équipe', 'Coordonne la partie', 'Joue entre potes']],
  [/détente|casual|relaxant|mignon|agréable/i, ['Se détend', 'Prend son temps', 'Partie tranquille', 'Joue sans pression', 'Profite du moment']],
  [/ferme|agricole|agriculture/i, ['S’occupe de sa ferme', 'Arrose ses cultures', 'Attend la récolte', 'Nourrit les animaux']],
  [/plateforme/i, ['Saute de plateforme en plateforme', 'Rate un saut, recommence', 'Vise le saut parfait', 'Cherche tous les collectibles']],
  [/rythme|musique/i, ['Garde le rythme', 'Vise le combo parfait', 'Suit la mesure', 'Joue en rythme']],
  [/combat|beat ’em up|hack and slash|action/i, ['En plein combat', 'Enchaîne les combos', 'Esquive au dernier moment', 'Ne laisse rien passer']],
  [/vaisseaux|espace|science-fiction/i, ['Explore l’espace', 'Pilote son vaisseau', 'Part vers une nouvelle planète']],
  [/simulation/i, ['Soigne chaque détail', 'Se prend au jeu de la simulation', 'Joue la carte du réalisme']],
];

// « ce matin », « ce midi », « cet après-midi », « ce soir » ou « cette nuit » selon l'heure
function momentWord(d = new Date()) {
  const h = d.getHours();
  return h >= 5 && h < 11 ? 'ce matin' : h >= 11 && h < 14 ? 'ce midi' : h >= 14 && h < 18 ? 'cet après-midi' : h >= 18 && h < 23 ? 'ce soir' : 'cette nuit';
}

// Phrases selon l'heure de la partie
const HOUR_LINES = [
  [[5, 11], ['Partie du matin', 'Commence la journée en jouant']],
  [[11, 14], ['Pause du midi bien méritée']],
  [[14, 18], ['Session de l’après-midi']],
  [[18, 23], ['Partie du soir', 'Soirée jeu']],
  [[23, 29], ['Partie nocturne', 'Joue tard, encore une fois']],
];
// Mélange stable : chaque partie a son propre ordre de phrases, qui ne change pas en cours de route.
function shuffled(list, seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

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
    const names = (this.ctx.lib() && this.ctx.lib().tagNames) || {};
    const seed = `${g.key}|${this.gameStart}`;
    // Les tags Steam sont classés par votes : on lit les 8 premiers dans l'ordre, pour que le genre
    // principal du jeu passe avant un tag secondaire (« Simulation » sur un jeu de course, par exemple).
    // Jusqu'à deux genres, quatre phrases chacun, piochées différemment à chaque partie.
    const picked = [];
    for (const t of (g.tags || []).slice(0, 8)) {
      const name = names[t] || '';
      const genre = name && GENRES.find(([re]) => re.test(name));
      if (genre && !picked.includes(genre)) picked.push(genre);
      if (picked.length >= 2) break;
    }
    for (const [re, phrases] of picked) lines.push(...shuffled(phrases, seed + re.source).slice(0, 4));

    // Progression
    const ach = g.ach && g.ach.total ? g.ach : null;
    if (ach) {
      const pct = Math.floor((ach.done / ach.total) * 100);
      lines.push(`Succès : ${ach.done}/${ach.total} (${pct} %)`);
      if (ach.done === ach.total) lines.push('100 % des succès, rien ne lui résiste');
      else if (pct >= 80) lines.push(`Plus que ${ach.total - ach.done} succès pour le 100 %`);
      else if (ach.done === 0) lines.push('Chasse son premier succès');
    }
    const h = (g.playtime || 0) / 60;
    if (h >= 500) lines.push(`${fmtH(g.playtime)} au compteur, une vraie passion`);
    else if (h >= 100) lines.push(`${fmtH(g.playtime)} au compteur, un habitué`);
    else if (h >= 1) lines.push(`${fmtH(g.playtime)} au compteur`);
    else lines.push('Découvre le jeu', 'Premiers pas dans le jeu');
    if ((g.playtime2wks || 0) >= 600) lines.push('Ne lâche plus ce jeu ces temps-ci');
    const status = ((this.ctx.local() || {}).status || {})[g.key];
    if (status === 'done') lines.push('Déjà fini, y retourne pour le plaisir');
    if (status === 'playing') lines.push('Partie en cours, on avance');
    if (status === 'todo') lines.push('Enfin lancé, il était sur la liste');
    const hl = this.ctx.howLong && this.ctx.howLong(g.key);
    if (hl && hl.main) {
      const left = Math.round(hl.main / 60) - (g.playtime || 0);
      lines.push(left > 0 ? `Environ ${fmtH(left)} avant la fin de l’histoire` : 'A dépassé la durée de l’histoire');
    }

    // Durée de la partie en cours et heure
    const sessionMin = this.gameStart ? (Date.now() - this.gameStart) / 60000 : 0;
    if (sessionMin >= 180) lines.push('Session marathon en cours');
    else if (sessionMin >= 90) lines.push('Bien installé pour un moment');
    else if (sessionMin < 10) lines.push('Vient de lancer la partie');
    let hour = new Date().getHours();
    if (hour < 5) hour += 24;
    const hourLines = HOUR_LINES.find(([[a, b]]) => hour >= a && hour < b);
    if (hourLines) lines.push(shuffled(hourLines[1], seed)[0]);

    if (!lines.length) lines.push(`Sur ${STORE[g.store] || 'PC'}`);
    return shuffled(lines, seed);
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
      home: ['Choisit à quoi jouer', pick(['Hésite entre plusieurs jeux', `${inst} jeux prêts à lancer`, `Regarde ce qu’il y a de bon ${momentWord()}`], i)],
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
