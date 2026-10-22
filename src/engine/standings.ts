// Lig aşaması puan durumu ve resmi eşitlik kriterleri (UEFA ŞL Talimatı, lig aşaması sıralaması).
// Lig aşaması sürerken yalnızca ilk 5 kriter uygulanır; hâlâ eşitse takımlar eşit sayılır ve alfabetik dizilir.
// Tüm maçlar bittikten sonra 6–10. kriterler de uygulanır (disiplin puanı verisi yoksa atlanır).

import type { Team, TeamId } from './types';

export interface PlayedMatch {
  home: TeamId;
  away: TeamId;
  hg: number;
  ag: number;
}

export interface StandingRow {
  team: TeamId;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  awayGoalsFor: number;
  awayWins: number;
  opponentsPoints: number;
  opponentsGoalDifference: number;
  opponentsGoalsFor: number;
  /** Sonuçlar, en yeniden eskiye değil: kronolojik sırada (G/B/M). */
  form: ('G' | 'B' | 'M')[];
  /** Uygulanan kriterlerle ayrılamayan takım var mı? */
  tied: boolean;
}

export interface StandingsOptions {
  pointsWin?: number;
  pointsDraw?: number;
  /** Tüm lig maçları tamamlandı mı (6–10. kriterler yalnızca o zaman). */
  complete: boolean;
  /** Disiplin puanları (düşük olan önde). Veri yoksa verilmez. */
  disciplinary?: Record<TeamId, number>;
}

type Key = (r: StandingRow) => number;

export function computeStandings(teams: Team[], matches: PlayedMatch[], opts: StandingsOptions): StandingRow[] {
  const pw = opts.pointsWin ?? 3;
  const pd = opts.pointsDraw ?? 1;
  const rows = new Map<TeamId, StandingRow>();
  const opponents = new Map<TeamId, TeamId[]>();
  for (const t of teams) {
    rows.set(t.id, {
      team: t.id, position: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
      goalDifference: 0, points: 0, awayGoalsFor: 0, awayWins: 0, opponentsPoints: 0,
      opponentsGoalDifference: 0, opponentsGoalsFor: 0, form: [], tied: false,
    });
    opponents.set(t.id, []);
  }
  for (const m of matches) {
    const h = rows.get(m.home);
    const a = rows.get(m.away);
    if (!h || !a) throw new Error(`Bilinmeyen takım: ${m.home} / ${m.away}`);
    h.played++; a.played++;
    h.goalsFor += m.hg; h.goalsAgainst += m.ag;
    a.goalsFor += m.ag; a.goalsAgainst += m.hg;
    a.awayGoalsFor += m.ag;
    if (m.hg > m.ag) { h.wins++; a.losses++; h.points += pw; h.form.push('G'); a.form.push('M'); }
    else if (m.hg < m.ag) { a.wins++; h.losses++; a.points += pw; a.awayWins++; a.form.push('G'); h.form.push('M'); }
    else { h.draws++; a.draws++; h.points += pd; a.points += pd; h.form.push('B'); a.form.push('B'); }
    opponents.get(m.home)!.push(m.away);
    opponents.get(m.away)!.push(m.home);
  }
  for (const r of rows.values()) r.goalDifference = r.goalsFor - r.goalsAgainst;
  for (const r of rows.values()) {
    for (const o of opponents.get(r.team)!) {
      const or = rows.get(o)!;
      r.opponentsPoints += or.points;
      r.opponentsGoalDifference += or.goalDifference;
      r.opponentsGoalsFor += or.goalsFor;
    }
  }

  const teamById = new Map(teams.map((t) => [t.id, t]));
  // Büyük olan önde (katsayı sırası ve disiplin puanı için işaret çevrilir).
  const keys: Key[] = [
    (r) => r.points,
    (r) => r.goalDifference,
    (r) => r.goalsFor,
    (r) => r.awayGoalsFor,
    (r) => r.wins,
    (r) => r.awayWins,
  ];
  if (opts.complete) {
    keys.push((r) => r.opponentsPoints, (r) => r.opponentsGoalDifference, (r) => r.opponentsGoalsFor);
    if (opts.disciplinary) {
      const d = opts.disciplinary;
      keys.push((r) => -(d[r.team] ?? 0));
    }
    keys.push((r) => -(teamById.get(r.team)?.coefficientRank ?? 999));
  }

  const list = [...rows.values()];
  const cmpKeys = (a: StandingRow, b: StandingRow) => {
    for (const k of keys) {
      const d = k(b) - k(a);
      if (d !== 0) return d;
    }
    return 0;
  };
  list.sort((a, b) => cmpKeys(a, b) || teamById.get(a.team)!.name.localeCompare(teamById.get(b.team)!.name, 'tr'));
  list.forEach((r, i) => {
    r.position = i + 1;
    const prev = list[i - 1];
    const next = list[i + 1];
    r.tied = (!!prev && cmpKeys(prev, r) === 0) || (!!next && cmpKeys(r, next) === 0);
  });
  return list;
}

export type QualificationZone = 'direct' | 'playoff' | 'out';

export function zoneForPosition(pos: number): QualificationZone {
  if (pos <= 8) return 'direct';
  if (pos <= 24) return 'playoff';
  return 'out';
}

export interface MathStatus {
  /** İlk 8 matematiksel olarak garanti mi? */
  top8Clinched: boolean;
  /** İlk 24 garanti mi? */
  top24Clinched: boolean;
  /** İlk 8'e girme imkânı kalmadı mı? */
  top8Impossible: boolean;
  /** İlk 24'e girme imkânı kalmadı mı (elendi)? */
  eliminated: boolean;
}

/**
 * Muhafazakâr matematiksel durum: yalnızca puan sınırlarına bakar, eşit puanı her zaman
 * aleyhe sayar. Bu yüzden "kesinleşti" dediğinde gerçekten kesindir; bazı kesin durumları
 * (karşılıklı maç bağımlılıkları) kaçırabilir ama asla yanlış ilan etmez.
 */
export function mathematicalStatus(rows: StandingRow[], remaining: Record<TeamId, number>, pointsWin = 3): Record<TeamId, MathStatus> {
  const maxPts = new Map(rows.map((r) => [r.team, r.points + pointsWin * (remaining[r.team] ?? 0)]));
  const out: Record<TeamId, MathStatus> = {};
  for (const r of rows) {
    const myMax = maxPts.get(r.team)!;
    // Bu takımı geçebilecek/yakalayabilecek takım sayısı
    let canReach = 0;
    // Bu takımın en yüksek puanından kesin fazla puanı olan takım sayısı
    let surelyAbove = 0;
    for (const o of rows) {
      if (o.team === r.team) continue;
      if (maxPts.get(o.team)! >= r.points) canReach++;
      if (o.points > myMax) surelyAbove++;
    }
    out[r.team] = {
      top8Clinched: canReach < 8,
      top24Clinched: canReach < 24,
      top8Impossible: surelyAbove >= 8,
      eliminated: surelyAbove >= 24,
    };
  }
  return out;
}
