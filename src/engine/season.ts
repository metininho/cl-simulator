// Sezon durumu: veri setindeki resmi sonuçlar + senaryodaki elle girilen/simüle edilen sonuçlar.
// Tüm türetilmiş istatistikler (puan durumu, güç değerleri, eleme ağacı) bu modüldeki saf fonksiyonlardan hesaplanır;
// böylece bir skor değiştiğinde her şey yeniden hesaplanır.

import type { Dataset, Fixture, KnockoutLegResult, ModelSettings, ResultEntry, ResultSource, Score, TeamId, TeamRatingOverride } from './types';
import { computeStandings, mathematicalStatus, type StandingRow, type MathStatus } from './standings';
import { computeRatings, type Ratings } from './ratings';
import { predict, sampleExtraTime, sampleFromCdf, samplePenalties, type Prediction } from './model';
import { buildBracket, drawFromOfficial, randomDraw, type Bracket, type Tie, type Stage, STAGES } from './knockout';
import { rngFor, type Rng } from './rng';

export const TURKISH_TEAMS: TeamId[] = ['FB', 'GS'];

export type GameMode = 'A' | 'B';

export interface MonteCarloSettings {
  iterations: number;
  /** Simüle edilmiş sonuçları her iterasyonda yeniden örnekle (önerilen). Elle girilen/resmi sonuçlar her zaman sabittir. */
  resampleSimulated: boolean;
}

export interface ScenarioState {
  results: Record<string, ResultEntry>;
  knockout: Record<string, KnockoutLegResult>;
  seed: number;
  drawSalt: number;
  settings: ModelSettings;
  overrides: Record<TeamId, TeamRatingOverride>;
  currentMatchday: number;
  mc: MonteCarloSettings;
}

export interface EffectiveResult extends Score {
  source: ResultSource;
}

/** Bir maçın senaryodaki geçerli sonucu. Resmi sonuç her zaman önceliklidir ve asla ezilmez. */
export function effectiveResult(f: Fixture, state: ScenarioState): EffectiveResult | undefined {
  if (f.status === 'official' && f.score) return { ...f.score, source: 'official' };
  const r = state.results[f.id];
  return r ? { home: r.home, away: r.away, source: r.source } : undefined;
}

/** Resmi sonucu olan bir maç için senaryoda kalmış (artık geçersiz) elle girilmiş kayıtlar. */
export function overriddenEntries(ds: Dataset, state: ScenarioState) {
  return ds.fixtures.filter((f) => f.status === 'official' && state.results[f.id]).map((f) => ({ fixture: f, entry: state.results[f.id] }));
}

export function isTurkishFixture(f: { home?: TeamId; away?: TeamId }) {
  return TURKISH_TEAMS.includes(f.home ?? '') || TURKISH_TEAMS.includes(f.away ?? '');
}

/** Mod A'da kullanıcı yalnızca FB/GS maçlarını kontrol eder; Mod B'de tüm maçları. */
export function isUserControlled(mode: GameMode, f: { home?: TeamId; away?: TeamId }) {
  return mode === 'B' || isTurkishFixture(f);
}

const fixtureOrder = (f: Fixture) => f.matchday * 1000 + (f.date ? Number(f.date.replaceAll('-', '')) % 1000 : 0);

export interface SeasonView {
  results: Map<string, EffectiveResult>;
  standings: StandingRow[];
  ratings: Ratings;
  complete: boolean;
  remainingByTeam: Record<TeamId, number>;
  math: Record<TeamId, MathStatus>;
  bracket?: Bracket;
  playedCount: number;
  officialCount: number;
  manualCount: number;
  simulatedCount: number;
  orphanKnockoutKeys: string[];
}

export function ratingsFor(ds: Dataset, state: ScenarioState, results: Map<string, EffectiveResult>): Ratings {
  const input = ds.fixtures
    .filter((f) => {
      const r = results.get(f.id);
      return r && (r.source !== 'simulated' || state.settings.formUsesSimulated);
    })
    .map((f) => {
      const r = results.get(f.id)!;
      return { home: f.home, away: f.away, hg: r.home, ag: r.away, order: fixtureOrder(f) };
    });
  return computeRatings(ds.teams, input, state.settings, state.overrides);
}

export function drawFor(ds: Dataset, state: ScenarioState, order: TeamId[]) {
  return drawFromOfficial(ds.knockoutDraw, order) ?? randomDraw(rngFor(state.seed, 'draw', state.drawSalt));
}

export function computeSeason(ds: Dataset, state: ScenarioState, filter: 'all' | 'official' = 'all'): SeasonView {
  const results = new Map<string, EffectiveResult>();
  let officialCount = 0, manualCount = 0, simulatedCount = 0;
  for (const f of ds.fixtures) {
    const r = effectiveResult(f, state);
    if (!r) continue;
    if (filter === 'official' && r.source !== 'official') continue;
    results.set(f.id, r);
    if (r.source === 'official') officialCount++;
    else if (r.source === 'manual') manualCount++;
    else simulatedCount++;
  }
  const played = ds.fixtures.filter((f) => results.has(f.id));
  const complete = played.length === ds.fixtures.length;
  const standings = computeStandings(ds.teams, played.map((f) => ({ home: f.home, away: f.away, hg: results.get(f.id)!.home, ag: results.get(f.id)!.away })), {
    complete, pointsWin: ds.rules.pointsWin, pointsDraw: ds.rules.pointsDraw,
  });
  const remainingByTeam: Record<TeamId, number> = Object.fromEntries(ds.teams.map((t) => [t.id, 0]));
  for (const f of ds.fixtures) if (!results.has(f.id)) { remainingByTeam[f.home]++; remainingByTeam[f.away]++; }
  const math = mathematicalStatus(standings, remainingByTeam, ds.rules.pointsWin);
  const ratings = ratingsFor(ds, state, results);
  let bracket: Bracket | undefined;
  const orphanKnockoutKeys: string[] = [];
  if (complete && filter === 'all') {
    const order = standings.map((r) => r.team);
    bracket = buildBracket(order, drawFor(ds, state, order), (k) => state.knockout[k]);
    const used = new Set(bracket.ties.flatMap((t) => t.legs.map((l) => l.key)));
    for (const k of Object.keys(state.knockout)) if (!used.has(k)) orphanKnockoutKeys.push(k);
  } else if (filter === 'all') {
    orphanKnockoutKeys.push(...Object.keys(state.knockout));
  }
  return { results, standings, ratings, complete, remainingByTeam, math, bracket, playedCount: played.length, officialCount, manualCount, simulatedCount, orphanKnockoutKeys };
}

export function predictFixture(f: { home: TeamId; away: TeamId }, ratings: Ratings, s: ModelSettings, neutral = false): Prediction {
  return predict(f.home, f.away, ratings, s, neutral);
}

/** Simülasyona uygun mu: resmi sonucu yok, elle girilmiş sonucu yok ve (rerun değilse) henüz simüle edilmemiş. */
export function isEligibleForSimulation(f: Fixture, state: ScenarioState, rerun: boolean) {
  if (f.status === 'official') return false;
  const r = state.results[f.id];
  if (!r) return true;
  return rerun && r.source === 'simulated';
}

export interface SimulateOptions {
  rerun?: boolean;
  /** Mod A'da FB/GS maçlarını da simüle etmeye kullanıcı açıkça onay verdiyse. */
  includeUserControlled?: boolean;
  mode: GameMode;
}

/**
 * Verilen maçları simüle eder. Resmi ve elle girilmiş sonuçlara asla dokunmaz.
 * Maçlar hafta sırasıyla oynatılır; güç değerleri (form simüle sonuçları içeriyorsa) her hafta güncellenir.
 */
export function simulateFixtures(ds: Dataset, state: ScenarioState, fixtureIds: string[], opts: SimulateOptions): { state: ScenarioState; simulated: string[] } {
  const ids = new Set(fixtureIds);
  const targets = ds.fixtures
    .filter((f) => ids.has(f.id) && isEligibleForSimulation(f, state, !!opts.rerun))
    .filter((f) => opts.mode === 'B' || opts.includeUserControlled || !isTurkishFixture(f))
    .sort((a, b) => fixtureOrder(a) - fixtureOrder(b));
  const results = { ...state.results };
  const simulated: string[] = [];
  let next: ScenarioState = { ...state, results };
  const mds = [...new Set(targets.map((f) => f.matchday))].sort((a, b) => a - b);
  for (const md of mds) {
    const view = computeSeason(ds, next);
    for (const f of targets.filter((t) => t.matchday === md)) {
      const prev = results[f.id];
      const nonce = prev?.source === 'simulated' ? (prev.nonce ?? 0) + (opts.rerun ? 1 : 0) : 0;
      const p = predictFixture(f, view.ratings, state.settings);
      const s = sampleFromCdf(p.cdf, rngFor(state.seed, f.id, nonce));
      results[f.id] = { home: s.home, away: s.away, source: 'simulated', nonce, updatedAt: Date.now() };
      simulated.push(f.id);
    }
    next = { ...next, results: { ...results } };
  }
  return { state: next, simulated };
}

/** Eleme turunda tek ayağı simüle eder (son ayakta gerekirse uzatma ve penaltı). */
export function simulateLeg(tie: Tie, legIndex: number, ratings: Ratings, s: ModelSettings, rng: Rng, nonce = 0): KnockoutLegResult {
  const leg = tie.legs[legIndex];
  const neutral = tie.stage === 'F';
  const p = predict(leg.home!, leg.away!, ratings, s, neutral);
  const sc = sampleFromCdf(p.cdf, rng);
  const res: KnockoutLegResult = { home: sc.home, away: sc.away, source: 'simulated', nonce, updatedAt: Date.now() };
  const isLast = legIndex === tie.legs.length - 1;
  if (isLast) {
    // Toplam skoru, son ayağın ev sahibi açısından hesapla
    let homeAgg = sc.home, awayAgg = sc.away;
    for (let i = 0; i < legIndex; i++) {
      const r = tie.legs[i].result!;
      const sameHome = tie.legs[i].home === leg.home;
      homeAgg += sameHome ? r.home : r.away;
      awayAgg += sameHome ? r.away : r.home;
    }
    if (homeAgg === awayAgg) {
      const et = sampleExtraTime(p.lambdaHome, p.lambdaAway, rng);
      res.etHome = et.home; res.etAway = et.away;
      if (et.home === et.away) {
        const pen = samplePenalties(ratings[leg.home!].effectiveElo, ratings[leg.away!].effectiveElo, rng);
        res.penHome = pen.home; res.penAway = pen.away;
      }
    }
  }
  return res;
}

export interface KnockoutSimOptions {
  /** Yalnızca bu tura kadar (dahil) simüle et; yoksa sona kadar. */
  untilStage?: Stage;
  /** Yalnızca sıradaki tur. */
  nextRoundOnly?: boolean;
  mode: GameMode;
  includeUserControlled?: boolean;
  /** Simüle edilmiş eleme sonuçlarını yeniden oynat. */
  rerun?: boolean;
}

/** Eleme turlarını simüle eder. Elle girilmiş eleme sonuçları korunur. */
export function simulateKnockout(ds: Dataset, state: ScenarioState, opts: KnockoutSimOptions): { state: ScenarioState; simulated: number; blockedByUser: string[] } {
  let knockout = { ...state.knockout };
  if (opts.rerun) for (const [k, v] of Object.entries(knockout)) if (v.source === 'simulated') delete knockout[k];
  let cur: ScenarioState = { ...state, knockout };
  let simulated = 0;
  const blockedByUser: string[] = [];
  const stageLimit = opts.untilStage ? STAGES.indexOf(opts.untilStage) : STAGES.length - 1;
  let firstStageTouched: number | null = null;
  for (let si = 0; si <= stageLimit; si++) {
    const view = computeSeason(ds, cur);
    if (!view.bracket) return { state: cur, simulated, blockedByUser };
    const stage = STAGES[si];
    const ties = view.bracket.ties.filter((t) => t.stage === stage);
    if (ties.every((t) => t.winner)) continue;
    if (opts.nextRoundOnly && firstStageTouched !== null && firstStageTouched !== si) break;
    let touched = false;
    for (const t of ties) {
      if (!t.teamA || !t.teamB || t.winner) continue;
      const controlled = opts.mode === 'A' && isUserControlled('A', { home: t.teamA, away: t.teamB });
      if (controlled && !opts.includeUserControlled) {
        if (t.legs.some((l) => !l.result)) blockedByUser.push(t.id);
        continue;
      }
      for (let li = 0; li < t.legs.length; li++) {
        const leg = t.legs[li];
        if (leg.result) continue;
        const prev = state.knockout[leg.key];
        const nonce = prev?.source === 'simulated' ? (prev.nonce ?? 0) + 1 : 0;
        const r = simulateLeg(t, li, view.ratings, state.settings, rngFor(state.seed, leg.key, nonce), nonce);
        leg.result = r;
        knockout = { ...knockout, [leg.key]: r };
        simulated++;
        touched = true;
      }
    }
    cur = { ...cur, knockout };
    if (touched && firstStageTouched === null) firstStageTouched = si;
    // Kullanıcı kontrolündeki bir eşleşme sonuçsuzsa sonraki turlar belirlenemez.
    const after = computeSeason(ds, cur).bracket!;
    if (after.ties.filter((t) => t.stage === stage).some((t) => !t.winner)) break;
    if (opts.nextRoundOnly && touched) break;
  }
  return { state: cur, simulated, blockedByUser };
}

/** Senaryo durumundaki elle girilmiş eleme sonucunun geçerliliği. */
export function validateKnockoutEntry(tie: Tie, legIndex: number, r: Partial<KnockoutLegResult>): string | null {
  const ok = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 30;
  if (!ok(r.home) || !ok(r.away)) return 'Skorlar 0 ile 30 arasında tam sayı olmalı.';
  const isLast = legIndex === tie.legs.length - 1;
  const hasEt = r.etHome !== undefined || r.etAway !== undefined;
  const hasPen = r.penHome !== undefined || r.penAway !== undefined;
  if (!isLast && (hasEt || hasPen)) return 'Uzatma ve penaltı yalnızca son maçta girilebilir.';
  if (!isLast) return null;
  const leg = tie.legs[legIndex];
  let h = r.home!, a = r.away!;
  for (let i = 0; i < legIndex; i++) {
    const pr = tie.legs[i].result;
    if (!pr) return 'Önce ilk maçın sonucunu girin.';
    const same = tie.legs[i].home === leg.home;
    h += same ? pr.home : pr.away;
    a += same ? pr.away : pr.home;
  }
  if (h !== a) {
    if (hasEt || hasPen) return 'Toplam skor eşit değilken uzatma/penaltı girilemez.';
    return null;
  }
  if (!ok(r.etHome) || !ok(r.etAway)) return 'Toplam skor eşit: uzatmada atılan golleri girin (gol yoksa 0-0).';
  if (r.etHome! !== r.etAway!) {
    if (hasPen) return 'Uzatmada eşitlik bozulduysa penaltı girilemez.';
    return null;
  }
  if (!ok(r.penHome) || !ok(r.penAway)) return 'Uzatma sonrası eşitlik: penaltı skorunu girin.';
  if (r.penHome === r.penAway) return 'Penaltı skoru eşit olamaz.';
  return null;
}
