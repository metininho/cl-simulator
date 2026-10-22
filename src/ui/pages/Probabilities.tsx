import { useMemo, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { Card, Disclaimer, TeamLabel, pct, useDownload } from '../components';
import { TURKISH_TEAMS } from '../../engine/season';
import { toCsv } from '../../state/actions';
import type { TeamProbabilities } from '../../engine/montecarlo';

type Key = keyof Pick<TeamProbabilities, 'top8' | 'playoff' | 'eliminatedLeague' | 'r16' | 'qf' | 'sf' | 'final' | 'champion' | 'avgPosition' | 'avgPoints'>;
const COLS: [Key, string][] = [['top8', 'İlk 8'], ['playoff', 'Play-off'], ['eliminatedLeague', 'Ligde elenme'], ['r16', 'Son 16'], ['qf', 'Çeyrek F.'], ['sf', 'Yarı F.'], ['final', 'Final'], ['champion', 'Şampiyon'], ['avgPoints', 'Ort. puan']];

export function Probabilities() {
  const { mc, state, mutate, teamName, ds } = useApp();
  const [sort, setSort] = useState<Key>('champion');
  const download = useDownload();
  const rows = useMemo(() => (mc.result ? Object.values(mc.result.teams).sort((a, b) => (b[sort] - a[sort]) || a.avgPosition - b.avgPosition) : []), [mc.result, sort]);
  const setIt = (n: number) => mutate(null, (s) => ({ ...s, mc: { ...s.mc, iterations: n } }));
  const pctBar = (v: number, cls = '') => (
    <div className={`cellbar ${cls}`}><div style={{ width: `${Math.min(100, v * 100)}%` }} /><span>{pct(v)}</span></div>
  );
  return (
    <div className="page">
      <Card title="Şampiyonluk Olasılıkları — Monte Carlo" actions={
        <div className="row wrap">
          <label className="field inline">İterasyon
            <select value={state.mc.iterations} onChange={(e) => setIt(Number(e.target.value))}>
              {[500, 1000, 2000, 5000, 10000].map((n) => <option key={n} value={n}>{n.toLocaleString('tr-TR')}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={state.mc.resampleSimulated} onChange={(e) => mutate(null, (s) => ({ ...s, mc: { ...s.mc, resampleSimulated: e.target.checked } }))} />Simüle sonuçları yeniden örnekle</label>
          {mc.status.running ? <button className="btn danger" onClick={mc.cancel}>Durdur</button> : <button className="btn primary" onClick={mc.run}>Yeniden hesapla</button>}
          <button className="btn small" disabled={!mc.result} onClick={() => download('olasiliklar.csv', toCsv([['Kulüp', ...COLS.map((c) => c[1])], ...rows.map((r) => [teamName(r.team), ...COLS.map(([k]) => (k === 'avgPoints' ? r[k].toFixed(2) : (r[k] * 100).toFixed(2) + '%'))])]), 'text/csv;charset=utf-8')}>CSV</button>
        </div>
      }>
        {mc.status.running && (
          <div className="progress"><div style={{ width: `${(mc.status.done / Math.max(1, mc.status.total)) * 100}%` }} /><span>{mc.status.done.toLocaleString('tr-TR')} / {mc.status.total.toLocaleString('tr-TR')} simülasyon</span></div>
        )}
        {mc.status.interrupted && !mc.status.running && <p className="warn-text">Hesaplama durduruldu; gösterilen sonuçlar son tamamlanan hesaplamaya aittir{mc.stale ? ' ve güncel değildir' : ''}.</p>}
        {mc.status.error && <p className="warn-text">Hata: {mc.status.error}</p>}
        {mc.result && (
          <p className="small-text muted">
            {mc.result.completedIterations.toLocaleString('tr-TR')} sezon simülasyonu · {mc.result.durationMs} ms · tohum {mc.result.seed}
            {mc.stale && <b className="warn-text"> · Sonuçlar değişti, yeniden hesaplanıyor…</b>}
          </p>
        )}
        <div className="table-wrap">
          <table className="probs">
            <thead><tr><th>#</th><th>Kulüp</th>{COLS.map(([k, l]) => <th key={k} className="sortable" onClick={() => setSort(k)}>{l}{sort === k ? ' ▼' : ''}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.team} className={TURKISH_TEAMS.includes(r.team) ? 'row-turkish' : ''}>
                  <td>{i + 1}</td><td><TeamLabel id={r.team} /></td>
                  {COLS.map(([k]) => <td key={k}>{k === 'avgPoints' ? r[k].toFixed(1).replace('.', ',') : pctBar(r[k], k === 'champion' ? 'gold' : '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Disclaimer>
          Olasılıklar, mevcut senaryodaki sonuçlara (resmi ve elle girilenler her iterasyonda sabit) ve model varsayımlarına <b>koşulludur</b>.
          {state.mc.resampleSimulated ? ' Simüle edilmiş sonuçlar her iterasyonda yeniden örneklenir.' : ' Simüle edilmiş sonuçlar sabit kabul edilir.'}
          {' '}Takım güçleri her iterasyonda mevcut duruma göre sabittir. Kura çekilmediği için eleme eşleşmeleri her iterasyonda resmi kurallara göre rastgele belirlenir.
          {ds.knockoutDraw ? ' Resmi kura verisi kullanılıyor.' : ''} 0% veya 100% yalnızca hiçbir simülasyonda aksi görülmediğinde yazılır; matematiksel kesinlik anlamına gelmez.
        </Disclaimer>
      </Card>
    </div>
  );
}
