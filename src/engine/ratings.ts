// Takım gücü modeli.
// 1) Başlangıç Elo'su: UEFA katsayı sırası vekili (torba sırası). Resmi bir istatistik DEĞİLDİR.
// 2) Bu sezonun Şampiyonlar Ligi sonuçlarıyla kronolojik Elo güncellemesi (rakip gücü ve gol farkı dikkate alınır).
// 3) Form: son N maçta atılan/yenilen gollerin, model beklentisine göre ağırlıklı (yakın maç daha ağır) sapması.
// 4) Kullanıcının elle yaptığı düzeltmeler.

import type { ModelSettings, Team, TeamId, TeamRatingOverride } from './types';

export const DEFAULT_SETTINGS: ModelSettings = {
  baseGoals: 1.45,
  homeAdvantage: 0.12,
  awayPenalty: -0.08,
  eloScale: 0.0032,
  dixonColesRho: -0.08,
  formWindow: 6,
  formWeight: 0.4,
  eloK: 20,
  formUsesSimulated: false,
};

export const BASE_ELO_TOP = 1850;
export const BASE_ELO_STEP = 9;

export function baseElo(team: Team): number {
  return BASE_ELO_TOP - BASE_ELO_STEP * (team.coefficientRank - 1);
}

export interface RatingInputMatch {
  home: TeamId;
  away: TeamId;
  hg: number;
  ag: number;
  /** Sıralama için: hafta ve tarih. */
  order: number;
}

export interface TeamRating {
  team: TeamId;
  baseElo: number;
  elo: number;
  /** Elle düzeltme dahil nihai Elo. */
  effectiveElo: number;
  attackForm: number;
  defenseForm: number;
  attack: number;
  defense: number;
  formMatches: number;
  formGoalsFor: number;
  formGoalsAgainst: number;
  formExpectedFor: number;
  formExpectedAgainst: number;
}

export type Ratings = Record<TeamId, TeamRating>;

function marginMultiplier(gd: number): number {
  const d = Math.abs(gd);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

/** Elo'dan (formsuz) beklenen goller; form hesabında referans olarak kullanılır. */
function eloLambdas(eh: number, ea: number, s: ModelSettings) {
  const d = (s.eloScale * (eh - ea)) / 2;
  return {
    lh: s.baseGoals * Math.exp(s.homeAdvantage + d),
    la: s.baseGoals * Math.exp(s.awayPenalty - d),
  };
}

export function computeRatings(
  teams: Team[],
  matches: RatingInputMatch[],
  settings: ModelSettings,
  overrides: Record<TeamId, TeamRatingOverride> = {},
): Ratings {
  const elo = new Map<TeamId, number>(teams.map((t) => [t.id, baseElo(t)]));
  const history = new Map<TeamId, { gf: number; ga: number; xf: number; xa: number }[]>(teams.map((t) => [t.id, []]));
  const sorted = [...matches].sort((a, b) => a.order - b.order);
  for (const m of sorted) {
    const eh = elo.get(m.home)!;
    const ea = elo.get(m.away)!;
    const { lh, la } = eloLambdas(eh, ea, settings);
    history.get(m.home)!.push({ gf: m.hg, ga: m.ag, xf: lh, xa: la });
    history.get(m.away)!.push({ gf: m.ag, ga: m.hg, xf: la, xa: lh });
    const expected = 1 / (1 + Math.pow(10, -(eh - ea + 60) / 400));
    const w = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0;
    const delta = settings.eloK * marginMultiplier(m.hg - m.ag) * (w - expected);
    elo.set(m.home, eh + delta);
    elo.set(m.away, ea - delta);
  }

  // Form, lig geneline göre görecelidir: ortalama sapma çıkarılır (sezonun genel gol seviyesi formu şişirmesin).
  const raw = new Map<TeamId, { af: number; df: number; n: number; gf: number; ga: number; xf: number; xa: number; wsum: number }>();
  for (const t of teams) {
    const hist = history.get(t.id)!.slice(-settings.formWindow);
    let wsum = 0, gf = 0, ga = 0, xf = 0, xa = 0;
    hist.forEach((h, i) => {
      const w = Math.pow(0.85, hist.length - 1 - i);
      wsum += w; gf += w * h.gf; ga += w * h.ga; xf += w * h.xf; xa += w * h.xa;
    });
    // Küçültme (shrinkage): az maç oynanmışken form etkisi sınırlı kalır.
    const c = 2;
    raw.set(t.id, {
      af: hist.length ? Math.log((gf + c) / (xf + c)) : 0,
      df: hist.length ? -Math.log((ga + c) / (xa + c)) : 0,
      n: hist.length, gf, ga, xf, xa, wsum,
    });
  }
  const withForm = [...raw.values()].filter((r) => r.n > 0);
  const meanAf = withForm.length ? withForm.reduce((a, r) => a + r.af, 0) / withForm.length : 0;
  const meanDf = withForm.length ? withForm.reduce((a, r) => a + r.df, 0) / withForm.length : 0;

  const out: Ratings = {};
  for (const t of teams) {
    const { af, df, n, gf, ga, xf, xa, wsum } = raw.get(t.id)!;
    const attackForm = n ? settings.formWeight * (af - meanAf) : 0;
    const defenseForm = n ? settings.formWeight * (df - meanDf) : 0;
    const ov = overrides[t.id] ?? {};
    const e = elo.get(t.id)!;
    const eff = e + (ov.eloAdjust ?? 0);
    const half = (settings.eloScale * (eff - 1700)) / 2;
    out[t.id] = {
      team: t.id,
      baseElo: baseElo(t),
      elo: e,
      effectiveElo: eff,
      attackForm,
      defenseForm,
      attack: half + attackForm + (ov.attackAdjust ?? 0),
      defense: half + defenseForm + (ov.defenseAdjust ?? 0),
      formMatches: n,
      formGoalsFor: gf / (wsum || 1),
      formGoalsAgainst: ga / (wsum || 1),
      formExpectedFor: xf / (wsum || 1),
      formExpectedAgainst: xa / (wsum || 1),
    };
  }
  return out;
}
