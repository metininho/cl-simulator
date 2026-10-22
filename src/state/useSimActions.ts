// Arayüzdeki simülasyon düğmelerinin ortak mantığı. Resmi ve elle girilmiş sonuçlar asla sessizce değiştirilmez.
import { useCallback } from 'react';
import { useApp } from './AppContext';
import { computeSeason, isTurkishFixture, simulateFixtures, simulateKnockout, type ScenarioState } from '../engine/season';
import { randomSeed } from '../engine/rng';
import { clearResult, replayWithNewSeed } from './actions';
import { STAGE_LABEL, type Stage } from '../engine/knockout';

export function useSimActions() {
  const { ds, state, mode, mutate, toast, confirm, view } = useApp();

  /** Mod A'da sonucu girilmemiş FB/GS maçları varsa kullanıcıya sorar. */
  const askTurkish = useCallback(async (ids: string[]): Promise<boolean | null> => {
    if (mode !== 'A') return false;
    const pending = ds.fixtures.filter((f) => ids.includes(f.id) && isTurkishFixture(f) && !view.results.has(f.id));
    if (!pending.length) return false;
    const ok = await confirm(
      `Fenerbahçe/Galatasaray'ın sonucu girilmemiş ${pending.length} maçı var.\n\n` +
      `"Bunları da simüle et" derseniz bu maçlar SİMÜLE sonuç olarak işaretlenir (sonradan elle değiştirebilirsiniz).\n` +
      `"Vazgeç" derseniz yalnızca diğer maçlar simüle edilir.`,
      { confirmLabel: 'Bunları da simüle et' },
    );
    return ok;
  }, [mode, ds, view, confirm]);

  const simulateIds = useCallback(async (ids: string[], label: string, opts: { rerun?: boolean; askTurkish?: boolean; advanceFrom?: number } = {}) => {
    const includeUserControlled = opts.askTurkish ? !!(await askTurkish(ids)) : false;
    let count = 0;
    mutate(label, (s) => {
      const r = simulateFixtures(ds, s, ids, { mode, rerun: opts.rerun, includeUserControlled });
      count = r.simulated.length;
      const md = opts.advanceFrom;
      if (md !== undefined && md < 8) {
        const v = computeSeason(ds, r.state);
        if (ds.fixtures.filter((f) => f.matchday === md).every((f) => v.results.has(f.id))) return { ...r.state, currentMatchday: md + 1 };
      }
      return r.state;
    });
    toast(count ? `${label}: ${count} maç simüle edildi. Resmi ve elle girilen sonuçlar korundu.` : 'Simüle edilecek uygun maç yok (resmi/elle girilmiş veya zaten simüle edilmiş).', count ? 'ok' : 'warn');
    return count;
  }, [askTurkish, mutate, ds, mode, toast]);

  const simulateMatchday = useCallback((md: number) => simulateIds(ds.fixtures.filter((f) => f.matchday === md).map((f) => f.id), `${md}. hafta simülasyonu`, { advanceFrom: md }), [simulateIds, ds]);

  const rerunMatchday = useCallback(async (md: number) => {
    const ids = ds.fixtures.filter((f) => f.matchday === md && state.results[f.id]?.source === 'simulated').map((f) => f.id);
    if (!ids.length) { toast('Bu haftada yeniden oynatılacak simüle maç yok.', 'warn'); return; }
    if (!(await confirm(`${md}. haftadaki ${ids.length} simüle maç yeniden oynatılacak. Resmi ve elle girilen sonuçlar değişmez.`, { confirmLabel: 'Yeniden simüle et' }))) return;
    await simulateIds(ids, `${md}. hafta yeniden simülasyonu`, { rerun: true });
  }, [ds, state, confirm, simulateIds, toast]);

  const simulateRemainingLeague = useCallback(() => simulateIds(ds.fixtures.map((f) => f.id), 'Lig aşamasının kalanı', { askTurkish: true }), [simulateIds, ds]);

  const simulateMatch = useCallback(async (id: string, rerun = false) => {
    const f = ds.fixtures.find((x) => x.id === id)!;
    const cur = state.results[id];
    if (cur?.source === 'manual') {
      if (!(await confirm('Bu maç için ELLE girdiğiniz bir sonuç var. Silinip yerine simülasyon sonucu yazılsın mı?', { confirmLabel: 'Evet, simüle et', danger: true }))) return;
      mutate('Elle sonucu simülasyonla değiştir', (s) => simulateFixtures(ds, clearResult(ds, s, id), [id], { mode, includeUserControlled: true }).state);
      return;
    }
    mutate(rerun ? 'Maçı yeniden simüle et' : 'Maçı simüle et', (s) => simulateFixtures(ds, s, [id], { mode, rerun, includeUserControlled: mode === 'B' || isTurkishFixture(f) }).state);
  }, [ds, state, confirm, mutate, mode]);

  const knockoutStep = useCallback(async (kind: 'next' | 'all', untilStage?: Stage) => {
    if (!view.complete) { toast('Önce lig aşamasının tüm maçları tamamlanmalı.', 'warn'); return; }
    let info = { simulated: 0, blocked: [] as string[] };
    mutate(kind === 'next' ? 'Sıradaki turu simüle et' : 'Eleme turlarını simüle et', (s) => {
      const r = simulateKnockout(ds, s, { mode, nextRoundOnly: kind === 'next', untilStage });
      info = { simulated: r.simulated, blocked: r.blockedByUser };
      return r.state;
    });
    if (info.blocked.length) toast(`Fenerbahçe/Galatasaray eşleşmesinin sonucunu girmeniz bekleniyor (${info.blocked.length} eşleşme). Diğer maçlar simüle edildi.`, 'warn');
    else if (info.simulated) toast(`${info.simulated} eleme maçı simüle edildi.`);
    else toast('Simüle edilecek eleme maçı yok.', 'warn');
  }, [view.complete, mutate, ds, mode, toast]);

  /** Tek tıkla tüm sezon: önce lig kalanı, sonra eleme turları (resmi + elle girilenler korunur). */
  const simulateWholeSeason = useCallback(async () => {
    const includeUserControlled = !!(await askTurkish(ds.fixtures.map((f) => f.id)));
    let info = { league: 0, ko: 0, blocked: 0 };
    mutate('Tüm sezon simülasyonu', (s) => {
      const r1 = simulateFixtures(ds, s, ds.fixtures.map((f) => f.id), { mode, includeUserControlled });
      let next: ScenarioState = r1.state;
      if (computeSeason(ds, next).complete) {
        const r2 = simulateKnockout(ds, next, { mode, includeUserControlled });
        next = r2.state;
        info = { league: r1.simulated.length, ko: r2.simulated, blocked: r2.blockedByUser.length };
      } else info = { league: r1.simulated.length, ko: 0, blocked: 0 };
      return next;
    });
    if (info.blocked) toast(`Lig: ${info.league}, eleme: ${info.ko} maç simüle edildi. Bir FB/GS eşleşmesi sonucunuzu bekliyor.`, 'warn');
    else toast(`Lig: ${info.league}, eleme: ${info.ko} maç simüle edildi. Resmi ve elle girilen sonuçlar korundu.`);
  }, [askTurkish, ds, mutate, mode, toast]);

  const rerunKnockout = useCallback(async () => {
    if (!(await confirm('Simüle edilmiş tüm eleme maçları yeniden oynatılacak. Elle girilen eleme sonuçları korunur.', { confirmLabel: 'Yeniden oynat' }))) return;
    let n = 0;
    mutate('Eleme aşamasını yeniden oynat', (s) => { const r = simulateKnockout(ds, s, { mode, rerun: true }); n = r.simulated; return r.state; });
    toast(`${n} eleme maçı yeniden simüle edildi.`);
  }, [confirm, mutate, ds, mode]);

  const newSeedReplay = useCallback(async () => {
    if (!(await confirm('Yeni bir rastgele tohumla tüm SİMÜLE sonuçlar (lig + eleme) silinip yeniden oynatılacak.\nResmi ve elle girilen sonuçlar korunur.', { confirmLabel: 'Yeni tohumla oynat' }))) return;
    const seed = randomSeed();
    let n = 0;
    mutate(`Yeni tohum (${seed})`, (s) => {
      const r = replayWithNewSeed(ds, s, seed, mode);
      n = r.count;
      return r.state;
    });
    toast(`Yeni tohum ${seed}: ${n} maç yeniden simüle edildi.`);
  }, [confirm, mutate, ds, mode, toast]);

  const redraw = useCallback(async () => {
    if (ds.knockoutDraw) { toast('Resmi kura verisi mevcut; kura yeniden çekilemez.', 'warn'); return; }
    if (!(await confirm('Eleme kurası (çift içi eşleşmeler ve ağaç yarıları) yeniden çekilecek. Yeni eşleşmelere uymayan eleme sonuçları geçersiz kalır.', { confirmLabel: 'Kurayı yeniden çek' }))) return;
    mutate('Kurayı yeniden çek', (s) => ({ ...s, drawSalt: s.drawSalt + 1 }));
  }, [ds, confirm, mutate, toast]);

  return { simulateIds, simulateMatchday, rerunMatchday, simulateRemainingLeague, simulateMatch, knockoutStep, simulateWholeSeason, rerunKnockout, newSeedReplay, redraw, stageLabel: STAGE_LABEL };
}
