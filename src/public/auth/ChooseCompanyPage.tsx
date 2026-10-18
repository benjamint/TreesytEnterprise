import { Navigate, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { CompanyLogo } from '@/components/shared/Logo';
import { Flag } from '@/components/shared/Flag';
import { companiesFor, completeSignIn } from '@/services/authService';
import { useAccessStore } from '@/stores/accessStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { useRoleName, useT } from '@/stores/hooks';
import { AuthHeading, AuthLayout } from './AuthLayout';

/** Company picker when the user belongs to several companies (PRD A2). */
export function ChooseCompanyPage() {
  const flow = useAuthFlowStore();
  const user = useAccessStore((s) => s.users.find((u) => u.id === flow.pendingUserId));
  const memberships = useAccessStore((s) => s.memberships);
  const roleName = useRoleName();
  const navigate = useNavigate();
  const { t } = useT();
  if (!user) return <Navigate to="/sign-in" replace />;
  const orgs = companiesFor(user).filter((o) => o.status !== 'SUSPENDED' && o.status !== 'DEACTIVATED');
  return (
    <AuthLayout>
      <AuthHeading title={t('auth.chooseTitle', { name: user.name.split(' ')[0] })} subtitle={t('auth.chooseSubtitle')} />
      <ul className="space-y-3">
        {orgs.map((o) => {
          const m = memberships.find((x) => x.userId === user.id && x.orgId === o.id);
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  completeSignIn(user, o.id);
                  navigate(flow.next ?? '/app');
                }}
                className="flex min-h-[72px] w-full items-center gap-4 rounded-card border border-line bg-surface px-5 text-left shadow-soft transition-colors hover:border-brand/50"
              >
                <CompanyLogo text={o.branding.logoText} color={o.branding.primaryColor} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{o.name}</span>
                  <span className="flex items-center gap-1.5 text-[13px] text-muted">
                    <Flag code={o.countries[0]!} className="h-2.5 w-3.5" />
                    {user.isPlatformOwner ? t('shell.platformBadge') : m ? m.title ?? roleName(m.roleIds[0]!) : ''}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </AuthLayout>
  );
}
