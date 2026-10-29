import { useEffect, useRef, useState } from 'react';
import { Check, Fingerprint, MapPin, Mic, Nfc, PenLine, QrCode, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useT } from '@/stores/hooks';

/**
 * Simulated capture for the prototype (PRD 10 common components): bundled sample photos,
 * GPS with an accuracy meter, boundary walk, QR / NFC / thumbprint, audio and signature.
 * Values are plain JSON so responses persist and sync like real answers.
 */

export const SAMPLE_PHOTOS = ['sample:farm-1', 'sample:farm-2', 'sample:tree-1', 'sample:group-1', 'sample:nursery-1'] as const;

const SCENES: Record<string, { sky: string; ground: string; shape: 'tree' | 'field' | 'people' | 'seedlings' }> = {
  'sample:farm-1': { sky: '#cfe8f6', ground: '#c99a5b', shape: 'field' },
  'sample:farm-2': { sky: '#f3dcb6', ground: '#8fb35a', shape: 'field' },
  'sample:tree-1': { sky: '#d9eef7', ground: '#b9894f', shape: 'tree' },
  'sample:group-1': { sky: '#f6e3c7', ground: '#a5784a', shape: 'people' },
  'sample:nursery-1': { sky: '#dff0e4', ground: '#7a5a3a', shape: 'seedlings' },
};

/** A bundled sample photo (or an uploaded data URL). */
export function Photo({ src, className, alt = '' }: { src: string; className?: string; alt?: string }) {
  if (!src.startsWith('sample:')) return <img src={src} alt={alt} className={cn('object-cover', className)} />;
  const s = SCENES[src] ?? SCENES['sample:farm-1']!;
  return (
    <svg viewBox="0 0 160 120" className={className} role="img" aria-label={alt}>
      <rect width="160" height="120" fill={s.sky} />
      <circle cx="128" cy="26" r="12" fill="#f7c948" opacity="0.85" />
      <path d="M0 78 Q40 66 80 76 T160 72 V120 H0Z" fill={s.ground} />
      {s.shape === 'tree' && <g><rect x="74" y="54" width="8" height="34" fill="#6b4a2b" /><circle cx="78" cy="48" r="24" fill="#2f7d4f" /><circle cx="64" cy="56" r="14" fill="#3e9460" /><circle cx="94" cy="56" r="14" fill="#3e9460" /></g>}
      {s.shape === 'field' && <g stroke="#5f8f3a" strokeWidth="3">{[20, 40, 60, 80, 100, 120, 140].map((x) => <path key={x} d={`M${x} 118 L${x + 8} 84`} />)}</g>}
      {s.shape === 'people' && <g>{[50, 75, 100].map((x, i) => <g key={x}><circle cx={x} cy={64} r="8" fill="#5a3b26" /><rect x={x - 9} y="72" width="18" height="26" rx="6" fill={['#e07a3f', '#2a78d6', '#d64f8a'][i]} /></g>)}</g>}
      {s.shape === 'seedlings' && <g>{[24, 48, 72, 96, 120].map((x) => <g key={x}><rect x={x - 6} y="92" width="12" height="12" fill="#3b2a1a" /><path d={`M${x} 92 Q${x - 8} 80 ${x - 2} 74 M${x} 92 Q${x + 8} 82 ${x + 3} 76`} stroke="#3e9460" strokeWidth="3" fill="none" /></g>)}</g>}
    </svg>
  );
}

/** Pick sample photos ("camera") or upload small images on the web. */
export function PhotoPicker({ value, onChange, max = 3, big }: { value: string[]; onChange: (v: string[]) => void; max?: number; big?: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const full = value.length >= max;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((p, i) => (
          <div key={`${p}${i}`} className={cn('group relative overflow-hidden rounded-ctl border border-line', big ? 'h-24 w-32' : 'h-16 w-20')}>
            <Photo src={p} className="h-full w-full" />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={t('set.remove')} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      {!full && (
        open ? (
          <div className="rounded-ctl border border-line bg-canvas p-2">
            <p className="mb-2 text-[12px] text-muted">{t('form.media.pickSample')}</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_PHOTOS.map((p) => (
                <button key={p} type="button" onClick={() => { onChange([...value, p]); setOpen(false); }} className="h-14 w-[72px] overflow-hidden rounded-[8px] border border-line hover:border-brand"><Photo src={p} className="h-full w-full" /></button>
              ))}
              <label className="flex h-14 w-[72px] cursor-pointer items-center justify-center rounded-[8px] border border-dashed border-line text-center text-[11px] text-muted hover:border-brand">
                {t('form.media.upload')}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => {
                  const file = e.target.files?.[0]; e.target.value = '';
                  if (!file) return;
                  const r = new FileReader();
                  r.onload = () => { onChange([...value, file.size < 300_000 ? String(r.result) : 'sample:farm-1']); setOpen(false); };
                  r.readAsDataURL(file);
                }} />
              </label>
            </div>
          </div>
        ) : <Button type="button" variant="secondary" size={big ? 'lg' : 'sm'} onClick={() => setOpen(true)}>{t('form.media.takePhoto', { n: value.length, max })}</Button>
      )}
    </div>
  );
}

/** Animated capture used for GPS, scan, NFC and thumbprint. */
function useCapture(ms = 1400) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const run = (done: () => void) => {
    setBusy(true);
    setProgress(0);
    const start = Date.now();
    const id = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / ms);
      setProgress(p);
      if (p >= 1) { window.clearInterval(id); setBusy(false); done(); }
    }, 60);
  };
  return { busy, progress, run };
}

export type Gps = { lat: number; lng: number; accuracy: number };

export function GpsCapture({ value, onChange, base, big }: { value?: Gps; onChange: (v: Gps) => void; base: { lat: number; lng: number }; big?: boolean }) {
  const { t } = useT();
  const cap = useCapture(1600);
  const accuracy = cap.busy ? Math.round(40 - cap.progress * 34) : value?.accuracy;
  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" size={big ? 'lg' : 'sm'} disabled={cap.busy} onClick={() => cap.run(() => onChange({ lat: base.lat + (Math.random() - 0.5) * 0.02, lng: base.lng + (Math.random() - 0.5) * 0.02, accuracy: 4 + Math.round(Math.random() * 5) }))}>
        <MapPin /> {cap.busy ? t('form.media.locating') : value ? t('form.media.recapture') : t('form.media.captureGps')}
      </Button>
      {accuracy != null && (
        <div className="flex items-center gap-2 text-[13px]">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-canvas"><div className={cn('h-full rounded-full', accuracy <= 10 ? 'bg-success' : 'bg-warning')} style={{ width: `${Math.max(8, 100 - accuracy * 2)}%` }} /></div>
          <span className="tnum text-body">{t('form.media.accuracy', { m: accuracy })}</span>
          {value && !cap.busy && <span className="tnum text-muted">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>}
        </div>
      )}
    </div>
  );
}

export type Polygon = { points: [number, number][]; areaHa: number };

import { polygonAreaHa } from '@/engines/geo';
export { polygonAreaHa };

export function PolygonCapture({ value, onChange, base, big }: { value?: Polygon; onChange: (v: Polygon) => void; base: { lat: number; lng: number }; big?: boolean }) {
  const { t } = useT();
  const cap = useCapture(2400);
  const walk = () => cap.run(() => {
    const n = 7;
    const r = 0.0009 + Math.random() * 0.0007;
    const points = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; const k = 0.75 + Math.random() * 0.4; return [base.lat + Math.sin(a) * r * k, base.lng + Math.cos(a) * r * 1.3 * k] as [number, number]; });
    onChange({ points, areaHa: polygonAreaHa(points) });
  });
  const pts = value?.points ?? [];
  const box = pts.length ? { minLa: Math.min(...pts.map((p) => p[0])), maxLa: Math.max(...pts.map((p) => p[0])), minLo: Math.min(...pts.map((p) => p[1])), maxLo: Math.max(...pts.map((p) => p[1])) } : null;
  const shown = cap.busy ? Math.ceil(cap.progress * 7) : pts.length;
  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" size={big ? 'lg' : 'sm'} disabled={cap.busy} onClick={walk}><MapPin /> {cap.busy ? t('form.media.walking', { n: shown }) : value ? t('form.media.walkAgain') : t('form.media.walk')}</Button>
      {value && box && !cap.busy && (
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 100 70" className="h-20 w-28 rounded-ctl border border-line bg-[#eef5e9]" aria-hidden="true">
            <polygon points={pts.map(([la, lo]) => `${8 + ((lo - box.minLo) / (box.maxLo - box.minLo || 1)) * 84},${62 - ((la - box.minLa) / (box.maxLa - box.minLa || 1)) * 54}`).join(' ')} fill="rgba(20,88,63,0.25)" stroke="#14583F" strokeWidth="2" />
          </svg>
          <span className="text-[13px] text-body">{t('form.media.polygon', { n: pts.length, ha: value.areaHa })}</span>
        </div>
      )}
    </div>
  );
}

export function SimCapture({ kind, value, onChange, big, make: makeValue, label }: { kind: 'scanCode' | 'nfcTap' | 'thumbprint'; value?: string; onChange: (v: string | undefined) => void; big?: boolean; make?: () => string; label?: string }) {
  const { t } = useT();
  const cap = useCapture(kind === 'thumbprint' ? 1800 : 1100);
  const Icon = kind === 'scanCode' ? QrCode : kind === 'nfcTap' ? Nfc : Fingerprint;
  const make = () => makeValue?.() ?? (kind === 'scanCode' ? `TS-${10000 + Math.floor(Math.random() * 89999)}` : kind === 'nfcTap' ? `NFC-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}` : `captured:${70 + Math.floor(Math.random() * 28)}`);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" size={big ? 'lg' : 'sm'} disabled={cap.busy} onClick={() => cap.run(() => onChange(make()))}>
        <Icon className={cn(cap.busy && 'animate-pulse')} /> {cap.busy ? t(`form.media.${kind}Busy`) : label ?? t(`form.media.${kind}`)}
      </Button>
      {cap.busy && <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand" style={{ width: `${cap.progress * 100}%` }} /></div>}
      {value && !cap.busy && (
        <span className="flex items-center gap-1.5 text-[13px] text-ink">
          <Check className="h-4 w-4 text-success" />
          {kind === 'thumbprint' ? t('form.media.thumbQuality', { q: value.split(':')[1] }) : <span className="font-mono">{value}</span>}
        </span>
      )}
    </div>
  );
}

export function AudioCapture({ value, onChange, big }: { value?: { seconds: number }; onChange: (v: { seconds: number } | undefined) => void; big?: boolean }) {
  const { t } = useT();
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const id = window.setInterval(() => setSecs((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [rec]);
  const bars = Array.from({ length: 24 }, (_, i) => 6 + Math.abs(Math.sin((i + secs) * 1.7)) * 18);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {rec ? (
        <Button type="button" variant="danger" size={big ? 'lg' : 'sm'} onClick={() => { setRec(false); onChange({ seconds: Math.max(1, secs) }); }}><Square /> {t('form.media.stop', { s: secs })}</Button>
      ) : (
        <Button type="button" variant="secondary" size={big ? 'lg' : 'sm'} onClick={() => { setSecs(0); setRec(true); }}><Mic /> {value ? t('form.media.reRecord') : t('form.media.record')}</Button>
      )}
      {(rec || value) && (
        <div className="flex h-7 items-center gap-[2px]" aria-hidden="true">
          {bars.map((h, i) => <span key={i} className={cn('w-[3px] rounded-full', rec ? 'bg-danger' : 'bg-brand')} style={{ height: rec ? h : 4 + (i % 5) * 4 }} />)}
        </div>
      )}
      {value && !rec && <span className="tnum text-[13px] text-muted">{t('form.media.seconds', { s: value.seconds })}</span>}
    </div>
  );
}

export function SignaturePad({ value, onChange, big }: { value?: string; onChange: (v: string | undefined) => void; big?: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const c = ref.current;
    if (!c || !value || value.startsWith('sample:')) return;
    const img = new Image();
    img.onload = () => c.getContext('2d')?.drawImage(img, 0, 0);
    img.src = value;
  }, [value]);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 300, ((e.clientY - r.top) / r.height) * 110] as const; };
  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        width={300}
        height={110}
        aria-label={t('form.media.signHere')}
        className={cn('w-full touch-none rounded-ctl border border-dashed border-line bg-surface', big ? 'h-36' : 'h-28 max-w-sm')}
        onPointerDown={(e) => { drawing.current = true; const ctx = e.currentTarget.getContext('2d')!; const [x, y] = pos(e); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0F2A20'; ctx.beginPath(); ctx.moveTo(x, y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const ctx = e.currentTarget.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); }}
        onPointerUp={(e) => { drawing.current = false; onChange(e.currentTarget.toDataURL('image/png')); }}
      />
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <PenLine className="h-3.5 w-3.5" /> {value ? t('form.media.signed') : t('form.media.signHere')}
        {value && <Button type="button" variant="link" size="xs" onClick={() => { ref.current?.getContext('2d')?.clearRect(0, 0, 300, 110); onChange(undefined); }}>{t('form.media.clear')}</Button>}
      </div>
    </div>
  );
}
