// Eleme aşaması: play-off, son 16, çeyrek final, yarı final, final.
// Kurallar (UEFA ŞL 2026/27 Talimatı Md. 19 ve yarışma formatı):
//  - Play-off: 9/10 ↔ 23/24 (I), 11/12 ↔ 21/22 (II), 13/14 ↔ 19/20 (III), 15/16 ↔ 17/18 (IV). Seri başı (9–16) rövanşı evinde oynar.
//  - Son 16: A = 1/2 ↔ IV galibi, B = 3/4 ↔ III, C = 5/6 ↔ II, D = 7/8 ↔ I. Her seri başı çifti ağacın iki yarısına ayrılır. İlk 8 rövanşı evinde oynar.
//  - Çeyrek final: A–D ve B–C (her yarıda). Yarı final: (A–D) – (B–C). Kura yok; rövanş lig aşamasında üstte bitirenin evinde.
//  - Final: tek maç, tarafsız saha. Deplasman golü kuralı yok; eşitlikte 30 dk uzatma, sonra penaltılar.
//  - Kura çekilmemişse kura seçimleri (çift içi eşleşme ve ağaç yarısı) tohumdan tekrar üretilebilir şekilde rastgele belirlenir.

import type { KnockoutLegResult, OfficialDraw, Score, TeamId } from './types';
import type { Rng } from './rng';

export type Stage = 'PO' | 'R16' | 'QF' | 'SF' | 'F';
export const STAGES: Stage[] = ['PO', 'R16', 'QF', 'SF', 'F'];
export const STAGE_LABEL: Record<Stage, string> = {
  PO: 'Eleme Play-off Turu',
  R16: 'Son 16',
  QF: 'Çeyrek Final',
  SF: 'Yarı Final',
  F: 'Final',
};

export const PLAYOFF_GROUPS = ['I', 'II', 'III', 'IV'] as const;
export type PlayoffGroup = (typeof PLAYOFF_GROUPS)[number];
const PO_SEEDS: Record<PlayoffGroup, [number, number]> = { I: [9, 10], II: [11, 12], III: [13, 14], IV: [15, 16] };
const PO_UNSEEDED: Record<PlayoffGroup, [number, number]> = { I: [23, 24], II: [21, 22], III: [19, 20], IV: [17, 18] };
const SLOTS = ['A', 'B', 'C', 'D'] as const;
type Slot = (typeof SLOTS)[number];
const SLOT_TOP: Record<Slot, [number, number]> = { A: [1, 2], B: [3, 4], C: [5, 6], D: [7, 8] };
const SLOT_PO: Record<Slot, PlayoffGroup> = { A: 'IV', B: 'III', C: 'II', D: 'I' };

/** Kura seçimleri; her biri 4 elemanlı (I..IV veya A..D sırası). */
export interface DrawChoices {
  /** Play-off: true ise üst sıradaki seri başı alt sıradaki seri başı olmayanla eşleşmez, çaprazlanır. */
  poSwap: boolean[];
  /** Play-off: true ise üst sıradaki seri başının eşleşmesi ağacın 2. yarısına gider. */
  poHalf: boolean[];
  /** Son 16: true ise üst sıradaki ilk-8 takımı 2. yarıya gider. */
  topHalf: boolean[];
  official: boolean;
}

export function randomDraw(rng: Rng): DrawChoices {
  const b = () => rng() < 0.5;
  return { poSwap: [b(), b(), b(), b()], poHalf: [b(), b(), b(), b()], topHalf: [b(), b(), b(), b()], official: false };
}

/** Resmi kurayı (takım kimlikleriyle) kura seçimlerine dönüştürür. Eşleşmiyorsa null döner. */
export function drawFromOfficial(official: OfficialDraw | null, order: TeamId[]): DrawChoices | null {
  if (!official?.playoffTies) return null;
  const pos = (t: TeamId) => order.indexOf(t) + 1;
  const d: DrawChoices = { poSwap: [], poHalf: [], topHalf: [], official: true };
  try {
    PLAYOFF_GROUPS.forEach((g, i) => {
      const ties = official.playoffTies![g];
      if (!ties || ties.length !== 2) throw new Error('eksik');
      const [s1] = PO_SEEDS[g];
      const tieOfS1 = ties.findIndex(([s]) => pos(s) === s1);
      if (tieOfS1 < 0) throw new Error('uyumsuz');
      const [, u] = ties[tieOfS1];
      d.poSwap[i] = pos(u) !== PO_UNSEEDED[g][0];
      d.poHalf[i] = tieOfS1 === 1;
    });
    const b = official.bracket as { topHalf?: boolean[] } | undefined;
    d.topHalf = b?.topHalf ?? [false, false, false, false];
    return d;
  } catch {
    return null;
  }
}

export interface Leg {
  key: string;
  home?: TeamId;
  away?: TeamId;
  result?: KnockoutLegResult;
}

export interface Tie {
  id: string;
  stage: Stage;
  half: 1 | 2 | 0;
  label: string;
  /** Rövanşı (veya finalde nominal ev sahipliği) olmayan takım: ilk maçın ev sahibi. */
  teamA?: TeamId;
  /** Rövanşın ev sahibi (seri başı / üst sıradaki). */
  teamB?: TeamId;
  /** Takım henüz belli değilse gösterilecek açıklama. */
  placeholderA: string;
  placeholderB: string;
  legs: Leg[];
  winner?: TeamId;
  loser?: TeamId;
  aggregate?: Score;
  decidedBy?: 'normal' | 'extraTime' | 'penalties';
  /** Sonuç girilmiş ama uzatma/penaltı bilgisi eksik vb. */
  problem?: string;
}

export function legKey(stage: Stage, leg: 1 | 2, home: TeamId, away: TeamId) {
  return `${stage}|${leg}|${home}|${away}`;
}

/** Bir eşleşmenin sonucunu ayaklardan hesaplar. */
export function resolveTie(tie: Tie): void {
  const legs = tie.legs;
  if (!tie.teamA || !tie.teamB || legs.some((l) => !l.result)) return;
  let a = 0, b = 0;
  for (const l of legs) {
    const r = l.result!;
    const aHome = l.home === tie.teamA;
    a += aHome ? r.home : r.away;
    b += aHome ? r.away : r.home;
  }
  const last = legs[legs.length - 1];
  const lr = last.result!;
  const lastAHome = last.home === tie.teamA;
  let decided: Tie['decidedBy'] = 'normal';
  if (a === b) {
    if (lr.etHome === undefined || lr.etAway === undefined) {
      tie.problem = 'Toplam skor eşit: uzatma sonucu girilmeli.';
      tie.aggregate = { home: a, away: b };
      return;
    }
    a += lastAHome ? lr.etHome : lr.etAway;
    b += lastAHome ? lr.etAway : lr.etHome;
    decided = 'extraTime';
    if (a === b) {
      if (lr.penHome === undefined || lr.penAway === undefined || lr.penHome === lr.penAway) {
        tie.problem = 'Uzatma sonrası eşitlik: penaltı sonucu girilmeli (eşit olamaz).';
        tie.aggregate = { home: a, away: b };
        return;
      }
      const pa = lastAHome ? lr.penHome : lr.penAway;
      const pb = lastAHome ? lr.penAway : lr.penHome;
      decided = 'penalties';
      tie.winner = pa > pb ? tie.teamA : tie.teamB;
    }
  }
  tie.aggregate = { home: a, away: b };
  if (!tie.winner) tie.winner = a > b ? tie.teamA : tie.teamB;
  tie.loser = tie.winner === tie.teamA ? tie.teamB : tie.teamA;
  tie.decidedBy = decided;
}

export interface Bracket {
  ties: Tie[];
  byId: Record<string, Tie>;
  champion?: TeamId;
  draw: DrawChoices;
}

export type LegLookup = (key: string) => KnockoutLegResult | undefined;

/**
 * Lig sıralamasından (1..36) eleme ağacını kurar ve mevcut sonuçlarla çözer.
 * order[i] = (i+1). sıradaki takım.
 */
export function buildBracket(order: TeamId[], draw: DrawChoices, lookup: LegLookup): Bracket {
  const posOf = new Map(order.map((t, i) => [t, i + 1]));
  const ties: Tie[] = [];
  const byId: Record<string, Tie> = {};
  const team = (p: number) => order[p - 1];

  const makeTie = (id: string, stage: Stage, half: 0 | 1 | 2, label: string, a: TeamId | undefined, b: TeamId | undefined, phA: string, phB: string): Tie => {
    const legs: Leg[] = [];
    if (stage === 'F') {
      legs.push({ key: a && b ? legKey('F', 1, a, b) : `${id}|1`, home: a, away: b });
    } else {
      legs.push({ key: a && b ? legKey(stage, 1, a, b) : `${id}|1`, home: a, away: b });
      legs.push({ key: a && b ? legKey(stage, 2, b, a) : `${id}|2`, home: b, away: a });
    }
    if (a && b) for (const l of legs) l.result = lookup(l.key);
    const t: Tie = { id, stage, half, label, teamA: a, teamB: b, placeholderA: phA, placeholderB: phB, legs };
    resolveTie(t);
    ties.push(t);
    byId[id] = t;
    return t;
  };

  // Play-off
  const poTieByHalf: Record<PlayoffGroup, [Tie, Tie]> = {} as never;
  PLAYOFF_GROUPS.forEach((g, i) => {
    const [s1, s2] = PO_SEEDS[g];
    const [u1, u2] = PO_UNSEEDED[g];
    const oppOfS1 = draw.poSwap[i] ? u2 : u1;
    const oppOfS2 = draw.poSwap[i] ? u1 : u2;
    // Seri başı (teamB) rövanşı evinde oynar.
    const t1 = makeTie(`PO-${g}-${s1}`, 'PO', 0, `Play-off ${g}`, team(oppOfS1), team(s1), `${oppOfS1}. sıra`, `${s1}. sıra`);
    const t2 = makeTie(`PO-${g}-${s2}`, 'PO', 0, `Play-off ${g}`, team(oppOfS2), team(s2), `${oppOfS2}. sıra`, `${s2}. sıra`);
    poTieByHalf[g] = draw.poHalf[i] ? [t2, t1] : [t1, t2];
    poTieByHalf[g][0].half = 1;
    poTieByHalf[g][1].half = 2;
  });

  // Son 16
  const r16: Record<string, Tie> = {};
  SLOTS.forEach((slot, i) => {
    const [p, q] = SLOT_TOP[slot];
    const halves: [number, number] = draw.topHalf[i] ? [q, p] : [p, q];
    ([1, 2] as const).forEach((h) => {
      const top = halves[h - 1];
      const po = poTieByHalf[SLOT_PO[slot]][h - 1];
      // İlk 8 takımı (teamB) rövanşı evinde oynar.
      r16[`${slot}${h}`] = makeTie(`R16-${slot}${h}`, 'R16', h, `Son 16 — ${slot}${h}`, po.winner, team(top),
        `Play-off ${SLOT_PO[slot]} galibi`, `${top}. sıra`);
    });
  });

  // Çeyrek ve yarı final: rövanşı lig sırası daha iyi olan oynar.
  const better = (x?: TeamId, y?: TeamId): [TeamId | undefined, TeamId | undefined] => {
    if (!x || !y) return [x, y];
    return posOf.get(x)! < posOf.get(y)! ? [y, x] : [x, y];
  };
  const qf: Record<string, Tie> = {};
  ([1, 2] as const).forEach((h) => {
    for (const [s1, s2] of [['A', 'D'], ['B', 'C']] as const) {
      const t1 = r16[`${s1}${h}`];
      const t2 = r16[`${s2}${h}`];
      const [a, b] = better(t1.winner, t2.winner);
      qf[`${s1}${s2}${h}`] = makeTie(`QF-${s1}${s2}${h}`, 'QF', h, `Çeyrek Final — ${s1}${s2}${h}`,
        a, b, `Son 16 ${s1}${h} galibi`, `Son 16 ${s2}${h} galibi`);
    }
  });
  const sf: Tie[] = [];
  ([1, 2] as const).forEach((h) => {
    const t1 = qf[`AD${h}`];
    const t2 = qf[`BC${h}`];
    const [a, b] = better(t1.winner, t2.winner);
    sf.push(makeTie(`SF-${h}`, 'SF', h, `Yarı Final ${h}`, a, b, `ÇF AD${h} galibi`, `ÇF BC${h} galibi`));
  });
  const fin = makeTie('F', 'F', 0, 'Final', sf[0].winner, sf[1].winner, 'Yarı Final 1 galibi', 'Yarı Final 2 galibi');
  return { ties, byId, champion: fin.winner, draw };
}

/** Bir takımın eleme aşamasında ulaştığı en ileri tur (0=lig, 1=PO, 2=R16, 3=QF, 4=SF, 5=F, 6=şampiyon). */
export function furthestStage(b: Bracket, team: TeamId): number {
  let best = 0;
  const idx: Record<Stage, number> = { PO: 1, R16: 2, QF: 3, SF: 4, F: 5 };
  for (const t of b.ties) if (t.teamA === team || t.teamB === team) best = Math.max(best, idx[t.stage]);
  if (b.champion === team) best = 6;
  return best;
}
