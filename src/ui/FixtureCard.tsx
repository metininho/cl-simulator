import { useEffect, useState } from 'react';
import type { Fixture } from '../engine/types';
import { useApp } from '../state/AppContext';
import { isUserControlled, predictFixture } from '../engine/season';
import { setManualResult, clearResult, parseScore } from '../state/actions';
import { useSimActions } from '../state/useSimActions';
import { ProbBar, ScoreInput, StatusBadge, TeamLabel, fmtDate, pct } from './components';

export function FixtureCard({ f, compact = false }: { f: Fixture; compact?: boolean }) {
  const { view, state, mode, mutate, ds, confirm, toast } = useApp();
  const sim = useSimActions();
  const r = view.results.get(f.id);
  const entry = state.results[f.id];
  const editable = f.status !== 'official' && isUserControlled(mode, f);
  const [h, setH] = useState(r && r.source !== 'official' ? String(r.home) : '');
  const [a, setA] = useState(r && r.source !== 'official' ? String(r.away) : '');
  const [showFactors, setShowFactors] = useState(false);
  useEffect(() => {
    setH(r && r.source !== 'official' ? String(r.home) : '');
    setA(r && r.source !== 'official' ? String(r.away) : '');
  }, [r?.home, r?.away, r?.source]); // eslint-disable-line react-hooks/exhaustive-deps

  const pred = f.status !== 'official' ? predictFixture(f, view.ratings, state.settings) : null;
  const status = r ? r.source : f.status === 'postponed' ? 'postponed' : f.date ? 'scheduled' : 'unplayed';
  const dirty = editable && (h !== (r && r.source !== 'official' ? String(r.home) : '') || a !== (r && r.source !== 'official' ? String(r.away) : ''));

  const save = async () => {
    try {
      const hs = parseScore(h), as = parseScore(a);
      if (hs === null || as === null) { toast('Her iki skoru da girin.', 'warn'); return; }
      if (entry?.source === 'manual' && (entry.home !== hs || entry.away !== as)) {
        if (!(await confirm(`Daha önce elle girdiğiniz ${entry.home}-${entry.away} sonucu ${hs}-${as} olarak değiştirilsin mi?`, { confirmLabel: 'Değiştir' }))) return;
      }
      if (mutate(`${f.home}-${f.away} sonucu`, (s) => setManualResult(ds, s, f.id, hs, as))) toast('Sonuç kaydedildi; puan durumu ve olasılıklar güncellendi.');
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const clear = async () => {
    if (entry?.source === 'manual' && !(await confirm('Elle girilen sonuç silinsin mi? Maç "oynanmadı" durumuna döner.', { confirmLabel: 'Sil', danger: true }))) return;
    mutate('Sonucu sil', (s) => clearResult(ds, s, f.id));
  };

  return (
    <div className={`fixture ${r ? `fx-${r.source}` : 'fx-open'} ${compact ? 'compact' : ''}`} data-fixture={f.id}>
      <div className="fx-meta">
        <span>{f.matchday}. hafta · {fmtDate(f.date, f.kickoffCET)}</span>
        <StatusBadge status={status} />
      </div>
      <div className="fx-main">
        <div className="fx-team home"><TeamLabel id={f.home} /><span className="elo">Elo {Math.round(view.ratings[f.home].effectiveElo)}</span></div>
        <div className="fx-score">
          {editable ? (
            <>
              <ScoreInput label={`${f.home} gol`} value={h} onChange={setH} />
              <span className="dash">–</span>
              <ScoreInput label={`${f.away} gol`} value={a} onChange={setA} />
            </>
          ) : r ? (
            <span className={`final-score src-${r.source}`}>{r.home} – {r.away}</span>
          ) : (
            <span className="final-score empty">– : –</span>
          )}
        </div>
        <div className="fx-team away"><TeamLabel id={f.away} /><span className="elo">Elo {Math.round(view.ratings[f.away].effectiveElo)}</span></div>
      </div>
      {f.note && <div className="fx-note">Veri notu: {f.note}</div>}
      {pred && !compact && (
        <div className="fx-pred">
          <div className="row between small-text">
            <span>Model tahmini: en olası skor <b>{pred.mostLikely.home}-{pred.mostLikely.away}</b> ({pct(pred.mostLikely.p)}) · xG {pred.lambdaHome.toFixed(2)} – {pred.lambdaAway.toFixed(2)}</span>
            <button className="linkish" onClick={() => setShowFactors((x) => !x)}>{showFactors ? 'Etkenleri gizle' : 'Etkenler'}</button>
          </div>
          <ProbBar h={pred.pHome} d={pred.pDraw} a={pred.pAway} />
          <div className="row between small-text muted"><span>Ev {pct(pred.pHome)}</span><span>Beraberlik {pct(pred.pDraw)}</span><span>Deplasman {pct(pred.pAway)}</span></div>
          {showFactors && (
            <ul className="factors">
              {pred.factors.map((x) => (
                <li key={x.label}><span>{x.label}</span><span className={x.value >= 0 ? 'pos' : 'neg'}>{x.value >= 0 ? '+' : ''}{x.value.toFixed(2)} (log-gol, ev lehine)</span></li>
              ))}
              <li className="muted">Bu bir model tahminidir, kesin sonuç değildir.</li>
            </ul>
          )}
        </div>
      )}
      {f.status !== 'official' && (
        <div className="fx-actions">
          {editable && <button className="btn small primary" disabled={!dirty || h === '' || a === ''} onClick={save}>Sonucu kaydet</button>}
          {entry && <button className="btn small ghost" onClick={clear}>Sonucu sil</button>}
          {!r && <button className="btn small" onClick={() => sim.simulateMatch(f.id)}>Bu maçı simüle et</button>}
          {r?.source === 'simulated' && <button className="btn small" onClick={() => sim.simulateMatch(f.id, true)}>Yeniden simüle et</button>}
          {r?.source === 'manual' && mode === 'B' && <button className="btn small ghost" onClick={() => sim.simulateMatch(f.id)}>Simülasyonla değiştir</button>}
          {!editable && mode === 'A' && <span className="muted small-text">Mod A: bu maç otomatik simüle edilir.</span>}
        </div>
      )}
    </div>
  );
}
