import { useMemo, useRef, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { Card, Disclaimer, InlineEdit, StatusBadge, useDownload } from '../components';
import { compareWithReference, diffOfficialResults, validateSchedule } from '../../engine/validation';
import { bundledDataset, parseDatasetFile, urlProvider, checkDataset } from '../../data/provider';
import {
  addScenario, deleteScenario, duplicateScenario, exportApp, importApp, newScenario, renameScenario, restoreVersion, saveVersion, switchScenario, updateScenario,
} from '../../state/store';
import { resetManual, resetSimulated, toCsv } from '../../state/actions';
import { overriddenEntries } from '../../engine/season';
import type { Dataset } from '../../engine/types';

function DataSource() {
  const { ds, app } = useApp();
  const ref = useMemo(() => compareWithReference(ds), [ds]);
  const sched = useMemo(() => validateSchedule(ds), [ds]);
  const official = ds.fixtures.filter((f) => f.status === 'official').length;
  const notes = ds.fixtures.filter((f) => f.note);
  return (
    <Card title="Veri kaynağı ve doğrulama">
      <dl className="kv">
        <dt>Sezon</dt><dd>{ds.competition} {ds.season}</dd>
        <dt>Son veri güncellemesi</dt><dd data-testid="last-updated">{new Date(ds.meta.lastUpdated).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })}</dd>
        <dt>Sonuçlar</dt><dd>{ds.meta.resultsThrough} — {official} resmi sonuç, {ds.fixtures.length - official} oynanmamış maç</dd>
        <dt>Alınma şekli</dt><dd><b>{ds.meta.retrieval === 'automatic' ? 'Otomatik' : 'Elle içe aktarıldı / derlendi'}</b>{app.datasetOverride ? ' (kullanıcı tarafından içe aktarılan veri seti etkin)' : ' (uygulamayla gelen veri seti)'}<br /><small className="muted">{ds.meta.retrievalNote}</small></dd>
        <dt>Kaynaklar</dt>
        <dd><ul>{ds.meta.sources.map((s) => <li key={s.name}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : s.name}</li>)}</ul></dd>
      </dl>
      <h3>Doğrulama</h3>
      <ul className="checks">
        {sched.map((i, k) => <li key={k} className={`chk-${i.level}`}>{i.level === 'info' ? '✓' : '✗'} {i.message}</li>)}
        {ds.referenceStandings ? (
          ref.mismatches.length === 0
            ? <li className="chk-info">✓ Resmi sonuçlardan hesaplanan tablo, yayınlanmış referans tabloyla ({ds.referenceStandings.asOf}) {ref.checked} değerde birebir uyumlu.</li>
            : ref.mismatches.map((m, k) => <li key={k} className="chk-error">✗ Uyuşmazlık: {m.team} {m.field} — referans {m.expected}, hesaplanan {m.actual}. Veri kontrol edilmeli.</li>)
        ) : <li className="chk-warning">! Referans resmi tablo yok; hesaplanan tablo doğrulanamadı.</li>}
        {ds.referenceStandings && <li className="chk-warning">! {ds.referenceStandings.note}</li>}
      </ul>
      <h3>Eksik veya doğrulanmamış bilgiler</h3>
      <ul className="checks">{ds.meta.unverified.map((u) => <li key={u} className="chk-warning">! {u}</li>)}</ul>
      {notes.length > 0 && (
        <>
          <h3>Kaynaklar arası çelişki notları</h3>
          <ul className="checks">{notes.map((f) => <li key={f.id} className="chk-warning">! {f.id} ({f.home}-{f.away}): {f.note}</li>)}</ul>
        </>
      )}
      <Disclaimer>Eksik veriler uydurulmaz. Canlı UEFA veri bağlantısı yoktur; güncel sonuçları aşağıdan JSON/CSV içe aktararak ekleyebilirsiniz.</Disclaimer>
    </Card>
  );
}

function DatasetImport() {
  const { ds, app, setApp, toast, confirm } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const download = useDownload();
  const apply = async (candidate: Dataset, issues: { level: string; message: string }[]) => {
    const errors = issues.filter((i) => i.level === 'error');
    const diff = diffOfficialResults(ds, candidate);
    const manualConflicts = (['A', 'B'] as const).flatMap((m) => app.modes[m].scenarios.flatMap((s) =>
      candidate.fixtures.filter((f) => f.status === 'official' && s.state.results[f.id]?.source === 'manual').map((f) => `Mod ${m} / ${s.name}: ${f.id}`)));
    const msg = [
      `Yeni veri seti: ${candidate.fixtures.filter((f) => f.status === 'official').length} resmi sonuç, son güncelleme ${candidate.meta.lastUpdated}.`,
      errors.length ? `Fikstür doğrulama UYARILARI (${errors.length}):\n- ${errors.slice(0, 5).map((e) => e.message).join('\n- ')}` : 'Fikstür yapısı doğrulandı.',
      diff.changed.length ? `Mevcut RESMİ sonuçlarla ÇAKIŞMA (${diff.changed.length}):\n- ${diff.changed.slice(0, 8).map((c) => `${c.id}: ${c.before} → ${c.after}`).join('\n- ')}` : 'Mevcut resmi sonuçlarla çakışma yok.',
      diff.missing.length ? `Yeni veri setinde bulunmayan maçlar: ${diff.missing.length}` : '',
      manualConflicts.length ? `Elle girdiğiniz ${manualConflicts.length} sonuç artık resmi sonuçla gölgelenecek (silinmez, ama resmi sonuç geçerli olur):\n- ${manualConflicts.slice(0, 6).join('\n- ')}` : '',
      'Veri seti uygulansın mı?',
    ].filter(Boolean).join('\n\n');
    if (!(await confirm(msg, { confirmLabel: 'Veri setini uygula', danger: diff.changed.length > 0 || manualConflicts.length > 0 }))) return;
    setApp((a) => ({ ...a, datasetOverride: candidate }));
    toast('Yeni resmi veri seti uygulandı; tüm hesaplamalar yenilendi.');
  };
  const onFile = async (file: File) => {
    const text = await file.text();
    const r = parseDatasetFile(file.name, text, ds);
    if (!r.dataset) { toast(`Veri seti reddedildi: ${r.issues.map((i) => i.message).slice(0, 3).join(' · ')}`, 'error'); return; }
    await apply(r.dataset, r.issues);
  };
  const fromUrl = async () => {
    try {
      const d = await urlProvider(url).load();
      const r = checkDataset(d);
      if (!r.dataset) { toast(`Veri seti reddedildi: ${r.issues.map((i) => i.message).slice(0, 3).join(' · ')}`, 'error'); return; }
      await apply(r.dataset, r.issues);
    } catch (e) { toast(`URL'den veri alınamadı: ${(e as Error).message}`, 'error'); }
  };
  return (
    <Card title="Resmi veri setini güncelle (içe aktar)">
      <p className="small-text">JSON (bu uygulamanın veri seti biçimi) veya CSV (sütunlar: <code>id, matchday, date, kickoff, home, away, status, home_score, away_score</code>; durum: official / scheduled / postponed) yükleyebilirsiniz. Uygulamanın yeniden derlenmesi gerekmez.</p>
      <div className="row wrap">
        <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <button className="btn" onClick={() => fileRef.current?.click()}>Dosyadan veri seti yükle</button>
        <button className="btn ghost" onClick={() => download('ucl-2026-27-veri-seti.json', JSON.stringify(ds, null, 2), 'application/json')}>Etkin veri setini indir (JSON)</button>
        <button className="btn ghost" onClick={() => download('ucl-2026-27-fikstur.csv', toCsv([['id', 'matchday', 'date', 'kickoff', 'home', 'away', 'status', 'home_score', 'away_score'], ...ds.fixtures.map((f) => [f.id, f.matchday, f.date, f.kickoffCET, f.home, f.away, f.status, f.score?.home, f.score?.away])]), 'text/csv;charset=utf-8')}>Fikstür şablonunu indir (CSV)</button>
      </div>
      <div className="row wrap">
        <input className="text-input grow" placeholder="https://… (CORS destekli JSON veri seti adresi)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Veri seti URL" />
        <button className="btn" disabled={!/^https?:\/\//.test(url)} onClick={fromUrl}>URL'den al</button>
      </div>
      <div className="row wrap">
        <button className="btn danger" disabled={!app.datasetOverride} onClick={async () => {
          if (!(await confirm('Uygulamayla gelen orijinal resmi veri setine dönülsün mü? Senaryolarınız silinmez.', { confirmLabel: 'Orijinal veriyi geri yükle' }))) return;
          setApp((a) => ({ ...a, datasetOverride: null }));
          toast('Orijinal resmi veri seti geri yüklendi.');
        }}>Orijinal resmi veriyi geri yükle</button>
        <span className="muted small-text">Orijinal veri seti: {bundledDataset.meta.resultsThrough}, güncelleme {new Date(bundledDataset.meta.lastUpdated).toLocaleString('tr-TR')}</span>
      </div>
    </Card>
  );
}

function ScenarioManager() {
  const { ds, app, setApp, mode, scenario, toast, confirm, mutate, state, view, teamName } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const download = useDownload();
  const slot = app.modes[mode];
  const [newName, setNewName] = useState('');
  const shadowed = overriddenEntries(ds, state);

  const exportResults = () => {
    const rows = ds.fixtures.map((f) => {
      const r = view.results.get(f.id);
      return [f.id, f.matchday, f.date, teamName(f.home), teamName(f.away), r?.home ?? '', r?.away ?? '', r ? (r.source === 'official' ? 'Resmi' : r.source === 'manual' ? 'Elle' : 'Simüle') : 'Oynanmadı'];
    });
    download(`mac-sonuclari-mod${mode}.csv`, toCsv([['Maç', 'Hafta', 'Tarih', 'Ev sahibi', 'Deplasman', 'Ev', 'Dep', 'Durum'], ...rows]), 'text/csv;charset=utf-8');
  };
  const onImport = async (file: File) => {
    try {
      const { app: imported, warnings } = importApp(JSON.parse(await file.text()), ds);
      const msg = `Kayıt dosyası içe aktarılsın mı?\n\nMevcut tüm senaryoların (Mod A ve Mod B) yerini alır. Öncesinde mevcut durumu dışa aktarmanız önerilir.${warnings.length ? `\n\nUyarılar:\n- ${warnings.join('\n- ')}` : ''}`;
      if (!(await confirm(msg, { confirmLabel: 'İçe aktar', danger: true }))) return;
      setApp(() => ({ ...imported, datasetOverride: imported.datasetOverride ?? app.datasetOverride }));
      toast('Kayıt içe aktarıldı.');
    } catch (e) { toast(`İçe aktarılamadı: ${(e as Error).message}`, 'error'); }
  };

  return (
    <Card title={`Senaryolar — Mod ${mode}`}>
      <p className="small-text muted">Her modun senaryoları ayrı saklanır. Mod A'daki bir değişiklik Mod B'yi etkilemez. Durum tarayıcınızda (localStorage) otomatik kaydedilir.</p>
      <ul className="scenario-list">
        {slot.scenarios.map((s) => (
          <li key={s.id} className={s.id === scenario.id ? 'active' : ''}>
            <div>
              <b>{s.name}</b> {s.id === scenario.id && <span className="pill">etkin</span>}
              <div className="muted small-text">Güncelleme: {new Date(s.updatedAt).toLocaleString('tr-TR')} · {Object.keys(s.state.results).length} senaryo sonucu · tohum {s.state.seed}</div>
            </div>
            <div className="row wrap">
              {s.id !== scenario.id && <button className="btn small" onClick={() => setApp((a) => switchScenario(a, mode, s.id))}>Aç</button>}
              <InlineEdit value={s.name} label="Yeniden adlandır" onSave={(v) => setApp((a) => renameScenario(a, mode, s.id, v))} />
              <button className="btn small ghost" onClick={() => { setApp((a) => duplicateScenario(a, mode, s.id)); toast('Senaryo çoğaltıldı.'); }}>Çoğalt</button>
              <button className="btn small ghost danger-text" onClick={async () => {
                if (await confirm(`"${s.name}" senaryosu kalıcı olarak silinsin mi?`, { danger: true, confirmLabel: 'Sil' })) setApp((a) => deleteScenario(a, mode, s.id, ds));
              }}>Sil</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="row wrap">
        <input className="text-input" placeholder="Yeni senaryo adı" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Yeni senaryo adı" />
        <button className="btn primary" onClick={() => { setApp((a) => addScenario(a, mode, newScenario(ds, newName.trim() || `Senaryo ${slot.scenarios.length + 1}`))); setNewName(''); toast('Yeni senaryo oluşturuldu.'); }}>Yeni senaryo</button>
      </div>

      <h3>Sürümler — {scenario.name}</h3>
      <div className="row wrap">
        <button className="btn" onClick={() => { setApp((a) => updateScenario(a, mode, scenario.id, (s) => saveVersion(s, `Elle kaydedilen sürüm`))); toast('Sürüm kaydedildi.'); }}>Mevcut durumu sürüm olarak kaydet</button>
      </div>
      <ul className="mini-list">
        {scenario.versions.map((v) => (
          <li key={v.id}><span>{v.label} · {new Date(v.savedAt).toLocaleString('tr-TR')} · {Object.keys(v.state.results).length} sonuç</span>
            <button className="btn tiny" onClick={async () => {
              if (await confirm('Bu sürüm geri yüklensin mi? Mevcut durum otomatik olarak yedek sürüm şeklinde saklanır.', { confirmLabel: 'Geri yükle' })) {
                setApp((a) => updateScenario(a, mode, scenario.id, (s) => restoreVersion(s, v.id)));
                toast('Sürüm geri yüklendi.');
              }
            }}>Geri yükle</button></li>
        ))}
        {!scenario.versions.length && <li className="muted">Kayıtlı sürüm yok.</li>}
      </ul>

      <h3>Sıfırlama</h3>
      <div className="row wrap">
        <button className="btn" onClick={async () => {
          const n = Object.values(state.results).filter((r) => r.source === 'simulated').length + Object.values(state.knockout).filter((r) => r.source === 'simulated').length;
          if (!n) { toast('Silinecek simüle sonuç yok.', 'warn'); return; }
          if (await confirm(`${n} simüle sonuç (lig + eleme) silinecek. Resmi ve elle girilen sonuçlar korunur.`, { confirmLabel: 'Simüle sonuçları sıfırla' })) {
            setApp((a) => updateScenario(a, mode, scenario.id, (s) => saveVersion(s, 'Sıfırlama öncesi otomatik yedek')));
            mutate('Simüle sonuçları sıfırla', resetSimulated);
          }
        }}>Yalnızca simüle sonuçları sıfırla</button>
        <button className="btn danger" onClick={async () => {
          const n = Object.values(state.results).filter((r) => r.source === 'manual').length + Object.values(state.knockout).filter((r) => r.source === 'manual').length;
          if (!n) { toast('Silinecek elle girilmiş sonuç yok.', 'warn'); return; }
          if (await confirm(`DİKKAT: Elle girdiğiniz ${n} sonuç silinecek. Resmi sonuçlar korunur. Devam edilsin mi?`, { danger: true, confirmLabel: 'Elle girilenleri sil' })) {
            setApp((a) => updateScenario(a, mode, scenario.id, (s) => saveVersion(s, 'Sıfırlama öncesi otomatik yedek')));
            mutate('Elle girilen sonuçları sıfırla', resetManual);
          }
        }}>Elle girilen sonuçları sıfırla</button>
      </div>
      {shadowed.length > 0 && <p className="warn-text small-text">{shadowed.length} maç için senaryoda kayıt var ama artık resmi sonuç mevcut; resmi sonuç geçerli (örn. {shadowed[0].fixture.id} <StatusBadge status="official" />).</p>}

      <h3>Tohum (tekrar üretilebilirlik)</h3>
      <div className="row wrap">
        <label className="field inline">Rastgele tohum
          <input className="num-input wide" type="number" value={state.seed} aria-label="Tohum" onChange={(e) => { const n = Math.floor(Number(e.target.value)); if (Number.isFinite(n) && n > 0) mutate(null, (s) => ({ ...s, seed: n })); }} />
        </label>
        <span className="muted small-text">Aynı tohum + aynı sonuçlar = aynı simülasyon. Tohumu değiştirmek mevcut simüle skorları değiştirmez; yeniden simülasyonları etkiler.</span>
      </div>

      <h3>Dışa / içe aktar</h3>
      <div className="row wrap">
        <button className="btn" onClick={() => download(`ucl-simulator-kayit-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(exportApp(app, ds), null, 1), 'application/json')}>Tüm durumu JSON olarak dışa aktar</button>
        <button className="btn ghost" onClick={() => download(`senaryo-${scenario.name}.json`, JSON.stringify({ kind: 'scenario', mode, scenario }, null, 1), 'application/json')}>Yalnızca bu senaryoyu dışa aktar</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
        <button className="btn" onClick={() => fileRef.current?.click()}>JSON kayıt içe aktar</button>
        <button className="btn ghost" onClick={exportResults}>Maç sonuçlarını CSV indir</button>
      </div>
    </Card>
  );
}

export function DataSettings() {
  const { storageError, loadWarnings } = useApp();
  return (
    <div className="page">
      {storageError && <p className="warn-text">{storageError}</p>}
      {loadWarnings.map((w) => <p key={w} className="warn-text">{w}</p>)}
      <DataSource />
      <ScenarioManager />
      <DatasetImport />
    </div>
  );
}
