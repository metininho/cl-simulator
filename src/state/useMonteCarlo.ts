// Monte Carlo'yu Web Worker'da çalıştırır; arayüz donmaz. İptal = worker'ı sonlandırma.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dataset } from '../engine/types';
import type { ScenarioState } from '../engine/season';
import { runMonteCarlo, stateHash, type MonteCarloResult } from '../engine/montecarlo';

export interface McStatus {
  running: boolean;
  done: number;
  total: number;
  error?: string;
  interrupted?: boolean;
}

export function useMonteCarlo(ds: Dataset, state: ScenarioState, scopeKey: string) {
  // Her mod/senaryo için son sonuç ayrı tutulur; başka senaryonun olasılıkları gösterilmez.
  const [cache, setCache] = useState<Record<string, MonteCarloResult>>({});
  const result = cache[scopeKey] ?? null;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const setResult = useCallback((r: MonteCarloResult, scope: string) => setCache((c) => ({ ...c, [scope]: r })), []);
  const [status, setStatus] = useState<McStatus>({ running: false, done: 0, total: 0 });
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const hash = stateHash(ds, state);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setStatus((s) => (s.running ? { ...s, running: false, interrupted: true } : s));
  }, []);

  const run = useCallback(() => {
    workerRef.current?.terminate();
    const id = ++reqId.current;
    const scope = scopeRef.current;
    setStatus({ running: true, done: 0, total: state.mc.iterations });
    let w: Worker | null = null;
    try {
      w = new Worker(new URL('../engine/mc.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      w = null;
    }
    if (!w) {
      // Worker desteklenmiyorsa ana iş parçacığında (daha az iterasyonla) çalıştır.
      setTimeout(() => {
        const r = runMonteCarlo(ds, { ...state, mc: { ...state.mc, iterations: Math.min(state.mc.iterations, 1000) } });
        if (id === reqId.current) { setResult(r, scope); setStatus({ running: false, done: r.completedIterations, total: r.iterations }); }
      }, 10);
      return;
    }
    workerRef.current = w;
    w.onmessage = (e) => {
      if (e.data.id !== id) return;
      if (e.data.type === 'progress') setStatus((s) => ({ ...s, done: e.data.done }));
      else if (e.data.type === 'done') { setResult(e.data.result, scope); setStatus({ running: false, done: e.data.result.completedIterations, total: e.data.result.iterations }); w!.terminate(); workerRef.current = null; }
      else if (e.data.type === 'error') { setStatus({ running: false, done: 0, total: 0, error: e.data.message }); w!.terminate(); workerRef.current = null; }
    };
    w.onerror = (ev) => { setStatus({ running: false, done: 0, total: 0, error: ev.message || 'Worker hatası' }); };
    w.postMessage({ id, ds, state });
  }, [ds, state, setResult]);

  // Senaryo/mod değişince eski sonucu atma: yalnızca "güncel değil" olarak işaretlenir.
  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => { cancel(); setStatus({ running: false, done: 0, total: 0 }); }, [scopeKey, cancel]);

  const stale = !!result && result.stateHash !== hash;
  return { result, status, run, cancel, stale };
}
