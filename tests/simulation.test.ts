import { describe, expect, it } from 'vitest';
import { dataset, freshState } from './helpers';
import { computeSeason, simulateFixtures, effectiveResult, simulateKnockout, validateKnockoutEntry } from '../src/engine/season';
import { predict, samplePenalties, sampleFromCdf } from '../src/engine/model';
import { mulberry32 } from '../src/engine/rng';
import { runMonteCarlo } from '../src/engine/montecarlo';
import { buildBracket, resolveTie, type Tie } from '../src/engine/knockout';

const ids = (md: number) => dataset.fixtures.filter((f) => f.matchday === md).map((f) => f.id);
const allRemaining = dataset.fixtures.filter((f) => f.status !== 'official').map((f) => f.id);
const fbLiv = dataset.fixtures.find((f) => f.home === 'FB' && f.away === 'LIV')!;
const gsStu = dataset.fixtures.find((f) => f.home === 'GS' && f.away === 'STU')!;

describe('skor modeli', () => {
  const view = computeSeason(dataset, freshState());
  it('olasılıklar toplamı 1 ve makul gol ortalaması', () => {
    const p = predict('RMA', 'SAB', view.ratings, freshState().settings);
    expect(p.pHome + p.pDraw + p.pAway).toBeCloseTo(1, 6);
    expect(p.pHome).toBeGreaterThan(0.6);
    expect(p.lambdaHome + p.lambdaAway).toBeLessThan(4.5);
  });
  it('ev sahibi avantajı her iki takımın beklentisini etkiler', () => {
    const s = freshState().settings;
    const a = predict('INT', 'NAP', view.ratings, s);
    const n = predict('INT', 'NAP', view.ratings, s, true);
    expect(a.lambdaHome).toBeGreaterThan(n.lambdaHome);
    expect(a.lambdaAway).toBeLessThan(n.lambdaAway);
  });
  it('dengeli maçta en sık skorlar düşük skorlu ve aşırı gol yok', () => {
    const p = predict('GS', 'STU', view.ratings, freshState().settings);
    const rng = mulberry32(7);
    const counts: Record<string, number> = {};
    let goals = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const s = sampleFromCdf(p.cdf, rng);
      counts[`${s.home}-${s.away}`] = (counts[`${s.home}-${s.away}`] ?? 0) + 1;
      goals += s.home + s.away;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
    for (const k of top) expect(k.split('-').map(Number).reduce((a, b) => a + b)).toBeLessThanOrEqual(3);
    expect(top.slice(0, 3)).toContain('1-1');
    expect(goals / N).toBeGreaterThan(2.3);
    expect(goals / N).toBeLessThan(3.6);
    const sevenPlus = Object.entries(counts).filter(([k]) => k.split('-').map(Number).reduce((a, b) => a + b) >= 7).reduce((a, [, v]) => a + v, 0);
    expect(sevenPlus / N).toBeLessThan(0.03);
  });
  it('penaltılar her zaman bir galip üretir', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 2000; i++) {
      const p = samplePenalties(1800, 1800, rng);
      expect(p.home).not.toBe(p.away);
    }
  });
});

describe('Mod A — Türk takımları elle, diğerleri otomatik', () => {
  it('Fenerbahçe skoru girilince puan durumu güncellenir', () => {
    const st = freshState();
    st.results[fbLiv.id] = { home: 2, away: 1, source: 'manual', updatedAt: 1 };
    const before = computeSeason(dataset, freshState()).standings.find((r) => r.team === 'FB')!;
    const after = computeSeason(dataset, st).standings.find((r) => r.team === 'FB')!;
    expect(after.points).toBe(before.points + 3);
    expect(after.goalsFor).toBe(before.goalsFor + 2);
    const liv = computeSeason(dataset, st).standings.find((r) => r.team === 'LIV')!;
    expect(liv.losses).toBe(1);
  });
  it('Galatasaray skoru girilince puan durumu güncellenir', () => {
    const st = freshState();
    st.results[gsStu.id] = { home: 1, away: 1, source: 'manual', updatedAt: 1 };
    const gs = computeSeason(dataset, st).standings.find((r) => r.team === 'GS')!;
    expect(gs).toMatchObject({ points: 4, draws: 1, played: 4 });
  });
  it('diğer maçları simüle etmek elle girilen FB/GS skorlarını ve resmi sonuçları değiştirmez', () => {
    const st = freshState();
    st.results[fbLiv.id] = { home: 0, away: 3, source: 'manual', updatedAt: 1 };
    const { state: s2, simulated } = simulateFixtures(dataset, st, [...ids(4), ...ids(1)], { mode: 'A' });
    expect(s2.results[fbLiv.id]).toMatchObject({ home: 0, away: 3, source: 'manual' });
    expect(simulated).not.toContain(gsStu.id); // Mod A'da GS maçı kullanıcıya ait, simüle edilmez
    expect(s2.results[gsStu.id]).toBeUndefined();
    expect(simulated).toHaveLength(16);
    for (const f of dataset.fixtures.filter((x) => x.matchday === 1)) {
      expect(effectiveResult(f, s2)).toMatchObject({ ...f.score, source: 'official' });
      expect(s2.results[f.id]).toBeUndefined();
    }
  });
  it('aynı maç ikinci kez simüle edilmez; yalnızca açık yeniden oynatma ile değişir', () => {
    const st = freshState();
    const a = simulateFixtures(dataset, st, ids(5), { mode: 'A' }).state;
    const b = simulateFixtures(dataset, a, ids(5), { mode: 'A' });
    expect(b.simulated).toHaveLength(0);
    const c = simulateFixtures(dataset, a, ids(5), { mode: 'A', rerun: true }).state;
    const changed = ids(5).filter((id) => a.results[id] && (a.results[id].home !== c.results[id].home || a.results[id].away !== c.results[id].away));
    expect(changed.length).toBeGreaterThan(0);
    expect(c.results[ids(5)[0]].nonce).toBe(1);
  });
  it('aynı tohum aynı sonuçları üretir, farklı tohum farklı', () => {
    const a = simulateFixtures(dataset, freshState(1), allRemaining, { mode: 'B' }).state;
    const b = simulateFixtures(dataset, freshState(1), allRemaining, { mode: 'B' }).state;
    const c = simulateFixtures(dataset, freshState(2), allRemaining, { mode: 'B' }).state;
    const key = (s: typeof a) => allRemaining.map((id) => `${s.results[id].home}-${s.results[id].away}`).join(',');
    expect(key(a)).toBe(key(b));
    expect(key(a)).not.toBe(key(c));
  });
});

describe('Mod B ve sezon akışı', () => {
  it('tüm lig simüle edilince tablo tamamlanır ve eleme ağacı kurulur', () => {
    const s = simulateFixtures(dataset, freshState(), allRemaining, { mode: 'B' }).state;
    const v = computeSeason(dataset, s);
    expect(v.complete).toBe(true);
    expect(v.standings.every((r) => r.played === 8)).toBe(true);
    expect(v.bracket).toBeDefined();
    const pos = (t?: string) => v.standings.findIndex((r) => r.team === t) + 1;
    const po = v.bracket!.ties.filter((t) => t.stage === 'PO');
    expect(po).toHaveLength(8);
    for (const t of po) {
      const seed = pos(t.teamB), un = pos(t.teamA);
      expect(seed).toBeGreaterThanOrEqual(9); expect(seed).toBeLessThanOrEqual(16);
      expect(seed + un).toBeGreaterThanOrEqual(32); expect(seed + un).toBeLessThanOrEqual(34);
      // seri başı rövanşı evinde oynar
      expect(t.legs[1].home).toBe(t.teamB);
    }
    const r16 = v.bracket!.ties.filter((t) => t.stage === 'R16');
    expect(r16.map((t) => pos(t.teamB)).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // 1 ve 2 farklı yarılarda
    const half = (p: number) => r16.find((t) => pos(t.teamB) === p)!.half;
    expect(half(1)).not.toBe(half(2));
    expect(half(3)).not.toBe(half(4));
  });
  it('eleme turları finale kadar oynanır ve şampiyon belirlenir; tüm eşleşmelerin galibi var', () => {
    let s = simulateFixtures(dataset, freshState(99), allRemaining, { mode: 'B' }).state;
    s = simulateKnockout(dataset, s, { mode: 'B' }).state;
    const v = computeSeason(dataset, s);
    expect(v.bracket!.champion).toBeDefined();
    expect(v.bracket!.ties.every((t) => t.winner)).toBe(true);
    expect(v.bracket!.ties).toHaveLength(8 + 8 + 4 + 2 + 1);
    // çeyrek ve yarı finalde rövanş, ligde üstte bitiren takımın evinde
    const pos = (t?: string) => v.standings.findIndex((r) => r.team === t);
    for (const t of v.bracket!.ties.filter((x) => x.stage === 'QF' || x.stage === 'SF')) expect(pos(t.teamB)).toBeLessThan(pos(t.teamA));
  });
  it('Mod A: FB/GS eleme maçı sonuçsuzsa o eşleşme otomatik oynanmaz', () => {
    let s = simulateFixtures(dataset, freshState(5), allRemaining, { mode: 'B' }).state;
    const v = computeSeason(dataset, s);
    const r = simulateKnockout(dataset, s, { mode: 'A' });
    const turkishTies = v.bracket!.ties.filter((t) => t.stage === 'PO' && (['FB', 'GS'].includes(t.teamA!) || ['FB', 'GS'].includes(t.teamB!)));
    if (turkishTies.length) expect(r.blockedByUser.length).toBeGreaterThan(0);
    s = r.state;
    for (const t of turkishTies) for (const l of t.legs) expect(s.knockout[l.key]).toBeUndefined();
  });
  it('lig skoru değişince bağlı her şey yeniden hesaplanır', () => {
    const s = simulateFixtures(dataset, freshState(3), allRemaining, { mode: 'B' }).state;
    const v1 = computeSeason(dataset, s);
    const gsLast = dataset.fixtures.find((f) => f.home === 'PSG' && f.away === 'GS')!;
    const s2 = { ...s, results: { ...s.results, [gsLast.id]: { home: 0, away: 9, source: 'manual' as const, updatedAt: 2 } } };
    const v2 = computeSeason(dataset, s2);
    const gs1 = v1.standings.find((r) => r.team === 'GS')!;
    const gs2 = v2.standings.find((r) => r.team === 'GS')!;
    expect(gs2.goalDifference).toBeGreaterThan(gs1.goalDifference);
    expect(v2.ratings.GS.elo).not.toBe(v1.ratings.GS.elo === v2.ratings.GS.elo ? NaN : v1.ratings.GS.elo);
  });
});

describe('eleme eşleşmesi çözümü', () => {
  const mk = (r1: [number, number], r2: [number, number], extra: Partial<{ etHome: number; etAway: number; penHome: number; penAway: number }> = {}): Tie => {
    const t: Tie = {
      id: 'x', stage: 'R16', half: 1, label: '', teamA: 'A', teamB: 'B', placeholderA: '', placeholderB: '',
      legs: [
        { key: '1', home: 'A', away: 'B', result: { home: r1[0], away: r1[1], source: 'manual', updatedAt: 0 } },
        { key: '2', home: 'B', away: 'A', result: { home: r2[0], away: r2[1], source: 'manual', updatedAt: 0, ...extra } },
      ],
    };
    resolveTie(t);
    return t;
  };
  it('toplam skor', () => {
    const t = mk([2, 1], [1, 0]); // A 2-1, B 1-0 => 2-2 ... uzatma gerekli
    expect(t.winner).toBeUndefined();
    expect(t.problem).toMatch(/uzatma/);
    const t2 = mk([2, 1], [0, 0]);
    expect(t2.winner).toBe('A');
    expect(t2.aggregate).toEqual({ home: 2, away: 1 });
  });
  it('deplasman golü kuralı yok → uzatma', () => {
    const t = mk([1, 2], [0, 1], { etHome: 1, etAway: 0 }); // A 1-2 B; B 0-1 A => 2-2 ; uzatmada B
    expect(t.winner).toBe('B');
    expect(t.decidedBy).toBe('extraTime');
  });
  it('penaltılar', () => {
    const t = mk([1, 1], [0, 0], { etHome: 0, etAway: 0, penHome: 3, penAway: 4 });
    expect(t.winner).toBe('A');
    expect(t.decidedBy).toBe('penalties');
  });
  it('elle eleme sonucu doğrulaması', () => {
    const t = mk([1, 1], [0, 0]);
    t.legs[1].result = undefined;
    expect(validateKnockoutEntry(t, 1, { home: 0, away: 0 })).toMatch(/uzatma/);
    expect(validateKnockoutEntry(t, 1, { home: 0, away: 0, etHome: 0, etAway: 0 })).toMatch(/penaltı/);
    expect(validateKnockoutEntry(t, 1, { home: 0, away: 0, etHome: 0, etAway: 0, penHome: 5, penAway: 5 })).toMatch(/eşit olamaz/);
    expect(validateKnockoutEntry(t, 1, { home: 0, away: 0, etHome: 0, etAway: 0, penHome: 5, penAway: 4 })).toBeNull();
    expect(validateKnockoutEntry(t, 1, { home: 2, away: 0, etHome: 1, etAway: 0 })).toMatch(/uzatma/);
    expect(validateKnockoutEntry(t, 0, { home: 1, away: 1, penHome: 1, penAway: 0 })).toMatch(/son maçta/);
  });
  it('eleme ağacı resmi pozisyon eşleşmelerini izler', () => {
    const order = Array.from({ length: 36 }, (_, i) => `T${i + 1}`);
    const b = buildBracket(order, { poSwap: [false, true, false, true], poHalf: [false, false, true, true], topHalf: [false, true, false, true], official: false }, () => undefined);
    const po = b.ties.filter((t) => t.stage === 'PO').map((t) => [t.teamB, t.teamA]);
    expect(po).toEqual([['T9', 'T23'], ['T10', 'T24'], ['T11', 'T22'], ['T12', 'T21'], ['T13', 'T19'], ['T14', 'T20'], ['T15', 'T18'], ['T16', 'T17']]);
    const r16 = b.ties.filter((t) => t.stage === 'R16');
    expect(r16.map((t) => t.teamB)).toEqual(['T1', 'T2', 'T4', 'T3', 'T5', 'T6', 'T8', 'T7']);
    expect(r16[0].placeholderA).toContain('IV');
  });
});

describe('Monte Carlo', () => {
  it('olasılıklar tutarlı: ilk 8 toplamı 8, şampiyon toplamı 1', () => {
    const st = freshState(11);
    st.mc.iterations = 200;
    const r = runMonteCarlo(dataset, st);
    const t = Object.values(r.teams);
    expect(t.reduce((a, x) => a + x.top8, 0)).toBeCloseTo(8, 6);
    expect(t.reduce((a, x) => a + x.playoff, 0)).toBeCloseTo(16, 6);
    expect(t.reduce((a, x) => a + x.r16, 0)).toBeCloseTo(16, 6);
    expect(t.reduce((a, x) => a + x.champion, 0)).toBeCloseTo(1, 6);
    for (const x of t) {
      expect(x.r16).toBeLessThanOrEqual(x.top8 + x.playoff + 1e-9);
      expect(x.champion).toBeLessThanOrEqual(x.final + 1e-9);
    }
  });
  it('mevcut senaryo durumunu kullanır (elle girilen sonuçlar sabit)', () => {
    const st = freshState(4);
    st.mc.iterations = 150;
    // FB tüm kalan maçlarını 5-0 kazanırsa ilk 8 olasılığı yükselmeli
    const base = runMonteCarlo(dataset, st).teams.FB.top8;
    for (const f of dataset.fixtures.filter((x) => x.status !== 'official' && (x.home === 'FB' || x.away === 'FB'))) {
      st.results[f.id] = f.home === 'FB' ? { home: 5, away: 0, source: 'manual', updatedAt: 1 } : { home: 0, away: 5, source: 'manual', updatedAt: 1 };
    }
    const after = runMonteCarlo(dataset, st).teams.FB;
    expect(after.top8).toBeGreaterThan(base);
    expect(after.avgPoints).toBeCloseTo(17, 6);
  });
  it('lig tamamen sabitse sıralama olasılıkları kesindir', () => {
    let st = simulateFixtures(dataset, freshState(8), allRemaining, { mode: 'B' }).state;
    st = { ...st, mc: { iterations: 50, resampleSimulated: false } };
    const v = computeSeason(dataset, st);
    const r = runMonteCarlo(dataset, st);
    const first = v.standings[0].team;
    expect(r.teams[first].positionHist[0]).toBe(1);
    expect(r.teams[v.standings[30].team].eliminatedLeague).toBe(1);
  });
  it('kesinti desteği', () => {
    const st = freshState(4);
    st.mc.iterations = 1000;
    let calls = 0;
    const r = runMonteCarlo(dataset, st, { shouldStop: () => ++calls > 10 });
    expect(r.interrupted).toBe(true);
    expect(r.completedIterations).toBe(10);
  });
});
