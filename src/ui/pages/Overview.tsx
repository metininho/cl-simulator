import { useApp } from '../../state/AppContext';
import { useSimActions } from '../../state/useSimActions';
import { nextFixtureFor, currentLeagueMatchday } from '../../state/actions';
import { Card, Disclaimer, Stat, TeamLabel, pct } from '../components';
import { StandingsTable } from './Standings';
import { FixtureCard } from '../FixtureCard';
import { STAGE_LABEL } from '../../engine/knockout';
import type { TeamId } from '../../engine/types';

function RoadToFinal() {
  const { view, mc, teamName } = useApp();
  const b = view.bracket;
  const stages = [
    { label: 'Lig aşaması', done: view.complete, text: view.complete ? 'Tamamlandı' : `${view.playedCount}/144 maç` },
    ...(['PO', 'R16', 'QF', 'SF', 'F'] as const).map((s) => {
      const ties = b?.ties.filter((t) => t.stage === s) ?? [];
      const done = ties.length > 0 && ties.every((t) => t.winner);
      return { label: STAGE_LABEL[s], done, text: !b ? 'Belli değil' : done ? 'Tamamlandı' : `${ties.filter((t) => t.winner).length}/${ties.length} eşleşme` };
    }),
  ];
  const fav = mc.result ? Object.values(mc.result.teams).sort((a, b) => b.champion - a.champion).slice(0, 5) : [];
  return (
    <div>
      <ol className="road">
        {stages.map((s) => <li key={s.label} className={s.done ? 'done' : ''}><b>{s.label}</b><span>{s.text}</span></li>)}
      </ol>
      {b?.champion && <div className="champion"><span>🏆 Şampiyon (bu senaryoda)</span><TeamLabel id={b.champion} /></div>}
      {fav.length > 0 && (
        <p className="small-text">Şampiyonluk favorileri (model): {fav.map((f) => `${teamName(f.team)} ${pct(f.champion)}`).join(' · ')}</p>
      )}
    </div>
  );
}

function NextFixture({ team }: { team: TeamId }) {
  const { ds, view, mc } = useApp();
  const f = nextFixtureFor(ds, view, team);
  const p = mc.result?.teams[team];
  const row = view.standings.find((r) => r.team === team)!;
  return (
    <Card title={<span>Sıradaki maç — <TeamLabel id={team} /></span>}>
      <div className="row wrap small-text">
        <span>{row.position}. sıra · {row.points} puan · averaj {row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</span>
        {p && <span>İlk 8: <b>{pct(p.top8)}</b> · Play-off: <b>{pct(p.playoff)}</b> · Elenme: <b>{pct(p.eliminatedLeague)}</b> · Şampiyonluk: <b>{pct(p.champion)}</b></span>}
      </div>
      {f ? <FixtureCard f={f} compact /> : <p className="muted">Lig aşaması maçı kalmadı.</p>}
    </Card>
  );
}

export function Overview({ go }: { go: (p: string) => void }) {
  const { ds, view, state, mode, mc } = useApp();
  const sim = useSimActions();
  const leagueMd = currentLeagueMatchday(ds, state);
  return (
    <div className="page">
      <div className="hero">
        <div>
          <h1>UEFA Şampiyonlar Ligi 2026/27</h1>
          <p className="muted">{mode === 'A' ? 'Mod A — Fenerbahçe ve Galatasaray skorlarını siz girersiniz; diğer maçlar model ile simüle edilir.' : 'Mod B — Tüm maçların skorunu siz kontrol edersiniz; simülasyon isteğe bağlıdır.'}</p>
        </div>
        <div className="row wrap">
          <button className="btn primary" onClick={() => sim.simulateMatchday(leagueMd)}>{leagueMd}. haftayı simüle et</button>
          <button className="btn" onClick={() => sim.simulateRemainingLeague()}>Ligin kalanını simüle et</button>
          <button className="btn" onClick={() => sim.simulateWholeSeason()}>Tüm sezonu tek tıkla simüle et</button>
        </div>
      </div>
      <div className="stats-grid">
        <Stat label="Güncel hafta" value={view.complete ? 'Lig bitti' : `${leagueMd}. hafta`} sub={ds.meta.resultsThrough + ' resmi sonuç'} />
        <Stat label="Tamamlanan maç" value={`${view.playedCount} / 144`} sub={`${view.officialCount} resmi · ${view.manualCount} elle · ${view.simulatedCount} simüle`} />
        <Stat label="Kalan lig maçı" value={144 - view.playedCount} />
        <Stat label="Olasılıklar" value={mc.status.running ? 'Hesaplanıyor…' : mc.result ? `${mc.result.completedIterations} simülasyon` : '—'} sub={!mc.result || mc.stale ? 'güncelleniyor' : 'güncel'} />
      </div>
      <div className="two-col">
        <NextFixture team="FB" />
        <NextFixture team="GS" />
      </div>
      <div className="two-col">
        <Card title="Güncel puan durumu (ilk 12)" actions={<button className="btn small ghost" onClick={() => go('standings')}>Tamamı →</button>}>
          <StandingsTable rows={view.standings} limit={12} />
          <p className="small-text muted">Fenerbahçe: {view.standings.find((r) => r.team === 'FB')!.position}. · Galatasaray: {view.standings.find((r) => r.team === 'GS')!.position}.</p>
        </Card>
        <Card title="Finale giden yol" actions={<button className="btn small ghost" onClick={() => go('bracket')}>Turnuva ağacı →</button>}>
          <RoadToFinal />
        </Card>
      </div>
      <Disclaimer>Resmi sonuçlar {ds.meta.resultsThrough} itibarıyla. Son veri güncellemesi: {new Date(ds.meta.lastUpdated).toLocaleString('tr-TR')} ({ds.meta.retrieval === 'manual' ? 'elle derlendi' : 'otomatik'}). Ayrıntılar: Veri ve Ayarlar.</Disclaimer>
    </div>
  );
}
