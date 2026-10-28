import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { useCurrentOrg, useOrgSettings, useT } from '@/stores/hooks';
import { cn } from '@/lib/utils';
import { JsonBlock } from './shared';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
interface Endpoint { id: string; group: string; method: Method; path: string; scope: string; params?: [string, string, string][]; body?: unknown; response: unknown; since?: 'v2' }

/** The read-only public API reference (PRD K8, Scope 1.5). Endpoints are illustrative; nothing is called. */
const ENDPOINTS: Endpoint[] = [
  { id: 'farmers.list', group: 'farmers', method: 'GET', path: '/farmers', scope: 'farmers:read', params: [['community_id', 'string', 'filter'], ['updated_since', 'date-time', 'filter'], ['page', 'integer', 'paging'], ['per_page', 'integer (≤ 200)', 'paging']],
    response: { data: [{ id: 'frm_8KQ2', farmer_code: 'VIT-UW-0023', first_name: 'Abena', last_name: 'Issah', gender: 'F', community: { id: 'com_daff', name: 'Daffiama' }, registered_at: '2025-03-14', score: 72 }], page: 1, per_page: 50, total: 1240 } },
  { id: 'farmers.get', group: 'farmers', method: 'GET', path: '/farmers/{id}', scope: 'farmers:read', response: { id: 'frm_8KQ2', farmer_code: 'VIT-UW-0023', first_name: 'Abena', last_name: 'Issah', phone: '+233•••••234', custom_fields: { household_size: 6, main_crop: 'shea' } } },
  { id: 'purchases.list', group: 'purchases', method: 'GET', path: '/purchases', scope: 'purchases:read', params: [['from', 'date', 'filter'], ['to', 'date', 'filter'], ['commodity', 'string', 'filter'], ['agent_id', 'string', 'filter']],
    response: { data: [{ id: 'pur_31Z', number: 'PU-26-04512', farmer_id: 'frm_8KQ2', commodity: 'com_shea', quantity_kg: 120.5, unit_price: { amount_minor: 580, currency: 'GHS' }, amount: { amount_minor: 69890, currency: 'GHS' }, payment_status: 'PAID', created_at: '2026-10-16T09:12:00Z' }], page: 1, total: 8412 } },
  { id: 'purchases.create', group: 'purchases', method: 'POST', path: '/purchases', scope: 'purchases:write', body: { request_id: 'pr_77A', farmer_id: 'frm_8KQ2', quantity_kg: 120.5, bag_codes: ['VB-00881'], gps: { lat: 10.06, lng: -2.51 } }, response: { id: 'pur_31Z', number: 'PU-26-04512', status: 'RECORDED' } },
  { id: 'requests.list', group: 'purchases', method: 'GET', path: '/purchase-requests', scope: 'purchases:read', params: [['status', 'PENDING | APPROVED | REJECTED', 'filter']], response: { data: [{ id: 'pr_77A', number: 'PR-26-01022', status: 'APPROVED', volume_kg: 2000, total: { amount_minor: 1160000, currency: 'GHS' } }] } },
  { id: 'payments.list', group: 'payments', method: 'GET', path: '/payments', scope: 'payments:read', params: [['status', 'SUCCESSFUL | FAILED | UNKNOWN', 'filter'], ['batch_id', 'string', 'filter']], response: { data: [{ id: 'pay_9F1', reference: 'PAY-2610-00271', payee: { name: 'YAW DARKO', number: '+233•••••234' }, provider: 'mtn_gh', amount: { amount_minor: 17872, currency: 'GHS' }, status: 'SUCCESSFUL' }] } },
  { id: 'payments.status', group: 'payments', method: 'GET', path: '/payments/{id}/status', scope: 'payments:read', response: { id: 'pay_9F1', status: 'SUCCESSFUL', provider_ref: 'MTN-88213', checked_at: '2026-10-18T10:05:00Z' } },
  { id: 'stock.list', group: 'inventory', method: 'GET', path: '/warehouses/{id}/stock', scope: 'inventory:read', response: { warehouse_id: 'wh_tm', commodities: [{ commodity: 'com_shea', bags: 412, kg: 34120 }] } },
  { id: 'plots.list', group: 'traceability', method: 'GET', path: '/plots', scope: 'plots:read', params: [['eudr_status', 'COMPLIANT | AT_RISK | PENDING', 'filter']], response: { data: [{ id: 'plt_12', farmer_id: 'frm_8KQ2', area_ha: 1.42, eudr_status: 'COMPLIANT', geometry: { type: 'Polygon', coordinates: [[[-2.51, 10.06], [-2.5, 10.06], [-2.5, 10.07], [-2.51, 10.06]]] } }] } },
  { id: 'lots.trace', group: 'traceability', method: 'GET', path: '/lots/{id}/trace', scope: 'plots:read', since: 'v2', response: { lot: 'LOT-26-0031', bags: 120, farmers: 64, plots: 71, deforestation_free: true, statement: 'DDS-26-0004' } },
  { id: 'webhooks.create', group: 'webhooks', method: 'POST', path: '/webhooks', scope: 'webhooks:write', body: { url: 'https://erp.example.com/hooks/treesyt', events: ['payment.completed', 'purchase.created'] }, response: { id: 'wh_1', secret: 'whsec_••••••••', enabled: true } },
  { id: 'webhooks.delete', group: 'webhooks', method: 'DELETE', path: '/webhooks/{id}', scope: 'webhooks:write', response: { deleted: true } },
];

const EVENTS: [string, unknown][] = [
  ['payment.completed', { event: 'payment.completed', id: 'evt_01', created_at: '2026-10-18T10:05:00Z', data: { payment_id: 'pay_9F1', reference: 'PAY-2610-00271', status: 'SUCCESSFUL' } }],
  ['purchase.created', { event: 'purchase.created', id: 'evt_02', data: { purchase_id: 'pur_31Z', number: 'PU-26-04512', quantity_kg: 120.5 } }],
  ['dispatch.delivered', { event: 'dispatch.delivered', id: 'evt_03', data: { dispatch_id: 'dsp_4', delivered_kg: 18040 } }],
];

const METHOD_TONE: Record<Method, string> = { GET: 'bg-info/10 text-info', POST: 'bg-success/10 text-success', PATCH: 'bg-warning/10 text-warning', DELETE: 'bg-danger/10 text-danger' };

export function ApiDocsPage() {
  const { t } = useT();
  const org = useCurrentOrg();
  const key = useOrgSettings().integrations.apiKeys.find((k) => !k.revokedAt);
  const [version, setVersion] = useState<'v1' | 'v2'>('v1');
  const [q, setQ] = useState('');
  const base = `https://api.treesyt.example/${version}`;
  const shown = useMemo(() => ENDPOINTS.filter((e) => (version === 'v2' || !e.since) && (!q || `${e.method} ${e.path} ${e.group} ${t(`api.ep.${e.id}`)}`.toLowerCase().includes(q.toLowerCase()))), [version, q, t]);
  const groups = [...new Set(shown.map((e) => e.group))];
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); toast.success(t('api.copied')); };
  return (
    <>
      <Link to="/app/settings/integrations" className="mb-3 inline-flex items-center gap-1 text-[14px] font-medium text-brand hover:underline"><ArrowLeft className="h-4 w-4" /> {t('api.backToIntegrations')}</Link>
      <PageHeader eyebrow={t('api.eyebrow')} title={t('api.title')} description={t('api.description', { company: org.name })} />
      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">{t('api.version')}</h2>
          <div className="flex gap-1.5" role="radiogroup" aria-label={t('api.version')}>
            {(['v1', 'v2'] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={version === v} onClick={() => setVersion(v)} className={cn('rounded-full border px-3 py-1 text-[13px] font-medium', version === v ? 'border-brand bg-brand-soft text-brand' : 'border-line text-body')}>{v}{v === 'v2' && <span className="ml-1 text-[11px] text-muted">{t('api.beta')}</span>}</button>)}
          </div>
          <p className="mt-2 text-[12px] text-muted">{version === 'v1' ? t('api.v1Hint') : t('api.v2Hint')}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">{t('api.auth')}</h2>
          <p className="text-[13px] text-body">{t('api.authHint')}</p>
          <p className="mt-2 flex items-center gap-2 font-mono text-[12px] text-ink"><KeyRound className="h-4 w-4 text-muted" aria-hidden="true" />{key ? `${key.prefix}••••${key.last4}` : t('api.noKey')}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
          <h2 className="mb-2 text-[14px] font-semibold text-ink">{t('api.limits')}</h2>
          <ul className="space-y-1 text-[13px] text-body"><li>{t('api.limitRate')}</li><li>{t('api.limitPage')}</li><li>{t('api.limitMoney')}</li></ul>
        </div>
      </div>
      <div className="mb-4 max-w-sm"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('api.search')} aria-label={t('api.search')} /></div>
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g} aria-labelledby={`api-${g}`}>
            <h2 id={`api-${g}`} className="mb-3 text-[18px] font-semibold text-ink">{t(`api.group.${g}`)}</h2>
            <div className="space-y-3">
              {shown.filter((e) => e.group === g).map((e) => {
                const curl = `curl -X ${e.method} "${base}${e.path.replace('{id}', 'ID')}" \\\n  -H "Authorization: Bearer ${key ? `${key.prefix}…` : 'YOUR_KEY'}"${e.body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(e.body)}'` : ''}`;
                return (
                  <details key={e.id} className="group rounded-card border border-line bg-surface shadow-soft open:shadow-md">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                      <span className={cn('w-16 rounded-full px-2 py-0.5 text-center font-mono text-[12px] font-semibold', METHOD_TONE[e.method])}>{e.method}</span>
                      <code className="font-mono text-[13px] text-ink">{e.path}</code>
                      <span className="text-[13px] text-muted">{t(`api.ep.${e.id}`)}</span>
                      {e.since && <Badge tone="info">{t('api.newIn', { v: e.since })}</Badge>}
                      <Badge tone="neutral" className="ml-auto font-mono">{e.scope}</Badge>
                    </summary>
                    <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        {e.params && (
                          <table className="w-full text-[13px]">
                            <thead><tr className="border-b border-line text-left text-[12px] text-label"><th className="py-1.5 font-semibold">{t('api.param')}</th><th className="py-1.5 font-semibold">{t('api.type')}</th><th className="py-1.5 font-semibold">{t('api.use')}</th></tr></thead>
                            <tbody className="divide-y divide-line">{e.params.map(([n, ty, u]) => <tr key={n}><td className="py-1.5 font-mono text-[12px] text-ink">{n}</td><td className="py-1.5 text-body">{ty}</td><td className="py-1.5 text-muted">{t(`api.paramUse.${u}`)}</td></tr>)}</tbody>
                          </table>
                        )}
                        {e.body !== undefined && <><h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t('api.requestBody')}</h4><JsonBlock value={e.body} label={t('api.requestBody')} /></>}
                        <div className="flex items-center justify-between"><h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{t('api.example')}</h4><Button size="xs" variant="ghost" onClick={() => copy(curl)}><Copy /> {t('api.copy')}</Button></div>
                        <pre className="overflow-x-auto rounded-ctl bg-[#0f2a20] p-3 font-mono text-[12px] leading-relaxed text-[#d7efe4]">{curl}</pre>
                      </div>
                      <div><h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">{t('api.response', { code: e.method === 'POST' ? '201' : '200' })}</h4><JsonBlock value={e.response} label={t('api.response', { code: '200' })} /></div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        ))}
        <section aria-labelledby="api-events">
          <h2 id="api-events" className="mb-1 text-[18px] font-semibold text-ink">{t('api.events')}</h2>
          <p className="mb-3 text-[13px] text-muted">{t('api.eventsHint')}</p>
          <div className="grid gap-3 lg:grid-cols-3">
            {EVENTS.map(([name, sample]) => <div key={name} className="rounded-card border border-line bg-surface p-4 shadow-soft"><code className="mb-2 block font-mono text-[13px] font-semibold text-ink">{name}</code><JsonBlock value={sample} label={name} /></div>)}
          </div>
        </section>
      </div>
    </>
  );
}
