# Changelog

## v36

- Pages: `build:pages` zapisuje `versions.json` z wpisów CHANGELOG (`version`, `date`, `title`, `path`). Na Actions nie ma zamrożonych katalogów `/vN/`, więc `path` prowadzi do GitHub Release danej wersji — menu „Previous versions” nie dostaje 404.

## v35

- Misje ofensywne: na zrzucie odblokowana jest broń wręcz zakonu (ta, która w Oblężeniu ula wchodzi od fali 2 — tutaj fal z krawędzi nie ma). HUD nie pokazuje już „WAVE 0 / NEXT IN Infinity”, tylko „BEZ FAL”.

## v34

- Dwie misje ofensywne zamiast „fale + timer”: **Zabójstwo tyrana** (`hold_the_line`) i **Spalenie gniazd** (`synapse_purge`). Oddział startuje w strefie zrzutu wśród już rozstawionych Tyranidów; dyrektor nie wysyła fal z krawędzi. Posiłki HD2 i zrzuty skrzyń zostają. Oblężenie ula bez zmian (klasyczne fale). Identyfikatory misji, pola `name` / `description` / `objective` / `map` / `crates` / `timeLimit` zachowane dla pickera menu.
- Zabójstwo tyrana (mapa ula, limit 190 s): wzmocniony Carnifex (strażnik synapsy) z gwardią na drugim końcu areny, patrole po drodze. Ekstrakcja otwiera się po jego śmierci.
- Spalenie gniazd (dżungla, limit 300 s): trzy gniazda w kolejnych sektorach wypuszczają posiłki, aż zostaną zniszczone; potem ekstrakcja na drugim końcu. Strzałka HUD wskazuje najbliższe gniazdo albo strefę evakuacji.
- Ewakuacja i Odzyskaj relikwię bez zmian w tej wersji. Testy zachowania (rozstawienie, brak fal, gniazdo przestaje sypać po zniszczeniu, zabicie bossa otwiera ekstrakcję) dodane.

## v33

- Menu i lobby: zaznaczona misja ma zwartą odprawę BRIEFING (nazwa, opis, cel, mapa, zrzuty albo ich brak, limit czasu albo „bez limitu”), złożoną z pól katalogu — bez wpisanych na sztywno id ani nazw misji.

## v32

- Każdy zakon ma jedną broń wręcz (klawisz 7 / kółko ARMS, od fali 2) zamiast trzech wspólnych (Chainsword / Power Axe / Thunder Hammer na 7–9). Mapowanie: Ultramarines — Power Sword; Blood Angels — Encarmine Blade; Dark Angels — Heavenfall Blade; Imperial Fists — Thunder Hammer; Space Wolves — Frost Axe; Salamanders — Forge Hammer; White Scars — Power Glaive; Raven Guard — Lightning Claws. Profile różnią się tempem, obrażeniami, łukiem i odrzutem, w okolicy dawnych trzech. Skrzynia z cudzą bronią wręcz zamienia się w twoją.
- Prawdziwa animacja zamachu w rendererze: widoczny łuk broni przed marine, krótka smuga w kolorze pola mocy / mrozu / iskier, zsynchronizowana z trafieniem i łukiem obrażeń (czas zamachu z symulacji, działa też u klientów MP). Młoty dodają iskry i krótki wstrząs w momencie ciosu. Pocisk `slash` zostaje tylko jako trafienie, nie jako jedyny efekt wizualny.
- Gwardziści sojuszniczy bez ataku wręcz (zostają przy lasgunie). Zasady, kompendium i testy zachowania zaktualizowane.

## v31

- Menu: wybór misji nie renderuje już radia jak pola tekstowego. Globalna reguła `input` była stosowana do radio; teraz radio jest ukryte wizualnie, a cały wiersz działa jak chip zakonu — nazwa z lewej, zrzuty i limit z prawej, w szerokości karty.

## v30

- Menu: wybór misji przed SOLO DEPLOY — 5 zleceń z katalogu (nazwa, krótki opis, zrzuty i limit czasu, podpis mapy). Domyślnie Oblężenie ula (hive_siege).
- Lobby: host zmienia misję w tym samym pickerze (`setMission`); wszyscy widzą nazwę i opis z lobby. Ostatni wybór zapamiętywany. `?mission=` nadal wygrywa, gdy id jest znane.

## v29

- Misje w stylu Helldivers 2, klimat 40k. Domyślnie **Oblężenie ula** (dotychczasowe niekończące się fale). Nowe zlecenia: **Oczyść i utrzymaj** (150 s walki, potem 40 s okno ekstrakcji Thunderhawka), **Ewakuacja** (wrak hulka, okno od 120 s przez 45 s), **Czystka synapsy** (dżungla biomasy, zniszcz 3 kapilary, potem ekstrakcja, limit 300 s), **Odzyskaj relikwię** (lodowy świat, donieś relikwię do strefy, limit 240 s, cień w warpie tłumi zrzuty zaopatrzenia).
- Trzy nowe mapy / biomy (ręczny układ osłon, ten sam rozmiar areny): dżungla biomasy, lodowy świat, wrak hulka — inny kolor podłogi i układ ścian. Hive Siege bez zmian.
- Ekstrakcja: wszyscy żywi marine (i nosiciel relikwii, jeśli jest) stoją w strefie 5 s. Po limicie czasu porażka, chyba że oddział już stoi w otwartej strefie (ostatnia szansa).
- Zrzuty skrzyń działają w większości misji; w „Odzyskaj relikwię” są wyłączone. Posiłki (kapsuły) działają zawsze — to nie zaopatrzenie.
- Odradzanie przebudowane: wspólna pula posiłków 5 + 2×(wielkość oddziału−1). Żywy brat wzywa poległego klawiszem X / przyciskiem REINF (kapsuła przed celownikiem). W solo, albo gdy nikt nie został, zrzut leci automatycznie po cooldownie. Pierwszy cooldown 8 s, +4 s za serię zgonów (maks. 28 s), seria spada po 20 s bez wezwania. Lot 1,4 s, lądowanie 70 obr. / 80 px (rani tylko Tyranidów), 2 s nietykalności, pełne życie. Podniesienie rannego na miejscu nie zużywa puli. Porażka gdy pula = 0, wszyscy martwi i żadna kapsuła nie spada.
- HUD: nazwa misji, cel, timer, pozostałe posiłki. Na mapie: strefa ekstrakcji, kapilary, relikwia, spadające kapsuły. Ekran końca: MISSION COMPLETE przy zwycięstwie.
- API bez zmian w plikach menu: `MISSIONS` / `getMission` / `DEFAULT_MISSION_ID`, `HostSession.setMission(id)` / `getMissionId()`, pole `mission` na lobby i starcie, `?mission=id` dla solo/hosta. Protokół 10. Domyślny start nadal Oblężenie ula.
- Zasady, kompendium, testy zachowania i baseline determinizmu zaktualizowane.

## v28

- Telefon: przycisk SPRINT nad prawym drążkiem AIM · FIRE (zamiast sprintu na krawędzi lewego drążka). Nad nim uchwyt ARMS — stuknięcie lub przytrzymanie otwiera kółko wyboru broni; wybór palcem. Dawny słupek ikon po prawej na telefonie zastąpiony.
- Kondycja sprintu odnawia się zawsze, gdy marine nie sprintuje: pełna po 7 s stania, podczas marszu o połowę wolniej. W sprincie tylko spada.
- Każdy zakon ma własną broń specjalną (klawisz 3, fala 4) zamiast wspólnego flamera: Ultramarines — Storm Bolter; Blood Angels — Inferno Pistol; Dark Angels — Plasma Caster; Imperial Fists — Siege Bolter; Space Wolves — Plasma Pistol; Salamanders — Flamer; White Scars — Bolt Carbine; Raven Guard — Stalker Bolter. Skrzynia z cudzą specjalnością zamienia się w twoją.
- Broń wręcz w grze (klawisze 7–9 / kółko ARMS, bez menu loadoutu): Chainsword (fala 2, szybki, krótki łuk), Power Axe (fala 5, wolniejszy, szerszy, twardszy), Thunder Hammer (fala 7, najwolniejszy, najszerszy, duży odrzut). Bez amunicji.
- Kałuże kwasu zostawiają tylko Biovory (spore i Spore Mines). Termaganty, Warriory i Carnifex bez plam (Carnifex nadal może rzucić kulę).
- Gwardziści zostają w miejscu lądowania (przy wraku): nie chodzą i nie podążają za marine, tylko celują i strzelają.
- Zasady, kompendium, testy i baseline determinizmu zaktualizowane.

## v27

- Nowe, oryginalne sylwetki jednostek (proceduralne, bez grafik GW), rysowane z cech 40k widzianych z góry.
- Psychophage nie jest już Hormagantem: przygarbione ciało na sześciu nogach, worki trawienne, kominy grzbietowe z psychicznym popiołem, rozwarta wieloszczękowa paszcza i macki wokół niej.
- Gwardziści Astra Militarum wyglądają jak ludzie (hełm, kamizelka khaki/oliwkowa, ręce z lasgunem, kroczące nogi), nie jak pojedyncze kulki; sprite `ally_guardsman` w atlasie, z zapasowym rysunkiem w rendererze.
- Hormagaunt: cztery kosy i wyraźniejsze tylne nogi. Pozostałe typy Tyranidów i marines zachowane/doprecyzowane w tym samym stylu. Hitboxy, promienie, aura Psychophage i mechanika bez zmian.

## v26

- Meltagun przywrócony do stanu sprzed naszych nerfów (bazowy ref `3dc3dba` / v12, tuż przed v13 zasięg −15%): lifetime 0,2 (zasięg 240 px), pierce 3 (do 4 trafień), endBurst 25 dmg / edgeFactor 0,35 / r 66 / S4 AP0. Bez pierceBudget.
- Jedyna zmiana względem pierwotnego: szybkostrzelność −40% → fireInterval = 0,87 / 0,6 = 1,45 s (nie względem 1,13 z v21; nie odstęp × 1,4).
- Zasady, kompendium i testy melty zaktualizowane. Niskie osłony v24, katastrofa, menu i reszta gry bez zmian.

## v25

- Menu: wyraźny główny przycisk ▶ SOLO DEPLOY; HOST SQUAD i dołączanie kodem pokoju zebrane w sekcji „PLAY WITH FRIENDS”.
- Instrukcje sterowania (klawiatura/mysz i dotyk) schowane w zwijanym „HOW TO PLAY”, więc domyślne menu jest krótsze. Numer wersji pod tytułem bez zmian.

## v24

- Niska osłona, nowy wariant (decyzja balansu, nie zasada 40k): osłona do 70 jednostek świata od strzelca — pociski swobodnie nad nią przelatują. Osłona dalej — 50% szans, że pocisk zatrzyma się NA osłonie (iskra, jak na ścianie); inaczej leci dalej. Losowane raz na pocisk i osłonę (bez losowania co tick), od najbliższej; kilka osłon losuje się osobno. Dotyczy pocisków marines, Tyranidów i Gwardzistów.
- Usunięto starą regułę: 30% szans chybienia celu do 60 px za osłoną.
- Pełne ściany i ruch bez zmian. Melta bez zmian (bez przebicia, co 1,13 s); zatrzymana na osłonie robi błysk końcowy na osłonie — tak samo jak na pełnej ścianie.
- Zasady, testy (walls, meltaPierce, crash, rulesPage) i baseline determinizmu zaktualizowane.

## v23

- Poprawka opisu: akapit zasad „Meltagun: błysk na końcu zasięgu” mówił jeszcze o „przebiciu celów”. Teraz: po trafieniu pierwszego celu pocisk leci dalej do końca zasięgu bez kolejnych trafień i błyska raz (zgodnie z v21). Test pilnuje, by zasady i kompendium nie zawierały starych twierdzeń o przebiciu melty. Mechanika bez zmian.

## v22

- Katastrofa okrętu Imperium — zdarzenie zwykłych fal (nie misja): fala 4 i co 3 fale (4, 7, 10…, nigdy fala Carnifexa ani Psychophage). 4 s po starcie fali komunikat i czerwony krąg z rosnącym cieniem; przez 3,5 s spada płonący okręt ciągnący ogień i dym. Miejsce zawsze 380–800 px od marines, ≥ 260 px od wyłomów, poza ścianami. Uderzenie rani tylko Tyranidów (120 obr., promień 150 px).
- Po 4 s dymu: 3–5 losowych ścian wraku (≈40% pełne, reszta niskie), nigdy na marines, wrogach, sojusznikach, wyłomach i strefie startu; ≥ 90 px odstępu od innych ścian i sprawdzenie, że cała mapa pozostaje osiągalna (brak zamkniętych kieszeni). Limit 20 ścian wraku na rozgrywkę. Ściany działają jak zwykłe (ruch, predykcja klienta, ścieżki, LOS, pociski, cień).
- Ocaleni Gwardziści Astra Militarum: 3 (solo) / 4 / 4 / 5 na katastrofę, maks. 6 naraz; 60 HP, lasgun 8 obr. S3 AP0, 420 px, co 0,5 s, tylko do widocznych Tyranidów (nie przez pełną ścianę), nigdy nie ranią marines. W fali katastrofy bronią wraku (≤ 110 px), po jej przeżyciu chodzą za najbliższym marine (70–150 px, omijają ściany) i walczą dalej. Tyranidzi mogą ich zagryźć; kwas ich nie rani. Złote kropki na minimapie.
- Kompendium/zasady: tabela fal i wstęp pokazują Psychophage (fale 5, 8, 11…) i katastrofy (brak z v18 uzupełniony), nowe opisy katastrofy i Gwardzistów.
- Lore (Lexicanum: Guardsman, Lasgun, Astra Militarum): lasgun to standardowa broń każdego Gwardzisty Imperium. Spadający okręt, ocaleni, liczby, czasy, HP i obrażenia to adaptacja balansu gry (prośba z tablicy), nie zasady 40k.
- Protokół sieci 9 (sojusznicy, katastrofa, ściany wraku w migawce). Melta (v21) i niska osłona (v19) bez zmian.

## v21

- Meltagun bez przebicia: każdy strzał trafia bezpośrednio tylko pierwszego wroga na linii (także gdy pancerz go zatrzyma), potem promień leci dalej do końca zasięgu i robi jeden wybuch jak dotąd (albo na pełnej ścianie). Pudło w celu za niską osłoną nie zużywa tego trafienia.
- Odstęp między strzałami 0,87 s → 1,13 s.
- Bez zmian: trafienie 300 S9 AP4, wybuch 50–30 w promieniu 66 px S4 AP0, zasięg / czas lotu / prędkość, magazynek 6, przeładowanie 2,2 s, odrzut i ruch, inne bronie.

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
