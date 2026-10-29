import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, CloudUpload, Fingerprint, MessageSquarePlus, Nfc, QrCode, Star, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { AttendanceMethod, Farmer, Workshop } from '@/types';
import { defaultAnswers } from '@/engines/forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GpsCapture, PhotoPicker, type Gps } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { MobileFormRenderer } from '@/mobile/forms/MobileFormRenderer';
import { ListRow, MField, MList, MSearch, MobileWizard, mInput, savedKey } from '@/mobile/components/kit';
import { useMyFarmers } from '@/mobile/flows/farmers/FarmerScreens';
import { boundForm, fillSchema } from '@/services/formService';
import { saveOrQueue } from '@/services/mobileSync';
import type { WorkshopSessionPayload } from '@/services/mobileHandlers';
import { attendanceProblem, eligibleFarmerIds, type AttendanceInput } from '@/services/trainingService';
import { cn, latency } from '@/lib/utils';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useFormStore } from '@/stores/formStore';
import { useOutboxStore } from '@/stores/outboxStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { useTrainingLookups } from '@/web/features/training/WorkshopsPage';

const today = () => new Date().toISOString().slice(0, 10);
const fullName = (f: Pick<Farmer, 'firstName' | 'lastName'>) => `${f.firstName} ${f.lastName}`;

type Row = AttendanceInput & { key: string };
interface Session { startedAt?: string; gps?: Gps; rows: Row[]; photos: string[]; feedback: WorkshopSessionPayload['feedback']; finished?: boolean }
const draftKey = (userId: string, id: string) => `treesyt-demo:v1:workshopSession:${userId}:${id}`;
function readDraft(key: string): Session | null { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }
function writeDraft(key: string, v: Session | null) { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

/** Sessions recorded on this phone and waiting for Sync. */
function usePendingIds() {
  const items = useOutboxStore((s) => s.items);
  return useMemo(() => new Set(items.filter((i) => i.type === 'workshop').map((i) => (i.payload as WorkshopSessionPayload).workshopId)), [items]);
}

/** M10 workshops: today's and upcoming sessions for the facilitator, then recently held. */
export function WorkshopsHomeScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const lk = useLookups();
  const tl = useTrainingLookups();
  const { agent } = useMobileAgent();
  const pending = usePendingIds();
  const mine = useOrgRows(useTrainingStore((s) => s.workshops)).filter((w) => w.agentId === agent?.id);
  const open = mine.filter((w) => w.status === 'PLANNED' && !pending.has(w.id)).sort((a, b) => a.date.localeCompare(b.date));
  const todays = open.filter((w) => w.date <= today());
  const upcoming = open.filter((w) => w.date > today());
  const done = mine.filter((w) => w.status === 'HELD' || w.status === 'ARCHIVED').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const waiting = mine.filter((w) => pending.has(w.id));
  const row = (w: Workshop, badge?: React.ReactNode) => (
    <li key={w.id}><ListRow title={tl.topicName(w.topicId) || w.title} subtitle={`${f.date(w.date, 'EEE d MMM')} · ${w.location} · ${lk.community(w.communityId)}`} badge={badge} onClick={w.status === 'PLANNED' && !pending.has(w.id) ? () => navigate(`/m/workshops/${w.id}`) : undefined} /></li>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m10.workshops')} back />
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-1">
        <section>
          <h2 className="eyebrow mb-2">{t('mobile.m10.today')}</h2>
          {todays.length ? <MList>{todays.map((w) => row(w, w.date < today() ? <Badge tone="danger">{t('ws.overdue')}</Badge> : <Badge tone="info">{t('mobile.m10.todayBadge')}</Badge>))}</MList>
            : <p className="rounded-card border border-line px-4 py-5 text-center text-[14px] text-muted">{t('mobile.m10.noneToday')}</p>}
        </section>
        {waiting.length > 0 && <section><h2 className="eyebrow mb-2">{t('mobile.m10.waiting')}</h2><MList>{waiting.map((w) => row(w, <Badge tone="warning"><CloudUpload className="h-3 w-3" /> {t('mobile.m10.toSync')}</Badge>))}</MList></section>}
        <section>
          <h2 className="eyebrow mb-2">{t('mobile.m10.upcoming')}</h2>
          {upcoming.length ? <MList>{upcoming.map((w) => row(w))}</MList> : <p className="rounded-card border border-line px-4 py-5 text-center text-[14px] text-muted">{t('mobile.m10.noneUpcoming')}</p>}
        </section>
        {done.length > 0 && <section><h2 className="eyebrow mb-2">{t('mobile.m10.recent')}</h2><MList>{done.map((w) => row(w, <Badge tone="success">{t('mobile.m10.attendeesN', { count: w.attendance.length })}</Badge>))}</MList></section>}
      </div>
    </div>
  );
}

export function WorkshopSessionScreen() {
  const { id } = useParams();
  const w = useTrainingStore((s) => s.workshops.find((x) => x.id === id));
  const { orgId } = useActor();
  const { t } = useT();
  if (!w || w.orgId !== orgId || w.status !== 'PLANNED') return <div className="flex min-h-0 flex-1 flex-col"><MobileHeader title={t('mobile.m10.workshops')} back /><p className="px-6 py-10 text-center text-[15px] text-muted">{t('mobile.m10.missing')}</p></div>;
  return <Session key={w.id} w={w} />;
}

function Stars({ value, onChange, label }: { value?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${label}: ${n}`} onClick={() => onChange(n)} className="flex h-9 w-9 items-center justify-center rounded-full active:bg-canvas">
          <Star className={cn('h-6 w-6', value != null && n <= value ? 'fill-warning text-warning' : 'text-line')} />
        </button>
      ))}
    </div>
  );
}

/** Start → attendance (NFC / scan card / thumbprint / search), rating + comment per farmer → photos → finish → feedback. */
function Session({ w }: { w: Workshop }) {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const lk = useLookups();
  const tl = useTrainingLookups();
  const settings = useOrgSettings();
  const { orgId, userId } = useActor();
  const { agent } = useMobileAgent();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const myFarmers = useMyFarmers();
  const community = useCommunityStore((s) => s.communities.find((c) => c.id === w.communityId));
  const forms = useFormStore((s) => s.forms);
  const lists = useFormStore((s) => s.optionLists);
  const fbForm = useMemo(() => boundForm(forms, settings.formBindings ?? {}, orgId, 'workshopFeedback'), [forms, settings.formBindings, orgId]);
  const fbSchema = useMemo(() => (fbForm ? fillSchema(fbForm, lists) : undefined), [fbForm, lists]);
  const key = draftKey(userId ?? '', w.id);
  const [s, setS] = useState<Session>(() => readDraft(key) ?? { rows: [], photos: [], feedback: [] });
  const update = (patch: Partial<Session>) => setS((cur) => { const next = { ...cur, ...patch }; writeDraft(key, next); return next; });
  const [step, setStep] = useState(() => (s.finished ? 4 : s.startedAt ? 1 : 0));
  const [q, setQ] = useState('');
  const [reading, setReading] = useState<AttendanceMethod | null>(null);
  const [guest, setGuest] = useState('');
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [fill, setFill] = useState<{ farmerId?: string; answers: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const rules = settings.training;
  const eligible = useMemo(() => eligibleFarmerIds(w), [w]);
  const byId = useMemo(() => new Map(farmers.map((x) => [x.id, x])), [farmers]);
  const present = new Set(s.rows.map((r) => r.farmerId).filter(Boolean));
  const farmerRows = s.rows.filter((r) => r.farmerId);
  const unrated = rules.ratingRequired ? farmerRows.filter((r) => r.rating == null).length : 0;

  const add = (row: AttendanceInput) => {
    const problem = attendanceProblem(w, row, s.rows);
    if (problem) {
      const fa = row.farmerId ? byId.get(row.farmerId) : undefined;
      toast.error(t(`ws.err.${problem}`, { name: fa ? fullName(fa) : row.guestName }));
      return false;
    }
    update({ rows: [{ ...row, key: `${Date.now()}_${s.rows.length}`, at: new Date().toISOString() }, ...s.rows] });
    return true;
  };
  /** Simulated readers: the card, QR code or thumbprint of a farmer from the community not yet marked. */
  const read = async (method: Exclude<AttendanceMethod, 'MANUAL'>) => {
    setReading(method);
    await latency(800, 1000);
    setReading(null);
    const pool = [...eligible].map((x) => byId.get(x)).filter((x): x is Farmer => !!x && !present.has(x.id)
      && (method === 'NFC' ? !!x.identity.nfcCard : method === 'THUMBPRINT' ? !!(x.identity.thumbprints.left || x.identity.thumbprints.right) : true));
    const fa = pool[Math.floor(Math.random() * pool.length)];
    if (!fa) { toast.error(t('mobile.m10.noMatch')); return; }
    if (add({ farmerId: fa.id, method })) toast.success(t(`mobile.m10.read.${method}`, { name: fullName(fa) }));
  };
  const query = q.trim().toLowerCase();
  const results = query ? myFarmers.filter((x) => `${fullName(x)} ${x.farmerCode}`.toLowerCase().includes(query)).slice(0, 8) : [];
  const setRow = (k: string, patch: Partial<Row>) => update({ rows: s.rows.map((r) => (r.key === k ? { ...r, ...patch } : r)) });

  const submit = async () => {
    setBusy(true);
    const payload: WorkshopSessionPayload = {
      workshopId: w.id, startedAt: s.startedAt, gps: s.gps, photos: s.photos, feedback: s.feedback, agentId: agent?.id,
      attendance: s.rows.map(({ key: _k, ...r }) => r).reverse(),
    };
    try {
      const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'workshop', label: t('mobile.m10.outboxLabel', { title: tl.topicName(w.topicId) }), payload });
      writeDraft(key, null);
      toast.success(t(savedKey(queued)), { description: t('mobile.m10.submitted', { count: s.rows.length }) });
      navigate('/m/workshops');
    } catch (e) {
      toast.error(t(`ws.err.${(e as Error).message}`, { defaultValue: (e as Error).message }));
    } finally { setBusy(false); }
  };

  if (fill && fbSchema) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={fbForm!.name} back />
        <MobileFormRenderer form={fbSchema} answers={fill.answers} onChange={(answers) => setFill({ ...fill, answers })} finishLabel={t('mobile.m10.saveFeedback')}
          onFinish={() => { update({ feedback: [...s.feedback, { formId: fbForm!.id, answers: fill.answers, subject: fill.farmerId ? { entity: 'farmer', id: fill.farmerId } : undefined }] }); setFill(null); toast.success(t('mobile.m10.feedbackAdded')); }}
          before={[{ title: t('mobile.m10.whoFeedback'), valid: !!fill.farmerId, content: (
            <div className="space-y-2">
              <p className="text-[15px] text-body">{t('mobile.m10.whoFeedbackHint')}</p>
              <MList>{farmerRows.map((r) => { const fa = byId.get(r.farmerId!); const done = s.feedback.some((x) => x.subject?.id === r.farmerId); return (
                <li key={r.key}><button type="button" disabled={done} onClick={() => setFill({ ...fill, farmerId: r.farmerId })} className={cn('flex min-h-[56px] w-full items-center gap-3 px-4 text-left disabled:opacity-50', fill.farmerId === r.farmerId && 'bg-brand-soft')}>
                  <span className="flex-1 font-medium text-ink">{fa ? fullName(fa) : '—'}</span>{done ? <Badge tone="success">{t('mobile.m10.given')}</Badge> : fill.farmerId === r.farmerId && <CheckCircle2 className="h-5 w-5 text-brand" />}
                </button></li>
              ); })}</MList>
            </div>
          ) }]} />
      </div>
    );
  }

  const title = tl.topicName(w.topicId) || w.title;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={title} back />
      <MobileWizard step={step} onStep={setStep} busy={busy} finishLabel={t('mobile.m10.submit')} onFinish={() => void submit()} steps={[
        {
          key: 'start', title: t('mobile.m10.start'), valid: !!s.gps, hint: s.gps ? undefined : t('mobile.m10.gpsHint'), content: (
            <div className="space-y-4">
              <div className="rounded-card bg-badge-dark p-5 text-white shadow-soft">
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/70">{f.date(w.date, 'EEEE d MMMM')}</div>
                <div className="mt-1 text-[20px] font-semibold leading-tight">{title}</div>
                <div className="mt-1 text-[13px] text-white/80">{`${w.location} · ${lk.community(w.communityId)}${w.groupId ? ` · ${tl.group(w.groupId)}` : ''}`}</div>
                <div className="mt-3 flex gap-4 text-[13px]"><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{t('mobile.m10.expectedN', { count: w.expected })}</span><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{t('ws.minutes', { n: tl.topic(w.topicId)?.durationMin ?? 0 })}</span></div>
              </div>
              {tl.topic(w.topicId)?.materials.length ? <p className="text-[14px] text-body"><span className="font-medium text-ink">{t('ws.materials')}:</span> {tl.topic(w.topicId)!.materials.join(', ')}</p> : null}
              <MField label={t('mobile.m10.location')} group help={t('mobile.m10.locationHelp')}>
                <GpsCapture value={s.gps} onChange={(gps) => update({ gps, startedAt: s.startedAt ?? new Date().toISOString() })} base={community?.gps ?? { lat: 9.4, lng: -0.85 }} big />
              </MField>
              <p className="text-[13px] text-muted">{rules.membersOnly ? t(w.groupId ? 'mobile.m10.ruleGroup' : 'mobile.m10.ruleCommunity') : t('mobile.m10.ruleAnyone')}</p>
            </div>
          ),
        },
        {
          key: 'attendance', title: t('mobile.m10.attendance'), valid: s.rows.length > 0 && unrated === 0,
          hint: !s.rows.length ? t('mobile.m10.needOne') : unrated ? t('mobile.m10.unrated', { count: unrated }) : t('mobile.m10.presentOf', { n: s.rows.length, expected: w.expected }), content: (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {([['NFC', Nfc, 'mobile.m10.tap'], ['QR', QrCode, 'mobile.m10.scan'], ['THUMBPRINT', Fingerprint, 'mobile.m10.thumb']] as const).map(([m, Icon, label]) => (
                  <Button key={m} variant="secondary" className="h-20 flex-col gap-1.5 text-[13px]" disabled={!!reading} onClick={() => void read(m)}><Icon className={cn('h-6 w-6', reading === m && 'animate-pulse')} />{reading === m ? t('mobile.m10.reading') : t(label)}</Button>
                ))}
              </div>
              <MSearch value={q} onChange={setQ} placeholder={t('mobile.m10.search')} />
              {results.length > 0 && <MList>{results.map((x) => { const ok = eligible.has(x.id); return (
                <li key={x.id}><ListRow title={fullName(x)} subtitle={`${x.farmerCode} · ${lk.community(x.communityId)}`} badge={present.has(x.id) ? <Badge tone="success">{t('mobile.m10.present')}</Badge> : !ok ? <Badge tone="neutral">{t('mobile.m10.notMember')}</Badge> : undefined}
                  onClick={present.has(x.id) ? undefined : () => { if (add({ farmerId: x.id, method: 'MANUAL' })) setQ(''); }} /></li>
              ); })}</MList>}
              {query && !results.length && <p className="text-center text-[14px] text-muted">{t('mobile.m10.noResults')}</p>}
              {rules.allowGuests && (
                <div className="flex gap-2">
                  <input className={mInput} value={guest} onChange={(e) => setGuest(e.target.value)} placeholder={t('mobile.m10.guestName')} aria-label={t('mobile.m10.guestName')} />
                  <Button size="lg" variant="secondary" disabled={!guest.trim()} onClick={() => { if (add({ guestName: guest, method: 'MANUAL' })) setGuest(''); }} aria-label={t('mobile.m10.addGuest')}><UserPlus /></Button>
                </div>
              )}
              <div className="flex items-center justify-between"><h2 className="eyebrow">{t('mobile.m10.presentN', { count: s.rows.length })}</h2><span className="tnum text-[13px] text-muted">{t('mobile.m10.presentOf', { n: s.rows.length, expected: w.expected })}</span></div>
              <ul className="space-y-2">
                {s.rows.map((r) => { const fa = r.farmerId ? byId.get(r.farmerId) : undefined; return (
                  <li key={r.key} className="rounded-card border border-line bg-surface p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-ink">{fa ? fullName(fa) : r.guestName}{!fa && <Badge tone="neutral" className="ml-2">{t('ws.guest')}</Badge>}</div>
                        <div className="text-[12px] text-muted">{`${fa?.farmerCode ?? t('ws.guest')} · ${t(`ws.methodName.${r.method}`)}`}</div>
                      </div>
                      <button type="button" onClick={() => update({ rows: s.rows.filter((x) => x.key !== r.key) })} aria-label={t('mobile.m10.remove', { name: fa ? fullName(fa) : r.guestName })} className="rounded-full p-2 text-muted active:bg-canvas"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {fa && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Stars value={r.rating} onChange={(rating) => setRow(r.key, { rating })} label={t('mobile.m10.rateName', { name: fullName(fa) })} />
                        <Button size="sm" variant="ghost" onClick={() => setCommentFor(commentFor === r.key ? null : r.key)}><MessageSquarePlus /> {r.comment ? t('mobile.m10.editComment') : t('mobile.m10.comment')}</Button>
                      </div>
                    )}
                    {fa && commentFor === r.key && <textarea className="mt-2 w-full rounded-ctl border border-line bg-surface p-3 text-[15px] text-ink" rows={2} value={r.comment ?? ''} onChange={(e) => setRow(r.key, { comment: e.target.value })} aria-label={t('mobile.m10.commentFor', { name: fullName(fa) })} placeholder={t('mobile.m10.commentPlaceholder')} autoFocus />}
                    {fa && commentFor !== r.key && r.comment && <p className="mt-1 text-[13px] italic text-body">{`“${r.comment}”`}</p>}
                  </li>
                ); })}
              </ul>
            </div>
          ),
        },
        {
          key: 'photos', title: t('mobile.m10.photos'), valid: s.photos.length > 0, hint: s.photos.length ? undefined : t('mobile.m10.photoHint'), content: (
            <MField label={t('mobile.m10.photosLabel')} group help={t('mobile.m10.photosHelp')}><PhotoPicker value={s.photos} onChange={(photos) => update({ photos })} max={4} big /></MField>
          ),
        },
        {
          key: 'finish', title: t('mobile.m10.finish'), valid: true, content: <Summary w={w} rows={s.rows} photos={s.photos.length} onFinish={() => { update({ finished: true }); setStep(4); }} finished={!!s.finished} />,
        },
        {
          key: 'feedback', title: t('mobile.m10.feedback'), valid: !!s.finished, hint: s.finished ? t('mobile.m10.feedbackN', { count: s.feedback.length }) : t('mobile.m10.finishFirst'), content: (
            <div className="space-y-4">
              <p className="text-[15px] text-body">{fbSchema ? t('mobile.m10.feedbackHint') : t('mobile.m10.noFeedbackForm')}</p>
              {s.feedback.length > 0 && <MList>{s.feedback.map((fb, i) => { const fa = fb.subject ? byId.get(fb.subject.id) : undefined; return <li key={i}><ListRow title={fa ? fullName(fa) : t('mobile.m10.anonymous')} subtitle={fbForm?.name} badge={<Badge tone="success">{t('mobile.m10.given')}</Badge>} /></li>; })}</MList>}
              {fbSchema && <Button size="lg" variant="secondary" className="w-full" disabled={!s.finished || s.feedback.length >= farmerRows.length} onClick={() => setFill({ answers: defaultAnswers(fbSchema) })}><MessageSquarePlus /> {t('mobile.m10.addFeedback')}</Button>}
            </div>
          ),
        },
      ]} />
    </div>
  );
}

function Summary({ w, rows, photos, finished, onFinish }: { w: Workshop; rows: Row[]; photos: number; finished: boolean; onFinish: () => void }) {
  const { t } = useT();
  const f = useFormat();
  const settings = useOrgSettings();
  const farmers = rows.filter((r) => r.farmerId);
  const rated = farmers.filter((r) => r.rating != null);
  const avg = rated.length ? rated.reduce((s, r) => s + r.rating!, 0) / rated.length : null;
  const { minForCommission: min, maxForCommission: max } = settings.training;
  const counts = farmers.length >= min && farmers.length <= max;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {([[t('mobile.m10.farmers'), f.number(farmers.length)], [t('ws.guests'), f.number(rows.length - farmers.length)], [t('ws.avgRating'), avg == null ? '—' : `${f.number(avg, { maximumFractionDigits: 1 })} / 5`], [t('mobile.m10.photos'), f.number(photos)]] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-ctl border border-line px-3 py-2.5"><div className="text-[12px] text-muted">{k}</div><div className="tnum text-[20px] font-semibold text-ink">{v}</div></div>)}
      </div>
      <div className={cn('rounded-card border p-4 text-[14px]', counts ? 'border-success/40 bg-success/5 text-ink' : 'border-warning/40 bg-warning/5 text-ink')}>
        {counts ? t('mobile.m10.counts', { min, max }) : farmers.length < min ? t('mobile.m10.belowMin', { n: farmers.length, min }) : t('mobile.m10.aboveMax', { n: farmers.length, max })}
      </div>
      <p className="text-[13px] text-muted">{t('mobile.m10.expectedVs', { n: rows.length, expected: w.expected })}</p>
      {finished ? <p className="flex items-center gap-2 text-[15px] font-medium text-success"><CheckCircle2 className="h-5 w-5" /> {t('mobile.m10.finished')}</p>
        : <Button size="lg" className="w-full" onClick={onFinish}><CheckCircle2 /> {t('mobile.m10.finishWorkshop')}</Button>}
    </div>
  );
}

