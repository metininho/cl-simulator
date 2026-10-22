// Veri doğrulama: veri seti şeması, fikstür yapısı (36 takım × 8 maç, 4 iç/4 dış saha, her torbadan 2 rakip)
// ve hesaplanan puan durumunun resmi/referans tabloyla karşılaştırılması.

import type { Dataset, Fixture, ReferenceRow, TeamId } from './types';
import { computeStandings, type StandingRow } from './standings';

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

const isInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** İçe aktarılan bir veri setinin yapısal doğrulaması. Hata varsa veri seti kullanılmamalıdır. */
export function validateDatasetShape(d: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (m: string) => issues.push({ level: 'error', message: m });
  if (!d || typeof d !== 'object') { err('Veri seti bir JSON nesnesi değil.'); return issues; }
  const ds = d as Partial<Dataset>;
  if (!Array.isArray(ds.teams) || ds.teams.length === 0) err('"teams" listesi eksik veya boş.');
  if (!Array.isArray(ds.fixtures) || ds.fixtures.length === 0) err('"fixtures" listesi eksik veya boş.');
  if (!ds.meta || typeof ds.meta.lastUpdated !== 'string') err('"meta.lastUpdated" alanı eksik.');
  if (issues.length) return issues;
  const ids = new Set<string>();
  for (const t of ds.teams!) {
    if (!t.id || !t.name) err(`Takım kaydında id/name eksik: ${JSON.stringify(t)}`);
    if (ids.has(t.id)) err(`Yinelenen takım kimliği: ${t.id}`);
    ids.add(t.id);
    if (![1, 2, 3, 4].includes(t.pot)) err(`${t.id}: geçersiz torba (${t.pot}).`);
  }
  const fids = new Set<string>();
  for (const f of ds.fixtures!) {
    if (!f.id) { err('Kimliği olmayan maç kaydı.'); continue; }
    if (fids.has(f.id)) err(`Yinelenen maç kimliği: ${f.id}`);
    fids.add(f.id);
    if (!ids.has(f.home) || !ids.has(f.away)) err(`${f.id}: bilinmeyen takım (${f.home} - ${f.away}).`);
    if (f.home === f.away) err(`${f.id}: takım kendisiyle eşleşmiş.`);
    if (!isInt(f.matchday) || f.matchday < 1 || f.matchday > 8) err(`${f.id}: geçersiz hafta (${f.matchday}).`);
    if (!['official', 'scheduled', 'postponed'].includes(f.status)) err(`${f.id}: geçersiz durum (${f.status}).`);
    if (f.status === 'official' && (!f.score || !isInt(f.score.home) || !isInt(f.score.away))) err(`${f.id}: resmi sonuç olarak işaretli ama skor geçersiz.`);
    if (f.status !== 'official' && f.score) err(`${f.id}: oynanmamış maçta skor var — resmi değilse skor girilemez.`);
  }
  return issues;
}

/** Lig aşaması fikstür yapısının resmi formatla tutarlılığı. */
export function validateSchedule(ds: Dataset): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const potOf = new Map(ds.teams.map((t) => [t.id, t.pot]));
  const per = new Map<TeamId, { home: number; away: number; opps: Set<TeamId>; pots: number[]; md: Set<number> }>();
  for (const t of ds.teams) per.set(t.id, { home: 0, away: 0, opps: new Set(), pots: [0, 0, 0, 0, 0], md: new Set() });
  const n = ds.rules.leaguePhaseMatches;
  for (const f of ds.fixtures) {
    const h = per.get(f.home)!;
    const a = per.get(f.away)!;
    h.home++; a.away++;
    if (h.opps.has(f.away)) issues.push({ level: 'error', message: `${f.home} ile ${f.away} birden fazla kez eşleşmiş.` });
    h.opps.add(f.away); a.opps.add(f.home);
    h.pots[potOf.get(f.away)!]++; a.pots[potOf.get(f.home)!]++;
    for (const [tid, rec] of [[f.home, h], [f.away, a]] as const) {
      if (rec.md.has(f.matchday)) issues.push({ level: 'error', message: `${tid} ${f.matchday}. haftada birden fazla maça sahip.` });
      rec.md.add(f.matchday);
    }
  }
  for (const [tid, r] of per) {
    if (r.home + r.away !== n) issues.push({ level: 'error', message: `${tid}: ${r.home + r.away} maç var, ${n} olmalı (eksik veya fazla fikstür).` });
    if (r.home !== n / 2) issues.push({ level: 'error', message: `${tid}: ${r.home} iç saha maçı var, ${n / 2} olmalı.` });
    for (let p = 1; p <= 4; p++) if (r.pots[p] !== 2) issues.push({ level: 'error', message: `${tid}: ${p}. torbadan ${r.pots[p]} rakip var, 2 olmalı.` });
  }
  if (!issues.length) issues.push({ level: 'info', message: `Fikstür yapısı doğrulandı: ${ds.teams.length} takım, ${ds.fixtures.length} maç; her takım 4 iç saha + 4 deplasman, her torbadan 2 rakip.` });
  return issues;
}

export interface ReferenceComparison {
  team: TeamId;
  field: keyof ReferenceRow;
  expected: number;
  actual: number;
}

/** Resmi sonuçlardan hesaplanan tablo ile referans (yayınlanmış) tablo karşılaştırması. */
export function compareWithReference(ds: Dataset): { checked: number; mismatches: ReferenceComparison[]; rows: StandingRow[] } {
  const official = ds.fixtures.filter((f): f is Fixture & { score: NonNullable<Fixture['score']> } => f.status === 'official' && !!f.score);
  const rows = computeStandings(ds.teams, official.map((f) => ({ home: f.home, away: f.away, hg: f.score.home, ag: f.score.away })), {
    complete: official.length === ds.fixtures.length,
    pointsWin: ds.rules.pointsWin,
    pointsDraw: ds.rules.pointsDraw,
  });
  const mismatches: ReferenceComparison[] = [];
  let checked = 0;
  const byTeam = new Map(rows.map((r) => [r.team, r]));
  for (const ref of ds.referenceStandings?.rows ?? []) {
    const r = byTeam.get(ref.team);
    if (!r) continue;
    for (const field of ['position', 'points', 'goalDifference', 'played', 'wins', 'draws', 'losses'] as const) {
      const exp = ref[field];
      if (typeof exp !== 'number') continue;
      checked++;
      const act = r[field as keyof StandingRow] as number;
      if (act !== exp) mismatches.push({ team: ref.team, field, expected: exp, actual: act });
    }
  }
  return { checked, mismatches, rows };
}

/** İki veri seti arasında resmi sonuç çakışmalarını bulur (içe aktarmada kullanılır). */
export function diffOfficialResults(oldDs: Dataset, newDs: Dataset) {
  const oldById = new Map(oldDs.fixtures.map((f) => [f.id, f]));
  const changed: { id: string; before: string; after: string }[] = [];
  const added: string[] = [];
  const missing: string[] = [];
  const s = (f?: Fixture) => (f?.score ? `${f.score.home}-${f.score.away}` : '—');
  for (const f of newDs.fixtures) {
    const o = oldById.get(f.id);
    if (!o) { added.push(f.id); continue; }
    if (o.home !== f.home || o.away !== f.away) changed.push({ id: f.id, before: `${o.home}-${o.away}`, after: `${f.home}-${f.away}` });
    else if (o.status === 'official' && (f.status !== 'official' || s(o) !== s(f))) changed.push({ id: f.id, before: s(o), after: s(f) });
  }
  const newIds = new Set(newDs.fixtures.map((f) => f.id));
  for (const f of oldDs.fixtures) if (!newIds.has(f.id)) missing.push(f.id);
  return { changed, added, missing };
}
