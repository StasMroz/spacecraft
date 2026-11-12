# Brief dla spacecraft menu: Pojedynek PvP (`duel`) — v46 / v48

Gra (silnik i host) już obsługuje pojedynki. Menu **nie musi** ruszać Firebase ani protokołu (`PROTOCOL_VERSION` zostaje 10). Wystarczy podpiąć istniejące API.

## Co to jest

- Misja `duel` / nazwa **Pojedynek**, mapa `duel` (mała arena 2000×1400 z osłonami).
- Marine vs marine na istniejącym P2P (albo local/dedicated — ten sam host).
- **1v1** (2 graczy) albo **2v2** (4 graczy: zachód vs wschód, kolejność wejścia 1+3 vs 2+4). 3 graczy też zadziała (2v1), ale w lobby warto proponować 2 albo 4.
- **Best of 3**: pierwszy zespół / zawodnik do **2 zabójstw** wygrywa (`duelTo: 2`).
- Po upadku: odrodzenie w swoim rogu (~1,5 s), pełne HP, krótka nietykalność. Bez reanimacji, bez Tyranidów, bez fal, bez skrzyń.
- Wynik w HUD (`1 – 0`). Ekran końca: „DUEL COMPLETE” i wynik — ten sam dla całej izby (nie „MISJA WYKONANA / LINIA PADŁA”).
- **Nie wchodzi do rankingu głównego** (`ranked` nieustawione, `countsForLeaderboard('duel') === false`). Ranking 1v1 jest osobną tablicą (v48, niżej).

## API, które menu już ma

1. **URL:** `?mission=duel` — host / solo startuje Pojedynek (nieznane id i tak spadają na Oblężenie ula). Do P2P dopnijcie zwykły flow hosta (`?join=KOD` dla gości).
2. **Lobby:** `HostSession.setMission('duel')` — to samo API co przy innych zleceniach; id leci w `lobby` i w `start`. Gość tylko czyta `lobby.mission`.
3. **Katalog:** wpis jest w `MISSIONS` (`id`, `name`, `description`, `objective`, `kind: 'duel'`, `map: 'duel'`, `duelTo: 2`). Picker menu, który listuje `MISSIONS`, pokaże Pojedynek automatycznie — nie trzeba twardej listy pięciu misji.
4. **Start:** jak dotychczas `requestStart()` gdy w izbie są 2 (1v1) lub 4 (2v2) marine. Host może startować też przy 2+; silnik rozstawia narożniki po kolejności dołączenia.

## Co dodać w menu (propozycja, bez zmian w tym PR)

- Kafelek / pozycja pickera **Pojedynek** z krótkim opisem z `MISSIONS`.
- Hint: „2 graczy = 1v1, 4 graczy = 2v2. Pierwszy do dwóch zabójstw. Bez rankingu.”
- Opcjonalnie: lobby nie pozwala wystartować przy 1 graczu (solo to tylko trening/strzał); przy 3 — ostrzeżenie 2v1.
- Nie dodawajcie osobnej kolekcji wyników ani zmian protokołu. `GAME_VERSION` zostaje `0.6.1`.

## Test ręczny

`?autosolo=1&mission=duel&firestore=0` — pojedynczy marine na arenie (do podglądu). Pełny 1v1: host `?mission=duel`, gość `?join=KOD`.

## v48 — ranking 1v1 (tylko dokładnie dwóch graczy)

```ts
import { fetchDuelRanking } from '../../packages/client/src/highscores/duelRanking.ts';

const rows = await fetchDuelRanking();
// { name: string; rating: number; wins: number; losses: number }[]
// posortowane malejąco po ratingu, limit 50
```

- Liczy się wyłącznie skończony Pojedynek 1v1 (dokładnie 2 graczy, first to 2). 2v2, 2v1 i solo/trening nie wchodzą. Zapisuje host P2P, raz na mecz (`runId`).
- Elo: start 1000, K=32. Pola: `name`, `rating`, `wins`, `losses`.
- Kolekcje Firestore: `duelMatches`, `duelRatings`. Nie ruszają `boards/*/highscores`.
- P2P z jednym graczem nie wystartuje Pojedynku. Solo (`?autosolo=1&mission=duel`) to trening z wyjściem ESC — mecz sam się nie kończy.
- `GAME_VERSION` zostaje `0.6.1`, protokół 10.
