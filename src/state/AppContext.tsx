import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Dataset, TeamId } from '../engine/types';
import { computeSeason, type GameMode, type ScenarioState, type SeasonView } from '../engine/season';
import { bundledDataset } from '../data/provider';
import {
  activeScenario, commitChange, loadApp, persistApp, updateScenario, undoLast, type AppPersisted, type Scenario,
} from './store';
import { useMonteCarlo } from './useMonteCarlo';
import { ActionError } from './actions';

export interface Toast { id: number; text: string; kind: 'ok' | 'warn' | 'error' }
interface ConfirmReq { message: string; confirmLabel?: string; danger?: boolean; resolve: (ok: boolean) => void }

interface Ctx {
  ds: Dataset;
  app: AppPersisted;
  setApp: (fn: (a: AppPersisted) => AppPersisted) => void;
  mode: GameMode;
  scenario: Scenario;
  state: ScenarioState;
  view: SeasonView;
  officialView: SeasonView;
  teamName: (id?: TeamId) => string;
  /** Senaryo durumunu değiştirir. label verilirse geri alınabilir. */
  mutate: (label: string | null, fn: (s: ScenarioState) => ScenarioState) => boolean;
  undo: () => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
  confirm: (message: string, opts?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  confirmReq: ConfirmReq | null;
  closeConfirm: (ok: boolean) => void;
  mc: ReturnType<typeof useMonteCarlo>;
  storageError: string | null;
  loadWarnings: string[];
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [{ initial, warnings }] = useState(() => {
    const store = typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {} };
    const { app, warnings } = loadApp(store, bundledDataset);
    return { initial: app, warnings };
  });
  const [app, setAppRaw] = useState<AppPersisted>(initial);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmReq, setConfirmReq] = useState<ConfirmReq | null>(null);
  const ds = app.datasetOverride ?? bundledDataset;
  const mode = app.activeMode;
  const scenario = activeScenario(app, mode);
  const state = scenario.state;

  const setApp = useCallback((fn: (a: AppPersisted) => AppPersisted) => setAppRaw((a) => fn(a)), []);

  // Sayfa yenilemede ilerleme kaybolmasın: her değişiklikten kısa süre sonra kaydet.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setStorageError(persistApp(localStorage, app)), 250);
    return () => window.clearTimeout(saveTimer.current);
  }, [app]);
  useEffect(() => {
    const flush = () => persistApp(localStorage, app);
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [app]);

  const view = useMemo(() => computeSeason(ds, state), [ds, state]);
  const officialView = useMemo(() => computeSeason(ds, state, 'official'), [ds, state]);
  const names = useMemo(() => new Map(ds.teams.map((t) => [t.id, t.name])), [ds]);
  const teamName = useCallback((id?: TeamId) => (id ? names.get(id) ?? id : '—'), [names]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const mutate = useCallback((label: string | null, fn: (s: ScenarioState) => ScenarioState) => {
    try {
      const cur = activeScenario(app, mode);
      const next = fn(cur.state);
      if (next === cur.state) return true;
      setApp((a) => updateScenario(a, mode, cur.id, (s) => (label ? commitChange(s, label, next) : { ...s, state: next })));
      return true;
    } catch (e) {
      toast(e instanceof ActionError ? e.message : `Hata: ${(e as Error).message}`, 'error');
      return false;
    }
  }, [app, mode, setApp, toast]);

  const undo = useCallback(() => {
    const cur = activeScenario(app, mode);
    const last = cur.undo[cur.undo.length - 1];
    if (!last) { toast('Geri alınacak değişiklik yok.', 'warn'); return; }
    setApp((a) => updateScenario(a, mode, cur.id, undoLast));
    toast(`Geri alındı: ${last.label}`);
  }, [app, mode, setApp, toast]);

  const confirm = useCallback((message: string, opts?: { confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setConfirmReq({ message, ...opts, resolve })), []);
  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmReq((r) => { r?.resolve(ok); return null; });
  }, []);

  const mc = useMonteCarlo(ds, state, `${mode}|${scenario.id}`);
  // Skor değiştiğinde olasılıkları otomatik yeniden hesapla (kısa gecikmeyle).
  const runRef = useRef(mc.run);
  runRef.current = mc.run;
  const hashKey = mc.stale || !mc.result ? `${mode}|${scenario.id}|${JSON.stringify([state.results, state.knockout, state.settings, state.overrides, state.mc, state.seed, ds.meta.lastUpdated])}` : 'fresh';
  useEffect(() => {
    if (hashKey === 'fresh') return;
    const t = setTimeout(() => runRef.current(), 700);
    return () => clearTimeout(t);
  }, [hashKey]);

  const value: Ctx = {
    ds, app, setApp, mode, scenario, state, view, officialView, teamName, mutate, undo, toast, toasts,
    confirm, confirmReq, closeConfirm, mc, storageError, loadWarnings: warnings,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider eksik');
  return c;
}
