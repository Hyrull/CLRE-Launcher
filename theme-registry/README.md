# Thèmes CLRE-Launcher

Le catalogue des thèmes de la communauté pour CLRE-Launcher. Le launcher lit `index.json` à la racine de
ce dépôt (Réglages → Apparence → Catalogue de la communauté).

## Proposer un thème

1. Fais un fork de ce dépôt.
2. Ajoute ton thème dans `themes/<id>/` :
   - `theme.json`, avec `"id"` égal au nom du dossier, `name`, `author`, `version` (1.2.3), `description`, `apiVersion` ;
   - `theme.css` et tes fichiers (polices, images) ;
   - `preview.png` : un aperçu 16:10 (640×400 par exemple).
3. Vérifie : `node scripts/build.js --check`
4. Ouvre une pull request. La vérification se relance toute seule ; une fois la PR fusionnée, le catalogue est
   reconstruit et ton thème apparaît dans le launcher.

Pour une mise à jour, modifie ton dossier et augmente `version` : le launcher proposera « Mettre à jour ».

Le format complet (variables, points d'accroche, options) est décrit dans le guide THEMES.md du launcher.

## Règles

- Uniquement du CSS et des fichiers statiques (`.css`, images, polices, `.json`, `.md`, `.txt`). Pas de JavaScript.
- Pas de ressource distante dans le CSS, sauf Google Fonts.
- 5 Mo au plus par thème.
- Pas de contenu qui imite un autre produit (logo, nom ou visuels d'une marque).

## Fonctionnement

`scripts/build.js` vérifie chaque thème, en fait une archive `dist/<id>.zip` et écrit `index.json` avec l'adresse
et l'empreinte SHA-256 de chaque archive. Le launcher refuse une archive dont l'empreinte ne correspond pas.
