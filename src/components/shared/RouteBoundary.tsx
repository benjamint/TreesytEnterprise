import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import i18n from '@/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Shaped like a list page (header, filters, table) while a page's code loads. */
export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label={i18n.t('table.loading')} className="space-y-6">
      <div className="space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-9 w-72" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="flex gap-2"><Skeleton className="h-11 flex-1" /><Skeleton className="h-11 w-40" /></div>
      <div className="space-y-3 rounded-card border border-line bg-surface p-4">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex gap-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-24" /></div>)}
      </div>
    </div>
  );
}

export function PhoneSkeleton() {
  return (
    <div role="status" aria-label={i18n.t('table.loading')} className="space-y-4 p-5">
      <Skeleton className="h-7 w-40" /><Skeleton className="h-24 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" />
    </div>
  );
}

interface State { error?: Error }

/** Something on this page failed: say so calmly and offer a retry, instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode; compact?: boolean }, State> {
  state: State = {};
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn('Page error', error.message, info.componentStack?.split('\n')[1] ?? ''); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(error.message);
    return (
      <div role="alert" className={`mx-auto flex max-w-md flex-col items-center gap-4 text-center ${this.props.compact ? 'p-6' : 'py-20'}`}>
        <span className="rounded-full bg-danger/10 p-4 text-danger"><AlertTriangle className="h-6 w-6" aria-hidden="true" /></span>
        <div>
          <h1 className="font-display text-[24px] text-ink">{i18n.t(chunk ? 'errors.offlineTitle' : 'errors.pageTitle')}</h1>
          <p className="mt-1 text-[14px] text-muted">{i18n.t(chunk ? 'errors.offlineHint' : 'errors.pageHint')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => this.setState({ error: undefined })}><RotateCw /> {i18n.t('table.retry')}</Button>
          <Button onClick={() => window.location.reload()}>{i18n.t('errors.reload')}</Button>
        </div>
      </div>
    );
  }
}

export function RouteBoundary({ children, phone }: { children: ReactNode; phone?: boolean }) {
  return <ErrorBoundary compact={phone}><Suspense fallback={phone ? <PhoneSkeleton /> : <PageSkeleton />}>{children}</Suspense></ErrorBoundary>;
}
