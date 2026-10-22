// Kalıcı uygulama durumu: her oyun modu (A ve B) kendi senaryo listesine sahiptir ve birbirinden tamamen bağımsızdır.
// Her senaryo: sonuçlar, tohum, ayarlar, eleme sonuçları, ilerleme, geri alma geçmişi ve kayıtlı sürümler.

import type { Dataset } from '../engine/types';
import { DEFAULT_SETTINGS } from '../engine/ratings';
import { randomSeed } from '../engine/rng';
import type { GameMode, ScenarioState } from '../engine/season';

export const APP_SCHEMA = 'ucl-app/2';
export const STORAGE_KEY = 'ucl-2026-27-simulator';
const MAX_UNDO = 30;
const MAX_VERSIONS = 20;

export interface UndoEntry {
  label: string;
  at: number;
  results: ScenarioState['results'];
  knockout: ScenarioState['knockout'];
  currentMatchday: number;
}

export interface Version {
  id: string;
  label: string;
  savedAt: number;
  state: ScenarioState;
}

export interface Scenario {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: ScenarioState;
  undo: UndoEntry[];
  versions: Version[];
}

export interface ModeSlot {
  activeScenarioId: string;
  scenarios: Scenario[];
}

export interface AppPersisted {
  schema: string;
  activeMode: GameMode;
  modes: Record<GameMode, ModeSlot>;
  /** Kullanıcının içe aktardığı resmi veri seti (yoksa paketle gelen veri seti kullanılır). */
  datasetOverride?: Dataset | null;
  savedAt?: number;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function firstUnplayedMatchday(ds: Dataset): number {
  const md = ds.fixtures.filter((f) => f.status !== 'official').map((f) => f.matchday);
  return md.length ? Math.min(...md) : 8;
}

export function newScenarioState(ds: Dataset, seed = randomSeed()): ScenarioState {
  return {
    results: {}, knockout: {}, seed, drawSalt: 0,
    settings: { ...DEFAULT_SETTINGS }, overrides: {},
    currentMatchday: firstUnplayedMatchday(ds),
    mc: { iterations: 2000, resampleSimulated: true },
  };
}

export function newScenario(ds: Dataset, name: string, state?: ScenarioState): Scenario {
  const now = Date.now();
  return { id: uid(), name, createdAt: now, updatedAt: now, state: state ?? newScenarioState(ds), undo: [], versions: [] };
}

export function initialApp(ds: Dataset): AppPersisted {
  const a = newScenario(ds, 'Ana senaryo');
  const b = newScenario(ds, 'Ana senaryo');
  return { schema: APP_SCHEMA, activeMode: 'A', modes: { A: { activeScenarioId: a.id, scenarios: [a] }, B: { activeScenarioId: b.id, scenarios: [b] } } };
}

export function activeScenario(app: AppPersisted, mode: GameMode = app.activeMode): Scenario {
  const slot = app.modes[mode];
  return slot.scenarios.find((s) => s.id === slot.activeScenarioId) ?? slot.scenarios[0];
}

/** Bir moddaki etkin senaryoyu günceller. Diğer moda kesinlikle dokunmaz. */
export function updateScenario(app: AppPersisted, mode: GameMode, id: string, fn: (s: Scenario) => Scenario): AppPersisted {
  const slot = app.modes[mode];
  return {
    ...app,
    modes: { ...app.modes, [mode]: { ...slot, scenarios: slot.scenarios.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)) } },
  };
}

/** Sonuç değişikliği: önceki hâli geri alma yığınına ekler. */
export function commitChange(s: Scenario, label: string, next: ScenarioState): Scenario {
  const entry: UndoEntry = { label, at: Date.now(), results: s.state.results, knockout: s.state.knockout, currentMatchday: s.state.currentMatchday };
  return { ...s, state: next, undo: [...s.undo, entry].slice(-MAX_UNDO) };
}

export function undoLast(s: Scenario): Scenario {
  const last = s.undo[s.undo.length - 1];
  if (!last) return s;
  return { ...s, state: { ...s.state, results: last.results, knockout: last.knockout, currentMatchday: last.currentMatchday }, undo: s.undo.slice(0, -1) };
}

export function saveVersion(s: Scenario, label: string): Scenario {
  const v: Version = { id: uid(), label, savedAt: Date.now(), state: structuredClone(s.state) };
  return { ...s, versions: [v, ...s.versions].slice(0, MAX_VERSIONS) };
}

export function restoreVersion(s: Scenario, versionId: string): Scenario {
  const v = s.versions.find((x) => x.id === versionId);
  if (!v) return s;
  const withBackup = saveVersion(s, `Geri yükleme öncesi otomatik yedek`);
  return { ...withBackup, state: structuredClone(v.state), undo: [] };
}

export function addScenario(app: AppPersisted, mode: GameMode, sc: Scenario): AppPersisted {
  const slot = app.modes[mode];
  return { ...app, modes: { ...app.modes, [mode]: { activeScenarioId: sc.id, scenarios: [...slot.scenarios, sc] } } };
}

export function duplicateScenario(app: AppPersisted, mode: GameMode, id: string): AppPersisted {
  const src = app.modes[mode].scenarios.find((s) => s.id === id);
  if (!src) return app;
  const copy: Scenario = { ...structuredClone(src), id: uid(), name: `${src.name} (kopya)`, createdAt: Date.now(), updatedAt: Date.now() };
  return addScenario(app, mode, copy);
}

export function renameScenario(app: AppPersisted, mode: GameMode, id: string, name: string): AppPersisted {
  const trimmed = name.trim();
  if (!trimmed) return app;
  return updateScenario(app, mode, id, (s) => ({ ...s, name: trimmed }));
}

export function deleteScenario(app: AppPersisted, mode: GameMode, id: string, ds: Dataset): AppPersisted {
  const slot = app.modes[mode];
  let scenarios = slot.scenarios.filter((s) => s.id !== id);
  if (!scenarios.length) scenarios = [newScenario(ds, 'Ana senaryo')];
  const activeScenarioId = scenarios.some((s) => s.id === slot.activeScenarioId) ? slot.activeScenarioId : scenarios[0].id;
  return { ...app, modes: { ...app.modes, [mode]: { activeScenarioId, scenarios } } };
}

export function switchScenario(app: AppPersisted, mode: GameMode, id: string): AppPersisted {
  if (!app.modes[mode].scenarios.some((s) => s.id === id)) return app;
  return { ...app, modes: { ...app.modes, [mode]: { ...app.modes[mode], activeScenarioId: id } } };
}

// ---------- İçe/dışa aktarma ve göç ----------

function migrateScenarioState(raw: Partial<ScenarioState> | undefined, ds: Dataset): ScenarioState {
  const base = newScenarioState(ds, typeof raw?.seed === 'number' ? raw.seed : undefined);
  return {
    ...base,
    ...raw,
    results: raw?.results ?? {},
    knockout: raw?.knockout ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(raw?.settings ?? {}) },
    overrides: raw?.overrides ?? {},
    mc: { ...base.mc, ...(raw?.mc ?? {}) },
    drawSalt: raw?.drawSalt ?? 0,
    currentMatchday: raw?.currentMatchday ?? base.currentMatchday,
  };
}

function migrateScenario(raw: Partial<Scenario>, ds: Dataset): Scenario {
  return {
    id: raw.id ?? uid(),
    name: raw.name ?? 'İçe aktarılan senaryo',
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
    state: migrateScenarioState(raw.state, ds),
    undo: Array.isArray(raw.undo) ? raw.undo : [],
    versions: Array.isArray(raw.versions) ? raw.versions.map((v) => ({ ...v, state: migrateScenarioState(v.state, ds) })) : [],
  };
}

export interface ImportReport {
  app: AppPersisted;
  warnings: string[];
}

/**
 * İçe aktarılan JSON'u doğrular ve gerekirse eski sürümden göç ettirir.
 * Desteklenen biçimler: ucl-app/2 (tam), ucl-app/1 (eski: modes.A/B tek senaryo `state`), tek senaryo dışa aktarımı.
 */
export function importApp(json: unknown, ds: Dataset): ImportReport {
  const warnings: string[] = [];
  if (!json || typeof json !== 'object') throw new Error('Dosya geçerli bir JSON nesnesi değil.');
  const o = json as Record<string, unknown>;
  const fixtureIds = new Set(ds.fixtures.map((f) => f.id));
  const checkScenario = (sc: Scenario) => {
    const unknown = Object.keys(sc.state.results).filter((id) => !fixtureIds.has(id));
    if (unknown.length) {
      warnings.push(`"${sc.name}": veri setinde bulunmayan ${unknown.length} maç sonucu atlandı (${unknown.slice(0, 3).join(', ')}…).`);
      for (const id of unknown) delete sc.state.results[id];
    }
    for (const [id, r] of Object.entries(sc.state.results)) {
      if (!Number.isInteger(r.home) || !Number.isInteger(r.away) || r.home < 0 || r.away < 0 || !['manual', 'simulated'].includes(r.source)) {
        warnings.push(`"${sc.name}": ${id} için geçersiz sonuç kaydı atlandı.`);
        delete sc.state.results[id];
      }
    }
    const shadow = ds.fixtures.filter((f) => f.status === 'official' && sc.state.results[f.id]);
    if (shadow.length) warnings.push(`"${sc.name}": ${shadow.length} maçın artık resmi sonucu var; resmi sonuç geçerli olacak, senaryodaki kayıt kullanılmayacak.`);
  };
  if (o.kind === 'scenario' && o.scenario) {
    const sc = migrateScenario(o.scenario as Partial<Scenario>, ds);
    checkScenario(sc);
    const mode = (o.mode === 'B' ? 'B' : 'A') as GameMode;
    return { app: { ...initialApp(ds), modes: { ...initialApp(ds).modes, [mode]: { activeScenarioId: sc.id, scenarios: [sc] } } }, warnings };
  }
  if (typeof o.schema !== 'string' || !o.schema.startsWith('ucl-app/')) throw new Error('Bu dosya bu uygulamanın kayıt dosyası değil (schema alanı yok).');
  if (o.schema === 'ucl-app/1') warnings.push('Eski kayıt biçimi (ucl-app/1) algılandı ve güncel biçime dönüştürüldü.');
  const modes = o.modes as Record<string, unknown> | undefined;
  if (!modes || !modes.A || !modes.B) throw new Error('Kayıt dosyasında Mod A ve Mod B bölümleri eksik.');
  const out: AppPersisted = { schema: APP_SCHEMA, activeMode: o.activeMode === 'B' ? 'B' : 'A', modes: {} as AppPersisted['modes'] };
  for (const m of ['A', 'B'] as const) {
    const slot = modes[m] as Record<string, unknown>;
    let scenarios: Scenario[];
    if (Array.isArray(slot.scenarios)) scenarios = slot.scenarios.map((s) => migrateScenario(s as Partial<Scenario>, ds));
    else scenarios = [migrateScenario({ name: 'Ana senaryo', state: slot.state as ScenarioState }, ds)];
    if (!scenarios.length) scenarios = [newScenario(ds, 'Ana senaryo')];
    scenarios.forEach(checkScenario);
    const active = typeof slot.activeScenarioId === 'string' && scenarios.some((s) => s.id === slot.activeScenarioId) ? (slot.activeScenarioId as string) : scenarios[0].id;
    out.modes[m] = { activeScenarioId: active, scenarios };
  }
  if (o.datasetOverride) out.datasetOverride = o.datasetOverride as Dataset;
  return { app: out, warnings };
}

export function exportApp(app: AppPersisted, ds: Dataset) {
  return { ...app, schema: APP_SCHEMA, savedAt: Date.now(), datasetMeta: { season: ds.season, lastUpdated: ds.meta.lastUpdated, resultsThrough: ds.meta.resultsThrough } };
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function loadApp(storage: StorageLike, ds: Dataset): { app: AppPersisted; warnings: string[] } {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { app: initialApp(ds), warnings: [] };
  try {
    return importApp(JSON.parse(raw), ds);
  } catch (e) {
    return { app: initialApp(ds), warnings: [`Kayıtlı durum okunamadı, yeni durum oluşturuldu: ${(e as Error).message}`] };
  }
}

export function persistApp(storage: StorageLike, app: AppPersisted): string | null {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...app, savedAt: Date.now() }));
    return null;
  } catch (e) {
    return `Tarayıcı deposuna kaydedilemedi (${(e as Error).name}). Eski sürümleri veya senaryoları silin ya da JSON olarak dışa aktarın.`;
  }
}
