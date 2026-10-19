import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, CircleDot, Clock, MapPin, Mic, Pause, PenLine, Play, Scale, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { DocType, Money, Purchase, RiskFlag, WorkflowDefinition } from '@/types';
import { getAllowedActions, pendingSteps, activeSteps, type WorkflowAction, type WorkflowRecord } from '@/engines/workflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tip } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { act, workflowUser } from '@/services/workflowService';
import { checkStatus, retry } from '@/services/paymentService';
import { usePaymentStore } from '@/stores/paymentStore';
import { cn } from '@/lib/utils';
import { useFarmerStore } from '@/stores/farmerStore';
import { useActor, useCurrentOrg, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';

/** Shared pieces for the buying pages (PRD D1–D6). */

export const mono = (v: ReactNode) => <span className="font-mono text-[13px] text-ink">{v}</span>;

export function useFarmerNames() {
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  return useMemo(() => {
    const m = new Map(farmers.map((f) => [f.id, f]));
    return { name: (id: string) => { const f = m.get(id); return f ? `${f.firstName} ${f.lastName}` : '—'; }, get: (id: string) => m.get(id) };
  }, [farmers]);
}

export function useWorkflowDef(docType: DocType): WorkflowDefinition | undefined {
  const settings = useOrgSettings();
  return settings.workflows.find((w) => w.docType === docType);
}

export function RiskBadge({ flags }: { flags: RiskFlag[] }) {
  const { t } = useT();
  const f = useFormat();
  if (!flags.length) return null;
  const top = flags.find((x) => x.severity === 'HIGH') ?? flags.find((x) => x.severity === 'MEDIUM') ?? flags[0]!;
  const text = flags.map((x) => t(`buy.risk.${x.key}`, { pct: x.params.pct, held: x.params.held && typeof x.params.held === 'object' ? f.money(x.params.held as Money) : '', count: x.params.count })).join(' · ');
  return (
    <Tip label={text}>
      <span><Badge tone={top.severity === 'HIGH' ? 'danger' : top.severity === 'MEDIUM' ? 'warning' : 'neutral'}><AlertTriangle className="h-3 w-3" />{t(`risk.${top.severity}`)}</Badge></span>
    </Tip>
  );
}

export function RiskList({ flags }: { flags: RiskFlag[] }) {
  const { t } = useT();
  const f = useFormat();
  if (!flags.length) return null;
  return (
    <ul className="space-y-1.5 rounded-ctl border border-warning/30 bg-warning/5 p-3 text-[14px]">
      {flags.map((x) => (
        <li key={x.key} className="flex items-start gap-2 text-ink">
          <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', x.severity === 'HIGH' ? 'text-danger' : 'text-warning')} aria-hidden="true" />
          <span>{t(`buy.risk.${x.key}`, { pct: x.params.pct, held: x.params.held && typeof x.params.held === 'object' ? f.money(x.params.held as Money) : '', count: x.params.count })}</span>
        </li>
      ))}
    </ul>
  );
}

/** Steps of the record's workflow with who decided and when (PRD D1 Approvals tab). */
export function ApprovalTimeline({ record, def }: { record: WorkflowRecord; def: WorkflowDefinition }) {
  const { t } = useT();
  const f = useFormat();
  const lk = useLookups();
  const steps = activeSteps(def, record as unknown as Record<string, unknown>);
  const pending = new Set(pendingSteps(def, record).map((s) => s.id));
  const held = record.wf.heldAtStepId;
  const rejected = record.status === def.rejectedStatus;
  const permLabel = (p: string) => { const [r, a] = p.split('.'); return `${t(`perm.resource.${r}`)} · ${t(`perm.action.${a}`, { defaultValue: a })}`; };
  return (
    <div className="space-y-5">
      <ol className="space-y-0">
        {steps.map((s, i) => {
          const decisions = record.approvals.filter((a) => a.stepId === s.id);
          const last = decisions[decisions.length - 1];
          const state = last?.decision === 'APPROVED' && !pending.has(s.id) ? 'done' : last?.decision === 'REJECTED' ? 'rejected' : held === s.id ? 'held' : pending.has(s.id) && !rejected ? 'current' : 'upcoming';
          const Icon = state === 'done' ? Check : state === 'rejected' ? X : state === 'held' ? Pause : state === 'current' ? Clock : CircleDot;
          return (
            <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-line" aria-hidden="true" />}
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border', state === 'done' && 'border-success bg-success text-white', state === 'rejected' && 'border-danger bg-danger text-white', state === 'held' && 'border-warning text-warning', state === 'current' && 'border-brand bg-brand-soft text-brand', state === 'upcoming' && 'border-line text-muted')}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-ink">{s.name}</span>
                  <Badge tone={state === 'done' ? 'success' : state === 'rejected' ? 'danger' : state === 'held' ? 'warningOutline' : state === 'current' ? 'brand' : 'neutral'}>{t(`buy.step.${state}`)}</Badge>
                  {s.auto && <Badge tone="neutral">{t('buy.step.auto')}</Badge>}
                </div>
                {decisions.map((d, j) => (
                  <p key={j} className="mt-1 text-[13px] text-muted">
                    {t(`buy.decision.${d.decision}`, { name: d.userId === 'system' ? t('buy.system') : lk.user(d.userId) })} · {f.dateTime(d.at)}
                    {d.comment && <span className="block text-body">{`“${d.comment}”`}</span>}
                  </p>
                ))}
                {state === 'current' && <p className="mt-1 text-[13px] text-muted">{t('buy.step.waitingFor', { permission: permLabel(s.permission) })}{s.slaHours ? ` · ${t('buy.step.sla', { h: s.slaHours })}` : ''}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Approve / hold / reject / resume buttons from the workflow engine, with reasons for blocked actions. */
/** `onApprove` replaces the plain Approve with a custom dialog (e.g. support approval per service). */
export function WorkflowButtons({ docType, record, def, onDone, onApprove }: { docType: DocType; record: WorkflowRecord & { number: string }; def: WorkflowDefinition; onDone?: (status: string) => void; onApprove?: () => void }) {
  const { orgId, userId } = useActor();
  const { t } = useT();
  const [reason, setReason] = useState<WorkflowAction | null>(null);
  const [comment, setComment] = useState('');
  const allowed = useMemo(() => (userId ? getAllowedActions(record, def, workflowUser(userId, orgId)) : []), [record, def, userId, orgId]);
  if (!allowed.length) return null;
  const run = (action: WorkflowAction, note?: string) => {
    const res = act(orgId, docType, record.id, action, userId ?? '', note);
    if (res.ok) {
      toast.success(t(`buy.acted.${action}`, { number: record.number }), { description: t('dashboard.actedStatus', { status: t(`status.${res.status}`, { defaultValue: res.status }) }) });
      onDone?.(res.status);
    } else if (res.reason === 'reasonRequired') setReason(action);
    else toast.error(t(`dashboard.blocked.${res.reason}`, { defaultValue: t('dashboard.blocked.notAllowed') }));
  };
  const icon = { APPROVE: Check, HOLD: Pause, REJECT: X, RESUME: Play } as const;
  return (
    <>
      {allowed.map((a) => {
        const I = icon[a.action];
        const btn = (
          <Button size="sm" variant={a.action === 'APPROVE' || a.action === 'RESUME' ? 'primary' : a.action === 'REJECT' ? 'dangerOutline' : 'secondary'} disabled={!a.allowed} onClick={() => (a.action === 'REJECT' || a.action === 'HOLD' ? setReason(a.action) : a.action === 'APPROVE' && onApprove ? onApprove() : run(a.action))}>
            <I /> {t(`buy.action.${a.action}`)}
          </Button>
        );
        return a.allowed ? <span key={a.action}>{btn}</span> : <Tip key={a.action} label={t(`dashboard.blocked.${a.reason}`, { defaultValue: t('dashboard.blocked.notAllowed') })}><span>{btn}</span></Tip>;
      })}
      <Dialog open={!!reason} onOpenChange={(o) => { if (!o) { setReason(null); setComment(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reason ? t(`dashboard.reasonTitle.${reason}`, { number: record.number }) : ''}</DialogTitle>
            <DialogDescription>{t('dashboard.reasonBody')}</DialogDescription>
          </DialogHeader>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} autoFocus aria-label={t('dashboard.reason')} placeholder={t('dashboard.reasonPlaceholder')} className="w-full rounded-ctl border border-line bg-surface p-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft" />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReason(null)}>{t('common.cancel')}</Button>
            <Button variant={reason === 'REJECT' ? 'danger' : 'primary'} disabled={!comment.trim()} onClick={() => { if (reason) run(reason, comment.trim()); setReason(null); setComment(''); }}>{reason ? t(`buy.action.${reason}`) : ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Scale photo, voice note, GPS and signature icons (PRD D2 list). */
export function EvidenceIcons({ evidence }: { evidence: Purchase['evidence'] }) {
  const { t } = useT();
  const items = [
    { k: 'scalePhoto', on: !!evidence.scalePhoto, I: Scale },
    { k: 'voiceNote', on: !!evidence.voiceNote, I: Mic },
    { k: 'gps', on: !!evidence.gps, I: MapPin },
    { k: 'signature', on: !!evidence.signature, I: PenLine },
  ];
  return (
    <span className="inline-flex gap-1">
      {items.map(({ k, on, I }) => (
        <Tip key={k} label={`${t(`buy.evidence.${k}`)} · ${on ? t('common.yes') : t('common.no')}`}>
          <span className={cn('flex h-6 w-6 items-center justify-center rounded-full', on ? 'bg-brand-soft text-brand' : 'bg-canvas text-muted/50')} aria-label={`${t(`buy.evidence.${k}`)}: ${on ? t('common.yes') : t('common.no')}`}>
            <I className="h-3.5 w-3.5" />
          </span>
        </Tip>
      ))}
    </span>
  );
}

/** Simulated voice-note playback with a waveform (prototype: no real audio). */
export function VoicePlayer({ id, seconds = 14 }: { id: string; seconds?: number }) {
  const { t } = useT();
  const [playing, setPlaying] = useState(false);
  const seed = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  const bars = Array.from({ length: 36 }, (_, i) => 5 + Math.abs(Math.sin((i + seed) * 1.3)) * 20);
  return (
    <div className="flex items-center gap-3 rounded-ctl border border-line bg-canvas/60 px-3 py-2">
      <Button size="iconSm" variant={playing ? 'primary' : 'secondary'} aria-label={playing ? t('buy.pause') : t('buy.play')} onClick={() => { setPlaying(!playing); if (!playing) window.setTimeout(() => setPlaying(false), 2500); }}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className="flex h-7 flex-1 items-center gap-[2px]" aria-hidden="true">
        {bars.map((h, i) => <span key={i} className={cn('w-[3px] rounded-full transition-colors', playing && i < 18 ? 'bg-brand' : 'bg-muted/40')} style={{ height: h }} />)}
      </div>
      <span className="tnum text-[12px] text-muted">{`0:${String(seconds).padStart(2, '0')}`}</span>
    </div>
  );
}

/** A simple signature mark for seeded "sig-n" evidence (real captures are data URLs). */
export function SignatureImage({ value, className }: { value: string; className?: string }) {
  if (value.startsWith('data:')) return <img src={value} alt="" className={cn('h-16 rounded-ctl border border-line bg-surface object-contain', className)} />;
  const n = Number(value.replace(/\D/g, '')) || 1;
  const d = ['M10 40 C30 10 40 60 60 30 S90 20 110 38 S150 50 170 22', 'M12 36 Q40 4 58 34 T98 30 Q120 10 140 40 L168 26', 'M8 30 C24 50 44 8 66 36 C84 56 100 12 124 32 S160 44 172 20', 'M14 42 L34 14 L52 40 Q80 4 104 36 T170 28'][(n - 1) % 4];
  return (
    <svg viewBox="0 0 180 60" className={cn('h-16 rounded-ctl border border-line bg-surface', className)} role="img" aria-label="signature">
      <path d={d} fill="none" stroke="#0F2A20" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Small bar comparison: requested price vs list price vs average paid (PRD D1 Summary). */
export function PriceCompare({ items }: { items: { label: string; value: number; tone?: 'brand' | 'muted' | 'warning' }[] }) {
  const f = useFormat();
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-center justify-between text-[13px]"><span className="text-body">{i.label}</span><span className="tnum font-medium text-ink">{f.money(i.value)}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
            <div className={cn('h-full rounded-full', i.tone === 'warning' ? 'bg-warning' : i.tone === 'muted' ? 'bg-muted/50' : 'bg-brand')} style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Opens a printable receipt (sender = company legal name, PRD D1/D3) in a new window. */
export function usePrintReceipt() {
  const org = useCurrentOrg();
  const f = useFormat();
  const { t } = useT();
  return (title: string, number: string, rows: [string, string][], signature?: string) => {
    const w = window.open('', '_blank', 'width=640,height=800');
    if (!w) { toast.error(t('buy.popupBlocked')); return; }
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const sig = signature?.startsWith('data:') ? `<img src="${signature}" style="height:60px">` : signature ? `<div style="font-family:cursive;font-size:22px">~ ${esc(t('buy.signed'))} ~</div>` : '';
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(number)}</title><style>body{font-family:system-ui,sans-serif;color:#0F2A20;margin:40px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}td{padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px}td:last-child{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#6b7280;font-size:13px}</style></head><body>
      <h1>${esc(org.legalName ?? org.name)}</h1><div class="muted">${esc(org.name)}</div>
      <h2 style="font-size:16px;margin-top:28px">${esc(title)} · ${esc(number)}</h2><div class="muted">${esc(f.dateTime(new Date()))}</div>
      <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      ${sig ? `<div style="margin-top:28px" class="muted">${esc(t('buy.agentSignature'))}</div>${sig}` : ''}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };
}

/** Amount (+ optional weight) input dialog used for disbursements, refunds and write-offs. */
export function AmountDialog({ open, onClose, title, description, initialMinor, maxMinor, currency, confirm, onConfirm, withWeight, reasonLabel, reasonRequired, proof, extra, busy }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; initialMinor: number; maxMinor?: number; currency: string; confirm: ReactNode;
  onConfirm: (v: { amountMinor: number; weightKg?: number; reason: string; proof?: string }) => void; withWeight?: boolean; reasonLabel?: string; reasonRequired?: boolean; proof?: boolean; extra?: ReactNode; busy?: boolean;
}) {
  const { t } = useT();
  const f = useFormat();
  const decimals = currency === 'XOF' ? 0 : 2;
  const [amount, setAmount] = useState(String(initialMinor / 10 ** decimals));
  const [weight, setWeight] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<string | undefined>();
  const minor = Math.round(Number(amount || 0) * 10 ** decimals);
  const over = maxMinor != null && minor > maxMinor;
  const invalid = !minor || minor < 0 || over || (reasonRequired && !reason.trim()) || (proof && !file);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('buy.amountIn', { currency })}</span>
            <input type="number" min={0} step={decimals ? '0.01' : '1'} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[15px] text-ink tnum focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft" aria-label={t('buy.amountIn', { currency })} autoFocus />
            <span className="mt-1 block text-[12px] text-muted">{f.money({ amountMinor: minor, currency })}{maxMinor != null && ` · ${t('buy.max', { amount: f.money({ amountMinor: maxMinor, currency }) })}`}</span>
            {over && <span className="mt-1 block text-[12px] text-danger" role="alert">{t('buy.overMax')}</span>}
          </label>
          {withWeight && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{t('buy.weightKg')}</span>
              <input type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[15px] text-ink tnum" aria-label={t('buy.weightKg')} />
            </label>
          )}
          {reasonLabel && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.06em] text-label">{reasonLabel}</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[14px] text-ink" aria-label={reasonLabel} />
            </label>
          )}
          {proof && <ProofPicker value={file} onChange={setFile} />}
          {extra}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={invalid || busy} onClick={() => onConfirm({ amountMinor: minor, weightKg: weight ? Number(weight) : undefined, reason: reason.trim(), proof: file })}>{confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Proof upload (image or PDF name only — the prototype keeps the file name). */
export function ProofPicker({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-ctl border border-dashed border-line p-3">
      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-ctl bg-surface px-3 text-[14px] font-medium text-ink ring-1 ring-line hover:bg-canvas">
        {t('buy.uploadProof')}
        <input type="file" className="sr-only" accept="image/*,application/pdf" onChange={(e) => { onChange(e.target.files?.[0]?.name); e.target.value = ''; }} />
      </label>
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange('transfer-slip.jpg')}>{t('buy.useSampleProof')}</Button>
      <span className="text-[13px] text-muted">{value ?? t('buy.proofRequired')}</span>
    </div>
  );
}

export function Panel({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-card border border-line bg-surface p-5 shadow-soft', className)}>
      {(title || actions) && <div className="mb-3 flex items-center justify-between gap-3">{title && <h3 className="text-[15px] font-semibold text-ink">{title}</h3>}{actions}</div>}
      {children}
    </section>
  );
}


/**
 * The latest payment attempt for a record, inline in its drawer: Retry when it failed, Check status
 * when the provider didn't answer, a note while it waits for a checker or is on its way.
 */
export function PaymentState({ payableId }: { payableId: string }) {
  const { userId } = useActor();
  const { t } = useT();
  const all = usePaymentStore((s) => s.payments);
  const [busy, setBusy] = useState(false);
  const last = useMemo(() => all.filter((p) => p.payableId === payableId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [all, payableId]);
  if (!last || last.status === 'SUCCESSFUL' || last.status === 'REVERSED') return null;
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); await fn(); setBusy(false); };
  const tone = last.status === 'FAILED' ? 'border-danger/30 bg-danger/5' : last.status === 'UNKNOWN' ? 'border-unknown/30 bg-unknown/5' : 'border-info/30 bg-info/5';
  return (
    <div className={cn('flex w-full flex-wrap items-center gap-3 rounded-ctl border px-3 py-2 text-[14px] text-ink', tone)} role={last.status === 'FAILED' ? 'alert' : 'status'}>
      {last.status === 'FAILED' ? <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" /> : last.status === 'AWAITING_CHECKER' ? <ShieldCheck className="h-4 w-4 shrink-0 text-info" aria-hidden="true" /> : <Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
      <span className="min-w-0 flex-1">{t(`pay.state.${last.status}`, { reference: last.reference, reason: last.failureReason ?? '' })}</span>
      {last.status === 'FAILED' && <Button size="xs" variant="danger" disabled={busy} onClick={() => void run(() => retry(last.id, userId ?? 'system'))}>{t('buy.retry')}</Button>}
      {last.status === 'UNKNOWN' && <Button size="xs" variant="secondary" disabled={busy} onClick={() => void run(() => checkStatus(last.id, userId ?? 'system'))}>{t('pay.checkStatus')}</Button>}
      {last.status === 'AWAITING_CHECKER' && <Link to={`/app/payments?view=AWAITING_CHECKER&open=${last.id}`} className="text-link text-[13px]">{t('pay.openPayment')}</Link>}
    </div>
  );
}
