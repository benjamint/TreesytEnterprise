import { useRef, useState } from 'react';
import { Bug, ImagePlus, Lightbulb, Sparkles, X } from 'lucide-react';
import type { Feedback, FeedbackKind, FeedbackSeverity } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { APP_VERSION, submitFeedback, validateFeedback } from '@/services/feedbackService';
import { useActor, useT } from '@/stores/hooks';
import { useSessionStore } from '@/stores/sessionStore';

export const FEEDBACK_EVENT = 'treesyt:feedback';
/** Opens the feedback dialog from anywhere (Help menu, command palette, empty states). */
export const openFeedback = (kind?: FeedbackKind) => window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT, { detail: { kind } }));

const KINDS: { kind: FeedbackKind; icon: typeof Bug }[] = [{ kind: 'BUG', icon: Bug }, { kind: 'FEATURE', icon: Sparkles }, { kind: 'IMPROVEMENT', icon: Lightbulb }];
const SEVERITIES: FeedbackSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'BLOCKING'];
const MAX_UPLOAD = 8 * 1024 * 1024;

/** Downscales an image to at most 1280 px wide as a JPEG data URL, so it stays small in storage. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

/** Bug / feature / improvement form; the page, device, language and version are attached automatically. */
export function FeedbackForm({ device, initialKind = 'BUG', area, path, pageLabel, onDone, onCancel }: { device: 'web' | 'mobile'; initialKind?: FeedbackKind; area?: string; path?: string; pageLabel: string; onDone: (f: Feedback) => void; onCancel?: () => void }) {
  const { t } = useT();
  const { orgId, userId, lang } = useActor();
  const theme = useSessionStore((s) => s.theme);
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<FeedbackSeverity | undefined>();
  const [shot, setShot] = useState<string>();
  const [shotError, setShotError] = useState(false);
  const [tried, setTried] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const errors = validateFeedback({ kind, title, body, severity });
  const err = (k: string) => tried && errors.includes(k);
  const big = device === 'mobile';

  const pick = async (file?: File) => {
    setShotError(false);
    if (!file) return;
    if (file.size > MAX_UPLOAD) { setShotError(true); return; }
    try { setShot(await shrink(file)); } catch { setShotError(true); }
  };
  const submit = () => {
    setTried(true);
    if (errors.length || !userId) return;
    onDone(submitFeedback({ orgId, userId, kind, title, body, severity, area, path, screenshot: shot, device, language: lang, theme, viewport: `${window.innerWidth}×${window.innerHeight}` }));
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-5" noValidate>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink [.mobile-ui_&]:text-[12px] [.mobile-ui_&]:font-semibold [.mobile-ui_&]:uppercase [.mobile-ui_&]:tracking-[0.08em] [.mobile-ui_&]:text-label">{t('fb.kindLabel')}</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('fb.kindLabel')}>
          {KINDS.map(({ kind: k, icon: Icon }) => {
            const on = kind === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setKind(k)}
                className={cn('flex flex-col items-start gap-2 rounded-ctl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', on ? 'border-brand bg-brand-soft/60' : 'border-line-strong bg-surface hover:bg-subtle')}>
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-chip', on ? 'bg-brand text-on-brand' : 'bg-canvas text-muted')}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <span>
                  <span className={cn('block font-medium leading-tight text-ink', big ? 'text-[14px]' : 'text-[13px]')}>{t(`fb.kindShort.${k}`)}</span>
                  <span className={cn('mt-0.5 block leading-snug text-muted', big ? 'text-[12px]' : 'text-[11px]')}>{t(`fb.kindHint.${k}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="fb-title">{t('fb.titleLabel')}</Label>
        <Input id="fb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(`fb.titlePlaceholder.${kind}`)} maxLength={120} aria-invalid={err('title')} className={cn(err('title') && 'border-danger')} />
        {err('title') && <p className="mt-1.5 text-[13px] text-danger" role="alert">{t('fb.err.title')}</p>}
      </div>

      <div>
        <Label htmlFor="fb-body">{t(`fb.bodyLabel.${kind}`)}</Label>
        <textarea id="fb-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t(`fb.bodyPlaceholder.${kind}`)} rows={big ? 5 : 4} maxLength={4000} aria-invalid={err('body')}
          className={cn('w-full rounded-ctl border bg-surface px-3 py-2.5 text-[14px] leading-relaxed text-ink shadow-xs placeholder:text-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/15 [.mobile-ui_&]:px-4 [.mobile-ui_&]:text-[16px]', err('body') ? 'border-danger' : 'border-line-strong')} />
        {err('body') && <p className="mt-1.5 text-[13px] text-danger" role="alert">{t('fb.err.body')}</p>}
      </div>

      {kind === 'BUG' && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink [.mobile-ui_&]:text-[12px] [.mobile-ui_&]:font-semibold [.mobile-ui_&]:uppercase [.mobile-ui_&]:tracking-[0.08em] [.mobile-ui_&]:text-label">{t('fb.severity')}</legend>
          <div className={cn('grid gap-1.5', big ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')} role="radiogroup" aria-label={t('fb.severity')}>
            {SEVERITIES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={severity === s} onClick={() => setSeverity(s)}
                className={cn('rounded-ctl border px-2 py-1.5 text-center text-[13px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', big ? 'min-h-11' : 'min-h-9', severity === s ? (s === 'BLOCKING' || s === 'HIGH' ? 'border-danger/50 bg-danger/10 text-danger' : 'border-brand bg-brand-soft/60 text-brand') : 'border-line-strong bg-surface text-body hover:bg-subtle')}>
                {t(`fb.severityLevel.${s}`)}
              </button>
            ))}
          </div>
          {err('severity') && <p className="mt-1.5 text-[13px] text-danger" role="alert">{t('fb.err.severity')}</p>}
        </fieldset>
      )}

      <div>
        <div className="mb-2 text-[13px] font-medium text-ink [.mobile-ui_&]:text-[12px] [.mobile-ui_&]:font-semibold [.mobile-ui_&]:uppercase [.mobile-ui_&]:tracking-[0.08em] [.mobile-ui_&]:text-label">{t('fb.screenshot')}</div>
        {shot ? (
          <div className="relative inline-block">
            <img src={shot} alt={t('fb.screenshot')} className="max-h-36 rounded-ctl border border-line object-cover" />
            <button type="button" onClick={() => setShot(undefined)} className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-xs hover:text-ink" aria-label={t('fb.screenshotRemove')}><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className={cn('flex w-full items-center justify-center gap-2 rounded-ctl border border-dashed border-line-strong bg-subtle text-[13px] text-body transition-colors hover:border-muted/60 hover:text-ink', big ? 'h-14' : 'h-12')}>
            <ImagePlus className="h-4 w-4" aria-hidden="true" /> {t('fb.screenshotAdd')}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        {shotError && <p className="mt-1.5 text-[13px] text-danger" role="alert">{t('fb.screenshotTooBig')}</p>}
      </div>

      <p className="text-[12px] text-muted">{t('fb.context', { page: pageLabel, device: t(`fb.device.${device}`), language: lang.toUpperCase(), version: APP_VERSION })}</p>

      <div className={cn('flex gap-2', big ? 'flex-col-reverse' : 'justify-end border-t border-line pt-4')}>
        {onCancel && <Button type="button" variant="secondary" size={big ? 'lg' : 'md'} onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button type="submit" size={big ? 'lg' : 'md'}>{t('fb.send')}</Button>
      </div>
    </form>
  );
}
