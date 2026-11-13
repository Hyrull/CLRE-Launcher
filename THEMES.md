# Créer un thème pour CLRE-Launcher

Un thème est un dossier avec un `theme.json`, un `theme.css` facultatif et ses fichiers (polices, images).
Il ne contient **que du CSS** : le launcher n'exécute jamais de JavaScript venant d'un thème.

## Installer

Tout se passe dans Réglages → Apparence :

- **Catalogue de la communauté** → Parcourir : installer ou mettre à jour en un clic ;
- **Importer un .zip**, ou déposer l'archive sur le bloc Thème ;
- **Ouvrir le dossier** (`%APPDATA%\launcher\themes\`) et y copier le dossier du thème, puis **Actualiser**.

Si un thème rend l'interface inutilisable : clic droit sur l'icône du launcher dans la barre des tâches →
**Revenir au thème par défaut**, ou lance `CLRE-Launcher.exe --safe-mode`.

## Développer

1. Copie un exemple dans `%APPDATA%\launcher\themes\mon-theme\` et change son `id`.
2. Choisis-le dans les réglages.
3. Modifie `theme.css` ou `theme.json` : le launcher recharge le thème actif à chaque enregistrement, sans redémarrer.
   Ctrl+Maj+I ouvre les outils de développement pour inspecter les éléments.

Exemples complets dans [`src/themes/`](src/themes) :
- [`papier`](src/themes/papier) : clair, typo à empattements, barre latérale à droite ;
- [`neon`](src/themes/neon) : rail d'icônes, deux jeux de couleurs, effet optionnel ;
- [`salon`](src/themes/salon) : navigation en haut, sections en menus déroulants, le plus éloigné de l'original.

## Publier dans le catalogue

Le catalogue est un dépôt GitHub public (modèle dans [`theme-registry/`](theme-registry)). Propose ton dossier
dans `themes/<id>/` par une pull request ; la vérification automatique doit passer
(`node scripts/build.js --check`). Une fois fusionné, l'archive et son empreinte SHA-256 sont publiées
et le thème apparaît dans le launcher. Pour une mise à jour, augmente `version`.

## theme.json

```json
{
  "id": "mon-theme",
  "name": "Mon thème",
  "author": "pseudo",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "Une phrase.",
  "colorScheme": "dark",
  "schemes": {
    "default": { "--bg-rgb": "10 10 14", "--accent": "#7cf" },
    "Vert":    { "--accent": "#5d8" }
  },
  "options": [
    { "id": "compact", "type": "toggle", "label": "Mode compact", "default": false }
  ]
}
```

| Champ | Rôle |
|---|---|
| `id` | Identifiant : minuscules, chiffres et tirets (`mon-theme`), égal au nom du dossier. Sans `id`, l'import d'un .zip le déduit du nom. Les noms des thèmes intégrés sont réservés. |
| `version` | Format `1.2.3`. Le catalogue propose la mise à jour quand elle augmente. |
| `preview` | Aperçu 16:10 (`preview.png`, 640×400 par exemple). Obligatoire dans le catalogue. |
| `apiVersion` | Version du contrat ci-dessous. Un thème écrit pour une version plus récente est grisé. |
| `colorScheme` | `dark` ou `light` : couleur des contrôles natifs (listes déroulantes, barres de défilement). |
| `schemes` | Jeux de couleurs proposés dans les réglages. `default` (ou le premier) sert de base aux autres, qui n'en changent qu'une partie. Valeurs sans `;`, `{`, `}`, `<`, `>`. |
| `options` | Interrupteurs. Activé, l'option ajoute la classe `theme-opt-<id>` sur `<html>`. |
| `css` / `preview` | Par défaut `theme.css` et `preview.png` (vignette 16:10) s'ils existent. |

Dans le CSS, les fichiers du thème se référencent en relatif : `url('fonts/Display.woff2')`.
Les images et polices distantes sont bloquées ; seul Google Fonts est autorisé (`@import url('https://fonts.googleapis.com/…')`).
Une archive ne peut contenir que `.css`, `.json`, images (`.png .jpg .webp .gif .svg .avif`), polices
(`.woff .woff2 .ttf .otf`), `.md` et `.txt` ; le reste est ignoré à l'installation. 20 Mo au plus.

## Variables (apiVersion 1)

Définies dans `src/renderer/styles.css`. Les `…-rgb` sont des triplets `R G B` utilisés avec une opacité :
`rgb(var(--fg-rgb) / 0.08)`. Redéfinir un triplet change d'un coup toutes ses nuances.

| Variable | Utilisation |
|---|---|
| `--bg-rgb` | Fond de la fenêtre ; les bannières fondent vers cette couleur. |
| `--card-rgb`, `--raised-rgb`, `--popover-rgb` | Cartes, surfaces en relief (toasts), menus. |
| `--glass-rgb` | Verre sombre posé sur les images (badges des jaquettes). |
| `--fg-rgb` | Encre des voiles, filets et remplissages (blanc en sombre, foncé en clair). |
| `--shade-rgb` | Ombres et voiles sur les images. |
| `--on-art-rgb` / `--on-art` | Texte posé sur une image de jeu. |
| `--brand-rgb`, `--negative-rgb`, `--switch-off-rgb` | Ambre de la marque, erreurs, interrupteur éteint. |
| `--sidebar`, `--surface-2`, `--control`, `--control-strong` | Barre latérale, survol / fenêtres, contrôles. |
| `--text`, `--text-2`, `--muted` | Trois niveaux de texte. |
| `--accent`, `--on-accent` | Accent et texte posé dessus. |
| `--on-text` | Texte sur un bouton plein de couleur `--text`. |
| `--positive`, `--on-positive`, `--warning`, `--negative`, `--negative-soft` | États. |
| `--chart-1` … `--chart-3` | Courbes GPU, CPU, température. |
| `--knob` | Pastille des interrupteurs. |
| `--btn-primary`, `--btn-primary-hover`, `--btn-primary-press`, `--btn-primary-edge` | Bouton principal (dégradés acceptés). |
| `--art-fallback`, `--art-fallback-flat` | Fond d'un jeu sans image. |
| `--material`, `--blur` | Barre d'outils translucide. |
| `--sans`, `--ease` | Police, courbe d'animation. |
| `--sidebar-width`, `--radius-cover`, `--radius-tile`, `--cover-ratio`, `--grid-min` | Mise en page. |

Attention : `--on-art` vaut `rgb(var(--on-art-rgb))` **calculé sur `:root`**. Si tu redéfinis `--on-art-rgb`
sur un élément, redéfinis aussi `--on-art` au même endroit (voir le thème Papier).

## Points d'accroche

Les sélecteurs ci-dessous font partie du contrat et ne changeront pas sans hausse d'`apiVersion`.
Les autres classes sont internes : elles peuvent bouger d'une version à l'autre.

- `<html data-theme="<id>" data-theme-scheme="<jeu de couleurs>">` et les classes `theme-opt-<id>`.
- `<body data-view="home|all|game|shop|friends|downloads|…">` : la vue affichée.
- `data-part` : `app`, `sidebar`, `brand`, `nav-main`, `nav-collections`, `week-card`, `content`, `topbar`,
  `main-tabs`, `search`, `view`, `spotlight`, `game-hero`, `game-card`, `cover`, `tile`, `resume-card`.

`[data-part="app"]` est une grille (`grid-template-areas: "sidebar content"`). Pour déplacer la barre latérale :

```css
[data-part="app"] { grid-template-columns: minmax(0, 1fr) var(--sidebar-width); grid-template-areas: "content sidebar"; }
```
