import { describe, expect, it } from 'vitest';
import { dataset } from './helpers';
import {
  initialApp, activeScenario, updateScenario, commitChange, undoLast, saveVersion, restoreVersion,
  duplicateScenario, renameScenario, deleteScenario, exportApp, importApp, loadApp, persistApp, STORAGE_KEY, switchScenario, addScenario, newScenario,
} from '../src/state/store';
import { setManualResult, resetSimulated, resetManual, ActionError, datasetFromCsv, toCsv, parseCsv } from '../src/state/actions';
import { simulateFixtures, computeSeason, effectiveResult } from '../src/engine/season';
import { validateSchedule } from '../src/engine/validation';

const fbLiv = dataset.fixtures.find((f) => f.home === 'FB' && f.away === 'LIV')!;
const official = dataset.fixtures.find((f) => f.status === 'official')!;

class MemStorage { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } }

describe('mod bağımsızlığı ve senaryolar', () => {
  it('Mod A’da girilen FB skoru Mod B’yi değiştirmez', () => {
    let app = initialApp(dataset);
    const a = activeScenario(app, 'A');
    app = updateScenario(app, 'A', a.id, (s) => commitChange(s, 'FB', setManualResult(dataset, s.state, fbLiv.id, 3, 1)));
    expect(activeScenario(app, 'A').state.results[fbLiv.id]).toMatchObject({ home: 3, away: 1 });
    expect(activeScenario(app, 'B').state.results[fbLiv.id]).toBeUndefined();
    // Her modun tohumu, ayarları ve ilerlemesi ayrı
    const bId = activeScenario(app, 'B').id;
    app = updateScenario(app, 'B', bId, (s) => ({ ...s, state: { ...s.state, seed: 42, currentMatchday: 7, settings: { ...s.state.settings, homeAdvantage: 0.3 } } }));
    expect(activeScenario(app, 'A').state.seed).not.toBe(42);
    expect(activeScenario(app, 'A').state.currentMatchday).toBe(4);
    expect(activeScenario(app, 'A').state.settings.homeAdvantage).not.toBe(0.3);
  });
  it('senaryo çoğaltma, yeniden adlandırma, silme, geçiş', () => {
    let app = initialApp(dataset);
    const id = activeScenario(app, 'A').id;
    app = updateScenario(app, 'A', id, (s) => ({ ...s, state: setManualResult(dataset, s.state, fbLiv.id, 1, 0) }));
    app = duplicateScenario(app, 'A', id);
    const copy = activeScenario(app, 'A');
    expect(copy.id).not.toBe(id);
    expect(copy.name).toContain('kopya');
    expect(copy.state.results[fbLiv.id]).toMatchObject({ home: 1, away: 0 });
    app = updateScenario(app, 'A', copy.id, (s) => ({ ...s, state: setManualResult(dataset, s.state, fbLiv.id, 0, 4) }));
    app = switchScenario(app, 'A', id);
    expect(activeScenario(app, 'A').state.results[fbLiv.id]).toMatchObject({ home: 1, away: 0 });
    app = renameScenario(app, 'A', id, 'İyimser');
    expect(activeScenario(app, 'A').name).toBe('İyimser');
    app = deleteScenario(app, 'A', id, dataset);
    expect(app.modes.A.scenarios).toHaveLength(1);
    expect(app.modes.B.scenarios).toHaveLength(1);
  });
  it('geri alma ve sürüm geri yükleme', () => {
    let s = activeScenario(initialApp(dataset), 'A');
    s = commitChange(s, '1', setManualResult(dataset, s.state, fbLiv.id, 1, 1));
    s = saveVersion(s, 'v1');
    s = commitChange(s, '2', setManualResult(dataset, s.state, fbLiv.id, 5, 0));
    expect(undoLast(s).state.results[fbLiv.id]).toMatchObject({ home: 1, away: 1 });
    const r = restoreVersion(s, s.versions[0].id);
    expect(r.state.results[fbLiv.id]).toMatchObject({ home: 1, away: 1 });
    expect(r.versions[0].label).toMatch(/yedek/);
  });
});

describe('veri bütünlüğü', () => {
  it('resmi sonuç elle değiştirilemez', () => {
    const s = activeScenario(initialApp(dataset)).state;
    expect(() => setManualResult(dataset, s, official.id, 0, 0)).toThrow(ActionError);
  });
  it('simüle sonuçları sıfırlamak resmi ve elle girilenleri korur', () => {
    let st = activeScenario(initialApp(dataset)).state;
    st = setManualResult(dataset, st, fbLiv.id, 2, 2);
    st = simulateFixtures(dataset, st, dataset.fixtures.map((f) => f.id), { mode: 'A' }).state;
    expect(computeSeason(dataset, st).simulatedCount).toBeGreaterThan(70);
    const r = resetSimulated(st);
    const v = computeSeason(dataset, r);
    expect(v.simulatedCount).toBe(0);
    expect(v.officialCount).toBe(54);
    expect(r.results[fbLiv.id]).toMatchObject({ home: 2, away: 2, source: 'manual' });
    expect(effectiveResult(official, r)).toMatchObject({ source: 'official' });
    const m = resetManual(st);
    expect(m.results[fbLiv.id]).toBeUndefined();
    expect(computeSeason(dataset, m).officialCount).toBe(54);
  });
});

describe('içe/dışa aktarma', () => {
  it('JSON dışa/içe aktarma durumu korur', () => {
    let app = initialApp(dataset);
    const id = activeScenario(app, 'A').id;
    app = updateScenario(app, 'A', id, (s) => ({ ...s, state: simulateFixtures(dataset, setManualResult(dataset, s.state, fbLiv.id, 2, 1), dataset.fixtures.map((f) => f.id), { mode: 'A' }).state }));
    app = addScenario(app, 'B', newScenario(dataset, 'B2'));
    const json = JSON.parse(JSON.stringify(exportApp(app, dataset)));
    const { app: back, warnings } = importApp(json, dataset);
    expect(warnings).toEqual([]);
    expect(activeScenario(back, 'A').state).toEqual(activeScenario(app, 'A').state);
    expect(back.modes.B.scenarios.map((s) => s.name)).toEqual(['Ana senaryo', 'B2']);
  });
  it('eski kayıt biçimini (ucl-app/1) dönüştürür ve bilinmeyen maçları atlar', () => {
    const old = { schema: 'ucl-app/1', modes: { A: { state: { seed: 7, results: { [fbLiv.id]: { home: 1, away: 0, source: 'manual' }, 'LP-MD9-01': { home: 1, away: 0, source: 'manual' } } } }, B: { state: {} } } };
    const { app, warnings } = importApp(old, dataset);
    expect(activeScenario(app, 'A').state.seed).toBe(7);
    expect(activeScenario(app, 'A').state.results[fbLiv.id]).toBeDefined();
    expect(activeScenario(app, 'A').state.settings.baseGoals).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('Eski'))).toBe(true);
    expect(warnings.some((w) => w.includes('bulunmayan'))).toBe(true);
  });
  it('geçersiz dosyayı reddeder', () => {
    expect(() => importApp({ foo: 1 }, dataset)).toThrow();
    expect(() => importApp('x', dataset)).toThrow();
  });
  it('tarayıcı deposuna kaydet/yükle (sayfa yenileme)', () => {
    const st = new MemStorage();
    let app = initialApp(dataset);
    app = updateScenario(app, 'B', activeScenario(app, 'B').id, (s) => ({ ...s, state: setManualResult(dataset, s.state, fbLiv.id, 0, 0) }));
    expect(persistApp(st, app)).toBeNull();
    expect(st.getItem(STORAGE_KEY)).toBeTruthy();
    const { app: loaded } = loadApp(st, dataset);
    expect(activeScenario(loaded, 'B').state.results[fbLiv.id]).toMatchObject({ home: 0, away: 0 });
    expect(activeScenario(loaded, 'A').state.results[fbLiv.id]).toBeUndefined();
  });
  it('CSV ile resmi sonuç güncellemesi ve CSV ayrıştırma', () => {
    const csv = toCsv([['id', 'matchday', 'date', 'kickoff', 'home', 'away', 'status', 'home_score', 'away_score'], [fbLiv.id, 4, '2026-11-04', '18:45', 'FB', 'LIV', 'official', 1, 2]]);
    const { dataset: d2, errors } = datasetFromCsv(dataset, csv);
    expect(errors).toEqual([]);
    expect(d2.fixtures.find((f) => f.id === fbLiv.id)).toMatchObject({ status: 'official', score: { home: 1, away: 2 } });
    expect(validateSchedule(d2).filter((i) => i.level === 'error')).toEqual([]);
    expect(parseCsv('a;b\n"x;y";2')).toEqual([['a', 'b'], ['x;y', '2']]);
    const bad = datasetFromCsv(dataset, 'id,matchday,home,away,status,home_score,away_score\nX,4,FB,LIV,scheduled,1,0');
    expect(bad.errors.length).toBe(1);
  });
});

describe('yeni tohumla yeniden oynatma', () => {
  it('simüle sonuçları yeniden üretir, elle/resmi korur, turnuvayı yeniden oynatır', async () => {
    const { replayWithNewSeed } = await import('../src/state/actions');
    const { simulateKnockout } = await import('../src/engine/season');
    let st = activeScenario(initialApp(dataset)).state;
    st = setManualResult(dataset, st, fbLiv.id, 4, 0);
    st = simulateFixtures(dataset, st, dataset.fixtures.map((f) => f.id), { mode: 'B' }).state;
    st = simulateKnockout(dataset, st, { mode: 'B' }).state;
    const r = replayWithNewSeed(dataset, st, st.seed + 1, 'B');
    expect(r.state.results[fbLiv.id]).toMatchObject({ home: 4, away: 0, source: 'manual' });
    const ids = Object.keys(st.results).filter((id) => st.results[id].source === 'simulated');
    const changed = ids.filter((id) => st.results[id].home !== r.state.results[id].home || st.results[id].away !== r.state.results[id].away);
    expect(changed.length).toBeGreaterThan(ids.length / 3);
    expect(computeSeason(dataset, r.state).bracket!.champion).toBeDefined();
    expect(computeSeason(dataset, r.state).officialCount).toBe(54);
  });
});
