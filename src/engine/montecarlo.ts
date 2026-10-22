// Monte Carlo turnuva simülasyonu: mevcut senaryo durumundan sezonun kalanını N kez oynatır.
// Resmi ve elle girilmiş sonuçlar sabittir. Simüle edilmiş sonuçlar ayara göre sabit tutulur veya yeniden örneklenir.
// Güç değerleri her iterasyonda mevcut duruma göre sabittir (iterasyon içi form güncellemesi yapılmaz).

import type { Dataset, KnockoutLegResult, TeamId } from './types';
import { computeStandings } from './standings';
import { predict, type Prediction } from './model';
import { buildBracket, drawFromOfficial, furthestStage, randomDraw, type Tie } from './knockout';
import { computeSeason, simulateLeg, type ScenarioState } from './season';
import { mulberry32, hashString, type Rng } from './rng';

export interface TeamProbabilities {
  team: TeamId;
  top8: number;
  playoff: number;
  eliminatedLeague: number;
  r16: number;
  qf: number;
  sf: number;
  final: number;
  champion: number;
  avgPosition: number;
  avgPoints: number;
  /** Lig sırası dağılımı (indeks 0 = 1. sıra). */
  positionHist: number[];
}

export interface MonteCarloResult {
  iterations: number;
  completedIterations: number;
  seed: number;
  stateHash: string;
  teams: Record<TeamId, TeamProbabilities>;
  durationMs: number;
  interrupted: boolean;
}

export function stateHash(ds: Dataset, state: ScenarioState): string {
  return String(hashString(JSON.stringify([ds.meta.lastUpdated, ds.fixtures.length, state.results, state.knockout, state.settings, state.overrides, state.mc, state.seed, ds.knockoutDraw])));
}

export interface MonteCarloOptions {
  onProgress?: (done: number) => void;
  shouldStop?: () => boolean;
  chunk?: number;
}

export function runMonteCarlo(ds: Dataset, state: ScenarioState, opts: MonteCarloOptions = {}): MonteCarloResult {
  const t0 = Date.now();
  const n = Math.max(1, Math.min(50000, Math.floor(state.mc.iterations)));
  const view = computeSeason(ds, state);
  const ratings = view.ratings;
  const teams = ds.teams.map((t) => t.id);
  const acc: Record<TeamId, TeamProbabilities> = {};
  for (const t of teams) acc[t] = { team: t, top8: 0, playoff: 0, eliminatedLeague: 0, r16: 0, qf: 0, sf: 0, final: 0, champion: 0, avgPosition: 0, avgPoints: 0, positionHist: new Array(teams.length).fill(0) };

  // Sabit ve örneklenecek lig maçları
  const fixed: { home: TeamId; away: TeamId; hg: number; ag: number }[] = [];
  const toSample: { home: TeamId; away: TeamId; pred: Prediction }[] = [];
  for (const f of ds.fixtures) {
    const r = view.results.get(f.id);
    if (r && (r.source !== 'simulated' || !state.mc.resampleSimulated)) fixed.push({ home: f.home, away: f.away, hg: r.home, ag: r.away });
    else toSample.push({ home: f.home, away: f.away, pred: predict(f.home, f.away, ratings, state.settings) });
  }
  const fixedKo: Record<string, KnockoutLegResult> = {};
  for (const [k, v] of Object.entries(state.knockout)) if (v.source === 'manual' || !state.mc.resampleSimulated) fixedKo[k] = v;

  const mcSeed = hashString(`mc|${state.seed}`);
  let done = 0;
  let interrupted = false;
  for (let it = 0; it < n; it++) {
    if (opts.shouldStop?.()) { interrupted = true; break; }
    const rng: Rng = mulberry32(mcSeed + it * 2654435761);
    const matches = fixed.slice();
    for (const s of toSample) {
      const u = rng() * s.pred.cdf[s.pred.cdf.length - 1];
      let lo = 0, hi = s.pred.cdf.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (s.pred.cdf[mid] < u) lo = mid + 1; else hi = mid; }
      matches.push({ home: s.home, away: s.away, hg: Math.floor(lo / 11), ag: lo % 11 });
    }
    const table = computeStandings(ds.teams, matches, { complete: true, pointsWin: ds.rules.pointsWin, pointsDraw: ds.rules.pointsDraw });
    const order = table.map((r) => r.team);
    table.forEach((r, i) => {
      const a = acc[r.team];
      a.positionHist[i]++;
      a.avgPosition += i + 1;
      a.avgPoints += r.points;
      if (i < 8) a.top8++; else if (i < 24) a.playoff++; else a.eliminatedLeague++;
    });
    const draw = drawFromOfficial(ds.knockoutDraw, order) ?? randomDraw(rng);
    const koResults: Record<string, KnockoutLegResult> = { ...fixedKo };
    // Ağacı tur tur doldur
    for (let pass = 0; pass < 5; pass++) {
      const b = buildBracket(order, draw, (k) => koResults[k]);
      let changed = false;
      for (const t of b.ties as Tie[]) {
        if (!t.teamA || !t.teamB || t.winner) continue;
        for (let li = 0; li < t.legs.length; li++) {
          const leg = t.legs[li];
          if (leg.result) continue;
          const r = simulateLeg(t, li, ratings, state.settings, rng);
          leg.result = r;
          koResults[leg.key] = r;
          changed = true;
        }
      }
      if (!changed) break;
    }
    const b = buildBracket(order, draw, (k) => koResults[k]);
    for (const t of teams) {
      const st = furthestStage(b, t);
      const a = acc[t];
      if (st >= 2) a.r16++;
      if (st >= 3) a.qf++;
      if (st >= 4) a.sf++;
      if (st >= 5) a.final++;
      if (st >= 6) a.champion++;
    }
    done++;
    if (opts.onProgress && done % (opts.chunk ?? 250) === 0) opts.onProgress(done);
  }
  const d = done || 1;
  for (const t of teams) {
    const a = acc[t];
    a.top8 /= d; a.playoff /= d; a.eliminatedLeague /= d; a.r16 /= d; a.qf /= d; a.sf /= d; a.final /= d; a.champion /= d;
    a.avgPosition /= d; a.avgPoints /= d;
    a.positionHist = a.positionHist.map((x) => x / d);
  }
  return { iterations: n, completedIterations: done, seed: state.seed, stateHash: stateHash(ds, state), teams: acc, durationMs: Date.now() - t0, interrupted };
}
