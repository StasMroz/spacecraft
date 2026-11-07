# Changelog

## v12

- Odłączona tabela wyników: menu i ekran końca gry bez rankingu (HONOURED DEAD / LEADERS) i bez komunikatu o zapisie wyniku; gra nie czyta ani nie wysyła wyników do leaderboardu (Firestore / serwer HTTP / localStorage).
- Statystyki rozgrywki (SQUAD, XENOS), co-op, lobby i petycje bez zmian; dane i konfiguracja Firebase nietknięte.
- Test: bundle gry nie zawiera modułów `highscores/` ani `highscoreTable`.

## v11

- Publikacja na GitHub Pages (https://stasmroz.github.io/spacecraft/) przez oficjalne akcje `configure-pages` / `upload-pages-artifact` / `deploy-pages`; przed deployem lint, testy, typecheck i `build:pages` (base `/spacecraft/`).
- Lint: filtrowanie znaków kontrolnych w walidacji petycji bez regexów z dosłownymi znakami kontrolnymi (zachowanie bez zmian, nowe testy granicznych znaków); usunięty nieużywany import w teście.
- Kod gry bez zmian względem 0.6.1.
