import { useMemo } from 'react';
import { Landscape } from '@/components/shared/Landscape';
import { LogoBadge, Wordmark } from '@/components/shared/Logo';
import { Avatar } from '@/components/shared/Avatar';
import { useAccessStore } from '@/stores/accessStore';
import { useMobileSessionStore } from '@/stores/mobileSessionStore';
import { useT } from '@/stores/hooks';

/**
 * Phase 1 mobile sign-in: an illustrated splash with the field personas. The real phone + code
 * sign-in (M1) arrives in phase 9.
 */
export function MobileSignIn() {
  const users = useAccessStore((s) => s.users);
  const memberships = useAccessStore((s) => s.memberships);
  const roles = useAccessStore((s) => s.roles);
  const signIn = useMobileSessionStore((s) => s.signIn);
  const { t } = useT();
  const field = useMemo(
    () =>
      users
        .filter((u) => u.persona)
        .map((u) => ({ u, m: memberships.find((m) => m.userId === u.id)! }))
        .filter(({ m }) => m && m.roleIds.some((r) => roles.find((x) => x.id === r)?.mobile)),
    [users, memberships, roles],
  );
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[300px] shrink-0 overflow-hidden">
        <Landscape />
        <div className="absolute left-5 top-6 flex items-center gap-2 rounded-full bg-white/80 py-1.5 pl-1.5 pr-3 backdrop-blur">
          <LogoBadge size={30} />
          <Wordmark className="text-[17px]" />
        </div>
      </div>
      <div className="-mt-6 flex-1 overflow-y-auto rounded-t-panel bg-surface px-6 pb-8 pt-7">
        <h1 className="text-[26px]">{t('mobile.signInTitle')}</h1>
        <p className="mt-2 text-[15px] text-muted">{t('mobile.signInBody')}</p>
        <div className="eyebrow mb-3 mt-7">{t('mobile.chooseUser')}</div>
        <ul className="space-y-2.5">
          {field.map(({ u, m }) => (
            <li key={u.id}>
              <button type="button" onClick={() => signIn(u.id, m.orgId, u.language)} className="flex min-h-[56px] w-full items-center gap-3 rounded-ctl border border-line px-4 py-2.5 text-left transition-colors hover:border-brand/40 active:bg-brand-soft">
                <Avatar name={u.name} color={u.avatarColor} size={36} />
                <span>
                  <span className="block font-semibold text-ink">{u.name}</span>
                  <span className="block text-[13px] text-muted">{m.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
