import { describe, expect, it } from 'vitest';
import { computeStandings, mathematicalStatus } from '../src/engine/standings';
import type { Team } from '../src/engine/types';

const T = (id: string, rank: number): Team => ({ id, name: id, short: id, country: 'X', pot: 1, coefficientRank: rank });
const teams = [T('A', 4), T('B', 3), T('C', 2), T('D', 1)];

describe('puan durumu ve eşitlik kriterleri', () => {
  it('galibiyet 3, beraberlik 1, mağlubiyet 0 puan', () => {
    const r = computeStandings(teams, [{ home: 'A', away: 'B', hg: 2, ag: 0 }, { home: 'C', away: 'D', hg: 1, ag: 1 }], { complete: false });
    const by = Object.fromEntries(r.map((x) => [x.team, x]));
    expect(by.A.points).toBe(3); expect(by.B.points).toBe(0); expect(by.C.points).toBe(1); expect(by.D.points).toBe(1);
  });
  it('1: averaj, 2: atılan gol, 3: deplasmanda atılan gol', () => {
    // A ve B 3 puan; averaj eşit (+1), atılan gol: B daha çok
    const r = computeStandings(teams, [
      { home: 'A', away: 'C', hg: 1, ag: 0 },
      { home: 'D', away: 'B', hg: 2, ag: 3 },
    ], { complete: false });
    expect(r[0].team).toBe('B');
    // Averaj ve gol eşit; deplasman golü fazla olan önde
    const r2 = computeStandings(teams, [
      { home: 'A', away: 'C', hg: 2, ag: 1 },
      { home: 'D', away: 'B', hg: 1, ag: 2 },
    ], { complete: false });
    expect(r2[0].team).toBe('B');
  });
  it('lig sürerken ilk 5 kriterle ayrılamayanlar eşit sayılır ve alfabetik dizilir', () => {
    const r = computeStandings(teams, [{ home: 'B', away: 'A', hg: 0, ag: 0 }], { complete: false });
    expect(r.slice(0, 2).map((x) => x.team)).toEqual(['A', 'B']);
    expect(r[0].tied).toBe(true);
  });
  it('lig bitince rakiplerin topladığı puan ve katsayı devreye girer', () => {
    const r = computeStandings(teams, [{ home: 'B', away: 'A', hg: 0, ag: 0 }], { complete: true });
    // A ve B aynı; rakip puanları eşit (1); katsayı sırası: B (3) A'dan (4) iyi
    expect(r.slice(0, 2).map((x) => x.team)).toEqual(['B', 'A']);
    expect(r[0].tied).toBe(false);
  });
  it('galibiyet sayısı kriteri (5. kriter öncesi 4.)', () => {
    // A: 1G 1M (3p), B: 3B (3p), averaj 0 ikisi de, atılan gol eşit
    const six = [...teams, T('E', 5), T('F', 6)];
    const r = computeStandings(six, [
      { home: 'A', away: 'C', hg: 2, ag: 0 }, { home: 'D', away: 'A', hg: 2, ag: 0 },
      { home: 'B', away: 'E', hg: 1, ag: 1 }, { home: 'B', away: 'F', hg: 0, ag: 0 }, { home: 'B', away: 'C', hg: 1, ag: 1 },
    ], { complete: false });
    const a = r.findIndex((x) => x.team === 'A');
    const b = r.findIndex((x) => x.team === 'B');
    expect(a).toBeLessThan(b);
  });
  it('matematiksel durum muhafazakârdır', () => {
    const rows = computeStandings(teams, [{ home: 'A', away: 'B', hg: 1, ag: 0 }], { complete: false });
    const st = mathematicalStatus(rows, { A: 1, B: 1, C: 2, D: 2 });
    // 4 takımlı mini lig: herkes ilk 8 garanti
    expect(st.A.top8Clinched).toBe(true);
    expect(st.B.eliminated).toBe(false);
  });
});
