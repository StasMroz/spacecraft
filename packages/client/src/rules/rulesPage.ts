/** Rules & instructions (Polish), plus the generated compendium. */
import {
  COVER,
  GAME_VERSION,
  MARINE_AIM_RECOIL,
  MARINE_DIRECTIONAL_ARMOUR,
  MARINE_GUARD,
  MARINE_SPRINT,
  MAX_PLAYERS,
  PLAYER,
  enemyProjectileDeflectChances,
  leaderboardBoard,
  dropRates,
  type ContentRegistry,
  CRASH,
  GUARDSMAN,
  MISSIONS,
  REINFORCE,
  reinforceBudget,
} from '@sms/shared';
import { boardFor } from '../devPreview.js';
import { escapeHtml as esc } from '../ui/format.js';
import { compendiumHtml } from './compendium.js';

export function rulesHtml(c: ContentRegistry): string {
  const ws = c.weaponOrder;
  const start = ws
    .filter((w) => w.unlockAtWave === 0)
    .map((w) => esc(w.name))
    .join(', ');
  const chapterSpecials = c.chapters
    .map((ch) => {
      const w = c.weapon(ch.specialWeapon);
      return `<li><b>${esc(ch.name)}</b> — ${esc(w.name)} (fala ${w.unlockAtWave})</li>`;
    })
    .join('');
  const chapterMelee = c.chapters
    .map((ch) => {
      const w = c.weapon(ch.meleeWeapon);
      const dmg = String(w.projectile.damage).replace('.', ',');
      const iv = String(Number(w.fireInterval.toFixed(2))).replace('.', ',');
      return `<li><b>${esc(ch.name)}</b> — ${esc(w.name)} (${dmg} obr., co ${iv} s)</li>`;
    })
    .join('');
  const bursts = ws
    .filter((w) => w.projectile.endBurst)
    .map((w) => {
      const b = w.projectile.endBurst!;
      return `<li><b>${esc(w.name)}: błysk na końcu zasięgu</b> — gdy pocisk doleci do końca zasięgu (${Math.round(w.projectile.speed * w.projectile.lifetime)} px), błyska małym wybuchem cieplnym: ${b.damage} obrażeń w promieniu ${b.radius} px (na krawędzi ${Math.round(b.edgeFactor * 100)}%). ${w.projectile.pierce === 0 && !w.projectile.pierceBudget ? 'Działa też po trafieniu pierwszego celu: pocisk leci dalej do końca zasięgu bez kolejnych trafień i błyska raz' : 'Działa też po przebiciu celów (promień leci dalej)'}; nie ma błysku po wyjściu poza arenę. Rani tylko Tyranidów, nigdy marines.</li>`;
    })
    .join('');
  const unlocks = ws
    .filter((w) => w.unlockAtWave && !w.chapter)
    .map(
      (w) =>
        `<li><b>${esc(w.name)}</b> — na starcie fali ${w.unlockAtWave}${w.melee ? ' (wręcz)' : ''}</li>`,
    )
    .join('');
  const boss = c.enemy(c.director.bosses.enemy).name;
  const d = c.director;
  const A = MARINE_DIRECTIONAL_ARMOUR;
  const G = MARINE_GUARD;
  const SP = MARINE_SPRINT;
  const sec = (v: number) => `${String(Number(v.toFixed(2))).replace('.', ',')} s`;
  const pc = (v: number) => `${String(Number((v * 100).toFixed(1))).replace('.', ',')}%`;
  const mul = (v: number) => `×${String(v).replace('.', ',')}`;
  const num = (v: number) => String(Number(v.toFixed(2))).replace('.', ',');
  const soloDrops = dropRates(d, 1);
  const defl = enemyProjectileDeflectChances(c.enemies.values());
  const shooters = [...c.enemies.values()].filter(
    (e) => e.ranged && defl[e.ranged.projectile.kind],
  );
  const deflList = shooters
    .map((e) => `<b>${esc(e.name)}</b> ${pc(defl[e.ranged!.projectile.kind]!)}`)
    .join(', ');
  const noDefl = [...c.enemies.values()]
    .filter((e) => e.ranged && !defl[e.ranged.projectile.kind])
    .map((e) => esc(e.name))
    .join(', ');
  const board = boardFor(leaderboardBoard(GAME_VERSION));
  const boardShare =
    board !== GAME_VERSION
      ? `; v${esc(GAME_VERSION)} dzieli tę tablicę z v${esc(board)} (bez osobnego boards/${esc(GAME_VERSION)})`
      : '';
  return `
<header class="top">
  <a class="back" href="./">← WRÓĆ DO GRY</a>
  <h1>${esc(c.title)} <span>· zasady</span></h1>
  <p class="muted">Wersja v${GAME_VERSION}</p>
</header>
<nav class="toc">
  <a href="#cel">Cel</a><a href="#misje">Misje</a><a href="#posilki">Posiłki</a><a href="#sterowanie">Sterowanie</a><a href="#sprint">Sprint</a><a href="#tryby">Tryby</a><a href="#multi">Multiplayer</a><a href="#glos">Czat głosowy</a><a href="#bron">Broń</a><a href="#odrzut">Odrzut</a><a href="#pancerz">Pancerz</a><a href="#postawa">Postawa obronna</a><a href="#wrogowie">Tyranidzi</a><a href="#punkty">Punkty</a><a href="#rady">Rady</a><a href="#kompendium">Kompendium</a>
</nav>
<section id="cel"><h2>Cel gry</h2>
  <p>Jesteś Space Marine broniącym zrujnowanej iglicy ula. Tyranidzi atakują <b>falami</b> z wyłomów w ścianach i szybów w podłodze. Następna fala rusza dopiero, gdy zginie cała poprzednia (po ${d.waves.breather} s przerwy). Każda fala jest większa, a potwory mają więcej życia. Co ${d.bosses.everyWave}. fala od ${d.bosses.firstWave}. prowadzi boss — <b>${esc(boss)}</b>.${d.support ? ` Od fali ${d.support.firstWave}. co ${d.support.everyWave}. falę dołącza boss wsparcia — <b>${esc(c.enemy(d.support.enemy).name)}</b>.` : ''}</p>
  <p>Domyślna misja — <b>Oblężenie ula</b> — to niekończące się fale z krawędzi areny i jedyna misja liczona do głównego rankingu (ten sam pokład, ten sam startowy loadout; seed losowy jak dotychczas). Gra kończy się, gdy padnie cały oddział i skończą się posiłki. Inne zlecenia zapisują wynik tylko lokalnie. <b>Zabójstwo tyrana</b> i <b>Spalenie gniazd</b> to misje ofensywne: lądujecie wśród już rozstawionych Tyranidów, bez fal z krawędzi, i posuwacie się do celu (strażnik synapsy albo gniazda, które same wypuszczają posiłki). Pozostałe zlecenia mają limit czasu i strefę ekstrakcji Thunderhawka.</p>
</section>
<section id="misje"><h2>Misje</h2>
  <p>Oddział może dostać jedno z kilku zleceń (jak dropy w Helldivers 2, w klimacie 40k). Domyślnie grasz <b>Oblężenie ula</b>. Host wybierze misję w menu (gdy pojawi się przełącznik); do tej pory działa też <code>?mission=id</code>.</p>
  <ul>
${MISSIONS.map((m) => {
  const time = m.timeLimit ? `${m.timeLimit} s` : 'bez limitu';
  const crates = m.crates
    ? 'zrzuty zaopatrzenia włączone'
    : 'zrzuty zaopatrzenia wyłączone (cień w warpie)';
  const crash = m.crash ? 'katastrofa okrętu włączona' : 'bez katastrofy okrętu';
  return `    <li><b>${esc(m.name)}</b> (<code>${m.id}</code>) — ${esc(m.description)} Cel: ${esc(m.objective)} Limit: ${time}. ${crates}; ${crash}.</li>`;
}).join('\n')}
  </ul>
  <p>Strefa ekstrakcji otwiera się w swoim czasie (albo po zniszczeniu celów). Wszyscy żywi marine muszą stać w strefie ${MISSIONS.find((m) => m.extractHold)?.extractHold ?? 5} s. Jeśli relikwię trzeba donieść, nosiciel też musi być w strefie. Po upływie limitu czasu misja przegrana — chyba że oddział już stoi w otwartej strefie (ostatnia szansa dokończyć ekstrakcję).</p>
</section>
<section id="posilki"><h2>Posiłki (zrzut kapsuły)</h2>
  <p>Oddział ma wspólną pulę żyć: <b>${reinforceBudget(1)}</b> w pojedynkę, plus ${REINFORCE.budgetPerExtra} za każdego dodatkowego brata (np. ${reinforceBudget(3)} przy trzech marine). To nie jest zaopatrzenie — posiłki działają także w misjach, w których cień w warpie tłumi skrzynie z bronią.</p>
  <p>Poległy marine wraca w <b>drop-podzie</b>. Żywy brat wzywa go klawiszem <b>X</b> albo przyciskiem <b>REINF</b> (kapsuła ląduje przed jego celownikiem, do ${REINFORCE.throwRange} px). W solo — albo gdy nikt nie został na nogach — zrzut leci automatycznie po cooldownie, dopóki pula &gt; 0. Lądowanie zadaje ${REINFORCE.impactDamage} obrażeń Tyranidom w promieniu ${REINFORCE.impactRadius} px (marines są bezpieczni). Po wyjściu z kapsuły marine ma ${REINFORCE.invulnS} s nietykalności i pełne życie.</p>
  <p>Po wezwaniu następuje cooldown: najpierw ${REINFORCE.cooldownBaseS} s, potem +${REINFORCE.cooldownPerStreakS} s za każde kolejne wezwanie w serii (maks. ${REINFORCE.cooldownCapS} s). Seria spada o 1 po ${REINFORCE.streakDecayS} s bez wezwania. Podniesienie rannego brata na miejscu <b>nie zużywa</b> puli. Gdy pula spadnie do zera i wszyscy nie żyją (i żadna kapsuła już nie spada), misja jest przegrana.</p>
  <p>Ostatni żywy marine, który padnie, ginie od razu (nie czeka na wykrwawienie — nie ma kto go podnieść). Jeśli w puli zostało życie, kapsuła przyleci po cooldownie.</p>
</section>
<section id="sterowanie"><h2>Sterowanie</h2>
  <div class="two">
    <div><h3>Komputer</h3><ul>
      <li><b>WASD / strzałki</b> — ruch</li>
      <li><b>Mysz</b> — celowanie</li>
      <li><b>Lewy przycisk / Spacja</b> — strzał (przytrzymaj przy broni automatycznej)</li>
      <li><b>1–9</b>, <b>Q / E</b>, <b>kółko myszy</b> — zmiana broni (klawisz 7 to broń wręcz zakonu)</li>
      <li><b>Shift</b> (przytrzymaj) — sprint</li>
      <li><b>Prawy przycisk myszy</b> (przytrzymaj) — postawa obronna (tylko stojąc w miejscu)</li>
      <li><b>R</b> — przeładowanie</li>
      <li><b>X</b> — wezwij posiłki (drop-pod poległego brata)</li>
      <li><b>M</b> — wycisz dźwięk</li>
      <li><b>Esc</b> — menu / wyjście (w grze solo pauza)</li>
    </ul></div>
    <div><h3>Telefon / tablet</h3><ul>
      <li><b>Lewy kciuk</b> (lewa połowa ekranu) — ruch</li>
      <li><b>Prawy kciuk</b> — celowanie i automatyczny ogień</li>
      <li><b>SPRINT</b> (przytrzymaj, nad prawym drążkiem AIM · FIRE) — sprint. Przycisk jest nad atakiem, nie na lewym drążku.</li>
      <li><b>ARMS</b> (kółko nad przyciskiem sprintu i ataku) — stuknij albo przytrzymaj, żeby otworzyć kółko broni; wybierz palcem. Zastępuje dawny słupek ikon po prawej.</li>
      <li><b>🛡 GUARD</b> (przytrzymaj, prawa strona) — postawa obronna (tylko stojąc w miejscu)</li>
      <li><b>⟳</b> — przeładowanie, <b>⬇ REINF</b> — wezwij posiłki, <b>🔊</b> — dźwięk, <b>⏸</b> — menu</li>
      <li><b>⛶</b> — pełny ekran (Android). Na iPhonie: Udostępnij → „Do ekranu początkowego”, potem uruchamiaj grę z ikony.</li>
      <li>Najlepiej grać poziomo.</li>
    </ul></div>
  </div>
</section>
<section id="sprint"><h2>Sprint</h2>
  <p>Marine może na chwilę rzucić się biegiem: <b>${mul(SP.speedMul)}</b> zwykłej prędkości (${Math.round(PLAYER.speed * SP.speedMul)} px/s — ciężar broni nie spowalnia sprintu). Sprint zaczyna się od razu, ale <b>w biegu nie da się strzelać</b> — spust jest ignorowany i nie przerywa sprintu.</p>
  <p><b>Sprint nie ruszy, póki trzymasz spust</b> (mysz/klawisz strzału albo strzelający drążek celowania): prośba o sprint (Shift albo przycisk SPRINT na telefonie) czeka, a gdy puścisz spust i nadal chcesz biec, sprint rusza od razu. Sprint, który już trwa, biegnie dalej — spust jest wtedy ignorowany, jak wyżej.</p>
  <ul>
    <li><b>Kondycja</b>: ${sec(SP.staminaMaxS)} sprintu (pasek pod marine). Kończy się sama przy zerze; ponownie ruszysz dopiero, gdy będzie co najmniej ${sec(SP.minToStartS)}.</li>
    <li>Kondycja wraca zawsze, gdy <b>nie sprintujesz</b>: pełna po ${sec(SP.staminaMaxS / SP.regenStandingPerS)} stania w miejscu, a podczas marszu o połowę wolniej (pełna po ${sec(SP.staminaMaxS / SP.regenWalkingPerS)}). W sprincie tylko spada.</li>
    <li>Po sprincie broń jest gotowa dopiero po <b>${sec(SP.weaponReadyDelayS)}</b> (złoty pasek „READY…” na ikonie broni). Broń półautomatyczną trzeba wtedy nacisnąć ponownie.</li>
    <li>W sprincie marine patrzy tam, dokąd biegnie — <b>uciekając, nadstawiasz plecy</b> (tylny pancerz ${mul(A.rear)}).</li>
    <li>Nie da się sprintować, podnosząc brata (w promieniu ${PLAYER.reviveRadius} px od powalonego).</li>
    <li>W sprincie marine biegnie z pustymi rękami (broni nie widać); po sprincie broń pojawia się i unosi do celu przez czas gotowości.</li>
    <li>Sprint innych graczy widać po kurzu i smugach za marine.</li>
  </ul>
</section>
<section id="tryby"><h2>Tryby gry</h2><ul>
  <li><b>SOLO DEPLOY</b> — samotna obrona. Esc pauzuje grę.</li>
  <li><b>HOST SQUAD (CO-OP)</b> — zakładasz pokój i zapraszasz do ${MAX_PLAYERS} marines łącznie.</li>
  <li><b>JOIN</b> — dołączasz kodem pokoju.</li>
  <li>Wybierz <b>CALLSIGN</b> (pseudonim) i <b>CHAPTER</b> (barwy zakonu) przed startem.</li>
</ul></section>
<section id="multi"><h2>Jak zagrać ze znajomymi</h2><ol>
  <li>Jedna osoba klika <b>HOST SQUAD</b> — pojawia się kod pokoju, link i kod QR.</li>
  <li>Pozostali skanują QR, otwierają link albo wpisują kod w polu <b>ROOM CODE</b> i klikają <b>JOIN</b>.</li>
  <li>Gdy wszyscy są w pokoju, host startuje misję.</li>
  <li>Gra wymaga internetu (łączenie graczy). Działa też na danych komórkowych.</li>
  <li>Jeśli host wyjdzie, pokój się zamyka.</li>
</ol>
<p><b>Więcej graczy = trudniej</b>: więcej wrogów, szybszy napływ, więcej elit i bossów, potwory mają więcej życia. Dokładne mnożniki są w kompendium.</p>
<p><b>Ranny brat</b>: marine z zerowym życiem pada i czeka na pomoc. Stań obok niego (do ${PLAYER.reviveRadius} px) przez ${PLAYER.reviveTime} s, a wstanie z ${Math.round(PLAYER.reviveHpFraction * 100)}% życia. Ma na to ${PLAYER.bleedOutTime} s — potem ginie.</p>
</section>
<section id="glos"><h2>Czat głosowy</h2>
  <p>Głos jest <b>domyślnie wyłączony</b>. Włącza go host w pokoju oddziału przełącznikiem <b>🎙 CZAT GŁOSOWY</b> (przed startem misji); pozostali widzą w pokoju, czy głos jest włączony. W grze solo głosu nie ma.</p>
  <ul>
    <li>Gdy głos jest włączony, u góry ekranu pojawia się przycisk <b>🎙 GŁOS</b>. Dotknij go, żeby dołączyć — przeglądarka zapyta o mikrofon. Odmowa jest w porządku: wtedy <b>tylko słuchasz</b>.</li>
    <li><b>Push-to-talk</b> (domyślnie): przytrzymaj klawisz <b>V</b> albo przycisk mikrofonu i mów.</li>
    <li><b>OPEN</b> — otwarty mikrofon; ten sam przycisk wtedy <b>wycisza</b> / włącza mikrofon.</li>
    <li>Każdy gracz ma swój chip z nazwą (świeci, gdy mówi). Dotknij go, żeby zmienić <b>głośność</b>: 100% → 50% → wyciszony.</li>
    <li><b>✕</b> — wyjście z czatu głosowego (gra trwa dalej).</li>
    <li><b>iPhone</b>: dźwięk może przełączyć się na słuchawkę rozmów albo ściszyć efekty gry — najlepiej w słuchawkach. Nie przełączaj aplikacji i nie blokuj ekranu: iOS zatrzymuje wtedy mikrofon; po powrocie dotknij „🎙 GŁOS” ponownie. Na głośniku może pojawić się echo — używaj push-to-talk.</li>
  </ul>
</section>
<section id="bron"><h2>Broń</h2>
  <p>Na start masz: <b>${start}</b>. Kolejne bronie odblokowują się wszystkim (żywym i powalonym) na początku kolejnych fal:</p><ul>${unlocks}</ul>
  <p>Na starcie fali 4.  każdy zakon dostaje <b>własną broń specjalną</b> zamiast wspólnego flamera (klawisz 3). Skrzynia z cudzą specjalnością staje się twoją. Mapowanie:</p><ul>${chapterSpecials}</ul>
  <p>Na starcie fali 2. każdy zakon dostaje <b>jedną broń wręcz</b> (klawisz 7 albo kółko ARMS) zamiast wspólnego wyboru trzech. Skrzynia z cudzą bronią wręcz staje się twoją. Zamach jest widoczny (łuk ostrza i smuga w kolorze broni), zsynchronizowany z trafieniem. Broń wręcz nie zużywa amunicji. Gwardziści sojuszniczy strzelają lasgunem — nie mają ataku wręcz. Mapowanie:</p><ul>${chapterMelee}</ul>
  <p>Dodatkowo na większości misji spadają <b>skrzynie z bronią</b> (co ${sec(d.crates.intervalMin)}–${sec(d.crates.intervalMax)}, średnio ${num(soloDrops.crates)} na falę w pojedynkę), a z zabitych Tyranidów — <b>apteczki</b> (do średnio ${num(soloDrops.medkits)} na falę w pojedynkę; więcej w większym oddziale, boss zawsze zostawia apteczkę). Każda broń ma rolę: ANTI-HORDE na roje drobnicy, ANTI-ELITE/ANTI-TANK na duże bestie.</p>
  <ul>
    <li><b>Strzelanie spowalnia</b>: ciężka broń spowalnia zawsze, a przy wciśniętym spuście jeszcze bardziej.</li>
    <li><b>Zaparcie</b>: niektóre ciężkie bronie, gdy stoisz w miejscu, strzelają szybciej i celniej.</li>
    <li><b>Plazma się grzeje</b>: powyżej kreski strzały są przeładowane (mocniejsze), na szczycie broń się przegrzewa i rani strzelca.</li>
    <li><b>Siła vs Wytrzymałość i pancerz</b>: lekka broń odbija się od pancerza Carnifexa, Meltagun przebija każdy pancerz i do trzech kolejnych celów na linii (pierce 3), a na końcu zasięgu zawsze robi jeden wybuch.</li>
    ${bursts}
  </ul>
</section>
<section id="sciany"><h2>Ściany i osłony</h2>
  <ul>
    <li><b>Pełna ściana</b> (szary grodź): nie da się przez nią przejść ani zaatakować wręcz, zatrzymuje pociski i wybuchy, a to, co za nią, jest zasłonięte (cień).</li>
    <li><b>Niska osłona</b> (barykada w żółte pasy): blokuje ruch i walkę wręcz, ale widać i strzela się nad nią. Pociski (marine, Tyranidów i Gwardzistów) z osłony do ${COVER.ignoreNear} px od strzelca zawsze swobodnie nad nią przelatują. Gdy osłona jest dalej, pocisk ma <b>${Math.round(COVER.stopChance * 100)}%</b> szansy, że zatrzyma się NA niej (jak na ścianie; melta wtedy błyska na osłonie) — losowane raz na pocisk i osłonę, inaczej leci dalej. To decyzja balansu, nie zasada z 40k.</li>
    <li><b>Kwas</b>: kałuże kwasu zostawiają tylko <b>Biovory</b> (ich spore i zasiane Spore Mines). Inne jednostki (Termaganty, Warriory, Carnifex) nie zostawiają plam — Carnifex nadal może z dystansu rzucić kulę, ale bez kałuży. Kwas parzy co 0,5 s każdego marine w plamie (5 obrażeń, pancerz nie chroni), nigdy przez pełną ścianę. Wartości to balans gry, nie zasady 40k.</li>
    <li>Tyranidzi obchodzą ściany, a ci strzelający plują tylko, gdy widzą cel.</li>
    <li><b>Katastrofa okrętu Imperium</b> (fala ${CRASH.firstWave} i co ${CRASH.everyWave} fale, ${CRASH.delay} s po starcie fali): czerwony krąg i cień pokazują, gdzie za ${CRASH.fallTime} s spadnie płonący okręt (zawsze ≥ ${CRASH.minPlayerDist} px od marines). Uderzenie rani tylko Tyranidów (${CRASH.impact.damage} obr., ${CRASH.impact.radius} px). Gdy po ${CRASH.smokeTime} s opadnie dym, zostają losowe ściany wraku (pełne i niskie, nigdy nie zamykają przejść) i ${CRASH.soldiers[0]}–${CRASH.soldiers[CRASH.soldiers.length - 1]} ocalałych Gwardzistów (maks. ${CRASH.maxAllies} naraz).</li>
    <li><b>Gwardziści</b> (lasgun ${GUARDSMAN.lasgun.damage} obr. S${GUARDSMAN.lasgun.strength} AP${GUARDSMAN.lasgun.ap}, ${GUARDSMAN.range} px, ${GUARDSMAN.hp} HP): zostają w miejscu, w którym wylądowali (przy wraku) — nie chodzą i nie podążają za marine, tylko celują i strzelają do widocznych Tyranidów. Nie ranią marines; Tyranidzi mogą ich zagryźć. To adaptacja balansu, nie zasady 40k.</li>
  </ul>
</section>
<section id="odrzut"><h2>Odrzut</h2>
  <p>Każdy strzał <b>kopie celownik</b> lekko w bok (losowo, częściej w prawo). Celownik na ekranie pokazuje dokładnie, gdzie poleci następny pocisk; jasna kropka — gdzie naprawdę wskazuje mysz lub drążek. Odchylenie samo wraca w ułamku sekundy.</p>
  <ul>
    <li><b>Stojąc</b> (i w zaparciu) odrzut to tylko <b>${mul(MARINE_AIM_RECOIL.standingMul)}</b> — strzelaj z miejsca, gdy liczy się celność.</li>
    <li><b>W marszu</b> odrzut jest pełny (${mul(MARINE_AIM_RECOIL.walkingMul)}), proporcjonalnie do prędkości.</li>
    <li>Najmocniej kopie <b>Meltagun</b>, w serii najbardziej rozjeżdża się <b>Heavy Bolter</b>; Miotacz ognia prawie nie ma odrzutu. Liczby — w kompendium.</li>
    <li>W grze przez sieć celownik gościa nadąża za odrzutem z opóźnieniem pingu.</li>
  </ul>
</section>
<section id="pancerz"><h2>Pancerz kierunkowy</h2>
  <p>Pancerz wspomagany najlepiej chroni z przodu. <b>Przód to kierunek, w którym celujesz</b> (mysz albo prawy kciuk; gdy na telefonie tylko idziesz — kierunek marszu; w sprincie — kierunek biegu). Liczy się, skąd przychodzi atak: przy ciosie wręcz i szarży — gdzie stoi potwór, przy pocisku — skąd nadleciał, przy wybuchu — gdzie jest jego środek.</p>
  <ul>
    <li><b>Przód</b> (±${A.frontArcDeg}° od kierunku celowania) — obrażenia <b>${mul(A.front)}</b></li>
    <li><b>Boki</b> — obrażenia <b>${mul(A.side)}</b></li>
    <li><b>Tył</b> (±${A.rearArcDeg}° od pleców) — obrażenia <b>${mul(A.rear)}</b></li>
  </ul>
  <p><b>Rykoszet</b>: pocisk Tyranida, który trafi w przedni pancerz, może się od niego odbić — nie zadaje wtedy obrażeń, a od marine sypią się iskry. Szansa zależy od rodzaju pocisku — najsłabsze odbijają się najczęściej, mocniejsze rzadziej: ${deflList}.${noDefl ? ` Pocisk wybuchowy (${noDefl}) nigdy się nie odbija.` : ''} Ciosy wręcz i wybuchy nie odbijają się nigdy.</p>
  <p>Przegrzanie plazmy rani zawsze tak samo, niezależnie od kierunku. Twój wybuch, który zahaczy brata, liczy się od środka wybuchu.</p>
  <p class="muted">Stałe: <code>packages/shared/src/data/armour.ts</code> (<code>MARINE_DIRECTIONAL_ARMOUR</code>, <code>MARINE_DEFLECTION</code>). Szanse rykoszetu per pocisk — w danych wrogów / tabeli w kompendium.</p>
</section>
<section id="postawa"><h2>Postawa obronna</h2>
  <p>Przytrzymaj <b>prawy przycisk myszy</b> (PC) albo <b>🛡 GUARD</b> (telefon, prawa strona), stojąc w miejscu. Każdy ruch natychmiast kończy postawę. To nie to samo co <b>zaparcie</b> ciężkiej broni (szybszy ogień / ciaśniejszy stożek po chwili bez ruchu) — postawa działa z każdą bronią i dotyczy tylko obrony.</p>
  <ul>
    <li><b>Pancerz przedni +${Math.round(G.frontArmourBonus * 100)}%</b> — mnożnik obrażeń z przodu spada z ${mul(A.front)} do <b>${mul(G.frontMul)}</b> (ciosy wręcz, pociski i wybuchy z przedniej ćwiartki).</li>
    <li><b>Rykoszet</b>: szansa, że pocisk <em>nie</em> odbije się od przedniego pancerza, jest ×${num(G.nonDeflectFactor)} (czyli szansa odbicia rośnie: ${pc(0.5)} bazowe → ${pc(1 - G.nonDeflectFactor * (1 - 0.5))}). Formuła: <code>1 − ${num(G.nonDeflectFactor)}·(1 − baza)</code>.</li>
    <li><b>Trafienie, które mimo to przeszło</b> (pocisk z przodu, bez rykoszetu) dostaje jeszcze <b>${mul(G.landedDamageMul)}</b> obrażeń (−${Math.round((1 - G.landedDamageMul) * 100)}%). Ciosy wręcz i wybuchy dostają tylko twardszy przedni pancerz — bez tej dodatkowej zniżki.</li>
  </ul>
  <p class="muted">Stałe: <code>packages/shared/src/data/guard.ts</code> (<code>MARINE_GUARD</code>). Symulacja: <code>Player.guarding</code>; sieć: flaga <code>gd</code>.</p>
</section>
<section id="wrogowie"><h2>Tyranidzi</h2><ul>
  ${[...c.enemies.values()]
    .sort((a, b) => a.threat - b.threat)
    .map(
      (e) =>
        `<li><b>${esc(e.name)}</b>${e.boss ? ' <b class="boss">BOSS</b>' : ''} — ${esc(e.role)}</li>`,
    )
    .join('')}
</ul></section>
<section id="punkty"><h2>Punkty i ranking</h2>
  <p>Zabicie daje punkty marine, który zadał ostatni cios (wartości w kompendium). Na koniec misji widzisz podsumowanie oddziału i listę wszystkich zabitych Tyranidów.</p>
  <p>Ranking (<b>HONOURED DEAD</b>) jest osobny dla każdej wersji gry (obecnie tablica <b>${esc(board)}</b>${boardShare}) i dla każdej liczby graczy. Są dwie listy: najdłuższe przetrwanie oddziału i najwyższe wyniki marines.</p>
</section>
<section id="rady"><h2>Rady</h2><ul>
  <li>Trzymajcie się razem — podniesienie brata ratuje misję.</li>
  <li>Bolt Rifle na drobnicę, ciężką broń zostaw na Warriorów i Carnifexa.</li>
  <li>Hormagaunty i Carnifex szarżują — uskocz, gdy widzisz zamach.</li>
  <li>Spore Mine wybucha przy marines — zestrzel ją z daleka (zabójstwa od jej wybuchu idą na Twoje konto).</li>
  <li>Tyranid Warrior to stwór synapsy — przyspiesza i wzmacnia rój wokół siebie. Biovore wypuszcza Spore Mine. Zabijaj je w pierwszej kolejności.</li>
  <li>Psychophage (boss wsparcia, fala 5 i co 3 fale) sam gryzie słabo, ale jego Bio-stimulus (fioletowy pierścień 240 px) daje widzianym Tyranidom +15% prędkości, +20% obrażeń, −15% otrzymywanych obrażeń i każe im otaczać marine z każdej strony. Pełna ściana odcina aurę, bonusy się nie sumują, a jego śmierć od razu zdejmuje buff.</li>
  <li>Puść spust, żeby uciec — strzelanie spowalnia. W razie biedy sprint, ale pamiętaj o plecach i o chwili bez broni po biegu.</li>
  <li>Nie odwracaj się plecami do roju — z tyłu dostajesz najmocniej, a z przodu pancerz odbija część pocisków.</li>
</ul></section>
<section id="kompendium"><h2>Kompendium</h2>
  <details><summary>Wszystkie wartości potworów i broni (matematyka)</summary>
  ${compendiumHtml(c)}
  </details>
</section>
<footer class="muted">Nieoficjalny, niekomercyjny projekt fanowski. Nie jest powiązany z Games Workshop.</footer>`;
}
