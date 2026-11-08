# Changelog

## v20

- Menu: numer wersji gry (v0.6.1, z GAME_VERSION) widoczny od razu pod tytułem zamiast na dole karty poza ekranem; w podglądzie dev z sufiksem -dev+sha. Lista „Previous versions” nadal zależy od versions.json.

## v19

- Poprawka: pociski przelatują nad niskimi osłonami (barykady w żółte pasy) — zawsze, pociski marine i Tyranidów, nic już na nich nie znika (wcześniej 35% strzałów zatrzymywało się na osłonie). Pełne grodzie nadal zatrzymują pociski, wybuchy i widok; niska osłona nadal blokuje ruch i walkę wręcz.
- Zgodnie z pierwotną propozycją („można strzelać, zmniejsza się prawdopodobieństwo trafienia”): cel przyklejony do drugiej strony niskiej osłony (do 60 px) pocisk mija z szansą 30% i leci dalej (może trafić coś za nim). Osłona tuż przy strzelcu (do 70 px) się nie liczy. To decyzja balansu, nie zasada 40k.

## v18

- Nowy boss wsparcia: Psychophage. Pojawia się sam (1 sztuka) w fali 5 i co 3 fale (5, 8, 11…), nigdy w fali Carnifexa. 700 HP (skalowane jak inne wg fali i drużyny), T9, zapis 3+, prędkość 110, promień 30 px, klasa duża (melta: koszt 12), 40 pkt, pewna apteczka.
- Atakuje słabo: ugryzienie 10, „psychoklastyczny popiół” 4 obrażenia na 300 px co 1,6 s; trzyma się ~330 px za swoim rojem.
- Bio-stimulus (fioletowy przerywany pierścień 240 px): inne Tyranidy w zasięgu, które Psychophage widzi (pełna ściana odcina aurę, niska nie), mają ×1,15 prędkości, ×1,2 obrażeń, otrzymują ×0,85 obrażeń (fioletowa obwódka) i otaczają marine — każdy zmierza do własnego miejsca na pierścieniu wokół celu zamiast biec gęsiego.
- Bonusy się nie sumują: kilka źródeł i synapsa Warriora dają najlepszą wartość każdej cechy. Śmierć Psychophage zdejmuje buff w następnym ticku. Kompendium i zasady opisują jednostkę.
- Protokół sieci 8 (nowa jednostka i flaga aury); stare klienty niezgodne. Melta 50–30, ściany i kwas bez zmian.
- Lore (Lexicanum, Codex: Tyranids 10. ed.): Psychophage to szybki potwór, który metabolizuje psykerów i zieje „psychocorrosive ash”; zasada Bio-stimulus (aura 6") daje sojuszniczym Tyranidom Feel No Pain 6+. Wzrost prędkości/obrażeń, otaczanie, zasięg, HP i harmonogram fal to adaptacja balansu gry (prośba z tablicy: boss słabo atakujący, wzmacniający i „inteligentniejszy” rój), nie zasady 40k; −15% obrażeń przybliża FNP 6+ (~17%).

## v17

- Kwasoplujki szybsze: pocisk Termaganta (fleshborer) 430 → 560 px/s, Warriora (deathspitter) 480 → 620 px/s. Obrażenia i szybkostrzelność bez zmian.
- Pudło plujki zostawia kałużę kwasu: Termagant promień 20 px na 2,5 s (3 obrażenia co 0,5 s), Warrior 28 px na 3 s (4 co 0,5 s). Kałuża powstaje, gdy pocisk skończy zasięg albo zatrzyma się na ścianie; nie po trafieniu marine, rykoszecie od pancerza ani wylocie poza mapę.
- Carnifex dostaje atak dystansowy: kula kwasu na 200–560 px, co ok. 6 s, tylko na widocznego marine i nigdy w trakcie szarży; 15 obrażeń przy trafieniu i duża plama (80 px, 6 s, 6 obrażeń co 0,5 s) tam, gdzie stał marine — także po trafieniu. Szarża i walka wręcz bez zmian.
- Kwas parzy każdego marine w plamie (pancerz nie chroni, bez nietykalności po trafieniu), nigdy przez pełną ścianę; plamy za pełną ścianą są w cieniu. Najstarsze plamy znikają ponad limit 48.
- Lore (Lexicanum): deathspitter strzela żrącymi larwami, których płyn rozpryskuje się szeroko i topi pancerz; fleshborer — chrząszcze wydzielające enzym trawienny; Carnifex (Screamer-Killer) pluje bio-plazmą, inne warianty noszą Venom Cannon / Acid Maw. Trwałe kałuże, czasy, promienie i obrażenia to adaptacja balansu gry, nie zasady 40k.
- Protokół sieci 7 (pule kwasu w migawce); stare klienty niezgodne. Melta 50–30 i ściany z v16 bez zmian.

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
