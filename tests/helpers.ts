import raw from '../src/data/season-2026-27.json';
import type { Dataset } from '../src/engine/types';
import { DEFAULT_SETTINGS } from '../src/engine/ratings';
import type { ScenarioState } from '../src/engine/season';

export const dataset = raw as unknown as Dataset;

export function freshState(seed = 12345): ScenarioState {
  return {
    results: {}, knockout: {}, seed, drawSalt: 0, settings: { ...DEFAULT_SETTINGS }, overrides: {},
    currentMatchday: 4, mc: { iterations: 300, resampleSimulated: true },
  };
}
