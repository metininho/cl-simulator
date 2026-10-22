import { useMemo, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { zoneForPosition, type StandingRow } from '../../engine/standings';
import { Card, Disclaimer, FormDots, Tabs, TeamLabel, pct, useDownload } from '../components';
import { toCsv } from '../../state/actions';
import { TURKISH_TEAMS } from '../../engine/season';

type SortKey = 'position' | 'played' | 'wins' | 'draws' | 'losses' | 'goalsFor' | 'goalsAgainst' | 'goalDifference' | 'points';

export function qualificationText(row: StandingRow, math: { top8Clinched: boolean; top24Clinched: boolean; top8Impossible: boolean; eliminated: boolean }, complete: boolean) {
  const z = zoneForPosition(row.position);
  if (complete) return z === 'direct' ? 'Son 16 (doğrudan)' : z === 'playoff' ? 'Play-off turu' : 'Elendi';
  if (math.top8Clinched) return 'İlk 8 kesinleşti';
  if (math.eliminated) return 'Matematiksel olarak elendi';
  if (math.top24Clinched && math.top8Impossible) return 'Play-off kesinleşti';
  if (math.top24Clinched) return 'En az play-off kesin';
  const zl = z === 'direct' ? 'Şu an: doğrudan Son 16' : z === 'playoff' ? 'Şu an: play-off' : 'Şu an: eleme hattında';
  return zl;
}

export function StandingsTable({ rows, highlightZones = true, limit, extra }: { rows: StandingRow[]; highlightZones?: boolean; limit?: number; extra?: (r: StandingRow) => React.ReactNode }) {
  const { view } = useApp();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'position', dir: 1 });
  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir || a.position - b.position);
    return limit ? list.slice(0, limit) : list;
  }, [rows, sort, limit]);
  const th = (key: SortKey, label: string, title?: string) => (
    <th title={title} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'position' || key === 'losses' || key === 'goalsAgainst' ? 1 : -1 }))} className="sortable">
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );
  const complete = rows.every((r) => r.played === 8);
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            {th('position', '#', 'Sıra')}<th>Kulüp</th>{th('played', 'O', 'Oynanan')}{th('wins', 'G')}{th('draws', 'B')}{th('losses', 'M')}
            {th('goalsFor', 'AG', 'Atılan gol')}{th('goalsAgainst', 'YG', 'Yenilen gol')}{th('goalDifference', 'AV', 'Averaj')}{th('points', 'P', 'Puan')}
            <th className="hide-sm">Form</th><th className="hide-sm">Durum</th>{extra && <th>Olasılık</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.team} className={`${highlightZones ? `zone-${zoneForPosition(r.position)}` : ''} ${TURKISH_TEAMS.includes(r.team) ? 'row-turkish' : ''}`}>
              <td className="pos">{r.position}{r.tied && !complete ? <sup title="İlk 5 kriterle eşit; lig sürerken eşit sıralı sayılır">=</sup> : null}</td>
              <td><TeamLabel id={r.team} /></td>
              <td>{r.played}</td><td>{r.wins}</td><td>{r.draws}</td><td>{r.losses}</td>
              <td>{r.goalsFor}</td><td>{r.goalsAgainst}</td><td>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
              <td className="pts">{r.points}</td>
              <td className="hide-sm"><FormDots form={r.form} /></td>
              <td className="hide-sm small-text">{qualificationText(r, view.math[r.team] ?? { top8Clinched: false, top24Clinched: false, top8Impossible: false, eliminated: false }, complete)}</td>
              {extra && <td>{extra(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Standings() {
  const { view, officialView, ds, mc, teamName } = useApp();
  const [which, setWhich] = useState<'current' | 'official' | 'projected'>('current');
  const download = useDownload();
  const rows = which === 'official' ? officialView.standings : view.standings;
  const projected = useMemo(() => {
    if (!mc.result) return null;
    return [...ds.teams].map((t) => ({ t: t.id, p: mc.result!.teams[t.id] })).sort((a, b) => a.p.avgPosition - b.p.avgPosition);
  }, [mc.result, ds.teams]);
  const curPos = new Map(view.standings.map((r) => [r.team, r.position]));

  const exportCsv = () => {
    const header = ['Sıra', 'Kulüp', 'O', 'G', 'B', 'M', 'AG', 'YG', 'AV', 'P', 'Form'];
    download(`puan-durumu-${which}.csv`, toCsv([header, ...rows.map((r) => [r.position, teamName(r.team), r.played, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst, r.goalDifference, r.points, r.form.join('')])]), 'text/csv;charset=utf-8');
  };

  return (
    <div className="page">
      <Card title="Puan Durumu — Lig Aşaması" actions={<button className="btn small" onClick={exportCsv}>CSV olarak indir</button>}>
        <Tabs value={which} onChange={setWhich} items={[
          { key: 'official', label: 'Resmi tablo' },
          { key: 'current', label: 'Güncel senaryo tablosu' },
          { key: 'projected', label: 'Beklenen final tablosu' },
        ]} />
        <div className="included">
          {which === 'official' && <span>Dahil edilen: yalnızca <b>{officialView.officialCount}</b> resmi sonuç ({ds.meta.resultsThrough}).</span>}
          {which === 'current' && <span>Dahil edilen: <b>{view.officialCount}</b> resmi + <b>{view.manualCount}</b> elle girilen + <b>{view.simulatedCount}</b> simüle sonuç. Kalan: {144 - view.playedCount} maç.</span>}
          {which === 'projected' && <span>Monte Carlo ortalaması ({mc.result?.completedIterations ?? 0} iterasyon){mc.stale ? ' — güncelleniyor…' : ''}. Bu bir projeksiyondur, gerçek tablo değildir.</span>}
        </div>
        <div className="legend">
          <span className="lg lg-direct">1–8: Doğrudan Son 16</span>
          <span className="lg lg-playoff">9–24: Eleme play-off turu</span>
          <span className="lg lg-out">25–36: Elenir</span>
        </div>
        {which !== 'projected' ? (
          <StandingsTable rows={rows} />
        ) : projected ? (
          <div className="table-wrap">
            <table className="standings">
              <thead><tr><th>Beklenen sıra</th><th>Kulüp</th><th>Ort. sıra</th><th>Ort. puan</th><th>Şu anki sıra</th><th>Fark</th><th>İlk 8</th><th>Play-off</th><th>Elenme</th></tr></thead>
              <tbody>
                {projected.map(({ t, p }, i) => {
                  const now = curPos.get(t)!;
                  const diff = now - (i + 1);
                  return (
                    <tr key={t} className={`zone-${zoneForPosition(i + 1)} ${TURKISH_TEAMS.includes(t) ? 'row-turkish' : ''}`}>
                      <td className="pos">{i + 1}</td><td><TeamLabel id={t} /></td><td>{p.avgPosition.toFixed(1).replace('.', ',')}</td><td>{p.avgPoints.toFixed(1).replace('.', ',')}</td>
                      <td>{now}</td><td className={diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}>{diff > 0 ? `▲${diff}` : diff < 0 ? `▼${-diff}` : '–'}</td>
                      <td>{pct(p.top8)}</td><td>{pct(p.playoff)}</td><td>{pct(p.eliminatedLeague)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">Olasılıklar hesaplanıyor…</p>}
        <Disclaimer>
          Sıralama UEFA kriterlerine göre: puan, averaj, atılan gol, deplasmanda atılan gol, galibiyet, deplasman galibiyeti
          {view.complete ? ', rakiplerin topladığı puan, rakiplerin averajı, rakiplerin attığı gol, (disiplin puanı — veri yok, atlandı), kulüp katsayısı (vekil sıra).' : '. Lig sürerken yalnızca bu kriterler uygulanır; hâlâ eşit takımlar "=" ile işaretlenir ve alfabetik dizilir.'}
          {' '}“Kesinleşti” yalnızca puan hesabıyla matematiksel olarak garanti olduğunda yazılır.
        </Disclaimer>
      </Card>
    </div>
  );
}
