import { describe, expect, it } from 'vitest';
import { dataset } from './helpers';
import { compareWithReference, validateDatasetShape, validateSchedule, diffOfficialResults } from '../src/engine/validation';

describe('resmi veri seti', () => {
  it('yapısal olarak geçerli', () => {
    expect(validateDatasetShape(dataset).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('fikstür resmi lig aşaması formatına uyuyor (8 maç, 4 iç/4 dış, her torbadan 2 rakip)', () => {
    const issues = validateSchedule(dataset);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(dataset.teams).toHaveLength(36);
    expect(dataset.fixtures).toHaveLength(144);
  });
  it('3 haftalık resmi sonuçlar (54 maç) ve sonrası planlanmış', () => {
    const off = dataset.fixtures.filter((f) => f.status === 'official');
    expect(off).toHaveLength(54);
    expect(off.every((f) => f.matchday <= 3)).toBe(true);
    expect(dataset.fixtures.filter((f) => f.matchday >= 4).every((f) => f.status === 'scheduled' && !f.score)).toBe(true);
  });
  it('hesaplanan tablo yayınlanmış referans tabloyla çelişmiyor', () => {
    const { checked, mismatches, rows } = compareWithReference(dataset);
    expect(checked).toBeGreaterThan(25);
    expect(mismatches).toEqual([]);
    const psg = rows.find((r) => r.team === 'PSG')!;
    expect(psg).toMatchObject({ position: 1, points: 9, goalDifference: 9, played: 3 });
    const fb = rows.find((r) => r.team === 'FB')!;
    expect(fb).toMatchObject({ points: 2, wins: 0, draws: 2, losses: 1, goalsFor: 3, goalsAgainst: 9 });
    const gs = rows.find((r) => r.team === 'GS')!;
    expect(gs).toMatchObject({ points: 3, wins: 1, losses: 2, goalsFor: 6, goalsAgainst: 9 });
  });
  it('içe aktarmada resmi sonuç çakışmasını tespit eder', () => {
    const copy = structuredClone(dataset);
    copy.fixtures[0].score = { home: 9, away: 9 };
    const d = diffOfficialResults(dataset, copy);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]).toMatchObject({ id: dataset.fixtures[0].id, before: '1-0', after: '9-9' });
  });
  it('bozuk veri setini reddeder', () => {
    expect(validateDatasetShape({}).some((i) => i.level === 'error')).toBe(true);
    const bad = structuredClone(dataset);
    bad.fixtures[100] = { ...bad.fixtures[100], status: 'official' };
    expect(validateDatasetShape(bad).some((i) => i.level === 'error')).toBe(true);
    const missing = structuredClone(dataset);
    missing.fixtures.pop();
    expect(validateSchedule(missing).some((i) => i.level === 'error' && i.message.includes('eksik'))).toBe(true);
  });
});
