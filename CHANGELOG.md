# Changelog

## v11

- Publikacja na GitHub Pages (https://stasmroz.github.io/spacecraft/) przez oficjalne akcje `configure-pages` / `upload-pages-artifact` / `deploy-pages`; przed deployem lint, testy, typecheck i `build:pages` (base `/spacecraft/`).
- Lint: filtrowanie znaków kontrolnych w walidacji petycji bez regexów z dosłownymi znakami kontrolnymi (zachowanie bez zmian, nowe testy granicznych znaków); usunięty nieużywany import w teście.
- Kod gry bez zmian względem 0.6.1.
