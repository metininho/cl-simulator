import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useSimActions } from '../../state/useSimActions';
import { FixtureCard } from '../FixtureCard';
import { Card, Disclaimer, Tabs } from '../components';
import { isTurkishFixture } from '../../engine/season';

export function Matches() {
  const { ds, view, state, mode, mutate, undo, scenario } = useApp();
  const sim = useSimActions();
  const md = state.currentMatchday;
  const [filter, setFilter] = useState<'all' | 'turkish' | 'open'>('all');
  const setMd = (n: number) => mutate(null, (s) => ({ ...s, currentMatchday: n }));
  const fixtures = ds.fixtures.filter((f) => f.matchday === md)
    .filter((f) => filter === 'all' || (filter === 'turkish' ? isTurkishFixture(f) : !view.results.has(f.id)))
    .sort((a, b) => Number(isTurkishFixture(b)) - Number(isTurkishFixture(a)) || (a.date ?? '').localeCompare(b.date ?? ''));
  const all = ds.fixtures.filter((f) => f.matchday === md);
  const done = all.filter((f) => view.results.has(f.id)).length;
  const turkishPending = all.filter((f) => isTurkishFixture(f) && !view.results.has(f.id));

  return (
    <div className="page">
      <Card title="Lig Aşaması — Maçlar" actions={<button className="btn small ghost" onClick={undo} disabled={!scenario.undo.length}>↶ Son değişikliği geri al</button>}>
        <Tabs
          value={md}
          onChange={setMd}
          items={Array.from({ length: 8 }, (_, i) => {
            const n = i + 1;
            const fx = ds.fixtures.filter((f) => f.matchday === n);
            const c = fx.filter((f) => view.results.has(f.id)).length;
            return { key: n, label: <span>{n}. Hafta <small className={c === fx.length ? 'ok' : 'muted'}>{c}/{fx.length}</small></span> };
          })}
        />
        <div className="toolbar">
          {mode === 'A' ? (
            <>
              <button className="btn primary" onClick={() => sim.simulateMatchday(md)} disabled={done === all.length}>Diğer Maçları Simüle Et</button>
              {turkishPending.length > 0 && <span className="hint">Önce FB/GS sonucunu girin ({turkishPending.map((f) => `${f.home}-${f.away}`).join(', ')}); diğer maçlar yine de simüle edilebilir.</span>}
            </>
          ) : (
            <button className="btn primary" onClick={() => sim.simulateMatchday(md)} disabled={done === all.length}>Haftanın Oynanmamış Maçlarını Simüle Et</button>
          )}
          <button className="btn" onClick={() => sim.rerunMatchday(md)}>Haftayı Yeniden Simüle Et</button>
          <button className="btn" onClick={() => sim.simulateRemainingLeague()}>Kalan Tüm Lig Maçlarını Simüle Et</button>
          <button className="btn ghost" disabled={md >= 8} onClick={() => setMd(md + 1)}>Sonraki haftaya geç →</button>
        </div>
        <div className="row between">
          <span className="muted small-text">{md}. hafta: {done}/{all.length} maç sonuçlandı.</span>
          <Tabs value={filter} onChange={setFilter} items={[{ key: 'all', label: 'Tümü' }, { key: 'turkish', label: 'FB & GS' }, { key: 'open', label: 'Oynanmamış' }]} />
        </div>
        <Disclaimer>
          Mor/kesikli çerçeveli skorlar <b>simülasyondur</b>, gerçek sonuç değildir. Kilitli (🔒) skorlar resmi sonuçlardır ve değiştirilemez.
          {mode === 'A' ? ' Mod A: yalnızca Fenerbahçe ve Galatasaray maçlarının skorunu siz girersiniz.' : ' Mod B: tüm maçların skorunu siz girersiniz; simülasyon isteğe bağlıdır.'}
        </Disclaimer>
      </Card>
      <div className="fixture-grid">
        {fixtures.map((f) => <FixtureCard key={f.id} f={f} />)}
        {!fixtures.length && <p className="muted">Bu filtreyle gösterilecek maç yok.</p>}
      </div>
    </div>
  );
}
