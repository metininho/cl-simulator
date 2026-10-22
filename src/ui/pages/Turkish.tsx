import { useMemo, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useSimActions } from '../../state/useSimActions';
import { setManualResult, nextFixtureFor, parseScore } from '../../state/actions';
import { Card, Disclaimer, FormDots, ScoreInput, Stat, StatusBadge, TeamLabel, fmtDate, pct } from '../components';
import { qualificationText } from './Standings';
import { Journey, TieCard } from './Bracket';
import type { TeamId } from '../../engine/types';

function TeamPanel({ team }: { team: TeamId }) {
  const { ds, view, mc, teamName } = useApp();
  const row = view.standings.find((r) => r.team === team)!;
  const p = mc.result?.teams[team];
  const fixtures = ds.fixtures.filter((f) => f.home === team || f.away === team).sort((a, b) => a.matchday - b.matchday);
  const next = nextFixtureFor(ds, view, team);
  const played = fixtures.filter((f) => view.results.has(f.id));
  const remaining = fixtures.filter((f) => !view.results.has(f.id));
  const koTies = view.bracket?.ties.filter((t) => t.teamA === team || t.teamB === team) ?? [];
  const opp = (f: { home: TeamId; away: TeamId }) => (f.home === team ? f.away : f.home);
  return (
    <Card title={<TeamLabel id={team} />} className={`team-panel tp-${team}`}>
      <div className="stats-grid">
        <Stat label="Sıra" value={`${row.position}.`} sub={qualificationText(row, view.math[team], view.complete)} />
        <Stat label="Puan" value={row.points} />
        <Stat label="O / G / B / M" value={`${row.played} / ${row.wins} / ${row.draws} / ${row.losses}`} />
        <Stat label="Gol (A:Y)" value={`${row.goalsFor}:${row.goalsAgainst}`} sub={`Averaj ${row.goalDifference > 0 ? '+' : ''}${row.goalDifference}`} />
        <Stat label="Form" value={<FormDots form={row.form} />} />
        <Stat label="Sıradaki rakip" value={next ? teamName(opp(next)) : '—'} sub={next ? `${next.home === team ? 'İç saha' : 'Deplasman'} · ${next.matchday}. hafta` : 'Lig maçı kalmadı'} />
      </div>
      <h3>Olasılıklar {mc.stale && <small className="muted">(güncelleniyor…)</small>}</h3>
      {p ? (
        <div className="prob-grid">
          <Stat label="Doğrudan Son 16 (ilk 8)" value={pct(p.top8)} />
          <Stat label="Play-off turu (9–24)" value={pct(p.playoff)} />
          <Stat label="Lig aşamasında elenme" value={pct(p.eliminatedLeague)} />
          <Stat label="Son 16'ya kalma" value={pct(p.r16)} />
          <Stat label="Çeyrek final" value={pct(p.qf)} />
          <Stat label="Yarı final" value={pct(p.sf)} />
          <Stat label="Final" value={pct(p.final)} />
          <Stat label="Şampiyonluk" value={pct(p.champion)} />
        </div>
      ) : <p className="muted">Hesaplanıyor…</p>}
      <h3>Önceki sonuçlar</h3>
      <ul className="mini-list">
        {played.map((f) => {
          const r = view.results.get(f.id)!;
          return <li key={f.id}><span>{f.matchday}. h · {f.home === team ? 'İç' : 'Dış'} · {teamName(opp(f))}</span><b>{r.home}-{r.away}</b><StatusBadge status={r.source} /></li>;
        })}
        {!played.length && <li className="muted">Henüz maç yok.</li>}
      </ul>
      <h3>Kalan maçlar</h3>
      <ul className="mini-list">
        {remaining.map((f) => <li key={f.id}><span>{f.matchday}. h · {f.home === team ? 'İç' : 'Dış'} · {teamName(opp(f))}</span><span className="muted small-text">{fmtDate(f.date, f.kickoffCET)}</span></li>)}
        {!remaining.length && <li className="muted">Lig aşaması maçları tamamlandı.</li>}
      </ul>
      {koTies.length > 0 && (
        <>
          <h3>Eleme turları</h3>
          {koTies.map((t) => <TieCard key={t.id} tie={t} />)}
        </>
      )}
      <h3>Turnuva yolculuğu</h3>
      <Journey team={team} />
    </Card>
  );
}

function ScoreEntry() {
  const { ds, view, state, mutate, toast, confirm, undo, scenario, teamName, mc } = useApp();
  const sim = useSimActions();
  const options = useMemo(() => ds.fixtures.filter((f) => ['FB', 'GS'].some((t) => f.home === t || f.away === t)).sort((a, b) => a.matchday - b.matchday), [ds]);
  const firstOpen = options.find((f) => !view.results.has(f.id)) ?? options[0];
  const [sel, setSel] = useState(firstOpen.id);
  const f = options.find((x) => x.id === sel)!;
  const r = view.results.get(f.id);
  const [h, setH] = useState('');
  const [a, setA] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (loadedFor !== sel + (r ? `${r.home}-${r.away}-${r.source}` : '')) {
    setLoadedFor(sel + (r ? `${r.home}-${r.away}-${r.source}` : ''));
    setH(r && r.source !== 'official' ? String(r.home) : '');
    setA(r && r.source !== 'official' ? String(r.away) : '');
  }
  const save = async () => {
    try {
      const hs = parseScore(h), as = parseScore(a);
      if (hs === null || as === null) { toast('Her iki skoru da girin.', 'warn'); return; }
      const prev = state.results[f.id];
      if (prev?.source === 'manual' && (prev.home !== hs || prev.away !== as) && !(await confirm(`Kayıtlı ${prev.home}-${prev.away} sonucu ${hs}-${as} olarak değiştirilsin mi?`, { confirmLabel: 'Değiştir' }))) return;
      if (mutate(`${teamName(f.home)} - ${teamName(f.away)} sonucu`, (s) => setManualResult(ds, s, f.id, hs, as))) toast('Sonuç kaydedildi. Puan durumu yeniden hesaplandı; olasılıklar güncelleniyor.');
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <Card title="Skor girişi — Fenerbahçe & Galatasaray">
      <label className="field">Maç seçin
        <select value={sel} onChange={(e) => setSel(e.target.value)}>
          {options.map((o) => {
            const rr = view.results.get(o.id);
            return <option key={o.id} value={o.id}>{o.matchday}. hafta: {teamName(o.home)} – {teamName(o.away)}{rr ? ` (${rr.home}-${rr.away}, ${rr.source === 'official' ? 'resmi' : rr.source === 'manual' ? 'elle' : 'simüle'})` : ''}</option>;
          })}
        </select>
      </label>
      <div className="entry-row">
        <div className="entry-team"><span className="muted small-text">Ev sahibi</span><TeamLabel id={f.home} /></div>
        <ScoreInput label="Ev sahibi skor" value={r?.source === 'official' ? String(r.home) : h} onChange={setH} disabled={f.status === 'official'} />
        <span className="dash">–</span>
        <ScoreInput label="Deplasman skor" value={r?.source === 'official' ? String(r.away) : a} onChange={setA} disabled={f.status === 'official'} />
        <div className="entry-team"><span className="muted small-text">Deplasman</span><TeamLabel id={f.away} /></div>
      </div>
      <div className="row wrap small-text"><span>{fmtDate(f.date, f.kickoffCET)}</span>{r ? <StatusBadge status={r.source} /> : <StatusBadge status="scheduled" />}</div>
      {f.status === 'official' && <p className="muted small-text">Bu maçın resmi sonucu var; değiştirilemez.</p>}
      <div className="toolbar">
        <button className="btn primary" onClick={save} disabled={f.status === 'official'}>{state.results[f.id]?.source === 'manual' ? 'Sonucu düzenle' : 'Sonucu kaydet'}</button>
        <button className="btn" onClick={undo} disabled={!scenario.undo.length}>↶ Son değişikliği geri al</button>
        <button className="btn" onClick={() => sim.simulateMatchday(f.matchday)}>{f.matchday}. haftanın diğer maçlarını simüle et</button>
        <button className="btn ghost" onClick={() => { mutate(null, (s) => ({ ...s })); toast(`Puan durumu yeniden hesaplandı: ${view.playedCount} maç dahil.`); }}>Puan durumunu yeniden hesapla</button>
        <button className="btn ghost" onClick={() => mc.run()} disabled={mc.status.running}>Olasılıkları yeniden hesapla</button>
      </div>
      <Disclaimer>Puan durumu, takım güçleri ve eleme ağacı her skor değişikliğinde anında yeniden hesaplanır; olasılıklar arka planda Monte Carlo ile güncellenir.</Disclaimer>
    </Card>
  );
}

export function Turkish() {
  const { mc } = useApp();
  const fb = mc.result?.teams.FB;
  const gs = mc.result?.teams.GS;
  return (
    <div className="page">
      <ScoreEntry />
      {fb && gs && (
        <Card title="Fenerbahçe – Galatasaray karşılaştırması">
          <div className="table-wrap">
            <table className="compare">
              <thead><tr><th>Olasılık</th><th><TeamLabel id="FB" /></th><th><TeamLabel id="GS" /></th></tr></thead>
              <tbody>
                {([['İlk 8', 'top8'], ['Play-off', 'playoff'], ['Lig aşamasında elenme', 'eliminatedLeague'], ['Son 16', 'r16'], ['Çeyrek final', 'qf'], ['Yarı final', 'sf'], ['Final', 'final'], ['Şampiyonluk', 'champion']] as const).map(([l, k]) => (
                  <tr key={k}><td>{l}</td><td>{pct(fb[k])}</td><td>{pct(gs[k])}</td></tr>
                ))}
                <tr><td>Ortalama lig sırası</td><td>{fb.avgPosition.toFixed(1).replace('.', ',')}</td><td>{gs.avgPosition.toFixed(1).replace('.', ',')}</td></tr>
                <tr><td>Ortalama puan</td><td>{fb.avgPoints.toFixed(1).replace('.', ',')}</td><td>{gs.avgPoints.toFixed(1).replace('.', ',')}</td></tr>
              </tbody>
            </table>
          </div>
          <Disclaimer>Olasılıklar {mc.result!.completedIterations} Monte Carlo simülasyonundan hesaplanır ve mevcut sonuçlara ile model varsayımlarına bağlıdır; garanti değildir.</Disclaimer>
        </Card>
      )}
      <div className="two-col">
        <TeamPanel team="FB" />
        <TeamPanel team="GS" />
      </div>
    </div>
  );
}
