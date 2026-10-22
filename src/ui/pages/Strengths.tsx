import { useState } from 'react';
import { useApp } from '../../state/AppContext';
import { Card, Disclaimer, TeamLabel, ProbBar, pct } from '../components';
import { DEFAULT_SETTINGS } from '../../engine/ratings';
import { predict } from '../../engine/model';
import type { ModelSettings, TeamId, TeamRatingOverride } from '../../engine/types';

const SETTINGS: { key: keyof ModelSettings; label: string; step: number; min: number; max: number; help: string }[] = [
  { key: 'baseGoals', label: 'Temel gol beklentisi (takım/maç)', step: 0.05, min: 0.8, max: 2.2, help: 'Tarafsız sahada eşit güçteki bir takımın beklenen golü.' },
  { key: 'homeAdvantage', label: 'Ev sahibi avantajı (ev xG, log)', step: 0.01, min: 0, max: 0.4, help: 'Ev sahibinin gol beklentisini artırır.' },
  { key: 'awayPenalty', label: 'Deplasman etkisi (dep. xG, log)', step: 0.01, min: -0.4, max: 0, help: 'Deplasman takımının gol beklentisini azaltır.' },
  { key: 'eloScale', label: 'Elo → gol ölçeği', step: 0.0002, min: 0.001, max: 0.006, help: 'Güç farkının gol beklentisine etkisi.' },
  { key: 'dixonColesRho', label: 'Dixon-Coles ρ', step: 0.01, min: -0.2, max: 0.1, help: 'Negatif değer 0-0 ve 1-1 skorlarını biraz artırır.' },
  { key: 'formWindow', label: 'Form penceresi (son N maç)', step: 1, min: 1, max: 10, help: 'Formda dikkate alınan maç sayısı (yakın maçlar daha ağırlıklı).' },
  { key: 'formWeight', label: 'Form ağırlığı', step: 0.05, min: 0, max: 1, help: '0 = form yok sayılır.' },
  { key: 'eloK', label: 'Elo K katsayısı', step: 1, min: 0, max: 60, help: 'Sezon içi sonuçların güce etkisi.' },
];

export function Strengths() {
  const { ds, view, state, mutate, toast, teamName } = useApp();
  const [a, setA] = useState<TeamId>('FB');
  const [b, setB] = useState<TeamId>('GS');
  const setOv = (t: TeamId, k: keyof TeamRatingOverride, v: number) => mutate(null, (s) => ({ ...s, overrides: { ...s.overrides, [t]: { ...s.overrides[t], [k]: v } } }));
  const rows = [...ds.teams].sort((x, y) => view.ratings[y.id].effectiveElo - view.ratings[x.id].effectiveElo);
  const p = a !== b ? predict(a, b, view.ratings, state.settings) : null;
  return (
    <div className="page">
      <Card title="Takım Güçleri" actions={<button className="btn small ghost" onClick={() => { mutate('Güç düzeltmelerini sıfırla', (s) => ({ ...s, overrides: {} })); toast('Elle düzeltmeler sıfırlandı.'); }}>Elle düzeltmeleri sıfırla</button>}>
        <Disclaimer>
          Bu değerler <b>resmi istatistik değildir</b>. Başlangıç Elo'su UEFA kulüp katsayısı sırasının vekili olarak torba sırasından türetilir
          (1850'den başlayıp her sırada −9). Ardından bu sezonun Şampiyonlar Ligi sonuçlarıyla rakip gücü ve gol farkına göre güncellenir.
          Form; son {state.settings.formWindow} maçta atılan/yenilen gollerin model beklentisinden sapmasıdır (lig ortalamasına göre).
          xG, yurt içi lig formu ve kadro/sakatlık verisi bu veri setinde <b>yoktur</b>; gerekirse aşağıdan elle düzeltme yapabilirsiniz.
          {!state.settings.formUsesSimulated && ' Formda yalnızca resmi ve elle girilen sonuçlar kullanılır.'}
        </Disclaimer>
        <div className="table-wrap">
          <table className="strengths">
            <thead><tr><th>#</th><th>Kulüp</th><th>Torba</th><th>Başlangıç Elo</th><th>Güncel Elo</th><th>Form (hücum)</th><th>Form (savunma)</th><th>Elo düzeltme</th><th>Hücum düz.</th><th>Savunma düz.</th></tr></thead>
            <tbody>
              {rows.map((t, i) => {
                const r = view.ratings[t.id];
                const ov = state.overrides[t.id] ?? {};
                return (
                  <tr key={t.id} className={['FB', 'GS'].includes(t.id) ? 'row-turkish' : ''}>
                    <td>{i + 1}</td><td><TeamLabel id={t.id} /></td><td>{t.pot}</td><td>{Math.round(r.baseElo)}</td>
                    <td><b>{Math.round(r.effectiveElo)}</b> <small className={r.elo - r.baseElo >= 0 ? 'pos' : 'neg'}>({r.elo - r.baseElo >= 0 ? '+' : ''}{Math.round(r.elo - r.baseElo)})</small></td>
                    <td className={r.attackForm >= 0 ? 'pos' : 'neg'}>{r.attackForm.toFixed(2)}</td>
                    <td className={r.defenseForm >= 0 ? 'pos' : 'neg'}>{r.defenseForm.toFixed(2)}</td>
                    <td><input className="num-input" type="number" step={10} value={ov.eloAdjust ?? 0} aria-label={`${t.name} Elo düzeltme`} onChange={(e) => setOv(t.id, 'eloAdjust', Number(e.target.value) || 0)} /></td>
                    <td><input className="num-input" type="number" step={0.05} value={ov.attackAdjust ?? 0} aria-label={`${t.name} hücum düzeltme`} onChange={(e) => setOv(t.id, 'attackAdjust', Number(e.target.value) || 0)} /></td>
                    <td><input className="num-input" type="number" step={0.05} value={ov.defenseAdjust ?? 0} aria-label={`${t.name} savunma düzeltme`} onChange={(e) => setOv(t.id, 'defenseAdjust', Number(e.target.value) || 0)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="two-col">
        <Card title="Model parametreleri" actions={<button className="btn small ghost" onClick={() => mutate('Model ayarlarını sıfırla', (s) => ({ ...s, settings: { ...DEFAULT_SETTINGS } }))}>Varsayılana dön</button>}>
          {SETTINGS.map((x) => (
            <label key={x.key} className="field">
              <span>{x.label}: <b>{String(state.settings[x.key])}</b></span>
              <input type="range" min={x.min} max={x.max} step={x.step} value={Number(state.settings[x.key])}
                onChange={(e) => mutate(null, (s) => ({ ...s, settings: { ...s.settings, [x.key]: Number(e.target.value) } }))} />
              <small className="muted">{x.help}</small>
            </label>
          ))}
          <label className="check"><input type="checkbox" checked={state.settings.formUsesSimulated} onChange={(e) => mutate(null, (s) => ({ ...s, settings: { ...s.settings, formUsesSimulated: e.target.checked } }))} />Form ve Elo hesabında simüle sonuçları da kullan</label>
          <Disclaimer>Parametre değişiklikleri zaten simüle edilmiş skorları değiştirmez; yeni simülasyonları ve olasılıkları etkiler. Mevcut simüle sonuçları yeni ayarlarla görmek için "Farklı tohumla yeniden oynat" veya haftayı yeniden simüle edin.</Disclaimer>
        </Card>
        <Card title="Maç tahmini önizleme">
          <div className="row wrap">
            <select value={a} onChange={(e) => setA(e.target.value)} aria-label="Ev sahibi">{ds.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <span>–</span>
            <select value={b} onChange={(e) => setB(e.target.value)} aria-label="Deplasman">{ds.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </div>
          {p ? (
            <>
              <p>{teamName(a)} xG <b>{p.lambdaHome.toFixed(2)}</b> – <b>{p.lambdaAway.toFixed(2)}</b> {teamName(b)} · En olası skor {p.mostLikely.home}-{p.mostLikely.away} ({pct(p.mostLikely.p)})</p>
              <ProbBar h={p.pHome} d={p.pDraw} a={p.pAway} />
              <ul className="factors">{p.factors.map((f) => <li key={f.label}><span>{f.label}</span><span className={f.value >= 0 ? 'pos' : 'neg'}>{f.value >= 0 ? '+' : ''}{f.value.toFixed(2)}</span></li>)}</ul>
            </>
          ) : <p className="muted">İki farklı takım seçin.</p>}
        </Card>
      </div>
    </div>
  );
}
