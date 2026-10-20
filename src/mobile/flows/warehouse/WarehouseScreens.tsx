import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, ClipboardList, PackageCheck, PackageMinus, Plus, Receipt, Scale, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { BagReceipt, Inbound, StockCount } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { PhotoPicker, SimCapture } from '@/components/forms/media';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MSelect, MobileWizard, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { nextBagCode } from '@/services/buyingService';
import { repaymentExpected, scheduleCount, tolerancePct, type ReceiveResult } from '@/services/inventoryService';
import { saveOrQueue } from '@/services/mobileSync';
import { cn, latency } from '@/lib/utils';
import { useBuyingStore } from '@/stores/buyingStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useWarehouseStore } from '@/stores/warehouseStore';
import { useActor, useCurrentUser, useFormat, useLang, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';
import { useLookups } from '@/web/features/people/shared';
import { useInventory } from '@/web/features/inventory/shared';

/** The officer's warehouse: their agent record's, or the first one they are an officer of. */
export function useMyWarehouse() {
  const { agent } = useMobileAgent();
  const user = useCurrentUser();
  const inv = useInventory();
  return inv.warehouses.find((w) => w.id === agent?.warehouseId) ?? inv.warehouses.find((w) => user && w.officerUserIds.includes(user.id)) ?? inv.warehouses[0];
}

const r1 = (kg: number) => Math.round(kg * 10) / 10;

/** M8 home: stock, expected deliveries, open discrepancies and the officer's actions. */
export function WarehouseScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const lk = useLookups();
  const inv = useInventory();
  const wh = useMyWarehouse();
  const inbounds = useOrgRows(useWarehouseStore((s) => s.inbounds));
  const discrepancies = useOrgRows(useWarehouseStore((s) => s.discrepancies));
  const counts = useOrgRows(useWarehouseStore((s) => s.stockCounts));
  if (!wh) return null;
  const expected = inbounds.filter((x) => x.warehouseId === wh.id && x.status === 'PENDING').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const open = discrepancies.filter((d) => d.warehouseId === wh.id && d.status === 'OPEN');
  const dueCount = counts.find((c) => c.warehouseId === wh.id && c.status === 'SCHEDULED');
  const stock = inv.stockBags(wh.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={wh.name} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-badge-dark p-5 text-white shadow-soft">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/70">{t('inv.stock')}</div>
          <div className="tnum mt-1 text-[30px] font-semibold tracking-[-0.02em]">{f.kg(inv.stockKg(wh.id))}</div>
          <div className="text-[13px] text-white/80">{t('buy.bagsN', { count: stock.length })} · {t('inv.utilisation', { pct: wh.capacityKg ? Math.round((inv.stockKg(wh.id) / wh.capacityKg) * 100) : 0 })}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => (expected[0] ? navigate(`/m/warehouse/receive/${expected[0].id}`) : toast.info(t('inv.noExpected')))}><PackageCheck /> {t('mobile.m8.receive')}</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/m/warehouse/outbound')}><PackageMinus /> {t('mobile.m8.outbound')}</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate(`/m/warehouse/count${dueCount ? `/${dueCount.id}` : ''}`)}><ClipboardList /> {t('mobile.m8.count')}</Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/m/warehouse/expenses')}><Receipt /> {t('mobile.m8.expenses')}</Button>
        </div>
        {dueCount && <button type="button" onClick={() => navigate(`/m/warehouse/count/${dueCount.id}`)} className="flex w-full items-start gap-3 rounded-ctl border border-info/30 bg-info/5 px-4 py-3 text-left text-[14px] text-ink"><ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-info" />{t('mobile.m8.countDue', { number: dueCount.number, date: f.date(dueCount.scheduledFor) })}</button>}
        <section>
          <h2 className="eyebrow mb-2">{t('inv.tab.expected')}</h2>
          {expected.length ? (
            <MList>
              {expected.map((x) => <li key={x.id}><ListRow title={x.source.kind === 'TRANSFER' ? t('inv.fromWarehouse', { name: inv.warehouseName(x.source.fromWarehouseId) }) : lk.agent(x.agentId)} subtitle={`${x.number} · ${t('buy.bagsN', { count: x.bags.length })} · ${f.kg(x.expectedKg)}`} badge={x.source.kind === 'TRANSFER' ? <Badge tone="info"><ArrowRightLeft className="h-3 w-3" /> {t('inv.kind.TRANSFER')}</Badge> : undefined} onClick={() => navigate(`/m/warehouse/receive/${x.id}`)} /></li>)}
            </MList>
          ) : <p className="rounded-card border border-line px-4 py-5 text-center text-[14px] text-muted">{t('inv.noExpected')}</p>}
        </section>
        <section>
          <h2 className="eyebrow mb-2">{t('inv.tab.discrepancies')}</h2>
          {open.length ? (
            <MList>
              {open.map((d) => <li key={d.id}><ListRow title={`${d.bagCode} · ${t(`inv.dType.${d.type}`)}`} subtitle={`${lk.agent(d.agentId)} · −${f.kg(d.openKg)}`} right={<AlertTriangle className="h-5 w-5 text-danger" />} onClick={() => navigate(`/m/warehouse/resolve/${d.id}`)} /></li>)}
            </MList>
          ) : <p className="rounded-card border border-line px-4 py-5 text-center text-[14px] text-muted">{t('inv.noDiscrepancies')}</p>}
        </section>
      </div>
    </div>
  );
}

interface Row { code: string; expectedKg: number; status: Exclude<BagReceipt, 'TOP_UP'> | null; kg: string; newCode?: string }

/** M8 Receive inbound (or a transfer): scan each bag → weigh → summary with discrepancies → confirm. */
export function ReceiveScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const lk = useLookups();
  const inv = useInventory();
  const settings = useOrgSettings();
  const x = useWarehouseStore((s) => s.inbounds.find((y) => y.id === id));
  const [rows, setRows] = useState<Row[]>(() => (x ? x.bags.map((b) => ({ code: b.code, expectedKg: b.expectedKg, status: null, kg: '' })) : []));
  const [topUps, setTopUps] = useState<{ code: string; kg: string }[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [done, setDone] = useState<{ queued: boolean; result?: ReceiveResult } | null>(null);
  const [step, setStep] = useState(0);
  if (!x) return null;
  const pack = settings.packaging.find((p) => p.commodityId === x.commodityId);
  const tol = tolerancePct(orgId, x.commodityId, x.source.kind === 'TRANSFER' ? 'TRANSFER' : 'INBOUND');
  const set = (code: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  const scanNext = () => { const next = rows.find((r) => !r.status); if (next) set(next.code, { status: 'ORIGINAL' }); return next?.code ?? ''; };
  const readScale = async (code: string) => {
    setReading(code);
    await latency(900, 900);
    const r = rows.find((y) => y.code === code)!;
    // Most bags weigh what was expected; a few have lost a little.
    const kg = r1(r.expectedKg * (Math.random() < 0.8 ? 1 - Math.random() * 0.003 : 0.95 + Math.random() * 0.03));
    set(code, { kg: String(kg) });
    setReading(null);
  };
  const received = rows.filter((r) => r.status && r.status !== 'MISSING');
  const preview = rows.map((r) => {
    const kg = r.status === 'MISSING' ? 0 : Number(r.kg || 0);
    const loss = r.expectedKg - kg;
    const pct = r.expectedKg ? (loss / r.expectedKg) * 100 : 0;
    return { ...r, kg, loss: r1(loss), pct, auto: r.status !== 'MISSING' && loss > 0.05 && pct <= tol && settings.inventoryRules.autoWriteOff, issue: r.status === 'MISSING' || (loss > 0.05 && !(pct <= tol && settings.inventoryRules.autoWriteOff)), outOfBounds: !!pack && r.status !== 'MISSING' && kg > 0 && (kg < pack.minKg || kg > pack.maxKg) };
  });
  const save = async () => {
    const payload = { inboundId: x.id, bags: rows.map((r) => ({ code: r.code, status: r.status ?? 'MISSING', receivedKg: Number(r.kg || 0), newCode: r.newCode })), topUps: topUps.filter((u) => Number(u.kg) > 0).map((u) => ({ code: u.code, kg: Number(u.kg) })), actorId: userId ?? '' };
    const { queued, result } = await saveOrQueue<ReceiveResult>({ orgId, userId: userId ?? '', type: 'inboundReceive', label: t('mobile.m8.receiveLabel', { number: x.number }), payload });
    setDone({ queued, result });
  };

  if (done) {
    const res = done.result;
    const open = res ? res.discrepancies.filter((d) => d.status === 'OPEN') : preview.filter((p) => p.issue);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('mobile.m8.received')} />
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-2">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            {open.length ? <AlertTriangle className="h-12 w-12 text-warning" /> : <CheckCircle2 className="h-12 w-12 text-success" />}
            <div className="text-[18px] font-semibold text-ink">{t(done.queued ? 'mobile.savedOffline' : open.length ? 'mobile.m8.withDiscrepancies' : 'mobile.m8.confirmed', { count: open.length })}</div>
            <div className="text-[15px] text-body">{x.number} · {inv.warehouseName(x.warehouseId)}</div>
          </div>
          <ol className="space-y-2">
            {(['received', 'missing', 'autoWriteOff', 'weight', 'stock'] as const).map((k) => {
              const n = k === 'received' ? received.length : k === 'missing' ? preview.filter((p) => p.status === 'MISSING').length : k === 'autoWriteOff' ? preview.filter((p) => p.auto).length : k === 'weight' ? preview.filter((p) => p.issue && p.status !== 'MISSING').length : 0;
              return <li key={k} className="flex items-center gap-3 rounded-ctl border border-line px-4 py-3 text-[14px]"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" /><span className="flex-1 text-ink">{t(`mobile.m8.pipe.${k}`, { count: n, kg: f.kg(res?.inbound.receivedKg ?? received.reduce((s, r) => s + Number(r.kg || 0), 0)) })}</span></li>;
            })}
          </ol>
          {!!res?.allocations.length && <p className="rounded-ctl bg-canvas px-4 py-3 text-[13px] text-body">{t('inv.allocated', { list: res.allocations.map((a) => `${a.inboundNumber} ${f.kg(a.kg)}`).join(', ') })}</p>}
          {open.length > 0 && x.source.kind === 'PRE' && <p className="rounded-ctl border border-warning/40 bg-warning/5 px-4 py-3 text-[14px] text-ink">{t('mobile.m8.agentNotified', { name: lk.agent(x.agentId) })}</p>}
        </div>
        <div className="shrink-0 border-t border-line p-4"><Button size="lg" className="w-full" onClick={() => navigate('/m/warehouse')}>{t('mobile.m5.done')}</Button></div>
      </div>
    );
  }

  const unscanned = rows.filter((r) => !r.status).length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m8.receive')} back />
      <MobileWizard
        step={step} onStep={setStep}
        finishLabel={online ? t('mobile.m8.confirmReceipt') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'scan', title: t('mobile.m8.scanBags'), valid: true, hint: unscanned ? t('mobile.m8.unscannedHint', { count: unscanned }) : undefined, content: (
              <div className="space-y-4">
                <div className="rounded-card bg-brand-soft p-4">
                  <div className="text-[15px] font-semibold text-ink">{x.source.kind === 'TRANSFER' ? t('inv.fromWarehouse', { name: inv.warehouseName(x.source.fromWarehouseId) }) : lk.agent(x.agentId)}</div>
                  <div className="text-[13px] text-body">{x.number} · {lk.commodity(x.commodityId)} · {t('buy.bagsN', { count: x.bags.length })} · {f.kg(x.expectedKg)}</div>
                </div>
                <SimCapture kind="scanCode" value={undefined} onChange={() => {}} make={scanNext} label={t('mobile.m5.scanBag')} big />
                <MList>
                  {rows.map((r) => (
                    <li key={r.code} className="px-4 py-3">
                      <div className="mb-2 flex items-center justify-between"><span className="font-mono text-[14px] text-ink">{r.code}</span><span className="tnum text-[13px] text-muted">{f.kg(r.expectedKg)}</span></div>
                      <Segmented value={(r.status ?? '') as Row['status'] & string} onChange={(v) => set(r.code, { status: v as Row['status'], newCode: v === 'REPLACED' ? r.newCode ?? nextBagCode(orgId, rows.findIndex((y) => y.code === r.code)) : undefined })} label={r.code}
                        options={(['ORIGINAL', 'MISSING', 'REPLACED'] as const).map((s) => ({ value: s, label: t(`mobile.m8.bag.${s}`) }))} />
                      {r.status === 'REPLACED' && <input value={r.newCode ?? ''} onChange={(e) => set(r.code, { newCode: e.target.value.toUpperCase() })} className={cn(mInput, 'mt-2 font-mono')} aria-label={t('inv.newTag')} placeholder={t('inv.newTag')} />}
                    </li>
                  ))}
                </MList>
                {unscanned > 0 && <Button variant="link" size="sm" onClick={() => setRows(rows.map((r) => (r.status ? r : { ...r, status: 'ORIGINAL' })))}>{t('buy.scanAll')}</Button>}
              </div>
            ),
          },
          {
            key: 'weigh', title: t('mobile.m8.weigh'), valid: received.every((r) => Number(r.kg) > 0) && topUps.every((u) => !u.kg || Number(u.kg) > 0), content: (
              <div className="space-y-3">
                {pack && <p className="text-[13px] text-muted">{t('mobile.m8.bounds', { min: f.kg(pack.minKg), max: f.kg(pack.maxKg) })}</p>}
                {received.map((r) => {
                  const p = preview.find((y) => y.code === r.code)!;
                  return (
                    <div key={r.code} className="rounded-ctl border border-line p-3">
                      <div className="mb-2 flex items-center justify-between"><span className="font-mono text-[14px] text-ink">{r.newCode ?? r.code}</span><span className="text-[13px] text-muted">{t('mobile.m8.expectedKg', { kg: f.kg(r.expectedKg) })}</span></div>
                      <div className="flex gap-2">
                        <input type="number" inputMode="decimal" value={r.kg} onChange={(e) => set(r.code, { kg: e.target.value })} className={cn(mInput, p.issue && r.kg && 'border-warning')} aria-label={`${t('inv.receivedKg')} ${r.code}`} />
                        <Button size="lg" variant="secondary" disabled={reading === r.code} onClick={() => void readScale(r.code)}><Scale className={cn(reading === r.code && 'animate-pulse')} /> {reading === r.code ? t('mobile.m5.reading') : t('mobile.m5.readScale')}</Button>
                      </div>
                      {r.kg && p.loss > 0.05 && <p className={cn('mt-1 text-[13px]', p.auto ? 'text-muted' : 'text-warning')}>{t(p.auto ? 'mobile.m8.autoLine' : 'mobile.m8.lossLine', { kg: f.kg(p.loss), pct: f.number(p.pct, { maximumFractionDigits: 1 }) })}</p>}
                      {p.outOfBounds && <p className="mt-1 text-[13px] text-warning">{t('mobile.m8.outOfBounds')}</p>}
                    </div>
                  );
                })}
                {topUps.map((u, i) => (
                  <div key={u.code} className="rounded-ctl border border-brand/30 bg-brand-soft/50 p-3">
                    <div className="mb-2 flex items-center justify-between"><span className="font-mono text-[14px] text-ink">{u.code}</span><Badge tone="teal">{t('status.BAG_TOP_UP')}</Badge></div>
                    <input type="number" inputMode="decimal" value={u.kg} onChange={(e) => setTopUps(topUps.map((y, j) => (j === i ? { ...y, kg: e.target.value } : y)))} className={mInput} aria-label={`${t('inv.receivedKg')} ${u.code}`} />
                  </div>
                ))}
                <Button variant="secondary" size="lg" className="w-full" onClick={() => setTopUps([...topUps, { code: nextBagCode(orgId, rows.length + topUps.length), kg: '' }])}><Plus /> {t('mobile.m8.addTopUp')}</Button>
              </div>
            ),
          },
          {
            key: 'summary', title: t('mobile.m8.summary'), content: (
              <div className="space-y-3">
                <dl className="divide-y divide-line rounded-card border border-line text-[15px]">
                  {([
                    [t('inv.expectedKg'), f.kg(x.expectedKg)],
                    [t('inv.receivedKg'), f.kg(r1(received.reduce((s, r) => s + Number(r.kg || 0), 0) + topUps.reduce((s, u) => s + Number(u.kg || 0), 0)))],
                    [t('mobile.m8.bagsReceived'), `${received.length} / ${rows.length}`],
                    [t('inv.tolerance'), `${f.number(tol)}%`],
                  ] as const).map(([k, v]) => <div key={k} className="flex justify-between px-4 py-3"><dt className="text-muted">{k}</dt><dd className="tnum font-medium text-ink">{v}</dd></div>)}
                </dl>
                {preview.filter((p) => p.issue || p.auto).map((p) => (
                  <div key={p.code} className={cn('flex items-center justify-between rounded-ctl px-4 py-3 text-[14px]', p.issue ? 'bg-danger/5 text-ink' : 'bg-canvas text-body')}>
                    <span className="font-mono">{p.code}</span>
                    <span>{p.status === 'MISSING' ? t('mobile.m8.bag.MISSING') : p.auto ? t('mobile.m8.autoShort', { kg: f.kg(p.loss) }) : t('mobile.m8.lossShort', { kg: f.kg(p.loss), pct: f.number(p.pct, { maximumFractionDigits: 1 }) })}</span>
                  </div>
                ))}
                {!preview.some((p) => p.issue || p.auto) && <p className="flex items-center gap-2 rounded-ctl bg-success/10 px-4 py-3 text-[14px] text-ink"><CheckCircle2 className="h-4 w-4 text-success" />{t('mobile.m8.allGood')}</p>}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/** M8 Outbound / transfer: scan bags → type and destination → confirm. */
export function OutboundScreen() {
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const inv = useInventory();
  const wh = useMyWarehouse();
  const bags = wh ? inv.stockBags(wh.id).slice().sort((a, b) => a.code.localeCompare(b.code)) : [];
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<'TRANSFER' | 'OUTBOUND'>('TRANSFER');
  const dests = inv.warehouses.filter((w) => w.id !== wh?.id && w.status === 'ACTIVE');
  const [to, setTo] = useState(dests[0]?.id ?? '');
  if (!wh) return null;
  const kg = r1(bags.filter((b) => picked.includes(b.code)).reduce((s, b) => s + b.weightKg, 0));
  const save = async () => {
    const payload = { orgId, fromWarehouseId: wh.id, kind, toWarehouseId: kind === 'TRANSFER' ? to : undefined, receivingOfficerId: kind === 'TRANSFER' ? inv.warehouse(to)?.officerUserIds[0] : undefined, bagCodes: picked, actorId: userId ?? '' };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'transfer', label: t('mobile.m8.transferLabel', { count: picked.length }), payload });
    toast.success(t(savedKey(queued)), { description: t(kind === 'TRANSFER' ? 'mobile.m8.transferSent' : 'mobile.m8.outboundDone', { count: picked.length, kg: f.kg(kg), to: inv.warehouseName(to) }) });
    navigate('/m/warehouse');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m8.outbound')} back />
      <MobileWizard
        finishLabel={online ? t('mobile.m8.confirmOutbound') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'bags', title: t('mobile.m8.scanBags'), valid: picked.length > 0, hint: t('inv.pickedLine', { count: picked.length, kg: f.kg(kg) }), content: (
              <div className="space-y-3">
                <SimCapture kind="scanCode" value={undefined} onChange={() => {}} make={() => { const next = bags.find((b) => !picked.includes(b.code)); if (next) setPicked((p) => [...p, next.code]); return next?.code ?? ''; }} label={t('mobile.m5.scanBag')} big />
                <MList>
                  {bags.slice(0, 80).map((b) => {
                    const on = picked.includes(b.code);
                    return <li key={b.id}><button type="button" role="checkbox" aria-checked={on} onClick={() => setPicked(on ? picked.filter((c) => c !== b.code) : [...picked, b.code])} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left active:bg-brand-soft"><span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border', on ? 'border-brand bg-brand text-white' : 'border-line')}>{on && <CheckCircle2 className="h-4 w-4" />}</span><span className="flex-1 font-mono text-[14px] text-ink">{b.code}</span><span className="tnum text-[13px] text-muted">{f.kg(b.weightKg)}</span></button></li>;
                  })}
                </MList>
              </div>
            ),
          },
          {
            key: 'where', title: t('mobile.m8.where'), valid: kind === 'OUTBOUND' || !!to, content: (
              <div className="space-y-4">
                <MField label={t('col.type')} group><Segmented value={kind} onChange={setKind} label={t('col.type')} options={(['TRANSFER', 'OUTBOUND'] as const).map((k) => ({ value: k, label: t(`inv.kind.${k}`) }))} /></MField>
                {kind === 'TRANSFER' && <MField label={t('inv.to')}><MSelect value={to} onChange={setTo} label={t('inv.to')} options={dests.map((w) => ({ value: w.id, label: w.name }))} /></MField>}
                <div className="flex items-baseline justify-between rounded-ctl bg-brand-soft px-4 py-3"><span className="text-[14px] text-body">{t('buy.bagsN', { count: picked.length })}</span><span className="tnum text-[22px] font-semibold text-ink">{f.kg(kg)}</span></div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/** M8 Stock count: scan all bags → summary vs expected → photos → submit. */
export function CountScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const inv = useInventory();
  const wh = useMyWarehouse();
  const existing = useWarehouseStore((s) => s.stockCounts.find((c) => c.id === id));
  const [countId, setCountId] = useState<string | undefined>(existing?.id);
  const [codes, setCodes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const blind = settings.inventoryRules.stockCount.blind;
  if (!wh) return null;
  const expected = inv.stockBags(wh.id);
  const start = () => { const c = scheduleCount(orgId, wh.id, new Date().toISOString().slice(0, 10), userId ?? 'system'); setCountId(c.id); };
  if (!countId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('mobile.m8.count')} back />
        <div className="space-y-3 px-5 py-8 text-center"><p className="text-[15px] text-body">{t('mobile.m8.noCountDue')}</p><Button size="lg" onClick={start}><Plus /> {t('mobile.m8.startCount')}</Button></div>
      </div>
    );
  }
  const counted = new Set(codes);
  const missing = expected.filter((b) => !counted.has(b.code));
  const save = async () => {
    const { queued } = await saveOrQueue<StockCount>({ orgId, userId: userId ?? '', type: 'stockCount', label: t('mobile.m8.countLabel', { warehouse: wh.name }), payload: { countId, codes, photos } });
    toast.success(t(savedKey(queued)), { description: missing.length ? t('mobile.m8.countMissing', { count: missing.length }) : t('mobile.m8.countMatch') });
    navigate('/m/warehouse');
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m8.count')} back />
      <MobileWizard
        finishLabel={online ? t('inv.submitCount') : t('mobile.surveys.saveForSync')}
        onFinish={() => void save()}
        steps={[
          {
            key: 'scan', title: t('mobile.m8.scanAll'), valid: codes.length > 0, hint: blind ? t('mobile.m8.scannedN', { count: codes.length }) : t('mobile.m8.scannedOf', { count: codes.length, total: expected.length }), content: (
              <div className="space-y-3">
                {blind && <p className="rounded-ctl bg-canvas px-4 py-3 text-[13px] text-body">{t('mobile.m8.blindHint')}</p>}
                <SimCapture kind="scanCode" value={undefined} onChange={() => {}} make={() => { const next = expected.find((b) => !codes.includes(b.code)); if (next) setCodes((c) => [...c, next.code]); return next?.code ?? ''; }} label={t('mobile.m5.scanBag')} big />
                <Button variant="link" size="sm" onClick={() => setCodes(expected.slice(0, Math.max(0, expected.length - 1)).map((b) => b.code))}>{t('mobile.m8.scanAllButOne')}</Button>
                <div className="flex flex-wrap gap-1.5">{codes.slice(-24).map((c) => <span key={c} className="rounded-chip bg-brand-soft px-2 py-1 font-mono text-[12px] text-ink">{c}</span>)}</div>
              </div>
            ),
          },
          {
            key: 'summary', title: t('mobile.m8.summary'), content: (
              <div className="space-y-3">
                <dl className="divide-y divide-line rounded-card border border-line text-[15px]">
                  <div className="flex justify-between px-4 py-3"><dt className="text-muted">{t('inv.expected')}</dt><dd className="tnum font-medium">{`${t('buy.bagsN', { count: expected.length })} · ${f.kg(inv.kg(expected))}`}</dd></div>
                  <div className="flex justify-between px-4 py-3"><dt className="text-muted">{t('inv.counted')}</dt><dd className="tnum font-medium">{`${t('buy.bagsN', { count: codes.length })} · ${f.kg(inv.kg(expected.filter((b) => counted.has(b.code))))}`}</dd></div>
                </dl>
                {missing.length ? <p className="rounded-ctl border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-ink">{t('mobile.m8.notFound', { list: missing.map((b) => b.code).join(', ') })}</p> : <p className="flex items-center gap-2 rounded-ctl bg-success/10 px-4 py-3 text-[14px] text-ink"><CheckCircle2 className="h-4 w-4 text-success" />{t('mobile.m8.countMatch')}</p>}
              </div>
            ),
          },
          { key: 'photos', title: t('inv.photos'), valid: photos.length > 0, content: <MField label={t('mobile.m8.countPhotos')} required group><PhotoPicker value={photos} onChange={setPhotos} max={3} big /></MField> },
        ]}
      />
    </div>
  );
}

/** M8 Warehouse expenses: the officer's expenses and a new one. */
export function WarehouseExpensesScreen() {
  const { t } = useT();
  const f = useFormat();
  const lang = useLang();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const settings = useOrgSettings();
  const wh = useMyWarehouse();
  const all = useOrgRows(useWarehouseStore((s) => s.warehouseExpenses));
  const mine = useMemo(() => all.filter((e) => e.warehouseId === wh?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [all, wh?.id]);
  const types = settings.inventoryRules.expenseTypes ?? [];
  const dec = f.org.currency === 'XOF' ? 0 : 2;
  const [creating, setCreating] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState(String((types[0]?.defaultRateMinor ?? 0) / 10 ** dec));
  const [payee, setPayee] = useState('');
  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');
  const name = (id: string) => { const x = types.find((y) => y.id === id); return x ? x.name[lang] ?? x.name.en ?? id : id; };
  if (!wh) return null;
  const save = async () => {
    const payload = { orgId, warehouseId: wh.id, description: description.trim() || undefined, actorId: userId ?? '', lines: [{ typeId, quantity: Number(qty), rateMinor: Math.round(Number(rate) * 10 ** dec), payee: { name: payee.trim().toUpperCase(), number: number.trim(), providerId: settings.paymentProviders.find((p) => p.kind === 'MOBILE_MONEY')?.id ?? '' } }] };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'warehouseExpense', label: t('mobile.m8.expenseLabel', { type: name(typeId) }), payload });
    toast.success(t(savedKey(queued)));
    setCreating(false); setQty(''); setPayee(''); setNumber(''); setDescription('');
  };
  const type = types.find((x) => x.id === typeId);
  if (creating) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileHeader title={t('inv.newExpense')} back />
        <MobileWizard finishLabel={online ? t('buy.submit') : t('mobile.surveys.saveForSync')} onFinish={() => void save()}
          steps={[
            {
              key: 'line', title: t('inv.lines'), valid: !!typeId && Number(qty) > 0 && Number(rate) > 0, content: (
                <div className="space-y-4">
                  <MField label={t('inv.expenseType')}><MSelect value={typeId} onChange={(v) => { setTypeId(v); setRate(String((types.find((x) => x.id === v)?.defaultRateMinor ?? 0) / 10 ** dec)); }} label={t('inv.expenseType')} options={types.map((x) => ({ value: x.id, label: name(x.id) }))} /></MField>
                  <MField label={`${t('col.quantity')} (${t(`inv.basis.${type?.basis ?? 'FLAT'}`)})`} required><input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={mInput} aria-label={t('col.quantity')} /></MField>
                  <MField label={t('inv.rateIn', { currency: f.org.currency })} required><input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={mInput} aria-label={t('inv.rate')} /></MField>
                  <MField label={t('inv.description')}><input value={description} onChange={(e) => setDescription(e.target.value)} className={mInput} aria-label={t('inv.description')} /></MField>
                </div>
              ),
            },
            {
              key: 'payee', title: t('inv.payee'), valid: !!payee.trim() && !!number.trim(), content: (
                <div className="space-y-4">
                  <MField label={t('inv.payeeName')} required><input value={payee} onChange={(e) => setPayee(e.target.value)} className={mInput} aria-label={t('inv.payeeName')} /></MField>
                  <MField label={t('inv.payeeWallet')} required><input value={number} inputMode="tel" onChange={(e) => setNumber(e.target.value)} className={mInput} aria-label={t('inv.payeeWallet')} /></MField>
                  <div className="flex items-baseline justify-between rounded-ctl bg-brand-soft px-4 py-3"><span className="text-[14px] text-body">{t('col.total')}</span><span className="tnum text-[22px] font-semibold text-ink">{f.money({ amountMinor: Math.round(Number(rate || 0) * 10 ** dec) * Number(qty || 0), currency: f.org.currency })}</span></div>
                </div>
              ),
            },
          ]} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m8.expenses')} back right={<Button size="sm" onClick={() => setCreating(true)}><Plus /> {t('mobile.new')}</Button>} />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-1">
        {mine.length ? <MList>{mine.map((e) => <li key={e.id}><ListRow title={e.description || e.lines.map((l) => name(l.typeId)).join(', ')} subtitle={`${e.number} · ${f.money(e.total)}`} right={<span className="flex flex-col items-end gap-1"><StatusBadge status={e.status} />{e.status !== 'REJECTED' && <StatusBadge status={`WP_${e.paymentStatus}`} />}</span>} /></li>)}</MList> : <p className="py-8 text-center text-[14px] text-muted">{t('inv.noExpenses')}</p>}
        <Button size="lg" variant="secondary" className="w-full" onClick={() => navigate('/m/warehouse')}>{t('mobile.back')}</Button>
      </div>
    </div>
  );
}

/** M8 Resolve a discrepancy: the bag came back, its tag was replaced, or a top-up bag covers the weight. */
export function ResolveScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const lk = useLookups();
  const d = useWarehouseStore((s) => s.discrepancies.find((x) => x.id === id));
  const [mode, setMode] = useState<'BAG_RETURNED' | 'TAG_REPLACED' | 'TOP_UP'>(d?.type === 'MISSING' ? 'BAG_RETURNED' : 'TOP_UP');
  const [code, setCode] = useState<string | undefined>();
  const [kg, setKg] = useState(d ? String(d.type === 'MISSING' ? d.expectedKg : d.openKg) : '');
  if (!d) return null;
  const save = async () => {
    const queued = mode === 'TOP_UP'
      ? (await saveOrQueue({ orgId, userId: userId ?? '', type: 'topUp', label: t('mobile.m8.topUpLabel', { code: code ?? '' }), payload: { inboundId: d.inboundId, code, kg: Number(kg) } })).queued
      : (await saveOrQueue({ orgId, userId: userId ?? '', type: 'discrepancyResolve', label: t('mobile.m8.resolveLabel', { code: d.bagCode }), payload: { id: d.id, type: mode, newCode: mode === 'TAG_REPLACED' ? code : undefined, kg: Number(kg) } })).queued;
    toast.success(t(savedKey(queued)), { description: t('inv.toast.resolved', { code: d.bagCode }) });
    navigate('/m/warehouse');
  };
  const options = d.type === 'MISSING' ? (['BAG_RETURNED', 'TAG_REPLACED'] as const) : (['TOP_UP'] as const);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m8.resolve')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-brand-soft p-4">
          <div className="flex items-center justify-between"><span className="font-mono text-[15px] font-semibold text-ink">{d.bagCode}</span><Badge tone={d.type === 'MISSING' ? 'danger' : 'warning'}>{t(`inv.dType.${d.type}`)}</Badge></div>
          <div className="mt-1 text-[13px] text-body">{lk.agent(d.agentId)} · {t('inv.stillOpen', { kg: f.kg(d.openKg) })}</div>
        </div>
        {options.length > 1 && <MField label={t('inv.resolution.label')} group><Segmented value={mode} onChange={setMode} label={t('inv.resolution.label')} options={options.map((o) => ({ value: o, label: t(`inv.resolution.${o}`) }))} /></MField>}
        {mode !== 'BAG_RETURNED' && <MField label={mode === 'TOP_UP' ? t('mobile.m8.topUpBag') : t('inv.newTag')} required group>{code ? <div className="flex items-center justify-between rounded-ctl border border-line px-4 py-3"><span className="font-mono text-[15px]">{code}</span><Button variant="link" size="sm" onClick={() => setCode(undefined)}>{t('mobile.m5.rescan')}</Button></div> : <SimCapture kind="scanCode" value={undefined} onChange={setCode} make={() => nextBagCode(orgId)} label={t('mobile.m5.scanBag')} big />}</MField>}
        {mode === 'BAG_RETURNED' && <MField label={t('mobile.m8.scanReturned')} group>{code ? <div className="rounded-ctl border border-line px-4 py-3 font-mono text-[15px]">{code}</div> : <SimCapture kind="scanCode" value={undefined} onChange={setCode} make={() => d.bagCode} label={t('mobile.m5.scanBag')} big />}</MField>}
        <MField label={t('inv.weightKg')} required><input type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} className={mInput} aria-label={t('inv.weightKg')} /></MField>
        {mode === 'TOP_UP' && <p className="text-[13px] text-muted">{t('inv.topUpHint')}</p>}
      </div>
      <div className="shrink-0 border-t border-line p-4"><Button size="lg" className="w-full" disabled={!code || !(Number(kg) > 0)} onClick={() => void save()}><Undo2 /> {online ? t('inv.resolve') : t('mobile.surveys.saveForSync')}</Button></div>
    </div>
  );
}

/** The agent's side (PRD H2 agent repayment): what is owed for lost produce, then pay with proof. */
export function AgentRepayScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const online = useMobileSessionStore((s) => s.online);
  const inv = useInventory();
  const x = useWarehouseStore((s) => s.inbounds.find((y) => y.id === id)) as Inbound | undefined;
  const repayments = useWarehouseStore((s) => s.agentRepayments).filter((r) => r.inboundId === id);
  useWarehouseStore((s) => s.discrepancies);
  useBuyingStore((s) => s.bags);
  const [method, setMethod] = useState<'MOMO' | 'CASH'>('MOMO');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string[]>([]);
  const [amount, setAmount] = useState<string | null>(null);
  if (!x) return null;
  const exp = repaymentExpected(x.id);
  const dec = exp.total.currency === 'XOF' ? 0 : 2;
  const amountStr = amount ?? String(exp.total.amountMinor / 10 ** dec);
  const last = repayments[0];
  const save = async () => {
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'agentRepayment', label: t('mobile.m8.repayLabel', { number: x.number }), payload: { inboundId: x.id, amountMinor: Math.round(Number(amountStr) * 10 ** dec), method, reference: reference.trim() || undefined, proof: proof[0] } });
    toast.success(t(savedKey(queued)), { description: t('mobile.m8.repaySent') });
    navigate('/m');
  };
  const canPay = exp.total.amountMinor > 0 && !repayments.some((r) => r.status === 'SUBMITTED');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m8.repayTitle')} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-brand-soft p-4">
          <div className="flex items-center justify-between gap-2"><StatusBadge status={`IN_${x.status}`} /><span className="text-[13px] text-muted">{x.number}</span></div>
          <div className="mt-2 text-[15px] text-ink">{inv.warehouseName(x.warehouseId)} · {f.date(x.received?.at ?? x.createdAt)}</div>
          <div className="tnum text-[26px] font-semibold text-ink">{f.money(exp.total)}</div>
        </div>
        <dl className="divide-y divide-line rounded-card border border-line text-[14px]">
          <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-body">{t('inv.lostKg', { kg: f.kg(exp.lostKg), price: f.money(exp.pricePerKg) })}</dt><dd className="tnum text-ink">{f.money(exp.produce)}</dd></div>
          <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-body">{t('inv.logisticsShare')}</dt><dd className="tnum text-ink">{f.money(exp.logistics)}</dd></div>
        </dl>
        {last && <div className="rounded-ctl border border-line px-4 py-3 text-[14px]"><div className="flex items-center justify-between"><span className="text-ink">{f.money(last.submitted.amount)}</span><StatusBadge status={`RP_${last.status}`} /></div>{last.review?.reason && <p className="mt-1 text-[13px] text-muted">{last.review.reason}</p>}{last.review && last.review.balance.amountMinor > 0 && <p className="mt-1 text-[13px] text-warning">{t('mobile.m8.balanceLeft', { amount: f.money(last.review.balance) })}</p>}</div>}
        {canPay ? (
          <section className="space-y-4">
            <MField label={t('sup.method')} group><Segmented value={method} onChange={setMethod} label={t('sup.method')} options={(['MOMO', 'CASH'] as const).map((m) => ({ value: m, label: t(`sup.refundMethod.${m}`) }))} /></MField>
            <MField label={t('mobile.m8.amountIn', { currency: exp.total.currency })} required><input type="number" inputMode="decimal" value={amountStr} onChange={(e) => setAmount(e.target.value)} className={mInput} aria-label={t('col.amount')} /></MField>
            {method === 'MOMO' && <MField label={t('sup.reference')}><input value={reference} onChange={(e) => setReference(e.target.value)} className={mInput} aria-label={t('sup.reference')} placeholder="MP…" /></MField>}
            <MField label={t('mobile.m8.proof')} required group><PhotoPicker value={proof} onChange={setProof} max={1} big /></MField>
            <Button size="lg" className="w-full" disabled={!(Number(amountStr) > 0) || !proof.length} onClick={() => void save()}>{online ? t('inv.submitRepayment') : t('mobile.surveys.saveForSync')}</Button>
          </section>
        ) : <p className="rounded-ctl bg-canvas px-4 py-3 text-[14px] text-body">{exp.total.amountMinor > 0 ? t('mobile.m8.waitingFinance') : t('mobile.m8.nothingOwed')}</p>}
      </div>
    </div>
  );
}
