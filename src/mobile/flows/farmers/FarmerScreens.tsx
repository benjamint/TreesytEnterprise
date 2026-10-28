import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Pencil, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { Farmer } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { buildLedger } from '@/engines/loans';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useMobileAgent } from '@/mobile/layout/useMobileContext';
import { ListRow, MField, MList, MSearch, Segmented, mInput, savedKey } from '@/mobile/components/kit';
import { debtCheck } from '@/services/buyingService';
import { saveOrQueue } from '@/services/mobileSync';
import type { FarmerEditPayload } from '@/services/profileService';
import { formatPhone } from '@/lib/format';
import { useBuyingStore } from '@/stores/buyingStore';
import { useCommunityStore } from '@/stores/communityStore';
import { useFarmerStore } from '@/stores/farmerStore';
import { useLoanStore } from '@/stores/loanStore';
import { useQualityStore } from '@/stores/qualityStore';
import { useActor, useFormat, useOrgRows, useOrgSettings, useT } from '@/stores/hooks';

/** The farmers this agent can see: those in the agent's communities. */
export function useMyFarmers() {
  const { agent, type } = useMobileAgent();
  const farmers = useOrgRows(useFarmerStore((s) => s.farmers));
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  return useMemo(() => {
    // Visibility per agent type (Settings → Field team): OWN = farmers they registered, AREAS = their communities, ALL = everyone.
    const visibility = type?.visibility ?? 'AREAS';
    const mine = new Set(communities.filter((c) => agent && c.agentIds.includes(agent.id)).map((c) => c.id));
    return farmers.filter((f) => visibility === 'ALL' || f.agentId === agent?.id || (visibility === 'AREAS' && mine.has(f.communityId))).sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [farmers, communities, agent, type]);
}

/** M4 Farmer list (visibility rules) with search. */
export function FarmersScreen() {
  const { t, terms } = useT();
  const navigate = useNavigate();
  const mine = useMyFarmers();
  const communities = useOrgRows(useCommunityStore((s) => s.communities));
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = mine.filter((f) => !query || `${f.firstName} ${f.lastName}`.toLowerCase().includes(query) || f.farmerCode.toLowerCase().includes(query) || f.phone.includes(query)).slice(0, 60);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={terms.farmers} back right={<Button size="sm" onClick={() => navigate('/m/farmers/new')}><UserPlus /> {t('mobile.new')}</Button>} />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 pt-1">
        <MSearch value={q} onChange={setQ} placeholder={t('mobile.m4.search')} />
        <p className="text-[13px] text-muted">{t('mobile.m4.count', { count: mine.length })}</p>
        <MList>
          {shown.map((f) => <li key={f.id}><ListRow title={`${f.firstName} ${f.lastName}`} subtitle={`${f.farmerCode} · ${communities.find((c) => c.id === f.communityId)?.name ?? ''}`} badge={f.qualityStatus === 'FLAGGED' ? <Badge tone="warning">{t('mobile.m3.flagged')}</Badge> : undefined} onClick={() => navigate(`/m/farmers/${f.id}`)} /></li>)}
        </MList>
      </div>
    </div>
  );
}

/** M4 Farmer detail: profile, purchases, loans (balance and quote), trees and plots, edit, fix task. */
export function FarmerDetailScreen() {
  const { id } = useParams();
  const { t } = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const settings = useOrgSettings();
  const farmer = useFarmerStore((s) => s.farmers.find((x) => x.id === id));
  const allPurchases = useBuyingStore((s) => s.purchases);
  const allLoans = useLoanStore((s) => s.loans);
  const tasks = useQualityStore((s) => s.tasks);
  const community = useCommunityStore((s) => s.communities.find((c) => c.id === farmer?.communityId));
  const purchases = useMemo(() => allPurchases.filter((p) => p.farmerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [allPurchases, id]);
  const loans = useMemo(() => allLoans.filter((l) => l.farmerId === id), [allLoans, id]);
  const task = tasks.find((x) => x.recordId === id && x.status === 'OPEN');
  if (!farmer) return null;
  const debt = debtCheck(farmer.orgId, farmer.id);
  const today = new Date();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={`${farmer.firstName} ${farmer.lastName}`} back right={<Button size="sm" variant="secondary" onClick={() => navigate(`/m/farmers/${farmer.id}/edit`)}><Pencil /> {t('people.edit')}</Button>} />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <div className="rounded-card bg-brand-soft p-4">
          <div className="font-mono text-[13px] text-brand">{farmer.farmerCode}</div>
          <div className="text-[15px] text-ink">{t(`gender.${farmer.gender}`)} · {farmer.dateOfBirth} · {community?.name}</div>
          <div className="text-[14px] text-body">{formatPhone(farmer.phone) || '—'}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {farmer.identity.consent && <Badge tone="success">{t('mobile.m4.consent')}</Badge>}
            {farmer.identity.nfcCard && <Badge tone="info">{t('mobile.m4.card', { number: farmer.identity.nfcCard.number })}</Badge>}
            {farmer.qualityStatus === 'FLAGGED' && <Badge tone="warning">{t('mobile.m3.flagged')}</Badge>}
          </div>
        </div>
        {task && <Button variant="secondary" size="lg" className="w-full" onClick={() => navigate(`/m/tasks/${task.id}`)}><AlertTriangle /> {t('mobile.m4.fixTask')}</Button>}
        {debt.balance > 0 && <p className="rounded-ctl bg-warning/10 px-4 py-3 text-[14px] text-ink">{t(`buy.debt.${debt.policy}`, { amount: f.money({ amountMinor: debt.balance, currency: f.org.currency }), deduct: '' })}</p>}
        <section>
          <h2 className="eyebrow mb-2">{t('mobile.m4.loans')}</h2>
          {loans.length ? (
            <MList>
              {loans.map((l) => {
                const ledger = buildLedger(l.principal, settings.loanTerms, l.window, l.repayments.map((r) => ({ date: r.date, amountMinor: r.amount.amountMinor, mode: r.mode })), today, { disbursedAt: l.disbursedAt });
                return <li key={l.id}><ListRow title={t('mobile.m4.balance', { amount: f.money({ amountMinor: ledger.balance, currency: l.principal.currency }) })} subtitle={t('mobile.m4.loanLine', { principal: f.money(l.principal), end: f.date(l.window.end) })} badge={<StatusBadge status={l.status} />} /></li>;
              })}
            </MList>
          ) : <p className="text-[14px] text-muted">{t('mobile.m4.noLoans')}</p>}
        </section>
        <section>
          <h2 className="eyebrow mb-2">{t('mobile.m4.purchases', { count: purchases.length })}</h2>
          {purchases.length ? (
            <MList>
              {purchases.slice(0, 8).map((p) => <li key={p.id}><ListRow title={`${f.kg(p.quantity)} · ${f.money(p.amount)}`} subtitle={`${p.number} · ${f.date(p.createdAt)}`} right={<StatusBadge status={p.paymentStatus} />} /></li>)}
            </MList>
          ) : <p className="text-[14px] text-muted">{t('buy.noPurchases')}</p>}
        </section>
        <section>
          <h2 className="eyebrow mb-2">{t('mobile.m4.treesPlots')}</h2>
          <p className="text-[14px] text-muted">{t('mobile.m4.treesLater')}</p>
        </section>
      </div>
    </div>
  );
}

/** M4 Edit farmer: core fields → a new profile version on sync (conflicts if the office changed it). */
export function FarmerEditScreen() {
  const { id } = useParams();
  const { t, terms } = useT();
  const navigate = useNavigate();
  const { orgId, userId } = useActor();
  const farmer = useFarmerStore((s) => s.farmers.find((x) => x.id === id));
  const [v, setV] = useState<Pick<Farmer, 'firstName' | 'lastName' | 'phone' | 'gender' | 'dateOfBirth'> | null>(farmer ? { firstName: farmer.firstName, lastName: farmer.lastName, phone: farmer.phone, gender: farmer.gender, dateOfBirth: farmer.dateOfBirth } : null);
  if (!farmer || !v) return null;
  const save = async () => {
    const payload: FarmerEditPayload = { id: farmer.id, patch: v };
    const { queued } = await saveOrQueue({ orgId, userId: userId ?? '', type: 'farmerEdit', label: t('mobile.m4.editLabel', { name: `${v.firstName} ${v.lastName}` }), payload, base: { entity: 'farmer', id: farmer.id, updatedAt: farmer.updatedAt } });
    toast.success(t(savedKey(queued)));
    navigate(`/m/farmers/${farmer.id}`);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.m4.edit', { farmer: terms.farmer.toLocaleLowerCase() })} back />
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6 pt-1">
        <MField label={t('people.farmer.firstName')} required><input value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} className={mInput} aria-label={t('people.farmer.firstName')} /></MField>
        <MField label={t('people.farmer.lastName')} required><input value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} className={mInput} aria-label={t('people.farmer.lastName')} /></MField>
        <MField label={t('col.gender')} group><Segmented value={v.gender} onChange={(gender) => setV({ ...v, gender })} label={t('col.gender')} options={(['F', 'M'] as const).map((g) => ({ value: g, label: t(`gender.${g}`) }))} /></MField>
        <MField label={t('people.farmer.dob')}><input type="date" value={v.dateOfBirth} onChange={(e) => setV({ ...v, dateOfBirth: e.target.value })} className={mInput} aria-label={t('people.farmer.dob')} /></MField>
        <MField label={t('people.phone')}><input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className={mInput} aria-label={t('people.phone')} /></MField>
      </div>
      <div className="shrink-0 border-t border-line p-4"><Button size="lg" className="w-full" disabled={!v.firstName.trim() || !v.lastName.trim()} onClick={() => void save()}>{t('mobile.save')}</Button></div>
    </div>
  );
}
