import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useSimActions } from '../../state/useSimActions';
import { STAGES, STAGE_LABEL, type Tie } from '../../engine/knockout';
import { isUserControlled, validateKnockoutEntry, TURKISH_TEAMS } from '../../engine/season';
import { setKnockoutResult, clearKnockoutResult, removeOrphanKnockout } from '../../state/actions';
import { Card, Disclaimer, ScoreInput, StatusBadge, TeamLabel } from '../components';
import type { TeamId } from '../../engine/types';

function LegEditor({ tie, li, onDone }: { tie: Tie; li: number; onDone: () => void }) {
  const { mutate, toast, confirm } = useApp();
  const leg = tie.legs[li];
  const r = leg.result;
  const s = (n?: number) => (n === undefined ? '' : String(n));
  const [v, setV] = useState({ h: s(r?.home), a: s(r?.away), eh: s(r?.etHome), ea: s(r?.etAway), ph: s(r?.penHome), pa: s(r?.penAway) });
  const isLast = li === tie.legs.length - 1;
  const num = (x: string) => (x === '' ? undefined : Number(x));
  const save = async () => {
    const entry = { home: num(v.h)!, away: num(v.a)!, etHome: num(v.eh), etAway: num(v.ea), penHome: num(v.ph), penAway: num(v.pa) };
    const err = validateKnockoutEntry(tie, li, entry);
    if (err) { toast(err, 'error'); return; }
    if (r?.source === 'manual' && !(await confirm('Elle girilmiş bu eleme sonucunu değiştirmek istiyor musunuz?', { confirmLabel: 'Değiştir' }))) return;
    // Sonraki ayak zaten girilmişse, toplam skor değişebileceği için onu da kontrol et
    mutate(`${leg.home}-${leg.away} eleme sonucu`, (st) => {
      let next = setKnockoutResult(st, leg.key, entry);
      if (!isLast) {
        const k2 = tie.legs[1].key;
        if (next.knockout[k2]?.source === 'simulated') next = clearKnockoutResult(next, k2);
      }
      return next;
    });
    toast('Eleme sonucu kaydedildi.');
    onDone();
  };
  return (
    <div className="leg-editor">
      <div className="row"><span className="lbl">90 dk</span><ScoreInput label="Ev sahibi gol" value={v.h} onChange={(x) => setV({ ...v, h: x })} /> – <ScoreInput label="Deplasman gol" value={v.a} onChange={(x) => setV({ ...v, a: x })} /></div>
      {isLast && (
        <>
          <div className="row"><span className="lbl">Uzatma (ek gol)</span><ScoreInput label="Uzatma ev" value={v.eh} onChange={(x) => setV({ ...v, eh: x })} /> – <ScoreInput label="Uzatma deplasman" value={v.ea} onChange={(x) => setV({ ...v, ea: x })} /></div>
          <div className="row"><span className="lbl">Penaltılar</span><ScoreInput label="Penaltı ev" value={v.ph} onChange={(x) => setV({ ...v, ph: x })} /> – <ScoreInput label="Penaltı deplasman" value={v.pa} onChange={(x) => setV({ ...v, pa: x })} /></div>
          <p className="muted small-text">Uzatma ve penaltı alanlarını yalnızca toplam skor eşitse doldurun.</p>
        </>
      )}
      <div className="row"><button className="btn small primary" onClick={save}>Kaydet</button><button className="btn small" onClick={onDone}>İptal</button></div>
    </div>
  );
}

export function TieCard({ tie, focus }: { tie: Tie; focus?: TeamId[] }) {
  const { mode, mutate, confirm, ds } = useApp();
  const [editing, setEditing] = useState<number | null>(null);
  const known = !!tie.teamA && !!tie.teamB;
  const controlled = known && isUserControlled(mode, { home: tie.teamA, away: tie.teamB });
  const hl = (focus ?? TURKISH_TEAMS).some((t) => t === tie.teamA || t === tie.teamB);
  const legName = (i: number) => (tie.stage === 'F' ? 'Final (tarafsız saha)' : i === 0 ? '1. maç' : 'Rövanş');
  const draw = ds.knockoutDraw ? 'resmi kura' : 'kura simülasyonu';
  return (
    <div className={`tie ${hl ? 'tie-hl' : ''} ${tie.winner ? 'tie-done' : ''}`} data-tie={tie.id}>
      <div className="tie-head"><span>{tie.label}</span>{tie.stage !== 'F' && <span className="muted small-text">{tie.stage === 'PO' || tie.stage === 'R16' ? draw : 'kurasız eşleşme'}</span>}</div>
      {[{ t: tie.teamA, ph: tie.placeholderA }, { t: tie.teamB, ph: tie.placeholderB }].map(({ t, ph }, i) => (
        <div key={i} className={`tie-team ${tie.winner && tie.winner === t ? 'winner' : ''} ${tie.loser && tie.loser === t ? 'loser' : ''}`}>
          <TeamLabel id={t} placeholder={ph} />
          {tie.aggregate && known && <span className="agg">{i === 0 ? tie.aggregate.home : tie.aggregate.away}</span>}
        </div>
      ))}
      {known && (
        <div className="legs">
          {tie.legs.map((l, i) => (
            <div key={l.key} className="leg">
              <span className="muted small-text">{legName(i)}: {l.home} – {l.away}</span>
              {l.result ? (
                <span className={`leg-score src-${l.result.source}`}>
                  {l.result.home}-{l.result.away}
                  {l.result.etHome !== undefined && <> (uzt. {l.result.home + l.result.etHome}-{l.result.away + l.result.etAway!})</>}
                  {l.result.penHome !== undefined && <> · pen. {l.result.penHome}-{l.result.penAway}</>}
                  {' '}<StatusBadge status={l.result.source} />
                </span>
              ) : <span className="muted small-text">oynanmadı</span>}
              {controlled && editing !== i && (i === 0 || tie.legs[0].result) && (
                <button className="btn tiny ghost" onClick={() => setEditing(i)}>{l.result ? 'Düzenle' : 'Skor gir'}</button>
              )}
              {l.result && (controlled || l.result.source === 'simulated') && editing !== i && (
                <button className="btn tiny ghost" onClick={async () => {
                  if (l.result!.source === 'manual' && !(await confirm('Elle girilen eleme sonucu silinsin mi?', { danger: true, confirmLabel: 'Sil' }))) return;
                  mutate('Eleme sonucunu sil', (s) => clearKnockoutResult(s, l.key));
                }}>Sil</button>
              )}
              {editing === i && <LegEditor tie={tie} li={i} onDone={() => setEditing(null)} />}
            </div>
          ))}
        </div>
      )}
      {tie.problem && <div className="warn-text small-text">{tie.problem}</div>}
      {tie.winner && <div className="tie-result small-text">Tur atlayan: <b><TeamLabel id={tie.winner} /></b>{tie.decidedBy === 'extraTime' ? ' (uzatmada)' : tie.decidedBy === 'penalties' ? ' (penaltılarla)' : ''}</div>}
    </div>
  );
}

export function Journey({ team }: { team: TeamId }) {
  const { view, teamName } = useApp();
  const row = view.standings.find((r) => r.team === team)!;
  const b = view.bracket;
  const steps: { label: string; detail: string; state: 'done' | 'out' | 'pending' }[] = [];
  steps.push({ label: 'Lig aşaması', detail: view.complete ? `${row.position}. sıra, ${row.points} puan` : `Şu an ${row.position}. sıra, ${row.points} puan (${row.played}/8 maç)`, state: view.complete ? (row.position <= 24 ? 'done' : 'out') : 'pending' });
  if (view.complete && row.position > 24) steps[0].detail += ' — lig aşamasında elendi';
  if (b) {
    for (const t of b.ties.filter((x) => x.teamA === team || x.teamB === team)) {
      const opp = t.teamA === team ? t.teamB : t.teamA;
      const agg = t.aggregate ? (t.teamA === team ? `${t.aggregate.home}-${t.aggregate.away}` : `${t.aggregate.away}-${t.aggregate.home}`) : '';
      steps.push({
        label: STAGE_LABEL[t.stage],
        detail: `Rakip: ${teamName(opp)}${agg ? ` · Toplam ${agg}` : ''}${t.winner ? (t.winner === team ? ' — tur atladı' : ` — ${teamName(t.winner)} tarafından elendi`) : ' — oynanmadı'}`,
        state: t.winner ? (t.winner === team ? 'done' : 'out') : 'pending',
      });
    }
    if (b.champion === team) steps.push({ label: 'Şampiyon', detail: '🏆 UEFA Şampiyonlar Ligi şampiyonu', state: 'done' });
  }
  return (
    <ol className="journey">
      {steps.map((s, i) => <li key={i} className={`j-${s.state}`}><b>{s.label}</b><span>{s.detail}</span></li>)}
    </ol>
  );
}

export function Bracket() {
  const { view, ds, mutate, toast, teamName, state } = useApp();
  const sim = useSimActions();
  const b = view.bracket;
  return (
    <div className="page">
      <Card title="Turnuva Ağacı" actions={
        <div className="row wrap">
          <button className="btn primary" onClick={() => sim.knockoutStep('next')} disabled={!b}>Sıradaki turu simüle et</button>
          <button className="btn" onClick={() => sim.knockoutStep('all')} disabled={!b}>Kalan tüm eleme maçlarını simüle et</button>
          <button className="btn" onClick={() => sim.simulateWholeSeason()}>Tüm turnuvayı finale kadar simüle et</button>
          <button className="btn ghost" onClick={() => sim.rerunKnockout()} disabled={!b}>Eleme aşamasını yeniden oynat</button>
          <button className="btn ghost" onClick={() => sim.redraw()} disabled={!b || !!ds.knockoutDraw}>Kurayı yeniden çek</button>
          <button className="btn ghost" onClick={() => sim.newSeedReplay()}>Farklı tohumla yeniden oynat</button>
        </div>
      }>
        {!b ? (
          <>
            <p>Eleme ağacı lig aşaması tamamlandığında (144 maçın hepsi sonuçlandığında) resmi kurallara göre kurulur. Şu an {view.playedCount}/144 maç sonuçlandı.</p>
            <p className="muted">Eşleşmeler henüz belli olmadığı için rakipler gösterilmiyor; yalnızca eşleşme yolları aşağıdadır.</p>
            <StructureInfo />
          </>
        ) : (
          <>
            {b.champion ? (
              <div className="champion" data-testid="champion"><span>🏆 Şampiyon</span><TeamLabel id={b.champion} /></div>
            ) : <p className="muted">Şampiyon henüz belli değil.</p>}
            <div className="row wrap small-text">
              <span>Kura: {b.draw.official ? 'Resmi kura verisi kullanılıyor.' : `Resmi kura henüz çekilmedi — eşleşmeler resmi kurallara uygun, senaryo tohumundan üretilmiş kura ile belirlendi (kura no. ${state.drawSalt + 1}).`}</span>
              {view.orphanKnockoutKeys.length > 0 && (
                <span className="warn-text">Lig sonuçları değiştiği için {view.orphanKnockoutKeys.length} eleme sonucu artık hiçbir eşleşmeye uymuyor (korunuyor ama kullanılmıyor).{' '}
                  <button className="btn tiny" onClick={() => { mutate('Geçersiz eleme sonuçlarını temizle', (s) => removeOrphanKnockout(s, view.orphanKnockoutKeys)); toast('Temizlendi.'); }}>Temizle</button>
                </span>
              )}
            </div>
            <div className="bracket">
              {STAGES.map((st) => (
                <div key={st} className="bracket-col">
                  <h3>{STAGE_LABEL[st]}</h3>
                  {([1, 2, 0] as const).map((h) => {
                    const ties = b.ties.filter((t) => t.stage === st && (st === 'PO' ? t.half === h : t.half === h));
                    if (!ties.length) return null;
                    return (
                      <div key={h} className="bracket-half">
                        {h !== 0 && <div className="half-label">{h}. yarı</div>}
                        {ties.map((t) => <TieCard key={t.id} tie={t} />)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
        <Disclaimer>
          Simüle edilen eleme sonuçları gerçek değildir. Kurallar: Play-off 9–16 ↔ 17–24 (rövanş seri başında), Son 16'da ilk 8 rövanşı evinde oynar,
          çeyrek ve yarı finalde rövanş lig aşamasında üstte bitirenin evindedir, deplasman golü yoktur, eşitlikte 30 dk uzatma ve penaltılar. Final tek maçtır.
        </Disclaimer>
      </Card>
      <div className="two-col">
        {(['FB', 'GS'] as const).map((t) => (
          <Card key={t} title={`${teamName(t)} — Turnuva yolculuğu`}>
            <Journey team={t} />
          </Card>
        ))}
      </div>
    </div>
  );
}

function StructureInfo() {
  return (
    <ul className="structure">
      <li><b>Play-off I:</b> 9./10. ↔ 23./24. → Son 16'da 7./8. ile</li>
      <li><b>Play-off II:</b> 11./12. ↔ 21./22. → Son 16'da 5./6. ile</li>
      <li><b>Play-off III:</b> 13./14. ↔ 19./20. → Son 16'da 3./4. ile</li>
      <li><b>Play-off IV:</b> 15./16. ↔ 17./18. → Son 16'da 1./2. ile</li>
      <li><b>Çeyrek final:</b> (1/2 yolu) ↔ (7/8 yolu), (3/4 yolu) ↔ (5/6 yolu); 1. ve 2. sıra ağacın farklı yarılarında.</li>
      <li><b>Yarı final ve final:</b> kura yok, ağaçtaki yol izlenir.</li>
    </ul>
  );
}
