# Changelog

## v16

- Ściany na mapie Hive Siege: pełne ściany (szara grodź) blokują ruch, walkę wręcz, pociski, wybuchy i widoczność — co za nimi, jest w cieniu, także na minimapie i pasku HP bossa. Niskie osłony (barykady w żółte pasy) blokują ruch i walkę wręcz, ale widać i strzela się nad nimi; każdy pocisk przecinający osłonę ma 35% szansy zatrzymania, chyba że strzelec stoi przy niej (do 70 px).
- Tyranidzi obchodzą ściany (pole przepływu), strzelający plują tylko przy widocznym celu.
- Biegające potwory mniej się nakładają: większa przestrzeń osobista i rozpychanie w roju.
- Protokół sieci 6 (stare klienty niezgodne). Melta 50–30 bez zmian; strona zasad opisuje ściany.

## v15

- Meltagun, wybuch na końcu zasięgu: 50 obrażeń w środku, 30 na krawędzi (było 50 → 20; `edgeFactor` 0,4 → 0,6). Promień 66 px, S4 AP0, zasięg, obrażenia pocisku i przebicie z v14 bez zmian.

## v14

- Meltagun, wybuch na końcu zasięgu: 50 obrażeń w środku, 20 na krawędzi (było 25 → 8,75); promień 66 px, S4 AP0 bez zmian.
- Meltagun, przebicie zależne od wielkości celu: budżet 12 na strzał, koszt trafienia najmniejszy 3 / mały 4 / średni 6 / duży 12 — jeden strzał trafia 4 najmniejszych, 3 małych, 2 średnich albo 1 dużego. Mieszany szereg dzieli budżet w kolejności trafień; cel droższy niż reszta budżetu zatrzymuje promień (bez trafienia), nic za nim nie zostaje trafione. Wybuch na końcu zasięgu jak dotąd.
- Klasy: najmniejsze — Ripper; małe — Hormagaunt, Termagant, Genestealer, Spore Mine; średnie — Biovore, Ravener, Warrior; duże — Carnifex.
- Obrażenia pocisku (300), zasięg (204 px), szybkostrzelność i inne bronie bez zmian.

## v13

- Meltagun: zasięg mniejszy o 15% — z 240 px do 204 px (prędkość 1200 px/s bez zmian, czas lotu pocisku 0,2 s → 0,17 s). Błysk na końcu zasięgu, kompendium i zasady liczą zasięg z tych samych danych. Obrażenia, szybkostrzelność i inne bronie bez zmian.

## v12

- Odłączona tabela wyników: menu i ekran końca gry bez rankingu (HONOURED DEAD / LEADERS) i bez komunikatu o zapisie wyniku; gra nie czyta ani nie wysyła wyników do leaderboardu (Firestore / serwer HTTP / localStorage).
- Statystyki rozgrywki (SQUAD, XENOS), co-op, lobby i petycje bez zmian; dane i konfiguracja Firebase nietknięte.
- Test: bundle gry nie zawiera modułów `highscores/` ani `highscoreTable`.

## v11

- Publikacja na GitHub Pages (https://stasmroz.github.io/spacecraft/) przez oficjalne akcje `configure-pages` / `upload-pages-artifact` / `deploy-pages`; przed deployem lint, testy, typecheck i `build:pages` (base `/spacecraft/`).
- Lint: filtrowanie znaków kontrolnych w walidacji petycji bez regexów z dosłownymi znakami kontrolnymi (zachowanie bez zmian, nowe testy granicznych znaków); usunięty nieużywany import w teście.
- Kod gry bez zmian względem 0.6.1.
