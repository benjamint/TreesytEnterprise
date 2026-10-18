import { ListTodo } from 'lucide-react';
import { MobileHeader } from '@/mobile/layout/MobileHeader';
import { useT } from '@/stores/hooks';

export function TasksScreen() {
  const { t } = useT();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MobileHeader title={t('mobile.tasksTitle')} />
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
          <ListTodo className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-[15px] text-muted">{t('mobile.tasksEmpty')}</p>
      </div>
    </div>
  );
}
