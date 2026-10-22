// Veri sağlayıcı arayüzü: resmi veri kaynağı uygulamadan bağımsız değiştirilebilir.
// Şu an uygulanan sağlayıcılar: paketle gelen veri seti, dosyadan içe aktarma (JSON/CSV), URL'den JSON.
// Canlı UEFA API entegrasyonu YOKTUR (herkese açık, anahtarsız bir resmi API bulunmuyor; anahtar istemci koduna konmamalı).

import bundled from './season-2026-27.json';
import type { Dataset } from '../engine/types';
import { validateDatasetShape, validateSchedule, type ValidationIssue } from '../engine/validation';
import { datasetFromCsv } from '../state/actions';

export interface DataProvider {
  id: string;
  label: string;
  load(): Promise<Dataset>;
}

export const bundledDataset = bundled as unknown as Dataset;

export const bundledProvider: DataProvider = {
  id: 'bundled',
  label: 'Uygulamayla gelen veri seti',
  load: async () => structuredClone(bundledDataset),
};

export function urlProvider(url: string): DataProvider {
  return {
    id: 'url',
    label: `URL: ${url}`,
    async load() {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Sunucu ${res.status} döndürdü.`);
      return (await res.json()) as Dataset;
    },
  };
}

export interface DatasetCheck {
  dataset?: Dataset;
  issues: ValidationIssue[];
}

/** İçe aktarılacak veri setini doğrular; yapısal hata varsa veri seti döndürülmez. */
export function checkDataset(candidate: unknown): DatasetCheck {
  const issues = validateDatasetShape(candidate);
  if (issues.some((i) => i.level === 'error')) return { issues };
  const ds = candidate as Dataset;
  const sched = validateSchedule(ds);
  return { dataset: ds, issues: [...issues, ...sched] };
}

export function parseDatasetFile(name: string, text: string, current: Dataset): DatasetCheck {
  if (name.toLowerCase().endsWith('.csv')) {
    const { dataset, errors } = datasetFromCsv(current, text);
    if (errors.length) return { issues: errors.map((message) => ({ level: 'error' as const, message })) };
    dataset.meta = { ...dataset.meta, lastUpdated: new Date().toISOString(), retrieval: 'manual', retrievalNote: `CSV dosyasından elle içe aktarıldı (${name}).` };
    return checkDataset(dataset);
  }
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { issues: [{ level: 'error', message: 'Dosya geçerli JSON değil.' }] }; }
  return checkDataset(json);
}
