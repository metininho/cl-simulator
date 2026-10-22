import { useEffect, useState, type ReactNode } from 'react';
import type { TeamId } from '../engine/types';
import type { ResultSource } from '../engine/types';
import { hashString } from '../engine/rng';
import { useApp } from '../state/AppContext';
import { TURKISH_TEAMS } from '../engine/season';

export const pct = (p: number | undefined, digits = 1) => {
  if (p === undefined || Number.isNaN(p)) return '—';
  if (p === 0) return '0%';
  if (p === 1) return '100%';
  if (p < 0.001) return '<0,1%';
  if (p > 0.999) return '>99,9%';
  return `${(p * 100).toFixed(digits).replace('.', ',')}%`;
};

export const fmtDate = (d: string | null | undefined, time?: string | null) => {
  if (!d) return 'Tarih belirtilmedi';
  const dt = new Date(`${d}T12:00:00`);
  const s = dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' });
  return time ? `${s} · ${time} (CET)` : `${s} · saat doğrulanmadı`;
};

export function TeamBadge({ id, size = 26 }: { id?: TeamId; size?: number }) {
  const { ds } = useApp();
  const t = ds.teams.find((x) => x.id === id);
  if (!t) return <span className="badge-team placeholder" style={{ width: size, height: size }}>?</span>;
  const special = id === 'FB' ? 'fb' : id === 'GS' ? 'gs' : '';
  const hue = hashString(t.id) % 360;
  return (
    <span className={`badge-team ${special}`} title={`${t.name} (${t.country})`}
      style={{ width: size, height: size, fontSize: size * 0.34, ...(special ? {} : { background: `hsl(${hue} 45% 32%)` }) }}>
      {t.short.slice(0, 3)}
    </span>
  );
}

export function TeamLabel({ id, short = false, placeholder }: { id?: TeamId; short?: boolean; placeholder?: string }) {
  const { teamName, ds } = useApp();
  if (!id) return <span className="team-label muted"><TeamBadge /> {placeholder ?? 'Belli değil'}</span>;
  const t = ds.teams.find((x) => x.id === id);
  return (
    <span className={`team-label ${TURKISH_TEAMS.includes(id) ? 'turkish' : ''}`}>
      <TeamBadge id={id} /> <span className="team-name">{short ? t?.short : teamName(id)}</span>
    </span>
  );
}

const STATUS_TEXT: Record<string, string> = {
  official: 'Resmi sonuç',
  manual: 'Elle girildi',
  simulated: 'Simüle edildi',
  scheduled: 'Planlandı',
  postponed: 'Ertelendi',
  unplayed: 'Henüz oynanmadı',
};

export function StatusBadge({ status }: { status: ResultSource | 'scheduled' | 'postponed' | 'unplayed' }) {
  const icon = status === 'official' ? '🔒 ' : status === 'manual' ? '✎ ' : status === 'simulated' ? '⚙ ' : '';
  return <span className={`status status-${status}`}>{icon}{STATUS_TEXT[status]}</span>;
}

export function ProbBar({ h, d, a }: { h: number; d: number; a: number }) {
  return (
    <div className="probbar" title={`Ev ${pct(h)} · Beraberlik ${pct(d)} · Deplasman ${pct(a)}`}>
      <div className="pb-h" style={{ width: `${h * 100}%` }}>{h > 0.12 ? pct(h, 0) : ''}</div>
      <div className="pb-d" style={{ width: `${d * 100}%` }}>{d > 0.12 ? pct(d, 0) : ''}</div>
      <div className="pb-a" style={{ width: `${a * 100}%` }}>{a > 0.12 ? pct(a, 0) : ''}</div>
    </div>
  );
}

export function ScoreInput({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  return (
    <input className="score-input" inputMode="numeric" pattern="[0-9]*" aria-label={label} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} />
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function FormDots({ form }: { form: ('G' | 'B' | 'M')[] }) {
  return (
    <span className="form">
      {form.slice(-5).map((r, i) => <span key={i} className={`fd fd-${r}`} title={r === 'G' ? 'Galibiyet' : r === 'B' ? 'Beraberlik' : 'Mağlubiyet'}>{r}</span>)}
    </span>
  );
}

export function ConfirmDialog() {
  const { confirmReq, closeConfirm } = useApp();
  useEffect(() => {
    if (!confirmReq) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeConfirm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmReq, closeConfirm]);
  if (!confirmReq) return null;
  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal">
        <p style={{ whiteSpace: 'pre-line' }}>{confirmReq.message}</p>
        <div className="row end">
          <button className="btn" onClick={() => closeConfirm(false)}>Vazgeç</button>
          <button className={`btn ${confirmReq.danger ? 'danger' : 'primary'}`} onClick={() => closeConfirm(true)} autoFocus>
            {confirmReq.confirmLabel ?? 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

export function Disclaimer({ children }: { children: ReactNode }) {
  return <p className="disclaimer">ⓘ {children}</p>;
}

export function Tabs<T extends string | number>({ items, value, onChange }: { items: { key: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={String(it.key)} role="tab" aria-selected={it.key === value} className={`tab ${it.key === value ? 'active' : ''}`} onClick={() => onChange(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function useDownload() {
  return (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

export function InlineEdit({ value, onSave, label }: { value: string; onSave: (v: string) => void; label: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (!editing) return <button className="btn small ghost" onClick={() => setEditing(true)}>{label}</button>;
  return (
    <span className="row">
      <input className="text-input" value={v} onChange={(e) => setV(e.target.value)} aria-label="Yeni ad" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') { onSave(v); setEditing(false); } }} />
      <button className="btn small primary" onClick={() => { onSave(v); setEditing(false); }}>Kaydet</button>
      <button className="btn small" onClick={() => setEditing(false)}>İptal</button>
    </span>
  );
}
