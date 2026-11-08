/**
 * Rules page compendium: every number is read from the shared content tables (@sms/shared),
 * so the page is always correct for the version it ships with. Pure functions -> HTML strings.
 */
import {
  GAME_VERSION,
  MARINE_AIM_RECOIL,
  MARINE_DEFLECTION,
  MARINE_DIRECTIONAL_ARMOUR,
  MARINE_GUARD,
  MARINE_SPRINT,
  MAX_PLAYERS,
  PICKUP,
  PLAYER,
  TICK_RATE,
  dropRates,
  enemyProjectileDeflectChances,
  expectedDps,
  expectedShotDamage,
  recoilRecoveryTime,
  weaponRecoil,
  sustainedDps,
  saveChance,
  weaponProfileLabel,
  woundMul,
  type ContentRegistry,
  type EnemyDef,
  type WeaponDef,
  type EnemySize,
  type PierceBudget,
} from '@sms/shared';
import { escapeHtml as esc } from '../ui/format.js';

const n = (v: number, d = 1): string => {
  const r = Number(v.toFixed(d));
  return String(r).replace('.', ',');
};
const pct = (v: number, d = 0): string => `${n(v * 100, d)}%`;
const deg = (rad: number): string => `${n((rad * 180) / Math.PI, 1)}°`;
const sv = (s: number): string => (s >= 7 ? 'brak' : `${s}+`);
const ap = (a?: number): string => (a ? `-${a}` : '0');

function table(head: string[], rows: string[][], cls = ''): string {
  return `<div class="tw"><table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`,
    )
    .join('')}</tbody></table></div>`;
}

const unlockLabel = (w: WeaponDef): string =>
  w.unlockAtWave === 0
    ? 'od startu'
    : w.unlockAtWave === null
      ? 'tylko skrzynie'
      : `fala ${w.unlockAtWave}`;

const SIZE_LABEL: Record<EnemySize, string> = {
  large: 'duże',
  medium: 'średnie',
  small: 'małe',
  tiny: 'najmniejsze',
};
const pierceBudgetLabel = (b: PierceBudget) =>
  (Object.keys(SIZE_LABEL) as EnemySize[])
    .map((s) => `${Math.floor(b.total / b.cost[s])} ${SIZE_LABEL[s]}`)
    .join(' / ');

/** Weapon base stats. */
export function weaponTable(c: ContentRegistry): string {
  const rows = c.weaponOrder.map((w) => {
    const p = w.projectile;
    const range = p.speed * p.lifetime;
    return [
      `${w.slot}. ${esc(w.name)}`,
      esc(w.roles.join(' · ')),
      esc(weaponProfileLabel(w)),
      `${n(p.damage, 1)}${w.pellets > 1 ? ` ×${w.pellets}` : ''}${p.explosion ? ` + wybuch ${n(p.explosion.damage)} (r ${p.explosion.radius})` : ''}${p.endBurst ? ` (koniec zasięgu: ${n(p.endBurst.damage)}, r ${p.endBurst.radius})` : ''}`,
      `${n(1 / w.fireInterval, 2)}/s`,
      `${w.magazine}`,
      `${n(w.reloadTime, 2)} s`,
      deg(w.spread),
      `${Math.round(range)} px`,
      p.pierceBudget ? pierceBudgetLabel(p.pierceBudget) : `${p.pierce}`,
      `${pct(w.moveSpeedMul)} / ${pct(w.moveSpeedMul * w.fireMoveMul)}`,
      unlockLabel(w),
      w.crateWeight ? `${w.crateWeight}` : '—',
    ];
  });
  return table(
    [
      'Broń',
      'Rola',
      'Profil',
      'Obrażenia / pocisk',
      'Szybkostrzelność',
      'Magazynek',
      'Przeładowanie',
      'Rozrzut',
      'Zasięg',
      'Przebicie',
      'Ruch (zwykle / strzelając)',
      'Dostępna',
      'Waga w skrzyni',
    ],
    rows,
  );
}

/** Special mechanics per weapon (heat, bracing, knockback, drag, explosion). */
export function weaponSpecials(c: ContentRegistry): string {
  const items = c.weaponOrder.map((w) => {
    const p = w.projectile;
    const s: string[] = [`odrzut ${p.knockback}`, `prędkość pocisku ${p.speed} px/s`];
    if (p.drag) s.push(`hamowanie pocisku ${pct(p.drag)}/s`);
    if (p.explosion)
      s.push(
        `wybuch: ${n(p.explosion.damage)} obrażeń w promieniu ${p.explosion.radius} px (na krawędzi ${pct(p.explosion.edgeFactor)})${p.explosion.strength !== undefined ? `, S${p.explosion.strength} AP${ap(p.explosion.ap)}` : ''}${p.explosion.friendlyFire ? ', <b>rani też marines</b>' : ''}`,
      );
    if (p.endBurst)
      s.push(
        `wybuch na końcu zasięgu (pudło albo po trafieniu — promień leci do max${p.pierce === 0 ? ', trafia bezpośrednio tylko pierwszego wroga' : ''}; nie po wyjściu z areny): ${n(p.endBurst.damage)} obrażeń w promieniu ${p.endBurst.radius} px (na krawędzi ${pct(p.endBurst.edgeFactor)})${p.endBurst.strength !== undefined ? `, S${p.endBurst.strength} AP${ap(p.endBurst.ap)}` : ''}, ${p.endBurst.friendlyFire ? '<b>rani też marines</b>' : 'tylko wrogowie'}`,
      );
    if (w.braceDelay !== undefined)
      s.push(
        `zaparcie: po ${n(w.braceDelay, 2)} s bez ruchu strzela ×${n(w.braceFireRateMult ?? 1, 2)} szybciej, rozrzut ×${n(w.braceSpreadMult ?? 1, 2)}`,
      );
    if (w.heat) {
      const h = w.heat;
      s.push(
        `ciepło: +${h.perShot}/strzał, max ${h.max}, stygnie ${h.coolPerSec}/s; od ${pct(h.superchargeAt)} strzały przeładowane (obrażenia ×${n(h.superchargeDamageMul, 2)}, S+${h.superchargeStrength ?? 0}, AP+${h.superchargeAp ?? 0}); przegrzanie: ${h.selfDamage} obrażeń dla strzelca i ${n(h.ventTime, 2)} s chłodzenia`,
      );
    }
    s.push(w.automatic ? 'automatyczna (trzymaj spust)' : 'półautomatyczna');
    return `<li><b>${esc(w.name)}</b> — ${esc(w.description)}<br><span class="muted">${s.join(' · ')}</span></li>`;
  });
  return `<ul class="specials">${items.join('')}</ul>`;
}

/** Expected DPS of every weapon vs every enemy (S vs T, armour save; no range/heat/bracing). */
export function dpsMatrix(c: ContentRegistry, mode: 'burst' | 'sustained' = 'burst'): string {
  const enemies = [...c.enemies.values()];
  const rows = c.weaponOrder.map((w) => [
    esc(w.name),
    ...enemies.map((e) => {
      const v = mode === 'burst' ? expectedDps(w, e) : sustainedDps(w, e);
      const ttk = e.hp / v;
      return `${n(v, 0)}<small>${Number.isFinite(ttk) ? ` · ${n(ttk, 2)} s` : ''}</small>`;
    }),
  ]);
  return table(['Broń \\ cel', ...enemies.map((e) => esc(e.name))], rows, 'matrix');
}

/** Supercharged DPS for heat weapons. */
export function superchargeRows(c: ContentRegistry): string {
  const heat = c.weaponOrder.filter((w) => w.heat);
  if (!heat.length) return '';
  const enemies = [...c.enemies.values()];
  return table(
    ['Przeładowany strzał', ...enemies.map((e) => esc(e.name))],
    heat.map((w) => [esc(w.name), ...enemies.map((e) => `${n(expectedDps(w, e, true), 0)}`)]),
    'matrix',
  );
}

function enemyAttack(e: EnemyDef, c: ContentRegistry): string {
  const a: string[] = [];
  if (e.behavior !== 'kamikaze' && e.contactDamage)
    a.push(
      `wręcz ${e.contactDamage} co ${n(e.contactCooldown, 2)} s (${n(e.contactDamage / e.contactCooldown, 1)} DPS)`,
    );
  if (e.ranged) {
    const r = e.ranged;
    a.push(
      `strzał ${r.projectile.damage}${r.projectile.explosion ? ` + wybuch ${r.projectile.explosion.damage} (r ${r.projectile.explosion.radius})` : ''} co ${n(r.cooldown, 2)} s, zasięg ${r.range} px (trzyma dystans ${r.preferredDistance})`,
    );
  }
  if (e.charge) {
    const ch = e.charge;
    a.push(
      `szarża: ${ch.minDistance}–${ch.triggerDistance} px, zamach ${n(ch.windup, 2)} s, ${n(ch.duration, 2)} s z prędkością ×${n(ch.speedMul, 2)}, ${ch.damage} obrażeń, odnowienie ${n(ch.cooldown, 1)} s`,
    );
  }
  if (e.explode) {
    const x = e.explode;
    a.push(
      `wybuch ${x.damage} w promieniu ${x.radius} px (krawędź ${pct(x.edgeFactor)}), lont ${n(x.fuse, 2)} s od ${x.triggerDistance} px${x.onDeath ? ', wybucha też po śmierci' : ''}`,
    );
  }
  if (e.burrow)
    a.push(
      `podkopuje się (×${n(e.burrow.speedMul, 2)} prędkości, nie można trafić), wynurza się ${e.burrow.emergeDistance} px od marine`,
    );
  if (e.synapse)
    a.push(
      `synapsa: rój w promieniu ${e.synapse.radius} px szybszy ×${n(e.synapse.speedMul, 2)}, obrażenia ×${n(e.synapse.damageMul, 2)}`,
    );
  if (e.stim)
    a.push(
      `Bio-stimulus: inne Tyranidy w promieniu ${e.stim.radius} px, które widzi (nie przez pełną ścianę), szybsze ×${n(e.stim.speedMul, 2)}, obrażenia ×${n(e.stim.damageMul, 2)}, otrzymują ×${n(e.stim.damageTakenMul, 2)} obrażeń i otaczają marine; nie kumuluje się z synapsą ani drugim źródłem`,
    );
  if (e.lobAttack)
    a.push(
      `kula kwasu na ${e.lobAttack.minDistance}–${e.lobAttack.range} px co ~${n(e.lobAttack.cooldown, 1)} s`,
    );
  if (e.spawner)
    a.push(
      `wypuszcza ${esc(c.enemies.get(e.spawner.enemy)?.name ?? e.spawner.enemy)} co ${n(e.spawner.interval, 1)} s (max ${e.spawner.max}, gdy marine bliżej niż ${e.spawner.range} px)`,
    );
  return a.join('<br>');
}

export function enemyTable(c: ContentRegistry): string {
  const eliteT = c.director.teamScaling.eliteThreat;
  const enemies = [...c.enemies.values()].sort((a, b) => a.threat - b.threat);
  return table(
    [
      'Tyranid',
      'Klasa',
      'Życie',
      'T',
      'Pancerz',
      'Prędkość',
      'Rozmiar',
      'Masa',
      'Zagrożenie',
      'Punkty',
      'Apteczka',
      'Ataki',
    ],
    enemies.map((e) => [
      `${esc(e.name)}<br><small class="muted">${esc(e.role)}</small>`,
      e.boss ? '<b class="boss">BOSS</b>' : e.threat >= eliteT ? 'ELITA' : 'rój',
      `${e.hp}`,
      `${e.toughness}`,
      sv(e.save),
      `${e.speed} px/s`,
      `r ${e.radius}`,
      `${e.mass}`,
      `${n(e.threat, 2)}`,
      `${e.points}`,
      pct(e.medkitDropChance, 1),
      enemyAttack(e, c),
    ]),
  );
}

/** Strength vs Toughness and save tables (from data/profile.ts functions). */
export function profileTables(): string {
  const ts = [3, 4, 5, 6, 8, 10];
  const ss = [3, 4, 5, 6, 8, 9, 10];
  const wound = table(
    ['S \\ T', ...ts.map((t) => `T${t}`)],
    ss.map((s) => [`S${s}`, ...ts.map((t) => `×${n(woundMul(s, t), 2)}`)]),
    'matrix',
  );
  const saves = [2, 3, 4, 5, 6, 7];
  const aps = [0, 1, 2, 3, 4];
  const save = table(
    ['Pancerz \\ AP', ...aps.map((a) => `AP${ap(a)}`)],
    saves.map((s) => [sv(s), ...aps.map((a) => pct(saveChance(s, a)))]),
    'matrix',
  );
  return `<h4>Mnożnik obrażeń: Siła (S) broni vs Wytrzymałość (T) celu</h4>${wound}
  <h4>Szansa, że pancerz zatrzyma trafienie</h4>${save}`;
}

const perTeam = (arr: readonly number[], i: number): number =>
  arr[Math.min(i, arr.length - 1)] ?? 1;

/** Squad-size multipliers (1..MAX_PLAYERS) straight from director.teamScaling. */
export function teamScalingTable(c: ContentRegistry): string {
  const t = c.director.teamScaling;
  const d = c.director;
  const sizes = Array.from({ length: MAX_PLAYERS }, (_, i) => i);
  const row = (label: string, arr: readonly number[]) => [
    label,
    ...sizes.map((i) => `×${n(perTeam(arr, i), 2)}`),
  ];
  return table(
    ['Graczy', ...sizes.map((i) => `${i + 1}`)],
    [
      row('Liczba wrogów w fali (budżet)', t.budget),
      row('Tempo napływu', t.pace),
      row('Limit żywych naraz', t.maxAlive),
      row('Życie Tyranidów', t.hp),
      row(`Udział elit (zagrożenie ≥ ${t.eliteThreat})`, t.elite),
      row('Limit potomstwa (Rippery, miny)', t.children),
      ['Bossy na pojawienie', ...sizes.map((i) => `${perTeam(d.bosses.count, i)}`)],
      // average per wave; fractions carry over to the next wave (sim dropCaps)
      [
        'Apteczki z zabójstw / falę (średnio)',
        ...sizes.map((i) => n(dropRates(d, i + 1).medkits, 2)),
      ],
      ['Skrzynie z bronią / falę (średnio)', ...sizes.map((i) => n(dropRates(d, i + 1).crates, 2))],
    ],
    'matrix',
  );
}

/** Per-wave budget / HP growth for a solo marine and the wave table weights. */
export function waveTable(c: ContentRegistry, waves = 15): string {
  const d = c.director;
  const w = d.waves;
  const rows: string[][] = [];
  for (let i = 1; i <= waves; i++) {
    const budget = w.budget.base + w.budget.perWave * Math.pow(i - 1, w.budget.exponent);
    const pace = w.pace.base + w.pace.perWave * (i - 1);
    const maxAlive = Math.min(d.maxAlive.cap, d.maxAlive.base + d.maxAlive.perWave * (i - 1));
    const hp = 1 + w.hpScalePerWave * (i - 1);
    const boss = i >= d.bosses.firstWave && (i - d.bosses.firstWave) % d.bosses.everyWave === 0;
    const appearance = boss ? (i - d.bosses.firstWave) / d.bosses.everyWave : 0;
    rows.push([
      `${i}`,
      n(budget, 1),
      n(pace, 1),
      `${Math.round(maxAlive)}`,
      `×${n(hp, 2)}`,
      boss
        ? `${esc(c.enemy(d.bosses.enemy).name)} (1 os.: ${perTeam(d.bosses.count, 0) + appearance * d.bosses.extraPerAppearance})`
        : '—',
    ]);
  }
  const ids = [...c.enemies.keys()];
  const weights = table(
    ['Od fali', ...ids.map((id) => esc(c.enemy(id).name))],
    d.waveTable.map((e) => {
      const sum = Object.values(e.weights).reduce((a, b) => a + b, 0);
      return [
        `${e.fromWave}`,
        ...ids.map((id) => (e.weights[id] ? pct(e.weights[id]! / sum) : '—')),
      ];
    }),
    'matrix',
  );
  return `${table(['Fala', 'Budżet zagrożenia (solo)', 'Zagrożenie / s (solo)', 'Limit żywych (solo)', 'Życie wrogów', 'Boss'], rows, 'matrix')}
  <p class="muted">Budżet fali = (${w.budget.base} + ${w.budget.perWave}·(n−1)^${n(w.budget.exponent, 2)}) × mnożnik drużyny. Każdy wróg „kosztuje” tyle, ile wynosi jego zagrożenie. Życie rośnie o ${pct(w.hpScalePerWave)} na falę, razy mnożnik drużyny. Limit żywych: ${d.maxAlive.base} + ${d.maxAlive.perWave}/falę (maks. ${d.maxAlive.cap}). Pierwsza fala po ${w.firstDelay} s, przerwa między falami ${w.breather} s. Gdy zostanie ≤ ${w.reveal.remaining} wrogów (lub ${pct(w.reveal.fraction)} fali), albo minie ${w.reveal.afterSec} s, resztki są ujawniane i polują (×${n(w.reveal.speedMul, 2)} prędkości). Po ${w.forceNextAfter} s fala następna rusza i tak.</p>
  <h4>Skład fal (szansa na typ przy losowaniu, 1 gracz)</h4>${weights}
  <p class="muted">W większej drużynie wagi elit mnożone są przez „udział elit” z tabeli wyżej.</p>`;
}

export function marineTable(c: ContentRegistry): string {
  return table(
    ['Parametr', 'Wartość'],
    [
      ['Życie', `${PLAYER.maxHp}`],
      ['Prędkość', `${PLAYER.speed} px/s (× mnożnik broni)`],
      ['Powrót prędkości po puszczeniu spustu', `${PLAYER.fireMoveRecover} s`],
      ['Czas na podniesienie (wykrwawienie)', `${PLAYER.bleedOutTime} s`],
      ['Czas podnoszenia', `${PLAYER.reviveTime} s w promieniu ${PLAYER.reviveRadius} px`],
      ['Życie po podniesieniu', pct(PLAYER.reviveHpFraction)],
      [
        'Nietykalność po trafieniu / podniesieniu',
        `${PLAYER.hurtInvuln} s / ${PLAYER.reviveInvuln} s`,
      ],
      [
        'Pancerz (przód / boki / tył)',
        `×${n(MARINE_DIRECTIONAL_ARMOUR.front, 2)} / ×${n(MARINE_DIRECTIONAL_ARMOUR.side, 2)} / ×${n(MARINE_DIRECTIONAL_ARMOUR.rear, 2)} obrażeń`,
      ],
      [
        'Postawa obronna — przód',
        `×${n(MARINE_GUARD.frontMul, 2)} (+${Math.round(MARINE_GUARD.frontArmourBonus * 100)}% pancerza); rykoszet: nie-odbicie ×${n(MARINE_GUARD.nonDeflectFactor, 2)}; trafiony pocisk ×${n(MARINE_GUARD.landedDamageMul, 2)}`,
      ],
      ['Apteczka', `+${PICKUP.medkitHeal} życia, leży ${PICKUP.lifetime} s`],
      ['Arena', `${c.map.arena.width} × ${c.map.arena.height} px`],
      ['Symulacja', `${TICK_RATE} ticków/s`],
    ],
  );
}

/** Sprint values (data/sprint.ts). */
export function sprintTable(): string {
  const S = MARINE_SPRINT;
  return table(
    ['Parametr', 'Wartość'],
    [
      [
        'Prędkość sprintu',
        `×${n(S.speedMul, 2)} = ${n(PLAYER.speed * S.speedMul, 0)} px/s (bez kary za broń)`,
      ],
      ['Kondycja (maks.)', `${n(S.staminaMaxS, 2)} s sprintu`],
      ['Zużycie', `${n(S.drainPerS, 2)} / s`],
      [
        'Odnowa (tylko stojąc)',
        `${n(S.regenStandingPerS, 3)} / s — pełna po ${n(S.staminaMaxS / S.regenStandingPerS, 2)} s`,
      ],
      ['Minimum do startu', `${n(S.minToStartS, 2)} s`],
      ['Broń gotowa po sprincie', `${n(S.weaponReadyDelayS, 2)} s`],
      ['Strzał w sprincie', 'niemożliwy (spust ignorowany)'],
      ['Start sprintu przy wciśniętym spuście', 'wstrzymany do puszczenia spustu'],
      ['Kierunek pancerza w sprincie', 'kierunek biegu'],
    ],
  );
}

/** Aim recoil per weapon + movement multipliers (data/recoil.ts). */
export function recoilTable(c: ContentRegistry): string {
  const R = MARINE_AIM_RECOIL;
  const RAD = Math.PI / 180;
  const rows = c.weaponOrder.map((w) => {
    const r = weaponRecoil(w.id);
    return [
      `${w.slot}. ${esc(w.name)}`,
      `${n(r.kickDeg, 2)}°`,
      `${n(r.kickDeg * R.standingMul, 3)}°`,
      r.kickDistPx ? `${n(r.kickDistPx, 1)} px` : '—',
      `${n(r.maxDeg, 1)}°`,
      `${n(recoilRecoveryTime(r), 2)} s`,
    ];
  });
  const note = `Mnożnik: stojąc / w zaparciu ×${n(R.standingMul, 2)}, w pełnym marszu ×${n(R.walkingMul, 2)} (pomiędzy — proporcjonalnie do prędkości). Kierunek kopnięcia losowy, ${pct(0.5 + R.signBias)} w prawo. Limit odchylenia na broń; powrót wykładniczy (70% w podanym czasie). Odchylenie ${deg(1 * RAD)} na ${n(300, 0)} px to ~${n(300 * Math.tan(1 * RAD), 1)} px.`;
  return (
    table(
      [
        'Broń',
        'Kopnięcie (marsz)',
        'Kopnięcie (stojąc)',
        'Odepchnięcie celownika',
        'Maks. odchylenie',
        'Powrót 70%',
      ],
      rows,
    ) + `<p class="muted">${note}</p>`
  );
}

/** Directional armour arcs + front-plate ricochet chances (data/armour.ts). */
export function armourTables(c: ContentRegistry): string {
  const A = MARINE_DIRECTIONAL_ARMOUR;
  const D = MARINE_DEFLECTION;
  const arcs = table(
    [
      'Strona',
      'Kąt od kierunku celowania (w sprincie: biegu)',
      'Mnożnik obrażeń',
      'Rykoszet pocisków',
    ],
    [
      ['Przód', `0–${A.frontArcDeg}°`, `×${n(A.front, 2)}`, 'tak'],
      ['Boki', `${A.frontArcDeg}–${180 - A.rearArcDeg}°`, `×${n(A.side, 2)}`, 'nie'],
      ['Tył', `${180 - A.rearArcDeg}–180°`, `×${n(A.rear, 2)}`, 'nie'],
    ],
  );
  const chances = enemyProjectileDeflectChances(c.enemies.values());
  const rows = [...c.enemies.values()]
    .filter((e) => e.ranged)
    .map((e) => {
      const p = e.ranged!.projectile;
      const ch = chances[p.kind] ?? 0;
      const hit = p.damage * A.front;
      return [
        esc(e.name),
        esc(p.kind),
        p.explosion ? `wybuch ${n(p.explosion.damage)}` : `${n(p.damage)}`,
        p.explosion ? '—' : `${n(hit, 1)}`,
        ch > 0 ? pct(ch, 1) : '0% (wybuchowy)',
        p.explosion ? '—' : n(hit * (1 - ch), 2),
      ];
    });
  const defl = table(
    [
      'Strzelec',
      'Pocisk',
      'Obrażenia',
      'Trafienie w przód',
      'Szansa na rykoszet (przód)',
      'Średnio na strzał w przód',
    ],
    rows,
  );
  const G = MARINE_GUARD;
  const guard = table(
    ['Efekt postawy obronnej (stój + trzymanie)', 'Wartość'],
    [
      [
        'Pancerz przedni',
        `×${n(G.frontMul, 2)} (zamiast ×${n(A.front, 2)}; +${Math.round(G.frontArmourBonus * 100)}%)`,
      ],
      [
        'Szansa rykoszetu',
        `1 − ${n(G.nonDeflectFactor, 2)}·(1 − baza) — np. baza 50% → ${pct(1 - G.nonDeflectFactor * 0.5, 1)}`,
      ],
      [
        'Pocisk z przodu, który przeszedł',
        `×${n(G.landedDamageMul, 2)} obrażeń (−${Math.round((1 - G.landedDamageMul) * 100)}%)`,
      ],
      ['Sterowanie', 'RMB (PC) / 🛡 GUARD (telefon); koniec przy ruchu'],
    ],
  );
  return `${arcs}
  <p class="muted">Kąt liczony między kierunkiem celowania marine a kierunkiem do źródła: atakujący (wręcz, szarża), kierunek, z którego nadleciał pocisk, albo środek wybuchu. Obrażenia bez kierunku (przegrzanie plazmy) — ×${n(A.side, 2)}. Wybuchy i ciosy wręcz też dostają mnożnik strony, ale nie mają rykoszetu. Mnożnik działa razem z synapsą (obrażenia × synapsa × strona). Stałe: <code>data/armour.ts</code>, postawa: <code>data/guard.ts</code>.</p>
  <h4>Rykoszet z przedniego pancerza</h4>${defl}
  <p class="muted">Szansa jest stała dla każdego rodzaju pocisku (tabela w danych gry); nowy pocisk bez wpisu dostaje ${pct(D.defaultChance, 1)}, pociski wybuchowe 0%. Synapsa jej nie zmienia. Odbity pocisk nie rani nikogo, odlatuje lustrzanie od pancerza (±${n((D.jitter * 180) / Math.PI, 0)}°, ${pct(D.speedMul)} prędkości) i znika po ${n(D.fadeTime, 2)} s.</p>
  <h4>Postawa obronna</h4>${guard}`;
}

/** Full compendium body (inside the <details>). */
export function compendiumHtml(c: ContentRegistry): string {
  return `
  <p class="muted">Wszystkie liczby są generowane z kodu gry v${GAME_VERSION}. Odległości w pikselach areny, czasy w sekundach. DPS = średnie obrażenia na sekundę przy trafieniu każdym pociskiem, z uwzględnieniem S vs T i pancerza (bez zasięgu, ciepła i zaparcia). Po kropce: czas zabicia jednego wroga z bazowym życiem (fala 1, solo).</p>
  <h3>Space Marine</h3>${marineTable(c)}
  <h3>Sprint</h3>${sprintTable()}
  <h3>Pancerz kierunkowy i rykoszety</h3>${armourTables(c)}
  <h3>Bronie</h3>${weaponTable(c)}
  <h3>Odrzut (odchylenie celownika)</h3>${recoilTable(c)}
  <h4>Cechy specjalne</h4>${weaponSpecials(c)}
  <h3>Tyranidzi</h3>${enemyTable(c)}
  <h3>DPS broni vs każdy Tyranid (ciągły ogień, bez przeładowań)</h3>${dpsMatrix(c, 'burst')}
  <h3>DPS z przeładowaniami (średnia na cały magazynek)</h3>${dpsMatrix(c, 'sustained')}
  ${superchargeRows(c) ? `<h3>Plazma — strzały przeładowane (DPS)</h3>${superchargeRows(c)}` : ''}
  <h3>Profile 40k: Siła, Wytrzymałość, pancerz</h3>
  <p class="muted">Obrażenia trafienia = obrażenia × mnożnik S vs T, albo 0, jeśli pancerz zatrzyma pocisk (rzut przy każdym trafieniu). Broń bez profilu (wybuchy wrogów) ignoruje T i pancerz. Przykład: średnio na trafienie ${esc(c.weaponOrder[0]!.name)} w ${esc([...c.enemies.values()].at(-1)!.name)}: ${n(expectedShotDamage(c.weaponOrder[0]!, [...c.enemies.values()].at(-1)!), 2)}.</p>
  ${profileTables()}
  <h3>Fale</h3>${waveTable(c)}
  <h3>Trudność a liczba graczy</h3>${teamScalingTable(c)}`;
}
