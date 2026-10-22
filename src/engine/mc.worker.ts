/// <reference lib="webworker" />
import { runMonteCarlo } from './montecarlo';
import type { Dataset } from './types';
import type { ScenarioState } from './season';

self.onmessage = (e: MessageEvent<{ id: number; ds: Dataset; state: ScenarioState }>) => {
  const { id, ds, state } = e.data;
  try {
    const result = runMonteCarlo(ds, state, { onProgress: (done) => self.postMessage({ id, type: 'progress', done }), chunk: 200 });
    self.postMessage({ id, type: 'done', result });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: (err as Error).message });
  }
};
