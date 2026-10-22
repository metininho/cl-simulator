import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import { ConfirmDialog, Toasts } from './ui/components';
import { Overview } from './ui/pages/Overview';
import { Matches } from './ui/pages/Matches';
import { Standings } from './ui/pages/Standings';
import { Turkish } from './ui/pages/Turkish';
import { Bracket } from './ui/pages/Bracket';
import { Probabilities } from './ui/pages/Probabilities';
import { Strengths } from './ui/pages/Strengths';
import { DataSettings } from './ui/pages/DataSettings';
import { switchScenario } from './state/store';

const PAGES = [
  { key: 'overview', label: 'Genel Bakış' },
  { key: 'matches', label: 'Maçlar' },
  { key: 'standings', label: 'Puan Durumu' },
  { key: 'turkish', label: 'Fenerbahçe & Galatasaray' },
  { key: 'bracket', label: 'Turnuva Ağacı' },
  { key: 'probabilities', label: 'Şampiyonluk Olasılıkları' },
  { key: 'strengths', label: 'Takım Güçleri' },
  { key: 'data', label: 'Veri ve Ayarlar' },
] as const;

function Shell() {
  const { mode, setApp, app, scenario, mc } = useApp();
  const [page, setPage] = useState<string>(() => (location.hash.slice(1) || 'overview'));
  useEffect(() => { location.hash = page; window.scrollTo(0, 0); }, [page]);
  useEffect(() => {
    const on = () => setPage(location.hash.slice(1) || 'overview');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const slot = app.modes[mode];
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="star">★</span><div><b>ŞL 2026/27 Simülatörü</b><small>Lig aşamasından finale</small></div></div>
        <div className="mode-switch" role="radiogroup" aria-label="Oyun modu">
          <button role="radio" aria-checked={mode === 'A'} className={mode === 'A' ? 'active' : ''} onClick={() => setApp((a) => ({ ...a, activeMode: 'A' }))}>Mod A · Türk takımları + otomatik</button>
          <button role="radio" aria-checked={mode === 'B'} className={mode === 'B' ? 'active' : ''} onClick={() => setApp((a) => ({ ...a, activeMode: 'B' }))}>Mod B · Tam manuel</button>
        </div>
        <label className="scenario-pick">Senaryo
          <select value={scenario.id} onChange={(e) => setApp((a) => switchScenario(a, mode, e.target.value))}>
            {slot.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {mc.status.running && <span className="mc-dot" title="Olasılıklar hesaplanıyor">● olasılıklar hesaplanıyor</span>}
      </header>
      <nav className="nav">
        {PAGES.map((p) => <button key={p.key} className={page === p.key ? 'active' : ''} onClick={() => setPage(p.key)}>{p.label}</button>)}
      </nav>
      <main>
        {page === 'overview' && <Overview go={setPage} />}
        {page === 'matches' && <Matches />}
        {page === 'standings' && <Standings />}
        {page === 'turkish' && <Turkish />}
        {page === 'bracket' && <Bracket />}
        {page === 'probabilities' && <Probabilities />}
        {page === 'strengths' && <Strengths />}
        {page === 'data' && <DataSettings />}
      </main>
      <footer className="footer">Bu uygulama UEFA ile bağlantılı değildir. Simüle skorlar ve olasılıklar model tahminidir; gerçek sonuç değildir.</footer>
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
