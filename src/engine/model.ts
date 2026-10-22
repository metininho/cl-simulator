// Skor modeli: iki bağımsız Poisson + Dixon-Coles düşük skor düzeltmesi.
// Ev sahibi avantajı her iki takımın gol beklentisini etkiler (ev sahibi artar, deplasman azalır).

import type { Rng } from './rng';
import type { ModelSettings, TeamId } from './types';
import type { Ratings } from './ratings';

export const MAX_GOALS = 10;

export interface MatchFactor {
  label: string;
  /** Ev sahibinin lehine (+) / aleyhine (−) log-gol etkisi. */
  value: number;
}

export interface Prediction {
  lambdaHome: number;
  lambdaAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  mostLikely: { home: number; away: number; p: number };
  /** Kümülatif olasılık dizisi (örnekleme için), indeks = h*(MAX_GOALS+1)+a */
  cdf: Float64Array;
  factors: MatchFactor[];
}

export function expectedGoals(home: TeamId, away: TeamId, ratings: Ratings, s: ModelSettings, neutral = false) {
  const h = ratings[home];
  const a = ratings[away];
  const ha = neutral ? 0 : s.homeAdvantage;
  const ap = neutral ? 0 : s.awayPenalty;
  const lambdaHome = s.baseGoals * Math.exp(ha + h.attack - a.defense);
  const lambdaAway = s.baseGoals * Math.exp(ap + a.attack - h.defense);
  const strength = (s.eloScale * (h.effectiveElo - a.effectiveElo)) / 2;
  const factors: MatchFactor[] = [
    { label: `Güç farkı (Elo ${Math.round(h.effectiveElo)} – ${Math.round(a.effectiveElo)})`, value: 2 * strength },
    { label: neutral ? 'Tarafsız saha' : 'Ev sahibi avantajı', value: ha - ap },
    { label: 'Hücum formu (ev − deplasman)', value: h.attackForm - a.attackForm },
    { label: 'Savunma formu (ev − deplasman)', value: h.defenseForm - a.defenseForm },
  ];
  return { lambdaHome, lambdaAway, factors };
}

function poissonPmf(lambda: number, n: number): number[] {
  const out = new Array(n + 1);
  out[0] = Math.exp(-lambda);
  for (let k = 1; k <= n; k++) out[k] = (out[k - 1] * lambda) / k;
  return out;
}

export function scoreMatrix(lh: number, la: number, rho: number): Float64Array {
  const ph = poissonPmf(lh, MAX_GOALS);
  const pa = poissonPmf(la, MAX_GOALS);
  const n = MAX_GOALS + 1;
  const m = new Float64Array(n * n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let tau = 1;
      if (i === 0 && j === 0) tau = 1 - lh * la * rho;
      else if (i === 0 && j === 1) tau = 1 + lh * rho;
      else if (i === 1 && j === 0) tau = 1 + la * rho;
      else if (i === 1 && j === 1) tau = 1 - rho;
      const v = Math.max(0, ph[i] * pa[j] * tau);
      m[i * n + j] = v;
      total += v;
    }
  }
  for (let k = 0; k < m.length; k++) m[k] /= total;
  return m;
}

export function predict(home: TeamId, away: TeamId, ratings: Ratings, s: ModelSettings, neutral = false): Prediction {
  const { lambdaHome, lambdaAway, factors } = expectedGoals(home, away, ratings, s, neutral);
  const m = scoreMatrix(lambdaHome, lambdaAway, s.dixonColesRho);
  const n = MAX_GOALS + 1;
  let pH = 0, pD = 0, pA = 0, best = { home: 0, away: 0, p: -1 };
  const cdf = new Float64Array(m.length);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = m[i * n + j];
      if (i > j) pH += v; else if (i === j) pD += v; else pA += v;
      if (v > best.p) best = { home: i, away: j, p: v };
      acc += v;
      cdf[i * n + j] = acc;
    }
  }
  return { lambdaHome, lambdaAway, pHome: pH, pDraw: pD, pAway: pA, mostLikely: best, cdf, factors };
}

export function sampleFromCdf(cdf: Float64Array, rng: Rng): { home: number; away: number } {
  const u = rng() * cdf[cdf.length - 1];
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid + 1; else hi = mid;
  }
  const n = MAX_GOALS + 1;
  return { home: Math.floor(lo / n), away: lo % n };
}

function samplePoisson(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L && k < 20);
  return k - 1;
}

/** 30 dakikalık uzatma: 90 dakikalık beklentinin 1/3'ünün biraz altında (yorgunluk/temkin). */
export function sampleExtraTime(lh: number, la: number, rng: Rng) {
  const f = (30 / 90) * 0.9;
  return { home: samplePoisson(lh * f, rng), away: samplePoisson(la * f, rng) };
}

/**
 * Penaltı atışları: 5'er atış, sonra seri sonu. İsabet oranı ~%76 (tarihsel ortalama),
 * güç farkının etkisi bilinçli olarak çok küçük tutulur.
 */
export function samplePenalties(eloHome: number, eloAway: number, rng: Rng) {
  const tilt = Math.max(-0.03, Math.min(0.03, (eloHome - eloAway) * 0.0001));
  const ph = 0.76 + tilt, pa = 0.76 - tilt;
  let h = 0, a = 0;
  for (let i = 0; i < 5; i++) {
    if (rng() < ph) h++;
    if (h > a + (5 - i)) break;
    if (rng() < pa) a++;
    if (a > h + (4 - i) || h > a + (4 - i)) break;
  }
  while (h === a) {
    const kh = rng() < ph ? 1 : 0;
    const ka = rng() < pa ? 1 : 0;
    h += kh; a += ka;
  }
  return { home: h, away: a };
}
