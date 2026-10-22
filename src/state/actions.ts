// Senaryo durumu üzerinde saf işlemler (arayüzden bağımsız, test edilebilir).

import type { Dataset, Fixture, KnockoutLegResult, TeamId } from '../engine/types';
import type { GameMode, ScenarioState, SeasonView } from '../engine/season';
import { computeSeason, simulateFixtures, simulateKnockout } from '../engine/season';

export class ActionError extends Error {}

export function parseScore(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 30) throw new ActionError('Skor 0 ile 30 arasında bir tam sayı olmalıdır.');
  return n;
}

/** Elle sonuç kaydeder. Resmi sonuçlar değiştirilemez. */
export function setManualResult(ds: Dataset, state: ScenarioState, fixtureId: string, home: number, away: number): ScenarioState {
  const f = ds.fixtures.find((x) => x.id === fixtureId);
  if (!f) throw new ActionError(`Maç bulunamadı: ${fixtureId}`);
  if (f.status === 'official') throw new ActionError('Bu maçın resmi sonucu var; resmi sonuçlar değiştirilemez.');
  for (const n of [home, away]) if (!Number.isInteger(n) || n < 0 || n > 30) throw new ActionError('Skor 0 ile 30 arasında bir tam sayı olmalıdır.');
  return { ...state, results: { ...state.results, [fixtureId]: { home, away, source: 'manual', updatedAt: Date.now() } } };
}

export function clearResult(ds: Dataset, state: ScenarioState, fixtureId: string): ScenarioState {
  const f = ds.fixtures.find((x) => x.id === fixtureId);
  if (f?.status === 'official') throw new ActionError('Resmi sonuç silinemez.');
  const results = { ...state.results };
  delete results[fixtureId];
  return { ...state, results };
}

export function setKnockoutResult(state: ScenarioState, key: string, r: Omit<KnockoutLegResult, 'source' | 'updatedAt'>): ScenarioState {
  return { ...state, knockout: { ...state.knockout, [key]: { ...r, source: 'manual', updatedAt: Date.now() } } };
}

export function clearKnockoutResult(state: ScenarioState, key: string): ScenarioState {
  const knockout = { ...state.knockout };
  delete knockout[key];
  return { ...state, knockout };
}

/** Yalnızca simüle edilmiş sonuçları siler (lig + eleme). Resmi ve elle girilmiş sonuçlar korunur. */
export function resetSimulated(state: ScenarioState): ScenarioState {
  const results = Object.fromEntries(Object.entries(state.results).filter(([, r]) => r.source !== 'simulated'));
  const knockout = Object.fromEntries(Object.entries(state.knockout).filter(([, r]) => r.source !== 'simulated'));
  return { ...state, results, knockout };
}

/**
 * Yeni tohumla yeniden oynatma: yalnızca daha önce SİMÜLE edilmiş maçlar yeniden simüle edilir
 * (kullanıcının onayıyla simüle edilmiş FB/GS maçları dahil). Resmi ve elle girilen sonuçlar korunur.
 */
export function replayWithNewSeed(ds: Dataset, s: ScenarioState, seed: number, mode: GameMode): { state: ScenarioState; count: number } {
  const hadSimulated = Object.keys(s.results).filter((id) => s.results[id].source === 'simulated');
  const hadKo = Object.values(s.knockout).some((k) => k.source === 'simulated');
  const base: ScenarioState = { ...resetSimulated(s), seed, drawSalt: s.drawSalt + 1 };
  const r1 = simulateFixtures(ds, base, hadSimulated, { mode, includeUserControlled: true });
  let next = r1.state;
  let count = r1.simulated.length;
  if (hadKo && computeSeason(ds, next).complete) {
    const r2 = simulateKnockout(ds, next, { mode });
    next = r2.state;
    count += r2.simulated;
  }
  return { state: next, count };
}

/** Elle girilmiş sonuçları siler (onaydan sonra çağrılmalı). */
export function resetManual(state: ScenarioState): ScenarioState {
  const results = Object.fromEntries(Object.entries(state.results).filter(([, r]) => r.source !== 'manual'));
  const knockout = Object.fromEntries(Object.entries(state.knockout).filter(([, r]) => r.source !== 'manual'));
  return { ...state, results, knockout };
}

export function removeOrphanKnockout(state: ScenarioState, orphanKeys: string[]): ScenarioState {
  const knockout = { ...state.knockout };
  for (const k of orphanKeys) delete knockout[k];
  return { ...state, knockout };
}

/** Bir haftada kullanıcı kontrolündeki elle girilmiş sonuçlar (simülasyonla çakışma uyarıları için). */
export function manualIdsIn(state: ScenarioState, ids: string[]) {
  return ids.filter((id) => state.results[id]?.source === 'manual');
}

export function nextFixtureFor(ds: Dataset, view: SeasonView, team: TeamId): Fixture | undefined {
  return ds.fixtures
    .filter((f) => (f.home === team || f.away === team) && !view.results.has(f.id))
    .sort((a, b) => a.matchday - b.matchday)[0];
}

export function matchdayComplete(ds: Dataset, view: SeasonView, md: number) {
  return ds.fixtures.filter((f) => f.matchday === md).every((f) => view.results.has(f.id));
}

export function currentLeagueMatchday(ds: Dataset, state: ScenarioState): number {
  const view = computeSeason(ds, state);
  for (let md = 1; md <= 8; md++) if (!matchdayComplete(ds, view, md)) return md;
  return 8;
}

// ---------- CSV ----------

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const t = text.replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * CSV'den resmi sonuç/fikstür güncellemesi. Sütunlar: id, matchday, date, kickoff, home, away, status, home_score, away_score.
 * Mevcut veri setinin üzerine uygular (takımlar değişmez). Kimliği eşleşmeyen satır yeni maç olarak eklenir.
 */
export function datasetFromCsv(base: Dataset, text: string): { dataset: Dataset; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (!rows.length) return { dataset: base, errors: ['CSV boş.'] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const need = ['id', 'matchday', 'home', 'away', 'status'];
  for (const n of need) if (!header.includes(n)) errors.push(`CSV başlığında "${n}" sütunu yok.`);
  if (errors.length) return { dataset: base, errors };
  const col = (r: string[], n: string) => (header.includes(n) ? (r[header.indexOf(n)] ?? '').trim() : '');
  const ds: Dataset = structuredClone(base);
  const byId = new Map(ds.fixtures.map((f) => [f.id, f]));
  const teamIds = new Set(ds.teams.map((t) => t.id));
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const id = col(r, 'id');
    const status = col(r, 'status') as Fixture['status'];
    const home = col(r, 'home'), away = col(r, 'away');
    if (!teamIds.has(home) || !teamIds.has(away)) { errors.push(`Satır ${line}: bilinmeyen takım kimliği (${home} / ${away}).`); return; }
    if (!['official', 'scheduled', 'postponed'].includes(status)) { errors.push(`Satır ${line}: durum official/scheduled/postponed olmalı.`); return; }
    const md = Number(col(r, 'matchday'));
    const hs = col(r, 'home_score'), as = col(r, 'away_score');
    const fx: Fixture = {
      ...(byId.get(id) ?? { id, stage: 'league' as const }),
      id, stage: 'league', matchday: md, date: col(r, 'date') || null, kickoffCET: col(r, 'kickoff') || null, home, away, status,
    };
    delete fx.score;
    if (status === 'official') {
      const h = Number(hs), a = Number(as);
      if (hs === '' || as === '' || !Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) { errors.push(`Satır ${line}: resmi maç için geçerli skor gerekli.`); return; }
      fx.score = { home: h, away: a };
    } else if (hs !== '' || as !== '') {
      errors.push(`Satır ${line}: oynanmamış maçta skor olamaz (resmi değilse skor sütunlarını boş bırakın).`); return;
    }
    if (byId.has(id)) ds.fixtures[ds.fixtures.findIndex((f) => f.id === id)] = fx;
    else ds.fixtures.push(fx);
  });
  return { dataset: ds, errors };
}
