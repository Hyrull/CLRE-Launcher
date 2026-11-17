// Visuels intégrés pour les jeux que la recherche automatique ne trouve pas (absents de Steam et de GOG).
// Images des pages officielles des boutiques Microsoft Store et Epic Games Store.
// Ne remplissent que les visuels manquants : une jaquette choisie par l'utilisateur reste prioritaire.
const MS = (id) => 'https://store-images.s-microsoft.com/image/' + id;
const EPIC = (file, w, h) => `https://cdn2.unrealengine.com/${file}?resize=1&w=${w}${h ? `&h=${h}` : ''}&quality=high`;

const MINECRAFT = {
  // Minecraft: Java & Bedrock Edition for PC (Microsoft Store 9NXP44L49SHJ)
  cover: MS('apps.808.14492077886571533.be42f4bd-887b-4430-8ed0-622341b4d2b0.c8274c53-105e-478b-9f4b-41b8088210a3'),
  hero: MS('apps.58378.14492077886571533.338a563a-86e7-47b1-b9dc-41cf411f5dcd.dc840f22-6e8f-4a59-b7bc-57958a0740fd'),
  header: MS('apps.12171.14492077886571533.da32bb0b-aeec-4028-a235-8a96c1292b6b.7c93ce73-8b7b-47f0-bfda-c7616b9f204f'),
  logo: '',
};

const ART = [
  {
    match: (g) => g.key === 'riot:league_of_legends' || /^league of legends$/i.test(g.name),
    art: {
      cover: EPIC('epic-1200x1600-1200x1600-62d626f118e0.png', 600, 800),
      hero: EPIC('epic-2560x1440-2560x1440-2c0f0cf09af6.png', 1920),
      header: EPIC('epic-2560x1440-2560x1440-2c0f0cf09af6.png', 920),
      logo: 'https://cdn2.unrealengine.com/lol-logo-rendered-350x100-350x100-a2f0d5492480.png',
    },
  },
  {
    match: (g) => g.key === 'riot:valorant' || /^valorant$/i.test(g.name),
    art: {
      cover: EPIC('egs-valorant-riotgames-s2-1200x1600-45ecd201ffcc.jpg', 600, 800),
      hero: EPIC('egs-valorant-riotgames-s1-2560x1440-4742836df9eb.jpg', 1920),
      header: EPIC('egs-valorant-riotgames-s1-2560x1440-4742836df9eb.jpg', 920),
      logo: '',
    },
  },
  {
    // Minecraft Launcher (Xbox / Microsoft Store) et Minecraft ajouté à la main (pas Dungeons ni Legends, qui sont sur Steam)
    match: (g) => /^xbox:Microsoft\.4297127D64EC6_/i.test(g.key) || /^minecraft( launcher)?$|^minecraft:? (java|bedrock)/i.test(g.name),
    art: MINECRAFT,
  },
];

function builtinArt(g) {
  const hit = ART.find((a) => a.match(g));
  return hit ? hit.art : null;
}

// Complète les visuels vides d'un jeu
function fillBuiltinArt(g) {
  const a = builtinArt(g);
  if (!a) return;
  g.art = g.art || {};
  for (const [k, v] of Object.entries(a)) if (v && !g.art[k]) g.art[k] = v;
}

module.exports = { builtinArt, fillBuiltinArt };
