import { describe, expect, it } from 'vitest';
import {
  defaultContent,
  dropRates,
  enemyProjectileDeflectChances,
  expectedDps,
  MARINE_DIRECTIONAL_ARMOUR,
  MARINE_SPRINT,
  PLAYER,
} from '@sms/shared';
import { rulesHtml } from '../src/rules/rulesPage.js';
import { armourTables, dpsMatrix, sprintTable } from '../src/rules/compendium.js';

describe('rules page', () => {
  const html = rulesHtml(defaultContent);
  it('lists every weapon and enemy from the shared tables', () => {
    for (const w of defaultContent.weaponOrder) expect(html).toContain(w.name);
    for (const e of defaultContent.enemies.values()) expect(html).toContain(e.name);
    expect(html).toContain('<details>');
  });
  it('wave table and intro name the support boss and the crash waves', () => {
    const f = html.slice(html.indexOf('<h3>Fale</h3>'));
    const rows = f.slice(0, f.indexOf('</table>')).split('<tr>');
    const row = (w: number) => rows.find((r) => r.startsWith(`<th scope="row">${w}</th>`)) ?? '';
    expect(row(5)).toContain('Psychophage');
    expect(row(6)).not.toContain('Psychophage');
    expect(row(4)).toContain('katastrofa');
    expect(html).toContain('Katastrofa okrętu Imperium');
    expect(html).toContain('Gwardziści');
    expect(html.slice(0, html.indexOf('<details'))).toMatch(/boss wsparcia — <b>Psychophage/);
  });
  it('describes the v24 low cover: free near the shooter, 50% stop on far cover, no old miss rule', () => {
    expect(html).toContain('do 70 px od strzelca');
    expect(html).toContain('<b>50%</b> szansy, że zatrzyma się NA niej');
    expect(html).not.toMatch(/przyklejony|trudniejszy do trafienia|30%<\/b> szansy, że go minie/);
  });

  it('describes the restored melta: pierce 3, original burst, fire rate −40%', () => {
    const m = defaultContent.weapon('meltagun');
    expect(m.projectile.pierce).toBe(3);
    expect(m.fireInterval).toBeCloseTo(0.87 / 0.6, 9);
    expect(m.projectile.endBurst).toMatchObject({ damage: 25, edgeFactor: 0.35 });
    expect(html).toContain('po przebiciu celów');
    expect(html).toContain('do trzech kolejnych celów');
    expect(html).not.toMatch(/bez przebicia|tylko pierwszego wroga/);
  });
  it('DPS matrix uses the shared expectedDps', () => {
    const w = defaultContent.weaponOrder[0]!;
    const e = defaultContent.enemy('hormagaunt');
    expect(dpsMatrix(defaultContent)).toContain(String(Math.round(expectedDps(w, e))));
  });
  it('has no unfilled placeholders', () => {
    expect(html).not.toMatch(/undefined|NaN|\$\{/);
  });
  it('directional armour + ricochet values come from the shared constants', () => {
    const A = MARINE_DIRECTIONAL_ARMOUR;
    const t = armourTables(defaultContent);
    for (const v of [A.front, A.side, A.rear])
      expect(t).toContain(`×${String(v).replace('.', ',')}`);
    const ch = enemyProjectileDeflectChances(defaultContent.enemies.values());
    const pc = (v: number) => `${String(Number((v * 100).toFixed(1))).replace('.', ',')}%`;
    for (const v of Object.values(ch).filter((x) => x > 0)) {
      expect(t).toContain(pc(v));
      expect(html).toContain(pc(v));
    }
    expect(ch.fleshborer).toBe(0.6);
    expect(t).toContain('60%');
    expect(t).toContain('14,7%');
    expect(html).toContain('<b>Termagant</b> 60%');
    expect(html).toMatch(/Warrior<\/b> 14,7%/);
    expect(html).toContain('id="pancerz"');
    expect(html).toContain('Pancerz kierunkowy i rykoszety');
  });
  it('sprint section + compendium values come from MARINE_SPRINT', () => {
    const S = MARINE_SPRINT;
    const c = (v: number) => String(Number(v.toFixed(2))).replace('.', ',');
    expect(html).toContain('id="sprint"');
    expect(html).toContain('Shift');
    expect(html).toContain('NO STAMINA');
    expect(html).toContain('okrąg i gałka robią się złote');
    expect(html).not.toContain('prawy dolny róg'); // no » SPRINT button on touch any more
    expect(html).toContain('jedyny sposób na sprint na telefonie');
    expect(html).toContain('id="glos"');
    expect(html).toContain('CZAT GŁOSOWY');
    expect(html).toContain('iPhone');
    const t = sprintTable();
    for (const v of [S.speedMul, S.staminaMaxS, S.minToStartS, S.weaponReadyDelayS, 7])
      expect(t).toContain(c(v));
    expect(t).toContain(`${Math.round(PLAYER.speed * S.speedMul)} px/s`);
    expect(html).toContain(`${c(S.weaponReadyDelayS)} s`);
  });
  it('v0.6.0 hotfix: wave unlocks, more supplies and sprint-vs-trigger come from code', () => {
    for (const w of defaultContent.weaponOrder)
      if (w.unlockAtWave) expect(html).toContain(`na starcie fali ${w.unlockAtWave}`);
    expect(html).not.toMatch(/odblokowuje się po \d+ s|po \d+:\d\d gry/);
    const r = dropRates(defaultContent.director, 1);
    const c = (v: number) => String(Number(v.toFixed(2))).replace('.', ',');
    expect(html).toContain(c(r.crates));
    expect(html).toContain(c(r.medkits));
    expect(html).toContain('Sprint nie ruszy, póki trzymasz spust');
    expect(sprintTable()).toContain('wstrzymany do puszczenia spustu');
  });
});
